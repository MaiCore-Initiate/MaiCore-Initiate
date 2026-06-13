// 配置 Monaco Editor 的 Web Worker 加载方式（本地 monaco-editor 包，不走 CDN）
// 在 main.tsx 顶部 import './monaco-env'

interface MonacoEnvironmentConfig {
  getWorkerUrl?: (moduleId: string, label: string) => string
  getWorker?: (moduleId: string, label: string) => Worker
}

const config: MonacoEnvironmentConfig = {
  getWorkerUrl(_moduleId: string, label: string) {
    if (label === 'json') {
      return new URL('monaco-editor/esm/vs/language/json/json.worker?worker', import.meta.url).toString()
    }
    if (label === 'typescript' || label === 'javascript') {
      return new URL('monaco-editor/esm/vs/language/typescript/ts.worker?worker', import.meta.url).toString()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new URL('monaco-editor/esm/vs/language/css/css.worker?worker', import.meta.url).toString()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new URL('monaco-editor/esm/vs/language/html/html.worker?worker', import.meta.url).toString()
    }
    return new URL('monaco-editor/esm/vs/editor/editor.worker?worker', import.meta.url).toString()
  },
}

;(globalThis as unknown as { MonacoEnvironment: MonacoEnvironmentConfig }).MonacoEnvironment = config

export {}
