
# import os
# from typing import Any, Dict, List

# import geopandas as gpd
# import networkx as nx
# import numpy as np
# import osmnx as ox
# from fastapi import FastAPI, HTTPException
# from pydantic import BaseModel
# from shapely.geometry import Point

# import raptor_engine

# DATA_DIR = "data"
# OUTPUT = os.path.join(DATA_DIR, "network_data")

# app = FastAPI(title="BoulderMove Routing API")
# from fastapi.middleware.cors import CORSMiddleware

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"], 
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Globals
# G = None
# nodes_gdf: gpd.GeoDataFrame | None = None
# node_ids = None
# node_x = None
# node_y = None
# stops_gdf: gpd.GeoDataFrame | None = None
# graph_crs = None
# raptor: raptor_engine.RaptorEngine | None = None


# class Location(BaseModel):
#     lat: float
#     lon: float


# class PlanRequest(BaseModel):
#     origin: Location
#     destination: Location


# class PlanTransitRequest(BaseModel):
#     origin: Location
#     destination: Location
#     depart_at: str | None = None


# @app.on_event("startup")
# def load_data():
#     global G, nodes_gdf, node_ids, node_x, node_y, stops_gdf, graph_crs, raptor

#     graph_path = os.path.join(OUTPUT, "walk_graph.graphml")
#     stops_path = os.path.join(OUTPUT, "stops.geojson")

#     if not os.path.exists(graph_path):
#         raise RuntimeError(f"Graph file not found at {graph_path}. Run build_network.py first.")
#     if not os.path.exists(stops_path):
#         raise RuntimeError(f"Stops file not found at {stops_path}. Run build_network.py first.")

#     print("Loading walk graph…")
#     G = ox.load_graphml(graph_path)
#     graph_crs = G.graph.get("crs", None)
#     if graph_crs is None:
#         raise RuntimeError("Graph has no CRS in G.graph['crs'].")

#     print("Building node lookup arrays…")
#     nodes_gdf_local = ox.graph_to_gdfs(G, nodes=True, edges=False)
#     nodes_gdf_local = nodes_gdf_local.to_crs(graph_crs)
#     nodes_gdf = nodes_gdf_local

#     node_ids = np.array(nodes_gdf.index)
#     node_x = nodes_gdf.geometry.x.to_numpy()
#     node_y = nodes_gdf.geometry.y.to_numpy()

#     print("Loading stops…")
#     stops_gdf_local = gpd.read_file(stops_path)  # EPSG:4326
#     # Project to graph CRS for nearest-stop distance
#     stops_proj = stops_gdf_local.to_crs(graph_crs)
#     stops_gdf_local["_x_proj"] = stops_proj.geometry.x
#     stops_gdf_local["_y_proj"] = stops_proj.geometry.y
#     stops_gdf = stops_gdf_local

#     print("Initializing RAPTOR engine stub…")
#     raptor = raptor_engine.RaptorEngine(
#         gtfs_feeds=[
#             os.path.join(DATA_DIR, "gtfs_rtd.zip"),
#             os.path.join(DATA_DIR, "gtfs_bustang.zip"),
#         ],
#         stops_geojson_path=stops_path,
#     )

#     print("Startup complete.")


# def nearest_graph_node(lat: float, lon: float) -> Any:
#     """
#     Find nearest graph node to a lat/lon using NumPy distance in projected CRS.
#     """
#     if graph_crs is None or nodes_gdf is None:
#         raise RuntimeError("Graph CRS or nodes_gdf not initialized.")

#     pt = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs(graph_crs)[0]
#     x, y = pt.x, pt.y

#     dx = node_x - x
#     dy = node_y - y
#     dist2 = dx * dx + dy * dy
#     idx = int(np.argmin(dist2))
#     return node_ids[idx]


# def path_to_latlon(path: List[Any]) -> List[Dict[str, float]]:
#     """
#     Convert a list of node IDs to list of lat/lon coordinates.
#     """
#     if nodes_gdf is None:
#         raise RuntimeError("nodes_gdf not initialized")

#     sub_nodes = nodes_gdf.loc[path].copy()
#     sub_nodes = sub_nodes.to_crs(epsg=4326)
#     coords = []
#     for nid, row in sub_nodes.iterrows():
#         geom = row.geometry
#         coords.append({"lat": geom.y, "lon": geom.x, "node_id": str(nid)})
#     return coords


# def nearest_stop_id(lat: float, lon: float) -> str:
#     """
#     Find the nearest GTFS stop to a given lat/lon using projected stop coords.
#     """
#     if stops_gdf is None or graph_crs is None:
#         raise RuntimeError("stops_gdf or graph_crs not initialized")

#     pt_proj = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs(graph_crs)[0]
#     x, y = pt_proj.x, pt_proj.y

#     dx = stops_gdf["_x_proj"].to_numpy() - x
#     dy = stops_gdf["_y_proj"].to_numpy() - y
#     dist2 = dx * dx + dy * dy
#     idx = int(np.argmin(dist2))
#     return str(stops_gdf.iloc[idx]["stop_id"])


# def stop_to_graph_node(stop_id: str) -> Any:
#     """
#     Map a GTFS stop_id back to its nearest graph node using the 'nearest_node' column in stops.geojson.
#     """
#     if stops_gdf is None:
#         raise RuntimeError("stops_gdf not initialized")

#     matches = stops_gdf.loc[stops_gdf["stop_id"].astype(str) == str(stop_id)]
#     if matches.empty:
#         raise HTTPException(status_code=400, detail=f"No graph node found for stop_id={stop_id}")
#     nearest = matches.iloc[0]["nearest_node"]
#     return nearest


# @app.get("/")
# def root():
#     return {"status": "ok", "message": "BoulderMove routing API is running."}


# @app.post("/plan")
# def plan_trip(req: PlanRequest):
#     """
#     Walking-only route between origin and destination.
#     """
#     if G is None:
#         raise HTTPException(status_code=500, detail="Graph not loaded.")

#     o_node = nearest_graph_node(req.origin.lat, req.origin.lon)
#     d_node = nearest_graph_node(req.destination.lat, req.destination.lon)

#     try:
#         path_nodes = nx.shortest_path(G, source=o_node, target=d_node, weight="length")
#     except nx.NetworkXNoPath:
#         raise HTTPException(status_code=400, detail="No walking path found between origin and destination.")

#     try:
#         distance_m = nx.path_weight(G, path_nodes, weight="length")
#     except Exception:
#         distance_m = None

#     path_coords = path_to_latlon(path_nodes)

#     return {
#         "mode": "walk_only",
#         "origin_node": str(o_node),
#         "destination_node": str(d_node),
#         "distance_m": distance_m,
#         "num_nodes": len(path_nodes),
#         "walk_path": path_coords,
#     }


# @app.post("/plan_transit_full")
# def plan_transit_full(req: PlanTransitRequest):
#     """
#     Full multimodal:
#     - walk from origin point to nearest stop
#     - transit via RaptorEngine
#     - walk from destination stop to final destination
#     """
#     if G is None or raptor is None:
#         raise HTTPException(status_code=500, detail="Graph or RAPTOR engine not loaded.")

#     # 1) Nearest stops to origin and destination
#     origin_stop_id = nearest_stop_id(req.origin.lat, req.origin.lon)
#     dest_stop_id = nearest_stop_id(req.destination.lat, req.destination.lon)

#     # 2) Walk from origin coordinate to origin_stop
#     o_node = nearest_graph_node(req.origin.lat, req.origin.lon)
#     origin_stop_node = stop_to_graph_node(origin_stop_id)
#     try:
#         walk1_nodes = nx.shortest_path(G, source=o_node, target=origin_stop_node, weight="length")
#         walk1_dist = nx.path_weight(G, walk1_nodes, weight="length")
#     except nx.NetworkXNoPath:
#         walk1_nodes = []
#         walk1_dist = None

#     # 3) Transit leg(s) via your RaptorEngine (this is the line you asked about)
#     transit_legs = raptor.plan(
#         origin_stop_id=origin_stop_id,
#         dest_stop_id=dest_stop_id,
#         departure_time_iso=req.depart_at or "2025-11-22T09:00:00Z",
#     )

#     # 4) Walk from dest_stop to final destination coordinate
#     d_node = nearest_graph_node(req.destination.lat, req.destination.lon)
#     dest_stop_node = stop_to_graph_node(dest_stop_id)
#     try:
#         walk3_nodes = nx.shortest_path(G, source=dest_stop_node, target=d_node, weight="length")
#         walk3_dist = nx.path_weight(G, walk3_nodes, weight="length")
#     except nx.NetworkXNoPath:
#         walk3_nodes = []
#         walk3_dist = None

#     return {
#         "mode": "walk_transit_walk",
#         "origin": req.origin.dict(),
#         "destination": req.destination.dict(),
#         "origin_stop_id": origin_stop_id,
#         "destination_stop_id": dest_stop_id,
#         "origin_walk": {
#             "distance_m": walk1_dist,
#             "num_nodes": len(walk1_nodes),
#             "path": path_to_latlon(walk1_nodes) if walk1_nodes else [],
#         },
#         "transit": {
#             "legs": transit_legs,
#         },
#         "destination_walk": {
#             "distance_m": walk3_dist,
#             "num_nodes": len(walk3_nodes),
#             "path": path_to_latlon(walk3_nodes) if walk3_nodes else [],
#         },
#     }


# if __name__ == "__main__":
#     import uvicorn

#     uvicorn.run("service_router:app", host="0.0.0.0", port=8080, reload=True)
