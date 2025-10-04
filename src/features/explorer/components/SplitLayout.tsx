import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SplitLayoutProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
  leftWidth?: number;
  rightWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  className?: string;
  // Nuove props per la larghezza dinamica
  centerAutoWidth?: boolean;
  centerMinWidth?: number;
  centerMaxWidth?: number;
  centerWidth?: number; // Larghezza esterna per il pannello centrale
}

export function SplitLayout({
  left,
  center,
  right,
  leftWidth = 400,
  rightWidth = 400,
  minLeftWidth = 200,
  minRightWidth = 300,
  className = '',
  centerAutoWidth = false,
  centerMinWidth = 300,
  centerMaxWidth = 800,
  centerWidth
}: SplitLayoutProps) {
  const [leftW, setLeftW] = useState(leftWidth);
  const [rightW, setRightW] = useState(rightWidth);
  const [isRightVisible, setIsRightVisible] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [centerW, setCenterW] = useState<number | null>(null);

  // Funzione per calcolare la larghezza ottimale del pannello centrale
  const calculateOptimalCenterWidth = () => {
    if (!centerAutoWidth) return null;
    
    // Per ora, usiamo una larghezza fissa ottimale
    // In futuro, potremmo calcolare dinamicamente basandoci sul contenuto
    return Math.max(centerMinWidth, Math.min(centerMaxWidth, 500));
  };

  // Aggiorna la larghezza del centro quando cambia il contenuto o la prop esterna
  React.useEffect(() => {
    if (centerWidth !== undefined) {
      // Usa la larghezza esterna se fornita
      const constrainedWidth = Math.max(centerMinWidth, Math.min(centerMaxWidth, centerWidth));
      setCenterW(constrainedWidth);
    } else if (centerAutoWidth) {
      // Altrimenti calcola la larghezza ottimale
      const optimalWidth = calculateOptimalCenterWidth();
      if (optimalWidth) {
        setCenterW(optimalWidth);
      }
    }
  }, [centerAutoWidth, centerMinWidth, centerMaxWidth, centerWidth]);

  const handleLeftDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = leftW;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(minLeftWidth, Math.min(600, startWidth + deltaX));
      setLeftW(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRightDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = rightW;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX;
      const newWidth = Math.max(minRightWidth, Math.min(600, startWidth + deltaX));
      setRightW(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className={`flex h-full bg-gray-50 ${className}`}>
      {/* Left Panel */}
      <div 
        className="flex-shrink-0 border-r border-gray-200 bg-white"
        style={{ width: leftW }}
      >
        {left}
      </div>

      {/* Left Resizer */}
      <div
        className={`w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize flex-shrink-0 ${
          isDragging ? 'bg-blue-400' : ''
        }`}
        onMouseDown={handleLeftDrag}
      />

      {/* Center Panel */}
      <div 
        className={`flex flex-col min-w-0 ${centerAutoWidth ? 'flex-shrink-0' : 'flex-1'}`}
        style={centerAutoWidth && centerW ? { width: centerW } : undefined}
      >
        {center}
      </div>

      {/* Right Panel */}
      {isRightVisible && (
        <>
          {/* Right Resizer */}
          <div
            className={`w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize flex-shrink-0 ${
              isDragging ? 'bg-blue-400' : ''
            }`}
            onMouseDown={handleRightDrag}
          />

          {/* Right Content */}
          <div 
            className="flex-shrink-0 border-l border-gray-200 bg-white"
            style={{ width: rightW }}
          >
            {right}
          </div>
        </>
      )}

      {/* Toggle Right Panel Button */}
      <button
        onClick={() => setIsRightVisible(!isRightVisible)}
        className="absolute top-4 right-4 z-10 p-2 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50"
        title={isRightVisible ? 'Hide preview' : 'Show preview'}
      >
        {isRightVisible ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

