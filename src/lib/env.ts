// Environment variable validation and types
export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  USGS_BASE_URL: process.env.USGS_BASE_URL || 'https://waterservices.usgs.gov',
  RISE_BASE_URL: process.env.RISE_BASE_URL || 'https://data.usbr.gov/rise-api',
  RISE_API_KEY: process.env.RISE_API_KEY || '',
  TZ: process.env.TZ || 'America/Denver',
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const

// Validate required environment variables
export function validateEnv() {
  const required = ['DATABASE_URL'] as const
  
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
}