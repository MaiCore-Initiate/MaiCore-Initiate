// 侧边栏全局 UI 常量：字体、行高、宽度、选项、标签、表格布局
export const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"
export const fieldLineHeight = 30
export const fieldVerticalPadding = 7
export const fieldMinWidth = 142
export const fieldMaxWidth = 553
export const fieldMaxCollapsedLines = 5

export const rightSidebarExpandedWidth = 600
export const rightSidebarCollapsedWidth = 70
export const rightSidebarMinWidth = 200
export const rightSidebarMaxWidth = 760

export const runtimeOptions = ['powershell', 'pwsh', 'cmd', 'bash', 'python3', 'python', 'node', 'deno']
export const commandThemeOptions = ['oh-my-posh', 'classical']
export const getMethodOptions = ['direct', 'get_version', 'get_link']
export const deploymentGetMethodOptions = ['get_version', 'get_link']
export const getVersionOptions = ['github_repo', 'filelink', 'custom']
export const getLinkOptions = ['filelink', 'custom', 'user_input']
export const deployMethodOptions = ['auto', 'gitclone', '!gitclone', 'getfile']
export const installOperateOptions = ['auto', 'no', 'custom']
export const platformOptions = ['windows', 'linux', 'macos']

export const optionLabels: Record<string, string> = {
  powershell: 'PowerShell',
  pwsh: 'PowerShell Core',
  cmd: '命令提示符',
  bash: 'Bash',
  python3: 'Python 3',
  python: 'Python',
  node: 'Node.js',
  deno: 'Deno',
  classical: '经典',
  direct: '直接获取',
  get_version: '获取版本',
  get_link: '获取链接',
  github_repo: 'GitHub仓库',
  filelink: '文件链接',
  custom: '自定义',
  user_input: '用户输入',
  auto: '自动处理',
  gitclone: 'Git 克隆',
  '!gitclone': '强制 Git 克隆',
  getfile: '获取文件',
  no: '不处理',
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
}

export const inlineTableGap = 8
export const inlineTableCellMinWidth = 66
export const inlineTablePreferredMinWidth = 132
