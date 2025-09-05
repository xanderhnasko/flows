# Fly Fishing Stream Conditions MVP - Technical Plan

## Overview
A streamlined web application providing real-time stream conditions for New Mexico fly fishing, with enhanced visualization of USGS data and reservoir release schedules.

## 1. Core Data Sources & Parameters

### Primary Data Sources
| Source | Parameters | Update Frequency | Purpose |
|--------|------------|------------------|---------|
| **USGS IV** | Flow (00060), Water Temp (00010), Turbidity (63680/00076) | 5-15 min | Real-time conditions |
| **USGS DV** | Daily mean flow, temp | Nightly | Historical context |
| **USGS Statistics** | Complete statistical suite: mean, min, max, p05-p95, period of record | Monthly | Enhanced flow anomaly calculations using historical mean |
| **Reclamation RISE** | Reservoir releases, elevation | Hourly | Release schedules |

### Opportunistic Parameters
- **pH (00400)**: Include if available at site
- **Dissolved Oxygen (00300)**: Include if available at site

## 2. Derived Signals

### Flow Anomaly (Z-Score)
```
z = (current_flow - median_for_day) / IQR
where IQR = (p75 - p25) for robustness

Classification:
- z < -2: "Very Low"
- -2 ≤ z < -1: "Below Normal"  
- -1 ≤ z ≤ 1: "Normal"
- 1 < z ≤ 2: "Above Normal"
- z > 2: "Very High"
```

### Flow Trend
```
6-hour slope calculation using Theil-Sen estimator
- Rising: slope > 5% of current value
- Steady: |slope| ≤ 5% of current value  
- Falling: slope < -5% of current value
```

## 3. Database Schema

```sql
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
CREATE INDEX idx_obs_daily_date ON observations_daily(date DESC);
CREATE INDEX idx_reservoir_releases_timestamp ON reservoir_releases(timestamp DESC);
```

## 4. API Endpoints

### Core Endpoints
```typescript
// Site listing with current conditions
GET /api/sites
Response: {
  sites: [{
    id: string,
    name: string,
    river: string,
    coordinates: [lat, lon],
    current: {
      flow: { value: number, unit: "cfs", trend: string, z_score: number, status: string },
      temperature: { value: number, unit: "F" },
      turbidity?: { value: number, unit: "NTU"|"FNU" },
      ph?: { value: number },
      dissolved_oxygen?: { value: number, unit: "mg/L" },
      updated_at: ISO8601
    }
  }]
}

// Historical data for charts
GET /api/sites/:id/timeseries?days=7&parameters=flow,temperature
Response: {
  site_id: string,
  data: {
    flow: [{ timestamp: ISO8601, value: number, percentiles?: {...} }],
    temperature: [{ timestamp: ISO8601, value: number }]
  }
}

// Reservoir information
GET /api/reservoirs
Response: {
  reservoirs: [{
    id: string,
    name: string,
    current_release: number,
    elevation: number,
    last_updated: ISO8601,
    recent_changes: [{ timestamp: ISO8601, release_cfs: number }]
  }]
}
```

## 5. Priority New Mexico Sites

### Tier 1 - Must Have
- **San Juan River below Navajo Dam** (09355500)
- **Rio Grande at Embudo** (08279500)
- **Rio Grande below Cochiti Dam** (08317400)
- **Pecos River near Pecos** (08378500)

### Tier 2 - High Value
- **Rio Chama near Chamita** (08290000)
- **Rio Grande at Otowi Bridge** (08313000)
- **Cimarron River** (07211500)
- **Red River near Questa** (08265000)

### Associated Reservoirs
- Navajo Dam (San Juan)
- El Vado (Rio Chama)
- Abiquiu (Rio Chama)
- Cochiti (Rio Grande)

## 6. Frontend Architecture

### Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Map**: MapLibre GL JS
- **Charts**: Recharts
- **Styling**: Tailwind CSS
- **State**: React Query for server state

### Single-Page Map Interface
```typescript
interface MapView {
  // Main map (60% viewport on mobile, 70% desktop)
  map: {
    style: "terrain",
    markers: SiteMarker[],
    initialBounds: NewMexicoBounds
  },
  
  // Bottom sheet (mobile) / Sidebar (desktop)
  dataPanel: {
    selectedSite: Site,
    chart: {
      parameter: "flow" | "temperature" | "turbidity",
      range: "24h" | "7d" | "30d",
      showPercentiles: boolean
    },
    quickStats: {
      flowStatus: string,
      flowTrend: string,
      currentTemp: number,
      turbidity?: number
    }
  }
}
```

### Mobile-First Considerations
- Touch-optimized map controls
- Swipeable bottom sheet
- Offline caching via service worker
- Responsive chart sizing
- Large tap targets (44px minimum)

## 7. Build Phases

### Phase 1: API Verification (Day 1)
- [ ] Test USGS IV endpoints for target sites
- [ ] Verify available parameters per site
- [ ] Test USGS Statistics API responses
- [ ] Test RISE API authentication and data availability
- [ ] Document actual vs expected data gaps

### Phase 2: Database Setup (Day 2)
- [ ] Provision PostgreSQL instance
- [ ] Execute schema creation
- [ ] Populate sites table with NM locations
- [ ] Set up connection pooling
- [ ] Create backup strategy

### Phase 3: Data Pipeline (Days 3-4)
- [ ] USGS IV poller (5-min intervals)
  - [ ] Handle provisional data flags
  - [ ] Implement retry logic
  - [ ] Error state management
- [ ] USGS DV nightly sync
- [ ] Statistics service monthly refresh
- [ ] RISE reservoir poller (hourly)
- [ ] Z-score calculation job
- [ ] Trend calculation job

### Phase 4: API Development (Day 5)
- [ ] Implement `/api/sites` endpoint
- [ ] Implement `/api/sites/:id/timeseries`
- [ ] Implement `/api/reservoirs`
- [ ] Add response caching (60s for current, 5min for historical)
- [ ] Error handling middleware

### Phase 5: Frontend Development (Days 6-8)
- [ ] Map component with site markers
- [ ] Site data panel (mobile bottom sheet)
- [ ] Chart component with range selector
- [ ] Reservoir release display
- [ ] Loading states and error boundaries
- [ ] Deploy to Vercel/Netlify

### Phase 6: Polish & Testing (Day 9)
- [ ] Handle offline scenarios
- [ ] Add "sensor offline" indicators
- [ ] Timezone handling (NM crosses zones)
- [ ] Performance optimization
- [ ] Cross-browser testing

### Phase 7: LLM Features (Future - Days 10+)
- [ ] Manual curation system for NMDGF reports
- [ ] Report storage schema
- [ ] LLM integration for summarization
  - [ ] Prompt engineering for fishing-specific summaries
  - [ ] Citation preservation
  - [ ] Freshness scoring
- [ ] Report display component
- [ ] Source attribution UI

## 8. Data Quality & Edge Cases

### Known USGS Issues
- Sensors go offline during low water conditions
- Temperature sensors fail in winter
- Provisional vs approved data flagging
- Varying update frequencies (5-60 minutes)

### Handling Strategy
```typescript
interface DataQuality {
  provisional: boolean,
  age_minutes: number,
  offline_threshold: 120, // 2 hours
  stale_threshold: 60,    // 1 hour
  display: "current" | "stale" | "offline"
}
```

## 9. Environment Variables
```env
DATABASE_URL=postgresql://...
USGS_BASE_URL=https://waterservices.usgs.gov
RISE_API_KEY=...
RISE_BASE_URL=https://data.usbr.gov/rise-api
TZ=America/Denver
NODE_ENV=production
```

## 10. Performance Targets

- Initial page load: < 3s on 3G
- API response time: < 200ms (cached)
- Data freshness: < 15 minutes for current conditions
- Map interaction: 60fps pan/zoom
- Chart rendering: < 100ms

## 11. Monitoring & Observability

### Key Metrics
- Data pipeline success rate
- API endpoint latency (p50, p95, p99)
- Active sensors per river
- Cache hit rates
- Frontend Web Vitals (LCP, FID, CLS)

### Alerts
- Sensor offline > 2 hours
- Pipeline failure > 2 consecutive runs
- API errors > 1% threshold
- No data updates > 30 minutes

## 12. Future Enhancements (Post-MVP)

1. **User Features**
   - Favorite sites
   - Custom alerts
   - Historical comparisons

2. **Data Expansion**
   - SNOTEL integration (pre-runoff)
   - Weather overlay
   - Hatch charts

3. **Advanced Analytics**
   - Predictive modeling
   - Correlation analysis (release vs conditions)
   - Seasonal patterns

## Success Criteria

- Successfully polling 10+ NM stream sites
- < 15-minute data lag
- Mobile-responsive interface
- 99% uptime for data pipeline
- Accurate z-score calculations matching USGS percentiles

---

## Quick Reference URLs

- USGS IV: `https://waterservices.usgs.gov/nwis/iv/?sites={site}&parameterCd=00060,00010,63680&format=json`
- USGS Stats: `https://waterservices.usgs.gov/nwis/stat/?sites={site}&statReportType=daily&format=json`
- RISE Time Series: `https://data.usbr.gov/rise-api/result/{locationId}/{parameterId}`