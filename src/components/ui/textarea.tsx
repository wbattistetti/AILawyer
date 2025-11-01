import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn(
                    "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    "leading-normal", // ✅ Fix: line-height normale per evitare che il testo sia tagliato
                    "align-top", // ✅ Fix: allineamento in alto
                    className
                )}
                style={{
                    paddingTop: '0.5rem', // ✅ Fix: padding top esplicito per evitare che il testo venga tagliato
                    paddingBottom: '0.5rem',
                    lineHeight: '1.5', // ✅ Fix: line-height esplicito
                    verticalAlign: 'top', // ✅ Fix: allineamento verticale in alto
                    overflowY: 'auto', // ✅ Fix: scroll verticale se necessario
                    ...props.style
                }}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = "Textarea"

export { Textarea }

