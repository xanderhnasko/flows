import { pool } from '../lib/db';

export interface USGSStatistics {
  siteCode: string;
  dayOfYear: number;
  flow_p10: number;
  flow_p25: number;
  flow_p50: number;
  flow_p75: number;
  flow_p90: number;
  yearsOfRecord: number;
}

export class USGSStatisticsService {
  private readonly USGS_STATS_URL = 'https://waterservices.usgs.gov/nwis/stat/';

  async fetchSiteStatistics(siteCode: string): Promise<USGSStatistics[]> {
    const url = `${this.USGS_STATS_URL}?sites=${siteCode}&statReportType=daily&statTypeCd=all&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`USGS Statistics API failed: ${response.status}`);
    }

    const data = await response.json();
    // Parse USGS statistics response and return daily percentiles
    // This is the missing piece for accurate z-scores
    
    return []; // TODO: Implement parsing
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
    // Store in statistics_daily table
    // This enables accurate z-score calculations
  }
}