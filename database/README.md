# Database Setup & Dynamic Site Management

## Overview
This database uses a **dynamic site metadata system** that automatically fetches site information from USGS APIs instead of hard-coding coordinates, names, and parameter availability.

## Files Structure
```
database/
├── schema.sql              # Database schema with dynamic metadata support
├── seeds/
│   └── sites.sql          # Minimal seeds (just USGS site codes)
├── refresh-metadata.js    # Script to populate metadata from USGS API
└── README.md             # This file
```

## Quick Start

### 1. Database Setup
```bash
# Set your database URL
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# Create schema and seed minimal data
npm run db:setup
```

### 2. Populate Site Metadata
```bash
# Fetch all site metadata from USGS APIs
npm run db:refresh-metadata

# Or refresh a specific site
node database/refresh-metadata.js 08377900
```

## What Gets Auto-Populated

The `refresh-metadata.js` script queries USGS APIs and automatically populates:

### From Site Information API:
- ✅ **Site name** (official USGS name)
- ✅ **River name** (extracted intelligently)
- ✅ **Coordinates** (latitude/longitude)
- ✅ **Timezone** (mapped from USGS timezone codes)
- ✅ **Altitude & drainage area**
- ✅ **Location metadata** (state, county, HUC codes)

### From Series Catalog API:
- ✅ **Parameter availability** (`has_flow`, `has_turbidity`, `has_ph`, `has_do`, etc.)
- ✅ **Available date ranges** for each parameter
- ✅ **Real-time vs historical data** availability

## Adding New Sites

Simply add the USGS site code to `seeds/sites.sql`:

```sql
INSERT INTO sites (usgs_site_code, active) VALUES
('12345678', TRUE); -- New site code
```

Then run:
```bash
npm run db:refresh-metadata
```

The system will automatically:
1. Fetch the official site name
2. Get exact coordinates
3. Determine which parameters are available
4. Set appropriate timezone
5. Log the update in `site_metadata_updates` table

## Metadata Refresh Schedule

In production, you should periodically refresh metadata to:
- Discover new parameters at existing sites
- Update site names if USGS changes them
- Get current coordinate corrections
- Track when sensors come online/offline

```bash
# Weekly cron job example
0 2 * * 0 cd /path/to/app && npm run db:refresh-metadata
```

## Benefits of Dynamic Approach

### ❌ **Old Way** (hard-coded):
- Manual research required for each site
- Coordinates could be outdated
- Parameter availability guessed/assumed
- High maintenance overhead
- Risk of data inconsistencies

### ✅ **New Way** (dynamic):
- Zero manual research needed
- Always current USGS data
- Automatic parameter discovery
- Self-maintaining
- Audit trail of all changes
- Easy to add new sites

## Monitoring & Logs

The `site_metadata_updates` table tracks all changes:

```sql
-- See recent metadata updates
SELECT s.usgs_site_code, s.name, smu.update_type, smu.updated_at
FROM site_metadata_updates smu
JOIN sites s ON s.id = smu.site_id
ORDER BY smu.updated_at DESC LIMIT 10;

-- Check sites that haven't been updated recently
SELECT usgs_site_code, name, last_metadata_update
FROM sites 
WHERE last_metadata_update < NOW() - INTERVAL '30 days'
OR last_metadata_update IS NULL;
```

## Error Handling

The refresh script handles common issues:
- **API timeouts**: Retries with exponential backoff
- **Invalid site codes**: Logs error and continues with other sites
- **Rate limiting**: Built-in delays between requests
- **Partial failures**: Updates successful sites, reports failures

## API Rate Limiting

The script is configured to be respectful of USGS resources:
- 200ms delay between requests
- Handles HTTP 429 responses
- Concurrent request limiting
- Caches responses during batch operations