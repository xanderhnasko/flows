-- New Mexico Stream Conditions Database Schema
-- Based on plan.MD specifications

-- Core tables only, no hypertables for MVP
CREATE TABLE sites (
    id SERIAL PRIMARY KEY,
    usgs_site_code VARCHAR(15) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    river VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'America/Denver',
    has_turbidity BOOLEAN DEFAULT FALSE,
    has_ph BOOLEAN DEFAULT FALSE,
    has_do BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE observations_current (
    site_id INTEGER REFERENCES sites(id),
    parameter_code VARCHAR(5) NOT NULL,
    value DOUBLE PRECISION,
    unit VARCHAR(20),
    timestamp TIMESTAMPTZ NOT NULL,
    data_quality_code VARCHAR(10),
    PRIMARY KEY (site_id, parameter_code)
);

CREATE TABLE observations_daily (
    site_id INTEGER REFERENCES sites(id),
    date DATE NOT NULL,
    flow_mean DOUBLE PRECISION,
    flow_min DOUBLE PRECISION,
    flow_max DOUBLE PRECISION,
    temp_mean DOUBLE PRECISION,
    temp_min DOUBLE PRECISION,
    temp_max DOUBLE PRECISION,
    PRIMARY KEY (site_id, date)
);

CREATE TABLE statistics_daily (
    site_id INTEGER REFERENCES sites(id),
    day_of_year INTEGER NOT NULL CHECK (day_of_year BETWEEN 1 AND 366),
    flow_p10 DOUBLE PRECISION,
    flow_p25 DOUBLE PRECISION,
    flow_p50 DOUBLE PRECISION,
    flow_p75 DOUBLE PRECISION,
    flow_p90 DOUBLE PRECISION,
    years_of_record INTEGER,
    last_updated DATE,
    PRIMARY KEY (site_id, day_of_year)
);

CREATE TABLE reservoirs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    river VARCHAR(100),
    rise_location_id VARCHAR(50),
    associated_site_id INTEGER REFERENCES sites(id),
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE reservoir_releases (
    reservoir_id INTEGER REFERENCES reservoirs(id),
    timestamp TIMESTAMPTZ NOT NULL,
    release_cfs DOUBLE PRECISION,
    elevation_ft DOUBLE PRECISION,
    storage_af DOUBLE PRECISION,
    PRIMARY KEY (reservoir_id, timestamp)
);

CREATE TABLE derived_metrics (
    site_id INTEGER REFERENCES sites(id),
    calculated_at TIMESTAMPTZ NOT NULL,
    flow_z_score DOUBLE PRECISION,
    flow_status VARCHAR(20),
    flow_trend VARCHAR(20),
    flow_trend_6h_slope DOUBLE PRECISION,
    PRIMARY KEY (site_id)
);

-- Indexes for performance
CREATE INDEX idx_obs_current_timestamp ON observations_current(timestamp DESC);
CREATE INDEX idx_obs_daily_date ON observations_daily(date DESC);
CREATE INDEX idx_reservoir_releases_timestamp ON reservoir_releases(timestamp DESC);
CREATE INDEX idx_statistics_daily_day_of_year ON statistics_daily(day_of_year);
CREATE INDEX idx_sites_active ON sites(active);