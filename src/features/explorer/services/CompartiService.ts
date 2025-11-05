// Lista dei comparti disponibili (sincronizzata con backend)
export interface CompartoOption {
  key: string;
  nome: string;
  ordine: number;
}

export const COMPARTI_DEFAULT: CompartoOption[] = [
  { key: 'parti_anagrafiche', nome: 'Parti & Anagrafiche', ordine: 0 },
  { key: 'admin_procure', nome: 'Admin & Procure', ordine: 1 },
  { key: 'denuncia_querela', nome: 'Denuncia–Querela / Notizia di reato', ordine: 2 },
  { key: 'indagini_preliminari', nome: 'Indagini preliminari', ordine: 3 },
  { key: 'verbal_arresto_sequestro', nome: 'Verbal: Arresto Perquisizioni Sequestro', ordine: 4 },
  { key: 'interrogatori_dichiarazioni', nome: 'Interrogatori e Dichiarazioni', ordine: 5 },
  { key: 'corrispondenza_pec', nome: 'Corrispondenza & PEC', ordine: 6 },
  { key: 'utenz_scadenze', nome: 'Elenco Utenze Scadenze Proroghe', ordine: 7 },
  { key: 'trascriptioni_intercett', nome: 'Trascrizioni Intercettazioni Telefoniche', ordine: 8 },
  { key: 'atti_interlocutori', nome: 'Atti Interlocutori Corrispondenza Varia', ordine: 9 },
  { key: 'nomi_citati_frequentazioni', nome: 'Nomi Citati in Atti Frequentazioni', ordine: 10 },
  { key: 'contestazioni', nome: 'Contestazioni P.M./GIP', ordine: 11 },
  { key: 'raccolta_prove', nome: 'Raccolta Prove Osservazioni', ordine: 12 },
  { key: 'mappe_concettuali', nome: 'Mappe Concettuali Grafico', ordine: 13 },
  { key: 'note_campo_libero', nome: 'Note a Campo Libero', ordine: 14 },
];

export class CompartiService {
  static getAll(): CompartoOption[] {
    return [...COMPARTI_DEFAULT].sort((a, b) => a.ordine - b.ordine);
  }

  static getByKey(key: string): CompartoOption | undefined {
    return COMPARTI_DEFAULT.find(c => c.key === key);
  }

  static getNome(key: string): string {
    return COMPARTI_DEFAULT.find(c => c.key === key)?.nome || key;
  }
}

