import { pool } from '../lib/db';

export interface ParameterData {
  value: number;
  unit: string;
  qualityCode: string;
}

export interface ObservationData {
  siteCode: string;
  timestamp: Date;
  parameters: { [parameterCode: string]: ParameterData };
}

export class USGSPoller {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis/iv/';

  constructor() {
    // Initialize poller
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  async fetchInstantaneousData(siteCode: string): Promise<ObservationData> {
    const url = `${this.USGS_BASE_URL}?sites=${siteCode}&parameterCd=00060,00010,63680&format=json&siteStatus=active`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NM-StreamConditions/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`USGS API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const timeSeries = data.value?.timeSeries || [];

    const parameters: { [key: string]: ParameterData } = {};

    for (const series of timeSeries) {
      const paramCode = series.variable?.variableCode?.[0]?.value;
      const unit = series.variable?.unit?.unitCode;
      const values = series.values?.[0]?.value;

      if (paramCode && values && values.length > 0) {
        const latestValue = values[values.length - 1];
        parameters[paramCode] = {
          value: parseFloat(latestValue.value),
          unit: unit || '',
          qualityCode: latestValue.qualifiers?.[0] || '',
        };
      }
    }

    // Use the timestamp from the first parameter or current time
    let timestamp = new Date();
    const firstParam = Object.values(parameters)[0];
    if (timeSeries.length > 0 && timeSeries[0].values?.[0]?.value?.[0]?.dateTime) {
      timestamp = new Date(timeSeries[0].values[0].value[0].dateTime);
    }

    return {
      siteCode,
      timestamp,
      parameters,
    };
  }

  async storeObservations(observations: ObservationData): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get site ID from site code
      const siteResult = await client.query(
        'SELECT id FROM sites WHERE usgs_site_code = $1',
        [observations.siteCode]
      );

      if (siteResult.rows.length === 0) {
        throw new Error(`Site not found: ${observations.siteCode}`);
      }

      const siteId = siteResult.rows[0].id;

      // Insert or update observations for each parameter
      for (const [paramCode, paramData] of Object.entries(observations.parameters)) {
        await client.query(`
          INSERT INTO observations_current (site_id, parameter_code, value, unit, timestamp, data_quality_code)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (site_id, parameter_code)
          DO UPDATE SET
            value = EXCLUDED.value,
            unit = EXCLUDED.unit,
            timestamp = EXCLUDED.timestamp,
            data_quality_code = EXCLUDED.data_quality_code
        `, [siteId, paramCode, paramData.value, paramData.unit, observations.timestamp, paramData.qualityCode]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async pollAllSites(): Promise<void> {
    const sitesResult = await pool.query('SELECT usgs_site_code, id FROM sites WHERE active = true');
    
    for (const site of sitesResult.rows) {
      try {
        const observations = await this.fetchInstantaneousData(site.usgs_site_code);
        await this.storeObservations(observations);
      } catch (error) {
        console.error(`Error polling site ${site.usgs_site_code}:`, error);
        // Continue with other sites even if one fails
      }
    }
  }

  startPolling(intervalMs: number = 5 * 60 * 1000): void {
    if (this.isRunning()) {
      console.log('Polling is already running');
      return;
    }

    this.intervalId = setInterval(() => {
      this.pollAllSites().catch(console.error);
    }, intervalMs);

    console.log(`Started USGS polling every ${intervalMs / 1000} seconds`);
  }

  stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Stopped USGS polling');
    }
  }
}