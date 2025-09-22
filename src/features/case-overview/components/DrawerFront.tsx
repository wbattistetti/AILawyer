import * as React from 'react'
import clsx from 'clsx'

type Props = {
  label?: string
  icon?: React.ReactNode
  className?: string
  radius?: number
  style?: React.CSSProperties
  children?: React.ReactNode
}

export default function DrawerFront({
  label,
  icon,
  className = 'w-80 h-44',
  radius = 14,
  style,
  children,
}: Props) {
  return (
    <div
      className={clsx(
        'relative select-none rounded-2xl border border-neutral-200 bg-white shadow-sm',
        'flex flex-col overflow-hidden',
        className,
      )}
      style={{
        ['--drawer-base' as any]: '#f2f2f2',
        ['--drawer-stroke' as any]: '#c9c9c9',
        ['--label-fill' as any]: '#ffffff',
        ...style,
      }}
      aria-label={label ? `Cassetto: ${label}` : 'Cassetto'}
      role="group"
    >
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.06)' }}
      />

      <svg className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)]" viewBox="0 0 100 60" preserveAspectRatio="none">
        <defs>
          <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="var(--drawer-base)" />
          </linearGradient>
          <linearGradient id="bevel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.06)" />
          </linearGradient>
        </defs>

        <rect x="1" y="3" width="98" height="54" rx={radius} fill="url(#face)" stroke="var(--drawer-stroke)" strokeWidth="1.2" />
        <rect x="3" y="5" width="94" height="50" rx={Math.max(radius - 3, 4)} fill="none" stroke="url(#bevel)" strokeWidth="1" />

        <g>
          <rect x="35" y="32" width="30" height="8" rx="4" fill="#f7f7f7" stroke="#bdbdbd" strokeWidth="1" />
          <rect x="40" y="34" width="20" height="4" rx="2" fill="#d9d9d9" />
        </g>

        <rect x="8" y="9" width="66" height="10" rx="3" fill="var(--label-fill)" stroke="var(--drawer-stroke)" strokeWidth="0.9" />
      </svg>

      <div className="absolute left-4 top-3 flex items-center gap-2 px-2 py-1 rounded-md border border-black/5 bg-white/90">
        {icon && <span className="text-inherit">{icon}</span>}
        {label && <span className="text-[12px] font-medium leading-none truncate max-w-[12rem]">{label}</span>}
      </div>

      <div className="relative flex-1 p-3 overflow-auto">
        {children}
      </div>

      <div className="absolute inset-x-3 top-0 h-[10px]">
        <div className="h-px bg-black/12" />
        <div className="h-px bg-white/60 translate-y-[1px]" />
      </div>
    </div>
  )
}


