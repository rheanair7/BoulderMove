# train_on_time_model.py
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction import DictVectorizer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
import joblib

# 1. Load data
df = pd.read_csv("trip_history.csv")

# 2. Label: on time within 5 minutes
df["on_time"] = (df["arrival_delay_min"] <= 5).astype(int)

feature_cols = [
    "duration_min",
    "distance_km",
    "mode",
    "num_legs",
    "hour",
    "dayofweek",
    "temp",
    "wind_speed",
    "rain_1h",
    "snow_1h",
    "weather_main",
    "alert_high_count",
    "alert_medium_count",
    "alert_low_count",
    "event_count",
    "big_event_count",
    "avg_event_distance_m",
    "min_event_distance_m",
]

X_dict = df[feature_cols].to_dict(orient="records")
y = df["on_time"].values

X_train, X_test, y_train, y_test = train_test_split(
    X_dict, y, test_size=0.2, random_state=42, stratify=y
)

# 3. Pipeline: DictVectorizer + RandomForest
pipe = Pipeline(
    steps=[
        ("vec", DictVectorizer(sparse=False)),
        (
            "model",
            RandomForestClassifier(
                n_estimators=300,
                max_depth=12,
                random_state=42,
                class_weight="balanced_subsample",
            ),
        ),
    ]
)

pipe.fit(X_train, y_train)

# 4. Quick evaluation
y_pred = pipe.predict(X_test)
y_proba = pipe.predict_proba(X_test)[:, 1]

print(classification_report(y_test, y_pred))
print("ROC AUC:", roc_auc_score(y_test, y_proba))

# 5. Save trained pipeline
joblib.dump(pipe, "on_time_model.pkl")
print("Saved model to on_time_model.pkl")
