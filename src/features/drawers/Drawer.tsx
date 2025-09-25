import * as React from "react";
import clsx from "clsx";
import styles from "./Label.module.css";

export type DrawerProps = {
  color: string;
  icon?: React.ReactNode;
  label: string;
  isOpen?: boolean;
  onToggle?: () => void;
  className?: string;
  "data-testid"?: string;
};

function LabelPlate({ icon, text }: { icon?: React.ReactNode; text: string }) {
  // Try to upsize vector icons (lucide etc.) by cloning
  let iconNode: React.ReactNode = null;
  if (React.isValidElement(icon)) {
    const props: any = { width: 48, height: 48, className: styles.iconInner } as any;
    iconNode = React.cloneElement(icon as any, props);
  } else if (icon) {
    iconNode = <span className={styles.iconInner} style={{ width: 48, height: 48 }}>{icon}</span>;
  }
  return (
    <div
      className={clsx("absolute","py-1","flex items-center", styles.label)}
      style={{ left: 10, right: 10, top: '33%', transform: 'translateY(-50%)', background: 'transparent', gap: '5px', paddingLeft: 0, paddingRight: 0 }}
    >
      <div className={styles.iconBox}>
        {iconNode}
      </div>
      <span className={styles.labelText}>{text}</span>
    </div>
  )
}

export function Drawer({
  color,
  icon,
  label,
  isOpen = false,
  onToggle,
  className,
  ...rest
}: DrawerProps) {
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle?.();
    }
  };

  const style: React.CSSProperties = {
    transform: isOpen ? 'scale(1.03)' : 'scale(1)',
    transition: 'transform 180ms cubic-bezier(.22,.82,.18,1), filter 120ms ease',
    zIndex: isOpen ? 3 : 1,
    // Ombra gestita via filtro SVG sul pannello; qui nessun filtro CSS per evitare alone su top/left
    filter: 'none',
    willChange: 'transform, filter',
  }

  return (
    <button
      type="button"
      onDoubleClick={onToggle}
      onKeyDown={handleKey}
      aria-pressed={isOpen}
      className={clsx(
        "relative isolate rounded-none outline-none focus-visible:ring-2 focus-visible:ring-black/20",
        "flex items-center justify-center p-0 m-0 bg-transparent",
        className
      )}
      style={style}
      {...rest}
    >
      {/* Pure SVG: colore uniforme come il flowchart (nessun overlay scurente) */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden>
        <defs>
          {/* Ombra stratificata: ambient + offset, solo BR, con bounds ampi per evitare tagli netti */}
          <filter id="drawerBR" x="-25%" y="-20%" width="180%" height="220%" filterUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
            {/* offset and blur the alpha */}
            <feOffset in="SourceAlpha" dx="7" dy="9" result="off"/>
            <feGaussianBlur in="off" stdDeviation="6" result="blur"/>
            {/* keep only outside of the shape to avoid inner dark rectangle */}
            <feComposite in="blur" in2="SourceAlpha" operator="out" result="shadowOutside"/>
            <feColorMatrix in="shadowOutside" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.28 0" result="shadowColored"/>
            <feMerge>
              <feMergeNode in="shadowColored"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {/* Quando aperto, sposta leggermente il bordo sinistro verso destra per simulare l'estrazione del cassetto */}
        {(() => {
          const dx = isOpen ? 3 : 0; // unità su viewBox (≈3%)
          const x = 2 + dx;
          const w = 96 - dx;
          return (
            <rect x={x} y={2} width={w} height={64} rx={6} fill={color as any} fillOpacity={0.12} stroke={color as any} strokeWidth={2.5} filter={isOpen ? 'url(#drawerBR)' : undefined} />
          )
        })()}
        {/* Maniglia */}
        <g opacity="0.6">
          <rect x="28" y="42" width="44" height="8" rx="4" fill="#ffffff" stroke="#5b636b" strokeWidth="2" />
          <rect x="36" y="45" width="28" height="3" rx="1.5" fill="#cfd4da" />
        </g>
      </svg>

      <LabelPlate icon={icon} text={label} />
    </button>
  );
}

export default Drawer;


