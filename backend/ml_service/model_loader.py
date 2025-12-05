import os
import json
import numpy as np
from google.cloud import storage
from joblib import load
from xgboost import Booster

BUCKET_NAME = "bouldermove-ml-artifacts"
MODEL_JSON_PATH = "models/route_on_time_model.json"
FEATURE_COLS_PATH = "models/feature_cols.joblib"


def load_model_and_features():
    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)

    # ---- Load XGBoost model JSON ----
    blob_model = bucket.blob(MODEL_JSON_PATH)
    with open("/tmp/model.json", "wb") as f:
        blob_model.download_to_file(f)

    booster = Booster()
    booster.load_model("/tmp/model.json")

    # ---- Load feature columns ----
    blob_feat = bucket.blob(FEATURE_COLS_PATH)
    with open("/tmp/feat.joblib", "wb") as f:
        blob_feat.download_to_file(f)

    feature_cols = load("/tmp/feat.joblib")

    return booster, feature_cols
def score_route(features: dict, model, feature_cols):
    import xgboost as xgb

    # Create row in correct order
    x = np.array([[features[col] for col in feature_cols]], dtype=float)

    # Provide feature names so XGBoost Booster recognizes them
    d = xgb.DMatrix(x, feature_names=feature_cols)

    prob = float(model.predict(d)[0])

    return {
        "prob_on_time": prob,
        "expected_delay_min": (1 - prob) * 15
    }


