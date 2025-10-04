import React from 'react';
import { render, screen } from '@testing-library/react';
import { Explorer } from '../Explorer';
import { MockFileSystemAdapter } from '../services/adapters/MockFileSystemAdapter';

// Mock react-window per i test
jest.mock('react-window', () => ({
  FixedSizeList: ({ children, itemData }: any) => (
    <div data-testid="virtualized-list">
      {itemData.files.map((file: any, index: number) => 
        children({ index, style: {}, data: itemData })
      )}
    </div>
  )
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronRight: () => <div data-testid="chevron-right" />,
  ChevronDown: () => <div data-testid="chevron-down" />,
  Folder: () => <div data-testid="folder" />,
  FolderOpen: () => <div data-testid="folder-open" />,
  HardDrive: () => <div data-testid="hard-drive" />,
  Usb: () => <div data-testid="usb" />,
  Disc3: () => <div data-testid="disc" />,
  AlertCircle: () => <div data-testid="alert-circle" />,
  FileText: () => <div data-testid="file-text" />,
  Image: () => <div data-testid="image" />,
  Video: () => <div data-testid="video" />,
  Music: () => <div data-testid="music" />,
  File: () => <div data-testid="file" />,
  MoreHorizontal: () => <div data-testid="more-horizontal" />,
  CheckSquare: () => <div data-testid="check-square" />,
  Square: () => <div data-testid="square" />,
  Search: () => <div data-testid="search" />,
  Filter: () => <div data-testid="filter" />,
  Upload: () => <div data-testid="upload" />,
  Pause: () => <div data-testid="pause" />,
  Play: () => <div data-testid="play" />,
  RotateCcw: () => <div data-testid="rotate-ccw" />,
  X: () => <div data-testid="x" />,
  ChevronLeft: () => <div data-testid="chevron-left" />,
  MapPin: () => <div data-testid="map-pin" />,
  ExternalLink: () => <div data-testid="external-link" />,
  FolderOpen: () => <div data-testid="folder-open" />,
  Copy: () => <div data-testid="copy" />,
  ZoomIn: () => <div data-testid="zoom-in" />,
  ZoomOut: () => <div data-testid="zoom-out" />,
  RotateCw: () => <div data-testid="rotate-cw" />,
  Download: () => <div data-testid="download" />,
  Volume2: () => <div data-testid="volume-2" />,
  VolumeX: () => <div data-testid="volume-x" />
}));

describe('Explorer', () => {
  const mockAdapter = new MockFileSystemAdapter();

  beforeEach(() => {
    // Reset any mocks
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<Explorer adapter={mockAdapter} />);
    
    // Should render the main explorer structure
    expect(screen.getByText('Explorer')).toBeInTheDocument();
  });

  it('displays drives in the directory tree', async () => {
    render(<Explorer adapter={mockAdapter} />);
    
    // Should show mock drives
    expect(screen.getByText('Local Disk (C:)')).toBeInTheDocument();
    expect(screen.getByText('USB Drive (D:)')).toBeInTheDocument();
  });

  it('shows toolbar with filters and controls', () => {
    render(<Explorer adapter={mockAdapter} />);
    
    // Should show toolbar elements
    expect(screen.getByPlaceholderText('Search files...')).toBeInTheDocument();
    expect(screen.getByText('Select All')).toBeInTheDocument();
    expect(screen.getByText('Deselect All')).toBeInTheDocument();
  });

  it('displays file type filters', () => {
    render(<Explorer adapter={mockAdapter} />);
    
    // Should show file type filter chips
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('Word')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
  });

  it('shows preview pane when no file is selected', () => {
    render(<Explorer adapter={mockAdapter} />);
    
    // Should show "No Preview" message
    expect(screen.getByText('No Preview')).toBeInTheDocument();
    expect(screen.getByText('Select a file to preview its contents')).toBeInTheDocument();
  });
});

describe('MockFileSystemAdapter', () => {
  const adapter = new MockFileSystemAdapter();

  it('lists mock drives', async () => {
    const drives = await adapter.listDrives();
    
    expect(drives).toHaveLength(2);
    expect(drives[0].label).toBe('Local Disk (C:)');
    expect(drives[1].label).toBe('USB Drive (D:)');
  });

  it('lists directory contents', async () => {
    const result = await adapter.listDir('C:\\');
    
    expect(result.files).toHaveLength(4);
    expect(result.files[0].name).toBe('Users');
    expect(result.files[0].isDir).toBe(true);
  });

  it('detects file existence', async () => {
    const exists = await adapter.exists('C:\\document.pdf');
    expect(exists).toBe(true);
  });
});

