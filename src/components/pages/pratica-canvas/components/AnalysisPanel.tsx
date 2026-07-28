import { useState, useEffect, useRef } from 'react';
import { FileText, Play, Pause, Square, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Documento } from '../../../../types';
import { createDocAdapters } from '../../../../features/entities/adapters/create-doc-adapters';
import { extractPersonsFromDocs } from '../../../../features/entities/extract-orchestrator';
import { detectContacts } from '../../../../features/parsers/contacts';
import { detectVehicles } from '../../../../features/parsers/vehicles';
import { extractEvents as nlpExtractEvents } from '../../../../services/nlp/client';
import { jobSystem } from '../../../../analysis/jobSystem';

interface AnalysisPanelProps {
    documenti: Documento[];
    handleOcr: (doc: Documento) => Promise<void>;
}

export function AnalysisPanel({ documenti, handleOcr }: AnalysisPanelProps) {
    const dbg = (...args: any[]) => {
        try {
            if ((window as any).__ANALYSIS_LOG) console.log('[ANALYSIS]', ...args)
        } catch { }
    };

    // Global capturing logger to guarantee logs on Play clicks
    useEffect(() => {
        const handler = (e: any) => {
            try {
                const el = (e.target as HTMLElement)?.closest?.('[data-ana-action]') as HTMLElement | null;
                if (!el) return;
                const action = el.getAttribute('data-ana-action') || '';
                const key = el.getAttribute('data-ana-key') || '';
                const doc = el.getAttribute('data-ana-doc') || '';
                // eslint-disable-next-line no-console
                console.log('[ANA DEBUG] click', { action, key, doc });
            } catch { }
        };
        document.addEventListener('click', handler, true);
        return () => document.removeEventListener('click', handler, true);
    }, []);

    const [open, setOpen] = useState<Record<string, boolean>>({});
    const tasksTemplate = [
        { id: 'ocr', label: 'OCR', w: 0 },
        { id: 'entities', label: 'Estrazione anagrafiche', w: 0 },
        { id: 'contacts', label: 'Estrazione contatti', w: 0 },
        { id: 'vehicles', label: 'Estrazione veicoli', w: 0 },
        { id: 'events', label: 'Eventi', w: 0 },
    ] as const;

    const weight: Record<string, number> = { ocr: 0.2, entities: 0.4, contacts: 0.1, vehicles: 0.15, events: 0.15 };

    const [, setHoverDoc] = useState<string | null>(null);
    const [, setHoverTask] = useState<string | null>(null);

    type DocState = { pages?: number; page?: number; running: Record<string, boolean>; progress: Record<string, number> };
    const [docState, setDocState] = useState<Record<string, DocState>>({});
    const abortRef = useRef<Map<string, {
        ocr?: AbortController;
        entities?: AbortController;
        contacts?: AbortController;
        vehicles?: AbortController;
        events?: AbortController
    }>>(new Map());

    const ensureAbort = (id: string) => {
        let m = abortRef.current.get(id);
        if (!m) { m = {}; abortRef.current.set(id, m) }
        return m
    };

    const stopTask = (id: string, task: 'ocr' | 'entities' | 'contacts' | 'vehicles' | 'events') => {
        try { ensureAbort(id)[task]?.abort() } catch { }
        setDocState(prev => ({
            ...prev,
            [id]: {
                ...ensureState(id),
                running: { ...ensureState(id).running, [task]: false }
            }
        }))
    };

    const stopAllTasks = (id: string) => {
        const m = ensureAbort(id);
        try { m.ocr?.abort() } catch { };
        try { m.entities?.abort() } catch { };
        try { m.contacts?.abort() } catch { };
        try { m.vehicles?.abort() } catch { };
        try { m.events?.abort() } catch { };
        setDocState(prev => ({
            ...prev,
            [id]: {
                ...ensureState(id),
                running: { ocr: false, entities: false, contacts: false, vehicles: false, events: false }
            }
        }))
    };

    // Perf: throttle progress updates and cache adapters per doc
    const lastUpdateRef = useRef<number>(0);
    const adapterCacheRef = useRef<Map<string, any[]>>(new Map());

    const setProgressThrottled = (docId: string, key: keyof DocState['progress'], page: number, total: number) => {
        const now = performance.now();
        const commit = (now - (lastUpdateRef.current || 0)) > 120 || page >= total;
        if (!commit) return;
        lastUpdateRef.current = now;
        const pct = Math.max(0, Math.min(1, page / Math.max(1, total)));
        setDocState(prev => ({
            ...prev,
            [docId]: {
                ...ensureState(docId),
                pages: total,
                progress: { ...ensureState(docId).progress, [key]: pct },
                running: { ...ensureState(docId).running, [key]: true }
            }
        }));
        dbg('progress', { docId, task: String(key), page, total, pct });
    };

    // JobSystem listener → riflette progress/stato su UI
    useEffect(() => {
        const off = jobSystem.on((j: any) => {
            setDocState(prev => {
                const key = j.type as keyof DocState['progress'];
                const cur = ensureState(j.docId);
                const running = j.status === 'running';
                const done = j.status === 'success';
                return ({
                    ...prev,
                    [j.docId]: {
                        ...cur,
                        running: { ...cur.running, [key]: running },
                        progress: { ...cur.progress, [key]: done ? 1 : Math.max(cur.progress[key], j.progress || 0) },
                    }
                });
            });
        });
        return () => { try { off() } catch { } };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getAdapters = async (doc: Documento) => {
        if (adapterCacheRef.current.has(doc.id)) {
            dbg('adapters:cache-hit', { docId: doc.id });
            return adapterCacheRef.current.get(doc.id) as any[]
        }
        dbg('adapters:build', { docId: doc.id, title: doc.filename });
        const { adapters, skipped, waitingOnOcr } = createDocAdapters([doc]);
        if (waitingOnOcr.length > 0) {
            throw new Error(`OCR in corso per "${doc.filename}". Attendi il completamento e riprova.`)
        }
        if (adapters.length === 0) {
            const detail = skipped[0]?.detail || `Documento non supportato: ${doc.filename}`
            throw new Error(detail)
        }
        adapterCacheRef.current.set(doc.id, adapters);
        return adapters;
    };

    const ensureState = (id: string) => (
        docState[id] || {
            pages: undefined,
            page: 0,
            running: { ocr: false, entities: false, contacts: false, vehicles: false, events: false },
            progress: { ocr: 0, entities: 0, contacts: 0, vehicles: 0, events: 0 }
        }
    );

    const startEntities = async (doc: Documento) => {
        const ds = ensureState(doc.id);
        setDocState(prev => ({
            ...prev,
            [doc.id]: {
                ...ds,
                running: { ...ds.running, entities: true },
                progress: { ...ds.progress, entities: Math.max(ds.progress.entities || 0, 0.0001) }
            }
        }));
        try {
            dbg('entities:start', { docId: doc.id, title: doc.filename });
            const adapters = await getAdapters(doc);
            const ctrl = new AbortController();
            ensureAbort(doc.id).entities = ctrl;
            let totalPages = 0;
            await extractPersonsFromDocs(adapters, (p: any) => {
                // progress callback per pagina
                totalPages = Math.max(totalPages, (ensureState(doc.id).pages || p.page));
                const curr = ensureState(doc.id);
                const pages = curr.pages || totalPages;
                setProgressThrottled(doc.id, 'entities', p.page, pages);
                dbg('entities:progress', { docId: doc.id, page: p.page, pages });
            }, { persist: false, signal: ctrl.signal });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('entities start error', e);
        } finally {
            setDocState(prev => ({
                ...prev,
                [doc.id]: {
                    ...ensureState(doc.id),
                    running: { ...ensureState(doc.id).running, entities: false }
                }
            }));
            dbg('entities:done', { docId: doc.id });
        }
    };

    const startOcr = async (doc: Documento) => {
        const ds = ensureState(doc.id);
        setDocState(prev => ({
            ...prev,
            [doc.id]: {
                ...ds,
                running: { ...ds.running, ocr: true },
                progress: { ...ds.progress, ocr: Math.max(ds.progress.ocr || 0, 0.0001) }
            }
        }));
        dbg('ocr:start', { docId: doc.id, title: doc.filename });
        await handleOcr(doc);
        setDocState(prev => ({
            ...prev,
            [doc.id]: {
                ...ensureState(doc.id),
                running: { ...ensureState(doc.id).running, ocr: false },
                progress: { ...ensureState(doc.id).progress, ocr: 1 }
            }
        }));
        dbg('ocr:done', { docId: doc.id });
    };

    const startParsers = async (doc: Documento, tasks: Array<'contacts' | 'vehicles'>) => {
        try {
            dbg('parsers:start', { docId: doc.id, tasks });
            const ds = ensureState(doc.id);
            setDocState(prev => ({
                ...prev,
                [doc.id]: {
                    ...ds,
                    running: {
                        ...ds.running,
                        contacts: ds.running.contacts || tasks.includes('contacts'),
                        vehicles: ds.running.vehicles || tasks.includes('vehicles')
                    },
                    progress: {
                        ...ds.progress,
                        ...(tasks.includes('contacts') ? { contacts: Math.max(ds.progress.contacts || 0, 0.0001) } : {}),
                        ...(tasks.includes('vehicles') ? { vehicles: Math.max(ds.progress.vehicles || 0, 0.0001) } : {})
                    }
                }
            }));
            const adapters = await getAdapters(doc);
            const cCtrl = tasks.includes('contacts') ? new AbortController() : undefined;
            if (cCtrl) ensureAbort(doc.id).contacts = cCtrl;
            const vCtrl = tasks.includes('vehicles') ? new AbortController() : undefined;
            if (vCtrl) ensureAbort(doc.id).vehicles = vCtrl;
            const ad = adapters[0];
            const meta = await ad.getDocMeta();
            const total = Math.max(1, meta.pages || 1);
            dbg('parsers:meta', { docId: doc.id, pages: total });
            for await (const { page, tokens } of ad.streamPageTokens()) {
                if (tasks.includes('contacts')) {
                    if (cCtrl?.signal.aborted) break;
                    try {
                        const items = detectContacts({ docId: doc.id, title: doc.filename, page, tokens });
                        if (items?.length) {
                            try {
                                window.dispatchEvent(new CustomEvent('app:things', { detail: { docId: doc.id, items } }));
                            } catch { }
                            dbg('contacts:items', { docId: doc.id, page, count: items.length });
                        }
                    } catch { }
                    setProgressThrottled(doc.id, 'contacts', page, total);
                    dbg('contacts:progress', { docId: doc.id, page, total });
                }
                if (tasks.includes('vehicles')) {
                    if (vCtrl?.signal.aborted) break;
                    try {
                        const items = detectVehicles({ docId: doc.id, title: doc.filename, page, tokens });
                        if (items?.length) {
                            try {
                                window.dispatchEvent(new CustomEvent('app:things', { detail: { docId: doc.id, items } }));
                            } catch { }
                            dbg('vehicles:items', { docId: doc.id, page, count: items.length });
                        }
                    } catch { }
                    setProgressThrottled(doc.id, 'vehicles', page, total);
                    dbg('vehicles:progress', { docId: doc.id, page, total });
                }
            }
        } finally {
            const ds = ensureState(doc.id);
            setDocState(prev => ({
                ...prev,
                [doc.id]: {
                    ...ds,
                    running: { ...ds.running, contacts: false, vehicles: false }
                }
            }));
            dbg('parsers:done', { docId: doc.id });
        }
    };

    const startEvents = async (doc: Documento) => {
        try {
            dbg('events:start', { docId: doc.id });
            const ds = ensureState(doc.id);
            setDocState(prev => ({
                ...prev,
                [doc.id]: {
                    ...ds,
                    running: { ...ds.running, events: true },
                    progress: { ...ds.progress, events: Math.max(ds.progress.events || 0, 0.0001) }
                }
            }));
            const adapters = await getAdapters(doc);
            const ctrl = new AbortController();
            ensureAbort(doc.id).events = ctrl;
            const ad = adapters[0];
            const meta = await ad.getDocMeta();
            const total = Math.max(1, meta.pages || 1);
            dbg('events:meta', { docId: doc.id, pages: total });
            for await (const { page, tokens } of ad.streamPageTokens()) {
                // call backend but ignore result here; orchestrator already indexes events
                const text = tokens.map((t: { text: string }) => t.text).join(' ');
                try {
                    await nlpExtractEvents(text, { doc_id: doc.id, page }, { signal: ctrl.signal });
                } catch { }
                setProgressThrottled(doc.id, 'events', page, total);
                dbg('events:progress', { docId: doc.id, page, total });
            }
        } finally {
            setDocState(prev => ({
                ...prev,
                [doc.id]: {
                    ...ensureState(doc.id),
                    running: { ...ensureState(doc.id).running, events: false }
                }
            }));
            dbg('events:done', { docId: doc.id });
        }
    };

    const JOB_SYSTEM_ENABLED = true;
    const enqueueAll = (doc: Documento) => {
        // Concurrency per doc = 1: verranno eseguiti in ordine
        // NON enqueuare OCR automaticamente: l'OCR parte solo dal pulsante sulla miniatura
        jobSystem.enqueue(doc.id, 'entities', async ({ signal }: any) => {
            if (signal.aborted) return;
            await startEntities(doc);
        });
        jobSystem.enqueue(doc.id, 'contacts', async ({ signal }: any) => {
            if (signal.aborted) return;
            await startParsers(doc, ['contacts']);
        });
        jobSystem.enqueue(doc.id, 'vehicles', async ({ signal }: any) => {
            if (signal.aborted) return;
            await startParsers(doc, ['vehicles']);
        });
        jobSystem.enqueue(doc.id, 'events', async ({ signal }: any) => {
            if (signal.aborted) return;
            await startEvents(doc);
        });
    };

    const startAll = (doc: Documento) => {
        dbg('all:start', { docId: doc.id });
        if (JOB_SYSTEM_ENABLED) {
            enqueueAll(doc);
            return;
        }
        // NON avviare OCR in modalità fallback: parte solo su click esplicito
        try { startEntities(doc); } catch { }
        try { startParsers(doc, ['contacts', 'vehicles']); } catch { }
        try { startEvents(doc); } catch { }
    };

    const headerBar = (docId: string, docTitle: string, aggPct: number, isOpen: boolean, onToggle: () => void) => (
        <div
            className="relative overflow-visible"
            onMouseEnter={() => setHoverDoc(docId)}
            onMouseLeave={() => setHoverDoc(prev => (prev === docId ? null : prev))}
        >
            <div className="relative w-full h-8 rounded overflow-hidden flex items-center bg-muted/50">
                <FileText className="w-4 h-4 text-neutral-600 ml-2 mr-2 shrink-0" />
                {/* Idle: solo testo; Running: progress bar */}
                {aggPct > 0 ? (
                    <div className="relative group flex-1 h-5 bg-background rounded border border-border overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-blue-700" style={{ width: `${aggPct}%` }} />
                        <div className="absolute inset-0 flex items-center justify-between pl-2 pr-2 text-xs text-foreground">
                            <span className="truncate pr-2">{docTitle}</span>
                            <span className="flex items-center">
                                {/* inline toolbar just left of % with 3px gap */}
                                <span
                                    className="ana-hover-toolbar flex items-center gap-1 bg-background border border-border rounded px-1 py-0.5 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                                    style={{ marginRight: '3px' }}
                                    onMouseDown={(e) => { e.stopPropagation(); }}
                                    onClick={(e) => { e.stopPropagation(); }}
                                >
                                    <button
                                        type="button"
                                        data-ana-action="play-all"
                                        data-ana-doc={docId}
                                        className="p-0.5 text-neutral-700 hover:text-neutral-900"
                                        disabled={Object.values(ensureState(docId).running).some(Boolean)}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            try { console.log('[ANALYSIS] doc:play-all', { docId }); } catch { }
                                            const d = documenti.find(x => x.id === docId);
                                            if (d) { startAll(d); }
                                        }}
                                    >
                                        <Play className="w-3.5 h-3.5" />
                                    </button>
                                    <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={(e) => e.stopPropagation()}>
                                        <Pause className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        className="p-0.5 text-neutral-700 hover:text-neutral-900"
                                        onClick={(e) => { e.stopPropagation(); stopAllTasks(docId); }}
                                        title="Stop"
                                    >
                                        <Square className="w-3.5 h-3.5" />
                                    </button>
                                </span>
                                {Math.round(aggPct)}%
                                <button
                                    type="button"
                                    className="ml-2 text-neutral-600 hover:text-neutral-900"
                                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                                    aria-label={isOpen ? 'Comprimi' : 'Espandi'}
                                    title={isOpen ? 'Comprimi' : 'Espandi'}
                                >
                                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="relative group flex-1 flex items-center justify-between px-2 text-xs text-foreground">
                        <span className="truncate pr-2">{docTitle}</span>
                        <span className="flex items-center">
                            <span
                                className="ana-hover-toolbar flex items-center gap-1 bg-background border border-border rounded px-1 py-0.5 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                                style={{ marginRight: '3px' }}
                                onMouseDown={(e) => { e.stopPropagation(); }}
                                onClick={(e) => { e.stopPropagation(); }}
                            >
                                <button
                                    type="button"
                                    data-ana-action="play-all"
                                    data-ana-doc={docId}
                                    className="p-0.5 text-neutral-700 hover:text-neutral-900"
                                    disabled={Object.values(ensureState(docId).running).some(Boolean)}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        try { console.log('[ANALYSIS] doc:play-all', { docId }); } catch { }
                                        const d = documenti.find(x => x.id === docId);
                                        if (d) { startAll(d); }
                                    }}
                                >
                                    <Play className="w-3.5 h-3.5" />
                                </button>
                                <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={(e) => e.stopPropagation()}>
                                    <Pause className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    className="p-0.5 text-neutral-700 hover:text-neutral-900"
                                    onClick={(e) => { e.stopPropagation(); stopAllTasks(docId); }}
                                    title="Stop"
                                >
                                    <Square className="w-3.5 h-3.5" />
                                </button>
                            </span>
                            0%
                            <button
                                type="button"
                                className="ml-2 text-neutral-600 hover:text-neutral-900"
                                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                                aria-label={isOpen ? 'Comprimi' : 'Espandi'}
                                title={isOpen ? 'Comprimi' : 'Espandi'}
                            >
                                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                        </span>
                    </div>
                )}
            </div>
            {/* Removed below-bar hover toolbar to avoid showing it when hovering header */}
        </div>
    );

    const taskRow = (taskKey: string, label: string, pct: number) => (
        <div
            className="relative overflow-visible"
            onMouseEnter={() => setHoverTask(taskKey)}
            onMouseLeave={() => setHoverTask(prev => (prev === taskKey ? null : prev))}
        >
            {pct > 0 ? (
                <div className="relative group w-full h-7 bg-background rounded border border-border overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-blue-700" style={{ width: `${pct}%` }} />
                    <div className="absolute inset-0 flex items-center justify-between px-2 text-[12px] text-foreground">
                        <span className="truncate pr-2">{label}</span>
                        <span className="flex items-center">
                            <span
                                className="ana-hover-toolbar flex items-center gap-1 bg-background border border-border rounded px-1 py-0.5 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                                style={{ marginRight: '3px' }}
                                onMouseDown={(e) => { e.stopPropagation(); }}
                                onClick={(e) => { e.stopPropagation(); }}
                            >
                                <button
                                    type="button"
                                    data-ana-action="play"
                                    data-ana-key={taskKey}
                                    data-ana-doc={taskKey.split(':')[0]}
                                    className="p-0.5 text-neutral-700 hover:text-neutral-900"
                                    disabled={ensureState(taskKey.split(':')[0]).running[taskKey.split(':')[1] as keyof DocState['running']]}
                                    onClick={() => {
                                        const [docId, task] = taskKey.split(':');
                                        try { console.log('[ANALYSIS] play:click', { docId, task }); } catch { }
                                        const d = documenti.find(x => x.id === docId);
                                        if (!d) return;
                                        if (task === 'ocr') startOcr(d);
                                        if (task === 'entities') startEntities(d);
                                        if (task === 'contacts') startParsers(d, ['contacts']);
                                        if (task === 'vehicles') startParsers(d, ['vehicles']);
                                        if (task === 'events') startEvents(d);
                                    }}
                                >
                                    <Play className="w-3.5 h-3.5" />
                                </button>
                                <button className="p-0.5 text-neutral-700 hover:text-neutral-900">
                                    <Pause className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    className="p-0.5 text-neutral-700 hover:text-neutral-900"
                                    onClick={() => {
                                        const [docId, task] = taskKey.split(':') as [string, any];
                                        stopTask(docId, task);
                                    }}
                                    title="Stop"
                                >
                                    <Square className="w-3.5 h-3.5" />
                                </button>
                            </span>
                            {Math.round(pct)}%
                        </span>
                    </div>
                </div>
            ) : (
                <div className="relative group w-full h-7 flex items-center justify-between px-2 text-[12px] text-foreground bg-background rounded">
                    <span className="truncate pr-2">{label}</span>
                    <span className="flex items-center">
                        <span
                            className="ana-hover-toolbar flex items-center gap-1 bg-white border border-neutral-300 rounded px-1 py-0.5 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                            style={{ marginRight: '3px' }}
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onClick={(e) => { e.stopPropagation(); }}
                        >
                            <button
                                type="button"
                                data-ana-action="play"
                                data-ana-key={taskKey}
                                data-ana-doc={taskKey.split(':')[0]}
                                className="p-0.5 text-neutral-700 hover:text-neutral-900"
                                disabled={ensureState(taskKey.split(':')[0]).running[taskKey.split(':')[1] as keyof DocState['running']]}
                                onClick={() => {
                                    const [docId, task] = taskKey.split(':');
                                    console.log('[ANALYSIS] play:click', { docId, task });
                                    const d = documenti.find(x => x.id === docId);
                                    if (!d) return;
                                    if (task === 'ocr') startOcr(d);
                                    if (task === 'entities') startEntities(d);
                                    if (task === 'contacts') startParsers(d, ['contacts']);
                                    if (task === 'vehicles') startParsers(d, ['vehicles']);
                                    if (task === 'events') startEvents(d);
                                }}
                            >
                                <Play className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-0.5 text-neutral-700 hover:text-neutral-900">
                                <Pause className="w-3.5 h-3.5" />
                            </button>
                            <button
                                className="p-0.5 text-neutral-700 hover:text-neutral-900"
                                onClick={() => {
                                    const [docId, task] = taskKey.split(':') as [string, any];
                                    stopTask(docId, task);
                                }}
                                title="Stop"
                            >
                                <Square className="w-3.5 h-3.5" />
                            </button>
                        </span>
                        0%
                    </span>
                </div>
            )}
        </div>
    );

    const SmallToolbar = ({ onPlay, onPause, onStop }: { onPlay?: () => void; onPause?: () => void; onStop?: () => void }) => (
        <span className="inline-flex items-center gap-1 bg-background/90 border border-border rounded px-1 py-0.5">
            <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={onPlay}>
                <Play className="w-3.5 h-3.5" />
            </button>
            <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={onPause}>
                <Pause className="w-3.5 h-3.5" />
            </button>
            <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={onStop}>
                <Square className="w-3.5 h-3.5" />
            </button>
        </span>
    );

    const startAllDocs = () => {
        dbg('global:play-all');
        for (const d of documenti) startAll(d);
    };

    const globalAggPct = (() => {
        const perDoc = documenti.map(d => {
            const ds = ensureState(d.id);
            const tasks = tasksTemplate.map(t => ({ ...t, w: ds.progress[t.id as keyof typeof ds.progress] || 0 }));
            return tasks.reduce((s, t) => s + (t.w * (weight[t.id] || 0)), 0);
        });
        const avg = perDoc.length ? (perDoc.reduce((a, b) => a + b, 0) / perDoc.length) : 0;
        return Math.round(avg * 100);
    })();

    return (
        <div className="flex flex-col h-full">
            <div className="px-2 py-2 border-b bg-background sticky top-0 z-10">
                <div className="relative w-full h-6 bg-background rounded border border-border overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-blue-700" style={{ width: `${globalAggPct}%` }} />
                    <div className="absolute inset-0 flex items-center justify-between px-2 text-xs text-foreground">
                        <span className="truncate pr-2">Analisi documenti</span>
                        <span className="flex items-center">
                            <SmallToolbar onPlay={startAllDocs} />
                            <span className="ml-1">{globalAggPct}%</span>
                        </span>
                    </div>
                    <button
                        className="absolute top-1/2 -translate-y-1/2 right-2 text-neutral-700 hover:text-neutral-900"
                        onClick={() => { }}
                        title="Chiudi"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-3">
                {documenti.map(doc => {
                    const ds = ensureState(doc.id);
                    const tasks = tasksTemplate.map(t => ({ ...t, w: ds.progress[t.id as keyof typeof ds.progress] || 0 }));
                    const agg = tasks.reduce((s, t) => s + (t.w * (weight[t.id] || 0)), 0) * 100;
                    const isOpen = open[doc.id] ?? true;
                    return (
                        <div key={doc.id} className="rounded overflow-visible bg-muted/30">
                            <div className="px-3 py-2 rounded-t bg-muted/50">
                                {headerBar(doc.id, doc.filename, agg, isOpen, () => setOpen(prev => ({ ...prev, [doc.id]: !isOpen })))}
                            </div>
                            {isOpen && (
                                <div className="pb-3 pr-3 pl-6 space-y-2 overflow-visible rounded-b">
                                    {tasks.map((t: { id: string; label: string; w: number }) => (
                                        <div key={t.id}>{taskRow(`${doc.id}:${t.id}`, t.label, (t.w || 0) * 100)}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}