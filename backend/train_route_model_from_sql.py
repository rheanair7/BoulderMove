import psycopg2
import pandas as pd
from joblib import dump
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, accuracy_score
from google.cloud import storage
from xgboost import XGBClassifier
import numpy as np

# ------- SQL connection -------
conn = psycopg2.connect(
    host="35.239.113.255",
    dbname="bouldermove",
    user="boulder_user",
    password="RheaisMad",
    port=5432,
)

query = """
SELECT
    duration_min,
    buffer_min,
    num_transfers,
    rain_1h,
    snow_1h,
    wind_speed,
    temp,
    event_risk,
    hour,
    is_weekend,
    on_time
FROM trip_history;
"""

df = pd.read_sql(query, conn)
conn.close()

# ------- Feature prep -------
feature_cols = [
    "duration_min",
    "buffer_min",
    "num_transfers",
    "rain_1h",
    "snow_1h",
    "wind_speed",
    "temp",
    "event_risk",
    "hour",
    "is_weekend",
]

X = df[feature_cols]
y = df["on_time"].astype(int)

# ------- Train/test split -------
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ------- XGBoost Model (Tuned) -------
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
    random_state=42
)

model.fit(
    X_train,
    y_train,
    eval_set=[(X_test, y_test)],
    verbose=False
)

# ------- Evaluation -------
train_pred = model.predict(X_train)
test_pred = model.predict(X_test)

train_acc = accuracy_score(y_train, train_pred)
test_acc = accuracy_score(y_test, test_pred)
test_auc = roc_auc_score(y_test, model.predict_proba(X_test)[:, 1])

print("Train accuracy:", train_acc)
print("Test accuracy:", test_acc)
print("ROC-AUC:", test_auc)

# ==============================================================
#   SAVE MODEL CORRECTLY FOR CLOUD RUN (NO PICKLE!)
# ==============================================================

# Save XGBoost model to native JSON format (portable across versions)
model.save_model("route_on_time_model.json")

# Save features list separately
dump(feature_cols, "feature_cols.joblib")

# ==============================================================
#   UPLOAD TO GOOGLE CLOUD STORAGE
# ==============================================================

client = storage.Client()
bucket = client.bucket("bouldermove-ml-artifacts")

# Upload model
blob_model = bucket.blob("models/route_on_time_model.json")
blob_model.upload_from_filename("route_on_time_model.json")

# Upload feature columns list
blob_feat = bucket.blob("models/feature_cols.joblib")
blob_feat.upload_from_filename("feature_cols.joblib")

print("Uploaded model + feature columns to GCS:")
print("  - gs://bouldermove-ml-artifacts/models/route_on_time_model.json")
print("  - gs://bouldermove-ml-artifacts/models/feature_cols.joblib")
