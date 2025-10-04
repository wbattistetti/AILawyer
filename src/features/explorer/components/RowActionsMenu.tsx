import React, { useState, useRef, useEffect } from 'react';
import { 
  MapPin, 
  ExternalLink, 
  FolderOpen, 
  Copy, 
  MoreHorizontal 
} from 'lucide-react';
import { FileEntry } from '../types';

interface RowActionsMenuProps {
  file: FileEntry;
  onLocalize: (filePath: string) => void;
  onOpenInSystem: (filePath: string) => void;
  onRevealInFolder: (filePath: string) => void;
  onCopyPath: (filePath: string) => void;
  className?: string;
}

export function RowActionsMenu({
  file,
  onLocalize,
  onOpenInSystem,
  onRevealInFolder,
  onCopyPath,
  className = ''
}: RowActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  const actions = [
    {
      id: 'localize',
      label: 'Localize',
      icon: MapPin,
      onClick: () => handleAction(() => onLocalize(file.path))
    },
    {
      id: 'open',
      label: 'Open with system app',
      icon: ExternalLink,
      onClick: () => handleAction(() => onOpenInSystem(file.path))
    },
    {
      id: 'reveal',
      label: 'Open folder',
      icon: FolderOpen,
      onClick: () => handleAction(() => onRevealInFolder(file.path))
    },
    {
      id: 'copy',
      label: 'Copy path',
      icon: Copy,
      onClick: () => handleAction(() => onCopyPath(file.path))
    }
  ];

  return (
    <div className={`relative ${className}`}>
      {/* Menu Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 hover:bg-gray-200 rounded"
      >
        <MoreHorizontal className="w-4 h-4 text-gray-400" />
      </button>

      {/* Menu Dropdown */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-8 z-50 w-48 bg-white border border-gray-200 rounded-md shadow-lg"
        >
          <div className="py-1">
            {actions.map(({ id, label, icon: Icon, onClick }) => (
              <button
                key={id}
                onClick={onClick}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

