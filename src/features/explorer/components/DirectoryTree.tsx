import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  // ✅ Nuovo: path espansi iniziali e callback per notificare cambiamenti
  initialExpandedPaths?: string[];
  onExpandedPathsChange?: (expandedPaths: string[]) => void;
}

export function DirectoryTree({
  drives,
  adapter,
  onSelect,
  selectedPath,
  highlightPath,
  className = '',
  initialExpandedPaths = [],
  onExpandedPathsChange
}: DirectoryTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const restoredExpansionRef = useRef<string>(''); // ✅ Traccia l'ultimo restore fatto
  const isRestoringRef = useRef<boolean>(false); // ✅ Flag per evitare loop durante restore

  // ✅ Helper per ottenere tutti i path espansi dall'albero
  const getExpandedPaths = useCallback((nodes: TreeNode[]): string[] => {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.expanded) {
        paths.push(node.path);
        if (node.children) {
          paths.push(...getExpandedPaths(node.children));
        }
      } else if (node.children) {
        paths.push(...getExpandedPaths(node.children));
      }
    }
    return paths;
  }, []);

  // ✅ Notifica cambiamenti nello stato di espansione
  useEffect(() => {
    if (onExpandedPathsChange && tree.length > 0) {
      const expandedPaths = getExpandedPaths(tree);
      onExpandedPathsChange(expandedPaths);
    }
  }, [tree, onExpandedPathsChange, getExpandedPaths]);

  // ✅ Helper per espandere un path ricorsivamente e caricare i suoi children
  const expandPathRecursive = useCallback(async (
    nodes: TreeNode[],
    pathToExpand: string
  ): Promise<TreeNode[]> => {
    const results = await Promise.all(nodes.map(async (node) => {
      // Se questo nodo è un parent del path da espandere
      if (pathToExpand.startsWith(node.path + '\\') || pathToExpand === node.path) {
        // Carica children se non già caricati
        let children = node.children || [];
        if (children.length === 0 && !node.path.endsWith('\\')) {
          try {
            const { files } = await adapter.listDir(node.path);
            children = files
              .filter(file => file.isDir)
              .map(file => ({
                id: file.path,
                name: file.name,
                path: file.path,
                type: 'dir' as const,
                expanded: false,
                children: [],
                driveInfo: undefined
              }));
          } catch (error) {
            console.error(`Failed to load directory ${node.path}:`, error);
          }
        }

        // Espandi questo nodo e continua ricorsivamente
        const updatedChildren = await expandPathRecursive(children, pathToExpand);
        return { ...node, expanded: true, children: updatedChildren };
      }

      // Continua ricorsivamente nei children
      if (node.children) {
        return { ...node, children: await expandPathRecursive(node.children, pathToExpand) };
      }

      return node;
    }));

    return results;
  }, [adapter]);

  // Initialize tree with drives
  useEffect(() => {
    const driveNodes: TreeNode[] = drives.map(drive => {
      // ✅ Debug: log per verificare il tipo di drive
      // ✅ Log rimosso per ridurre spam console
      return {
        id: drive.id,
        // ✅ Mostra lettera del drive e nome del volume (se diverso dalla lettera)
        name: drive.label !== drive.id ? `${drive.id} ${drive.label}` : drive.id,
        path: drive.path,
        type: 'drive' as const,
        expanded: false,
        children: [],
        // ✅ Salva anche il driveInfo per accesso rapido
        driveInfo: drive
      };
    });
    setTree(driveNodes);
  }, [drives]);

  // ✅ Ripristina lo stato di espansione iniziale quando cambiano initialExpandedPaths o drives
  useEffect(() => {
    // ✅ Evita loop: non ripristinare se siamo già in fase di restore
    if (isRestoringRef.current) {
      return;
    }

    if (initialExpandedPaths.length > 0 && tree.length > 0) {
      // ✅ Crea un hash univoco per questa combinazione di paths e drives
      const expansionKey = `${initialExpandedPaths.join('|')}-${drives.length}`;

      // ✅ Evita loop infinito: ripristina solo se non l'abbiamo già fatto per questa combinazione
      if (restoredExpansionRef.current === expansionKey) {
        return; // ✅ Già ripristinato, evita loop
      }

      // Espandi tutti i path salvati ricorsivamente
      const restoreExpansion = async () => {
        isRestoringRef.current = true; // ✅ Marca come in restore
        try {
          let updatedTree = [...tree];
          for (const path of initialExpandedPaths) {
            updatedTree = await expandPathRecursive(updatedTree, path);
          }

          // ✅ Marca come ripristinato PRIMA di chiamare setTree
          restoredExpansionRef.current = expansionKey;
          setTree(updatedTree);
        } finally {
          // ✅ Reset flag dopo un breve delay per permettere al setState di completare
          setTimeout(() => {
            isRestoringRef.current = false;
          }, 100);
        }
      };
      restoreExpansion();
    }
  }, [initialExpandedPaths, drives.length, expandPathRecursive]); // ✅ Rimosso tree.length per evitare loop

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
          children: [],
          driveInfo: undefined // ✅ Le directory non hanno driveInfo
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
            flex items-center py-2 px-3 cursor-pointer hover:bg-accent rounded-md
            ${isSelected ? 'bg-primary/20 text-primary border-l-2 border-primary' : ''}
            ${isHighlighted ? 'bg-yellow-500/20 border-l-2 border-yellow-500' : ''}
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
              (() => {
                const driveType = node.driveInfo?.type || drives.find(d => d.id === node.id)?.type || 'fixed';
                return (
                  <DriveIcon
                    type={driveType}
                    mounted={node.driveInfo?.mounted || drives.find(d => d.id === node.id)?.mounted || false}
                  />
                );
              })()
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

