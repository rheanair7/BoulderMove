import psycopg2
import pandas as pd
from joblib import dump
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import roc_auc_score

from google.cloud import storage

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

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(max_iter=1000)),
])

pipe.fit(X_train, y_train)

print("Train acc:", pipe.score(X_train, y_train))
print("Test acc:", pipe.score(X_test, y_test))
y_proba = pipe.predict_proba(X_test)[:, 1]
print("ROC-AUC:", roc_auc_score(y_test, y_proba))

# save locally
dump((pipe, feature_cols), "route_on_time_model.joblib")

# ------- upload to GCS -------
client = storage.Client()
bucket = client.bucket("bouldermove-ml-artifacts")
blob = bucket.blob("models/route_on_time_model.joblib")
blob.upload_from_filename("route_on_time_model.joblib")

print("Uploaded model to gs://bouldermove-ml-artifacts/models/route_on_time_model.joblib")
