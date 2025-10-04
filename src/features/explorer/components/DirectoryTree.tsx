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
    if (node.children && node.children.length > 0) {
      return; // Already loaded
    }

    try {
      const { files } = await adapter.listDir(node.path);
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

      setTree(prev => updateNodeChildren(prev, node.id, dirs));
    } catch (error) {
      console.error(`Failed to load directory ${node.path}:`, error);
    }
  }, [adapter]);

  const toggleExpanded = useCallback(async (node: TreeNode) => {
    if (!node.expanded) {
      await loadChildren(node);
    }

    setTree(prev => updateNodeExpanded(prev, node.id, !node.expanded));
  }, [loadChildren]);

  const handleNodeClick = useCallback((node: TreeNode) => {
    if (node.type === 'dir') {
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
            flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100
            ${isSelected ? 'bg-blue-100 text-blue-900' : ''}
            ${isHighlighted ? 'bg-yellow-100 border-l-2 border-yellow-400' : ''}
          `}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleNodeClick(node)}
        >
          {/* Expand/Collapse Icon */}
          {node.type === 'dir' && (
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
              <FolderOpen className="w-4 h-4 text-blue-600" />
            ) : (
              <Folder className="w-4 h-4 text-blue-600" />
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
      <div className="p-2">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Explorer</h3>
        <div className="space-y-1">
          {tree.map(node => renderNode(node))}
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

