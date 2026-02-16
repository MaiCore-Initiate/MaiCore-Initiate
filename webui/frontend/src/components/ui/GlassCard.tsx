interface GlassCardProps {
  children: React.ReactNode
  radius?: number
  blur?: number
  shadow?: string
  className?: string
}

export default function GlassCard({
  children,
  radius = 30,
  blur = 50,
  shadow = '6px 6px 4px rgba(0,0,0,0.35)',
  className = '',
}: GlassCardProps) {
  return (
    <div className={`relative h-full ${className}`}>
      <div
        className="absolute w-full h-full pointer-events-none z-10"
        style={{ borderRadius: radius, border: '2px solid #797979', filter: `drop-shadow(${shadow})` }}
      />
      <div
        className="relative h-full flex flex-col"
        style={{ borderRadius: radius, backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, background: 'rgba(255,255,255,0.01)' }}
      >
        {children}
      </div>
    </div>
  )
}
