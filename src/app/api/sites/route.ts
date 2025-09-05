import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const sitesParam = searchParams.get('sites');
    
    // Build the query
    let query = `
      SELECT 
        s.id,
        s.usgs_site_code,
        s.name,
        s.latitude,
        s.longitude,
        
        -- Current flow conditions
        oc.flow_value,
        oc.flow_timestamp,
        oc.flow_quality_code,
        
        -- Current temperature conditions  
        oc.temperature_value,
        oc.temperature_timestamp,
        oc.temperature_quality_code,
        
        -- Analytics from derived metrics
        dm.flow_p50,
        dm.z_score,
        dm.trend_6h,
        
        -- Data quality indicators
        EXTRACT(EPOCH FROM (NOW() - oc.flow_timestamp))/60 as data_age_minutes,
        COALESCE(dm.quality_score, 0) as quality_score
        
      FROM sites s
      LEFT JOIN observations_current oc ON s.id = oc.site_id
      LEFT JOIN derived_metrics dm ON s.id = dm.site_id
      WHERE s.active = true
    `;
    
    const queryParams: any[] = [];
    
    // Filter by specific sites if requested
    if (sitesParam) {
      const sitesList = sitesParam.split(',').map(s => s.trim());
      query += ' AND s.usgs_site_code = ANY($1)';
      queryParams.push(sitesList);
    }
    
    query += ' ORDER BY s.name';
    
    const result = await pool.query(query, queryParams);
    
    // Transform the data to match API specification
    const sites = result.rows.map((row: any) => ({
      id: row.id,
      siteCode: row.usgs_site_code,
      name: row.name,
      coordinates: {
        latitude: row.latitude,
        longitude: row.longitude
      },
      currentConditions: {
        flow: row.flow_value ? {
          value: row.flow_value,
          unit: 'ft³/s',
          timestamp: row.flow_timestamp,
          qualityCode: row.flow_quality_code,
          dataAge: Math.round(row.data_age_minutes || 0)
        } : null,
        temperature: row.temperature_value ? {
          value: row.temperature_value,
          unit: '°F',
          timestamp: row.temperature_timestamp,
          qualityCode: row.temperature_quality_code || row.flow_quality_code,
          dataAge: Math.round(row.data_age_minutes || 0)
        } : null
      },
      analytics: {
        flowPercentile: row.flow_p50,
        zScore: row.z_score,
        trend6h: row.trend_6h,
        qualityScore: row.quality_score
      }
    }));
    
    const response = {
      sites,
      totalCount: sites.length,
      lastUpdated: new Date().toISOString()
    };
    
    return new NextResponse(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
      }
    });
    
  } catch (error) {
    console.error('Error fetching sites data:', error);
    
    return new NextResponse(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to fetch sites data'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}