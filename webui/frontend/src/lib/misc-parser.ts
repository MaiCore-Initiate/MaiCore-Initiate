/**
 * Markdown 内容解析器
 * 用于解析 misc-content.md 文件
 */

export interface Contributor {
  name: string
  username: string
  github: string
  role: string
  desc: string
  fallbackColor: string
  fallbackInitial: string
}

export interface TechItem {
  name: string
  version: string
  desc: string
}

export interface Library {
  name: string
  license: string
  desc: string
}

export interface MiscContent {
  about: string
  author: {
    contributors: Contributor[]
    footer: string
  }
  tech: {
    backend: TechItem[]
    frontend: TechItem[]
    database: TechItem[]
    toolchain: TechItem[]
  }
  libs: {
    libraries: Library[]
    footer: string
  }
  license: string
}

/**
 * 解析 Markdown 内容
 */
export async function parseMiscContent(): Promise<MiscContent> {
  try {
    const response = await fetch('/misc-content.md')
    const text = await response.text()

    // 按 SECTION 分割内容
    const sections = extractSections(text)

    return {
      about: cleanMarkdownForDisplay(sections.about || ''),
      author: parseAuthorSection(sections.author || ''),
      tech: parseTechSection(sections.tech || ''),
      libs: parseLibsSection(sections.libs || ''),
      license: cleanMarkdownForDisplay(sections.license || '')
    }
  } catch (error) {
    console.error('Failed to parse misc content:', error)
    throw error
  }
}

/**
 * 清理 Markdown 内容，移除特殊代码块
 */
function cleanMarkdownForDisplay(content: string): string {
  // 移除 contributors 代码块
  content = content.replace(/```contributors[\s\S]*?```/g, '')
  // 移除 tech-items 代码块
  content = content.replace(/```tech-items[\s\S]*?```/g, '')
  // 移除 libraries 代码块
  content = content.replace(/```libraries[\s\S]*?```/g, '')
  // 清理多余的空行
  content = content.replace(/\n{3,}/g, '\n\n')
  return content.trim()
}

function extractJsonBlock<T = any>(content: string, tag: string): T[] {
  // 直接基于字符串查找，避免正则转义/换行差异导致匹配失败
  const marker = '```' + tag
  const start = content.indexOf(marker)
  if (start === -1) return []

  const rest = content.slice(start + marker.length)
  const end = rest.indexOf('```')
  if (end === -1) return []

  const jsonText = rest.slice(0, end).replace(/\r/g, '').trim()
  try {
    return JSON.parse(jsonText)
  } catch (error) {
    console.error(`Failed to parse ${tag} block:`, error)
    return []
  }
}

/**
 * 提取各个 SECTION
 */
function extractSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const sectionRegex = /<!-- SECTION: (\w+) -->([\s\S]*?)<!-- \/SECTION -->/g

  let match
  while ((match = sectionRegex.exec(text)) !== null) {
    const [, sectionName, content] = match
    sections[sectionName] = content.trim()
  }

  return sections
}

/**
 * 解析作者部分
 */
function parseAuthorSection(content: string): MiscContent['author'] {
  const contributors = extractJsonBlock<Contributor>(content, 'contributors')

  // 提取底部文字（blockquote）
  const footerMatch = content.match(/>\s*(.+?)(?:\n|$)/)
  const footer = footerMatch ? footerMatch[1] : ''

  return { contributors, footer }
}

/**
 * 解析技术栈部分
 */
function parseTechSection(content: string): MiscContent['tech'] {
  // 移除 HTML 注释块，防止注释内的代码块干扰解析
  const cleaned = content.replace(/<!--[\s\S]*?-->/g, '')
  const sections = cleaned.split(/###\s+/)

  const result: MiscContent['tech'] = {
    backend: [],
    frontend: [],
    database: [],
    toolchain: []
  }

  for (const section of sections) {
    // 只检查 section 开头的标题行（第一行），避免内容中的文字干扰
    const titleLine = section.split('\n')[0].replace(/\r/g, '')
    if (titleLine.includes('后端')) {
      result.backend = extractJsonBlock(section, 'tech-items')
    } else if (titleLine.includes('工具链')) {
      result.toolchain = extractJsonBlock(section, 'tech-items')
    } else if (titleLine.includes('数据库')) {
      result.database = extractJsonBlock(section, 'tech-items')
    } else if (titleLine.includes('前端')) {
      result.frontend = extractJsonBlock(section, 'tech-items')
    }
  }

  return result
}

/**
 * 解析开源库部分
 */
function parseLibsSection(content: string): MiscContent['libs'] {
  const libraries = extractJsonBlock<Library>(content, 'libraries')

  // 提取底部文字（blockquote）
  const footerMatch = content.match(/>\s*(.+?)(?:\n|$)/)
  const footer = footerMatch ? footerMatch[1] : ''

  return { libraries, footer }
}
