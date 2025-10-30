import { Briefcase, Users, Mail, FileText, Gavel, Search, Hammer, Image, Calendar, Scale } from 'lucide-react'

export function colorFor(nome?: string): string {
    const key = (nome || '').toLowerCase()
    if (key.includes('classificar')) return '#f59e0b' // amber
    if (key.includes('admin')) return '#3b82f6' // blue
    if (key.includes('anagra')) return '#10b981' // emerald
    if (key.includes('corrispondenza') || key.includes('pec')) return '#6366f1' // indigo
    if (key.includes('denuncia') || key.includes('notizia di reato') || key.includes('reato')) return '#ef4444' // red
    if (key.includes('indagini')) return '#a855f7' // purple
    if (key.includes('perizie') || key.includes('consul')) return '#14b8a6' // teal
    if (key.includes('prove') || key.includes('allegati') || key.includes('foto') || key.includes('audio') || key.includes('chat')) return '#f97316' // orange
    if (key.includes('udienze') || key.includes('verbali')) return '#0ea5e9' // sky
    if (key.includes('provvedimenti') || key.includes('giudice') || key.includes('gip') || key.includes('gup')) return '#22c55e' // green
    return '#64748b' // slate
}

export function iconFor(nome?: string) {
    const key = (nome || '').toLowerCase()
    if (key.includes('classificar')) return FileText
    if (key.includes('admin')) return Briefcase
    if (key.includes('anagra')) return Users
    if (key.includes('corrispondenza') || key.includes('pec')) return Mail
    if (key.includes('denuncia') || key.includes('reato')) return Gavel
    if (key.includes('indagini')) return Search
    if (key.includes('perizie') || key.includes('consul')) return Hammer
    if (key.includes('prove') || key.includes('allegati') || key.includes('foto') || key.includes('audio') || key.includes('chat')) return Image
    if (key.includes('udienze') || key.includes('verbali')) return Calendar
    if (key.includes('provvedimenti') || key.includes('giudice') || key.includes('gip') || key.includes('gup')) return Scale
    return FileText
}


