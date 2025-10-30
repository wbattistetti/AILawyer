import React, { useRef } from 'react'
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

    return (
        <div className={cn('resize-y overflow-auto min-h-[56px] max-h-[600px]', className)}>
            <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                readOnly={readOnly}
                className={cn(
                    'h-full min-h-full resize-none overflow-auto text-xs p-2 whitespace-pre-wrap break-words'
                )}
            />
        </div>
    )
}

export default MotivationObservation


