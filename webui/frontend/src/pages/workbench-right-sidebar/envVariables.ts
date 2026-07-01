import type {
  WorkbenchEnvVariableEntry,
  WorkbenchVersionFormattingRule,
} from '../workbench-canvas/types'
import type { ArrayListPresetOption } from './types'

// TOML 内联字符串字段解析：从 `key = "..."` 形式提取值。
export function parseTomlInlineStringField(source: string, key: string) {
  const pattern = new RegExp(`${key}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`)
  const match = pattern.exec(source)
  return match?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\') ?? null
}

// 从字符串值中提取环境变量名：先看 toml 内联 name，再看 {{env|...}} 占位，最后看是否是合法变量名。
export function extractEnvNameFromString(value: string) {
  const inlineName = parseTomlInlineStringField(value, 'name')
  if (inlineName) return inlineName

  const envPlaceholder = value.match(/\{\{env\|([^}]+)}}/)
  if (envPlaceholder?.[1]) return envPlaceholder[1]

  const trimmed = value.trim()
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) ? trimmed : null
}

export function extractEnvName(value: string | WorkbenchEnvVariableEntry) {
  if (typeof value !== 'string') {
    const name = value.name.trim()
    return name || extractEnvNameFromString(value.value)
  }

  return extractEnvNameFromString(value)
}

export function normalizeEnvVariableEntry(value: WorkbenchEnvVariableEntry | string): WorkbenchEnvVariableEntry {
  if (typeof value !== 'string') {
    return { name: value.name ?? '', value: value.value ?? '' }
  }

  const name = extractEnvNameFromString(value) ?? ''
  const inlineValue = parseTomlInlineStringField(value, 'value')
  return { name, value: inlineValue ?? value }
}

export function normalizeEnvVariableEntries(values: Array<WorkbenchEnvVariableEntry | string> | undefined) {
  return (values ?? []).map(normalizeEnvVariableEntry)
}

export function envVariableEntriesEqual(left: WorkbenchEnvVariableEntry[], right: WorkbenchEnvVariableEntry[]) {
  return left.length === right.length && left.every((value, index) => (
    value.name === right[index].name && value.value === right[index].value
  ))
}

export function createEnvVariableName(...parts: string[]) {
  const normalized = parts
    .filter(Boolean)
    .join('_')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  return normalized || 'VARIABLE'
}

export function uniquePresetOptions(options: ArrayListPresetOption[]) {
  const seen = new Set<string>()
  return options.filter(option => {
    if (!option.value || seen.has(option.value)) return false
    seen.add(option.value)
    return true
  })
}

export function createEnvInputValue(name: string) {
  return `{{env|${name}}}`
}

// 自定义源里是否包含 .ts / .java / .jar 文件（决定是否需要 Deno / JVM 权限字段）。
export function hasDenoCustomSource(values: string[]) {
  return values.some(value => value.toLowerCase().includes('.ts'))
}

export function hasJvmCustomSource(values: string[]) {
  return values.some(value => {
    const normalized = value.toLowerCase()
    return normalized.includes('.java') || normalized.includes('.jar')
  })
}

export function formattingRulesEqual(left: WorkbenchVersionFormattingRule[], right: WorkbenchVersionFormattingRule[]) {
  return left.length === right.length && left.every((value, index) => (
    value.match === right[index].match && value.replace === right[index].replace
  ))
}
