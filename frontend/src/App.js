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

/* ---------------- MAIN COMPONENT ---------------- */
export default function App() {
  const [origin, setOrigin] = useState("Boca Raton, FL");
  const [destination, setDestination] = useState("Denver, CO");
  const [stops, setStops] = useState(""); // semicolon-separated
  const [mode, setMode] = useState("driving");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [routes, setRoutes] = useState([]);

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
    const legs = routes[0].legs || [];
    if (legs.length === 0) return [];

    const markers = [];

    // A = origin
    markers.push({
      position: {
        lat: legs[0].start_location.lat,
        lng: legs[0].start_location.lng,
      },
    });

    // B, C, D ... = stops + destination
    for (let i = 0; i < legs.length; i++) {
      markers.push({
        position: {
          lat: legs[i].end_location.lat,
          lng: legs[i].end_location.lng,
        },
      });
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
    <div style={{ margin: "30px auto", maxWidth: "1150px", fontFamily: "Inter" }}>
      <h1 style={{ fontSize: "32px", fontWeight: 700, marginBottom: "20px" }}>
        🧭 Smart Trip Planner
      </h1>

      {/* INPUT CARD */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          padding: "18px",
          background: "white",
          borderRadius: "14px",
          boxShadow: "0 3px 12px rgba(0,0,0,0.10)",
          marginBottom: "20px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
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
          style={inputStyleLarge}
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

        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <input
            type="checkbox"
            checked={showAlternatives}
            onChange={(e) => setShowAlternatives(e.target.checked)}
          />
          Show alternative routes
        </label>
      </div>

      {/* MAP */}
      <div style={mapContainerStyle}>
        {isLoaded ? (
          <GoogleMap
            key={origin + destination + stops + mode + showAlternatives}
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
                  strokeColor: ["#4285F4", "#FF6347", "#2ECC71", "#8E44AD"][i % 4],
                  strokeWeight: i === 0 ? 6 : 4,
                  strokeOpacity: i === 0 ? 1 : 0.7,
                }}
              />
            ))}

            {/* A → B → C → ... Markers */}
            {buildMarkers().map((m, index) => (
              <Marker
                key={index}
                position={m.position}
                label={String.fromCharCode(65 + index)}
              />
            ))}
          </GoogleMap>
        ) : (
          <div style={{ textAlign: "center", padding: "200px 0" }}>
            Loading map...
          </div>
        )}
      </div>

      {/* ROUTE SUMMARY */}
      {routes.length > 0 && (
        <div style={{ marginTop: "20px", fontSize: "16px" }}>
          {routes.map((r, i) => (
            <div key={i} style={{ marginBottom: "12px" }}>
              <b style={{ color: ["#4285F4", "#FF6347", "#2ECC71", "#8E44AD"][i % 4] }}>
                Route {String.fromCharCode(65 + i)} — {r.summary}
              </b>
              <div>{r.duration_min} min • {r.distance_km} km</div>
              <div style={{ color: "#666" }}>Stops: {r.stops?.join(" → ") || "None"}</div>
              <div style={{ color: "#666" }}>Mode: {mode}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------- Shared Styles -------- */
const inputStyle = {
  flex: 1,
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #ccc",
};

const inputStyleLarge = {
  flex: 2,
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #ccc",
};

const selectStyle = {
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  minWidth: "150px",
};
