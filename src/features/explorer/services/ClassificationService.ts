import { FileEntry } from '../types';
import { CompartiService, CompartoOption } from './CompartiService';

/**
 * Servizio per la classificazione automatica dei documenti
 * Usa regole euristiche basate sul nome del file e sul contenuto
 */
export class ClassificationService {
  /**
   * Classifica automaticamente un file basandosi sul nome e sul tipo
   * @returns compartoKey o undefined se non classificabile
   */
  static async classifyFile(file: FileEntry): Promise<{ compartoKey: string; compartoNome: string } | null> {
    const fileName = file.name.toLowerCase();
    const parentDir = (file.parentDirName || '').toLowerCase();

    // Regole di classificazione basate su keyword nel nome del file
    const rules: Array<{ compartoKey: string; keywords: RegExp[] }> = [
      {
        compartoKey: 'denuncia_querela',
        keywords: [
          /\bdenuncia\b/i,
          /\bquerela\b/i,
          /notizia\s+di\s+reato/i,
          /\besposto\b/i
        ]
      },
      {
        compartoKey: 'indagini_preliminari',
        keywords: [
          /art\.?\s*415\s*-?\s*bis/i,
          /415\s*-?\s*bis/i,
          /avviso\s+ex\s+415/i,
          /procura\s+della\s+repubblica/i,
          /polizia\s+giudiziaria/i,
          /informativa\s+di\s+reato/i,
          /sequestro\s+probatorio/i,
          /\bperquisizione\b/i,
          /verbale\s+di\s+sequestro/i,
          /invito\s+a\s+presentarsi/i
        ]
      },
      {
        compartoKey: 'verbal_arresto_sequestro',
        keywords: [
          /\bverbale\b.*\barresto\b/i,
          /\bverbale\b.*\bsequestro\b/i,
          /\bverbale\b.*\bperquisizione\b/i,
          /\barresto\b/i,
          /\bsequestro\b/i
        ]
      },
      {
        compartoKey: 'interrogatori_dichiarazioni',
        keywords: [
          /\binterrogatorio\b/i,
          /\bdichiarazione\b/i,
          /\binterrogato\b/i
        ]
      },
      {
        compartoKey: 'corrispondenza_pec',
        keywords: [
          /\bpec\b/i,
          /\bemail\b/i,
          /\bcorrispondenza\b/i,
          /\bcomunicazione\b/i,
          /\blettera\b/i
        ]
      },
      {
        compartoKey: 'trascriptioni_intercett',
        keywords: [
          /\bintercettazione\b/i,
          /\btrascrizione\b/i,
          /\bintercett\b/i,
          /\bcall\b/i,
          /\bchiamata\b/i
        ]
      },
      {
        compartoKey: 'contestazioni',
        keywords: [
          /\bcontestazione\b/i,
          /\bcontesto\b/i,
          /\bpm\b/i,
          /\bgip\b/i
        ]
      },
      {
        compartoKey: 'raccolta_prove',
        keywords: [
          /\bprova\b/i,
          /\ballegato\b/i,
          /\bfoto\b/i,
          /\bimmagine\b/i,
          /\bvideo\b/i,
          /\baudio\b/i
        ]
      },
      {
        compartoKey: 'parti_anagrafiche',
        keywords: [
          /\banagrafica\b/i,
          /\bidentità\b/i,
          /\bfoglio\s+notizia\b/i,
          /\bparti\b/i
        ]
      },
      {
        compartoKey: 'admin_procure',
        keywords: [
          /\bprocura\b/i,
          /\bdelega\b/i,
          /\badmin\b/i
        ]
      }
    ];

    // Controlla ogni regola
    for (const rule of rules) {
      for (const keyword of rule.keywords) {
        if (keyword.test(fileName) || keyword.test(parentDir)) {
          const comparto = CompartiService.getByKey(rule.compartoKey);
          if (comparto) {
            return {
              compartoKey: comparto.key,
              compartoNome: comparto.nome
            };
          }
        }
      }
    }

    // Se è un file multimediale senza classificazione specifica, usa "Prove & Allegati"
    if (['image', 'video', 'audio'].includes(file.kind)) {
      const comparto = CompartiService.getByKey('raccolta_prove');
      if (comparto) {
        return {
          compartoKey: comparto.key,
          compartoNome: comparto.nome
        };
      }
    }

    // Nessuna classificazione trovata
    return null;
  }
}

