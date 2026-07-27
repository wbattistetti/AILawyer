/**
 * Compact inline text editor: white field, black text, ✓ / ✕ confirm controls.
 */
import React, { useLayoutEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'

export type InlineTextEditorProps = {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  /** Accessible name for the input. */
  'aria-label'?: string
  placeholder?: string
  autoFocus?: boolean
  /** Grow input width with content (graph tab rename). */
  autoWidth?: boolean
  className?: string
  inputClassName?: string
  style?: React.CSSProperties
  inputStyle?: React.CSSProperties
}

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--ui-text-muted, #64748b)',
  cursor: 'pointer',
  flexShrink: 0,
}

/** Lightweight single-line editor with check/cancel icons. */
export default function InlineTextEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  'aria-label': ariaLabel = 'Modifica testo',
  placeholder,
  autoFocus = true,
  autoWidth = false,
  className,
  inputClassName,
  style,
  inputStyle,
}: InlineTextEditorProps) {
  const [inputWidth, setInputWidth] = useState(autoWidth ? 48 : undefined)
  const measureRef = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    if (!autoWidth || !measureRef.current) return
    const measuredWidth = measureRef.current.getBoundingClientRect().width
    const maxWidth = Math.max(160, window.innerWidth * 0.6)
    setInputWidth(Math.min(Math.max(48, measuredWidth + 12), maxWidth))
  }, [value, autoWidth])

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {autoWidth && (
        <span
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: 'fixed',
            visibility: 'hidden',
            pointerEvents: 'none',
            whiteSpace: 'pre',
            font: 'inherit',
            fontSize: inputStyle?.fontSize ?? 'inherit',
            fontFamily: inputStyle?.fontFamily ?? 'inherit',
            padding: '2px 4px',
          }}
        >
          {value || placeholder || ' '}
        </span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={inputClassName}
        style={{
          flex: autoWidth ? '0 0 auto' : '1 1 auto',
          width: autoWidth ? inputWidth : '100%',
          minWidth: autoWidth ? 48 : undefined,
          padding: '2px 6px',
          border: '1px solid #cbd5e1',
          borderRadius: 3,
          fontSize: 'inherit',
          fontFamily: 'inherit',
          lineHeight: 1.3,
          background: '#ffffff',
          color: '#0f172a',
          outline: 'none',
          boxShadow: 'none',
          ...inputStyle,
        }}
      />
      <button
        type="button"
        title="Conferma"
        aria-label="Conferma"
        onClick={(e) => {
          e.stopPropagation()
          onCommit()
        }}
        style={iconButtonStyle}
      >
        <Check size={14} color="#16a34a" />
      </button>
      <button
        type="button"
        title="Annulla"
        aria-label="Annulla"
        onClick={(e) => {
          e.stopPropagation()
          onCancel()
        }}
        style={iconButtonStyle}
      >
        <X size={14} color="#dc2626" />
      </button>
    </div>
  )
}
