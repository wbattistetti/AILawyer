import React, { useEffect, useRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface MotivationObservationProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    readOnly?: boolean
    className?: string
}

export const MotivationObservation: React.FC<MotivationObservationProps> = ({
    value,
    onChange,
    placeholder = 'Inserisci osservazione per questa motivazione...',
    readOnly = false,
    className = ''
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
        }
    }, [value])

    return (
        <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            className={cn(
                'min-h-[48px] resize-none overflow-hidden text-xs p-2 whitespace-pre-wrap break-words',
                className
            )}
            onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = `${target.scrollHeight}px`
            }}
        />
    )
}


