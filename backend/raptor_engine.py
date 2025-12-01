
# raptor_engine.py
"""
Minimal RAPTOR-style transit router over GTFS.

What it does:
- Loads stop_times.txt + trips.txt from one or more GTFS zip files.
- Preprocesses into per-stop and per-trip tables.
- For a given origin_stop_id, dest_stop_id, and departure time:
  - Finds earliest-arrival journeys using:
      * 0 transfers (single-trip), and
      * 1 transfer (two trips, one intermediate stop).
- Returns a list of "legs" (TRANSIT) that service_router.py can expose.

This is not a full multi-round RAPTOR, but it follows the same core idea:
scan trips reachable from a stop after a given time and propagate earliest
arrival times along trips.
"""

import os
import zipfile
from datetime import datetime
from typing import List, Dict, Any, Optional

import pandas as pd


def _parse_gtfs_time(t: Any) -> Optional[int]:
    """
    Convert GTFS HH:MM:SS (possibly > 24h like 25:10:00) to seconds since 00:00.
    Returns None if t is NaN or malformed.
    """
    if pd.isna(t):
        return None
    if isinstance(t, (int, float)):
        return int(t)
    s = str(t)
    if not s or s == "nan":
        return None
    try:
        parts = s.split(":")
        if len(parts) != 3:
            return None
        h = int(parts[0])
        m = int(parts[1])
        sec = int(parts[2])
        return h * 3600 + m * 60 + sec
    except Exception:
        return None


def _secs_to_hhmmss(secs: int) -> str:
    """
    Convert seconds since midnight to HH:MM:SS (mod 24h).
    """
    secs = int(secs) % 86400
    h = secs // 3600
    m = (secs % 3600) // 60
    s = secs % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


class RaptorEngine:
    def __init__(
        self,
        gtfs_feeds: List[str],
        stops_geojson_path: str | None = None,
        max_transfers: int = 1,
    ):
        """
        gtfs_feeds: list of GTFS zip paths
        stops_geojson_path: unused here but kept for API compatibility
        max_transfers: 0 => only direct trips, 1 => allow 1 transfer (2 legs)
        """
        self.gtfs_feeds = gtfs_feeds
        self.stops_geojson_path = stops_geojson_path
        self.max_transfers = max_transfers

        print("[RaptorEngine] Loading GTFS feeds...")
        self.stop_times = self._load_all_stop_times()
        self._precompute_indexes()
        print(f"[RaptorEngine] Ready. Loaded {len(self.stop_times)} stop-times rows.")

    # ------------------------------------------------------------------
    # GTFS LOADING
    # ------------------------------------------------------------------
    def _load_all_stop_times(self) -> pd.DataFrame:
        frames = []
        for feed_path in self.gtfs_feeds:
            if not os.path.exists(feed_path):
                print(f"[RaptorEngine] WARNING: GTFS feed not found: {feed_path}")
                continue

            try:
                with zipfile.ZipFile(feed_path, "r") as zf:
                    if "stop_times.txt" not in zf.namelist() or "trips.txt" not in zf.namelist():
                        print(f"[RaptorEngine] WARNING: {feed_path} missing stop_times.txt or trips.txt")
                        continue

                    with zf.open("stop_times.txt") as f_st:
                        st = pd.read_csv(f_st)

                    with zf.open("trips.txt") as f_tr:
                        tr = pd.read_csv(f_tr)

                    # Keep only columns we actually need
                    st_cols = ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"]
                    st = st[[c for c in st_cols if c in st.columns]].copy()

                    if "route_id" in tr.columns:
                        tr = tr[["trip_id", "route_id"]].copy()
                    else:
                        tr["route_id"] = ""

                    # Merge route_id onto stop_times
                    merged = st.merge(tr, on="trip_id", how="left")
                    frames.append(merged)

            except Exception as e:
                print(f"[RaptorEngine] ERROR reading {feed_path}: {e}")

        if not frames:
            raise RuntimeError("[RaptorEngine] No valid GTFS stop_times/trips loaded.")

        df = pd.concat(frames, ignore_index=True)

        # Parse times into seconds since midnight
        df["departure_secs"] = df["departure_time"].apply(_parse_gtfs_time)
        df["arrival_secs"] = df["arrival_time"].apply(_parse_gtfs_time)

        # Use departure_secs if arrival_secs is missing
        df["arrival_secs"] = df["arrival_secs"].fillna(df["departure_secs"])

        # Ensure numeric stop_sequence
        df["stop_sequence"] = pd.to_numeric(df["stop_sequence"], errors="coerce")
        df = df.dropna(subset=["stop_sequence"])
        df["stop_sequence"] = df["stop_sequence"].astype(int)

        # Sort for deterministic scanning
        df = df.sort_values(["trip_id", "stop_sequence"]).reset_index(drop=True)
        return df

    def _precompute_indexes(self):
        """
        Build lookups:
        - by_trip: trip_id -> DataFrame of its stop_times in order
        - by_stop: stop_id -> DataFrame of all events at that stop, sorted by departure time
        """
        print("[RaptorEngine] Building trip and stop indexes...")
        self.by_trip: Dict[str, pd.DataFrame] = {}
        for tid, grp in self.stop_times.groupby("trip_id"):
            self.by_trip[tid] = grp.sort_values("stop_sequence").reset_index(drop=True)

        self.by_stop: Dict[str, pd.DataFrame] = {}
        for sid, grp in self.stop_times.groupby("stop_id"):
            self.by_stop[str(sid)] = grp.sort_values("departure_secs").reset_index(drop=True)

    # ------------------------------------------------------------------
    # PLANNING
    # ------------------------------------------------------------------
    def plan(self, origin_stop_id: str, dest_stop_id: str, departure_time_iso: str | None):
        """
        Compute a transit journey from origin_stop_id to dest_stop_id, departing
        no earlier than departure_time_iso.

        Supports:
        - 0 transfers (single trip)
        - 1 transfer (two trips via intermediate stop) if max_transfers >= 1

        Returns a list of legs (possibly empty if no journey found).
        Each leg dict has:
            mode: "TRANSIT"
            from_stop, to_stop
            departure, arrival (HH:MM:SS strings)
            route_id, trip_id
            intermediate_stops: list of stop_ids along the segment (including endpoints)
        """
        origin_stop_id = str(origin_stop_id)
        dest_stop_id = str(dest_stop_id)

        # ---------- parse departure time ----------
        if departure_time_iso:
            try:
                dt0 = datetime.fromisoformat(departure_time_iso.replace("Z", "+00:00"))
                t0 = dt0.hour * 3600 + dt0.minute * 60 + dt0.second
            except Exception:
                # fallback: ignore date, parse only HH:MM:SS if passed
                try:
                    t0 = _parse_gtfs_time(departure_time_iso)
                    if t0 is None:
                        t0 = 0
                except Exception:
                    t0 = 0
        else:
            t0 = 0  # midnight

        if origin_stop_id not in self.by_stop:
            print(f"[RaptorEngine] No data for origin stop_id={origin_stop_id}")
            return []

        events_at_origin = self.by_stop[origin_stop_id]
        # Only consider departures after requested time
        candidates = events_at_origin[
            events_at_origin["departure_secs"].notna()
            & (events_at_origin["departure_secs"] >= t0)
        ]

        if candidates.empty:
            print(f"[RaptorEngine] No departures from stop {origin_stop_id} after t0={_secs_to_hhmmss(t0)}")
            return []

        # You can tune these caps if performance is a problem
        MAX_ORIGIN_EVENTS = 80
        MAX_TRANSFER_STOPS_PER_TRIP1 = 25
        MAX_EVENTS_PER_TRANSFER_STOP = 80
        TRANSFER_BUFFER_SECS = 120  # 2 minutes

        # ---------- 0-transfer search ----------
        best_arrival_0 = float("inf")
        best_leg_0: Dict[str, Any] | None = None

        cand0 = candidates  # no .head() cap for now
        for _, board_row in cand0.iterrows():
            trip_id = board_row["trip_id"]
            dep_secs = int(board_row["departure_secs"])
            board_seq = int(board_row["stop_sequence"])

            trip_df = self.by_trip.get(trip_id)
            if trip_df is None:
                continue

            seg = trip_df[trip_df["stop_sequence"] >= board_seq]
            seg_dest = seg[seg["stop_id"].astype(str) == dest_stop_id]
            if seg_dest.empty:
                continue

            dest_row = seg_dest.iloc[0]
            arr_secs = int(dest_row["arrival_secs"]) if not pd.isna(dest_row["arrival_secs"]) else dep_secs

            if arr_secs < best_arrival_0:
                best_arrival_0 = arr_secs
                seg_path = seg[seg["stop_sequence"] <= dest_row["stop_sequence"]]
                intermediate_stops = seg_path["stop_id"].astype(str).tolist()

                best_leg_0 = {
                    "mode": "TRANSIT",
                    "from_stop": origin_stop_id,
                    "to_stop": dest_stop_id,
                    "departure": _secs_to_hhmmss(dep_secs),
                    "arrival": _secs_to_hhmmss(arr_secs),
                    "trip_id": str(trip_id),
                    "route_id": str(dest_row.get("route_id", "")),
                    "intermediate_stops": intermediate_stops,
                }

        # ---------- 1-transfer search (if allowed) ----------
        best_arrival_1 = float("inf")
        best_legs_1: List[Dict[str, Any]] | None = None

        if self.max_transfers >= 1:
            cand1 = candidates.head(MAX_ORIGIN_EVENTS)

            for _, board_row in cand1.iterrows():
                trip1_id = board_row["trip_id"]
                dep1_secs = int(board_row["departure_secs"])
                board1_seq = int(board_row["stop_sequence"])

                trip1_df = self.by_trip.get(trip1_id)
                if trip1_df is None:
                    continue

                # segment of first trip from boarding point onward
                seg1 = trip1_df[trip1_df["stop_sequence"] >= board1_seq].reset_index(drop=True)

                # potential transfer stops along this trip
                # (skip the very first row because that's the boarding stop)
                for i, trans_row in seg1.iloc[1:MAX_TRANSFER_STOPS_PER_TRIP1 + 1].iterrows():
                    transfer_stop = str(trans_row["stop_id"])
                    arr1_secs = int(trans_row["arrival_secs"]) if not pd.isna(trans_row["arrival_secs"]) else dep1_secs
                    earliest_board2 = arr1_secs + TRANSFER_BUFFER_SECS

                    # events at transfer stop
                    events_at_transfer = self.by_stop.get(transfer_stop)
                    if events_at_transfer is None:
                        continue

                    events2 = events_at_transfer[
                        events_at_transfer["departure_secs"].notna()
                        & (events_at_transfer["departure_secs"] >= earliest_board2)
                    ].head(MAX_EVENTS_PER_TRANSFER_STOP)

                    if events2.empty:
                        continue

                    for _, board2_row in events2.iterrows():
                        trip2_id = board2_row["trip_id"]
                        dep2_secs = int(board2_row["departure_secs"])
                        board2_seq = int(board2_row["stop_sequence"])

                        trip2_df = self.by_trip.get(trip2_id)
                        if trip2_df is None:
                            continue

                        seg2 = trip2_df[trip2_df["stop_sequence"] >= board2_seq].reset_index(drop=True)
                        seg2_dest = seg2[seg2["stop_id"].astype(str) == dest_stop_id]
                        if seg2_dest.empty:
                            continue

                        dest2_row = seg2_dest.iloc[0]
                        arr2_secs = int(dest2_row["arrival_secs"]) if not pd.isna(dest2_row["arrival_secs"]) else dep2_secs

                        if arr2_secs < best_arrival_1:
                            best_arrival_1 = arr2_secs

                            # path of first leg: origin -> transfer
                            seg1_path = seg1[seg1["stop_sequence"] <= trans_row["stop_sequence"]]
                            leg1_stops = seg1_path["stop_id"].astype(str).tolist()

                            # path of second leg: transfer -> dest
                            seg2_path = seg2[seg2["stop_sequence"] <= dest2_row["stop_sequence"]]
                            leg2_stops = seg2_path["stop_id"].astype(str).tolist()

                            leg1 = {
                                "mode": "TRANSIT",
                                "from_stop": origin_stop_id,
                                "to_stop": transfer_stop,
                                "departure": _secs_to_hhmmss(dep1_secs),
                                "arrival": _secs_to_hhmmss(arr1_secs),
                                "trip_id": str(trip1_id),
                                "route_id": str(trans_row.get("route_id", "")),
                                "intermediate_stops": leg1_stops,
                            }

                            leg2 = {
                                "mode": "TRANSIT",
                                "from_stop": transfer_stop,
                                "to_stop": dest_stop_id,
                                "departure": _secs_to_hhmmss(dep2_secs),
                                "arrival": _secs_to_hhmmss(arr2_secs),
                                "trip_id": str(trip2_id),
                                "route_id": str(dest2_row.get("route_id", "")),
                                "intermediate_stops": leg2_stops,
                            }

                            best_legs_1 = [leg1, leg2]

        # ---------- choose best among 0- and 1-transfer ----------
        best_overall_arrival = float("inf")
        best_legs: List[Dict[str, Any]] | None = None

        if best_leg_0 is not None:
            best_overall_arrival = best_arrival_0
            best_legs = [best_leg_0]

        if best_legs_1 is not None and best_arrival_1 < best_overall_arrival:
            best_overall_arrival = best_arrival_1
            best_legs = best_legs_1

        if best_legs is None:
            print(f"[RaptorEngine] No 0- or 1-transfer journey from {origin_stop_id} to {dest_stop_id}")
            return []

        return best_legs
