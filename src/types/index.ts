// Core database entity types
export interface Site {
  id: number
  usgs_site_code: string
  name: string
  river: string
  latitude: number
  longitude: number
  timezone: string
  has_turbidity: boolean
  has_ph: boolean
  has_do: boolean
  active: boolean
  created_at: Date
}

export interface ObservationCurrent {
  site_id: number
  parameter_code: string
  value: number | null
  unit: string
  timestamp: Date
  data_quality_code: string
}

export interface ObservationDaily {
  site_id: number
  date: Date
  flow_mean: number | null
  flow_min: number | null
  flow_max: number | null
  temp_mean: number | null
  temp_min: number | null
  temp_max: number | null
}

export interface StatisticsDaily {
  site_id: number
  day_of_year: number
  flow_p10: number | null
  flow_p25: number | null
  flow_p50: number | null
  flow_p75: number | null
  flow_p90: number | null
  years_of_record: number
  last_updated: Date
}

export interface Reservoir {
  id: number
  name: string
  river: string
  rise_location_id: string
  associated_site_id: number | null
  active: boolean
}

export interface ReservoirRelease {
  reservoir_id: number
  timestamp: Date
  release_cfs: number | null
  elevation_ft: number | null
  storage_af: number | null
}

export interface DerivedMetrics {
  site_id: number
  calculated_at: Date
  flow_z_score: number | null
  flow_status: string
  flow_trend: string
  flow_trend_6h_slope: number | null
}

// API response types
export interface SiteWithConditions {
  id: string
  name: string
  river: string
  coordinates: [number, number]
  current: {
    flow: {
      value: number
      unit: "cfs"
      trend: string
      z_score: number
      status: string
    }
    temperature: {
      value: number
      unit: "F"
    }
    turbidity?: {
      value: number
      unit: "NTU" | "FNU"
    }
    ph?: {
      value: number
    }
    dissolved_oxygen?: {
      value: number
      unit: "mg/L"
    }
    updated_at: string
  }
}

export interface TimeSeriesData {
  site_id: string
  data: {
    flow?: Array<{
      timestamp: string
      value: number
      percentiles?: {
        p10: number
        p25: number
        p50: number
        p75: number
        p90: number
      }
    }>
    temperature?: Array<{
      timestamp: string
      value: number
    }>
    turbidity?: Array<{
      timestamp: string
      value: number
    }>
  }
}

export interface ReservoirData {
  id: string
  name: string
  current_release: number
  elevation: number
  last_updated: string
  recent_changes: Array<{
    timestamp: string
    release_cfs: number
  }>
}

// USGS API response types
export interface USGSTimeSeriesResponse {
  name: string
  declaredType: string
  scope: string
  value: {
    queryInfo: {
      queryURL: string
      criteria: {
        locationParam: string
        variableParam: string
      }
    }
    timeSeries: Array<{
      sourceInfo: {
        siteName: string
        siteCode: Array<{
          value: string
          network: string
          agencyCode: string
        }>
        geoLocation: {
          geogLocation: {
            srs: string
            latitude: number
            longitude: number
          }
        }
      }
      variable: {
        variableCode: Array<{
          value: string
          network: string
          vocabulary: string
        }>
        variableName: string
        variableDescription: string
        unit: {
          unitCode: string
        }
      }
      values: Array<{
        value: Array<{
          value: string
          qualifiers: Array<string>
          dateTime: string
        }>
        qualifier: Array<{
          qualifierCode: string
          qualifierDescription: string
        }>
        qualityControlLevel: Array<any>
        method: Array<any>
        source: Array<any>
      }>
    }>
  }
}

// Flow status types
export type FlowStatus = "Very Low" | "Below Normal" | "Normal" | "Above Normal" | "Very High"
export type FlowTrend = "Rising" | "Steady" | "Falling"
export type DataQuality = "current" | "stale" | "offline"

// Parameter codes
export const PARAMETER_CODES = {
  FLOW: "00060",
  TEMPERATURE: "00010", 
  TURBIDITY_FNU: "63680",
  TURBIDITY_NTU: "00076",
  PH: "00400",
  DISSOLVED_OXYGEN: "00300"
} as const

export type ParameterCode = typeof PARAMETER_CODES[keyof typeof PARAMETER_CODES]