from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import requests, os
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

# --- CORS for local React frontend ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev; restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

@app.get("/")
def home():
    return {"message": "Trip Planner API is running!"}

@app.get("/plan")
def plan_trip(
    origin: str = Query(..., description="Starting location"),
    destination: str = Query(..., description="Destination"),
    stops: str = Query("", description="Comma-separated intermediate stops"),
    mode: str = Query("driving", description="driving | transit | walking | bicycling")
):
    valid_modes = ["driving", "transit", "walking", "bicycling"]
    if mode not in valid_modes:
        return {"error": f"Invalid mode. Must be one of {valid_modes}"}

    print(f"[DEBUG] origin={origin}, destination={destination}, stops={stops}, mode={mode}")

    # ---- Build waypoints ----
    stops_list = [s.strip() for s in stops.split(",") if s.strip()]
    if mode == "transit" and len(stops_list) > 2:
        print("[WARN] Transit mode supports only 2 waypoints; truncating.")
        stops_list = stops_list[:2]
    waypoints = "|".join(stops_list) if stops_list else None

    # ---- Request to Google Directions API ----
    params = {
        "origin": origin,
        "destination": destination,
        "mode": mode,
        "key": GOOGLE_MAPS_API_KEY,
    }
    if waypoints:
        params["waypoints"] = waypoints

    url = "https://maps.googleapis.com/maps/api/directions/json"
    print(f"[DEBUG] Sending request to Google Maps: {params}")
    resp = requests.get(url, params=params)
    data = resp.json()

    if "error_message" in data:
        print(f"[ERROR] Google API Error: {data['error_message']}")

    # ---- Parse routes ----
    routes = []
    for route in data.get("routes", []):
        legs = route.get("legs", [])
        total_duration = sum(leg["duration"]["value"] for leg in legs)
        total_distance = sum(leg["distance"]["value"] for leg in legs)
        poly = route.get("overview_polyline", {}).get("points", "")

        route_info = {
            "summary": route.get("summary", "Unnamed Route"),
            "duration_min": round(total_duration / 60, 1),
            "distance_km": round(total_distance / 1000, 2),
            "polyline": poly,               # ✅ Added for map rendering
            "mode": mode,
            "stops": stops_list
        }
        routes.append(route_info)
        print(f"[DEBUG] Added route: {route_info['summary']} ({mode})")

    print(f"[DEBUG] Returning {len(routes)} route(s)")
    return {"routes": routes, "mode": mode}
