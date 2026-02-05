/**
 * ✅ Fase 4: Highlight overlay per evidenziare campi anagrafici nel PDF
 */

import React from 'react';
import type { HighlightBox } from '../../../../features/entities/person-extract-mapping';

interface PersonHighlightOverlayProps {
  highlights: HighlightBox[];
  viewportBox: { x: number; y: number; w: number; h: number }; // Box della selezione in pixel viewport
  pageLayer: HTMLElement;
  pageNumber: number;
}

// Colori per tipo campo
const FIELD_COLORS: Record<string, { bg: string; border: string }> = {
  'Nome': { bg: 'rgba(255, 215, 0, 0.35)', border: 'rgba(255, 200, 0, 0.8)' }, // Giallo oro
  'Data nascita': { bg: 'rgba(255, 107, 107, 0.35)', border: 'rgba(255, 80, 80, 0.8)' }, // Rosso
  'Luogo nascita': { bg: 'rgba(78, 205, 196, 0.35)', border: 'rgba(60, 180, 170, 0.8)' }, // Turchese
  'Residenza': { bg: 'rgba(149, 225, 211, 0.35)', border: 'rgba(120, 200, 185, 0.8)' }, // Verde acqua
  'Domicilio': { bg: 'rgba(243, 129, 129, 0.35)', border: 'rgba(220, 100, 100, 0.8)' }, // Rosa
  'CF': { bg: 'rgba(255, 160, 122, 0.35)', border: 'rgba(255, 140, 100, 0.8)' }, // Salmone
  'Telefono': { bg: 'rgba(152, 216, 200, 0.35)', border: 'rgba(120, 190, 170, 0.8)' }, // Verde menta
  'Email': { bg: 'rgba(247, 220, 111, 0.35)', border: 'rgba(240, 200, 80, 0.8)' }, // Giallo chiaro
  'CAP': { bg: 'rgba(187, 143, 206, 0.35)', border: 'rgba(160, 120, 180, 0.8)' }, // Viola chiaro
};

const DEFAULT_COLOR = { bg: 'rgba(255, 255, 0, 0.35)', border: 'rgba(255, 200, 0, 0.8)' };

export const PersonHighlightOverlay: React.FC<PersonHighlightOverlayProps> = ({
  highlights,
  viewportBox,
  pageLayer,
  pageNumber,
}) => {
  if (!highlights || highlights.length === 0) return null;

  // ✅ Converti coordinate normalizzate (0-1) in pixel viewport
  // Le coordinate sono relative all'immagine ritagliata, quindi le convertiamo rispetto al viewportBox
  const pageRect = pageLayer.getBoundingClientRect();
  const selectionWidth = viewportBox.w;
  const selectionHeight = viewportBox.h;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // ✅ Non intercetta eventi mouse
        zIndex: 1000, // ✅ Sopra il PDF ma sotto gli overlay interattivi
      }}
    >
      {highlights.map((highlight, idx) => {
        const colors = FIELD_COLORS[highlight.fieldLabel] || DEFAULT_COLOR;

        // ✅ Converti coordinate normalizzate (0-1) in pixel relativi alla selezione
        const x = highlight.x * selectionWidth;
        const y = highlight.y * selectionHeight;
        const w = highlight.w * selectionWidth;
        const h = highlight.h * selectionHeight;

        // ✅ Posiziona relativamente al viewportBox della selezione
        const absoluteX = viewportBox.x + x;
        const absoluteY = viewportBox.y + y;

        return (
          <div
            key={`highlight-${idx}-${highlight.personIndex}-${highlight.fieldLabel}`}
            style={{
              position: 'absolute',
              left: `${absoluteX}px`,
              top: `${absoluteY}px`,
              width: `${w}px`,
              height: `${h}px`,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: '2px',
              pointerEvents: 'none',
            }}
            title={`${highlight.fieldLabel}: ${highlight.fieldValue}`}
          />
        );
      })}
    </div>
  );
};
