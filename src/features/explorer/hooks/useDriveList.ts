import { useState, useEffect, useCallback } from 'react';
import { DriveInfo } from '../types';
import { FileSystemAdapter } from '../services/FileSystemAdapter';

export function useDriveList(adapter: FileSystemAdapter) {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const driveList = await adapter.listDrives();
      setDrives(driveList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drives');
      console.error('Failed to load drives:', err);
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Set up drive watching if supported
  useEffect(() => {
    if (!adapter.watchDrives) return;

    const unsubscribe = adapter.watchDrives((updatedDrives) => {
      setDrives(updatedDrives);
    });

    return unsubscribe;
  }, [adapter]);

  return {
    drives,
    loading,
    error,
    refresh
  };
}

