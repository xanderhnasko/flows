import { pool } from '../lib/db';

export interface FlowZScoreResult {
  zScore: number | null;
  status: 'Very Low' | 'Below Normal' | 'Normal' | 'Above Normal' | 'Very High' | 'Unknown';
  percentileRange?: {
    p25: number;
    p50: number;
    p75: number;
  };
  note?: string;
}

export interface FlowTrendResult {
  trend: 'Rising' | 'Falling' | 'Steady' | 'Unknown';
  slope: number | null;
  changePercent: number;
  method: 'Theil-Sen' | 'Linear';
  note?: string;
}

export interface Point {
  x: number;
  y: number;
}

export class MetricsCalculator {
  
  async calculateFlowZScore(siteId: number, currentFlow: number, dayOfYear: number): Promise<FlowZScoreResult> {
    try {
      // Get daily statistics for this day of year
      const statsResult = await pool.query(`
        SELECT flow_p10, flow_p25, flow_p50, flow_p75, flow_p90, years_of_record
        FROM statistics_daily 
        WHERE site_id = $1 AND day_of_year = $2
      `, [siteId, dayOfYear]);

      if (statsResult.rows.length === 0) {
        return {
          zScore: null,
          status: 'Unknown',
          note: 'statistics not available for this day of year'
        };
      }

      const stats = statsResult.rows[0];
      const { flow_p25, flow_p50, flow_p75 } = stats;

      // Use IQR method for z-score calculation
      const median = parseFloat(flow_p50);
      const iqr = parseFloat(flow_p75) - parseFloat(flow_p25);

      if (iqr === 0) {
        return {
          zScore: null,
          status: 'Normal',
          note: 'no variability in historical data',
          percentileRange: {
            p25: parseFloat(flow_p25),
            p50: parseFloat(flow_p50),
            p75: parseFloat(flow_p75),
          }
        };
      }

      const zScore = (currentFlow - median) / iqr;
      const status = this.classifyZScore(zScore);

      return {
        zScore,
        status,
        percentileRange: {
          p25: parseFloat(flow_p25),
          p50: parseFloat(flow_p50),
          p75: parseFloat(flow_p75),
        }
      };
    } catch (error) {
      console.error('Error calculating z-score:', error);
      return {
        zScore: null,
        status: 'Unknown',
        note: 'error calculating z-score'
      };
    }
  }

  async calculateFlowTrend(siteId: number): Promise<FlowTrendResult> {
    try {
      // Get last 6 hours of data (24 points at 15-min intervals)
      const trendResult = await pool.query(`
        SELECT timestamp, value
        FROM observations_current 
        WHERE site_id = $1 
          AND parameter_code = '00060'
          AND timestamp >= NOW() - INTERVAL '6 hours'
        ORDER BY timestamp ASC
      `, [siteId]);

      const data = trendResult.rows;

      if (data.length < 2) {
        return {
          trend: 'Unknown',
          slope: null,
          changePercent: 0,
          method: 'Theil-Sen',
          note: 'insufficient data for trend calculation'
        };
      }

      // Convert to time series points (x = hours since start, y = flow)
      const startTime = new Date(data[0].timestamp).getTime();
      const points: Point[] = data.map(row => ({
        x: (new Date(row.timestamp).getTime() - startTime) / (1000 * 60 * 60), // hours
        y: parseFloat(row.value)
      }));

      // Calculate slope using Theil-Sen estimator
      const slope = this.theilSenEstimator(points);
      
      // Calculate percent change over the period
      const firstValue = points[0].y;
      const lastValue = points[points.length - 1].y;
      const changePercent = ((lastValue - firstValue) / firstValue) * 100;

      // Classify trend based on percent change threshold (5%)
      let trend: 'Rising' | 'Falling' | 'Steady';
      if (Math.abs(changePercent) <= 5) {
        trend = 'Steady';
      } else if (changePercent > 5) {
        trend = 'Rising';
      } else {
        trend = 'Falling';
      }

      return {
        trend,
        slope,
        changePercent,
        method: 'Theil-Sen'
      };
    } catch (error) {
      console.error('Error calculating flow trend:', error);
      return {
        trend: 'Unknown',
        slope: null,
        changePercent: 0,
        method: 'Theil-Sen',
        note: 'error calculating trend'
      };
    }
  }

  async updateDerivedMetrics(siteId: number): Promise<void> {
    try {
      // Get current flow observation
      const flowResult = await pool.query(`
        SELECT value, timestamp 
        FROM observations_current 
        WHERE site_id = $1 AND parameter_code = $2
      `, [siteId, '00060']);

      let zScore = null;
      let status = 'Unknown';
      let trend = 'Unknown';
      let slope = null;

      if (flowResult.rows.length > 0) {
        const currentFlow = parseFloat(flowResult.rows[0].value);
        const timestamp = new Date(flowResult.rows[0].timestamp);
        const dayOfYear = this.getDayOfYear(timestamp);

        // Calculate z-score
        const zScoreResult = await this.calculateFlowZScore(siteId, currentFlow, dayOfYear);
        zScore = zScoreResult.zScore;
        status = zScoreResult.status;

        // Calculate trend
        const trendResult = await this.calculateFlowTrend(siteId);
        trend = trendResult.trend;
        slope = trendResult.slope;
      }

      // Store in derived_metrics table
      await pool.query(`
        INSERT INTO derived_metrics (
          site_id, 
          calculated_at, 
          flow_z_score, 
          flow_status, 
          flow_trend, 
          flow_trend_6h_slope
        ) VALUES ($1, NOW(), $2, $3, $4, $5)
        ON CONFLICT (site_id) 
        DO UPDATE SET
          calculated_at = NOW(),
          flow_z_score = EXCLUDED.flow_z_score,
          flow_status = EXCLUDED.flow_status,
          flow_trend = EXCLUDED.flow_trend,
          flow_trend_6h_slope = EXCLUDED.flow_trend_6h_slope
      `, [siteId, zScore, status, trend, slope]);

    } catch (error) {
      console.error(`Error updating derived metrics for site ${siteId}:`, error);
      throw error;
    }
  }

  async updateAllSiteMetrics(): Promise<void> {
    try {
      // Get all active sites with flow data
      const sitesResult = await pool.query(
        'SELECT id FROM sites WHERE active = true AND has_flow = true'
      );

      const sites = sitesResult.rows;
      console.log(`Updating derived metrics for ${sites.length} sites`);

      for (const site of sites) {
        try {
          await this.updateDerivedMetrics(site.id);
        } catch (error) {
          console.error(`Error updating metrics for site ${site.id}:`, error);
          // Continue with other sites
        }
      }

      console.log('Completed derived metrics update');
    } catch (error) {
      console.error('Error updating all site metrics:', error);
      throw error;
    }
  }

  // Helper methods
  classifyZScore(zScore: number): 'Very Low' | 'Below Normal' | 'Normal' | 'Above Normal' | 'Very High' {
    if (zScore <= -2) return 'Very Low';
    if (zScore < -1) return 'Below Normal';
    if (zScore >= 2) return 'Very High';
    if (zScore >= 1) return 'Above Normal';
    return 'Normal';
  }

  theilSenEstimator(points: Point[]): number {
    if (points.length < 2) return 0;

    const slopes: number[] = [];
    
    // Calculate slope between every pair of points
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        if (dx !== 0) {
          const slope = (points[j].y - points[i].y) / dx;
          slopes.push(slope);
        }
      }
    }

    if (slopes.length === 0) return 0;

    // Return median slope
    slopes.sort((a, b) => a - b);
    const mid = Math.floor(slopes.length / 2);
    
    if (slopes.length % 2 === 0) {
      return (slopes[mid - 1] + slopes[mid]) / 2;
    } else {
      return slopes[mid];
    }
  }

  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }
}