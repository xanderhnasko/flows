-- Migration script to update existing database schema
-- Adds dynamic metadata columns to existing sites table

-- Add new columns to sites table
ALTER TABLE sites 
ADD COLUMN IF NOT EXISTS altitude_ft DECIMAL(8, 2),
ADD COLUMN IF NOT EXISTS drainage_area_sq_mi DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS has_flow BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_temperature BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_conductivity BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_metadata_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS huc_code VARCHAR(12),
ADD COLUMN IF NOT EXISTS state_code VARCHAR(2),
ADD COLUMN IF NOT EXISTS county_code VARCHAR(3);

-- Rename old columns to match new schema
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'has_turbidity') THEN
        -- Column already exists, no action needed
    ELSE
        -- This shouldn't happen, but just in case
        ALTER TABLE sites ADD COLUMN has_turbidity BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Make name, river, latitude, longitude nullable since they'll be populated dynamically
ALTER TABLE sites 
ALTER COLUMN name DROP NOT NULL,
ALTER COLUMN river DROP NOT NULL,
ALTER COLUMN latitude DROP NOT NULL,
ALTER COLUMN longitude DROP NOT NULL;

-- Create new table if it doesn't exist
CREATE TABLE IF NOT EXISTS site_metadata_updates (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id),
    update_type VARCHAR(50),
    changes_detected JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_sites_metadata_update ON sites(last_metadata_update);
CREATE INDEX IF NOT EXISTS idx_sites_usgs_code ON sites(usgs_site_code);