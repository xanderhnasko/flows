import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../../../lib/db';

const VALID_DURATIONS = ['1h', '6h', '24h', '7d', '30d'] as const;
type Duration = typeof VALID_DURATIONS[number];

const DURATION_INTERVALS = {
  '1h': '1 hour',
  '6h': '6 hours', 
  '24h': '1 day',
  '7d': '7 days',
  '30d': '30 days'
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const duration = (searchParams.get('duration') || '24h') as Duration;
    const parameters = searchParams.get('parameters');
    
    // Validate duration parameter
    if (!VALID_DURATIONS.includes(duration)) {
      return new NextResponse(
        JSON.stringify({
          error: 'Invalid duration',
          message: 'Duration must be one of: 1h, 6h, 24h, 7d, 30d'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // First, get site information
    const siteQuery = `
      SELECT id, name, usgs_site_code 
      FROM sites 
      WHERE usgs_site_code = $1 AND active = true
    `;
    const siteResult = await pool.query(siteQuery, [params.id]);
    
    if (siteResult.rows.length === 0) {
      return new NextResponse(
        JSON.stringify({
          error: 'Site not found',
          message: `Site with code ${params.id} does not exist`
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const site = siteResult.rows[0];
    
    // Build timeseries query
    const timeseriesQuery = `
      SELECT 
        timestamp,
        flow_value,
        temperature_value,
        flow_quality_code,
        temperature_quality_code
      FROM observations_historical 
      WHERE site_id = $1 
        AND timestamp >= NOW() - INTERVAL '${DURATION_INTERVALS[duration]}'
      ORDER BY timestamp DESC
    `;
    
    const timeseriesResult = await pool.query(timeseriesQuery, [site.id]);
    
    // Get percentile data for context  
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    
    const percentileQuery = `
      SELECT day_of_year, flow_p10, flow_p25, flow_p50, flow_p75, flow_p90
      FROM statistics_daily 
      WHERE site_id = $1 AND day_of_year = $2
    `;
    const percentileResult = await pool.query(percentileQuery, [site.id, dayOfYear]);
    
    // Transform timeseries data
    const data = timeseriesResult.rows.map((row: any) => {
      const item: any = {
        timestamp: row.timestamp,
      };
      
      // Add flow data if available and not filtered out
      if (!parameters || parameters.includes('flow')) {
        item.flow = row.flow_value ? {
          value: row.flow_value,
          unit: 'ft³/s',
          qualityCode: row.flow_quality_code
        } : null;
      }
      
      // Add temperature data if available and not filtered out  
      if (!parameters || parameters.includes('temperature')) {
        item.temperature = row.temperature_value ? {
          value: row.temperature_value,
          unit: '°F',
          qualityCode: row.temperature_quality_code
        } : null;
      } else if (parameters && !parameters.includes('temperature')) {
        // If parameters are specified and temperature is not included, set to null explicitly
        item.temperature = null;
      }
      
      return item;
    });
    
    // Calculate time period
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (duration === '1h' ? 3600000 : 
                                                   duration === '6h' ? 21600000 :
                                                   duration === '24h' ? 86400000 :
                                                   duration === '7d' ? 604800000 : 2592000000));
    
    const response = {
      site: {
        id: site.id,
        name: site.name,
        siteCode: site.usgs_site_code
      },
      timePeriod: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        duration
      },
      data,
      percentiles: percentileResult.rows[0] ? {
        dayOfYear: percentileResult.rows[0].day_of_year,
        flow_p10: percentileResult.rows[0].flow_p10,
        flow_p25: percentileResult.rows[0].flow_p25,
        flow_p50: percentileResult.rows[0].flow_p50,
        flow_p75: percentileResult.rows[0].flow_p75,
        flow_p90: percentileResult.rows[0].flow_p90
      } : null,
      totalCount: data.length
    };
    
    return new NextResponse(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'
      }
    });
    
  } catch (error) {
    console.error('Error fetching timeseries data:', error);
    
    return new NextResponse(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to fetch timeseries data'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}