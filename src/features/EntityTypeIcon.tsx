/**
 * Badge circolare condiviso per rappresentare visivamente un tipo di entità.
 */
import type { CSSProperties } from 'react'
import {
  getEntityVisual,
  type EntityVisualKind,
} from './entity-visual-catalog'

type EntityTypeIconProps = {
  kind: EntityVisualKind
  size?: number
  iconSize?: number
  color?: string
  className?: string
  label?: string
}

/** Mostra l'icona canonica con i colori del tipo o con un override esplicito. */
export function EntityTypeIcon({
  kind,
  size = 36,
  iconSize = 18,
  color,
  className = '',
  label,
}: EntityTypeIconProps) {
  const visual = getEntityVisual(kind)
  const effectiveColor = color ?? visual.color
  const style: CSSProperties = {
    width: size,
    height: size,
    borderColor: effectiveColor,
    backgroundColor: color ? '#ffffff' : visual.softColor,
    color: effectiveColor,
  }
  const Icon = visual.icon

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 ${className}`}
      style={style}
      aria-label={label}
    >
      <Icon size={iconSize} aria-hidden={label ? true : undefined} />
    </span>
  )
}
