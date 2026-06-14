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

function ShIcon({ size = 48, className }: FileIconProps) {
  // Bash / shell 终端方框 + 提示符（S 形变体），fill 绑主题
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden
    >
      <path d="M28.057 6.53 17.952.532a3.8 3.8 0 0 0-3.88 0L3.965 6.53A4.03 4.03 0 0 0 2 10.002v11.996a4.03 4.03 0 0 0 1.948 3.472l10.105 5.998a3.8 3.8 0 0 0 3.88 0L28.04 25.47a4.03 4.03 0 0 0 1.948-3.472V10.002a4.03 4.03 0 0 0-1.93-3.472zM20.23 25.262v.86a.318.318 0 0 1-.148.265l-.512.293c-.08.042-.148 0-.148-.113v-.847a1.66 1.66 0 0 1-1.164.113c-.062-.042-.086-.122-.056-.2l.183-.78a.322.322 0 0 1 .102-.17.18.18 0 0 1 .05-.035.11.11 0 0 1 .08 0 1.41 1.41 0 0 0 1.059-.134 1.41 1.41 0 0 0 .79-1.21c0-.438-.24-.62-.82-.625-.734 0-1.4-.14-1.43-1.224a3.137 3.137 0 0 1 1.186-2.4v-.872a.34.34 0 0 1 .148-.268l.494-.314c.08-.042.148 0 .148.116v.872a1.61 1.61 0 0 1 .967-.116c.07.04.098.128.064.2l-.173.773a.325.325 0 0 1-.138.195c-.02.012-.05.008-.074 0a1.28 1.28 0 0 0-.931.152 1.17 1.17 0 0 0-.706 1.037c0 .395.208.515.907.53.935 0 1.337.423 1.348 1.362a3.346 3.346 0 0 1-1.228 2.53zm5.293-1.45a.201.201 0 0 1-.078.194L22.9 25.558c-.024.02-.06.023-.087.007s-.04-.05-.033-.08v-.66a.184.184 0 0 1 .116-.162l2.516-1.507c.024-.02.06-.023.087-.007s.04.05.033.08v.582zM27.288 9.06l-9.562 5.906c-1.193.706-2.07 1.478-2.07 2.914v11.778c0 .86.353 1.4.882 1.58a3.14 3.14 0 0 1-.53.053 3.13 3.13 0 0 1-1.595-.441L4.308 24.853A3.3 3.3 0 0 1 2.706 22V10.002a3.304 3.304 0 0 1 1.602-2.858l10.105-5.998c.98-.58 2.196-.58 3.176 0l10.105 5.998c.833.504 1.4 1.35 1.552 2.3-.328-.713-1.083-.9-1.962-.395h.003z" />
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
  sh: ShIcon,
  bash: ShIcon,
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
