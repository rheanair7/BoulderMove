# # main.py
# from fastapi import FastAPI, Query
# from fastapi.middleware.cors import CORSMiddleware
# import requests, os
# from dotenv import load_dotenv
# from weather_service import get_weather_and_alerts, WeatherError
# from events_service import events_near_route
# from polyline import decode

# load_dotenv()
# app = FastAPI()

# # --- CORS ---
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")


# @app.get("/")
# def home():
#     return {"message": "Trip Planner API is running!"}


# @app.get("/plan")
# def plan_trip(
#     origin: str = Query(...),
#     destination: str = Query(...),
#     stops: str = Query(""),
#     mode: str = Query("driving")
# ):
#     valid_modes = ["driving", "transit", "walking", "bicycling"]
#     if mode not in valid_modes:
#         return {"error": f"Invalid mode. Must be one of {valid_modes}"}

#     print(f"[DEBUG] origin={origin}, destination={destination}, stops={stops}, mode={mode}")

#     # ---- Parse Stops ----
#     stops_list = [s.strip() for s in stops.split(";") if s.strip()]
#     if mode == "transit" and len(stops_list) > 2:
#         stops_list = stops_list[:2]
#     waypoints = "|".join(stops_list) if stops_list else None

#     # ---- Google Directions API ----
#     params = {
#         "origin": origin,
#         "destination": destination,
#         "mode": mode,
#         "key": GOOGLE_MAPS_API_KEY,
#     }
#     if waypoints:
#         params["waypoints"] = waypoints

#     url = "https://maps.googleapis.com/maps/api/directions/json"
#     resp = requests.get(url, params=params)
#     data = resp.json()

#     if "error_message" in data:
#         print("[GOOGLE ERROR]", data["error_message"])
#         return {"error": data["error_message"]}

#     if not data.get("routes"):
#         print("[DEBUG] No routes returned from Google Maps")
#         return {"routes": [], "mode": mode}

#     # ------------------------------------------------------------
#     #               Parse all Google route responses
#     # ------------------------------------------------------------
#     routes_output = []
#     for route in data["routes"]:
#         legs = route.get("legs", [])
#         if not legs:
#             continue

#         start = legs[0]["start_location"]
#         end = legs[-1]["end_location"]
#         waypoint_locs = [leg["end_location"] for leg in legs[:-1]]

#         total_duration = sum(leg["duration"]["value"] for leg in legs)
#         total_distance = sum(leg["distance"]["value"] for leg in legs)

#         polyline_str = route.get("overview_polyline", {}).get("points", "")
#         try:
#             decoded_points = decode(polyline_str)
#         except Exception:
#             decoded_points = []

#         # ---- Weather ----
#         weather_current = None
#         weather_alerts = {"api_alerts": [], "custom_alerts": []}
#         try:
#             lat = float(start["lat"])
#             lon = float(start["lng"])
#             weather_data = get_weather_and_alerts(lat, lon)
#             weather_current = weather_data["current"]
#             weather_alerts = {
#                 "api_alerts": weather_data["api_alerts"],
#                 "custom_alerts": weather_data["custom_alerts"]
#             }
#         except Exception as e:
#             print("[WEATHER ERROR]", e)

#         # ---- Events ----
#         try:
#             events = events_near_route(decoded_points)
#         except Exception as e:
#             print("[EVENT ERROR]", e)
#             events = []

#         # ---- Build response ----
#         routes_output.append({
#             "summary": route.get("summary", "Unnamed Route"),
#             "duration_min": round(total_duration / 60, 1),
#             "distance_km": round(total_distance / 1000, 2),
#             "polyline": polyline_str,
#             "mode": mode,

#             "start_location": start,
#             "end_location": end,
#             "waypoint_locations": waypoint_locs,
#             "stops": stops_list,

#             "weather": weather_current,
#             "alerts": weather_alerts,
#             "events_nearby": events,
#         })

#     return {"routes": routes_output, "mode": mode}


# # -------------------------------------------------------------------
# #                       Autocomplete Endpoints
# # -------------------------------------------------------------------
# @app.get("/autocomplete")
# def autocomplete(input: str = Query(...)):
#     url = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
#     params = {
#         "input": input,
#         "key": GOOGLE_MAPS_API_KEY,
#         "types": "geocode",
#         "components": "country:us"
#     }
#     resp = requests.get(url, params=params).json()
#     if "error_message" in resp:
#         print("[AUTO ERROR]", resp["error_message"])
#         return []
#     return [
#         {"description": p["description"], "place_id": p["place_id"]}
#         for p in resp.get("predictions", [])
#     ]


# @app.get("/place-details")
# def place_details(place_id: str = Query(...)):
#     url = "https://maps.googleapis.com/maps/api/place/details/json"
#     params = {
#         "place_id": place_id,
#         "key": GOOGLE_MAPS_API_KEY,
#         "fields": "geometry,name,formatted_address"
#     }
#     resp = requests.get(url, params=params).json()

#     result = resp.get("result")
#     if not result:
#         return {"error": "No place found"}

#     loc = result["geometry"]["location"]
#     return {
#         "name": result.get("name"),
#         "address": result.get("formatted_address"),
#         "lat": loc["lat"],
#         "lng": loc["lng"]
#     }