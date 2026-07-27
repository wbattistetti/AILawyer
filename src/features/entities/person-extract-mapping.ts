/**
 * ✅ Fase 3: Mapping testo → bounding boxes
 * Mappa startIndex/endIndex di campi estratti ai bounding boxes delle parole OCR
 */

import type { FieldWithIndices, ExtractedPersonWithIndices } from './person-extract-manual';

export type OcrWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  startIndex: number;
  endIndex: number;
};

export type HighlightBox = {
  x: number; // x0 normalizzato (0-1)
  y: number; // y0 normalizzato (0-1)
  w: number; // width normalizzato (0-1)
  h: number; // height normalizzato (0-1)
  personIndex: number;
  fieldLabel: string;
  fieldValue: string;
};

export type HighlightResult = {
  highlights: HighlightBox[];
  imageWidth: number;
  imageHeight: number;
};

/**
 * Mappa un campo con indici ai bounding boxes delle parole OCR
 */
function mapFieldToBoundingBoxes(
  field: FieldWithIndices | null,
  words: OcrWord[],
  imageWidth: number,
  imageHeight: number
): HighlightBox[] {
  if (!field) return [];

  const boxes: HighlightBox[] = [];

  // Trova tutte le parole che si sovrappongono con il campo
  const overlappingWords = words.filter(word => {
    // Verifica se la parola è dentro o si sovrappone al range del campo
    return (
      (word.startIndex >= field.startIndex && word.startIndex < field.endIndex) ||
      (word.endIndex > field.startIndex && word.endIndex <= field.endIndex) ||
      (word.startIndex <= field.startIndex && word.endIndex >= field.endIndex)
    );
  });

  if (overlappingWords.length === 0) {
    console.warn('[PERSON-EXTRACT] Nessuna parola trovata per campo', {
      fieldValue: field.value,
      startIndex: field.startIndex,
      endIndex: field.endIndex,
      wordsCount: words.length
    });
    return [];
  }

  // Calcola bounding box unificato di tutte le parole sovrapposte
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const word of overlappingWords) {
    minX = Math.min(minX, word.bbox.x0);
    minY = Math.min(minY, word.bbox.y0);
    maxX = Math.max(maxX, word.bbox.x1);
    maxY = Math.max(maxY, word.bbox.y1);
  }

  // Normalizza coordinate (0-1)
  const x = imageWidth > 0 ? minX / imageWidth : 0;
  const y = imageHeight > 0 ? minY / imageHeight : 0;
  const w = imageWidth > 0 ? (maxX - minX) / imageWidth : 0;
  const h = imageHeight > 0 ? (maxY - minY) / imageHeight : 0;

  return [{
    x,
    y,
    w,
    h,
    personIndex: -1, // Sarà impostato dal chiamante
    fieldLabel: '', // Sarà impostato dal chiamante
    fieldValue: field.value,
  }];
}

/**
 * Mappa tutte le persone estratte ai bounding boxes per evidenziare
 */
export function mapTextToBoundingBoxes(
  persons: ExtractedPersonWithIndices[],
  words: OcrWord[],
  imageWidth: number,
  imageHeight: number
): HighlightResult {
  const highlights: HighlightBox[] = [];

  for (let i = 0; i < persons.length; i++) {
    const person = persons[i];

    // Colori per tipo campo (saranno usati nel componente overlay)
    const fieldColors: Record<string, string> = {
      'Nome': '#FFD700', // Giallo oro
      'Data nascita': '#FF6B6B', // Rosso
      'Luogo nascita': '#4ECDC4', // Turchese
      'Residenza': '#95E1D3', // Verde acqua
      'Domicilio': '#F38181', // Rosa
      'CF': '#FFA07A', // Salmone
      'Telefono': '#98D8C8', // Verde menta
      'Email': '#F7DC6F', // Giallo chiaro
      'CAP': '#BB8FCE', // Viola chiaro
      'Professione': '#85C1E9', // Azzurro
    };

    // Nome
    const nameBoxes = mapFieldToBoundingBoxes(
      {
        value: person.fullName,
        startIndex: person.fullNameIndices.startIndex,
        endIndex: person.fullNameIndices.endIndex,
      },
      words,
      imageWidth,
      imageHeight
    );
    nameBoxes.forEach(box => {
      box.personIndex = i;
      box.fieldLabel = 'Nome';
    });
    highlights.push(...nameBoxes);

    // Data nascita
    if (person.birthDate) {
      const dobBoxes = mapFieldToBoundingBoxes(person.birthDate, words, imageWidth, imageHeight);
      dobBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'Data nascita';
      });
      highlights.push(...dobBoxes);
    }

    // Luogo nascita
    if (person.birthPlace) {
      const pobBoxes = mapFieldToBoundingBoxes(person.birthPlace, words, imageWidth, imageHeight);
      pobBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'Luogo nascita';
      });
      highlights.push(...pobBoxes);
    }

    // Residenza
    if (person.residence) {
      const resBoxes = mapFieldToBoundingBoxes(person.residence, words, imageWidth, imageHeight);
      resBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'Residenza';
      });
      highlights.push(...resBoxes);
    }

    // Domicilio
    if (person.domicile) {
      const domBoxes = mapFieldToBoundingBoxes(person.domicile, words, imageWidth, imageHeight);
      domBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'Domicilio';
      });
      highlights.push(...domBoxes);
    }

    // CF
    if (person.taxCode) {
      const cfBoxes = mapFieldToBoundingBoxes(person.taxCode, words, imageWidth, imageHeight);
      cfBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'CF';
      });
      highlights.push(...cfBoxes);
    }

    // Telefono
    if (person.phone) {
      const phoneBoxes = mapFieldToBoundingBoxes(person.phone, words, imageWidth, imageHeight);
      phoneBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'Telefono';
      });
      highlights.push(...phoneBoxes);
    }

    // Email
    if (person.email) {
      const emailBoxes = mapFieldToBoundingBoxes(person.email, words, imageWidth, imageHeight);
      emailBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'Email';
      });
      highlights.push(...emailBoxes);
    }

    // CAP
    if (person.postalCode) {
      const capBoxes = mapFieldToBoundingBoxes(person.postalCode, words, imageWidth, imageHeight);
      capBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'CAP';
      });
      highlights.push(...capBoxes);
    }

    // Professione
    if (person.profession) {
      const professionBoxes = mapFieldToBoundingBoxes(person.profession, words, imageWidth, imageHeight);
      professionBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = 'Professione';
      });
      highlights.push(...professionBoxes);
    }

    // Altri campi generici
    for (const field of person.fields) {
      const fieldBoxes = mapFieldToBoundingBoxes(
        {
          value: field.value,
          startIndex: field.startIndex,
          endIndex: field.endIndex,
        },
        words,
        imageWidth,
        imageHeight
      );
      fieldBoxes.forEach(box => {
        box.personIndex = i;
        box.fieldLabel = field.label;
      });
      highlights.push(...fieldBoxes);
    }
  }

  return {
    highlights,
    imageWidth,
    imageHeight,
  };
}
