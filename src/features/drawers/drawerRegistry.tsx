import { FileText, Gavel, Zap, Hash, Landmark, Shield, Phone, Clock, Users, Boxes, ScanText } from 'lucide-react'

export type DrawerDef = {
  id: string
  label: string
  icon: JSX.Element
}

export const drawerRegistry: DrawerDef[] = [
  { id: 'verbale', label: 'Elenco verbali redatti', icon: <FileText size={16} /> },
  { id: 'verbale_sequestro', label: 'Verbale di sequestro', icon: <FileText size={16} /> },
  { id: 'verbale_arresto', label: 'Verbale di arresto', icon: <FileText size={16} /> },
  { id: 'intercettazioni', label: 'Intercettazioni', icon: <Hash size={16} /> },
  { id: 'reati', label: 'Reati contestati', icon: <Boxes size={16} /> },
  { id: 'procura', label: 'Procura che procede', icon: <Landmark size={16} /> },
  { id: 'ufficio_pg', label: "Ufficio PG", icon: <Shield size={16} /> },
  { id: 'contatti', label: 'Contatti telefonici', icon: <Phone size={16} /> },
  { id: 'timeline', label: 'Termini processuali', icon: <Clock size={16} /> },
  { id: 'anagrafe', label: 'Anagrafe entità', icon: <Users size={16} /> },
  { id: 'incontri', label: 'Incontri documentati', icon: <Zap size={16} /> },
]

export function getDrawerOptionsSorted() {
  return [...drawerRegistry].sort((a, b) => a.label.localeCompare(b.label))
}
