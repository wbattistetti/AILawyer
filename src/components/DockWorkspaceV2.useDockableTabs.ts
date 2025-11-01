import { useState, useCallback } from 'react'

interface Cliente {
    id: string
    nome: string
    cognome: string
}

/**
 * Hook centralizzato per gestire lo stato delle tab dockable nella sidebar.
 * Mantiene traccia di quali tab sono docked nel canvas principale e gestisce
 * la visibilità nella sidebar.
 */
export function useDockableTabs(clienti: Cliente[] = []) {
    const [dockedTabs, setDockedTabs] = useState<Set<string>>(new Set())
    const [version, setVersion] = useState(0) // ✅ Contatore per tracciare cambiamenti

    /**
     * Genera una chiave univoca per identificare una tab docked.
     * Per le tab cliente, include l'ID del cliente nella chiave.
     */
    const getDockedKey = useCallback((component: string, id?: string): string => {
        if (component === 'cliente-memoria' && id) {
            return `cliente-memoria-${id}`
        }
        return component
    }, [])

    /**
     * Estrae l'ID del cliente da un tabId della sidebar.
     * Formato atteso: "cliente-{id}-tab"
     */
    const extractClienteIdFromSidebarTab = useCallback((tabId: string): string | null => {
        const match = tabId.match(/^cliente-([^-]+)-tab$/)
        return match ? match[1] : null
    }, [])

    /**
     * Estrae l'ID del cliente da un tabId docked.
     * Formato atteso: "cliente-{id}-docked-{timestamp}"
     */
    const extractClienteIdFromDockedTab = useCallback((tabId: string): string | null => {
        // ✅ Pattern principale: "cliente-{id}-docked-{timestamp}"
        const mainMatch = tabId.match(/^cliente-([^-]+)-docked-/)
        if (mainMatch) return mainMatch[1]

        // ✅ Fallback 1: Pattern "cliente-{id}-docked" (senza timestamp)
        const fallback1 = tabId.match(/^cliente-([^-]+)-docked$/)
        if (fallback1) return fallback1[1]

        // ✅ Fallback 2: Pattern generico "cliente-{id}-..." (qualsiasi suffisso)
        const fallback2 = tabId.match(/^cliente-([^-]+)/)
        return fallback2 ? fallback2[1] : null
    }, [])

    /**
     * Segna una tab come docked.
     */
    const markDocked = useCallback((component: string, id?: string): string => {
        const key = getDockedKey(component, id)
        let changed = false
        setDockedTabs(prev => {
            const next = new Set(prev)
            if (!next.has(key)) {
                next.add(key)
                changed = true
                return next
            }
            return prev
        })
        if (changed) {
            setVersion(v => v + 1)
        }
        return key
    }, [getDockedKey])

    /**
     * Segna una tab come non docked (torna alla sidebar).
     */
    const markUndocked = useCallback((component: string, id?: string): string => {
        const key = getDockedKey(component, id)
        let changed = false
        setDockedTabs(prev => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
                changed = true
                return next
            }
            return prev
        })
        if (changed) {
            setVersion(v => v + 1)
        }
        return key
    }, [getDockedKey])

    /**
     * Verifica se una tab è attualmente docked.
     */
    const isDocked = useCallback((component: string, id?: string): boolean => {
        const key = getDockedKey(component, id)
        return dockedTabs.has(key)
    }, [dockedTabs, getDockedKey])

    /**
     * Filtra le tab della sidebar rimuovendo quelle docked.
     */
    const filterSidebarTabs = useCallback((tabs: any[]): any[] => {
        return tabs.filter(tab => {
            if (tab.component === 'cliente-memoria') {
                const clienteId = extractClienteIdFromSidebarTab(tab.id || '')
                return !isDocked('cliente-memoria', clienteId || undefined)
            }
            return !isDocked(tab.component)
        })
    }, [isDocked, extractClienteIdFromSidebarTab])

    /**
     * Aggiunge le tab mancanti alla sidebar (quelle che non sono docked).
     */
    const addMissingSidebarTabs = useCallback((currentTabs: any[]): any[] => {
        const result = [...currentTabs]

        // Tab statiche standard
        const staticTabs = [
            { component: 'archive', id: 'archiveTab', name: 'Archivio' },
            { component: 'search', id: 'searchTab', name: 'Search' },
            { component: 'persons', id: 'personsTab', name: 'Anagrafiche' },
            { component: 'events', id: 'eventsTab', name: 'Eventi' },
        ]

        staticTabs.forEach(staticTab => {
            const exists = result.some(t => t.id === staticTab.id)
            if (!exists && !isDocked(staticTab.component)) {
                result.push({
                    type: 'tab',
                    name: staticTab.name,
                    component: staticTab.component,
                    id: staticTab.id
                })
            }
        })

        // Tab cliente dinamiche
        clienti.forEach(cliente => {
            const clienteTabId = `cliente-${cliente.id}-tab`
            const exists = result.some(t => t.id === clienteTabId)
            if (!exists && !isDocked('cliente-memoria', cliente.id)) {
                result.push({
                    type: 'tab',
                    name: `${cliente.nome} ${cliente.cognome}`,
                    component: 'cliente-memoria',
                    id: clienteTabId
                })
            }
        })

        return result
    }, [clienti, isDocked])

    return {
        dockedTabs,
        version, // ✅ Esporta version per tracciare cambiamenti
        markDocked,
        markUndocked,
        isDocked,
        filterSidebarTabs,
        addMissingSidebarTabs,
        getDockedKey,
        extractClienteIdFromSidebarTab,
        extractClienteIdFromDockedTab
    }
}

