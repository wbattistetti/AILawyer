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
        // Icona hard disk blu come in Windows Explorer
        return <HardDrive className="w-4 h-4 text-blue-500" />;
      case 'removable':
        // Icona USB verde come in Windows Explorer
        return <Usb className="w-4 h-4 text-green-500" />;
      case 'optical':
        // Icona CD/DVD viola come in Windows Explorer
        return <Disc3 className="w-4 h-4 text-purple-500" />;
      default:
        return <HardDrive className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      {getIcon()}
    </div>
  );
}

