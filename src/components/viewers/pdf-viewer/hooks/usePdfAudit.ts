import { useState, useEffect } from 'react'

// Simple token classifier for demo; replace with pseudonymizer
function classifyToken(str: string): 'safe' | 'pseudo' | 'suspect' {
	const raw = (str || '').trim()
	if (!raw) return 'safe'
	// Pseudonym tokens (already replaced): TL[...] or PREFIX_xxxx
	if (/^TL\[[A-Z]+\]:\s*[A-Z_0-9-]+$/.test(raw) || /^[A-Z]{2,}_[0-9a-f]{4,}$/i.test(raw)) return 'pseudo'
	// Pure punctuation or numbers
	if (/^[\p{P}\p{S}]+$/u.test(raw)) return 'safe'
	if (/^\d+[\d\s\.\-\/]*$/.test(raw)) return 'safe'
	// Normalize accents/case
	const norm = raw
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
	// Short tokens are rarely informative PII
	if (norm.length <= 2) return 'safe'
	// Italian stopwords + connectors (expanded)
	const STOP = new Set<string>([
		'il','lo','la','l','i','gli','le',
		'un','una','uno',
		'di','del','dello','della','dei','degli','delle',"dell'",
		'a','al','allo','alla','ai','agli','alle',"all'",
		'da','dal','dallo','dalla','dai','dagli','dalle',"dall'",
		'in','nel','nello','nella','nei','negli','nelle',"nell'",
		'con','col','coi',
		'su','sul','sullo','sulla','sui','sugli','sulle',"sull'",
		'per','tra','fra','e','ed','o','oppure',
		'che','non','come','anche','sono','era','furono',
		'presso'
	])
	if (STOP.has(norm)) return 'safe'
	// Common legal/admin nouns to be greyed (not PII)
	const LEGAL = new Set<string>([
		'cortese','attenzione','dottor','dottore','dottoressa','avvocato','avv','procura','procuratore','aggiunto','sostituto','repubblica','direzione','distrettuale','antimafia','ufficio','sezione','sez','proc','procedimento','penale','numero','n','rg','rgnr','registro','generale','atti','fascicolo','tribunale','corte','giudice','pm','pubblico','ministero'
	])
	if (LEGAL.has(norm)) return 'safe'
	// Months and days
	const MONTHS = new Set<string>(['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre','lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica'])
	if (MONTHS.has(norm)) return 'safe'
	// Default: flag as suspect (to be reviewed)
	return 'suspect'
}

function ensureAuditStyles() {
	const id = 'audit-token-styles'
	if (document.getElementById(id)) return
	const style = document.createElement('style')
	style.id = id
	style.textContent = `
	.tok-safe{ color:#bdbdbd !important; font-weight:400; }
	.tok-pseudo{ color:#6f6f6f !important; background:rgba(0,0,0,.08); padding:0 .08em; border-radius:.16em; }
	.tok-suspect{ background:#fff2b2; color:#111 !important; font-weight:600; border-radius:.16em; }
	`
	document.head.appendChild(style)
}

export interface UsePdfAuditProps {
	hostRef: React.MutableRefObject<HTMLDivElement | null>
}

export const usePdfAudit = ({ hostRef }: UsePdfAuditProps) => {
	// Audit mode (digital text only)
	const [audit, setAudit] = useState<boolean>(false)

	// Apply/clear audit style on text layers (digital text) and add page dim overlays + canvas filter
	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const apply = () => {
			// 1) Text layer (when present): color spans per token class
			const layers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
			if (audit) ensureAuditStyles()
			for (const layer of layers) {
				if (audit) {
					layer.setAttribute('data-audit', 'on')
					layer.style.opacity = '1'
					layer.style.mixBlendMode = 'normal'
					// keep audit visuals; pointer-events handled by native-selection effect
					layer.style.pointerEvents = 'none'
					// classify each span
					const spans = Array.from(layer.querySelectorAll('span')) as HTMLSpanElement[]
					for (const sp of spans) {
						const txt = sp.textContent || ''
						const cls = classifyToken(txt)
						sp.classList.remove('tok-safe','tok-pseudo','tok-suspect')
						sp.classList.add(cls==='safe'?'tok-safe':cls==='pseudo'?'tok-pseudo':'tok-suspect')
					}
				} else {
					layer.removeAttribute('data-audit')
					layer.style.removeProperty('opacity')
					layer.style.removeProperty('mix-blend-mode')
					layer.style.removeProperty('pointer-events')
					const spans = Array.from(layer.querySelectorAll('span')) as HTMLSpanElement[]
					for (const sp of spans) { sp.classList.remove('tok-safe','tok-pseudo','tok-suspect') }
				}
			}
			// 2) Canvas: fade so text layer colors are visible
			const canvases = Array.from(host.querySelectorAll('.rpv-core__page-layer canvas')) as HTMLCanvasElement[]
			for (const cv of canvases) {
				if (audit) { (cv.style as any).opacity = '0.06' } else { cv.style.removeProperty('opacity') }
			}
		}
		apply()
		const mo = new MutationObserver(() => apply())
		mo.observe(host, { subtree: true, childList: true })
		return () => mo.disconnect()
	}, [audit])

	return {
		audit,
		setAudit
	}
}
