import React, { useState } from 'react';
import type { DifferentialResult } from '../../../../features/entities/person-extract-manual';
import type { PersonRecord } from '../../../../features/entities/entity-index';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface PersonDifferentialListProps {
  differential: DifferentialResult;
  onConfirm: () => void;
  isSaving: boolean;
}

interface PersonAccordionItemProps {
  person: PersonRecord;
  type: 'new' | 'update';
  newFields?: string[];
  existing?: PersonRecord;
}

function PersonAccordionItem({ person, type, newFields, existing }: PersonAccordionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b border-neutral-200 last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium truncate">{person.full_name}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
              type === 'new'
                ? 'bg-green-100 text-green-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {type === 'new' ? 'Nuovo' : 'Aggiorna'}
          </span>
          {type === 'update' && newFields && newFields.length > 0 && (
            <span className="text-xs text-neutral-500 truncate">
              ({newFields.join(', ')})
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        )}
      </button>
      {isExpanded && type === 'update' && newFields && newFields.length > 0 && (
        <div className="px-3 pb-2 bg-neutral-50">
          <div className="text-xs text-neutral-600 space-y-1">
            <div className="font-medium mb-1">Campi da aggiornare:</div>
            {newFields.map((field, idx) => (
              <div key={idx} className="pl-2">• {field}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PersonDifferentialList({
  differential,
  onConfirm,
  isSaving,
}: PersonDifferentialListProps) {
  const allPersons = [
    ...differential.newPersons.map((p) => ({ person: p, type: 'new' as const })),
    ...differential.updatePersons.map((u) => ({
      person: u.merged,
      type: 'update' as const,
      newFields: u.newFields,
      existing: u.existing,
    })),
  ];

  return (
    <div className="border-t border-neutral-200 mt-2">
      {/* Messaggio differenziale */}
      <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200">
        <div className="text-sm text-neutral-700">
          <div className="font-medium mb-1">
            Ho trovato {differential.stats.totalNew + differential.stats.totalUpdates} nominativo
            {differential.stats.totalNew + differential.stats.totalUpdates !== 1 ? 'i' : ''}:
          </div>
          <div className="text-xs space-y-0.5">
            {differential.stats.totalNew > 0 && (
              <div>• {differential.stats.totalNew} nuovo{differential.stats.totalNew !== 1 ? 'i' : ''}</div>
            )}
            {differential.stats.totalUpdates > 0 && (
              <div>• {differential.stats.totalUpdates} da aggiornare</div>
            )}
          </div>
        </div>
      </div>

      {/* Lista accordion */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: '400px' }}
      >
        {allPersons.map((item, idx) => (
          <PersonAccordionItem
            key={`${item.person.id}-${idx}`}
            person={item.person}
            type={item.type}
            newFields={item.newFields}
            existing={item.existing}
          />
        ))}
      </div>

      {/* Pulsante conferma */}
      <div className="px-3 py-2 border-t border-neutral-200 bg-neutral-50">
        <button
          onClick={onConfirm}
          disabled={isSaving}
          className="w-full px-3 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving
            ? 'Salvataggio...'
            : `Conferma creazione/aggiornamento (${differential.stats.totalNew + differential.stats.totalUpdates} schede)`}
        </button>
      </div>
    </div>
  );
}
