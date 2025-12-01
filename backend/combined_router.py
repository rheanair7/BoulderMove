# combined_router.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import networkx as nx
import geopandas as gpd
import numpy as np
import osmnx as ox
from shapely.geometry import Point

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

# Global variables
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


@app.on_event("startup")
def load_data():
    global G, nodes_gdf, node_ids, node_x, node_y, stops_gdf, graph_crs, raptor

    print("Loading walking graph…")
    G = ox.load_graphml(os.path.join(OUTPUT, "walk_graph.graphml"))
    graph_crs = G.graph["crs"]

    nodes = ox.graph_to_gdfs(G, nodes=True, edges=False)
    nodes_gdf_local = nodes.to_crs(graph_crs)
    nodes_gdf = nodes_gdf_local
    node_ids = np.array(nodes_gdf.index)
    node_x = nodes_gdf.geometry.x.to_numpy()
    node_y = nodes_gdf.geometry.y.to_numpy()

    print("Loading stops…")
    stops_gdf_local = gpd.read_file(os.path.join(OUTPUT, "stops.geojson"))
    stops_proj = stops_gdf_local.to_crs(graph_crs)
    stops_gdf_local["_x_proj"] = stops_proj.geometry.x
    stops_gdf_local["_y_proj"] = stops_proj.geometry.y
    stops_gdf = stops_gdf_local

    print("Loading RAPTOR engine…")
    raptor = raptor_engine.RaptorEngine(
        gtfs_feeds=[
            os.path.join(DATA_DIR, "gtfs_rtd.zip"),
            os.path.join(DATA_DIR, "gtfs_bustang.zip")
        ],
        stops_geojson_path=os.path.join(OUTPUT, "stops.geojson")
    )

    print("Backend startup complete.")


def nearest_graph_node(lat, lon):
    pt = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs(graph_crs)[0]
    dx = node_x - pt.x
    dy = node_y - pt.y
    idx = np.argmin(dx*dx + dy*dy)
    return node_ids[idx]


def path_to_latlon(path):
    if not path:
        return []
    nodes = nodes_gdf.loc[path].to_crs(epsg=4326)
    return [{"lat": row.geometry.y, "lon": row.geometry.x} for _, row in nodes.iterrows()]


def nearest_stop_id(lat, lon):
    pt = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs(graph_crs)[0]
    dx = stops_gdf["_x_proj"].to_numpy() - pt.x
    dy = stops_gdf["_y_proj"].to_numpy() - pt.y
    idx = np.argmin(dx*dx + dy*dy)
    return str(stops_gdf.iloc[idx]["stop_id"])


@app.post("/plan_transit_full")
def plan_transit_full(req: PlanTransitRequest):

    origin_stop = nearest_stop_id(req.origin.lat, req.origin.lon)
    dest_stop = nearest_stop_id(req.destination.lat, req.destination.lon)

    # walking → transit-stop
    walk1_node = nearest_graph_node(req.origin.lat, req.origin.lon)
    stop1_node = int(stops_gdf.loc[stops_gdf["stop_id"] == origin_stop]["nearest_node"])
    walk1_path = nx.shortest_path(G, walk1_node, stop1_node, weight="length")

    # transit legs
    transit_legs = raptor.plan(
        origin_stop_id=origin_stop,
        dest_stop_id=dest_stop,
        departure_time_iso=req.depart_at or "2025-11-22T09:00:00Z",
    )

    # walking → final destination
    walk3_node = nearest_graph_node(req.destination.lat, req.destination.lon)
    stop3_node = int(stops_gdf.loc[stops_gdf["stop_id"] == dest_stop]["nearest_node"])
    walk3_path = nx.shortest_path(G, stop3_node, walk3_node, weight="length")

    # Weather (use origin)
    weather = get_weather_and_alerts(req.origin.lat, req.origin.lon)

    # Events using walking polyline ONLY
    full_polyline = path_to_latlon(walk1_path) + path_to_latlon(walk3_path)
    events = events_near_route([(p["lat"], p["lon"]) for p in full_polyline])

    return {
        "mode": "walk_transit_walk",
        "origin_stop": origin_stop,
        "destination_stop": dest_stop,
        "walk_to_stop": path_to_latlon(walk1_path),
        "transit": transit_legs,
        "walk_to_destination": path_to_latlon(walk3_path),
        "weather": weather,
        "events_nearby": events
    }
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
