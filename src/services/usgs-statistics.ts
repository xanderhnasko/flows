import { pool } from '../lib/db';

export interface USGSStatistics {
  siteCode: string;
  dayOfYear: number;
  
  // Core statistics (most important for z-score calculations)
  flow_mean: number | null;
  flow_min: number | null;
  flow_max: number | null;
  
  // Full percentile range
  flow_p05: number | null;
  flow_p10: number | null;
  flow_p20: number | null;
  flow_p25: number | null;
  flow_p50: number | null; // median
  flow_p75: number | null;
  flow_p80: number | null;
  flow_p90: number | null;
  flow_p95: number | null;
  
  // Period of record context
  periodBeginYear: number | null;
  periodEndYear: number | null;
  
  // Extreme value context
  maxValueYear: number | null;
  minValueYear: number | null;
  
  // Data quality
  observationCount: number;
  dataCompletenessPercent?: number;
  
  // Deprecated (maintain for backward compatibility)
  /** @deprecated Use observationCount instead */
  yearsOfRecord: number;
}

export class USGSStatisticsService {
  private readonly USGS_STATS_URL = 'https://waterservices.usgs.gov/nwis/stat/';
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;

  async fetchSiteStatistics(siteCode: string): Promise<USGSStatistics[]> {
    const url = `${this.USGS_STATS_URL}?sites=${siteCode}&parameterCd=00060&statReportType=daily&statType=all&format=rdb`;
    
    console.log(`Fetching USGS statistics for site ${siteCode}`);
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RiverFlows/1.0 (https://github.com/flows)',
          'Accept': 'text/plain'
        },
        signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
      });
      
      if (!response.ok) {
        throw new Error(`USGS Statistics API failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.text();
      const results = this.parseRDBResponse(data, siteCode);
      
      console.log(`Successfully parsed ${results.length} daily statistics for site ${siteCode}`);
      return results;
      
    } catch (error) {
      console.error(`Error fetching statistics for site ${siteCode}:`, error);
      throw error;
    }
  }

  async populateAllSiteStatistics(): Promise<void> {
    // Get all active sites and populate their historical statistics
    const sites = await pool.query('SELECT usgs_site_code FROM sites WHERE active = true');
    
    for (const site of sites.rows) {
      try {
        const stats = await this.fetchSiteStatistics(site.usgs_site_code);
        await this.storeStatistics(stats);
      } catch (error) {
        console.error(`Failed to fetch statistics for ${site.usgs_site_code}:`, error);
      }
    }
  }

  private async storeStatistics(stats: USGSStatistics[]): Promise<void> {
    if (stats.length === 0) {
      console.log('No statistics to store');
      return;
    }

    const siteCode = stats[0].siteCode;
    console.log(`Storing ${stats.length} daily statistics for site ${siteCode}`);
    
    try {
      const siteResult = await pool.query('SELECT id FROM sites WHERE usgs_site_code = $1', [siteCode]);
      
      if (siteResult.rows.length === 0) {
        throw new Error(`Site not found: ${siteCode}`);
      }
      
      const siteId = siteResult.rows[0].id;
      
      // Use batch insert for better performance
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Prepare the enhanced upsert query
        const upsertQuery = `
          INSERT INTO statistics_daily 
          (site_id, day_of_year, 
           flow_mean, flow_min, flow_max,
           flow_p05, flow_p10, flow_p20, flow_p25, flow_p50, flow_p75, flow_p80, flow_p90, flow_p95,
           period_begin_year, period_end_year, max_value_year, min_value_year,
           observation_count, years_of_record, last_updated)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_DATE)
          ON CONFLICT (site_id, day_of_year) 
          DO UPDATE SET 
            flow_mean = EXCLUDED.flow_mean,
            flow_min = EXCLUDED.flow_min,
            flow_max = EXCLUDED.flow_max,
            flow_p05 = EXCLUDED.flow_p05,
            flow_p10 = EXCLUDED.flow_p10,
            flow_p20 = EXCLUDED.flow_p20,
            flow_p25 = EXCLUDED.flow_p25,
            flow_p50 = EXCLUDED.flow_p50,
            flow_p75 = EXCLUDED.flow_p75,
            flow_p80 = EXCLUDED.flow_p80,
            flow_p90 = EXCLUDED.flow_p90,
            flow_p95 = EXCLUDED.flow_p95,
            period_begin_year = EXCLUDED.period_begin_year,
            period_end_year = EXCLUDED.period_end_year,
            max_value_year = EXCLUDED.max_value_year,
            min_value_year = EXCLUDED.min_value_year,
            observation_count = EXCLUDED.observation_count,
            years_of_record = EXCLUDED.years_of_record,
            last_updated = CURRENT_DATE
        `;
        
        for (const stat of stats) {
          await client.query(upsertQuery, [
            siteId,                    // $1
            stat.dayOfYear,           // $2
            stat.flow_mean,           // $3
            stat.flow_min,            // $4
            stat.flow_max,            // $5
            stat.flow_p05,            // $6
            stat.flow_p10,            // $7
            stat.flow_p20,            // $8
            stat.flow_p25,            // $9
            stat.flow_p50,            // $10
            stat.flow_p75,            // $11
            stat.flow_p80,            // $12
            stat.flow_p90,            // $13
            stat.flow_p95,            // $14
            stat.periodBeginYear,     // $15
            stat.periodEndYear,       // $16
            stat.maxValueYear,        // $17
            stat.minValueYear,        // $18
            stat.observationCount,    // $19
            stat.yearsOfRecord        // $20 (deprecated but maintained)
          ]);
        }
        
        await client.query('COMMIT');
        console.log(`Successfully stored ${stats.length} daily statistics for site ${siteCode}`);
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error(`Error storing statistics for site ${siteCode}:`, error);
      throw error;
    }
  }
  
  private parseRDBResponse(rdbData: string, siteCode: string): USGSStatistics[] {
    if (!rdbData || rdbData.trim() === '') {
      throw new Error('Empty RDB response received');
    }

    const lines = rdbData.split('\n');
    const dataLines: string[] = [];
    let headerLine: string | null = null;
    
    // Skip comment lines (start with #) and find header + data
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') {
        continue; // Skip comments and empty lines
      }
      
      // Skip the format line (contains 's', 'n', etc.) - more robust check
      if (/^\d+[sn]\t/.test(trimmed) || trimmed.includes('5s') || trimmed.includes('15s') || trimmed.includes('3n')) {
        continue;
      }
      
      if (!headerLine && trimmed.includes('agency_cd')) {
        headerLine = trimmed;
        continue;
      }
      
      if (headerLine && trimmed.startsWith('USGS')) {
        dataLines.push(trimmed);
      }
    }
    
    if (!headerLine) {
      console.warn(`No header found in RDB response for site ${siteCode}`);
      return []; // No data
    }
    
    const headers = headerLine.split('\t');
    const requiredColumns = ['month_nu', 'day_nu', 'count_nu'];
    const columnIndices = {
      // Basic required columns
      month: headers.indexOf('month_nu'),
      day: headers.indexOf('day_nu'),
      count: headers.indexOf('count_nu'),
      
      // Core statistics
      mean: headers.indexOf('mean_va'),
      min: headers.indexOf('min_va'),
      max: headers.indexOf('max_va'),
      
      // Full percentile range
      p05: headers.indexOf('p05_va'),
      p10: headers.indexOf('p10_va'),
      p20: headers.indexOf('p20_va'),
      p25: headers.indexOf('p25_va'),
      p50: headers.indexOf('p50_va'),
      p75: headers.indexOf('p75_va'),
      p80: headers.indexOf('p80_va'),
      p90: headers.indexOf('p90_va'),
      p95: headers.indexOf('p95_va'),
      
      // Period of record
      beginYear: headers.indexOf('begin_yr'),
      endYear: headers.indexOf('end_yr'),
      
      // Extreme value years
      maxYear: headers.indexOf('max_va_yr'),
      minYear: headers.indexOf('min_va_yr')
    };
    
    // Check for required columns
    if (columnIndices.month === -1 || columnIndices.day === -1 || columnIndices.count === -1) {
      const missingColumns = requiredColumns.filter(col => !headers.includes(col));
      throw new Error(`Invalid RDB format: missing required columns: ${missingColumns.join(', ')}`);
    }
    
    const results: USGSStatistics[] = [];
    const parseValue = (columns: string[], index: number): number | null => {
      if (index === -1 || !columns[index] || columns[index].trim() === '' || columns[index].trim() === 'na') {
        return null;
      }
      const value = parseFloat(columns[index].trim());
      return isNaN(value) ? null : value;
    };
    
    for (const line of dataLines) {
      const columns = line.split('\t');
      
      if (columns.length < Math.max(...Object.values(columnIndices).filter(i => i !== -1))) {
        console.warn(`Skipping malformed data row for site ${siteCode}: insufficient columns`);
        continue;
      }
      
      try {
        const month = parseInt(columns[columnIndices.month]);
        const day = parseInt(columns[columnIndices.day]);
        const count = parseInt(columns[columnIndices.count]) || 0;
        
        if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
          console.warn(`Invalid month/day values for site ${siteCode}: ${month}/${day}`);
          continue;
        }
        
        const dayOfYear = this.monthDayToDay(month, day);
        
        results.push({
          siteCode,
          dayOfYear,
          
          // Core statistics
          flow_mean: parseValue(columns, columnIndices.mean),
          flow_min: parseValue(columns, columnIndices.min),
          flow_max: parseValue(columns, columnIndices.max),
          
          // Full percentile range
          flow_p05: parseValue(columns, columnIndices.p05),
          flow_p10: parseValue(columns, columnIndices.p10),
          flow_p20: parseValue(columns, columnIndices.p20),
          flow_p25: parseValue(columns, columnIndices.p25),
          flow_p50: parseValue(columns, columnIndices.p50),
          flow_p75: parseValue(columns, columnIndices.p75),
          flow_p80: parseValue(columns, columnIndices.p80),
          flow_p90: parseValue(columns, columnIndices.p90),
          flow_p95: parseValue(columns, columnIndices.p95),
          
          // Period of record
          periodBeginYear: parseValue(columns, columnIndices.beginYear),
          periodEndYear: parseValue(columns, columnIndices.endYear),
          
          // Extreme value years
          maxValueYear: parseValue(columns, columnIndices.maxYear),
          minValueYear: parseValue(columns, columnIndices.minYear),
          
          // Data quality
          observationCount: count,
          
          // Deprecated (maintain for backward compatibility)
          yearsOfRecord: count,
        });
      } catch (error) {
        console.warn(`Error parsing data row for site ${siteCode}:`, error);
        continue; // Skip problematic rows
      }
    }
    
    if (results.length === 0 && dataLines.length > 0) {
      throw new Error(`No valid data rows found in RDB response for site ${siteCode}`);
    }
    
    return results;
  }
  
  private monthDayToDay(month: number, day: number): number {
    // Validate input
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}`);
    }
    if (day < 1 || day > 31) {
      throw new Error(`Invalid day: ${day}`);
    }
    
    // Calculate day of year assuming leap year (366 days)
    // This handles Feb 29 correctly
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    // Additional validation for days in specific months
    if (day > daysInMonth[month - 1]) {
      throw new Error(`Invalid day ${day} for month ${month}`);
    }
    
    let dayOfYear = day;
    for (let i = 0; i < month - 1; i++) {
      dayOfYear += daysInMonth[i];
    }
    
    return dayOfYear;
  }
}