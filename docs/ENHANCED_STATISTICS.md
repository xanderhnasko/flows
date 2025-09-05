# Enhanced USGS Statistics Implementation

## Overview
We've significantly enhanced our statistics implementation to capture and utilize the complete USGS statistical suite rather than just basic percentiles. This provides much richer context for flow anomaly detection and user insights.

## What Changed

### Original Approach (Limited)
- **Data Captured**: Only p10, p25, p50, p75, p90 percentiles
- **Format**: Assumed JSON API response
- **Z-Score Calculation**: Based on percentiles (less accurate)
- **Context**: Limited historical information

### Enhanced Approach (Complete)
- **Data Captured**: Full USGS statistical suite
  - Core Statistics: `mean_va`, `min_va`, `max_va`
  - Complete Percentiles: `p05_va` through `p95_va` (9 percentiles)
  - Period of Record: `begin_yr`, `end_yr`
  - Extreme Years: `max_va_yr`, `min_va_yr`
  - Data Quality: `count_nu` (observation count)

- **Format**: RDB (tab-delimited) format parsing
- **Z-Score Calculation**: Uses historical mean (more statistically appropriate)
- **Context**: Rich historical information including extreme years and period of record

## Database Schema Enhancements

### New Columns Added to `statistics_daily`
```sql
-- Core statistics
flow_mean DOUBLE PRECISION,
flow_min DOUBLE PRECISION, 
flow_max DOUBLE PRECISION,

-- Extended percentiles
flow_p05 DOUBLE PRECISION,
flow_p20 DOUBLE PRECISION,
flow_p80 DOUBLE PRECISION,
flow_p95 DOUBLE PRECISION,

-- Period of record context
period_begin_year INTEGER,
period_end_year INTEGER,

-- Extreme value years
max_value_year INTEGER,
min_value_year INTEGER,

-- Data quality indicators
observation_count INTEGER DEFAULT 0,
data_completeness_percent DOUBLE PRECISION
```

## API Response Format

### Example USGS RDB Data
```
agency_cd  site_no    parameter_cd  month_nu  day_nu  count_nu  max_va_yr  max_va  min_va_yr  min_va  mean_va  p05_va  p10_va  p20_va  p25_va  p50_va  p75_va  p80_va  p90_va  p95_va
USGS      08279500   00060         1         1       95        1942       888     1957       262     501      339     368     395     423     498     560     578     624     746
```

### Parsed Result
```typescript
{
  siteCode: '08279500',
  dayOfYear: 1,
  
  // Core statistics (most valuable for analysis)
  flow_mean: 501,      // Historical average - best for z-scores
  flow_min: 262,       // Historical minimum with year context
  flow_max: 888,       // Historical maximum with year context
  
  // Complete percentile distribution
  flow_p05: 339,       // 5th percentile
  flow_p10: 368,       // 10th percentile
  flow_p20: 395,       // 20th percentile  
  flow_p25: 423,       // 25th percentile (Q1)
  flow_p50: 498,       // 50th percentile (median)
  flow_p75: 560,       // 75th percentile (Q3)
  flow_p80: 578,       // 80th percentile
  flow_p90: 624,       // 90th percentile
  flow_p95: 746,       // 95th percentile
  
  // Historical context
  periodBeginYear: 1931,  // Period of record start
  periodEndYear: 2025,    // Period of record end
  maxValueYear: 1942,     // Year maximum occurred
  minValueYear: 1957,     // Year minimum occurred
  
  // Data quality
  observationCount: 95,   // Number of years of data
}
```

## Benefits

### 1. Better Z-Score Calculations
- **Before**: Used median (p50) as baseline
- **After**: Uses historical mean - more statistically appropriate
- **Result**: More accurate flow anomaly detection

### 2. Richer User Context
- **Historical Extremes**: Show when max/min occurred
- **Period of Record**: Users understand data quality/depth
- **Full Percentile Range**: Better visualization of flow distribution
- **Data Quality Indicators**: Transparency about data reliability

### 3. Enhanced Analytics
- **Trend Analysis**: Compare against historical mean vs just percentiles  
- **Extreme Event Context**: "This is the highest flow since 1942"
- **Data Confidence**: "Based on 95 years of data"
- **Seasonal Patterns**: Full percentile distribution shows seasonal variance

## Implementation Details

### RDB Parser
- **Robust Error Handling**: Gracefully handles malformed data
- **Flexible Column Detection**: Works with different USGS response formats  
- **Missing Value Handling**: Properly handles null/missing statistics
- **Performance Optimized**: Batch database operations with transactions

### Database Storage
- **Transaction Safety**: All statistics stored atomically
- **Upsert Logic**: Handles updates to existing daily statistics
- **Null Handling**: Properly stores missing percentiles as NULL
- **Indexing**: Optimized indexes for percentile and mean-based queries

## Testing Coverage
- **14 comprehensive tests** covering all scenarios
- **RDB format parsing** with real USGS data structure
- **Error handling** for malformed data, network failures, missing sites
- **Database integration** with proper transaction handling
- **Edge cases** including leap years, missing values, null percentiles

## Future Enhancements
With this rich statistical foundation, we can now implement:
- **Better Z-Score Algorithm**: Using historical mean ± standard deviation
- **Extreme Event Detection**: "Highest flow in 20 years"
- **Seasonal Context**: "Above average for this time of year"  
- **Historical Comparisons**: Charts showing current vs historical range
- **Data Quality Indicators**: User-visible data reliability scores

## Migration Path
The enhanced implementation maintains backward compatibility:
- `yearsOfRecord` field deprecated but maintained
- All existing interfaces continue to work
- Database migration adds new columns (doesn't break existing)
- API responses can be enhanced without breaking existing clients