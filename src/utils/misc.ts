export function cryptoRandom(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function formatDocTitle(url?: string): string {
    try {
        if (!url) return 'Documento'
        const raw = decodeURIComponent(url.split('/').pop() || 'Documento')
        const lastDash = raw.lastIndexOf('-')
        let candidate = raw
        if (lastDash > 0) {
            const prefix = raw.slice(0, lastDash)
            if (/^[0-9A-Fa-f-]{20,}$/.test(prefix)) {
                candidate = raw.slice(lastDash + 1)
            }
        }
        const cleaned = candidate
        return cleaned.replace(/\s+/g, ' ').trim()
    } catch {
        return 'Documento'
    }
}


