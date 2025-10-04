import { TreeNode } from '../types';

export class LocalizeService {
  /**
   * Finds the path to a directory in the tree and returns the path to expand
   */
  static findDirectoryPath(
    tree: TreeNode[],
    targetPath: string
  ): string[] {
    const pathSegments = this.normalizePath(targetPath).split(/[/\\]/);
    const result: string[] = [];
    
    this.findPathRecursive(tree, pathSegments, 0, result);
    return result;
  }

  private static findPathRecursive(
    nodes: TreeNode[],
    pathSegments: string[],
    segmentIndex: number,
    result: string[]
  ): boolean {
    if (segmentIndex >= pathSegments.length) {
      return true;
    }

    const currentSegment = pathSegments[segmentIndex];
    
    for (const node of nodes) {
      if (node.name === currentSegment) {
        result.push(node.path);
        
        if (segmentIndex === pathSegments.length - 1) {
          return true; // Found the target
        }
        
        // Continue searching in children
        if (node.children && this.findPathRecursive(
          node.children,
          pathSegments,
          segmentIndex + 1,
          result
        )) {
          return true;
        }
        
        result.pop(); // Backtrack
      }
    }
    
    return false;
  }

  /**
   * Expands all nodes in the given path
   */
  static expandPath(
    tree: TreeNode[],
    pathToExpand: string[]
  ): TreeNode[] {
    return this.expandPathRecursive(tree, pathToExpand, 0);
  }

  private static expandPathRecursive(
    nodes: TreeNode[],
    pathToExpand: string[],
    pathIndex: number
  ): TreeNode[] {
    if (pathIndex >= pathToExpand.length) {
      return nodes;
    }

    const targetPath = pathToExpand[pathIndex];
    
    return nodes.map(node => {
      if (node.path === targetPath) {
        return {
          ...node,
          expanded: true,
          children: node.children ? 
            this.expandPathRecursive(node.children, pathToExpand, pathIndex + 1) :
            undefined
        };
      }
      return node;
    });
  }

  /**
   * Normalizes a path for consistent comparison
   */
  private static normalizePath(path: string): string {
    return path
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');
  }

  /**
   * Gets the directory path from a file path
   */
  static getDirectoryPath(filePath: string): string {
    const normalized = this.normalizePath(filePath);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash > 0 ? normalized.substring(0, lastSlash) : '/';
  }

  /**
   * Gets the parent directory name from a file path
   */
  static getParentDirectoryName(filePath: string): string {
    const dirPath = this.getDirectoryPath(filePath);
    const lastSlash = dirPath.lastIndexOf('/');
    return lastSlash > 0 ? dirPath.substring(lastSlash + 1) : dirPath;
  }
}

