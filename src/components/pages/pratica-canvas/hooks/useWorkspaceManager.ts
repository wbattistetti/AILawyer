import { useState, useEffect, useRef } from 'react';
import { DockWorkspaceV3Handle } from '../../../DockWorkspaceV3';
import { shouldRestoreLastWorkspace } from '../../../../utils/lastWorkspaceSession';

/**
 * Gestisce viewMode e ref dock.
 * Ripristina viewMode solo se la pratica è l'ultima sessione lasciata aperta.
 */
export function useWorkspaceManager(id: string | undefined) {
    const [viewMode, setViewMode] = useState<'archivio' | 'tavolo'>('archivio');
    const dockV2Ref = useRef<DockWorkspaceV3Handle | null>(null);

    useEffect(() => {
        if (!id) return;

        if (!shouldRestoreLastWorkspace(id)) {
            setViewMode('archivio');
            return;
        }

        try {
            const raw = localStorage.getItem(`ws_${id}`);
            if (raw) {
                const ws = JSON.parse(raw);
                if (ws.viewMode === 'tavolo' || ws.viewMode === 'archivio') {
                    setViewMode(ws.viewMode);
                    return;
                }
            }
        } catch {
            // ignore parse errors
        }
        setViewMode('archivio');
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
