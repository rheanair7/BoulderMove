import os
import zipfile

import osmnx as ox
import pandas as pd
import geopandas as gpd
import numpy as np
from shapely.geometry import box

# ---------------------------
# PATHS AND CONFIG
# ---------------------------
DATA_DIR = "data"
GTFS_FEEDS = [
    os.path.join(DATA_DIR, "gtfs_rtd.zip"),
    os.path.join(DATA_DIR, "gtfs_bustang.zip"),
]
OUTPUT = os.path.join(DATA_DIR, "network_data")
os.makedirs(OUTPUT, exist_ok=True)


# ---------------------------
# BUILD WALK GRAPH
# ---------------------------
def build_walk_graph(bbox, network_type="walk"):
    """
    Build a walking graph for the given bbox (north, south, east, west).
    The graph is projected to a metric CRS.
    """
    north, south, east, west = bbox
    print("Building walking graph using polygon bbox…")

    # Create polygon from bbox
    poly = box(west, south, east, north)

    # Build in lat/lon
    G = ox.graph_from_polygon(poly, network_type=network_type)

    # Project to a metric CRS
    G = ox.project_graph(G)

    return G
# def build_walk_graph(network_type="walk"):
#     print("Building walking graph for Boulder…")

#     # OSMnx 2.x – use city boundary polygon
#     G = ox.graph_from_place(
#         "Boulder, Colorado, USA",
#         network_type=network_type,
#     )
#     return G


# ---------------------------
# GTFS STOP LOADING (ZIPFILE)
# ---------------------------
def load_gtfs_stops(feed_path: str) -> pd.DataFrame:
    """
    Load stops.txt from a GTFS zip and return a DataFrame with:
    stop_id, stop_name, stop_lat, stop_lon
    """
    print("Loading GTFS stops from", feed_path)

    with zipfile.ZipFile(feed_path, "r") as zf:
        with zf.open("stops.txt") as f:
            df = pd.read_csv(f)

    required_cols = ["stop_id", "stop_name", "stop_lat", "stop_lon"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in {feed_path}: {missing}")

    return df[required_cols]


# ---------------------------
# SNAP STOPS TO GRAPH (NUMPY NEAREST)
# ---------------------------
def snap_stops_to_graph(G, stops_df: pd.DataFrame) -> gpd.GeoDataFrame:
    """
    Given a projected graph G and a DataFrame of GTFS stops (lat/lon),
    project stops to the graph CRS and find the nearest node for each
    using pure NumPy distance calculations (no scipy/sklearn).
    """
    # GTFS stops in WGS84
    stops_g = gpd.GeoDataFrame(
        stops_df,
        geometry=gpd.points_from_xy(stops_df.stop_lon, stops_df.stop_lat),
        crs="EPSG:4326",
    )

    # Project stops to same CRS as graph
    graph_crs = G.graph.get("crs", None)
    if graph_crs is None:
        raise ValueError("Graph has no CRS set in G.graph['crs']")

    stops_proj = stops_g.to_crs(graph_crs)

    # Get nodes GeoDataFrame (already in graph CRS)
    nodes = ox.graph_to_gdfs(G, nodes=True, edges=False)

    # Precompute node coordinates as NumPy arrays
    node_ids = np.array(nodes.index)
    node_x = nodes.geometry.x.to_numpy()
    node_y = nodes.geometry.y.to_numpy()

    nearest_ids = []
    print("Snapping stops to nearest graph nodes (NumPy)…")

    # For each stop, find nearest node by Euclidean distance
    for pt in stops_proj.geometry:
        x, y = pt.x, pt.y
        dx = node_x - x
        dy = node_y - y
        dist2 = dx * dx + dy * dy
        idx = np.argmin(dist2)
        nearest_ids.append(node_ids[idx])

    # Store mapping back on original (lat/lon) GeoDataFrame
    stops_g["nearest_node"] = nearest_ids
    return stops_g


# ---------------------------
# MAIN SCRIPT
# ---------------------------
def main():
    # Smaller bounding box around central Denver
    # bbox = (north, south, east, west)
   # (north, south, east, west)
    bbox = (40.09, 39.95, -105.18, -105.32)


    # 1) Build walking graph
    G = build_walk_graph(bbox, network_type="walk")
    graph_path = os.path.join(OUTPUT, "walk_graph.graphml")
    ox.save_graphml(G, graph_path)
    print("Saved graph to", graph_path)

    # 2) Load + merge GTFS stops from all feeds
    all_stops = []
    for feed in GTFS_FEEDS:
        if not os.path.exists(feed):
            raise FileNotFoundError(f"GTFS file not found: {feed}")
        all_stops.append(load_gtfs_stops(feed))

    stops_df = (
        pd.concat(all_stops)
        .drop_duplicates(subset=["stop_id"])
        .reset_index(drop=True)
    )

    # 3) Snap stops to graph
    stops_gdf = snap_stops_to_graph(G, stops_df)
    stops_path = os.path.join(OUTPUT, "stops.geojson")
    stops_gdf.to_file(stops_path, driver="GeoJSON")
    print("Saved stops.geojson to", stops_path)


if __name__ == "__main__":
    main()
