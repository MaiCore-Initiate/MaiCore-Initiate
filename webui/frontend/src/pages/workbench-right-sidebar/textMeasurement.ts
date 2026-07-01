import { fieldMaxWidth, fieldMinWidth, font, inlineTableCellMinWidth, inlineTableGap, inlineTablePreferredMinWidth } from './constants'

// Canvas 文本测量上下文缓存，单例（避免反复创建 canvas）。
let textMeasureContext: CanvasRenderingContext2D | null | undefined

function getTextMeasureContext() {
  if (textMeasureContext !== undefined) return textMeasureContext
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  textMeasureContext = canvas.getContext('2d')
  if (textMeasureContext) textMeasureContext.font = `300 20px ${font}`
  return textMeasureContext
}

export function measureTextWidth(value: string) {
  const context = getTextMeasureContext()
  if (context) return Math.ceil(context.measureText(value || ' ').width)

  let width = 0

  for (const char of value || ' ') {
    width += /[一-鿿]/.test(char) ? 20 : 11
  }

  return width
}

export function countWrappedLines(value: string, textWidth: number) {
  let lines = 1
  let lineWidth = 0

  for (const char of Array.from(value || ' ')) {
    const charWidth = measureTextWidth(char)
    if (lineWidth > 0 && lineWidth + charWidth > textWidth) {
      lines += 1
      lineWidth = charWidth
    } else {
      lineWidth += charWidth
    }
  }

  return lines
}

export function resolveFieldMetrics(value: string, maxWidth = fieldMaxWidth) {
  const lines = value.split('\n')
  const longestLineWidth = Math.max(...lines.map(line => measureTextWidth(line)))
  const desiredWidth = longestLineWidth + 30
  const width = Math.min(maxWidth, Math.max(fieldMinWidth, desiredWidth))
  const textWidth = Math.max(1, width - 20)
  const wrappedLines = lines.reduce((total, line) => total + countWrappedLines(line, textWidth), 0)

  return { width, lines: wrappedLines }
}

export function resolveInlineTableDesiredWidth(value: string, chromeWidth: number) {
  const lines = value.split('\n')
  const longestLineWidth = Math.max(...lines.map(line => measureTextWidth(line)))
  return longestLineWidth + chromeWidth
}

export function resolveSplitTableCellWidths(
  leftValue: string,
  rightValue: string,
  maxWidth: number,
  leftChromeWidth: number,
  rightChromeWidth: number,
) {
  const contentWidth = Math.max(inlineTableCellMinWidth * 2, maxWidth - inlineTableGap)
  const defaultLeftWidth = Math.floor(contentWidth / 2)
  const defaultRightWidth = contentWidth - defaultLeftWidth
  const minCellWidth = Math.min(
    inlineTablePreferredMinWidth,
    Math.max(inlineTableCellMinWidth, Math.floor(contentWidth * 0.25)),
  )
  const leftDesiredWidth = resolveInlineTableDesiredWidth(leftValue, leftChromeWidth)
  const rightDesiredWidth = resolveInlineTableDesiredWidth(rightValue, rightChromeWidth)
  let leftWidth = defaultLeftWidth
  let rightWidth = defaultRightWidth

  if (leftDesiredWidth > leftWidth && rightDesiredWidth <= rightWidth) {
    const borrowedWidth = Math.min(leftDesiredWidth - leftWidth, rightWidth - minCellWidth)
    leftWidth += borrowedWidth
    rightWidth -= borrowedWidth
  } else if (rightDesiredWidth > rightWidth && leftDesiredWidth <= leftWidth) {
    const borrowedWidth = Math.min(rightDesiredWidth - rightWidth, leftWidth - minCellWidth)
    rightWidth += borrowedWidth
    leftWidth -= borrowedWidth
  }

  return { leftWidth, rightWidth }
}
