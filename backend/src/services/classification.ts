import { ClassificationResult } from '../types/index.js'
import { config } from '../config/index.js'

export class PenaleClassificationService {
  private readonly rules = [
    {
      compartoKey: 'denuncia_querela',
      keywords: [
        /\bdenuncia\b/i,
        /\bquerela\b/i,
        /notizia\s+di\s+reato/i,
        /\besposto\b/i
      ],
      baseConfidence: 75,
      tags: ['denuncia', 'querela', 'notizia-reato']
    },
    {
      compartoKey: 'indagini_preliminari',
      keywords: [
        /art\.?\s*415\s*-?\s*bis/i,
        /avviso\s+ex\s+415\s*-?\s*bis/i,
        /procura\s+della\s+repubblica/i,
        /polizia\s+giudiziaria/i,
        /informativa\s+di\s+reato/i,
        /sequestro\s+probatorio/i,
        /\bperquisizione\b/i,
        /verbale\s+di\s+sequestro/i,
        /invito\s+a\s+presentarsi/i
      ],
      baseConfidence: 80,
      tags: ['415-bis', 'indagini', 'sequestro', 'perquisizione']
    },
    {
      compartoKey: 'perizie_consulenze',
      keywords: [
        /consulenza\s+tecnica\s+di\s+parte/i,
        /consulente\s+tecnico/i,
        /\bCTP\b/i,
        /\bCTU\b/i,
        /\bperizia\b/i,
        /elaborato\s+peritale/i
      ],
      baseConfidence: 70,
      tags: ['CTP', 'CTU', 'perizia', 'consulenza']
    },
    {
      compartoKey: 'prove_allegati',
      keywords: [
        /\ballegati\b/i,
        /supporto\s+digitale/i,
        /trascrizioni\s+chat/i,
        /\bwhatsapp\b/i,
        /\bscreenshot\b/i,
        /\bfotografia\b/i,
        /file\s+audio/i,
        /registro\s+chiamate/i
      ],
      baseConfidence: 65,
      tags: ['allegati', 'chat', 'audio', 'foto']
    },
    {
      compartoKey: 'udienze_verbali',
      keywords: [
        /verbale\s+di\s+udienza/i,
        /udienza\s+dibattimentale/i,
        /lista\s+testi/i,
        /esame.*(?:imputato|teste)/i,
        /\bdibattimento\b/i
      ],
      baseConfidence: 75,
      tags: ['udienza', 'verbale', 'dibattimento', 'testi']
    },
    {
      compartoKey: 'provvedimenti_giudice',
      keywords: [
        /\bordinanza\b/i,
        /\bdecreto\b/i,
        /\bsentenza\b/i,
        /\bprovvedimento\b/i,
        /\bGIP\b/i,
        /\bGUP\b/i,
        /tribunale\s+collegiale/i,
        /\bmonocratico\b/i
      ],
      baseConfidence: 80,
      tags: ['provvedimento', 'GIP', 'GUP', 'sentenza', 'ordinanza']
    },
    {
      compartoKey: 'admin_procure',
      keywords: [
        /procura\s+alle\s+liti/i,
        /delega\s+difensiva/i,
        /nomina\s+difensore/i,
        /informativa\s+privacy/i
      ],
      baseConfidence: 70,
      tags: ['procura', 'delega', 'privacy']
    },
    {
      compartoKey: 'corrispondenza_pec',
      keywords: [
        /posta\s+elettronica\s+certificata/i,
        /\bPEC\b/i,
        /ricevuta\s+accettazione/i,
        /ricevuta.*consegna/i,
        /oggetto:/i
      ],
      baseConfidence: 70,
      tags: ['PEC', 'corrispondenza']
    },
    {
      compartoKey: 'parti_anagrafiche',
      keywords: [
        /modulo\s+anagrafico/i,
        /documento\s+identità/i,
        /foglio\s+notizie/i,
        /dati\s+anagrafici/i
      ],
      baseConfidence: 65,
      tags: ['anagrafica', 'identità']
    }
  ]

  classify(text: string, filename: string): ClassificationResult {
    const normalizedText = text.toLowerCase()
    const normalizedFilename = filename.toLowerCase()
    
    // Check for image/audio extensions to boost "prove_allegati" confidence
    const mediaExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'mp3', 'wav', 'mp4', 'avi']
    const isMediaFile = mediaExtensions.some(ext => normalizedFilename.endsWith(`.${ext}`))
    
    let bestMatch: ClassificationResult = {
      compartoKey: 'da_classificare',
      tags: ['needs_review'],
      confidence: 0,
      why: 'Nessuna regola applicabile'
    }

    for (const rule of this.rules) {
      let confidence = 0
      let matchedKeywords: string[] = []
      let matchReasons: string[] = []

      // Check keywords in text (higher weight for first 2 pages simulation)
      const textToCheck = normalizedText.substring(0, 2000) // Simulate first 2 pages
      
      for (const keyword of rule.keywords) {
        if (keyword.test(textToCheck)) {
          confidence += rule.baseConfidence
          matchedKeywords.push(keyword.source)
          matchReasons.push(`trovato "${keyword.source}" nel testo`)
        }
      }

      // Check filename
      for (const keyword of rule.keywords) {
        if (keyword.test(normalizedFilename)) {
          confidence += 10 // Bonus for filename match
          matchReasons.push(`trovato "${keyword.source}" nel nome file`)
        }
      }

      // Special boost for media files in prove_allegati
      if (rule.compartoKey === 'prove_allegati' && isMediaFile) {
        confidence += 15
        matchReasons.push('file multimediale')
      }

      // Normalize confidence (max 100)
      confidence = Math.min(confidence, 100)

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          compartoKey: rule.compartoKey,
          tags: [...rule.tags, ...matchedKeywords.slice(0, 3)], // Limit tags
          confidence,
          why: matchReasons.join(', ')
        }
      }
    }

    // Apply confidence threshold
    if (bestMatch.confidence < config.CLASSIFY_CONFIDENCE_THRESHOLD) {
      return {
        compartoKey: 'da_classificare',
        tags: ['needs_review', 'low_confidence'],
        confidence: bestMatch.confidence,
        why: `Confidenza troppo bassa (${bestMatch.confidence}%): ${bestMatch.why}`
      }
    }

    return bestMatch
  }
}

export const classificationService = new PenaleClassificationService()