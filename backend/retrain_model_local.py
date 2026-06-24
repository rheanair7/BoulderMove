"""
Retrain the on-time prediction model using synthetic data (no database needed).
Outputs route_on_time_model.json and feature_cols.joblib in the current directory.
"""
import numpy as np
import pandas as pd
from joblib import dump
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, accuracy_score
from xgboost import XGBClassifier

# --- Generate synthetic training data ---
N = 6000
rng = np.random.default_rng(42)

duration_min   = rng.uniform(10, 90, size=N)
buffer_min     = rng.uniform(0, 30, size=N)
num_transfers  = rng.integers(0, 3, size=N)
rain_1h        = rng.choice([0.0, 0.5, 2.0], size=N, p=[0.7, 0.2, 0.1])
snow_1h        = rng.choice([0.0, 1.0], size=N, p=[0.9, 0.1])
wind_speed     = rng.uniform(0, 15, size=N)
temp           = rng.uniform(-10, 35, size=N)
event_risk     = rng.uniform(0.0, 1.0, size=N)
hour           = rng.integers(5, 23, size=N)
is_weekend     = rng.integers(0, 2, size=N)

base = 0.9
prob = (
    base
    - np.maximum(duration_min - 30, 0) * 0.006
    - num_transfers * 0.06
    - (rain_1h > 0).astype(float) * 0.05
    - (snow_1h > 0).astype(float) * 0.12
    - event_risk * 0.25
    - (np.abs(temp - 20) / 40) * 0.1
    - ((hour >= 16) & (hour <= 19)).astype(float) * 0.08
)
prob = np.clip(prob, 0.05, 0.99)
on_time = rng.binomial(1, prob, size=N)

df = pd.DataFrame({
    "duration_min":  duration_min,
    "buffer_min":    buffer_min,
    "num_transfers": num_transfers,
    "rain_1h":       rain_1h,
    "snow_1h":       snow_1h,
    "wind_speed":    wind_speed,
    "temp":          temp,
    "event_risk":    event_risk,
    "hour":          hour,
    "is_weekend":    is_weekend,
    "on_time":       on_time,
})

feature_cols = [
    "duration_min", "buffer_min", "num_transfers",
    "rain_1h", "snow_1h", "wind_speed", "temp",
    "event_risk", "hour", "is_weekend",
]

X = df[feature_cols]
y = df["on_time"].astype(int)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# --- Train XGBoost ---
model = XGBClassifier(
    n_estimators=600,
    learning_rate=0.03,
    max_depth=6,
    subsample=0.85,
    colsample_bytree=0.85,
    min_child_weight=3,
    gamma=0.1,
    reg_alpha=0.3,
    reg_lambda=1.0,
    objective="binary:logistic",
    eval_metric="auc",
    tree_method="hist",
    random_state=42,
)

model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

print("Train accuracy:", accuracy_score(y_train, model.predict(X_train)))
print("Test  accuracy:", accuracy_score(y_test,  model.predict(X_test)))
print("ROC-AUC:       ", roc_auc_score(y_test, model.predict_proba(X_test)[:, 1]))

# --- Save in XGBoost native JSON format (required by ml_service) ---
model.save_model("route_on_time_model.json")
dump(feature_cols, "feature_cols.joblib")

print("\nSaved: route_on_time_model.json")
print("Saved: feature_cols.joblib")
