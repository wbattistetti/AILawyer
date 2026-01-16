import { DefenseMemoryTableData, PreambleData, ConclusionsData, TableRow } from '../types/table.types'
import { getCellTypeLabel } from './cellTypeConfig'

// ✅ Import di jsPDF - jsPDF 4.0.0 usa export default
// @ts-ignore - jsPDF potrebbe non avere tipi completi per questa versione
import jsPDF from 'jspdf'

// ✅ Helper per ottenere dimensioni immagine da data URL (converte pixel in mm)
// jsPDF usa mm come unità, quindi convertiamo i pixel in mm
// 1 pixel = 0.264583 mm (a 96 DPI standard)
const PIXEL_TO_MM = 0.264583

const getImageDimensions = (dataUrl: string, maxWidthMM: number, maxHeightMM: number): Promise<{ width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            // ✅ Dimensioni originali in pixel
            let imgWidthPx = img.width
            let imgHeightPx = img.height
            const aspectRatio = imgWidthPx / imgHeightPx

            // ✅ Converti dimensioni massime da mm a pixel per il confronto
            const maxWidthPx = maxWidthMM / PIXEL_TO_MM
            const maxHeightPx = maxHeightMM / PIXEL_TO_MM

            // ✅ Scala per adattarsi alle dimensioni massime mantenendo aspect ratio
            if (imgWidthPx > maxWidthPx) {
                imgWidthPx = maxWidthPx
                imgHeightPx = imgWidthPx / aspectRatio
            }

            if (imgHeightPx > maxHeightPx) {
                imgHeightPx = maxHeightPx
                imgWidthPx = imgHeightPx * aspectRatio
            }

            // ✅ Converti da pixel a mm per jsPDF
            const imgWidthMM = imgWidthPx * PIXEL_TO_MM
            const imgHeightMM = imgHeightPx * PIXEL_TO_MM

            resolve({ width: imgWidthMM, height: imgHeightMM })
        }
        img.onerror = () => reject(new Error('Errore durante il caricamento dell\'immagine'))
        img.src = dataUrl
    })
}

// ✅ Funzione per esportare in PDF
export async function exportToPDF(
    data: DefenseMemoryTableData,
    clienteNome?: string
): Promise<void> {

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 20
    const contentWidth = pageWidth - (margin * 2)
    let yPos = margin

    // ✅ Helper per aggiungere una nuova pagina se necessario
    const checkPageBreak = (requiredHeight: number) => {
        if (yPos + requiredHeight > pageHeight - margin) {
            doc.addPage()
            yPos = margin
            return true
        }
        return false
    }

    // ✅ Helper per aggiungere testo con word wrap
    const addText = (text: string, fontSize: number, isBold: boolean = false, align: 'left' | 'center' | 'right' = 'left', fontStyle: 'normal' | 'italic' = 'normal') => {
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', isBold ? 'bold' : fontStyle)

        const lines = doc.splitTextToSize(text, contentWidth)
        lines.forEach((line: string) => {
            checkPageBreak(fontSize * 0.5)
            doc.text(line, margin, yPos, { align })
            yPos += fontSize * 0.5
        })
    }

    // ✅ PRIMA PAGINA: Preambolo
    if (data.preamble) {
        const preamble = data.preamble

        // Titolo
        addText('ANALISI GIURIDICA FASCICOLO PROCESSUALE', 16, true, 'center')
        yPos += 5

        // Header Info
        if (preamble.procura || preamble.tribunale || preamble.gip || preamble.altro) {
            const headerInfo: string[] = []
            if (preamble.procura) headerInfo.push(`PROCURA DELLA REPUBBLICA DI ${preamble.procura.toUpperCase()}`)
            if (preamble.tribunale) headerInfo.push(`TRIBUNALE: ${preamble.tribunale}`)
            if (preamble.gip) headerInfo.push(`GIP: ${preamble.gip}`)
            if (preamble.altro) headerInfo.push(`ALTRO: ${preamble.altro}`)

            headerInfo.forEach(info => {
                addText(info, 10, false, 'left')
                yPos += 3
            })
        }

        // Numero Procedimento
        if (preamble.numeroProcedimento) {
            yPos += 3
            addText(`Proc. Penale n. ${preamble.numeroProcedimento}`, 12, true, 'right')
            yPos += 5
        }

        // Affidamento incarico
        if (preamble.affidamentoIncarico) {
            addText('Affidamento incarico:', 12, true)
            yPos += 2
            addText(preamble.affidamentoIncarico, 10)
            yPos += 5
        }

        // Richiesta quesito
        if (preamble.richiestaQuesito) {
            addText('Richiesta quesito:', 12, true)
            yPos += 2
            addText(preamble.richiestaQuesito, 10)
            yPos += 5
        }

        // DATI
        if (preamble.numeroCartelle || preamble.numeroDocumenti || preamble.numeroFogli) {
            addText('DATI', 12, true)
            yPos += 2
            const datiText: string[] = []
            if (preamble.numeroCartelle) datiText.push(`Numero ${preamble.numeroCartelle} cartelle di file`)
            if (preamble.numeroDocumenti) datiText.push(`contenenti ${preamble.numeroDocumenti} documenti PDF`)
            if (preamble.numeroFogli) datiText.push(`per un totale di ${preamble.numeroFogli} fogli.`)
            addText(datiText.join(' '), 10)
            yPos += 5
        }

        // Tabella Dettagli Caso
        const dettagli: Array<{ label: string, value: string }> = []
        if (preamble.nomeIndagato) dettagli.push({ label: '1 Nome indagato/imputato', value: preamble.nomeIndagato })
        if (preamble.numeroProcedimentoDettaglio) dettagli.push({ label: '2 Nr. procedimento', value: preamble.numeroProcedimentoDettaglio })
        if (preamble.ufficioProcede) dettagli.push({ label: '3 Ufficio che procede', value: preamble.ufficioProcede })
        if (preamble.reatiContestati) dettagli.push({ label: '4 Reato/i contestati', value: preamble.reatiContestati })
        if (preamble.dataLuogo) dettagli.push({ label: '5 Data e luogo', value: preamble.dataLuogo })
        if (preamble.ufficioPM) dettagli.push({ label: '6 Ufficio del P.M.', value: preamble.ufficioPM })
        if (preamble.parteOffesa) dettagli.push({ label: '7 Parte offesa', value: preamble.parteOffesa })
        if (preamble.poliziaGiudiziaria) dettagli.push({ label: '8 Polizia Giudiziaria', value: preamble.poliziaGiudiziaria })
        if (preamble.difensori) dettagli.push({ label: '9 Difensore/i', value: preamble.difensori })
        if (preamble.altroDettaglio) dettagli.push({ label: '10', value: preamble.altroDettaglio })

        if (dettagli.length > 0) {
            yPos += 3
            addText('Dettagli Caso:', 12, true)
            yPos += 3

            dettagli.forEach(dettaglio => {
                checkPageBreak(8)
                addText(`${dettaglio.label}: ${dettaglio.value}`, 10)
                yPos += 4
            })
        }

        // Nuova pagina per le righe
        doc.addPage()
        yPos = margin
    }

    // ✅ CORPO: Righe
    addText('ATTI', 14, true)
    yPos += 5

    // ✅ Usa for...of per supportare await anche nel loop esterno
    for (let index = 0; index < data.rows.length; index++) {
        const row = data.rows[index]
        checkPageBreak(30)

        // Intestazione riga
        const rowHeader = `${String.fromCharCode(97 + index)}. ${getCellTypeLabel(row.cellType)}`
        if (row.description) {
            addText(`${rowHeader} - ${row.description}`, 11, true)
        } else {
            addText(rowHeader, 11, true)
        }
        yPos += 3

        // Date
        if (row.contestationDate || row.eventDate) {
            const dates: string[] = []
            if (row.contestationDate) dates.push(`Data contestazione: ${row.contestationDate}`)
            if (row.eventDate) dates.push(`Data evento: ${row.eventDate}`)
            addText(dates.join(' | '), 9)
            yPos += 3
        }

        // Osservazioni/Corpo
        if (row.blocks && row.blocks.length > 0) {
            // ✅ Usa for...of per supportare await
            for (const block of row.blocks) {
                checkPageBreak(15)

                if (block.type === 'observation') {
                    // Rimuovi tag HTML per testo semplice
                    const text = block.content?.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ') || ''
                    if (text.trim()) {
                        addText(text, 10)
                        yPos += 3
                    }
                } else if (block.type === 'extract' && block.extract) {
                    const extractText = `Estratto da: ${block.extract.source}, pagina ${block.extract.page}`
                    addText(extractText, 9, false, 'left', 'italic')
                    yPos += 2

                    // ✅ Aggiungi immagine se presente
                    if (block.extract.imageDataUrl) {
                        try {
                            const maxImageWidth = contentWidth
                            const maxImageHeight = pageHeight - yPos - margin - 20 // Lascia spazio per testo dopo

                            // ✅ Ottieni dimensioni immagine scalate
                            const { width: imgWidth, height: imgHeight } = await getImageDimensions(
                                block.extract.imageDataUrl,
                                maxImageWidth,
                                maxImageHeight
                            )

                            // ✅ Controlla se serve una nuova pagina
                            checkPageBreak(imgHeight + 5)

                            // ✅ Determina il formato dell'immagine dal data URL
                            let imageFormat: 'PNG' | 'JPEG' = 'PNG'
                            if (block.extract.imageDataUrl.startsWith('data:image/jpeg') ||
                                block.extract.imageDataUrl.startsWith('data:image/jpg')) {
                                imageFormat = 'JPEG'
                            }

                            // ✅ Aggiungi immagine al PDF
                            doc.addImage(
                                block.extract.imageDataUrl,
                                imageFormat,
                                margin,
                                yPos,
                                imgWidth,
                                imgHeight
                            )

                            yPos += imgHeight + 3 // Spazio dopo l'immagine
                        } catch (error) {
                            console.error('Errore durante l\'aggiunta dell\'immagine al PDF:', error)
                            // ✅ Se fallisce, continua con il testo
                        }
                    }

                    // ✅ Aggiungi testo estratto se presente
                    const content = block.extract.content?.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ') || ''
                    if (content.trim()) {
                        addText(content, 10)
                        yPos += 3
                    }
                }
            }
        } else if (row.observations) {
            const obsText = row.observations.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
            if (obsText.trim()) {
                addText(obsText, 10)
                yPos += 3
            }
        }

        yPos += 5 // Spazio tra righe
    }

    // ✅ ULTIMA PAGINA: Conclusioni Finali
    if (data.conclusions) {
        checkPageBreak(50)
        doc.addPage()
        yPos = margin

        addText('Conclusioni Finali - data e Firma', 14, true, 'center')
        yPos += 10

        if (data.conclusions.conclusioni) {
            const conclusioniText = data.conclusions.conclusioni.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
            addText(conclusioniText, 10)
            yPos += 10
        }

        if (data.conclusions.data || data.conclusions.firma) {
            const footer: string[] = []
            if (data.conclusions.data) footer.push(`Data: ${data.conclusions.data}`)
            if (data.conclusions.firma) footer.push(`Firma: ${data.conclusions.firma}`)
            addText(footer.join(' | '), 10)
        }
    }

    // ✅ Salva il PDF
    const filename = clienteNome
        ? `Analisi_Atti_${clienteNome.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
        : `Analisi_Atti_${new Date().toISOString().split('T')[0]}.pdf`

    doc.save(filename)
}
