import { pool } from '../lib/db';

export interface Observation {
  parameterCode: string;
  value: number;
  unit: string;
  qualityCode: string;
  timestamp: Date;
}

export interface ValidationResult {
  isValid: boolean;
  flags: string[];
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface FreshnessResult {
  status: 'current' | 'stale' | 'offline';
  ageMinutes: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  anomalyType?: 'SUDDEN_SPIKE' | 'SUDDEN_DROP' | 'GRADUAL_DRIFT';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  note?: string;
}

export interface SensorStatus {
  status: 'online' | 'offline' | 'unknown';
  lastValue: number | null;
  dataAge: number | null; // minutes
  qualityCode?: string;
}

export class DataQualityManager {
  // Validation thresholds for different parameters
  private readonly THRESHOLDS = {
    '00060': { // Flow (CFS)
      min: 0,
      max: 100000,
      extremeHigh: 10000,
    },
    '00010': { // Temperature (deg F)
      min: 32,
      max: 85,
      extremeLow: 28,
      extremeHigh: 90,
    },
    '63680': { // Turbidity (FNU)
      min: 0,
      max: 4000,
    },
  };

  private readonly FRESHNESS_THRESHOLDS = {
    staleMinutes: 60,    // 1 hour
    offlineMinutes: 120, // 2 hours
  };

  validateObservation(observation: Observation): ValidationResult {
    const flags: string[] = [];
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    const thresholds = this.THRESHOLDS[observation.parameterCode as keyof typeof this.THRESHOLDS];
    
    if (!thresholds) {
      // Unknown parameter, minimal validation
      return { isValid: true, flags: [] };
    }

    // Flow-specific validations
    if (observation.parameterCode === '00060') {
      if (observation.value < 0) {
        flags.push('NEGATIVE_FLOW');
        severity = 'HIGH';
      }
      if (observation.value > thresholds.extremeHigh!) {
        flags.push('EXTREME_HIGH_FLOW');
        severity = 'HIGH';
      }
    }

    // Temperature-specific validations
    if (observation.parameterCode === '00010') {
      if (observation.value < thresholds.extremeLow! || observation.value > thresholds.extremeHigh!) {
        flags.push('EXTREME_TEMPERATURE');
        severity = 'HIGH';
      }
    }

    // Turbidity-specific validations
    if (observation.parameterCode === '63680') {
      if (observation.value < 0) {
        flags.push('NEGATIVE_TURBIDITY');
        severity = 'HIGH';
      }
    }

    // General range validation
    if (observation.value < thresholds.min || observation.value > thresholds.max) {
      flags.push('OUT_OF_RANGE');
      severity = 'MEDIUM';
    }

    return {
      isValid: flags.length === 0,
      flags,
      severity: flags.length > 0 ? severity : undefined,
    };
  }

  checkDataFreshness(timestamp: Date): FreshnessResult {
    const now = new Date();
    const ageMs = now.getTime() - timestamp.getTime();
    const ageMinutes = Math.floor(ageMs / (1000 * 60));

    let status: 'current' | 'stale' | 'offline';
    
    if (ageMinutes <= this.FRESHNESS_THRESHOLDS.staleMinutes) {
      status = 'current';
    } else if (ageMinutes <= this.FRESHNESS_THRESHOLDS.offlineMinutes) {
      status = 'stale';
    } else {
      status = 'offline';
    }

    return { status, ageMinutes };
  }

  async detectAnomalies(siteId: number, parameterCode: string, currentValue: number): Promise<AnomalyResult> {
    try {
      // Get recent historical data (last 2 hours)
      const historicalResult = await pool.query(`
        SELECT timestamp, value 
        FROM observations_current 
        WHERE site_id = $1 
          AND parameter_code = $2 
          AND timestamp >= NOW() - INTERVAL '2 hours'
        ORDER BY timestamp DESC
        LIMIT 10
      `, [siteId, parameterCode]);

      const historicalData = historicalResult.rows;

      if (historicalData.length < 3) {
        return {
          isAnomaly: false,
          note: 'insufficient historical data for anomaly detection'
        };
      }

      // Calculate recent average and standard deviation
      const values = historicalData.map(row => parseFloat(row.value));
      const average = values.reduce((a, b) => a + b) / values.length;
      const stdDev = Math.sqrt(values.map(x => Math.pow(x - average, 2)).reduce((a, b) => a + b) / values.length);

      // Check for anomalies (using 3-sigma rule)
      const zScore = Math.abs((currentValue - average) / (stdDev || 1));
      
      if (zScore > 3) {
        const anomalyType = currentValue > average ? 'SUDDEN_SPIKE' : 'SUDDEN_DROP';
        const severity: 'HIGH' | 'MEDIUM' | 'LOW' = zScore > 5 ? 'HIGH' : zScore > 4 ? 'MEDIUM' : 'LOW';
        
        return {
          isAnomaly: true,
          anomalyType,
          severity,
        };
      }

      return { isAnomaly: false };
    } catch (error) {
      console.error('Error detecting anomalies:', error);
      return { isAnomaly: false, note: 'error during anomaly detection' };
    }
  }

  async getSensorStatus(siteId: number, parameterCode: string): Promise<SensorStatus> {
    try {
      const result = await pool.query(`
        SELECT value, timestamp, data_quality_code
        FROM observations_current 
        WHERE site_id = $1 AND parameter_code = $2
        ORDER BY timestamp DESC
        LIMIT 1
      `, [siteId, parameterCode]);

      if (result.rows.length === 0) {
        return {
          status: 'unknown',
          lastValue: null,
          dataAge: null,
        };
      }

      const row = result.rows[0];
      const timestamp = new Date(row.timestamp);
      const freshnessResult = this.checkDataFreshness(timestamp);
      
      const status = freshnessResult.status === 'offline' ? 'offline' : 'online';

      return {
        status,
        lastValue: parseFloat(row.value),
        dataAge: freshnessResult.ageMinutes,
        qualityCode: row.data_quality_code,
      };
    } catch (error) {
      console.error('Error getting sensor status:', error);
      return {
        status: 'unknown',
        lastValue: null,
        dataAge: null,
      };
    }
  }

  calculateQualityScore(observation: Observation): number {
    let score = 1.0;

    // Factor in data quality code
    switch (observation.qualityCode) {
      case 'A': // Approved
        score *= 1.0;
        break;
      case 'P': // Provisional
        score *= 0.8;
        break;
      case 'E': // Estimated
        score *= 0.6;
        break;
      default: // Unknown quality
        score *= 0.4;
    }

    // Factor in data age
    const freshnessResult = this.checkDataFreshness(observation.timestamp);
    switch (freshnessResult.status) {
      case 'current':
        score *= 1.0;
        break;
      case 'stale':
        score *= 0.7;
        break;
      case 'offline':
        score *= 0.2;
        break;
    }

    // Factor in validation results
    const validation = this.validateObservation(observation);
    if (!validation.isValid) {
      switch (validation.severity) {
        case 'HIGH':
          score *= 0.1;
          break;
        case 'MEDIUM':
          score *= 0.4;
          break;
        case 'LOW':
          score *= 0.8;
          break;
      }
    }

    return Math.max(0, Math.min(1, score));
  }
}