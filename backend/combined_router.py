from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import networkx as nx
import geopandas as gpd
import numpy as np
import osmnx as ox
from shapely.geometry import Point
import requests
from datetime import datetime
import polyline

from weather_service import get_weather_and_alerts
from events_service import events_near_route
import raptor_engine

DATA_DIR = "data"
OUTPUT = os.path.join(DATA_DIR, "network_data")

app = FastAPI(title="BoulderMove Routing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Globals
G = None
nodes_gdf = None
node_ids = None
node_x = None
node_y = None
stops_gdf = None
graph_crs = None
raptor = None


class Location(BaseModel):
    lat: float
    lon: float


class PlanTransitRequest(BaseModel):
    origin: Location
    destination: Location
    depart_at: str | None = None


# ------------------- LOAD DATA ----------------------
@app.on_event("startup")
def load_data():
    global G, nodes_gdf, node_ids, node_x, node_y, stops_gdf, graph_crs, raptor

    print("Loading walking graph…")
    G = ox.load_graphml(os.path.join(OUTPUT, "walk_graph.graphml"))
    graph_crs = G.graph["crs"]

    nodes = ox.graph_to_gdfs(G, nodes=True, edges=False)
    nodes = nodes.to_crs(graph_crs)

    nodes_gdf = nodes
    node_ids = np.array(nodes.index)
    node_x = nodes.geometry.x.to_numpy()
    node_y = nodes.geometry.y.to_numpy()

    print("Loading stops…")
    stops = gpd.read_file(os.path.join(OUTPUT, "stops.geojson"))
    stops["stop_id"] = stops["stop_id"].astype(str)

    stops_proj = stops.to_crs(graph_crs)
    stops["_x_proj"] = stops_proj.geometry.x
    stops["_y_proj"] = stops_proj.geometry.y

    stops_gdf = stops

    print("Loading RAPTOR engine…")
    raptor = raptor_engine.RaptorEngine(
        gtfs_feeds=[
            os.path.join(DATA_DIR, "gtfs_rtd.zip"),
            os.path.join(DATA_DIR, "gtfs_bustang.zip")
        ],
        stops_geojson_path=os.path.join(OUTPUT, "stops.geojson")
    )

    print("Backend startup complete.")


# ------------------ HELPERS -----------------------
def nearest_graph_node(lat, lon):
    pt = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs(graph_crs)[0]
    dx = node_x - pt.x
    dy = node_y - pt.y
    return node_ids[np.argmin(dx*dx + dy*dy)]


def path_to_latlon(path):
    if not path:
        return []
    nodes = nodes_gdf.loc[path].to_crs(epsg=4326)
    return [{"lat": row.geometry.y, "lon": row.geometry.x} for _, row in nodes.iterrows()]


def nearest_gtfs_stop(lat, lon):
    pt = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs(graph_crs)[0]
    dx = stops_gdf["_x_proj"].to_numpy() - pt.x
    dy = stops_gdf["_y_proj"].to_numpy() - pt.y
    idx = np.argmin(dx*dx + dy*dy)
    return str(stops_gdf.iloc[idx]["stop_id"])


def format_weather(raw):
    if not raw:
        return None
    current = raw.get("current", {})
    return {
        "temp": current.get("temp"),
        "feels_like": current.get("feels_like"),
        "humidity": current.get("humidity"),
        "weather_main": current.get("weather_main"),
        "weather_desc": current.get("weather_desc"),
        "wind_speed": current.get("wind_speed"),
        "rain_1h": current.get("rain_1h", 0),
        "snow_1h": current.get("snow_1h", 0),
        "custom_alerts": raw.get("custom_alerts", []),
    }


# ---------------- GOOGLE BACKUP FUNCTION ----------------

def google_transit_route(origin, destination):
    key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not key:
        print("[GOOGLE BACKUP] Missing API key.")
        return None

    url = (
        "https://maps.googleapis.com/maps/api/directions/json?"
        f"origin={origin.lat},{origin.lon}&"
        f"destination={destination.lat},{destination.lon}&"
        f"mode=transit&"
        f"departure_time=now&"
        f"key={key}"
    )

    try:
        r = requests.get(url, timeout=6)
        data = r.json()

        if data.get("routes"):
            overview = data["routes"][0]["overview_polyline"]["points"]
            coords = polyline.decode(overview)
            return [{"lat": lat, "lon": lon} for lat, lon in coords]

        return None

    except Exception as e:
        print("[GOOGLE BACKUP ERROR]", e)
        return None


# --------------- MAIN ROUTE ----------------------
@app.post("/plan_transit_full")
def plan_transit_full(req: PlanTransitRequest):

    departure_iso = req.depart_at or datetime.now().replace(microsecond=0).isoformat()
    print("Using departure time:", departure_iso)

    # ORIGIN STOP
    origin_stop = nearest_gtfs_stop(req.origin.lat, req.origin.lon)
    origin_match = stops_gdf.loc[stops_gdf["stop_id"] == origin_stop]

    # DEST STOP
    dest_stop = nearest_gtfs_stop(req.destination.lat, req.destination.lon)
    dest_match = stops_gdf.loc[stops_gdf["stop_id"] == dest_stop]

    # WALK TO FIRST STOP
    walk1_path = nx.shortest_path(G,
                                  nearest_graph_node(req.origin.lat, req.origin.lon),
                                  int(origin_match["nearest_node"].iloc[0]),
                                  weight="length")
    walk1_latlon = path_to_latlon(walk1_path)

    # TRANSIT USING RAPTOR
    transit_legs = raptor.plan(origin_stop, dest_stop, departure_iso)

    # FALLBACK IF RAPTOR FAILS
    if not transit_legs or len(transit_legs) == 0:
        print("⚠ RAPTOR FAILED → Using Google Transit API fallback")
        google_geom = google_transit_route(req.origin, req.destination)

        if google_geom:
            return {
                "mode": "google_transit_fallback",
                "walk_to_stop": [],
                "transit": [],
                "walk_to_destination": [],
                "geometry": google_geom,
                "weather": format_weather(get_weather_and_alerts(req.origin.lat, req.origin.lon)),
                "events_nearby": []
            }
        else:
            return {"error": "No route found by RAPTOR or Google Maps."}

    # BUILD RAPTOR GEOMETRY
    transit_geometry = []
    for leg in transit_legs:
        for sid in leg["intermediate_stops"]:
            row = stops_gdf.loc[stops_gdf["stop_id"] == sid].iloc[0]
            transit_geometry.append({"lat": row["stop_lat"], "lon": row["stop_lon"]})

    # WALK TO DESTINATION
    walk3_path = nx.shortest_path(G,
                                  int(dest_match["nearest_node"].iloc[0]),
                                  nearest_graph_node(req.destination.lat, req.destination.lon),
                                  weight="length")
    walk3_latlon = path_to_latlon(walk3_path)

    # WEATHER + EVENTS
    weather = format_weather(get_weather_and_alerts(req.origin.lat, req.origin.lon))
    full_geometry = walk1_latlon + transit_geometry + walk3_latlon
    events = events_near_route([(p["lat"], p["lon"]) for p in full_geometry])

    return {
        "mode": "walk_transit_walk",
        "origin_gtfs_stop": origin_stop,
        "destination_gtfs_stop": dest_stop,
        "walk_to_stop": walk1_latlon,
        "transit": transit_legs,
        "walk_to_destination": walk3_latlon,
        "weather": weather,
        "events_nearby": events,
        "geometry": full_geometry
    }


# Run locally
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
