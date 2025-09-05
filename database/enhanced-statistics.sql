-- Enhanced statistics_daily table to capture full USGS statistical suite
-- This migration adds columns for mean, min, max, period of record, and full percentile range

ALTER TABLE statistics_daily 
-- Add core statistics
ADD COLUMN flow_mean DOUBLE PRECISION,
ADD COLUMN flow_min DOUBLE PRECISION,
ADD COLUMN flow_max DOUBLE PRECISION,

-- Add period of record
ADD COLUMN period_begin_year INTEGER,
ADD COLUMN period_end_year INTEGER,

-- Add extended percentiles 
ADD COLUMN flow_p05 DOUBLE PRECISION,
ADD COLUMN flow_p20 DOUBLE PRECISION,
ADD COLUMN flow_p80 DOUBLE PRECISION,
ADD COLUMN flow_p95 DOUBLE PRECISION,

-- Add extreme value years for context
ADD COLUMN max_value_year INTEGER,
ADD COLUMN min_value_year INTEGER,

-- Add data quality indicators
ADD COLUMN observation_count INTEGER DEFAULT 0,
ADD COLUMN data_completeness_percent DOUBLE PRECISION;

-- Add comments for documentation
COMMENT ON COLUMN statistics_daily.flow_mean IS 'Historical mean daily flow (USGS mean_va)';
COMMENT ON COLUMN statistics_daily.flow_min IS 'Historical minimum daily flow (USGS min_va)';
COMMENT ON COLUMN statistics_daily.flow_max IS 'Historical maximum daily flow (USGS max_va)';
COMMENT ON COLUMN statistics_daily.period_begin_year IS 'First water year of data (USGS begin_yr)';
COMMENT ON COLUMN statistics_daily.period_end_year IS 'Last water year of data (USGS end_yr)';
COMMENT ON COLUMN statistics_daily.max_value_year IS 'Water year when maximum occurred (USGS max_va_yr)';
COMMENT ON COLUMN statistics_daily.min_value_year IS 'Water year when minimum occurred (USGS min_va_yr)';
COMMENT ON COLUMN statistics_daily.observation_count IS 'Number of daily values used in calculation (USGS count_nu)';

-- Update existing comments
COMMENT ON COLUMN statistics_daily.years_of_record IS 'DEPRECATED: Use observation_count instead';

-- Add index for efficient lookups by percentile values (for anomaly detection)
CREATE INDEX idx_statistics_daily_mean ON statistics_daily(flow_mean) WHERE flow_mean IS NOT NULL;
CREATE INDEX idx_statistics_daily_percentiles ON statistics_daily(flow_p25, flow_p75) WHERE flow_p25 IS NOT NULL AND flow_p75 IS NOT NULL;