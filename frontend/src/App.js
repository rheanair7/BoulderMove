import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  GoogleMap,
  Polyline,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { Autocomplete } from "@react-google-maps/api";
import polyline from "@mapbox/polyline";
import "./App.css";

// eslint-disable-next-line no-unused-vars
function makeFakeRoute(origin, destination) {
  const points = [];

  const lat1 = origin.lat;
  const lon1 = origin.lon;
  const lat2 = destination.lat;
  const lon2 = destination.lon;

  const steps = 8; // number of bends/segments

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Base interpolation
    let lat = lat1 * (1 - t) + lat2 * t;
    let lon = lon1 * (1 - t) + lon2 * t;

    // Add turns & wiggles
    const wiggle = 0.002 * Math.sin(t * Math.PI * 3);   // 3 waves
    const offset = 0.0015 * Math.cos(t * Math.PI * 2);  // 2 offsets

    lat += wiggle;
    lon += offset;

    points.push({ lat, lng: lon });
  }

  return points;
}
 

const GOOGLE_MAP_LIBRARIES = ["places"];

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

/* -------- Shared Layout Styles (dark-mode aware) -------- */
const topBarStyle = (darkMode) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 24px",
  background: darkMode ? "#111827" : "white",
  color: darkMode ? "#e5e7eb" : "#111827",
  borderBottom: darkMode ? "1px solid #374151" : "1px solid #e2e2e7",
});

const mainLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "320px 1.5fr 1fr",
  gap: "16px",
  padding: "16px 24px",
};

const leftPanelStyle = (darkMode) => ({
  background: darkMode ? "#111827" : "white",
  color: darkMode ? "#e5e7eb" : "#111827",
  borderRadius: "12px",
  padding: "16px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
});

const centerPanelStyle = (darkMode) => ({
  background: darkMode ? "#111827" : "white",
  color: darkMode ? "#e5e7eb" : "#111827",
  borderRadius: "12px",
  padding: "8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
});

const rightPanelStyle = (darkMode) => ({
  background: darkMode ? "#111827" : "white",
  color: darkMode ? "#e5e7eb" : "#111827",
  borderRadius: "12px",
  padding: "16px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  maxHeight: "600px",
  overflowY: "auto",
});

const bottomStripStyle = (darkMode) => ({
  marginTop: "8px",
  padding: "8px 24px 18px",
  fontSize: "14px",
  color: darkMode ? "#d1d5db" : "#555",
});

/* Chip buttons */
const chipStyle = (darkMode) => ({
  fontSize: "12px",
  padding: "4px 10px",
  borderRadius: "999px",
  border: darkMode ? "1px solid #4b5563" : "1px solid #ddd",
  background: darkMode ? "#1f2937" : "white",
  color: darkMode ? "#e5e7eb" : "#111827",
  cursor: "pointer",
});

/* Input styles */
const inputStyle = (darkMode) => ({
  padding: "10px",
  borderRadius: "8px",
  border: darkMode ? "1px solid #4b5563" : "1px solid #ccc",
  fontSize: "14px",
  background: darkMode ? "#111827" : "white",
  color: darkMode ? "#e5e7eb" : "#111827",
});

const inputStyleLarge = (darkMode) => ({
  flex: 2,
  padding: "12px",
  borderRadius: "8px",
  border: darkMode ? "1px solid #4b5563" : "1px solid #ccc",
  background: darkMode ? "#111827" : "white",
  color: darkMode ? "#e5e7eb" : "#111827",
});

const selectStyle = (darkMode) => ({
  padding: "10px",
  borderRadius: "8px",
  border: darkMode ? "1px solid #4b5563" : "1px solid #ccc",
  minWidth: "150px",
  fontSize: "14px",
  background: darkMode ? "#111827" : "white",
  color: darkMode ? "#e5e7eb" : "#111827",
});

/* ---------------- MAIN COMPONENT ---------------- */
export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [landingFadeOut, setLandingFadeOut] = useState(false);

  const hideLanding = () => {
    setLandingFadeOut(true);
    setTimeout(() => setShowLanding(false), 600);
  };

  useEffect(() => {
    const t = setTimeout(hideLanding, 2800);
    return () => clearTimeout(t);
  }, []);

  const [origin, setOrigin] = useState("norlin library");
  const [destination, setDestination] = useState("Denver, CO");
  const [stops, setStops] = useState("");
  const [mode, setMode] = useState("driving");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [showWeatherDetails, setShowWeatherDetails] = useState(false);
  const [originCoords, setOriginCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);

  const mapRef = useRef(null);
  const originAutoRef = useRef(null);
  const destAutoRef = useRef(null);
  const stopsAutoRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState(null);
  const clearOldRoute = () => setRoutes([]);

  /* Load Google Maps API */
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAP_LIBRARIES,
  });

  /* ---------------- AUTOCOMPLETE HANDLERS ---------------- */
  const handleOriginSelect = () => {
    const place = originAutoRef.current?.getPlace();
    if (!place) return;

    if (place.formatted_address) setOrigin(place.formatted_address);
    setRoutes([]);

    if (place.geometry?.location) {
      const loc = place.geometry.location;
      setOriginCoords({ lat: loc.lat(), lon: loc.lng() });
    }
  };

  const handleDestinationSelect = () => {
    const place = destAutoRef.current?.getPlace();
    if (!place) return;

    if (place.formatted_address) setDestination(place.formatted_address);
    setRoutes([]);

    if (place.geometry?.location) {
      const loc = place.geometry.location;
      setDestinationCoords({ lat: loc.lat(), lon: loc.lng() });
    }
  };

  const handleStopSelect = () => {
    const place = stopsAutoRef.current?.getPlace();
    if (place?.formatted_address) {
      setStops((prev) =>
        prev ? prev + "; " + place.formatted_address : place.formatted_address
      );
    }
  };

  /* ---------------- GOOGLE DIRECTIONS VIA BACKEND PROXY (NON-TRANSIT) ---------------- */
  /* ---------------- GOOGLE DIRECTIONS VIA BACKEND PROXY (NON-TRANSIT) ---------------- */
const fetchGoogleRoute = useCallback(async () => {
  if (!originCoords || !destinationCoords) return;
  if (mode === "transit") return; // safety

  const baseUrl = process.env.REACT_APP_COMBINED_ROUTER_URL;
  if (!baseUrl) {
    console.error("REACT_APP_COMBINED_ROUTER_URL is not set");
    return;
  }

  const params = new URLSearchParams({
    origin: `${originCoords.lat},${originCoords.lon}`,
    destination: `${destinationCoords.lat},${destinationCoords.lon}`,
    mode,
    alternatives: showAlternatives ? "true" : "false",
    ...(stops.trim() ? { waypoints: stops.trim() } : {}),
  });

  try {
    const res = await fetch(`${baseUrl}/google_directions?${params.toString()}`);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      console.warn("No routes from google_directions proxy");
      setRoutes([]);
      return;
    }

    const mappedRoutes = data.routes.map((route) => {
    const leg = route.legs[0];

    const pts = polyline
        .decode(route.overview_polyline.points)
        .map(([lat, lng]) => ({ lat, lng }));
      

    // intermediate waypoint locations from legs (all legs except the last)
    const waypointLocs = route.legs.slice(0, -1).map((l) => ({
      lat: l.end_location.lat,
      lng: l.end_location.lng,
    }));

    return {
        summary: route.summary || `${mode} route`,
        duration_min: leg.duration?.value / 60 || null,
        distance_km: leg.distance?.value / 1000 || null,
        polylineCoords: pts,

        start_location: { lat: data.origin_lat, lng: data.origin_lon },
        end_location:   { lat: data.destination_lat, lng: data.destination_lon },
        waypoint_locations: waypointLocs,

        weather: data.weather || null,
        alerts: { custom_alerts: data.weather?.custom_alerts || [] },
        events_nearby: data.events_nearby || [],
        stops: data.waypoint_names || [],
        on_time_probability: data.on_time_probability ?? null,
        expected_delay_min: data.expected_delay_min ?? null,
        ml_features_used: data.ml_features_used ?? null,
    };
    });

    setRoutes(mappedRoutes);
  } catch (err) {
    console.error("Proxy google_directions fetch failed:", err);
  }
}, [originCoords, destinationCoords, mode, showAlternatives, stops]);
             
  /* ---------------- TRANSIT BACKEND REQUEST ---------------- */
  const fetchTransitRoute = useCallback(async () => {
    if (mode !== "transit") return;
    if (!originCoords || !destinationCoords) return;

    clearOldRoute();

    const body = {
      origin: { lat: originCoords.lat, lon: originCoords.lon },
      destination: { lat: destinationCoords.lat, lon: destinationCoords.lon },
      depart_at: new Date().toISOString(),
    };

    const url = `${process.env.REACT_APP_COMBINED_ROUTER_URL}/plan_transit_full`;

    console.log("DEBUG: ➜ Transit fetch STARTED");
    console.log("DEBUG: URL →", url);
    console.log("DEBUG: Sending →", body);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.error) {
        console.log("Backend error:", data.error);
        alert(data.error);
        return;
      }

      console.log("DEBUG: Response →", data);

      const routeObj = {
        summary:
          data.transit?.legs?.length > 0
            ? `Transit via ${
                data.transit.legs[0].route_id || data.transit.legs[0].trip_id
              }`
             : "Walk -> Transit  -> Walk",
        duration_min: null,
        distance_km: null,
        polylineCoords: (data.geometry || []).map((p) => ({ lat: p.lat, lng: p.lon })),
        start_location: {
          lat: body.origin.lat,
          lng: body.origin.lon,
        },
        end_location: {
          lat: body.destination.lat,
          lng: body.destination.lon,
        },
        stops:
          data.transit?.legs?.flatMap((l) => l.stop_names || l.intermediate_stops || []) || [],
        weather: data.weather || null,
        alerts: { custom_alerts: data.weather?.custom_alerts || [] },
        events_nearby: data.events_nearby || [],
        transit_raw: data,
        on_time_probability: data.on_time_probability,
        expected_delay_min: data.expected_delay_min,
        ml_features_used: data.ml_features_used ?? null,
        on_time: data.on_time,
      };

      setRoutes([routeObj]);
    } catch (err) {
      console.error("Transit fetch error:", err);
    }
  }, [mode, originCoords, destinationCoords]);

  /* Manual plan trigger */
  const handlePlanTrip = async () => {
    if (!originCoords || !destinationCoords) return;
    setRoutes([]);
    setSortBy(null);
    setLoading(true);
    try {
      if (mode === "transit") {
        await fetchTransitRoute();
      } else {
        await fetchGoogleRoute();
      }
    } finally {
      setLoading(false);
    }
  };

  /* -------- Sort routes by selected filter -------- */
  const sortedRoutes = [...routes].sort((a, b) => {
    if (sortBy === "ontime") {
      return (b.on_time_probability ?? 0) - (a.on_time_probability ?? 0);
    }
    if (sortBy === "shortest") {
      return (a.duration_min ?? 0) - (b.duration_min ?? 0);
    }
    if (sortBy === "transfers") {
      const aT = a.transit_raw?.transit ? Math.max(0, a.transit_raw.transit.length - 1) : 0;
      const bT = b.transit_raw?.transit ? Math.max(0, b.transit_raw.transit.length - 1) : 0;
      return aT - bT;
    }
    return 0;
  });

  /* -------- Decode Polylines or use custom coords -------- */
  const decodedRoutes = sortedRoutes.map((r) => {
    if (r.polylineCoords && r.polylineCoords.length > 0) {
      return r.polylineCoords;
    }
    if (r.polyline) {
      return polyline.decode(r.polyline).map(([lat, lng]) => ({ lat, lng }));
    }
    return [];
  });

  /* -------- Build route markers -------- */
  const buildMarkers = () => {
    if (sortedRoutes.length === 0) return [];

    const r = sortedRoutes[0];
    const markers = [];

    if (r.start_location) markers.push({ position: r.start_location, type: "endpoint" });
    if (r.waypoint_locations)
      r.waypoint_locations.forEach((wp, i) =>
        markers.push({ position: wp, type: "stop", label: String(i + 1) })
      );
    if (r.end_location) markers.push({ position: r.end_location, type: "endpoint" });

    return markers;
  };

  /* -------- Fit map to route -------- */
  useEffect(() => {
    if (!isLoaded || !mapRef.current || decodedRoutes.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    decodedRoutes.forEach((path) => path.forEach((p) => bounds.extend(p)));
    mapRef.current.fitBounds(bounds);
  }, [decodedRoutes, isLoaded]);

  /* ---------------- UI ---------------- */
  if (!isLoaded) {
    return (
      <div style={{ textAlign: "center", padding: "200px 0" }}>
        Loading map...
      </div>
    );
  }

  return (
    <div
      className={darkMode ? "dark-mode" : "light-mode"}
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        background: darkMode ? "#020617" : "#f5f5f8",
        color: darkMode ? "#e5e7eb" : "#111827",
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
        <header style={topBarStyle(darkMode)}>
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

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: darkMode ? "#ddd" : "#666",
              fontSize: "14px",
            }}
          >
            {/* Dark Mode Toggle Button */}
            <button
              onClick={() => setDarkMode((prev) => !prev)}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: darkMode ? "1px solid #4b5563" : "1px solid #ccc",
                background: darkMode ? "#1f2937" : "white",
                color: darkMode ? "white" : "#333",
                cursor: "pointer",
                fontSize: "13px",
                transition: "all 0.3s ease",
              }}
            >
              {darkMode ? "🌞 Light Mode" : "🌙 Dark Mode"}
            </button>

            {/* Date-Time */}
            <span>{new Date().toLocaleString()}</span>
          </div>
        </header>

        {/* MAIN GRID */}
        <main style={mainLayoutStyle}>
          {/* LEFT PANEL – controls */}
          <section style={leftPanelStyle(darkMode)}>
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
              {/* ORIGIN */}
              <Autocomplete
                onLoad={(ref) => (originAutoRef.current = ref)}
                onPlaceChanged={handleOriginSelect}
              >
                <input
                  value={origin}
                  onChange={(e) => { setOrigin(e.target.value); setRoutes([]); setOriginCoords(null); }}
                  placeholder="Origin"
                  style={inputStyle(darkMode)}
                />
              </Autocomplete>

              {/* STOPS */}
              <Autocomplete
                onLoad={(ref) => (stopsAutoRef.current = ref)}
                onPlaceChanged={handleStopSelect}
              >
                <input
                  value={stops}
                  onChange={(e) => setStops(e.target.value)}
                  placeholder="Stops — semicolon separated"
                  style={inputStyleLarge(darkMode)}
                />
              </Autocomplete>

              {/* DESTINATION */}
              <Autocomplete
                onLoad={(ref) => (destAutoRef.current = ref)}
                onPlaceChanged={handleDestinationSelect}
              >
                <input
                  value={destination}
                  onChange={(e) => { setDestination(e.target.value); setRoutes([]); setDestinationCoords(null); }}
                  placeholder="Destination"
                  style={inputStyle(darkMode)}
                />
              </Autocomplete>

              {/* MODE SELECT */}
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={selectStyle(darkMode)}
              >
                <option value="driving">🚗 Driving</option>
                <option value="walking">🚶 Walking</option>
                <option value="bicycling">🚴 Bicycling</option>
                <option value="transit">🚌 Transit</option>
              </select>

              {/* ALTERNATIVES */}
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

              {/* WEATHER TOGGLE */}
              <button
                onClick={() => setShowWeatherDetails((prev) => !prev)}
                style={{
                  marginTop: "4px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: darkMode ? "1px solid #4b5563" : "1px solid #ccc",
                  background: darkMode ? "#1f2937" : "#f7f7f7",
                  color: darkMode ? "#e5e7eb" : "#111827",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {showWeatherDetails
                  ? "Hide today’s weather"
                  : "Show today’s weather"}
              </button>

              {/* PLAN TRIP BUTTON */}
              <button
                onClick={handlePlanTrip}
                disabled={loading || !originCoords || !destinationCoords}
                style={{
                  marginTop: "8px",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: loading || !originCoords || !destinationCoords
                    ? "#9ca3af"
                    : "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: loading || !originCoords || !destinationCoords ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
                  transition: "all 0.2s ease",
                }}
              >
                {loading ? "Planning..." : "Plan Trip"}
              </button>
            </div>
          </section>

          {/* CENTER PANEL – MAP */}
          <section style={centerPanelStyle(darkMode)}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
              Map view
            </div>
            <div style={mapContainerStyle}>
              {isLoaded ? (
                <GoogleMap
                  onLoad={(map) => (mapRef.current = map)}
                  zoom={10}
                  center={{ lat: 39.5, lng: -98.35 }}
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  options={mapOptions}
                >
                  {/* ROUTE POLYLINES */}
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

                  {/* MARKERS */}
                  {(() => {
                    const allMarkers = buildMarkers();
                    let endpointCount = 0;
                    return allMarkers.map((m, index) => {
                      if (m.type === "stop") {
                        return (
                          <Marker
                            key={index}
                            position={m.position}
                            label={{ text: m.label, color: "white", fontWeight: "bold" }}
                            icon={{
                              path: window.google.maps.SymbolPath.CIRCLE,
                              scale: 10,
                              fillColor: "#f97316",
                              fillOpacity: 1,
                              strokeColor: "white",
                              strokeWeight: 2,
                            }}
                          />
                        );
                      }
                      const letter = String.fromCharCode(65 + endpointCount++);
                      return (
                        <Marker
                          key={index}
                          position={m.position}
                          label={letter}
                        />
                      );
                    });
                  })()}
                </GoogleMap>
              ) : (
                <div style={{ textAlign: "center", padding: "200px 0" }}>
                  Loading map...
                </div>
              )}
            </div>
          </section>

          {/* RIGHT PANEL – route insights */}
          <section style={rightPanelStyle(darkMode)}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Route options
            </h2>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {[
                { key: "ontime", label: "Best on-time" },
                { key: "shortest", label: "Shortest" },
                ...(mode === "transit" ? [{ key: "transfers", label: "Fewest transfers" }] : []),
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(sortBy === key ? null : key)}
                  style={{
                    ...chipStyle(darkMode),
                    background: sortBy === key
                      ? "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)"
                      : darkMode ? "#1f2937" : "white",
                    color: sortBy === key ? "white" : darkMode ? "#e5e7eb" : "#111827",
                    border: sortBy === key ? "1px solid #2563eb" : chipStyle(darkMode).border,
                    fontWeight: sortBy === key ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ROUTE LIST */}
            {sortedRoutes.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: darkMode ? "#9ca3af" : "#777",
                }}
              >
                Enter origin and destination, then click Plan Trip.
              </div>
            ) : (
              sortedRoutes.map((r, i) => (
                <RouteCard
                  key={i}
                  route={r}
                  index={i}
                  mode={mode}
                  showWeatherDetails={showWeatherDetails}
                  darkMode={darkMode}
                  allRoutes={sortedRoutes}
                />
              ))
            )}
          </section>
        </main>

        {/* BOTTOM SUMMARY */}
        <footer style={bottomStripStyle(darkMode)}>
          {routes.length > 0 ? (
            <>
              <strong>Summary:</strong>{" "}
              {routes[0].duration_min != null
                ? `Fastest route is ${routes[0].duration_min} min and ${routes[0].distance_km} km. `
                : "Route loaded. "}
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

/* -------------------------------------------------------------------------- */
/* ScoreBreakdown — explainable ML panel                                      */
/* -------------------------------------------------------------------------- */
function ScoreBreakdown({ probability, features, darkMode }) {
  const [expanded, setExpanded] = React.useState(false);

  if (!features) return null;

  const pct = (probability * 100).toFixed(1);
  const scoreColor = probability >= 0.75 ? "#16a34a" : probability >= 0.5 ? "#eab308" : "#dc2626";
  const scoreLabel = probability >= 0.75 ? "Likely On Time" : probability >= 0.5 ? "Possibly Delayed" : "High Delay Risk";

  // Compute each factor's contribution (mirrors synthetic training formula)
  const factors = [];

  const durationPenalty = Math.max(0, (features.duration_min - 30)) * 0.6;
  if (durationPenalty > 0)
    factors.push({ label: `Long trip (${Math.round(features.duration_min)} min)`, delta: -durationPenalty });

  if (features.num_transfers > 0)
    factors.push({ label: `${features.num_transfers} transfer${features.num_transfers > 1 ? "s" : ""}`, delta: -(features.num_transfers * 6) });

  if (features.rain_1h > 0)
    factors.push({ label: features.rain_1h >= 2 ? "Heavy rain" : "Light rain", delta: -5 });

  if (features.snow_1h > 0)
    factors.push({ label: "Snow on route", delta: -12 });

  if (features.wind_speed >= 10)
    factors.push({ label: `Strong winds (${features.wind_speed.toFixed(0)} m/s)`, delta: -4 });

  if (features.event_risk > 0)
    factors.push({ label: "Events nearby (crowd risk)", delta: -25 });

  const tempPenalty = Math.abs(features.temp - 20) / 40 * 10;
  if (tempPenalty > 1)
    factors.push({ label: `Temp far from ideal (${Math.round(features.temp)}°C)`, delta: -parseFloat(tempPenalty.toFixed(1)) });

  if (features.hour >= 16 && features.hour <= 19)
    factors.push({ label: `Rush hour (${features.hour}:00)`, delta: -8 });

  if (features.is_weekend)
    factors.push({ label: "Weekend (lighter traffic)", delta: +3 });

  const bg = darkMode ? "#0f172a" : "#eef6ff";
  const border = darkMode ? "#1d4ed8" : "#bcd2ff";
  const textMuted = darkMode ? "#9ca3af" : "#6b7280";

  return (
    <div style={{ marginTop: 6, borderRadius: 8, border: `1px solid ${border}`, background: bg, overflow: "hidden" }}>
      {/* Header row */}
      <div
        style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 14 }}>
          <strong>On-time probability:</strong>{" "}
          <span style={{ color: scoreColor, fontWeight: 700 }}>{pct}%</span>
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            color: "white", background: scoreColor,
          }}>
            {scoreLabel}
          </span>
          <span style={{ fontSize: 11, color: textMuted }}>{expanded ? "▲ hide" : "▼ why?"}</span>
        </div>
      </div>

      {/* Breakdown rows */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${border}`, padding: "8px 12px" }}>
          {/* Bar */}
          <div style={{ height: 6, borderRadius: 999, background: darkMode ? "#1e293b" : "#dbeafe", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: scoreColor, borderRadius: 999, transition: "width 0.4s ease" }} />
          </div>

          {/* Base */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: textMuted }}>Base score</span>
            <span style={{ color: "#16a34a", fontWeight: 600 }}>+90%</span>
          </div>

          {/* Factor rows */}
          {factors.length === 0 ? (
            <div style={{ fontSize: 12, color: textMuted }}>No negative factors — ideal conditions!</div>
          ) : (
            factors.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: textMuted }}>{f.label}</span>
                <span style={{ color: f.delta < 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                  {f.delta > 0 ? "+" : ""}{f.delta.toFixed(0)}%
                </span>
              </div>
            ))
          )}

          {/* Divider + final */}
          <div style={{ borderTop: `1px dashed ${border}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
            <span>Estimated on-time</span>
            <span style={{ color: scoreColor }}>{pct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* RouteCard */
/* -------------------------------------------------------------------------- */
function RouteCard({ route, index, mode, showWeatherDetails, darkMode, allRoutes = [] }) {
  const label = String.fromCharCode(65 + index);
  const color = ["#4285F4", "#FF6347", "#2ECC71", "#8E44AD"][index % 4];
  const [expandEvents, setExpandEvents] = useState(false);

  // --- Compute badges ---
  const badges = [];
  if (allRoutes.length > 0) {
    const bestOnTime = allRoutes.reduce((best, r) =>
      (r.on_time_probability ?? 0) > (best.on_time_probability ?? 0) ? r : best, allRoutes[0]);
    const shortest = allRoutes.reduce((best, r) =>
      (r.duration_min ?? Infinity) < (best.duration_min ?? Infinity) ? r : best, allRoutes[0]);

    if (route === bestOnTime && route.on_time_probability != null)
      badges.push({ label: "Best on-time", color: "#16a34a", bg: "#dcfce7" });
    if (route === shortest)
      badges.push({ label: "Shortest", color: "#d97706", bg: "#fef3c7" });

    if (mode === "transit") {
      const fewestTransfers = allRoutes.reduce((best, r) => {
        const t = r.transit_raw?.transit ? Math.max(0, r.transit_raw.transit.length - 1) : 0;
        const bestT = best.transit_raw?.transit ? Math.max(0, best.transit_raw.transit.length - 1) : 0;
        return t < bestT ? r : best;
      }, allRoutes[0]);
      if (route === fewestTransfers)
        badges.push({ label: "Fewest transfers", color: "#7c3aed", bg: "#ede9fe" });
    }
  }

  // weather icon
  let icon = "🌤️";
  if (route.weather?.weather_main) {
    const main = route.weather.weather_main.toLowerCase();
    if (main.includes("rain")) icon = "🌧️";
    else if (main.includes("snow")) icon = "❄️";
    else if (main.includes("storm") || main.includes("thunder")) icon = "⛈️";
    else if (main.includes("cloud")) icon = "☁️";
    else if (main.includes("clear")) icon = "☀️";
  }

  // impact level
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

  const cardBg = darkMode ? "#020617" : "#fafafa";
  const cardBorder = darkMode ? "#334155" : "#ddd";
  const textMuted = darkMode ? "#9ca3af" : "#666";

  return (
    <div
      style={{
        marginBottom: "8px",
        padding: "10px 12px",
        borderRadius: "10px",
        border: `1px solid ${cardBorder}`,
        background: cardBg,
        fontSize: "14px",
        color: darkMode ? "#e5e7eb" : "#111827",
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

      {/* Badges */}
      {badges.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {badges.map((b) => (
            <span
              key={b.label}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 999,
                background: b.bg,
                color: b.color,
                border: `1px solid ${b.color}`,
              }}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      <div>
        {Math.round(route.duration_min)} min • {route.distance_km ? (route.distance_km * 0.621371).toFixed(1) + " mi" : "—"}
      </div>
      
      {/* ---------------- ML ON-TIME PREDICTION + BREAKDOWN ---------------- */}
      {route.on_time_probability != null && (
        <ScoreBreakdown
          probability={route.on_time_probability}
          features={route.ml_features_used}
          darkMode={darkMode}
        />
      )}


      {route.stops?.length > 0 && (
        <div style={{ color: textMuted, marginTop: 4 }}>
          <b>Stops:</b> {route.stops.join(" → ")}
        </div>
      )}

      <div style={{ color: textMuted }}>Mode: {mode}</div>

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

              {/* Row 1 */}
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

              {/* Row 2 */}
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
                color: textMuted,
              }}
            >
              Weather data unavailable for this route.
            </div>
          )}
        </>
      )}

      {/* Alerts */}
      {renderAlerts(route.alerts?.custom_alerts, darkMode)}

      {/* Events */}
      {renderEvents(route.events_nearby, expandEvents, setExpandEvents, darkMode)}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ALERTS RENDER */
/* -------------------------------------------------------------------------- */
const severityColorsLight = {
  high: "#ffe5e5",
  medium: "#fff5d6",
  low: "#e5ffe5",
};

const severityColorsDark = {
  high: "#7f1d1d",
  medium: "#78350f",
  low: "#065f46",
};

const renderAlerts = (alerts, darkMode) => {
  /* ------------------ NO ALERTS ------------------ */
  if (!alerts || alerts.length === 0) {
    return (
      <div
        style={{
          marginTop: "12px",
          padding: "14px 16px",
          borderRadius: "12px",
          background: darkMode ? "#0f172a" : "#f0f4ff",
          border: `1px solid ${darkMode ? "#1d4ed8" : "#ccd9ff"}`,
          color: darkMode ? "#bfdbfe" : "#003eaa",
          fontSize: "16px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        🌤️ No weather alerts for this route.
      </div>
    );
  }

  /* ------------------ ALERTS EXIST ------------------ */
  return alerts.map((a, idx) => {
    const bg = darkMode
      ? severityColorsDark[a.severity] || "#111827"
      : severityColorsLight[a.severity] || "#f5f5f5";

    return (
      <div
        key={idx}
        style={{
          marginTop: "10px",
          padding: "12px",
          borderRadius: "12px",
          background: bg,
          border: "1px solid #ddd",
          fontSize: "14px",
          color: darkMode ? "#e5e7eb" : "#111827",
        }}
      >
        <strong style={{ fontSize: "15px" }}>{a.title}</strong>

        <div style={{ fontSize: "13px", marginTop: "4px" }}>{a.message}</div>

        <div
          style={{
            fontSize: "12px",
            fontStyle: "italic",
            marginTop: "6px",
            color: darkMode ? "#e5e7eb" : "#555",
          }}
        >
          Severity: {a.severity}
        </div>
      </div>
    );
  });
};

/* -------------------------------------------------------------------------- */
/* EVENTS RENDER */
/* -------------------------------------------------------------------------- */
const renderEvents = (eventsWrapper, expanded, setExpanded, darkMode) => {
  const rawEvents = Array.isArray(eventsWrapper)
    ? eventsWrapper
    : eventsWrapper?.events ?? [];

  /* ------------------ NO EVENTS AT ALL ------------------ */
  if (!rawEvents || rawEvents.length === 0) {
    return (
      <div
        style={{
          marginTop: "10px",
          padding: "14px 16px",
          borderRadius: "12px",
          background: darkMode ? "#450a0a" : "#fff5f5",
          border: `1px solid ${darkMode ? "#fecaca" : "#ffcccc"}`,
          color: darkMode ? "#fecaca" : "#b10000",
          fontSize: "16px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        ⚠️ No events today along this route.
      </div>
    );
  }

  /* ------------------ GROUP BY DAY ------------------ */
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const groupsByDate = new Map();

  for (const e of rawEvents) {
    const timeStr = e.date_time || e.start_time;
    if (!timeStr) continue;

    const time = new Date(timeStr);
    const dateKey = new Date(time);
    dateKey.setHours(0, 0, 0, 0);

    const k = dateKey.getTime();
    if (!groupsByDate.has(k)) groupsByDate.set(k, []);

    groupsByDate.get(k).push({ base: e, time });
  }

  const todayEvents = groupsByDate.get(today.getTime()) || [];
  const otherDayGroups = [...groupsByDate.entries()].filter(
    ([key]) => key !== today.getTime()
  );

  const ui = [];

  /* ------------------ TODAY SECTION ------------------ */
  if (todayEvents.length === 0) {
    ui.push(
      <div
        key="today-missing"
        style={{
          marginTop: "10px",
          padding: "16px",
          borderRadius: "12px",
          background: darkMode ? "#450a0a" : "#fff5f5",
          border: `1px solid ${darkMode ? "#fecaca" : "#ffcccc"}`,
          color: darkMode ? "#fecaca" : "#b10000",
          fontSize: "18px",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        ⚠️ No events today along this route.
      </div>
    );
  } else {
    ui.push(
      <div
        key="today-header"
        style={{
          marginTop: "10px",
          fontSize: "17px",
          fontWeight: 700,
          color: darkMode ? "#bfdbfe" : "#0055cc",
        }}
      >
        🎟️ Events Today Along This Route
      </div>
    );

    todayEvents.forEach((ev, idx) => {
      const base = ev.base;
      const time = ev.time;

      ui.push(
        <div
          key={`today-${idx}`}
          style={{
            marginTop: "10px",
            padding: "12px",
            borderRadius: "12px",
            border: `1px solid ${darkMode ? "#1d4ed8" : "#cce0ff"}`,
            background: darkMode ? "#0f172a" : "#f0f6ff",
            color: darkMode ? "#e5e7eb" : "#111827",
          }}
        >
          <strong
            style={{
              fontSize: "15px",
              color: darkMode ? "#bfdbfe" : "#003e99",
            }}
          >
            {base.name || base.title}
          </strong>

          <div style={{ marginTop: 4, fontSize: 13 }}>
            {time.toLocaleString()}
          </div>

          {base.venue_name && (
            <div
              style={{
                fontSize: 13,
                color: darkMode ? "#e5e7eb" : "#444",
              }}
            >
              Venue: {base.venue_name}
            </div>
          )}

          <a
            href={base.url}
            target="_blank"
            rel="noreferrer"
            style={{
              color: darkMode ? "#93c5fd" : "#0066ff",
              marginTop: 4,
              display: "inline-block",
              fontSize: 13,
            }}
          >
            View Event →
          </a>
        </div>
      );
    });
  }

  /* ------------------ OTHER DAYS (ACCORDION) ------------------ */
  if (otherDayGroups.length > 0) {
    ui.push(
      <div
        key="accordion-header"
        onClick={() => setExpanded(!expanded)}
        style={{
          marginTop: "16px",
          padding: "12px",
          borderRadius: "10px",
          background: darkMode ? "#020617" : "#fafafa",
          border: `1px solid ${darkMode ? "#4b5563" : "#ddd"}`,
          fontSize: "15px",
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: darkMode ? "#e5e7eb" : "#111827",
        }}
      >
        <span>📅 Heads Up: Events Coming Up on Other Days</span>
        <span style={{ fontSize: "20px" }}>{expanded ? "▲" : "▼"}</span>
      </div>
    );

    if (expanded) {
      otherDayGroups.forEach(([dateKey, events], idx) => {
        const dateLabel = new Date(Number(dateKey)).toDateString();

        ui.push(
          <div
            key={`day-${idx}`}
            style={{
              marginTop: "10px",
              fontSize: "15px",
              fontWeight: 600,
              color: darkMode ? "#e5e7eb" : "#111827",
            }}
          >
            {dateLabel}
          </div>
        );

        events.forEach((ev, j) => {
          const base = ev.base;
          const time = ev.time;

          ui.push(
            <div
              key={`other-${idx}-${j}`}
              style={{
                marginTop: "8px",
                padding: "12px",
                borderRadius: "10px",
                border: `1px solid ${darkMode ? "#4b5563" : "#eee"}`,
                background: darkMode ? "#020617" : "#fff",
                color: darkMode ? "#e5e7eb" : "#111827",
              }}
            >
              <strong style={{ fontSize: "15px" }}>
                {base.name || base.title}
              </strong>

              <div style={{ marginTop: 4, fontSize: 13 }}>
                {time.toLocaleString()}
              </div>

              {base.venue_name && (
                <div
                  style={{
                    fontSize: 13,
                    color: darkMode ? "#e5e7eb" : "#555",
                  }}
                >
                  Venue: {base.venue_name}
                </div>
              )}

              <a
                href={base.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: darkMode ? "#93c5fd" : "#0066ff",
                  marginTop: 4,
                  display: "inline-block",
                  fontSize: 13,
                }}
              >
                View Event →
              </a>
            </div>
          );
        });
      });
    }
  }

  return ui;
};

/* -------------------------------------------------------------------------- */
