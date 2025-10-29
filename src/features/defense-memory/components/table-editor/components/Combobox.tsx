import React, { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'

interface ComboboxProps {
    value: string
    onChange: (value: string) => void
    suggestions: string[]
    placeholder?: string
    className?: string
    readOnly?: boolean
    onBlur?: () => void
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export const Combobox: React.FC<ComboboxProps> = ({
    value,
    onChange,
    suggestions,
    placeholder = 'Digita o seleziona...',
    className = '',
    readOnly = false,
    onBlur,
    onKeyDown
}) => {
    const [isOpen, setIsOpen] = useState(false)
    const [inputValue, setInputValue] = useState(value)
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])
    const [computedWidth, setComputedWidth] = useState<string>('120px')
    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const measureRef = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        setInputValue(value)
    }, [value])

    useEffect(() => {
        if (inputValue.trim().length === 0) {
            setFilteredSuggestions(suggestions.slice(0, 10))
        } else {
            const filtered = suggestions
                .filter(s => s.toLowerCase().includes(inputValue.toLowerCase()))
                .slice(0, 10)
            setFilteredSuggestions(filtered)
        }
    }, [inputValue, suggestions])

    // Calcola larghezza dinamica basata sul contenuto reale
    useEffect(() => {
        if (measureRef.current && inputRef.current) {
            const text = inputValue || placeholder
            measureRef.current.textContent = text

            // Replica lo stile dell'input per una misurazione precisa
            const inputStyle = window.getComputedStyle(inputRef.current)
            measureRef.current.style.font = inputStyle.font
            measureRef.current.style.fontSize = inputStyle.fontSize
            measureRef.current.style.fontWeight = inputStyle.fontWeight
            measureRef.current.style.fontFamily = inputStyle.fontFamily
            measureRef.current.style.letterSpacing = inputStyle.letterSpacing

            // Usa getBoundingClientRect per ottenere la larghezza precisa
            const width = measureRef.current.getBoundingClientRect().width
            // Aggiungi spazio per padding laterale (circa 16px totale) e icona (24px) = 40px totale
            const newWidth = Math.max(width + 40, 120)
            setComputedWidth(`${newWidth}px`)
        } else {
            // Fallback iniziale
            const contentLength = (inputValue || placeholder || '').length
            setComputedWidth(`${Math.max(contentLength * 7 + 40, 120)}px`)
        }
    }, [inputValue, placeholder])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        setInputValue(newValue)
        onChange(newValue)
        setIsOpen(true)
    }

    const handleBlur = () => {
        setIsOpen(false)
        onBlur?.()
    }

    const handleSelectSuggestion = (suggestion: string) => {
        setInputValue(suggestion)
        onChange(suggestion)
        setIsOpen(false)
        inputRef.current?.blur()
        onBlur?.()
    }

    const handleFocus = () => {
        setIsOpen(true)
    }

    return (
        <div className={cn("relative inline-block", className)}>
            {/* Elemento nascosto per misurare la larghezza del testo */}
            <span
                ref={measureRef}
                className="absolute invisible whitespace-pre text-xs"
                style={{
                    font: 'inherit',
                    padding: '0',
                    visibility: 'hidden',
                    position: 'absolute',
                    top: '-9999px',
                    left: '-9999px'
                }}
            />
            <div className="relative inline-block" style={{ width: computedWidth }}>
                <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    readOnly={readOnly}
                    className="pr-8 h-8 text-xs w-full"
                />
                <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
            </div>

            {isOpen && !readOnly && filteredSuggestions.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 min-w-full mt-0.5 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto text-xs"
                    style={{ width: computedWidth }}
                >
                    {filteredSuggestions.map((suggestion, index) => (
                        <div
                            key={index}
                            onClick={() => handleSelectSuggestion(suggestion)}
                            className={cn(
                                "px-2 py-1 cursor-pointer hover:bg-gray-100 flex items-center justify-between",
                                inputValue === suggestion && "bg-blue-50"
                            )}
                        >
                            <span className="text-xs">{suggestion}</span>
                            {inputValue === suggestion && (
                                <Check className="h-3 w-3 text-blue-600" />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

