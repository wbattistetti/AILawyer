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
}

export function SplitLayout({
  left,
  center,
  right,
  leftWidth = 300,
  rightWidth = 400,
  minLeftWidth = 200,
  minRightWidth = 300,
  className = ''
}: SplitLayoutProps) {
  const [leftW, setLeftW] = useState(leftWidth);
  const [rightW, setRightW] = useState(rightWidth);
  const [isRightVisible, setIsRightVisible] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

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
      <div className="flex-1 flex flex-col min-w-0">
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

