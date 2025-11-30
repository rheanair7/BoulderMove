import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  GoogleMap,
  Polyline,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import polyline from "@mapbox/polyline";

/* ---------------- MAP STYLE ---------------- */
const mapContainerStyle = {
  width: "100%",
  height: "520px",
  borderRadius: "14px",
  boxShadow: "0 3px 12px rgba(0,0,0,0.20)",
  overflow: "hidden",
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  fullscreenControl: true,
  mapTypeControl: false,
};

/* -------- Shared Styles for layout -------- */
const topBarStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 24px",
  background: "white",
  borderBottom: "1px solid #e2e2e7",
};

const mainLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "320px 1.5fr 1fr",
  gap: "16px",
  padding: "16px 24px",
};

const leftPanelStyle = {
  background: "white",
  borderRadius: "12px",
  padding: "16px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const centerPanelStyle = {
  background: "white",
  borderRadius: "12px",
  padding: "8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const rightPanelStyle = {
  background: "white",
  borderRadius: "12px",
  padding: "16px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  maxHeight: "600px",
  overflowY: "auto",
};

const bottomStripStyle = {
  marginTop: "8px",
  padding: "8px 24px 18px",
  fontSize: "14px",
  color: "#555",
};

const chipStyle = {
  fontSize: "12px",
  padding: "4px 10px",
  borderRadius: "999px",
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
};

/* -------- severity colors for alerts -------- */
const severityColors = {
  high: "#ffe5e5",
  medium: "#fff5d6",
  low: "#e5ffe5",
};

/* ---------------- MAIN COMPONENT ---------------- */
export default function App() {
  // 🔹 Landing page state
  const [showLanding, setShowLanding] = useState(true);
  const [landingFadeOut, setLandingFadeOut] = useState(false);

  const hideLanding = () => {
    setLandingFadeOut(true);
    setTimeout(() => setShowLanding(false), 600); // match fade duration
  };

  useEffect(() => {
    const t = setTimeout(hideLanding, 2800); // auto-hide after ~2.8s
    return () => clearTimeout(t);
  }, []);

  // 🔹 Existing app state
  const [origin, setOrigin] = useState("norlin library");
  const [destination, setDestination] = useState("Denver, CO");
  const [stops, setStops] = useState(""); // semicolon-separated
  const [mode, setMode] = useState("driving");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [showWeatherDetails, setShowWeatherDetails] = useState(false);

  const mapRef = useRef(null);

  /* Load Google Maps API */
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
  });

  /* ---------------- BACKEND REQUEST ---------------- */
  const fetchRoute = useCallback(async () => {
    if (!origin || !destination) return;

    const url = `http://127.0.0.1:8000/plan?origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(
      destination
    )}&stops=${encodeURIComponent(stops)}&mode=${encodeURIComponent(
      mode
    )}&alternatives=${showAlternatives}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      console.log("[DEBUG] Response:", data);

      setRoutes(
        showAlternatives ? data.routes || [] : data.routes?.slice(0, 1) || []
      );
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [origin, destination, stops, mode, showAlternatives]);

  /* Debounce input changes */
  useEffect(() => {
    const t = setTimeout(fetchRoute, 500);
    return () => clearTimeout(t);
  }, [fetchRoute]);

  /* -------- Decode Polylines ------------ */
  const decodedRoutes = routes.map((r) =>
    r.polyline
      ? polyline.decode(r.polyline).map(([lat, lng]) => ({ lat, lng }))
      : []
  );

  /* -------- BUILD MARKERS ORDERED A → B → C... -------- */
  const buildMarkers = () => {
    if (routes.length === 0) return [];

    const r = routes[0];
    const markers = [];

    if (r.start_location) {
      markers.push({ position: r.start_location });
    }
    if (r.waypoint_locations) {
      r.waypoint_locations.forEach((wp) => markers.push({ position: wp }));
    }
    if (r.end_location) {
      markers.push({ position: r.end_location });
    }

    return markers;
  };

  /* Fit map to bounds */
  useEffect(() => {
    if (!isLoaded || !mapRef.current || decodedRoutes.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    decodedRoutes.forEach((path) => path.forEach((p) => bounds.extend(p)));
    mapRef.current.fitBounds(bounds);
  }, [decodedRoutes, isLoaded]);

  /* ---------------- UI ---------------- */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f8",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* FULL-SCREEN LANDING OVERLAY */}
      {showLanding && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(circle at top, #fdfbfb 0, #ebedee 40%, #dfe7fd 100%)",
            opacity: landingFadeOut ? 0 : 1,
            transform: landingFadeOut ? "scale(1.02)" : "scale(1)",
            transition: "opacity 600ms ease, transform 600ms ease",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.95)",
              borderRadius: "20px",
              padding: "32px 40px",
              boxShadow: "0 18px 60px rgba(15,23,42,0.18)",
              maxWidth: "540px",
              width: "90%",
              display: "flex",
              gap: 24,
              alignItems: "center",
            }}
          >
            <div style={{ width: 96, height: 96 }}>
              <DotLottieReact
                src="https://lottie.host/5a79cff1-423a-4aa6-824f-954dca862994/ezy8pcAi40.lottie"
                loop
                autoplay
                style={{ width: "96px", height: "96px" }}
              />
            </div>

            <div>
              <h1
                style={{
                  margin: "0 0 8px",
                  fontSize: "32px",
                  fontWeight: 700,
                }}
              >
                BoulderMove
              </h1>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "15px",
                  color: "#4b5563",
                }}
              >
                Smart, weather-aware trip planning for Boulder and beyond.
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  fontSize: "13px",
                  marginBottom: 16,
                  color: "#4b5563",
                }}
              >
                <span>🚌 Transit + 🚶 walking</span>
                <span>☁️ Live weather context</span>
                <span>📊 Route insights</span>
              </div>

              <button
                onClick={hideLanding}
                style={{
                  padding: "10px 18px",
                  borderRadius: "999px",
                  border: "none",
                  background:
                    "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 10px 30px rgba(37,99,235,0.35)",
                }}
              >
                Enter BoulderMove
              </button>

              <div
                style={{
                  marginTop: 8,
                  fontSize: "12px",
                  color: "#6b7280",
                }}
              >
                Auto-launching in a few seconds…
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN APP CONTENT */}
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          filter: showLanding ? "blur(3px)" : "none",
          transition: "filter 400ms ease",
        }}
      >
        {/* TOP BAR */}
        <header style={topBarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40 }}>
              <DotLottieReact
                src="https://lottie.host/5a79cff1-423a-4aa6-824f-954dca862994/ezy8pcAi40.lottie"
                loop
                autoplay
                style={{ width: "40px", height: "40px" }}
              />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              BoulderMove – Smart Trip Dashboard
            </div>
          </div>

          <div style={{ fontSize: 14, color: "#666" }}>
            {new Date().toLocaleString()}
          </div>
        </header>

        {/* MAIN GRID */}
        <main style={mainLayoutStyle}>
          {/* LEFT PANEL – controls */}
          <section style={leftPanelStyle}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Trip setup
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Origin"
                style={inputStyle}
              />

              <input
                value={stops}
                onChange={(e) => setStops(e.target.value)}
                placeholder="Stops — use semicolon (;) to separate"
                style={inputStyle}
              />

              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Destination"
                style={inputStyle}
              />

              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={selectStyle}
              >
                <option value="driving">🚗 Driving</option>
                <option value="walking">🚶 Walking</option>
                <option value="bicycling">🚴 Bicycling</option>
                <option value="transit">🚌 Transit</option>
              </select>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={showAlternatives}
                  onChange={(e) => setShowAlternatives(e.target.checked)}
                />
                Show alternative routes
              </label>

              <button
                onClick={() => setShowWeatherDetails((prev) => !prev)}
                style={{
                  marginTop: "4px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {showWeatherDetails
                  ? "Hide today’s weather"
                  : "Show today’s weather"}
              </button>
            </div>
          </section>

          {/* CENTER PANEL – map */}
          <section style={centerPanelStyle}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
              Map view
            </div>
            <div style={mapContainerStyle}>
              {isLoaded ? (
                <GoogleMap
                  key={
                    origin + destination + stops + mode + showAlternatives
                  }
                  onLoad={(map) => (mapRef.current = map)}
                  zoom={10}
                  center={{ lat: 39.5, lng: -98.35 }}
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  options={mapOptions}
                >
                  {/* ROUTES */}
                  {decodedRoutes.map((path, i) => (
                    <Polyline
                      key={i}
                      path={path}
                      options={{
                        strokeColor: [
                          "#4285F4",
                          "#FF6347",
                          "#2ECC71",
                          "#8E44AD",
                        ][i % 4],
                        strokeWeight: i === 0 ? 6 : 4,
                        strokeOpacity: i === 0 ? 1 : 0.7,
                      }}
                    />
                  ))}

                  {buildMarkers().map((m, index) => (
                    <Marker
                      key={index}
                      position={m.position}
                      label={String.fromCharCode(65 + index)} // A, B, C, D
                    />
                  ))}
                </GoogleMap>
              ) : (
                <div style={{ textAlign: "center", padding: "200px 0" }}>
                  Loading map...
                </div>
              )}
            </div>
          </section>

          {/* RIGHT PANEL – route insights */}
          <section style={rightPanelStyle}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Route options
            </h2>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button style={chipStyle}>Best on-time</button>
              <button style={chipStyle}>Shortest</button>
              <button style={chipStyle}>Fewest transfers</button>
            </div>

            {routes.length === 0 ? (
              <div style={{ fontSize: 13, color: "#777" }}>
                Enter origin and destination to see route suggestions.
              </div>
            ) : (
              routes.map((r, i) => (
                <RouteCard
                  key={i}
                  route={r}
                  index={i}
                  mode={mode}
                  showWeatherDetails={showWeatherDetails}
                />
              ))
            )}
          </section>
        </main>

        {/* BOTTOM SUMMARY */}
        <footer style={bottomStripStyle}>
          {routes.length > 0 ? (
            <>
              <strong>Summary:</strong> Fastest route is{" "}
              {routes[0].duration_min} min and {routes[0].distance_km} km.{" "}
              {routes[0].weather && (
                <>
                  Current weather at origin: {routes[0].weather.temp} °C,{" "}
                  {routes[0].weather.weather_main}.
                </>
              )}
            </>
          ) : (
            <>Ready when you are — set up a trip to see predictions.</>
          )}
        </footer>
      </div>
    </div>
  );
}

function RouteCard({ route, index, mode, showWeatherDetails }) {
  const label = String.fromCharCode(65 + index);
  const color = ["#4285F4", "#FF6347", "#2ECC71", "#8E44AD"][index % 4];

  // figure out icon
  let icon = "🌤️";
  if (route.weather && route.weather.weather_main) {
    const main = route.weather.weather_main.toLowerCase();
    if (main.includes("rain")) icon = "🌧️";
    else if (main.includes("snow")) icon = "❄️";
    else if (main.includes("storm") || main.includes("thunder")) icon = "⛈️";
    else if (main.includes("cloud")) icon = "☁️";
    else if (main.includes("clear")) icon = "☀️";
  }

  // impact level from alerts
  const alerts = route.alerts?.custom_alerts || [];
  let impactLevel = "low";
  if (alerts.some((a) => a.severity === "high")) impactLevel = "high";
  else if (alerts.some((a) => a.severity === "medium")) impactLevel = "medium";

  const impactLabel =
    impactLevel === "high"
      ? "High impact"
      : impactLevel === "medium"
      ? "Moderate impact"
      : "Low impact";

  return (
    <div
      style={{
        marginBottom: "8px",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px solid #ddd",
        background: "#fafafa",
        fontSize: "14px",
      }}
    >
      {/* Route basics */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <b style={{ color }}>
          Route {label} — {route.summary}
        </b>
      </div>

      <div>
        {route.duration_min} min • {route.distance_km} km
      </div>
      <div style={{ color: "#666" }}>
        Stops: {route.stops?.join(" → ") || "None"}
      </div>
      <div style={{ color: "#666" }}>Mode: {mode}</div>

      {/* Weather card */}
      {showWeatherDetails && (
        <>
          {route.weather ? (
            <div className="weather-card">
              <div className="weather-card-header">
                <div className="weather-main">
                  <span className="weather-icon">{icon}</span>
                  <div>
                    <div className="weather-main-title">
                      {route.weather.temp} °C · {route.weather.weather_main}
                    </div>
                    <div className="weather-main-sub">
                      {route.weather.weather_desc}
                    </div>
                  </div>
                </div>
                <span className={"impact-badge impact-" + impactLevel}>
                  {impactLabel}
                </span>
              </div>

              {/* Row 1: temp / humidity / wind */}
              <div className="weather-metrics-row">
                <div className="weather-metric">
                  <span className="weather-metric-emoji">🌡️</span>
                  <span>{route.weather.feels_like} °C feels like</span>
                </div>

                <div className="weather-metric">
                  <span className="weather-metric-emoji">💧</span>
                  <span>{route.weather.humidity}% humidity</span>
                </div>

                <div className="weather-metric">
                  <span className="weather-metric-emoji">🌬️</span>
                  <span>{route.weather.wind_speed} m/s wind</span>
                </div>
              </div>

              {/* Row 2: rain / snow */}
              <div className="weather-metrics-row">
                <div className="weather-metric">
                  <span className="weather-metric-emoji">🌧️</span>
                  <span>{route.weather.rain_1h ?? 0} mm rain (last hour)</span>
                </div>

                <div className="weather-metric">
                  <span className="weather-metric-emoji">❄️</span>
                  <span>{route.weather.snow_1h ?? 0} mm snow (last hour)</span>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: "6px",
                fontSize: "13px",
                color: "#555",
              }}
            >
              Weather data unavailable for this route.
            </div>
          )}
        </>
      )}

      {/* Alerts */}
      {route.alerts && renderAlerts(route.alerts.custom_alerts)}
    </div>
  );
}

/* -------- Alerts helper -------- */
const renderAlerts = (alerts) => {
  if (!alerts || alerts.length === 0) {
    return (
      <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
        No weather alerts for this route.
      </div>
    );
  }

  return alerts.map((a, idx) => (
    <div
      key={idx}
      style={{
        marginTop: "6px",
        padding: "8px 10px",
        borderRadius: "8px",
        border: "1px solid #ddd",
        backgroundColor: severityColors[a.severity] || "#f5f5f5",
        fontSize: "13px",
      }}
    >
      <strong>{a.title}</strong>
      <div style={{ marginTop: "2px" }}>{a.message}</div>
      <div
        style={{
          fontSize: "12px",
          color: "#777",
          marginTop: "2px",
        }}
      >
        Severity: {a.severity}
      </div>
    </div>
  ));
};

/* -------- Shared input/select Styles -------- */
const inputStyle = {
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  fontSize: "14px",
};

const selectStyle = {
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  minWidth: "150px",
  fontSize: "14px",
};
