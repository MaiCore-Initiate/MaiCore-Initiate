export type Page = 'home' | 'instances' | 'config' | 'knowledge' | 'db-migration' | 'plugins' | 'deploy' | 'status' | 'logs' | 'misc' | 'settings' | 'component-download' | 'template-workbench'
export type MiscTab = 'about' | 'author' | 'tech' | 'libs' | 'license' | 'components' | 'webshell' | 'screensaver' | 'desktop-pet' | 'custom-console'

// 子页面参数类型
export interface SubPageParams {
  miscTab?: MiscTab
  configAction?: 'edit' | 'open-config' | 'open-folder'
  logSource?: 'main' | 'webui' | 'desktop_pet'
}

export interface Tab {
  id: string
  page: Page
  label: string
  params?: SubPageParams  // 新增：子页面参数
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
