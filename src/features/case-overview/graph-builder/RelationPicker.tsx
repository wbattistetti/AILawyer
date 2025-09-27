import React from 'react'
import type { NodeKind, RelationKind } from './types'

function sortOptions(opts: RelationKind[]): RelationKind[] {
  return [...opts].sort((a, b) => labelFor(a).localeCompare(labelFor(b)))
}

export function getRelationOptions(source: NodeKind, target: NodeKind): RelationKind[] {
  const isPerson = (k: NodeKind) => k === 'male' || k === 'female'
  if (isPerson(source) && isPerson(target)) {
    const base: RelationKind[] = ['padre','madre','figlio','figlia','marito','moglie','convivente','ex_coniuge','fidanzato','fidanzata','fratello','sorella','frequentazione','amicizia_affari']
    // Filtra opzioni gender-specific basate sul sesso della sorgente
    return sortOptions(base.filter((r) => {
      if (source === 'male' && (r === 'madre' || r === 'moglie' || r === 'fidanzata' || r === 'sorella' || r === 'figlia')) return false
      if (source === 'female' && (r === 'padre' || r === 'marito' || r === 'fidanzato' || r === 'fratello' || r === 'figlio')) return false
      return true
    }))
  }
  if (isPerson(source) && target === 'company') {
    return sortOptions(['dipendente','amministratore_unico','amministratore','consigliere','rappresentante_legale','titolare_firmatario','socio','socio_occulto','accomandatario','accomandante','gestore','appaltatore','fornitore','cliente','proprietario','interessi'])
  }
  if (source === 'company' && isPerson(target)) {
    return sortOptions(['datore','amministratore','consigliere','rappresentante_legale','titolare_firmatario','socio','socio_occulto','accomandatario','accomandante','gestore','appaltatore','fornitore','cliente'])
  }
  if (isPerson(source) && (target === 'bar' || target === 'restaurant')) {
    return sortOptions(['proprietario','gestore','dipendente','frequentatore','incontro_presso'])
  }
  if (isPerson(source) && (target === 'vehicle' || target === 'motorcycle')) {
    return sortOptions(['proprietario','intestatario','conducente_abituale','utilizzatore'])
  }
  if (source === 'company' && target === 'company') {
    return sortOptions(['controllante','controllata','collegata','joint_venture','acquisizione','cessione'])
  }
  return sortOptions(['frequentazione'])
}

export default function RelationPicker({ sourceName, targetName, sourceKind, targetKind, options, onPick }: { sourceName: string; targetName: string; sourceKind: NodeKind; targetKind: NodeKind; options: RelationKind[]; onPick: (rel: RelationKind) => void }) {
  return (
    <div className="bg-white border rounded shadow-md p-2 text-sm min-w-[220px]">
      <div className="text-xs text-slate-500 mb-1">{sourceName} è…</div>
      <div className="grid grid-cols-1 gap-1 max-h-64 overflow-auto">
        {options.map(opt => (
          <button key={opt} className="text-left px-2 py-1 rounded hover:bg-slate-100" onClick={() => onPick(opt)}>
            {labelFor(opt)}
          </button>
        ))}
      </div>
      <div className="text-xs text-slate-500 mt-2">…di <b>{targetName}</b></div>
    </div>
  )
}

export function labelFor(rel: RelationKind): string {
  const map: Record<RelationKind, string> = {
    padre:'Padre', madre:'Madre', figlio:'Figlio', figlia:'Figlia',
    marito:'Marito', moglie:'Moglie', convivente:'Convivente/Partner', ex_coniuge:'Ex coniuge', fidanzato:'Fidanzato', fidanzata:'Fidanzata', fratello:'Fratello', sorella:'Sorella', amicizia_affari:'Amicizia–Affari', frequentazione:'Frequentazione abituale',
    collega:'Collega', superiore:'Superiore', subordinato:'Subordinato',
    dipendente:'Dipendente di', datore:'Datore di lavoro di', amministratore_unico:'Amministratore unico di', amministratore:'Amministratore di', consigliere:'Consigliere di', rappresentante_legale:'Rappresentante legale di', titolare_firmatario:'Titolare firmatario di', socio:'Socio di', socio_occulto:'Socio occulto di', accomandatario:'Accomandatario di', accomandante:'Accomandante di', gestore:'Gestore di', appaltatore:'Appaltatore di', fornitore:'Fornitore di', cliente:'Cliente di', proprietario:'Proprietario di', interessi:'Interessi in',
    frequentatore:'Frequentatore abituale di', incontro_presso:'Incontro presso',
    intestatario:'Intestatario di', conducente_abituale:'Conducente abituale di', utilizzatore:'Utilizzatore di',
    controllante:'Controllante di', controllata:'Controllata da', collegata:'Collegata', joint_venture:'Joint venture', acquisizione:'Acquisizione', cessione:'Cessione',
  }
  return map[rel] || rel
}


