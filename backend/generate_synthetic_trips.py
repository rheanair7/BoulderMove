import psycopg2
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from tqdm import tqdm

# ---------------- SQL CONNECTION ----------------
conn = psycopg2.connect(
    host="35.239.113.255",
    dbname="bouldermove",
    user="boulder_user",
    password="RheaisMad",
    port=5432,
)

cur = conn.cursor()

# ---------------- SYNTHETIC DATA ----------------
N = 6000
rng = np.random.default_rng(42)

duration_min = rng.uniform(10, 90, size=N)
buffer_min = rng.uniform(0, 30, size=N)
num_transfers = rng.integers(0, 3, size=N)

rain_1h = rng.choice([0.0, 0.5, 2.0], size=N, p=[0.7, 0.2, 0.1])
snow_1h = rng.choice([0.0, 1.0], size=N, p=[0.9, 0.1])
wind_speed = rng.uniform(0, 15, size=N)
temp = rng.uniform(-10, 35, size=N)
event_risk = rng.uniform(0.0, 1.0, size=N)

hour = rng.integers(5, 23, size=N)
is_weekend = rng.integers(0, 2, size=N)

# ---- probability function ----
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
    "duration_min": duration_min,
    "buffer_min": buffer_min,
    "num_transfers": num_transfers,
    "rain_1h": rain_1h,
    "snow_1h": snow_1h,
    "wind_speed": wind_speed,
    "temp": temp,
    "event_risk": event_risk,
    "hour": hour,
    "is_weekend": is_weekend,
    "on_time": on_time,
})

print("Synthetic sample:")
print(df.head())
print("\nAverage on_time probability:", on_time.mean())

# ---------------- INSERT INTO SQL ----------------

insert_query = """
INSERT INTO trip_history (
    user_id,
    route_id,
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
    desired_arrival_ts,
    scheduled_arrival_ts,
    actual_arrival_ts,
    on_time
)
VALUES (
    %s, %s,
    %s, %s, %s,
    %s, %s, %s,
    %s, %s,
    %s, %s,
    %s, %s, %s,
    %s
);
"""

print("\nInserting rows into SQL...")

for _, row in tqdm(df.iterrows(), total=len(df)):

    # generate timestamps
    now = datetime.utcnow()

    # scheduled_arrival = now + duration
    scheduled_arrival = now + timedelta(minutes=float(row["duration_min"]))

    # desired arrival = scheduled + buffer
    desired_arrival = scheduled_arrival + timedelta(minutes=float(row["buffer_min"]))

    # actual arrival = scheduled +- small random noise
    actual_arrival = scheduled_arrival + timedelta(
        minutes=float(np.random.normal(0, 5))
    )

    # convert numpy types → Python primitives
    values = (
        None,                     # user_id (nullable)
        None,                     # route_id (nullable)
        float(row["duration_min"]),
        float(row["buffer_min"]),
        int(row["num_transfers"]),
        float(row["rain_1h"]),
        float(row["snow_1h"]),
        float(row["wind_speed"]),
        float(row["temp"]),
        float(row["event_risk"]),
        int(row["hour"]),
        bool(row["is_weekend"]),
        desired_arrival,
        scheduled_arrival,
        actual_arrival,
        bool(row["on_time"]),
    )

    cur.execute(insert_query, values)

conn.commit()
cur.close()
conn.close()

print("Done! Inserted", N, "synthetic rows.")
