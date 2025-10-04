import React from 'react';
import { HardDrive, Usb, Disc3, AlertCircle } from 'lucide-react';
import { DriveType } from '../types';

interface DriveIconProps {
  type: DriveType;
  mounted: boolean;
  className?: string;
}

export function DriveIcon({ type, mounted, className = '' }: DriveIconProps) {
  const getIcon = () => {
    if (!mounted) {
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }

    switch (type) {
      case 'fixed':
        return <HardDrive className="w-4 h-4 text-blue-600" />;
      case 'removable':
        return <Usb className="w-4 h-4 text-green-600" />;
      case 'optical':
        return <Disc3 className="w-4 h-4 text-purple-600" />;
      default:
        return <HardDrive className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      {getIcon()}
    </div>
  );
}

