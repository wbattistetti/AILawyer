/**
 * Dropdown condiviso per scegliere il tipo di riga del Riporto generale
 * (Nota libera, Elementi di prova, Verbali, …).
 */

import React from 'react'
import { CellType } from '../../types/table.types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from '@/components/ui/select'
import { getCellTypeLabel, getSortedCellTypes } from '../../utils/cellTypeConfig'
import { cn } from '@/lib/utils'

export interface CellTypeSelectProps {
  /** Tipo selezionato; stringa vuota = nessun tipo */
  value?: CellType | ''
  onValueChange: (value: CellType) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  triggerClassName?: string
  triggerRef?: React.Ref<HTMLButtonElement>
  onOpenChange?: (open: boolean) => void
}

/**
 * Select controllato sui tipi di cella del Riporto (SSOT: cellTypeConfig).
 */
export function CellTypeSelect({
  value = '',
  onValueChange,
  disabled = false,
  placeholder = 'Seleziona tipo',
  className,
  triggerClassName,
  triggerRef,
  onOpenChange,
}: CellTypeSelectProps) {
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => onValueChange(next as CellType)}
      disabled={disabled}
      onOpenChange={onOpenChange}
    >
      <SelectTrigger
        ref={triggerRef}
        className={cn('h-8 text-xs w-auto min-w-[140px]', triggerClassName)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={className}>
        <SelectItem value="nota-libera">{getCellTypeLabel('nota-libera')}</SelectItem>
        <SelectSeparator />
        {getSortedCellTypes().map((type) => (
          <SelectItem key={type} value={type}>
            {getCellTypeLabel(type)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
