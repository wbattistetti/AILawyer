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
}

export const Combobox: React.FC<ComboboxProps> = ({
    value,
    onChange,
    suggestions,
    placeholder = 'Digita o seleziona...',
    className = '',
    readOnly = false
}) => {
    const [isOpen, setIsOpen] = useState(false)
    const [inputValue, setInputValue] = useState(value)
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])
    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

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

    const handleSelectSuggestion = (suggestion: string) => {
        setInputValue(suggestion)
        onChange(suggestion)
        setIsOpen(false)
        inputRef.current?.blur()
    }

    const handleFocus = () => {
        setIsOpen(true)
    }

    return (
        <div className={cn("relative inline-block", className)}>
            <div className="relative">
                <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    placeholder={placeholder}
                    readOnly={readOnly}
                    className="pr-8 h-8 text-xs w-auto min-w-[200px]"
                />
                <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
            </div>

            {isOpen && !readOnly && filteredSuggestions.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 w-full mt-0.5 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto text-xs"
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

