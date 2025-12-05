from fastapi import FastAPI
from pydantic import BaseModel
from model_loader import load_model_and_features, score_route

app = FastAPI(title="BoulderMove ML Scoring Service")

model, feature_cols = load_model_and_features()

class RouteFeatures(BaseModel):
    duration_min: float
    buffer_min: float
    num_transfers: int
    rain_1h: float
    snow_1h: float
    wind_speed: float
    temp: float
    event_risk: float
    hour: int
    is_weekend: bool

@app.post("/score_route")
def score_endpoint(features: RouteFeatures):
    return score_route(features.dict(), model, feature_cols)

@app.get("/")
def root():
    return {"status": "ML Model Running"}
