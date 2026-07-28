/**
 * Qualificatore condiviso: tipo riga, date e descrizione opzionale.
 * Usato nel Cassetto Estratti e riusabile dove serve contestualizzare un estratto.
 */

import React from 'react'
import { CellType } from '../../types/table.types'
import { Input } from '@/components/ui/input'
import { getDateFieldsConfig } from '../../utils/cellTypeConfig'
import { CellTypeSelect } from './CellTypeSelect'
import { cn } from '@/lib/utils'

/** Dati di qualifica allineati ai campi di una riga del Riporto. */
export interface CellTypeQualification {
  cellType?: CellType
  description: string
  contestationDate?: string
  eventDate?: string
}

export interface CellTypeQualifierProps {
  value: CellTypeQualification
  onChange: (next: CellTypeQualification) => void
  readOnly?: boolean
  className?: string
}

/** Oggi in formato YYYY-MM-DD (locale), limite massimo per le date processuali. */
function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const MIN_PROCESS_DATE = '1900-01-01'

/**
 * True se la data ISO è ammessa (oggi o passato, non prima del 1900).
 */
function isAllowedProcessDate(isoDate: string): boolean {
  return isoDate >= MIN_PROCESS_DATE && isoDate <= getTodayIsoDate()
}

/**
 * Barra di qualifica controllata: tipo → date → descrizione opzionale.
 */
export function CellTypeQualifier({
  value,
  onChange,
  readOnly = false,
  className,
}: CellTypeQualifierProps) {
  const dateConfig = value.cellType ? getDateFieldsConfig(value.cellType) : null
  const maxDate = getTodayIsoDate()

  const handleTypeChange = (cellType: CellType) => {
    onChange({
      cellType,
      description: value.description,
      contestationDate: undefined,
      eventDate: undefined,
    })
  }

  const handleContestationDateChange = (raw: string) => {
    if (!raw) {
      onChange({ ...value, contestationDate: undefined })
      return
    }
    if (!isAllowedProcessDate(raw)) {
      throw new Error('La data di contestazione deve essere oggi o nel passato')
    }
    onChange({ ...value, contestationDate: raw })
  }

  const handleEventDateChange = (raw: string) => {
    if (!raw) {
      onChange({ ...value, eventDate: undefined })
      return
    }
    if (!isAllowedProcessDate(raw)) {
      throw new Error('La data del fatto/reato deve essere oggi o nel passato')
    }
    onChange({ ...value, eventDate: raw })
  }

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CellTypeSelect
        value={value.cellType ?? ''}
        onValueChange={handleTypeChange}
        disabled={readOnly}
        triggerClassName="bg-white"
      />
      {dateConfig?.showContestationDate && (
        <>
          <label className="text-xs text-gray-600 whitespace-nowrap">
            {dateConfig.contestationDateLabel}
          </label>
          <Input
            type="date"
            value={value.contestationDate ?? ''}
            min={MIN_PROCESS_DATE}
            max={maxDate}
            onChange={(e) => handleContestationDateChange(e.target.value)}
            disabled={readOnly}
            className="h-8 w-auto text-xs bg-white"
          />
          {dateConfig.showEventDate && (
            <>
              <label className="text-xs text-gray-600 whitespace-nowrap">
                {dateConfig.eventDateLabel}
              </label>
              <Input
                type="date"
                value={value.eventDate ?? ''}
                min={MIN_PROCESS_DATE}
                max={maxDate}
                onChange={(e) => handleEventDateChange(e.target.value)}
                disabled={readOnly}
                className="h-8 w-auto text-xs bg-white"
              />
            </>
          )}
        </>
      )}
      <Input
        value={value.description}
        onChange={(e) =>
          onChange({
            ...value,
            description: e.target.value,
          })
        }
        placeholder="Inserisci descrizione opzionale..."
        disabled={readOnly || !value.cellType}
        className="h-8 flex-[1_1_220px] min-w-[180px] text-xs bg-white"
      />
    </div>
  )
}

/**
 * True se la qualifica è sufficiente per creare una riga nel Riporto.
 */
export function canAddQualifiedExtractToReport(
  qualification: CellTypeQualification
): boolean {
  return Boolean(qualification.cellType)
}
