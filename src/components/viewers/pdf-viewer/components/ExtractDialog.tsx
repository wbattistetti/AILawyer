import React, { useState, useEffect } from 'react'
import { formatDocTitle } from '../../../../utils/misc'
import { api } from '../../../../lib/api'
import { Estratto, Cliente } from '../../../../types'
import { ClientSelector } from './ClientSelector'
import { MotivationSelector } from './MotivationSelector'

interface ExtractDialogProps {
	extractOpen: boolean
	extractPos: { x: number; y: number }
	extractTitle: string
	extractDate: string
	extractNotes: string
	extractPage: number
	showNotes: boolean
	selectKind: 'NATIVE' | 'OCR'
	lastSelection: any
	docId?: string
	praticaId?: string
	fileUrl: string
	hostRef: React.RefObject<HTMLDivElement>
	suppressClearRef: React.MutableRefObject<boolean>
	onExtractTitleChange: (title: string) => void
	onExtractDateChange: (date: string) => void
	onExtractNotesChange: (notes: string) => void
	onShowNotesChange: (show: boolean) => void
	onExtractOpenChange: (open: boolean) => void
	onDraftChange: (draft: any) => void
	onSelBoxChange: (selBox: any) => void
	onSelectedAnnotChange: (annot: any) => void
	onSelectionHandledChange: (handled: boolean) => void
}

export const ExtractDialog: React.FC<ExtractDialogProps> = ({
	extractOpen,
	extractPos,
	extractTitle,
	extractDate,
	extractNotes,
	extractPage,
	showNotes,
	selectKind,
	lastSelection,
	docId,
	praticaId,
	fileUrl,
	hostRef,
	suppressClearRef,
	onExtractTitleChange,
	onExtractDateChange,
	onExtractNotesChange,
	onShowNotesChange,
	onExtractOpenChange,
	onDraftChange,
	onSelBoxChange,
	onSelectedAnnotChange,
	onSelectionHandledChange
}) => {
	// Stati per il nuovo layout
	const [extractType, setExtractType] = useState<'reato' | 'motivazione' | 'contromotivazione'>('reato')
	const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
	const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
	const [extractContent, setExtractContent] = useState('')

	// Stati per i dati
	const [clienti, setClienti] = useState<Cliente[]>([])
	const [estratti, setEstratti] = useState<Estratto[]>([])
	const [loading, setLoading] = useState(false)

	// Carica dati quando si apre il dialog
	useEffect(() => {
		if (extractOpen && praticaId) {
			loadData()
		}
	}, [extractOpen, praticaId])

	const loadData = async () => {
		if (!praticaId) return

		setLoading(true)
		try {
			// Carica clienti della pratica
			const clientiResponse = await api.getClientiByPratica(praticaId)
			setClienti(clientiResponse.clienti)

			// Carica estratti esistenti
			const estrattiResponse = await api.getEstrattiByPratica(praticaId)
			setEstratti(estrattiResponse.estratti)

			// Se c'è un solo cliente, selezionalo automaticamente
			if (clientiResponse.clienti.length === 1) {
				setSelectedClientIds([clientiResponse.clienti[0].id])
			}
		} catch (error) {
			console.error('Errore nel caricamento dati:', error)
		} finally {
			setLoading(false)
		}
	}

	// Funzioni helper per il nuovo layout
	const getTypePrefix = (type: string) => {
		switch (type) {
			case 'reato': return 'Reato: '
			case 'motivazione': return 'Motivazione: '
			case 'contromotivazione': return 'Contro-motivazione: '
			default: return ''
		}
	}

	const getContentPlaceholder = (type: string) => {
		switch (type) {
			case 'reato': return 'Descrivi il reato...'
			case 'motivazione': return 'Descrivi la motivazione...'
			case 'contromotivazione': return 'Descrivi la contromotivazione...'
			default: return 'Inserisci contenuto estratto...'
		}
	}

	const getAvailableParents = () => {
		switch (extractType) {
			case 'motivazione':
				return estratti.filter(e => e.type === 'reato')
			case 'contromotivazione':
				return estratti.filter(e => e.type === 'motivazione')
			default:
				return []
		}
	}

	const getExistingReati = () => {
		return estratti.filter(e => e.type === 'reato')
	}

	const resetForm = () => {
		setExtractType('reato')
		setSelectedParentId(null)
		setExtractContent('')
	}

	// Calcola posizionamento intelligente del dialog
	const getDialogPosition = () => {
		const dialogHeight = 500 // altezza stimata del dialog
		const dialogWidth = 520
		const margin = 20

		const spaceBelow = window.innerHeight - extractPos.y
		const spaceAbove = extractPos.y
		const spaceRight = window.innerWidth - extractPos.x
		const spaceLeft = extractPos.x

		let top = extractPos.y + margin
		let left = extractPos.x

		// Posizionamento verticale intelligente
		if (spaceBelow >= dialogHeight + margin) {
			// Posiziona sotto
			top = extractPos.y + margin
		} else if (spaceAbove >= dialogHeight + margin) {
			// Posiziona sopra
			top = extractPos.y - dialogHeight - margin
		} else {
			// Sovrapponi (centrato verticalmente)
			top = Math.max(margin, Math.min(extractPos.y - dialogHeight / 2, window.innerHeight - dialogHeight - margin))
		}

		// Posizionamento orizzontale intelligente
		if (spaceRight < dialogWidth + margin) {
			// Sposta a sinistra se non c'è spazio a destra
			left = Math.max(margin, window.innerWidth - dialogWidth - margin)
		}

		return { top, left }
	}

	const dialogPosition = getDialogPosition()

	if (!extractOpen) return null

	const handleClose = () => {
		if (!suppressClearRef.current) {
			// ✅ LOGICA INTELLIGENTE: pulisci selezione in base al tipo
			if (selectKind === 'OCR') {
				onDraftChange(null) // OCR: rimuovi rettangolo quando chiudi
			} else {
				// NATIVE: mantieni selezione nativa, rimuovi solo selBox
			}
			onExtractOpenChange(false)
			onSelBoxChange(null)
		}
	}

	const handleCancel = () => {
		// ✅ LOGICA INTELLIGENTE: pulisci selezione in base al tipo
		if (selectKind === 'OCR') {
			onDraftChange(null) // OCR: rimuovi rettangolo quando annulli
		} else {
			// NATIVE: mantieni selezione nativa
		}
		onSelectedAnnotChange(null)
		onShowNotesChange(false) // Reset notes visibility
		onExtractOpenChange(false)
	}

	const handleSave = async () => {
		if (!praticaId || !selectedClientIds.length || !extractContent.trim()) {
			console.error('Dati mancanti per salvare estratto')
			return
		}

		try {
			// Prepara i dati per l'API
			const estrattoData = {
				praticaId,
				sourceDoc: docId || 'current',
				page: extractPage,
				start: lastSelection?.start || 0,
				end: lastSelection?.end || 0,
				type: extractType,
				parentReatoId: extractType === 'motivazione' ? selectedParentId : undefined,
				parentMotivazioneId: extractType === 'contromotivazione' ? selectedParentId : undefined,
				title: `${getTypePrefix(extractType)}${extractContent.trim()}`,
				content: extractContent.trim(),
				clientiIds: selectedClientIds
			}

			// Salva nel database
			await api.createEstratto(estrattoData)

			// Aggiorna la lista locale
			const newEstratto = {
				id: `tmp:${Date.now()}`,
				...estrattoData,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			}
			setEstratti(prev => [newEstratto, ...prev])

			console.log('Estratto salvato con successo:', estrattoData)

		} catch (error) {
			console.error('Errore nel salvataggio estratto:', error)
		}

		// Pulisci form e chiudi dialog
		resetForm()
		onShowNotesChange(false)
		onExtractOpenChange(false)
		onSelectedAnnotChange(null)

		// Pulisci selezione
		if (selectKind === 'OCR') {
			onDraftChange(null)
		} else {
			try { window.dispatchEvent(new Event('ai-select-clear')) } catch { }
			try { const s = window.getSelection(); s && s.removeAllRanges() } catch { }
		}
		onSelectionHandledChange(false)
	}

	return (
		<React.Fragment>
			<div className="fixed inset-0 z-[999]" onClick={handleClose} />
			<div
				className="fixed z-[1000] bg-white rounded-lg shadow-2xl border border-gray-200"
				style={{
					left: dialogPosition.left,
					top: dialogPosition.top,
					width: 520,
					minHeight: 400,
					maxHeight: Math.min(700, (window.innerHeight || 800) - 32)
				}}
			>
				<div
					className="p-6 max-h-full flex flex-col"
					onMouseDown={(e) => { e.stopPropagation(); suppressClearRef.current = true }}
					onMouseUp={() => { suppressClearRef.current = false }}
				>
					{/* Header */}
					<div className="text-lg font-semibold mb-4 text-center text-gray-800 drop-shadow-sm">
						Aggiungi estratto
					</div>

					{loading ? (
						<div className="flex items-center justify-center py-8">
							<div className="text-gray-500">Caricamento dati...</div>
						</div>
					) : (
						<div className="space-y-4">
							{/* RIGA 1: Tipo estratto + Data + Clienti */}
							<div className="grid grid-cols-[2.5fr_0.8fr_1.7fr] gap-4">
								{/* Tipo estratto */}
								<div>
									<select
										className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[14px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
										value={extractType}
										onChange={(e) => {
											setExtractType(e.target.value as any)
											setSelectedParentId(null) // Reset parent quando cambia tipo
										}}
										autoFocus
									>
										<option value="">Seleziona tipo estratto...</option>
										<option value="reato">Reato</option>
										<option value="motivazione">Motivazione</option>
										<option value="contromotivazione">Contro-motivazione</option>
									</select>
								</div>

								{/* Data */}
								<div>
									<input
										type="date"
										className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[14px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
										value={extractDate}
										onChange={(e) => onExtractDateChange(e.target.value)}
									/>
								</div>

								{/* Clienti */}
								<div>
									<ClientSelector
										clienti={clienti}
										selectedIds={selectedClientIds}
										onSelectionChange={setSelectedClientIds}
										maxHeight="h-20"
										enableSearchThreshold={8}
									/>
								</div>
							</div>

							{/* RIGA 2: Contenuto estratto (full width) */}
							<div>
								<textarea
									className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[14px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none overflow-hidden"
									placeholder={getContentPlaceholder(extractType)}
									value={extractContent}
									onChange={(e) => {
										setExtractContent(e.target.value)
										// Auto-resize
										e.target.style.height = 'auto'
										e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
									}}
									style={{ minHeight: '60px', maxHeight: '200px' }}
								/>
							</div>

							{/* RIGA 3: Motivazioni di riferimento (full width) */}
							{(extractType === 'motivazione' || extractType === 'contromotivazione') && (
								<div>
									<MotivationSelector
										motivations={getAvailableParents()}
										selectedId={selectedParentId}
										onSelectionChange={setSelectedParentId}
										maxHeight="max-h-32"
										enableSearchThreshold={8}
										emptyMessage={`Nessun ${extractType === 'motivazione' ? 'reato' : 'motivazione'} disponibile`}
									/>
								</div>
							)}

							{/* Sezione Reati Esistenti (solo per tipo reato) */}
							{extractType === 'reato' && getExistingReati().length > 0 && (
								<div className="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-32 overflow-y-auto">
									{getExistingReati().map(reato => (
										<div key={reato.id} className="text-sm text-gray-600 py-1 border-b border-gray-200 last:border-b-0">
											• {reato.title || reato.content}
										</div>
									))}
								</div>
							)}

							{/* Note espandibili */}
							{showNotes && (
								<div>
									<textarea
										className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[80px] max-h-[160px] resize-y overflow-auto text-[13px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
										value={extractNotes}
										onChange={(e) => onExtractNotesChange(e.target.value)}
										placeholder="Aggiungi note opzionali..."
									/>
								</div>
							)}
						</div>
					)}

					{/* Pulsanti */}
					<div className="mt-6 pt-3 border-t border-gray-200 flex justify-between items-center">
						{/* Pulsante Note */}
						<button
							type="button"
							className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 px-3 py-2 font-medium transition-colors border border-gray-300 rounded-lg hover:bg-gray-50"
							onClick={() => onShowNotesChange(!showNotes)}
						>
							{showNotes ? '▾' : '▸'} Note
						</button>

						{/* Pulsanti principali */}
						<div className="flex gap-3">
							<button
								className="px-4 py-2 border border-gray-300 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
								onClick={handleCancel}
							>
								Annulla
							</button>
							<button
								className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 text-[13px] font-medium hover:bg-blue-700 disabled:hover:bg-blue-600 transition-colors"
								disabled={loading || !extractType || !extractContent.trim() || !extractDate.trim() || !selectedClientIds.length ||
									(extractType !== 'reato' && !selectedParentId)}
								onClick={handleSave}
							>
								Salva
							</button>
						</div>
					</div>
				</div>
			</div>
		</React.Fragment>
	)
}