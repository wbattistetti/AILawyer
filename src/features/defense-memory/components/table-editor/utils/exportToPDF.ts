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

// ✅ Helper per disegnare un rettangolo con bordo e sfondo opzionale
const drawRect = (
    doc: any,
    x: number,
    y: number,
    width: number,
    height: number,
    fillColor?: [number, number, number],
    strokeColor: [number, number, number] = [0, 0, 0]
) => {
    if (fillColor) {
        doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
        doc.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2])
        doc.rect(x, y, width, height, 'FD') // Fill and Draw
    } else {
        doc.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2])
        doc.rect(x, y, width, height, 'D') // Draw only
    }
}

// ✅ Helper per aggiungere testo in una cella
const addTextInCell = (
    doc: any,
    text: string,
    x: number,
    y: number,
    cellWidth: number,
    fontSize: number,
    isBold: boolean = false,
    align: 'left' | 'center' | 'right' = 'left',
    padding: number = 2
) => {
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', isBold ? 'bold' : 'normal')

    const lines = doc.splitTextToSize(text, cellWidth - (padding * 2))
    let currentY = y + padding + fontSize * 0.35

    lines.forEach((line: string) => {
        let textX = x + padding
        if (align === 'center') {
            const textWidth = doc.getTextWidth(line)
            textX = x + (cellWidth - textWidth) / 2
        } else if (align === 'right') {
            const textWidth = doc.getTextWidth(line)
            textX = x + cellWidth - textWidth - padding
        }
        doc.text(line, textX, currentY)
        currentY += fontSize * 0.5
    })

    return currentY - y + padding // Restituisce l'altezza effettiva della cella
}

// ✅ Helper per creare tabella header a due colonne con righe alternate
const drawHeaderTable = (
    doc: any,
    x: number,
    y: number,
    width: number,
    preamble: PreambleData
): number => {
    const col1Width = width * 0.6 // 60% per colonna sinistra
    const col2Width = width * 0.4 // 40% per colonna destra
    const rowHeight = 7
    let currentY = y

    // ✅ Riga 1: PROCURA / Proc. Penale (bianco)
    const fillColor1: [number, number, number] = [255, 255, 255] // Bianco
    drawRect(doc, x, currentY, col1Width, rowHeight, fillColor1)
    drawRect(doc, x + col1Width, currentY, col2Width, rowHeight, fillColor1)
    if (preamble.procura) {
        addTextInCell(doc, `PROCURA DELLA REPUBBLICA DI ${preamble.procura.toUpperCase()}`, x, currentY, col1Width, 9, false, 'left')
    }
    if (preamble.numeroProcedimento) {
        addTextInCell(doc, `Proc. Penale n. ${preamble.numeroProcedimento}`, x + col1Width, currentY, col2Width, 12, true, 'right')
    }
    currentY += rowHeight

    // ✅ Riga 2: TRIBUNALE (grigio chiaro) - valore nella colonna destra
    const fillColor2: [number, number, number] = [240, 240, 240] // Grigio chiaro
    drawRect(doc, x, currentY, col1Width, rowHeight, fillColor2)
    drawRect(doc, x + col1Width, currentY, col2Width, rowHeight, fillColor2)
    addTextInCell(doc, 'TRIBUNALE:', x, currentY, col1Width, 9, false, 'left')
    if (preamble.tribunale) {
        addTextInCell(doc, preamble.tribunale, x + col1Width, currentY, col2Width, 9, false, 'left')
    }
    currentY += rowHeight

    // ✅ Riga 3: GIP (bianco) - valore nella colonna destra
    const fillColor3: [number, number, number] = [255, 255, 255] // Bianco
    drawRect(doc, x, currentY, col1Width, rowHeight, fillColor3)
    drawRect(doc, x + col1Width, currentY, col2Width, rowHeight, fillColor3)
    addTextInCell(doc, 'GIP:', x, currentY, col1Width, 9, false, 'left')
    if (preamble.gip) {
        addTextInCell(doc, preamble.gip, x + col1Width, currentY, col2Width, 9, false, 'left')
    }
    currentY += rowHeight

    // ✅ Riga 4: ALTRO (grigio chiaro) - valore nella colonna destra
    const fillColor4: [number, number, number] = [240, 240, 240] // Grigio chiaro
    drawRect(doc, x, currentY, col1Width, rowHeight, fillColor4)
    drawRect(doc, x + col1Width, currentY, col2Width, rowHeight, fillColor4)
    addTextInCell(doc, 'ALTRO:', x, currentY, col1Width, 9, false, 'left')
    if (preamble.altro) {
        addTextInCell(doc, preamble.altro, x + col1Width, currentY, col2Width, 9, false, 'left')
    }
    currentY += rowHeight

    return currentY - y // Restituisce l'altezza totale della tabella
}

// ✅ Helper per creare tabella dettagli con 3 colonne (numero | label | valore) e righe alternate
// ✅ Altezza righe dinamica basata sul contenuto
const drawDetailsTable = (
    doc: any,
    x: number,
    y: number,
    width: number,
    dettagli: Array<{ label: string, value: string }>
): number => {
    const col1Width = width * 0.1 // 10% per numero
    const col2Width = width * 0.35 // 35% per label
    const col3Width = width * 0.55 // 55% per valore
    const fontSize = 9
    const padding = 2
    const minRowHeight = 7
    let currentY = y

    doc.setFontSize(fontSize)
    doc.setFont('helvetica', 'normal')

    dettagli.forEach((dettaglio, index) => {
        // ✅ Sfondo alternato: grigio per righe pari (0, 2, 4...), bianco per righe dispari (1, 3, 5...)
        const isEven = index % 2 === 0
        const fillColor: [number, number, number] = isEven ? [240, 240, 240] : [255, 255, 255]

        // ✅ Estrai il numero dal label (es. "1 Nome indagato/imputato" -> "1" e "Nome indagato/imputato")
        const match = dettaglio.label.match(/^(\d+)\s+(.+)$/)
        const numero = match ? match[1] : ''
        const labelSenzaNumero = match ? match[2] : dettaglio.label

        // ✅ Calcola il numero di righe per ogni colonna (per word wrap)
        const numeroLines = numero ? doc.splitTextToSize(numero, col1Width - (padding * 2)) : ['']
        const labelLines = doc.splitTextToSize(labelSenzaNumero, col2Width - (padding * 2))
        const valueLines = doc.splitTextToSize(dettaglio.value, col3Width - (padding * 2))

        // ✅ Altezza riga = massimo tra le altezze delle tre colonne
        const maxLines = Math.max(numeroLines.length, labelLines.length, valueLines.length)
        const rowHeight = Math.max(minRowHeight, (maxLines * fontSize * 0.5) + (padding * 2))

        // ✅ Disegna rettangolo con sfondo per tutte e 3 le colonne
        drawRect(doc, x, currentY, col1Width, rowHeight, fillColor)
        drawRect(doc, x + col1Width, currentY, col2Width, rowHeight, fillColor)
        drawRect(doc, x + col1Width + col2Width, currentY, col3Width, rowHeight, fillColor)

        // ✅ Aggiungi testo: numero | label | valore (centrato verticalmente)
        const textStartY = currentY + padding + fontSize * 0.35
        if (numero) {
            numeroLines.forEach((line: string, lineIndex: number) => {
                doc.text(line, x + padding, textStartY + (lineIndex * fontSize * 0.5))
            })
        }
        labelLines.forEach((line: string, lineIndex: number) => {
            doc.text(line, x + col1Width + padding, textStartY + (lineIndex * fontSize * 0.5))
        })
        valueLines.forEach((line: string, lineIndex: number) => {
            doc.text(line, x + col1Width + col2Width + padding, textStartY + (lineIndex * fontSize * 0.5))
        })

        currentY += rowHeight
    })

    return currentY - y // Restituisce l'altezza totale della tabella
}

// ✅ Funzione per esportare in PDF
export async function exportToPDF(
    data: DefenseMemoryTableData,
    clienteNome?: string,
    includeExtracts: boolean = true
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

        // ✅ Titolo sottolineato e centrato
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        const titleText = 'ANALISI GIURIDICA FASCICOLO PROCESSUALE'
        const titleWidth = doc.getTextWidth(titleText)
        const titleX = (pageWidth - titleWidth) / 2
        doc.text(titleText, titleX, yPos)
        // ✅ Disegna linea di sottolineatura
        doc.setDrawColor(0, 0, 0)
        doc.line(titleX, yPos + 1, titleX + titleWidth, yPos + 1)
        yPos += 8

        // ✅ Tabella Header a due colonne
        if (preamble.procura || preamble.tribunale || preamble.gip || preamble.altro || preamble.numeroProcedimento) {
            checkPageBreak(30)
            const headerHeight = drawHeaderTable(doc, margin, yPos, contentWidth, preamble)
            yPos += headerHeight + 10 // ✅ Aumentato spazio da 5 a 10
        }

        // ✅ Affidamento incarico: titolo sottolineato con testo sulla stessa riga (stesso font, non bold)
        if (preamble.affidamentoIncarico) {
            doc.setFontSize(10) // ✅ Stesso font size del testo
            doc.setFont('helvetica', 'normal') // ✅ Non bold
            const labelText = 'Affidamento incarico:'
            const labelWidth = doc.getTextWidth(labelText)
            doc.text(labelText, margin, yPos)
            // ✅ Sottolinea solo il titolo
            doc.line(margin, yPos + 1, margin + labelWidth, yPos + 1)
            // ✅ Testo sulla stessa riga a destra (stesso font size)
            const textX = margin + labelWidth + 3
            const textWidth = contentWidth - labelWidth - 3
            const lines = doc.splitTextToSize(preamble.affidamentoIncarico, textWidth)
            lines.forEach((line: string, index: number) => {
                doc.text(line, textX, yPos + (index * 5))
            })
            yPos += Math.max(5, lines.length * 5) + 3
        }

        // ✅ Richiesta quesito: titolo sottolineato con testo sulla stessa riga (stesso font, non bold)
        if (preamble.richiestaQuesito) {
            doc.setFontSize(10) // ✅ Stesso font size del testo
            doc.setFont('helvetica', 'normal') // ✅ Non bold
            const labelText = 'Richiesta quesito:'
            const labelWidth = doc.getTextWidth(labelText)
            doc.text(labelText, margin, yPos)
            // ✅ Sottolinea solo il titolo
            doc.line(margin, yPos + 1, margin + labelWidth, yPos + 1)
            // ✅ Testo sulla stessa riga a destra (stesso font size)
            const textX = margin + labelWidth + 3
            const textWidth = contentWidth - labelWidth - 3
            const lines = doc.splitTextToSize(preamble.richiestaQuesito, textWidth)
            lines.forEach((line: string, index: number) => {
                doc.text(line, textX, yPos + (index * 5))
            })
            yPos += Math.max(5, lines.length * 5) + 3
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

        // ✅ Tabella Dettagli Caso con righe alternate
        // ✅ Usa il nuovo formato caseDetails se disponibile, altrimenti migra dai campi vecchi
        let dettagli: Array<{ label: string, value: string }> = []

        if (preamble.caseDetails && preamble.caseDetails.length > 0) {
            // ✅ Nuovo formato: usa caseDetails
            dettagli = preamble.caseDetails
                .filter(d => d.value && d.value.trim()) // Solo dettagli con valore
                .sort((a, b) => a.order - b.order)
                .map(d => ({
                    label: `${d.order + 1} ${d.label}`, // Aggiungi numero progressivo
                    value: d.value
                }))
        } else {
            // ✅ Retrocompatibilità: migra dai campi vecchi
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
        }

        if (dettagli.length > 0) {
            // ✅ Rimuovo il titolo "Dettagli Caso:" - la tabella inizia subito
            yPos += 3
            checkPageBreak(10 + (dettagli.length * 7))
            const detailsHeight = drawDetailsTable(doc, margin, yPos, contentWidth, dettagli)
            yPos += detailsHeight + 5
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

                    // ✅ Aggiungi immagine se presente E se includeExtracts è true
                    if (includeExtracts && block.extract.imageDataUrl) {
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
