/**
 * Palette colori/icone condivisa per i cassetti (tab strip Correlato e tab dock).
 * Matching su nome o chiave comparto (supporta singolare/plurale, es. anagrafica/anagrafiche).
 */
import { Users, Mail, FileText, Gavel, Search, Image, Calendar, Landmark } from 'lucide-react'

export function colorFor(nome?: string): string {
    const key = (nome || '').toLowerCase()
    if (key.includes('parti') || key.includes('anagrafic') || key.includes('o.c.c.c') || key.includes('inquisito')) return '#3b82f6' // blue
    if (key.includes('admin') || key.includes('procure')) return '#8b5cf6' // violet
    if (key.includes('fatto') || key.includes('reati') || key.includes('contestati') || key.includes('p.m.')) return '#ef4444' // red
    if (key.includes('informativa')) return '#3b82f6' // blue
    if (key.includes('fascicolo') || key.includes('gip') || key.includes('indagini preliminari') || key.includes('preliminari')) return '#a855f7' // purple
    if (key.includes('verbali') || key.includes('arresto') || key.includes('perquisizioni') || key.includes('sequestro')) return '#f97316' // orange
    if (key.includes('interrogatori') || key.includes('dichiarazioni')) return '#0ea5e9' // sky
    if (key.includes('intercettazioni') || key.includes('telefoniche')) return '#6366f1' // indigo
    if (key.includes('utenze') || key.includes('scadenze') || key.includes('proroghe')) return '#14b8a6' // teal
    if (key.includes('trascriptioni') || key.includes('trascrizioni')) return '#8b5cf6' // violet
    if (key.includes('corrispondenza') || key.includes('atti interlocutori') || key.includes('pec')) return '#06b6d4' // cyan
    if (key.includes('denuncia') || key.includes('querela') || key.includes('reato')) return '#dc2626' // red-600
    if (key.includes('nomi citati') || key.includes('frequentazioni')) return '#22c55e' // green
    if (key.includes('contestazioni')) return '#dc2626' // red-600
    if (key.includes('raccolta prove') || key.includes('osservazioni') || (key.includes('prove') && key.includes('allegati'))) return '#f59e0b' // amber
    if (key.includes('mappe') || key.includes('concettuali') || key.includes('grafico')) return '#06b6d4' // cyan
    if (key.includes('note') || key.includes('campo libero')) return '#64748b' // slate
    if (key.includes('perizie') || key.includes('consulenze')) return '#10b981' // emerald
    if (key.includes('provvedimenti') || key.includes('gup') || key.includes('trib')) return '#6366f1' // indigo
    return '#64748b' // slate
}

/** Restituisce il componente icona Lucide per un comparto (stesso per cassetto e tab). */
export function iconFor(nome?: string) {
    const key = (nome || '').toLowerCase()
    if (key.includes('parti') || key.includes('anagrafic') || key.includes('o.c.c.c') || key.includes('inquisito')) return Users
    if (key.includes('admin') || key.includes('procure')) return Landmark
    if (key.includes('fatto') || key.includes('reati') || key.includes('contestati') || key.includes('p.m.') || key.includes('denuncia') || key.includes('querela')) return Gavel
    if (key.includes('informativa')) return FileText
    if (key.includes('fascicolo') || key.includes('gip') || key.includes('indagini preliminari') || key.includes('preliminari')) return Search
    if (key.includes('verbali') || key.includes('arresto') || key.includes('perquisizioni') || key.includes('sequestro')) return FileText
    if (key.includes('interrogatori') || key.includes('dichiarazioni')) return FileText
    if (key.includes('intercettazioni') || key.includes('telefoniche') || key.includes('intercett')) return Mail
    if (key.includes('utenze') || key.includes('scadenze') || key.includes('proroghe')) return Calendar
    if (key.includes('trascriptioni') || key.includes('trascrizioni')) return FileText
    if (key.includes('corrispondenza') || key.includes('atti interlocutori') || key.includes('pec')) return Mail
    if (key.includes('nomi citati') || key.includes('frequentazioni')) return Users
    if (key.includes('contestazioni')) return Gavel
    if (key.includes('raccolta prove') || key.includes('osservazioni') || (key.includes('prove') && key.includes('allegati'))) return Image
    if (key.includes('mappe') || key.includes('concettuali') || key.includes('grafico')) return Search
    if (key.includes('note') || key.includes('campo libero')) return FileText
    if (key.includes('perizie') || key.includes('consulenze')) return FileText
    if (key.includes('provvedimenti') || key.includes('gup') || key.includes('trib')) return Gavel
    return FileText
}


