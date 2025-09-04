import { USGSPoller } from './usgs-poller';
import { MetricsCalculator } from './metrics-calculator';
import { DataQualityManager } from './data-quality';

export interface SchedulerConfig {
  usgsPollingIntervalMs?: number;
  metricsCalculationIntervalMs?: number;
}

export interface JobInfo {
  jobId: string;
  intervalMs: number;
  lastExecution?: Date;
  executionCount: number;
  consecutiveFailures: number;
  averageExecutionTimeMs: number;
}

export interface JobStatus {
  totalJobs: number;
  runningJobs: number;
  jobs: {
    usgsPolling?: JobInfo;
    metricsCalculation?: JobInfo;
  };
}

export interface HealthStatus {
  usgsPolling: {
    status: 'healthy' | 'unhealthy';
    consecutiveFailures: number;
    averageExecutionTimeMs: number;
  };
  metricsCalculation: {
    status: 'healthy' | 'unhealthy';
    consecutiveFailures: number;
    averageExecutionTimeMs: number;
  };
}

export class DataPipelineScheduler {
  private usgsPoller: USGSPoller;
  private metricsCalculator: MetricsCalculator;
  private dataQuality: DataQualityManager;
  
  private jobs: Map<string, NodeJS.Timeout> = new Map();
  private jobInfo: Map<string, JobInfo> = new Map();
  private config: SchedulerConfig = {};

  constructor() {
    this.usgsPoller = new USGSPoller();
    this.metricsCalculator = new MetricsCalculator();
    this.dataQuality = new DataQualityManager();
  }

  startDataPipeline(config: SchedulerConfig = {}): void {
    // Validate configuration
    this.validateConfig(config);
    this.config = { ...this.getDefaultConfig(), ...config };

    // Don't start if already running
    if (this.isRunning()) {
      console.log('Data pipeline is already running');
      return;
    }

    console.log('Starting data pipeline scheduler...');
    
    // Start USGS polling job
    this.startUSGSPollingJob();
    
    // Start metrics calculation job
    this.startMetricsCalculationJob();

    console.log('Data pipeline scheduler started successfully');
  }

  stopAllJobs(): void {
    console.log('Stopping all scheduled jobs...');
    
    for (const [jobName, intervalId] of this.jobs.entries()) {
      clearInterval(intervalId);
      console.log(`Stopped job: ${jobName}`);
    }
    
    this.jobs.clear();
    this.jobInfo.clear();
    
    console.log('All jobs stopped');
  }

  isRunning(): boolean {
    return this.jobs.size > 0;
  }

  async runUSGSPollingOnce(): Promise<void> {
    const startTime = Date.now();
    try {
      await this.usgsPoller.pollAllSites();
      const executionTime = Date.now() - startTime;
      this.updateJobStats('usgsPolling', executionTime, false);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateJobStats('usgsPolling', executionTime, true);
      throw error;
    }
  }

  async runMetricsCalculationOnce(): Promise<void> {
    const startTime = Date.now();
    try {
      await this.metricsCalculator.updateAllSiteMetrics();
      const executionTime = Date.now() - startTime;
      this.updateJobStats('metricsCalculation', executionTime, false);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateJobStats('metricsCalculation', executionTime, true);
      throw error;
    }
  }

  getJobConfiguration(): { usgsPolling: JobInfo; metricsCalculation: JobInfo } {
    return {
      usgsPolling: this.jobInfo.get('usgsPolling') || this.createDefaultJobInfo('usgsPolling'),
      metricsCalculation: this.jobInfo.get('metricsCalculation') || this.createDefaultJobInfo('metricsCalculation'),
    };
  }

  getJobStatus(): JobStatus {
    const jobs = Array.from(this.jobInfo.entries()).reduce((acc, [name, info]) => {
      acc[name as keyof JobStatus['jobs']] = info;
      return acc;
    }, {} as JobStatus['jobs']);

    return {
      totalJobs: this.jobInfo.size,
      runningJobs: this.jobs.size,
      jobs,
    };
  }

  getHealthStatus(): HealthStatus {
    return {
      usgsPolling: this.getJobHealth('usgsPolling'),
      metricsCalculation: this.getJobHealth('metricsCalculation'),
    };
  }

  private startUSGSPollingJob(): void {
    const intervalMs = this.config.usgsPollingIntervalMs || 5 * 60 * 1000;
    const jobId = `usgs-polling-${Date.now()}`;
    
    this.initializeJobInfo('usgsPolling', jobId, intervalMs);
    
    const intervalId = setInterval(async () => {
      try {
        await this.runUSGSPollingOnce();
      } catch (error) {
        console.error('Error in USGS polling job:', error);
      }
    }, intervalMs);

    this.jobs.set('usgsPolling', intervalId);
  }

  private startMetricsCalculationJob(): void {
    const intervalMs = this.config.metricsCalculationIntervalMs || 10 * 60 * 1000;
    const jobId = `metrics-calculation-${Date.now()}`;
    
    this.initializeJobInfo('metricsCalculation', jobId, intervalMs);
    
    const intervalId = setInterval(async () => {
      try {
        await this.runMetricsCalculationOnce();
      } catch (error) {
        console.error('Error in metrics calculation job:', error);
      }
    }, intervalMs);

    this.jobs.set('metricsCalculation', intervalId);
  }

  private validateConfig(config: SchedulerConfig): void {
    if (config.usgsPollingIntervalMs && config.usgsPollingIntervalMs < 60 * 1000) {
      throw new Error('Invalid configuration: USGS polling interval must be at least 1 minute');
    }
    
    if (config.metricsCalculationIntervalMs && config.metricsCalculationIntervalMs <= 0) {
      throw new Error('Invalid configuration: Metrics calculation interval must be positive');
    }
  }

  private getDefaultConfig(): SchedulerConfig {
    return {
      usgsPollingIntervalMs: 5 * 60 * 1000, // 5 minutes
      metricsCalculationIntervalMs: 10 * 60 * 1000, // 10 minutes
    };
  }

  private initializeJobInfo(jobName: string, jobId: string, intervalMs: number): void {
    this.jobInfo.set(jobName, {
      jobId,
      intervalMs,
      executionCount: 0,
      consecutiveFailures: 0,
      averageExecutionTimeMs: 0,
    });
  }

  private createDefaultJobInfo(jobName: string): JobInfo {
    const config = this.getDefaultConfig();
    const intervalMs = jobName === 'usgsPolling' 
      ? config.usgsPollingIntervalMs! 
      : config.metricsCalculationIntervalMs!;
    
    return {
      jobId: `${jobName}-default`,
      intervalMs,
      executionCount: 0,
      consecutiveFailures: 0,
      averageExecutionTimeMs: 0,
    };
  }

  private updateJobStats(jobName: string, executionTimeMs: number, isFailure: boolean): void {
    const info = this.jobInfo.get(jobName);
    if (!info) return;

    info.lastExecution = new Date();
    info.executionCount++;
    
    // Update average execution time (simple moving average)
    info.averageExecutionTimeMs = info.averageExecutionTimeMs === 0
      ? executionTimeMs
      : (info.averageExecutionTimeMs + executionTimeMs) / 2;

    if (isFailure) {
      info.consecutiveFailures++;
    } else {
      info.consecutiveFailures = 0;
    }

    this.jobInfo.set(jobName, info);
  }

  private getJobHealth(jobName: string): { status: 'healthy' | 'unhealthy'; consecutiveFailures: number; averageExecutionTimeMs: number } {
    const info = this.jobInfo.get(jobName);
    
    if (!info) {
      return {
        status: 'unhealthy',
        consecutiveFailures: 0,
        averageExecutionTimeMs: 0,
      };
    }

    const status = info.consecutiveFailures >= 3 ? 'unhealthy' : 'healthy';
    
    return {
      status,
      consecutiveFailures: info.consecutiveFailures,
      averageExecutionTimeMs: info.averageExecutionTimeMs,
    };
  }
}