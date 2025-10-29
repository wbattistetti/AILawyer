export interface ExtractClipboardData {
    content: string
    source: string
    page: number
    bbox: {
        x0Pct: number
        y0Pct: number
        x1Pct: number
        y1Pct: number
    }
}

// Clipboard globale per estratti
let extractClipboard: ExtractClipboardData | null = null

// Listener per cambiamenti nella clipboard
type ClipboardListener = (data: ExtractClipboardData | null) => void
const listeners = new Set<ClipboardListener>()

export const extractClipboardManager = {
    /**
     * Copia un estratto nella clipboard
     */
    copy: (data: ExtractClipboardData) => {
        extractClipboard = data
        listeners.forEach(listener => listener(data))
        console.log('[CLIPBOARD] Estratto copiato:', data)
    },

    /**
     * Incolla l'estratto dalla clipboard
     */
    paste: (): ExtractClipboardData | null => {
        return extractClipboard
    },

    /**
     * Verifica se c'è un estratto nella clipboard
     */
    hasExtract: (): boolean => {
        return extractClipboard !== null
    },

    /**
     * Pulisce la clipboard
     */
    clear: () => {
        extractClipboard = null
        listeners.forEach(listener => listener(null))
        console.log('[CLIPBOARD] Clipboard pulita')
    },

    /**
     * Sottoscrivi ai cambiamenti della clipboard
     */
    subscribe: (listener: ClipboardListener) => {
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    },

    /**
     * Ottieni l'estratto corrente senza subscribe
     */
    getCurrent: (): ExtractClipboardData | null => {
        return extractClipboard
    }
}

