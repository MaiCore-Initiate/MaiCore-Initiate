import type { ReactNode } from 'react'
import GlassCard from './GlassCard'

function LockIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="3" stroke="rgba(120,120,120,0.9)" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="rgba(120,120,120,0.9)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.4" fill="rgba(120,120,120,0.9)" />
    </svg>
  )
}

export default function AccessGuard({
  allowed,
  children,
  message = '当前无权限访问',
  detail,
  radius = 30,
  className = '',
}: {
  allowed: boolean
  children: ReactNode
  message?: string
  detail?: string
  radius?: number
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="h-full min-h-0"
        style={!allowed ? { filter: 'grayscale(0.75)', opacity: 0.38 } : undefined}
      >
        {children}
      </div>

      {!allowed && (
        <div className="absolute inset-0 z-20">
          <GlassCard radius={radius} blur={26} bgOpacity={0.72} borderColor="rgba(130,130,130,0.55)">
            <div className="h-full w-full flex items-center justify-center p-[24px]">
              <div
                className="flex flex-col items-center justify-center rounded-[24px] px-[28px] py-[24px] text-center"
                style={{
                  minWidth: 280,
                  border: '2px dashed rgba(130,130,130,0.7)',
                  background: 'rgba(240,240,240,0.28)',
                }}
              >
                <LockIcon />
                <div
                  className="mt-[12px] text-[#7a7a7a]"
                  style={{ fontSize: 28, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}
                >
                  {message}
                </div>
                {detail ? (
                  <div
                    className="mt-[6px] text-[#8d8d8d]"
                    style={{ fontSize: 16, fontFamily: "'Ubuntu', 'HarmonyOS Sans SC', monospace", maxWidth: 520 }}
                  >
                    {detail}
                  </div>
                ) : null}
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
