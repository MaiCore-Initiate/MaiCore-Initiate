import type { JSX } from 'react'

/**
 * 文件块图标系统：每个后缀对应一个 SVG 组件。
 * 用户会逐个提供 SVG；目前只有 .py + GenericFileIcon 兜底。
 */

export interface FileIconProps {
  size?: number
  className?: string
}

function PythonIcon({ size = 48, className }: FileIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="16 16 32 32"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden
    >
      <path
        fill="url(#pyBlue)"
        d="M31.885 16c-8.124 0-7.617 3.523-7.617 3.523l.01 3.65h7.752v1.095H21.197S16 23.678 16 31.876c0 8.196 4.537 7.906 4.537 7.906h2.708v-3.804s-.146-4.537 4.465-4.537h7.688s4.32.07 4.32-4.175v-7.019S40.374 16 31.885 16zm-4.275 2.454a1.394 1.394 0 1 1 0 2.79 1.393 1.393 0 0 1-1.395-1.395c0-.771.624-1.395 1.395-1.395z"
      />
      <path
        fill="url(#pyYellow)"
        d="M32.115 47.833c8.124 0 7.617-3.523 7.617-3.523l-.01-3.65H31.97v-1.095h10.832S48 40.155 48 31.958c0-8.197-4.537-7.906-4.537-7.906h-2.708v3.803s.146 4.537-4.465 4.537h-7.688s-4.32-.07-4.32 4.175v7.019s-.656 4.247 7.833 4.247zm4.275-2.454a1.393 1.393 0 0 1-1.395-1.395 1.394 1.394 0 1 1 1.395 1.395z"
      />
      <defs>
        <linearGradient id="pyBlue" x1="19.075" x2="34.898" y1="18.782" y2="34.658" gradientUnits="userSpaceOnUse">
          <stop stopColor="#387EB8" />
          <stop offset="1" stopColor="#366994" />
        </linearGradient>
        <linearGradient id="pyYellow" x1="28.809" x2="45.803" y1="28.882" y2="45.163" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE052" />
          <stop offset="1" stopColor="#FFC331" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function GenericFileIcon({ size = 48, className }: FileIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  )
}

type FileIconComponent = (props: FileIconProps) => JSX.Element

const ICON_BY_EXT: Record<string, FileIconComponent> = {
  py: PythonIcon,
}

export function getFileIconByExt(extension: string): FileIconComponent {
  const ext = extension.toLowerCase()
  return ICON_BY_EXT[ext] ?? GenericFileIcon
}

export function getFileIconByName(name: string): FileIconComponent {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1) : ''
  return getFileIconByExt(ext)
}
