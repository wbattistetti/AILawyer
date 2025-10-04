import React from 'react';
import { render, screen } from '@testing-library/react';
import { DockWorkspaceV2 } from '../../components/DockWorkspaceV2';
import { Explorer, useExplorer } from '../index';

// Mock react-window
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

// Mock flexlayout-react
jest.mock('flexlayout-react', () => ({
  Layout: ({ factory }: any) => (
    <div data-testid="flexlayout">
      {factory({ getComponent: () => 'explorer' })}
    </div>
  ),
  Model: {
    fromJson: () => ({
      toJson: () => ({}),
      visitNodes: () => {},
      doAction: () => {},
      getRoot: () => ({ getId: () => 'root' })
    })
  },
  Actions: {
    addNode: () => ({}),
    selectTab: () => ({})
  }
}));

// Mock CaseOverviewDiagram
jest.mock('../../features/case-overview/components/CaseOverviewDiagram', () => ({
  CaseOverviewDiagram: () => <div data-testid="case-overview">Case Overview</div>
}));

// Mock DrawerViewer
jest.mock('../../features/drawers/DrawerViewer', () => ({
  DrawerViewer: () => <div data-testid="drawer-viewer">Drawer Viewer</div>
}));

describe('Explorer Integration', () => {
  it('renders Explorer in DockWorkspaceV2', () => {
    const { ExplorerProps } = useExplorer();
    
    render(
      <DockWorkspaceV2
        docs={[]}
        renderArchive={() => <div>Archive</div>}
        renderExplorer={() => <Explorer {...ExplorerProps} />}
        renderDoc={() => <div>Doc</div>}
      />
    );
    
    // Should render the Explorer component
    expect(screen.getByText('Explorer')).toBeInTheDocument();
  });

  it('shows Explorer tab in the left border', () => {
    const { ExplorerProps } = useExplorer();
    
    render(
      <DockWorkspaceV2
        docs={[]}
        renderArchive={() => <div>Archive</div>}
        renderExplorer={() => <Explorer {...ExplorerProps} />}
        renderDoc={() => <div>Doc</div>}
      />
    );
    
    // Should show Explorer tab
    expect(screen.getByText('Explorer')).toBeInTheDocument();
  });

  it('renders Explorer with mock adapter', () => {
    const { ExplorerProps } = useExplorer();
    
    render(<Explorer {...ExplorerProps} />);
    
    // Should render the Explorer with mock drives
    expect(screen.getByText('Local Disk (C:)')).toBeInTheDocument();
    expect(screen.getByText('USB Drive (D:)')).toBeInTheDocument();
  });
});

