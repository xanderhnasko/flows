#!/usr/bin/env node
// Metadata Refresh Script
// Run this to populate all site metadata dynamically from USGS APIs

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function refreshSiteMetadata(siteCode) {
  console.log(`Refreshing metadata for ${siteCode}...`);
  
  try {
    // Fetch site info and parameter availability
    const [siteData, paramData] = await Promise.all([
      fetchSiteInfo(siteCode),
      fetchParameterAvailability(siteCode)
    ]);
    
    if (!siteData) {
      console.error(`❌ No data found for site ${siteCode}`);
      return false;
    }
    
    // Update database
    await updateSiteInDatabase(siteCode, siteData, paramData);
    console.log(`✅ Updated ${siteCode}: ${siteData.name}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error updating ${siteCode}:`, error.message);
    return false;
  }
}

async function fetchSiteInfo(siteCode) {
  const response = await fetch(
    `https://waterservices.usgs.gov/nwis/site/?format=rdb&sites=${siteCode}&siteOutput=expanded`
  );
  const text = await response.text();
  return parseSiteResponse(text);
}

async function fetchParameterAvailability(siteCode) {
  const response = await fetch(
    `https://waterservices.usgs.gov/nwis/site/?format=rdb&sites=${siteCode}&seriesCatalogOutput=true`
  );
  const text = await response.text();
  return parseParameterResponse(text);
}

function parseSiteResponse(rdbText) {
  const lines = rdbText.split('\n').filter(line => line.trim());
  const headerLine = lines.find(line => line.startsWith('agency_cd'));
  const dataLine = lines.find(line => line.startsWith('USGS'));
  
  if (!headerLine || !dataLine) return null;
  
  const headers = headerLine.split('\t').map(h => h.trim());
  const values = dataLine.split('\t').map(v => v.trim());
  
  const data = {};
  headers.forEach((header, i) => {
    data[header] = values[i] || null;
  });
  
  return {
    name: data.station_nm,
    river: extractRiverName(data.station_nm),
    latitude: parseFloat(data.dec_lat_va),
    longitude: parseFloat(data.dec_long_va),
    timezone: mapTimezone(data.tz_cd),
    altitude_ft: data.alt_va ? parseFloat(data.alt_va) : null,
    drainage_area_sq_mi: data.drain_area_va ? parseFloat(data.drain_area_va) : null,
    state_code: data.state_cd,
    county_code: data.county_cd,
    huc_code: data.huc_cd
  };
}

function parseParameterResponse(rdbText) {
  const lines = rdbText.split('\n');
  const headerLine = lines.find(line => line.startsWith('agency_cd'));
  const dataLines = lines.filter(line => line.startsWith('USGS'));
  
  if (!headerLine) return { has_flow: false, has_temperature: false, has_turbidity: false, has_ph: false, has_do: false, has_conductivity: false, available_parameters: [] };
  
  const headers = headerLine.split('\t');
  const parmIndex = headers.indexOf('parm_cd');
  
  if (parmIndex === -1) return { has_flow: false, has_temperature: false, has_turbidity: false, has_ph: false, has_do: false, has_conductivity: false, available_parameters: [] };
  
  const parameters = new Set();
  dataLines.forEach(line => {
    const parts = line.split('\t');
    if (parts.length > parmIndex && parts[parmIndex].trim()) {
      parameters.add(parts[parmIndex].trim());
    }
  });
  
  return {
    has_flow: parameters.has('00060'),
    has_temperature: parameters.has('00010'),
    has_turbidity: parameters.has('63680') || parameters.has('00076'),
    has_ph: parameters.has('00400'),
    has_do: parameters.has('00300'),
    has_conductivity: parameters.has('00095'),
    available_parameters: Array.from(parameters)
  };
}

function extractRiverName(stationName) {
  if (!stationName) return 'Unknown';
  
  const patterns = [
    /^(.*?(?:River|Creek|Rio Grande|Rio Chama|Rio|San Juan River))/i,
    /^(.*?)(?:\s+(?:at|near|below|above|bl|ab|nr))/i
  ];
  
  for (const pattern of patterns) {
    const match = stationName.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return stationName.split(' ').slice(0, 2).join(' ');
}

function mapTimezone(tzCode) {
  const timezoneMap = {
    'MST': 'America/Denver',
    'MDT': 'America/Denver', 
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago'
  };
  return timezoneMap[tzCode] || 'America/Denver';
}

async function updateSiteInDatabase(siteCode, siteData, paramData) {
  const query = `
    UPDATE sites SET
      name = $2,
      river = $3,
      latitude = $4,
      longitude = $5,
      timezone = $6,
      altitude_ft = $7,
      drainage_area_sq_mi = $8,
      has_flow = $9,
      has_temperature = $10,
      has_turbidity = $11,
      has_ph = $12,
      has_do = $13,
      has_conductivity = $14,
      state_code = $15,
      county_code = $16,
      huc_code = $17,
      last_metadata_update = NOW()
    WHERE usgs_site_code = $1
  `;
  
  await pool.query(query, [
    siteCode,
    siteData.name,
    siteData.river,
    siteData.latitude,
    siteData.longitude,
    siteData.timezone,
    siteData.altitude_ft,
    siteData.drainage_area_sq_mi,
    paramData.has_flow,
    paramData.has_temperature,
    paramData.has_turbidity,
    paramData.has_ph,
    paramData.has_do,
    paramData.has_conductivity,
    siteData.state_code,
    siteData.county_code,
    siteData.huc_code
  ]);
  
  // Log the update
  await pool.query(`
    INSERT INTO site_metadata_updates (site_id, update_type, changes_detected)
    SELECT id, 'metadata_refresh', $2
    FROM sites WHERE usgs_site_code = $1
  `, [siteCode, JSON.stringify({ ...siteData, ...paramData })]);
}

async function refreshAllSites() {
  try {
    // Get all active sites
    const result = await pool.query('SELECT usgs_site_code FROM sites WHERE active = true ORDER BY usgs_site_code');
    const sites = result.rows.map(row => row.usgs_site_code);
    
    console.log(`🔄 Refreshing metadata for ${sites.length} sites...`);
    
    let updated = 0;
    for (const siteCode of sites) {
      const success = await refreshSiteMetadata(siteCode);
      if (success) updated++;
      
      // Rate limiting to be nice to USGS API
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`\n✅ Successfully updated ${updated}/${sites.length} sites`);
    
  } catch (error) {
    console.error('❌ Error refreshing sites:', error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  const siteCode = process.argv[2];
  if (siteCode) {
    refreshSiteMetadata(siteCode).then(() => pool.end());
  } else {
    refreshAllSites();
  }
}

module.exports = { refreshSiteMetadata, refreshAllSites };