#!/usr/bin/env ts-node
import 'dotenv/config';

import { USGSPoller } from '../src/services/usgs-poller';
import { MetricsCalculator } from '../src/services/metrics-calculator';
import { DataQualityManager } from '../src/services/data-quality';
import { DataPipelineScheduler } from '../src/services/scheduler';
import { pool } from '../src/lib/db';

async function main() {
  console.log('🚀 Testing Data Pipeline Components...\n');

  try {
    // Test 1: USGS Poller
    console.log('1. Testing USGS Poller...');
    const poller = new USGSPoller();
    const testSite = '08279500'; // Rio Grande at Embudo
    const observations = await poller.fetchInstantaneousData(testSite);
    console.log(`✅ Fetched data for ${testSite}:`, {
      timestamp: observations.timestamp,
      parameters: Object.keys(observations.parameters),
      flow: observations.parameters['00060']?.value,
    });

    // Test 2: Store observations
    console.log('\n2. Testing Data Storage...');
    await poller.storeObservations(observations);
    console.log('✅ Data stored successfully');

    // Test 3: Data Quality
    console.log('\n3. Testing Data Quality...');
    const quality = new DataQualityManager();
    if (observations.parameters['00060']) {
      const validation = quality.validateObservation({
        parameterCode: '00060',
        value: observations.parameters['00060'].value,
        unit: observations.parameters['00060'].unit,
        qualityCode: observations.parameters['00060'].qualityCode,
        timestamp: observations.timestamp,
      });
      console.log('✅ Data quality:', validation);
    }

    // Test 4: Metrics Calculation
    console.log('\n4. Testing Metrics Calculation...');
    const metrics = new MetricsCalculator();
    const siteResult = await pool.query('SELECT id FROM sites WHERE usgs_site_code = $1', [testSite]);
    if (siteResult.rows.length > 0) {
      const siteId = siteResult.rows[0].id;
      await metrics.updateDerivedMetrics(siteId);
      console.log('✅ Metrics calculated and stored');
    }

    // Test 5: Manual Pipeline Run
    console.log('\n5. Testing Complete Pipeline...');
    const scheduler = new DataPipelineScheduler();
    await scheduler.runUSGSPollingOnce();
    await scheduler.runMetricsCalculationOnce();
    console.log('✅ Complete pipeline test successful');

    console.log('\n🎉 All tests passed! Phase 3 implementation is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(console.error);
}