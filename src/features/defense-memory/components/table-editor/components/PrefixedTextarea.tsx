import React, { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface PrefixedTextareaProps {
    prefix: string // Testo fisso sottolineato (es. "Affidamento incarico:")
    value: string
    onChange: (value: string) => void
    placeholder?: string
    readOnly?: boolean
    rows?: number
    className?: string
}

export const PrefixedTextarea: React.FC<PrefixedTextareaProps> = ({
    prefix,
    value,
    onChange,
    placeholder,
    readOnly = false,
    rows = 3,
    className
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const prefixRef = useRef<HTMLSpanElement>(null)

    // ✅ Calcola la larghezza del prefisso per posizionare correttamente il testo
    useEffect(() => {
        if (prefixRef.current && textareaRef.current) {
            // ✅ Usa getBoundingClientRect per misurare accuratamente
            const prefixRect = prefixRef.current.getBoundingClientRect()
            const padding = prefixRect.width + 12 // 8px di margine + 4px di spazio
            textareaRef.current.style.paddingLeft = `${padding}px`
        }
    }, [prefix, value]) // ✅ Ricalcola anche quando cambia il valore (per il resize)

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value)
    }

    return (
        <div className={cn("relative border border-gray-300 rounded-md bg-white", className)}>
            {/* ✅ Prefisso fisso sottolineato */}
            <span
                ref={prefixRef}
                className="absolute left-2 top-2 text-sm font-normal text-gray-700 underline pointer-events-none select-none z-10"
            >
                {prefix}
            </span>
            {/* ✅ Textarea per il testo editabile */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                readOnly={readOnly}
                placeholder={placeholder}
                rows={rows}
                className={cn(
                    "w-full resize-none border-0 focus:ring-0 focus:outline-none text-sm",
                    "bg-transparent",
                    readOnly && "cursor-not-allowed opacity-60"
                )}
                style={{ paddingTop: '8px', paddingRight: '8px', paddingBottom: '8px' }}
            />
        </div>
    )
}
