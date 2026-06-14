import { useId, type JSX } from 'react'

/**
 * 文件块图标系统：每个后缀对应一个 SVG 组件。
 * 用户会逐个提供 SVG；目前只有 .py/.cmd/.bat/.ps1 + GenericFileIcon 兜底。
 *
 * 用 useId() 隔离 SVG 内部 id（linearGradient 等），避免多个同类型块在画布上 id 冲突。
 */

export interface FileIconProps {
  size?: number
  className?: string
}

function PythonIcon({ size = 48, className }: FileIconProps) {
  const uid = useId().replace(/[:]/g, '_')
  const blueId = `pyBlue_${uid}`
  const yellowId = `pyYellow_${uid}`
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
      <defs>
        <linearGradient id={blueId} x1="19.075" x2="34.898" y1="18.782" y2="34.658" gradientUnits="userSpaceOnUse">
          <stop stopColor="#387EB8" />
          <stop offset="1" stopColor="#366994" />
        </linearGradient>
        <linearGradient id={yellowId} x1="28.809" x2="45.803" y1="28.882" y2="45.163" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE052" />
          <stop offset="1" stopColor="#FFC331" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${blueId})`}
        d="M31.885 16c-8.124 0-7.617 3.523-7.617 3.523l.01 3.65h7.752v1.095H21.197S16 23.678 16 31.876c0 8.196 4.537 7.906 4.537 7.906h2.708v-3.804s-.146-4.537 4.465-4.537h7.688s4.32.07 4.32-4.175v-7.019S40.374 16 31.885 16zm-4.275 2.454a1.394 1.394 0 1 1 0 2.79 1.393 1.393 0 0 1-1.395-1.395c0-.771.624-1.395 1.395-1.395z"
      />
      <path
        fill={`url(#${yellowId})`}
        d="M32.115 47.833c8.124 0 7.617-3.523 7.617-3.523l-.01-3.65H31.97v-1.095h10.832S48 40.155 48 31.958c0-8.197-4.537-7.906-4.537-7.906h-2.708v3.803s.146 4.537-4.465 4.537h-7.688s-4.32-.07-4.32 4.175v7.019s-.656 4.247 7.833 4.247zm4.275-2.454a1.393 1.393 0 0 1-1.395-1.395 1.394 1.394 0 1 1 1.395 1.395z"
      />
    </svg>
  )
}

function CmdIcon({ size = 48, className }: FileIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 27.269 27.269"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M25.322,1.947H1.949C0.869,1.947,0,2.818,0,3.898v19.477c0,1.074,0.869,1.947,1.949,1.947h23.373
        c1.07,0,1.947-0.873,1.947-1.947V3.898C27.27,2.818,26.393,1.947,25.322,1.947z M9.312,3.41c0.537,0,0.973,0.436,0.973,0.975
        c0,0.537-0.436,0.973-0.973,0.973c-0.539,0-0.975-0.436-0.975-0.973C8.338,3.845,8.773,3.41,9.312,3.41z M6.33,3.41
        c0.537,0,0.975,0.436,0.975,0.975c0,0.537-0.438,0.973-0.975,0.973c-0.539,0-0.975-0.436-0.975-0.973
        C5.355,3.845,5.791,3.41,6.33,3.41z M3.406,3.41c0.541,0,0.975,0.436,0.975,0.975c0,0.537-0.434,0.973-0.975,0.973
        c-0.535,0-0.971-0.436-0.971-0.973C2.436,3.845,2.871,3.41,3.406,3.41z M25.322,23.375H1.949V6.838h23.373
        C25.322,6.838,25.322,23.375,25.322,23.375z" />
      <path d="M14.797,15.566L5.844,20.16v-1.332l7.602-3.781v-0.039l-7.602-3.782V9.894l8.953,4.572V15.566z" />
      <path d="M21.422,14.334v1.232h-4.764v-1.232H21.422z" />
    </svg>
  )
}

function BatIcon({ size = 48, className }: FileIconProps) {
  // 与 CmdIcon 同形，但 #8f0000 暗红硬编码（不绑主题）
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 27.269 27.269"
      width={size}
      height={size}
      className={className}
      fill="#8f0000"
      aria-hidden
    >
      <path d="M25.322,1.947H1.949C0.869,1.947,0,2.818,0,3.898v19.477c0,1.074,0.869,1.947,1.949,1.947h23.373
        c1.07,0,1.947-0.873,1.947-1.947V3.898C27.27,2.818,26.393,1.947,25.322,1.947z M9.312,3.41c0.537,0,0.973,0.436,0.973,0.975
        c0,0.537-0.436,0.973-0.973,0.973c-0.539,0-0.975-0.436-0.975-0.973C8.338,3.845,8.773,3.41,9.312,3.41z M6.33,3.41
        c0.537,0,0.975,0.436,0.975,0.975c0,0.537-0.438,0.973-0.975,0.973c-0.539,0-0.975-0.436-0.975-0.973
        C5.355,3.845,5.791,3.41,6.33,3.41z M3.406,3.41c0.541,0,0.975,0.436,0.975,0.975c0,0.537-0.434,0.973-0.975,0.973
        c-0.535,0-0.971-0.436-0.971-0.973C2.436,3.845,2.871,3.41,3.406,3.41z M25.322,23.375H1.949V6.838h23.373
        C25.322,6.838,25.322,23.375,25.322,23.375z" />
      <path d="M14.797,15.566L5.844,20.16v-1.332l7.602-3.781v-0.039l-7.602-3.782V9.894l8.953,4.572V15.566z" />
      <path d="M21.422,14.334v1.232h-4.764v-1.232H21.422z" />
    </svg>
  )
}

function Ps1Icon({ size = 48, className }: FileIconProps) {
  const uid = useId().replace(/[:]/g, '_')
  const gradAId = `ps1A_${uid}`
  const gradBId = `ps1B_${uid}`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlSpace="preserve"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradAId}
          x1="96.306"
          x2="25.454"
          y1="35.144"
          y2="98.431"
          gradientTransform="matrix(1 0 0 -1 0 128)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#a9c8ff" />
          <stop offset="1" stopColor="#c7e6ff" />
        </linearGradient>
        <linearGradient
          id={gradBId}
          x1="25.336"
          x2="94.569"
          y1="98.33"
          y2="36.847"
          gradientTransform="matrix(1 0 0 -1 0 128)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2d4664" />
          <stop offset=".169" stopColor="#29405b" />
          <stop offset=".445" stopColor="#1e2f43" />
          <stop offset=".79" stopColor="#0c131b" />
          <stop offset="1" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradAId})`}
        fillRule="evenodd"
        d="M7.2 110.5c-1.7 0-3.1-.7-4.1-1.9-1-1.2-1.3-2.9-.9-4.6l18.6-80.5c.8-3.4 4-6 7.4-6h92.6c1.7 0 3.1.7 4.1 1.9 1 1.2 1.3 2.9.9 4.6l-18.6 80.5c-.8 3.4-4 6-7.4 6H7.2z"
        clipRule="evenodd"
        opacity=".8"
      />
      <path
        fill={`url(#${gradBId})`}
        fillRule="evenodd"
        d="M120.3 18.5H28.5c-2.9 0-5.7 2.3-6.4 5.2L3.7 104.3c-.7 2.9 1.1 5.2 4 5.2h91.8c2.9 0 5.7-2.3 6.4-5.2l18.4-80.5c.7-2.9-1.1-5.3-4-5.3z"
        clipRule="evenodd"
      />
      <path
        fill="#2C5591"
        fillRule="evenodd"
        d="M64.2 88.3h22.3c2.6 0 4.7 2.2 4.7 4.9s-2.1 4.9-4.7 4.9H64.2c-2.6 0-4.7-2.2-4.7-4.9s2.1-4.9 4.7-4.9zM78.7 66.5c-.4.8-1.2 1.6-2.6 2.6L34.6 98.9c-2.3 1.6-5.5 1-7.3-1.4-1.7-2.4-1.3-5.7.9-7.3l37.4-27.1v-.6l-23.5-25c-1.9-2-1.7-5.3.4-7.4 2.2-2 5.5-2 7.4 0l28.2 30c1.7 1.9 1.8 4.5.6 6.4z"
        clipRule="evenodd"
      />
      <path
        fill="#FFF"
        fillRule="evenodd"
        d="M77.6 65.5c-.4.8-1.2 1.6-2.6 2.6L33.6 97.9c-2.3 1.6-5.5 1-7.3-1.4-1.7-2.4-1.3-5.7.9-7.3l37.4-27.1v-.6l-23.5-25c-1.9-2-1.7-5.3.4-7.4 2.2-2 5.5-2 7.4 0l28.2 30c1.7 1.8 1.8 4.4.5 6.4zM63.5 87.8h22.3c2.6 0 4.7 2.1 4.7 4.6 0 2.6-2.1 4.6-4.7 4.6H63.5c-2.6 0-4.7-2.1-4.7-4.6 0-2.6 2.1-4.6 4.7-4.6z"
        clipRule="evenodd"
      />
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
  cmd: CmdIcon,
  bat: BatIcon,
  ps1: Ps1Icon,
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
