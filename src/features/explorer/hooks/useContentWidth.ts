import { useState, useEffect, useRef } from 'react';

interface UseContentWidthOptions {
  minWidth?: number;
  maxWidth?: number;
  padding?: number;
  measureText?: boolean;
}

/**
 * Hook per calcolare la larghezza ottimale basandosi sul contenuto
 */
export function useContentWidth(
  content: string[] | React.ReactNode,
  options: UseContentWidthOptions = {}
) {
  const { minWidth = 300, maxWidth = 800, padding = 40, measureText = true } = options;
  const [optimalWidth, setOptimalWidth] = useState<number>(minWidth);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!measureText || !measureRef.current) {
      setOptimalWidth(minWidth);
      return;
    }

    const measureElement = measureRef.current;
    
    // Se abbiamo un array di stringhe, calcoliamo la larghezza del testo più lungo
    if (Array.isArray(content)) {
      let maxTextWidth = 0;
      
      // Creiamo un elemento temporaneo per misurare il testo
      const tempElement = document.createElement('div');
      tempElement.style.position = 'absolute';
      tempElement.style.visibility = 'hidden';
      tempElement.style.whiteSpace = 'nowrap';
      tempElement.style.font = window.getComputedStyle(measureElement).font;
      document.body.appendChild(tempElement);

      content.forEach(text => {
        tempElement.textContent = text;
        const textWidth = tempElement.offsetWidth;
        maxTextWidth = Math.max(maxTextWidth, textWidth);
      });

      document.body.removeChild(tempElement);
      
      // Aggiungiamo padding e limitiamo tra min e max
      const calculatedWidth = Math.max(minWidth, Math.min(maxWidth, maxTextWidth + padding));
      setOptimalWidth(calculatedWidth);
    } else {
      // Per contenuto React, usiamo la larghezza naturale dell'elemento
      const naturalWidth = measureElement.scrollWidth;
      const calculatedWidth = Math.max(minWidth, Math.min(maxWidth, naturalWidth + padding));
      setOptimalWidth(calculatedWidth);
    }
  }, [content, minWidth, maxWidth, padding, measureText]);

  return {
    optimalWidth,
    measureRef
  };
}
