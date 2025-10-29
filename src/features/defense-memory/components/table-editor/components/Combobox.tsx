import React, { useState, useRef, useEffect, useMemo } from 'react'
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
    'aria-label'?: string
    'aria-labelledby'?: string
    autoOpen?: boolean
    onSelection?: (value: string) => void
}

export const Combobox: React.FC<ComboboxProps> = ({
    value,
    onChange,
    suggestions,
    placeholder = 'Digita o seleziona...',
    className = '',
    readOnly = false,
    onBlur,
    onKeyDown,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    autoOpen = false,
    onSelection
}) => {
    const [isOpen, setIsOpen] = useState(false)
    const [inputValue, setInputValue] = useState(value)
    const [selectedIndex, setSelectedIndex] = useState(-1)
    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const measureRef = useRef<HTMLSpanElement>(null)
    const measureDropdownRef = useRef<HTMLSpanElement>(null)

    // Filtra le suggestions basate sull'input
    const filteredSuggestions = useMemo(() => {
        if (!inputValue.trim()) {
            return suggestions.slice(0, 10)
        }
        return suggestions
            .filter(s => s.toLowerCase().includes(inputValue.toLowerCase()))
            .slice(0, 10)
    }, [inputValue, suggestions])

    // Sincronizza inputValue con value esterno
    useEffect(() => {
        setInputValue(value)
    }, [value])

    // Calcola larghezza dinamica input
    useEffect(() => {
        if (measureRef.current && inputRef.current) {
            const text = inputValue || placeholder
            measureRef.current.textContent = text

            const inputStyle = window.getComputedStyle(inputRef.current)
            measureRef.current.style.font = inputStyle.font
            measureRef.current.style.fontSize = inputStyle.fontSize
            measureRef.current.style.fontWeight = inputStyle.fontWeight
            measureRef.current.style.fontFamily = inputStyle.fontFamily
            measureRef.current.style.letterSpacing = inputStyle.letterSpacing

            const width = measureRef.current.getBoundingClientRect().width
            const newWidth = Math.max(width + 40, 120)
            inputRef.current.style.width = `${newWidth}px`
        }
    }, [inputValue, placeholder])

    // Calcola larghezza dropdown basata sulla voce più lunga
    useEffect(() => {
        if (measureDropdownRef.current && filteredSuggestions.length > 0 && isOpen) {
            const inputStyle = inputRef.current ? window.getComputedStyle(inputRef.current) : null
            if (!inputStyle) return

            measureDropdownRef.current.style.font = inputStyle.font
            measureDropdownRef.current.style.fontSize = inputStyle.fontSize
            measureDropdownRef.current.style.fontWeight = inputStyle.fontWeight
            measureDropdownRef.current.style.fontFamily = inputStyle.fontFamily
            measureDropdownRef.current.style.letterSpacing = inputStyle.letterSpacing

            let maxWidth = 0
            for (const suggestion of filteredSuggestions) {
                measureDropdownRef.current.textContent = suggestion
                const width = measureDropdownRef.current.getBoundingClientRect().width
                maxWidth = Math.max(maxWidth, width)
            }

            const inputWidth = inputRef.current?.getBoundingClientRect().width || 120
            const newDropdownWidth = Math.max(maxWidth + 40, inputWidth)
            if (dropdownRef.current) {
                dropdownRef.current.style.width = `${newDropdownWidth}px`
                dropdownRef.current.style.minWidth = `${inputWidth}px`
            }
        }
    }, [filteredSuggestions, isOpen])

    // Gestione click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false)
                setSelectedIndex(-1)
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
        setSelectedIndex(-1)
    }

    const handleFocus = () => {
        if (!readOnly) {
            setIsOpen(true)
        }
    }

    // Auto-apri il dropdown quando autoOpen diventa true
    useEffect(() => {
        if (autoOpen && !readOnly) {
            setIsOpen(true)
            // Focus sull'input per attivare il dropdown
            setTimeout(() => {
                inputRef.current?.focus()
            }, 50)
        }
    }, [autoOpen, readOnly])

    const handleBlur = () => {
        // Delay per permettere click su opzioni
        setTimeout(() => {
            setIsOpen(false)
            setSelectedIndex(-1)
            onBlur?.()
        }, 150)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (readOnly) return

        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setIsOpen(true)
            setSelectedIndex(e.key === 'ArrowDown' ? 0 : filteredSuggestions.length - 1)
            e.preventDefault()
            return
        }

        if (isOpen) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setSelectedIndex(prev =>
                        prev < filteredSuggestions.length - 1 ? prev + 1 : 0
                    )
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setSelectedIndex(prev =>
                        prev > 0 ? prev - 1 : filteredSuggestions.length - 1
                    )
                    break
                case 'Enter':
                    e.preventDefault()
                    if (selectedIndex >= 0 && selectedIndex < filteredSuggestions.length) {
                        const selectedSuggestion = filteredSuggestions[selectedIndex]
                        setInputValue(selectedSuggestion)
                        onChange(selectedSuggestion)
                        setIsOpen(false)
                        setSelectedIndex(-1)
                        inputRef.current?.blur()
                        // Chiama onSelection per chiudere la modalità editing
                        if (selectedSuggestion.trim()) {
                            onSelection?.(selectedSuggestion)
                        }
                    }
                    break
                case 'Escape':
                    e.preventDefault()
                    setIsOpen(false)
                    setSelectedIndex(-1)
                    inputRef.current?.blur()
                    break
                default:
                    // Passa altri tasti al parent se necessario
                    onKeyDown?.(e)
            }
        } else {
            // Passa altri tasti al parent se il dropdown è chiuso
            onKeyDown?.(e)
        }
    }

    const handleSelectSuggestion = (suggestion: string) => {
        setInputValue(suggestion)
        onChange(suggestion)
        setIsOpen(false)
        setSelectedIndex(-1)
        inputRef.current?.blur()
        // Chiama onSelection per chiudere la modalità editing
        if (suggestion.trim()) {
            onSelection?.(suggestion)
        }
    }

    return (
        <div className={cn("relative inline-block", className)}>
            {/* Elementi nascosti per misurare la larghezza */}
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
            <span
                ref={measureDropdownRef}
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

            <div className="relative inline-block">
                <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    readOnly={readOnly}
                    aria-label={ariaLabel || placeholder}
                    aria-labelledby={ariaLabelledBy}
                    className="pr-8 h-8 text-xs"
                />
                <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 pointer-events-auto"
                    disabled={readOnly}
                    onClick={() => {
                        if (!readOnly) {
                            setIsOpen(!isOpen)
                        }
                    }}
                >
                    <ChevronsUpDown className="h-3 w-3" />
                </button>
            </div>

            {isOpen && !readOnly && filteredSuggestions.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 mt-0.5 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto text-xs"
                >
                    {filteredSuggestions.map((suggestion, index) => (
                        <div
                            key={index}
                            onClick={() => handleSelectSuggestion(suggestion)}
                            className={cn(
                                "px-2 py-1 cursor-pointer flex items-center justify-between",
                                index === selectedIndex && "bg-blue-100",
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