/**
 * ✅ Highlight overlay per evidenziare campi anagrafici sopra l'immagine ritagliata
 * Le coordinate sono normalizzate (0-1) rispetto all'immagine ritagliata
 */

import React from 'react';
import type { HighlightBox } from '../../../../features/entities/person-extract-mapping';

interface PersonImageHighlightOverlayProps {
  highlights: HighlightBox[];
  imageRef: React.RefObject<HTMLImageElement>;
}

// Colori per tipo campo
const FIELD_COLORS: Record<string, { bg: string; border: string }> = {
  'Nome': { bg: 'rgba(255, 215, 0, 0.35)', border: 'rgba(255, 200, 0, 0.8)' }, // Giallo oro
  'Data nascita': { bg: 'rgba(255, 107, 107, 0.35)', border: 'rgba(255, 80, 80, 0.8)' }, // Rosso
  'Luogo nascita': { bg: 'rgba(78, 205, 196, 0.35)', border: 'rgba(60, 180, 170, 0.8)' }, // Turchese
  'Residenza': { bg: 'rgba(149, 225, 211, 0.35)', border: 'rgba(120, 200, 185, 0.8)' }, // Verde acqua
  'Domicilio': { bg: 'rgba(243, 129, 129, 0.35)', border: 'rgba(220, 100, 100, 0.8)' }, // Rosa
  'Professione': { bg: 'rgba(133, 193, 233, 0.35)', border: 'rgba(70, 150, 205, 0.8)' }, // Azzurro
  'CF': { bg: 'rgba(255, 160, 122, 0.35)', border: 'rgba(255, 140, 100, 0.8)' }, // Salmone
  'Telefono': { bg: 'rgba(152, 216, 200, 0.35)', border: 'rgba(120, 190, 170, 0.8)' }, // Verde menta
  'Email': { bg: 'rgba(247, 220, 111, 0.35)', border: 'rgba(240, 200, 80, 0.8)' }, // Giallo chiaro
  'CAP': { bg: 'rgba(187, 143, 206, 0.35)', border: 'rgba(160, 120, 180, 0.8)' }, // Viola chiaro
};

const DEFAULT_COLOR = { bg: 'rgba(255, 255, 0, 0.35)', border: 'rgba(255, 200, 0, 0.8)' };

export const PersonImageHighlightOverlay: React.FC<PersonImageHighlightOverlayProps> = ({
  highlights,
  imageRef,
}) => {
  if (!highlights || highlights.length === 0 || !imageRef?.current) return null;

  // ✅ Le coordinate sono già normalizzate (0-1) rispetto all'immagine ritagliata
  // Usiamo direttamente percentuali CSS - il container ha position: relative e le stesse dimensioni dell'immagine
  return (
    <>
      {highlights.map((highlight, idx) => {
        const colors = FIELD_COLORS[highlight.fieldLabel] || DEFAULT_COLOR;

        // ✅ Coordinate normalizzate (0-1) → percentuali CSS
        const left = `${highlight.x * 100}%`;
        const top = `${highlight.y * 100}%`;
        const width = `${highlight.w * 100}%`;
        const height = `${highlight.h * 100}%`;

        return (
          <div
            key={`highlight-${idx}-${highlight.personIndex}-${highlight.fieldLabel}`}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: '2px',
              pointerEvents: 'none',
              zIndex: 10, // ✅ Sopra l'immagine
            }}
            title={`${highlight.fieldLabel}: ${highlight.fieldValue}`}
          />
        );
      })}
    </>
  );
};
