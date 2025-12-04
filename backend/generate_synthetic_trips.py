import numpy as np
import psycopg2
from datetime import datetime, timedelta

N = 5000
rng = np.random.default_rng(42)

# ---- Cloud SQL connection (adjust values) ----
conn = psycopg2.connect(
    host="35.239.113.255",
    dbname="bouldermove",
    user="boulder_user",
    password="RheaisMad",
    port=5432,
)
cur = conn.cursor()

base_start = datetime(2025, 1, 1, 8, 0, 0)  # arbitrary reference date

for i in range(N):
    user_id = f"user_{rng.integers(1, 1000)}"
    route_id = f"route_{rng.integers(1, 50)}"

    duration_min = rng.uniform(10, 90)
    buffer_min   = rng.uniform(0, 30)
    num_transfers = int(rng.integers(0, 3))
    rain_1h      = float(rng.choice([0.0, 0.5, 2.0], p=[0.7, 0.2, 0.1]))
    snow_1h      = float(rng.choice([0.0, 1.0], p=[0.9, 0.1]))
    wind_speed   = float(rng.uniform(0, 15))
    temp         = float(rng.uniform(-10, 35))
    event_risk   = float(rng.uniform(0.0, 1.0))

    # choose random start time for trip
    start_offset_min = int(rng.integers(0, 60 * 24))
    desired_arrival_ts = base_start + timedelta(minutes=start_offset_min)

    # schedule is earlier than deadline by buffer_min
    scheduled_arrival_ts = desired_arrival_ts - timedelta(minutes=buffer_min)

    # hidden probability function
    hour = scheduled_arrival_ts.hour
    is_weekend = scheduled_arrival_ts.weekday() >= 5

    base = 0.9
    base -= max(duration_min - 30, 0) * 0.006
    base -= num_transfers * 0.06
    if rain_1h > 0:
        base -= 0.05
    if snow_1h > 0:
        base -= 0.12
    base -= event_risk * 0.25
    base -= (abs(temp - 20) / 40) * 0.1
    if 16 <= hour <= 19:
        base -= 0.08
    prob_on_time = float(np.clip(base, 0.05, 0.99))

    on_time_flag = rng.binomial(1, prob_on_time) == 1

    # if late, actual_arrival_ts is scheduled + some delay, else <= desired
    if on_time_flag:
        delay = rng.uniform(-5, 5)  # early or slightly late
    else:
        delay = rng.uniform(5, 30)  # more noticeable delay

    actual_arrival_ts = scheduled_arrival_ts + timedelta(minutes=delay)

    cur.execute(
        """
        INSERT INTO trip_history (
            user_id, route_id,
            duration_min, buffer_min, num_transfers,
            rain_1h, snow_1h, wind_speed, temp, event_risk,
            hour, is_weekend,
            desired_arrival_ts, scheduled_arrival_ts, actual_arrival_ts,
            on_time
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            user_id, route_id,
            duration_min, buffer_min, num_transfers,
            rain_1h, snow_1h, wind_speed, temp, event_risk,
            hour, is_weekend,
            desired_arrival_ts, scheduled_arrival_ts, actual_arrival_ts,
            on_time_flag,
        ),
    )

conn.commit()
cur.close()
conn.close()
print("Inserted synthetic trip_history rows.")
