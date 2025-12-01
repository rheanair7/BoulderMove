FROM python:3.11-slim

# System deps for geopandas / shapely / osmnx
RUN apt-get update && apt-get install -y \
    g++ \
    gcc \
    libproj-dev \
    proj-data \
    proj-bin \
    libgeos-dev \
    libspatialindex-dev \
    gdal-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code (exclude large data if possible)
COPY . .

# Precompute graph + stops at build time
RUN python build_network.py

# Cloud Run will inject PORT; default to 8080 for local dev
ENV PORT=8080

EXPOSE 8080

# Use exec form with uvicorn and ${PORT:-8080} fallback
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "-c", "uvicorn combined_router:app --host 0.0.0.0 --port ${PORT}"]
