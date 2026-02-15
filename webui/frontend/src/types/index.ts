export type Page = 'home' | 'instances' | 'config' | 'knowledge' | 'db-migration' | 'plugins' | 'deploy' | 'status' | 'logs' | 'misc' | 'settings'

export interface Tab {
  id: string
  page: Page
  label: string
}

export interface SystemInfo {
  hostname: string
  os: string
  processor: string
  gpu: string
  total_memory_mb: number
  cpu_count: number
}

export interface SystemResources {
  cpu_percent: number
  memory_used_mb: number
  memory_total_mb: number
  cpu_count: number
}
