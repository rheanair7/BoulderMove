from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import requests, os
from dotenv import load_dotenv
from weather_service import get_weather_and_alerts, WeatherError

load_dotenv()
app = FastAPI()

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    origin: str = Query(...),
    destination: str = Query(...),
    stops: str = Query(""),
    mode: str = Query("driving")
):
    valid_modes = ["driving", "transit", "walking", "bicycling"]
    if mode not in valid_modes:
        return {"error": f"Invalid mode. Must be one of {valid_modes}"}

    print(f"[DEBUG] origin={origin}, destination={destination}, stops={stops}, mode={mode}")

    # ---- Parse stops ----
    stops_list = [s.strip() for s in stops.split(",") if s.strip()]

    # Transit waypoint limit
    if mode == "transit" and len(stops_list) > 2:
        stops_list = stops_list[:2]

    waypoints = "|".join(stops_list) if stops_list else None

    # ---- Google Directions request ----
    params = {
        "origin": origin,
        "destination": destination,
        "mode": mode,
        "key": GOOGLE_MAPS_API_KEY,
    }
    if waypoints:
        params["waypoints"] = waypoints

    url = "https://maps.googleapis.com/maps/api/directions/json"
    resp = requests.get(url, params=params)
    data = resp.json()

    # Handle API Errors
    if "error_message" in data:
        print("[GOOGLE ERROR]", data["error_message"])

    # ---- Parse Routes ----
    routes = []
    for route in data.get("routes", []):
        legs = route.get("legs", [])

        # Start & End locations
        start_loc = legs[0]["start_location"] if legs else None
        end_loc = legs[-1]["end_location"] if legs else None

        # Extract waypoint locations (if any)
        waypoint_locs = []
        for leg in legs[:-1]:  # all legs except final
            waypoint_locs.append(leg["end_location"])

        # Totals
        total_duration = sum(leg["duration"]["value"] for leg in legs)
        total_distance = sum(leg["distance"]["value"] for leg in legs)

        # 🔹 Default values in case weather fails
        weather_current = None
        weather_alerts = {
            "api_alerts": [],
            "custom_alerts": [],
        }

        # 🔹 Call OpenWeather only if we have a start location
        if start_loc is not None:
            try:
                lat = start_loc["lat"]
                lon = start_loc["lng"]
                weather_data = get_weather_and_alerts(lat, lon)
                weather_current = weather_data["current"]
                weather_alerts = {
                    "api_alerts": weather_data["api_alerts"],
                    "custom_alerts": weather_data["custom_alerts"],
                }
            except WeatherError as e:
                print("[WEATHER ERROR]", e)
            except Exception as e:
                print("[WEATHER UNEXPECTED ERROR]", e)

        routes.append({
            "summary": route.get("summary", "Unnamed Route"),
            "duration_min": round(total_duration / 60, 1),
            "distance_km": round(total_distance / 1000, 2),
            "polyline": route.get("overview_polyline", {}).get("points", ""),
            "mode": mode,

            "start_location": start_loc,
            "end_location": end_loc,
            "waypoint_locations": waypoint_locs,

            "stops": stops_list,

            # 🔹 Weather and alerts for this route
            "weather": weather_current,
            "alerts": weather_alerts,
        })
    return {"routes": routes, "mode": mode}
    
