import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, HardDrive } from 'lucide-react';
import { DriveInfo, TreeNode } from '../types';
import { FileSystemAdapter } from '../services/FileSystemAdapter';
import { DriveIcon } from './DriveIcon';

interface DirectoryTreeProps {
  drives: DriveInfo[];
  adapter: FileSystemAdapter;
  onSelect: (node: { type: 'drive' | 'dir'; path: string }) => void;
  selectedPath?: string;
  highlightPath?: string;
  className?: string;
}

export function DirectoryTree({
  drives,
  adapter,
  onSelect,
  selectedPath,
  highlightPath,
  className = ''
}: DirectoryTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);

  // Initialize tree with drives
  useEffect(() => {
    const driveNodes: TreeNode[] = drives.map(drive => ({
      id: drive.id,
      name: drive.label,
      path: drive.path,
      type: 'drive' as const,
      expanded: false,
      children: []
    }));
    setTree(driveNodes);
  }, [drives]);

  // Handle highlight effect
  useEffect(() => {
    if (highlightPath) {
      setHighlightedPath(highlightPath);
      // Clear highlight after 3 seconds
      const timer = setTimeout(() => {
        setHighlightedPath(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightPath]);

  const loadChildren = useCallback(async (node: TreeNode) => {
    console.log('🌳 Loading children for node:', node);
    if (node.children && node.children.length > 0) {
      console.log('🌳 Children already loaded');
      return; // Already loaded
    }

    try {
      console.log('🌳 Calling adapter.listDir for:', node.path);
      const { files } = await adapter.listDir(node.path);
      console.log('🌳 Got files from adapter:', files);
      
      const dirs = files
        .filter(file => file.isDir)
        .map(file => ({
          id: file.path,
          name: file.name,
          path: file.path,
          type: 'dir' as const,
          expanded: false,
          children: []
        }));

      console.log('🌳 Created directory nodes:', dirs);
      setTree(prev => updateNodeChildren(prev, node.id, dirs));
    } catch (error) {
      console.error(`Failed to load directory ${node.path}:`, error);
    }
  }, [adapter]);

  const toggleExpanded = useCallback(async (node: TreeNode) => {
    console.log('🌳 Toggle expanded for node:', node, 'currently expanded:', node.expanded);
    if (!node.expanded) {
      await loadChildren(node);
    }

    setTree(prev => updateNodeExpanded(prev, node.id, !node.expanded));
  }, [loadChildren]);

  const handleNodeClick = useCallback((node: TreeNode) => {
    console.log('🌳 Node clicked:', node);
    if (node.type === 'dir' || node.type === 'drive') {
      console.log('🌳 Node is directory/drive, toggling expansion');
      toggleExpanded(node);
    }
    onSelect(node);
  }, [toggleExpanded, onSelect]);

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isSelected = selectedPath === node.path;
    const isHighlighted = highlightedPath === node.path;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={`
            flex items-center py-2 px-3 cursor-pointer hover:bg-gray-100 rounded-md
            ${isSelected ? 'bg-blue-100 text-blue-900 border-l-2 border-blue-500' : ''}
            ${isHighlighted ? 'bg-yellow-100 border-l-2 border-yellow-400' : ''}
          `}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => handleNodeClick(node)}
        >
          {/* Expand/Collapse Icon */}
          {(node.type === 'dir' || node.type === 'drive') && (
            <div className="w-4 h-4 flex items-center justify-center mr-1">
              {node.expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </div>
          )}

          {/* Node Icon */}
          <div className="w-4 h-4 flex items-center justify-center mr-2">
            {node.type === 'drive' ? (
              <DriveIcon 
                type={drives.find(d => d.id === node.id)?.type || 'fixed'}
                mounted={drives.find(d => d.id === node.id)?.mounted || false}
              />
            ) : node.expanded ? (
              <FolderOpen className="w-4 h-4 text-yellow-500" />
            ) : (
              <Folder className="w-4 h-4 text-yellow-500" />
            )}
          </div>

          {/* Node Name */}
          <span className="text-sm truncate flex-1">
            {node.name}
          </span>
        </div>

        {/* Children */}
        {node.expanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`h-full overflow-y-auto ${className}`}>
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-700 mb-3 border-b pb-2">Directory Tree</h3>
        <div className="space-y-1">
          {tree.length === 0 ? (
            <div className="text-sm text-gray-500 p-2">
              <div className="mb-2">🔧 Backend non disponibile</div>
              <div className="text-xs text-gray-400">
                Assicurati che il backend sia in esecuzione:<br/>
                <code className="bg-gray-100 px-1 rounded">npm run dev:backend</code>
              </div>
            </div>
          ) : (
            tree.map(node => renderNode(node))
          )}
        </div>
      </div>
    </div>
  );
}

// Helper functions
function updateNodeExpanded(
  nodes: TreeNode[],
  nodeId: string,
  expanded: boolean
): TreeNode[] {
  return nodes.map(node => {
    if (node.id === nodeId) {
      return { ...node, expanded };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeExpanded(node.children, nodeId, expanded)
      };
    }
    return node;
  });
}

function updateNodeChildren(
  nodes: TreeNode[],
  nodeId: string,
  children: TreeNode[]
): TreeNode[] {
  return nodes.map(node => {
    if (node.id === nodeId) {
      return { ...node, children };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeChildren(node.children, nodeId, children)
      };
    }
    return node;
  });
}

