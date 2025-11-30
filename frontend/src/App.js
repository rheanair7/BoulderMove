import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  GoogleMap,
  Polyline,
  Marker,
  useJsApiLoader,
  Autocomplete,
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
  const [origin, setOrigin] = useState("norlin library");
  const [destination, setDestination] = useState("Denver, CO");
  const [stops, setStops] = useState("");
  const [mode, setMode] = useState("driving");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [showWeatherDetails, setShowWeatherDetails] = useState(true); // default to true to remove ESLint warning

  const mapRef = useRef(null);

  // --- Autocomplete refs ---
  const originAutoRef = useRef(null);
  const destAutoRef = useRef(null);
  const stopsAutoRef = useRef(null);
  
  const clearOldRoute = () => {
    setRoutes([]);   // wipe previous displayed route
  };
  /* Load Google Maps API */
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    libraries: ["places"],
  });

  /* ---------------- AUTOCOMPLETE HANDLERS ---------------- */
  const handleOriginSelect = () => {
    const place = originAutoRef.current?.getPlace();
    if (place?.formatted_address) setOrigin(place.formatted_address);
  };
  const handleDestinationSelect = () => {
    const place = destAutoRef.current?.getPlace();
    if (place?.formatted_address) setDestination(place.formatted_address);
  };
  const handleStopSelect = () => {
    const place = stopsAutoRef.current?.getPlace();
    if (place?.formatted_address) {
      setStops((prev) =>
        prev ? prev + "; " + place.formatted_address : place.formatted_address
      );
    }
  };
  
  /* ---------------- BACKEND REQUEST ---------------- */
  const fetchRoute = useCallback(async () => {
    
    if (!origin || !destination) return;
    clearOldRoute();
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
      setRoutes(
        showAlternatives ? data.routes || [] : data.routes?.slice(0, 1) || []
      );
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [origin, destination, stops, mode, showAlternatives]);

  useEffect(() => {
    const t = setTimeout(fetchRoute, 500);
    return () => clearTimeout(t);
  }, [fetchRoute]);

  /* -------- Decode Polylines ------------ */
  const decodedRoutes = routes.map((r) =>
    r.polyline ? polyline.decode(r.polyline).map(([lat, lng]) => ({ lat, lng })) : []
  );

  const buildMarkers = () => {
    if (routes.length === 0) return [];
    const r = routes[0];
    const markers = [];
    if (r.start_location) markers.push({ position: r.start_location });
    if (r.waypoint_locations)
      r.waypoint_locations.forEach((wp) => markers.push({ position: wp }));
    if (r.end_location) markers.push({ position: r.end_location });
    return markers;
  };

  /* Fit map to bounds */
  useEffect(() => {
    if (!isLoaded || !mapRef.current || decodedRoutes.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    decodedRoutes.forEach((path) => path.forEach((p) => bounds.extend(p)));
    mapRef.current.fitBounds(bounds);
  }, [decodedRoutes, isLoaded]);

  /* ---------------- SIMULATE EVENT ---------------- */
  const simulateEvent = () => {
    const simulatedEvent = {
      title: "Simulated Test Event 🚨",
      url: "https://ticketmaster.com",
      start_time: new Date().toISOString(),
      distance_from_route_m: 420,
      venue: "Test Arena",
      address: "123 Test Street",
      capacity: 12000,
    };
    const updated = [...routes];
    if (!updated[0].events_nearby) updated[0].events_nearby = [];
    updated[0].events_nearby.push(simulatedEvent);
    setRoutes(updated);
    alert("⚠️ Simulated Ticketmaster event added!");
  };

  /* ---------------- UI ---------------- */
  if (!isLoaded) {
    return <div style={{ textAlign: "center", padding: "200px 0" }}>Loading map...</div>;
  }

  return (
    <div style={{ margin: "30px auto", maxWidth: "1150px", fontFamily: "Inter" }}>
      <h1 style={{ fontSize: "32px", fontWeight: 700, marginBottom: "20px" }}>
        🚌 Smart Trip Planner
      </h1>

      {/* INPUTS */}
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
        {/* ORIGIN */}
        <Autocomplete
          onLoad={(ref) => (originAutoRef.current = ref)}
          onPlaceChanged={handleOriginSelect}
        >
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Origin" style={inputStyle} />
        </Autocomplete>

        {/* STOPS */}
        <Autocomplete
          onLoad={(ref) => (stopsAutoRef.current = ref)}
          onPlaceChanged={handleStopSelect}
        >
          <input value={stops} onChange={(e) => setStops(e.target.value)} placeholder="Stops — semicolon separated" style={inputStyleLarge} />
        </Autocomplete>

        {/* DESTINATION */}
        <Autocomplete
          onLoad={(ref) => (destAutoRef.current = ref)}
          onPlaceChanged={handleDestinationSelect}
        >
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination" style={inputStyle} />
        </Autocomplete>

        <select value={mode} onChange={(e) => setMode(e.target.value)} style={selectStyle}>
          <option value="driving">🚗 Driving</option>
          <option value="walking">🚶 Walking</option>
          <option value="bicycling">🚴 Bicycling</option>
          <option value="transit">🚌 Transit</option>
        </select>

        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <input type="checkbox" checked={showAlternatives} onChange={(e) => setShowAlternatives(e.target.checked)} />
          Show alternative routes
        </label>
      </div>

      {/* SIMULATE EVENT BUTTON */}
      <button
        onClick={simulateEvent}
        style={{
          marginBottom: "12px",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid #ccc",
          background: "#fff3cd",
          cursor: "pointer",
        }}
      >
        Simulate Ticketmaster Event
      </button>

      {/* MAP */}
      <div style={mapContainerStyle}>
        <GoogleMap
          key={origin + destination + stops + mode + showAlternatives}
          onLoad={(map) => (mapRef.current = map)}
          zoom={10}
          center={{ lat: 39.5, lng: -98.35 }}
          mapContainerStyle={{ width: "100%", height: "100%" }}
          options={mapOptions}
        >
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
          {buildMarkers().map((m, index) => (
            <Marker key={index} position={m.position} label={String.fromCharCode(65 + index)} />
          ))}
        </GoogleMap>
      </div>

      {/* ROUTE + WEATHER + EVENTS */}
      {routes.length > 0 && (
        <div style={{ marginTop: "20px", fontSize: "16px" }}>
          <button
            onClick={() => setShowWeatherDetails((prev) => !prev)}
            style={{
              marginBottom: "12px",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              background: "#f7f7f7",
              cursor: "pointer",
            }}
          >
            {showWeatherDetails ? "Hide today's weather" : "Show today's weather"}
          </button>

          {routes.map((r, i) => (
            <div
              key={i}
              style={{
                marginBottom: "12px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #ddd",
                background: "#fafafa",
              }}
            >
              <b style={{ color: ["#4285F4", "#FF6347", "#2ECC71", "#8E44AD"][i % 4] }}>
                Route {String.fromCharCode(65 + i)} — {r.summary}
              </b>

              <div>{r.duration_min} min • {r.distance_km} km</div>
              <div style={{ color: "#666" }}>Stops: {r.stops?.join(" → ") || "None"}</div>
              <div style={{ color: "#666" }}>Mode: {mode}</div>

              {/* Weather */}
              {showWeatherDetails && r.weather && (
                <div style={{ marginTop: "6px", fontSize: "14px", color: "#444" }}>
                  <strong>Weather today:</strong> {r.weather.temp} °C, {r.weather.weather_main} ({r.weather.weather_desc})
                </div>
              )}

              {/* Alerts */}
              {r.alerts && renderAlerts(r.alerts.custom_alerts)}

              {/* Events */}
              {renderEvents(r.events_nearby)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------- Alerts helper -------- */
const severityColors = {
  high: "#ffe5e5",
  medium: "#fff5d6",
  low: "#e5ffe5",
};
const renderAlerts = (alerts) => {
  if (!alerts || alerts.length === 0) {
    return <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>No weather alerts for this route.</div>;
  }
  return alerts.map((a, idx) => (
    <div key={idx} style={{ marginTop: "6px", padding: "8px 10px", borderRadius: "8px", border: "1px solid #ddd", backgroundColor: severityColors[a.severity] || "#f5f5f5" }}>
      <strong>{a.title}</strong>
      <div style={{ fontSize: "14px", marginTop: "2px" }}>{a.message}</div>
      <div style={{ fontSize: "12px", color: "#777", marginTop: "2px" }}>Severity: {a.severity}</div>
    </div>
  ));
};

/* -------- EVENTS (Ticketmaster version) -------- */
const renderEvents = (events) => {
  if (!events || events.length === 0) {
    return <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>No events near this route.</div>;
  }
  return events.map((e, idx) => (
    <div key={idx} style={{ marginTop: "10px", padding: "12px", borderRadius: "10px", border: "1px solid #cce0ff", backgroundColor: "#f0f6ff" }}>
      <strong style={{ fontSize: "17px", color: "#0055cc" }}>{e.title}</strong>
      {e.url && (
        <div style={{ marginTop: "4px" }}>
          <a href={e.url} target="_blank" rel="noreferrer" style={{ color: "#0066ff", textDecoration: "underline" }}>View Event →</a>
        </div>
      )}
      {e.start_time && <div style={{ marginTop: "4px", fontSize: "14px", color: "#444" }}>{new Date(e.start_time).toLocaleString()}</div>}
      {e.distance_from_route_m && <div style={{ fontSize: "13px", color: "#777", marginTop: "3px" }}>{Math.round(e.distance_from_route_m)} m from route</div>}
      {e.venue && <div style={{ fontSize: "13px", color: "#555", marginTop: "3px" }}>Venue: {e.venue}</div>}
      {e.capacity && <div style={{ fontSize: "13px", color: "#333", marginTop: "3px" }}>Capacity: {e.capacity.toLocaleString()}</div>}
      {e.address && <div style={{ fontSize: "12px", color: "#666", marginTop: "4px", fontStyle: "italic" }}>{e.address}</div>}
    </div>
  ));
};

/* -------- Shared Styles -------- */
const inputStyle = { flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #ccc" };
const inputStyleLarge = { flex: 2, padding: "12px", borderRadius: "8px", border: "1px solid #ccc" };
const selectStyle = { padding: "12px", borderRadius: "8px", border: "1px solid #ccc", minWidth: "150px" };
