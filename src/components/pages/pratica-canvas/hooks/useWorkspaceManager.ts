import { useState, useEffect, useRef } from 'react';
import { DockWorkspaceV2Handle } from '../../../DockWorkspaceV2';

export function useWorkspaceManager(id: string | undefined) {
    const [viewMode, setViewMode] = useState<'archivio' | 'tavolo'>('archivio');
    const dockV2Ref = useRef<DockWorkspaceV2Handle | null>(null);

    // Restore viewMode from localStorage
    useEffect(() => {
        if (!id) return;

        try {
            const raw = localStorage.getItem(`ws_${id}`);
            if (raw) {
                const ws = JSON.parse(raw);
                if (ws.viewMode === 'tavolo' || ws.viewMode === 'archivio') {
                    setViewMode(ws.viewMode);
                }
            }
        } catch { }
    }, [id]);

    const persistViewMode = (mode: 'archivio' | 'tavolo') => {
        if (!id) return;
        try {
            localStorage.setItem(`ws_${id}`, JSON.stringify({ viewMode: mode }));
        } catch { }
    };

    return {
        viewMode,
        setViewMode,
        dockV2Ref,
        persistViewMode
    };
}
