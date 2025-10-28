import React, { useState, useEffect } from 'react'
import { DefenseDocumentBuilder } from './DefenseDocumentBuilder'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Download, Eye } from 'lucide-react'

interface DefenseMemoryViewerProps {
    praticaId: string
    clienteId: string
    clienteNome: string
}

export const DefenseMemoryViewer: React.FC<DefenseMemoryViewerProps> = ({
    praticaId,
    clienteId,
    clienteNome
}) => {
    const [extracts, setExtracts] = useState<any[]>([])
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedDocument, setGeneratedDocument] = useState<string | null>(null)

    useEffect(() => {
        // Carica estratti dalla memoria globale
        const pendingExtracts = (window as any).__pendingExtracts as Array<any> || []
        console.log('🎭 [DefenseMemoryViewer] Estratti caricati:', pendingExtracts.length)
        setExtracts(pendingExtracts)
    }, [])

    const handleGenerateDocument = async () => {
        setIsGenerating(true)
        try {
            console.log('📄 [DefenseMemoryViewer] Generazione documento iniziata...')

            // Simula generazione documento (per ora testo HTML)
            const htmlContent = `
        <html>
          <head>
            <title>Memoria Difensiva - ${clienteNome}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 40px;
                line-height: 1.6;
                background: white;
                color: #333;
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 30px;
                padding-bottom: 15px;
                border-bottom: 2px solid #1e40af;
              }
              .header-title {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
              }
              .header-title-row {
                display: flex;
                align-items: center;
                margin-bottom: 4px;
              }
              .header-title-main {
                color: #1e40af;
                margin: 0;
                font-weight: normal;
                font-size: 20px;
              }
              .header-title-client {
                color: #000;
                font-weight: bold;
                margin: 0;
                margin-left: 8px;
                font-size: 20px;
              }
              .print-icon {
                margin-left: 8px;
                cursor: pointer;
                width: 24px;
                height: 24px;
                opacity: 0.7;
                transition: opacity 0.2s;
              }
              .reato-checkbox {
                margin-right: 10px;
                transform: scale(1.2);
                cursor: pointer;
              }
              .print-menu {
                position: relative;
                display: inline-block;
              }
              .print-menu-button {
                background: #2563eb;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                margin-left: 10px;
              }
              .print-menu-button:hover {
                background: #1d4ed8;
              }
              .print-dropdown {
                display: none;
                position: absolute;
                background: white;
                min-width: 200px;
                box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
                z-index: 1;
                border-radius: 4px;
                border: 1px solid #e5e7eb;
                top: 100%;
                right: 0;
              }
              .print-dropdown.show {
                display: block;
              }
              .print-dropdown-item {
                color: #374151;
                padding: 12px 16px;
                text-decoration: none;
                display: block;
                cursor: pointer;
                border-bottom: 1px solid #f3f4f6;
              }
              .print-dropdown-item:hover {
                background-color: #f9fafb;
              }
              .document-type-label {
                background: #10b981;
                color: white;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
                margin-left: 15px;
                display: inline-block;
              }
              .document-type-label.selezione {
                background: #60a5fa;
              }
              .document-type-label.nessuno {
                background: #ef4444;
              }
              .toolbar {
                display: flex;
                align-items: center;
                gap: 20px;
                margin-left: 0;
                margin-right: 0;
              }
              .toolbar-block {
                border: 1px solid #d1d5db;
                border-radius: 6px;
                padding: 8px 12px;
                background: white;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                position: relative;
                min-height: 60px;
                display: flex;
                flex-direction: column;
                justify-content: center;
              }
              .toolbar-block-title {
                font-size: 11px;
                font-weight: bold;
                color: #475569;
                text-align: center;
                position: absolute;
                top: -8px;
                left: 50%;
                transform: translateX(-50%);
                background: #f8fafc;
                padding: 0 8px;
                border-radius: 3px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
              }
              .toolbar-buttons {
                display: flex;
                gap: 8px;
                align-items: center;
              }
              .toolbar-button {
                background: #f9fafb;
                border: 1px solid #d1d5db;
                cursor: pointer;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                transition: all 0.2s;
                min-width: 60px;
                text-align: center;
              }
              .toolbar-button:hover {
                background: #f3f4f6;
                border-color: #9ca3af;
              }
              .toolbar-button.active {
                background: #dbeafe;
                border-color: #3b82f6;
                color: #1e40af;
                font-weight: bold;
              }
              .toolbar-button.tutti-active {
                background: #10b981;
                border-color: #059669;
                color: white;
                font-weight: bold;
              }
              .toolbar-button.nessuno-active {
                background: #ef4444;
                border-color: #dc2626;
                color: white;
                font-weight: bold;
              }
              .print-button {
                background: none;
                border: none;
                cursor: pointer;
                padding: 8px;
                border-radius: 4px;
                font-size: 24px;
                transition: all 0.2s;
                min-width: 50px;
                min-height: 50px;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .print-button:hover {
                background: #f3f4f6;
              }
              .print-button.active {
                background: #dbeafe;
              }
              .toggle-button {
                background: #f9fafb;
                border: 1px solid #d1d5db;
                cursor: pointer;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                transition: all 0.2s;
                min-width: 80px;
                text-align: center;
              }
              .toggle-button:hover {
                background: #f3f4f6;
                border-color: #9ca3af;
              }
              .toggle-button.active {
                background: #dbeafe;
                border-color: #3b82f6;
                color: #1e40af;
              }
              .stampa-text {
                font-size: 12px;
                color: #6b7280;
                font-weight: normal;
                margin: 0 4px;
              }
              .date {
                color: #6b7280;
                font-size: 14px;
                margin-top: 8px;
                text-align: left;
                margin-left: 0;
              }
              .reato {
                margin: 25px 0;
                padding: 15px;
                border-left: 4px solid #dc2626;
                background: #fef2f2;
              }
              .reato-title {
                color: #dc2626;
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
              }
              .reato-title-text {
                flex: 1;
              }
              .reato-content {
                color: #333;
                margin-bottom: 15px;
                margin-left: 20px;
              }
              .motivazione {
                margin: 15px 0 15px 30px;
                padding: 12px;
                border-left: 3px solid #ea580c;
                background: #fff7ed;
              }
              .motivazione-title {
                color: #ea580c;
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 8px;
              }
              .document-reference {
                font-size: 12px;
                color: #666;
                margin-left: 10px;
                font-style: italic;
              }
              .analyst-notes {
                background-color: #f3e8ff;
                border: 1px solid #a855f7;
                padding: 10px;
                margin-top: 10px;
                border-radius: 4px;
              }
              .analyst-notes-label {
                font-weight: bold;
                color: #7c3aed;
                margin-bottom: 5px;
              }
              .editable-notes {
                background-color: #fef3c7;
                border: 2px dashed #f59e0b;
                padding: 10px;
                margin-top: 10px;
                border-radius: 4px;
                min-height: 50px;
                cursor: text;
                outline: none;
              }
              .editable-notes:focus {
                border-color: #d97706;
                background-color: #fffbeb;
              }
              .editable-notes:empty:before {
                content: "Clicca qui per aggiungere note...";
                color: #9ca3af;
                font-style: italic;
              }
              .motivazione-content {
                color: #333;
                margin-bottom: 10px;
                margin-left: 20px;
              }
              .contromotivazione {
                margin: 10px 0 10px 30px;
                padding: 10px;
                border-left: 3px solid #2563eb;
                background: #eff6ff;
              }
              .contromotivazione-title {
                color: #2563eb;
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 6px;
              }
              .contromotivazione-content {
                color: #333;
                margin-bottom: 8px;
                margin-left: 20px;
              }
              .difesa-strategia {
                margin: 15px 0;
                padding: 12px;
                border-left: 4px solid #059669;
                background: #f0fdf4;
              }
              .difesa-strategia-title {
                color: #059669;
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 8px;
              }
              .strategia-title {
                color: #dc2626;
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 8px;
              }
              .difesa-strategia-content {
                color: #333;
                margin-bottom: 10px;
              }
              .prove-section {
                margin: 25px 0;
                padding: 15px;
                border-left: 4px solid #7c3aed;
                background: #faf5ff;
              }
              .prove-title {
                color: #7c3aed;
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
              }
              .prova {
                margin: 10px 0;
                padding: 10px;
                background: #f8fafc;
                border-radius: 4px;
              }
              .prova-title {
                color: #7c3aed;
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 6px;
              }
              .prova-content {
                color: #333;
                margin-bottom: 8px;
                margin-left: 20px;
              }
              .testimonianze-section {
                margin: 25px 0;
                padding: 15px;
                border-left: 4px solid #ea580c;
                background: #fff7ed;
              }
              .testimonianze-title {
                color: #ea580c;
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
              }
              .testimonianza {
                margin: 10px 0;
                padding: 10px;
                background: #f8fafc;
                border-radius: 4px;
              }
              .testimonianza-title {
                color: #ea580c;
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 6px;
              }
              .testimonianza-content {
                color: #333;
                margin-bottom: 8px;
                margin-left: 20px;
              }
              .collapsible {
                cursor: pointer;
                user-select: none;
              }
              .collapsible:hover {
                opacity: 0.8;
              }
              .collapsible-content {
                display: block;
              }
              .collapsible-content.collapsed {
                display: none;
              }
              .toggle-icon {
                margin-right: 8px;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="header-title">
                <div class="header-title-row">
                  <h1 class="header-title-main">MEMORIA DIFENSIVA PER:</h1>
                  <span class="header-title-client">${clienteNome}</span>
                  <span class="document-type-label" id="documentTypeLabel">COMPLETO</span>
                </div>
                <div class="date">Generata il: ${new Date().toLocaleDateString('it-IT')}</div>
              </div>
              <div class="toolbar">
                <div class="toolbar-block">
                  <div class="toolbar-block-title">SELEZIONA</div>
                  <div class="toolbar-buttons">
                    <button class="toolbar-button" id="tuttiButton" onclick="selezionaTutti()" title="Seleziona tutti i reati">Tutti</button>
                    <button class="toolbar-button" id="nessunoButton" onclick="deselezionaTutti()" title="Deseleziona tutti i reati">Nessuno</button>
                  </div>
                </div>
                <div class="toolbar-block" id="stampaBlock">
                  <div class="toolbar-block-title">STAMPA</div>
                  <div class="toolbar-buttons">
                    <button class="toggle-button" id="toggleButton" onclick="toggleStampaMode()" title="Cambia modalità stampa">Tutti</button>
                    <span class="stampa-text">in</span>
                    <button class="print-button" onclick="stampaPDF()" title="Stampa PDF">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="3" width="18" height="18" rx="2" fill="#E53E3E"/>
                        <rect x="5" y="5" width="14" height="10" fill="white"/>
                        <rect x="6" y="6" width="12" height="8" fill="#F7FAFC"/>
                        <rect x="7" y="7" width="10" height="6" fill="#E53E3E"/>
                        <text x="12" y="11" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="8" font-weight="bold">PDF</text>
                      </svg>
                    </button>
                    <button class="print-button" onclick="stampaWord()" title="Stampa Word">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="3" width="18" height="18" rx="2" fill="#2B6CB0"/>
                        <rect x="5" y="5" width="14" height="10" fill="white"/>
                        <rect x="6" y="6" width="12" height="8" fill="#F7FAFC"/>
                        <text x="12" y="11" text-anchor="middle" fill="#2B6CB0" font-family="Arial, sans-serif" font-size="10" font-weight="bold">W</text>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            ${extracts.filter(e => e.type === 'reato').map((reato, index) => `
              <div class="reato">
                <div class="reato-title">
                  <input type="checkbox" class="reato-checkbox" id="checkbox-reato-${index}" checked data-reato-id="${reato.id}">
                  <span class="reato-title-text collapsible" onclick="toggleCollapsible('reato-${index}')">
                    <span class="toggle-icon" id="icon-reato-${index}">▼</span>
                    REATO: ${reato.title}
                  </span>
                  <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iNCIgeT0iNiIgd2lkdGg9IjE2IiBoZWlnaHQ9IjEwIiByeD0iMiIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgZmlsbD0iI2ZmZiIvPgo8cmVjdCB4PSI2IiB5PSI4IiB3aWR0aD0iMTIiIGhlaWdodD0iNiIgcng9IjEiIGZpbGw9IiNmM2Y0ZjYiLz4KPHJlY3QgeD0iNyIgeT0iOSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjQiIHJ4PSIwLjUiIGZpbGw9IiNlNWU3ZWIiLz4KPHJlY3QgeD0iMTAiIHk9IjIiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIHJ4PSIxIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMS41IiBmaWxsPSIjZmZmIi8+CjxyZWN0IHg9IjExIiB5PSIzIiB3aWR0aD0iMiIgaGVpZ2h0PSIyIiByeD0iMC41IiBmaWxsPSIjNjY2Ii8+CjxyZWN0IHg9IjEwIiB5PSIxNiIgd2lkdGg9IjQiIGhlaWdodD0iMiIgcng9IjEiIHN0cm9rZT0iIzY2NiIgc3Ryb2tlLXdpZHRoPSIxLjUiIGZpbGw9IiNmZmYiLz4KPHJlY3QgeD0iMTEiIHk9IjE3IiB3aWR0aD0iMiIgaGVpZ2h0PSIxIiByeD0iMC41IiBmaWxsPSIjNjY2Ii8+CjxjaXJjbGUgY3g9IjE4IiBjeT0iMTkiIHI9IjEuNSIgZmlsbD0iIzAwZmYwMCIvPgo8Y2lyY2xlIGN4PSIxOCIgY3k9IjE5IiByPSIxIiBmaWxsPSIjZmZmIi8+Cjwvc3ZnPgo=" alt="Stampa" class="print-icon" onclick="printReato('reato-${index}')" title="Stampa solo questo reato" />
                </div>
                <div class="collapsible-content" id="content-reato-${index}">
                  <div class="reato-content">"${reato.content}"
                    <span class="document-reference">(${reato.sourceDocTitle || 'Verbale sequestro'}, pagina ${reato.sourceDocPage || 1}) ${new Date(reato.extractDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>

                  ${extracts.filter(m => m.parentReatoId === reato.id).map((motivazione, mIndex) => `
                    <div class="motivazione">
                      <div class="motivazione-title collapsible" onclick="toggleCollapsible('motivazione-${index}-${mIndex}')">
                        <span class="toggle-icon" id="icon-motivazione-${index}-${mIndex}">▼</span>
                        Motivazione: ${motivazione.title}
                      </div>
                      <div class="collapsible-content" id="content-motivazione-${index}-${mIndex}">
                        <div class="motivazione-content">"${motivazione.content}"
                          <span class="document-reference">(${motivazione.sourceDocTitle || 'Interrogatorio'}, pagina ${motivazione.sourceDocPage || 2}) ${new Date(motivazione.extractDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>

                        ${extracts.filter(c => c.parentMotivazioneId === motivazione.id).map((contromotivazione, cIndex) => `
                          <div class="contromotivazione">
                            <div class="contromotivazione-title collapsible" onclick="toggleCollapsible('contromotivazione-${index}-${mIndex}-${cIndex}')">
                              <span class="toggle-icon" id="icon-contromotivazione-${index}-${mIndex}-${cIndex}">▼</span>
                              Contromotivazione: ${contromotivazione.title}
                            </div>
                            <div class="collapsible-content" id="content-contromotivazione-${index}-${mIndex}-${cIndex}">
                              <div class="contromotivazione-content">"${contromotivazione.content}"
                                <span class="document-reference">(${contromotivazione.sourceDocTitle || 'Contratto'}, pagina ${contromotivazione.sourceDocPage || 3}) ${new Date(contromotivazione.extractDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                              </div>

                              <div class="analyst-notes">
                                <div class="analyst-notes-label">Note Analista:</div>
                                <div class="editable-notes" contenteditable="true" data-notes-type="analyst" data-contromotivazione-id="${contromotivazione.id}">${contromotivazione.notesAnalyst || ''}</div>
                              </div>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  `).join('')}

                  <div class="difesa-strategia">
                    <div class="difesa-strategia-title">🛡️ Difesa</div>
                    <div class="editable-notes" contenteditable="true" data-notes-type="difesa" data-reato-id="${reato.id}">${reato.notesDefense || ''}</div>
                  </div>

                  <div class="difesa-strategia">
                    <div class="strategia-title">⏰ Strategia</div>
                    <div class="editable-notes" contenteditable="true" data-notes-type="strategia" data-reato-id="${reato.id}">${reato.notesStrategy || ''}</div>
                  </div>
                </div>
              </div>
            `).join('')}

            ${extracts.filter(e => e.type === 'prova').length > 0 ? `
              <div class="prove-section">
                <div class="prove-title">PROVE</div>
                ${extracts.filter(e => e.type === 'prova').map(prova => `
                  <div class="prova">
                    <div class="prova-title">${prova.title}</div>
                    <div class="prova-content">"${prova.content}"
                      <span class="document-reference">(${prova.sourceDocTitle || 'Documento probatorio'}, pagina ${prova.sourceDocPage || 4}) ${new Date(prova.extractDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    ${prova.notesDefense ? `<div class="difesa-strategia-content"><strong>Difesa:</strong> ${prova.notesDefense}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${extracts.filter(e => e.type === 'testimonianza').length > 0 ? `
              <div class="testimonianze-section">
                <div class="testimonianze-title">TESTIMONIANZE</div>
                ${extracts.filter(e => e.type === 'testimonianza').map(testimonianza => `
                  <div class="testimonianza">
                    <div class="testimonianza-title">${testimonianza.title}</div>
                    <div class="testimonianza-content">"${testimonianza.content}"
                      <span class="document-reference">(${testimonianza.sourceDocTitle || 'Verbale testimonianza'}, pagina ${testimonianza.sourceDocPage || 5}) ${new Date(testimonianza.extractDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    ${testimonianza.notesDefense ? `<div class="difesa-strategia-content"><strong>Difesa:</strong> ${testimonianza.notesDefense}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </body>
          <script>
            function toggleCollapsible(id) {
              const content = document.getElementById('content-' + id);
              const icon = document.getElementById('icon-' + id);

              if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                icon.textContent = '▼';
              } else {
                content.classList.add('collapsed');
                icon.textContent = '▶';
              }
            }

            function printDocument() {
              // Stampa tutto il documento
              window.print();
            }

            function printReato(reatoId) {
              // Nascondi tutto tranne il reato specifico e i suoi figli
              const allReati = document.querySelectorAll('.reato');
              const targetReato = document.getElementById('content-' + reatoId).closest('.reato');

              allReati.forEach(reato => {
                if (reato === targetReato) {
                  reato.style.display = 'block';
                } else {
                  reato.style.display = 'none';
                }
              });

              // Nascondi altre sezioni (prove, testimonianze)
              const proveSection = document.querySelector('.prove-section');
              const testimonianzeSection = document.querySelector('.testimonianze-section');
              if (proveSection) proveSection.style.display = 'none';
              if (testimonianzeSection) testimonianzeSection.style.display = 'none';

              // Nascondi header e mostra solo il titolo del reato
              document.querySelector('.header').style.display = 'none';

              // Stampa
              window.print();

              // Ripristina tutto dopo la stampa
              setTimeout(() => {
                allReati.forEach(reato => {
                  reato.style.display = 'block';
                });
                if (proveSection) proveSection.style.display = 'block';
                if (testimonianzeSection) testimonianzeSection.style.display = 'block';
                document.querySelector('.header').style.display = 'flex';
              }, 1000);
            }

            function selezionaTutti() {
              const checkboxes = document.querySelectorAll('.reato-checkbox');
              checkboxes.forEach(checkbox => {
                checkbox.checked = true;
              });
              updateDocumentTypeLabel();
            }

            function deselezionaTutti() {
              const checkboxes = document.querySelectorAll('.reato-checkbox');
              checkboxes.forEach(checkbox => {
                checkbox.checked = false;
              });
              updateDocumentTypeLabel();
            }

            function stampaPDF() {
              const toggleButton = document.getElementById('toggleButton');
              const soloSelezionati = toggleButton.textContent === 'Solo Selezionati';

              if (soloSelezionati) {
                // Nascondi reati non selezionati
                const checkboxes = document.querySelectorAll('.reato-checkbox');
                checkboxes.forEach(checkbox => {
                  const reatoElement = checkbox.closest('.reato');
                  if (!checkbox.checked) {
                    reatoElement.style.display = 'none';
                  }
                });

                // Stampa
                window.print();

                // Ripristina tutto
                setTimeout(() => {
                  checkboxes.forEach(checkbox => {
                    const reatoElement = checkbox.closest('.reato');
                    reatoElement.style.display = 'block';
                  });
                }, 1000);
              } else {
                // Stampa tutto il documento
                window.print();
              }
            }

            function stampaWord() {
              const toggleButton = document.getElementById('toggleButton');
              const soloSelezionati = toggleButton.textContent === 'Solo Selezionati';
              let content = '';

              if (soloSelezionati) {
                // Crea contenuto solo con reati selezionati
                const checkboxes = document.querySelectorAll('.reato-checkbox:checked');
                const selectedReati = Array.from(checkboxes).map(checkbox =>
                  checkbox.closest('.reato').outerHTML
                ).join('');

                content = \`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <title>Memoria Difensiva Parziale</title>
                      <style>
                        body { font-family: Arial, sans-serif; margin: 40px; }
                        .header { text-align: center; margin-bottom: 30px; }
                        .reato { margin: 25px 0; padding: 15px; border-left: 4px solid #dc2626; }
                      </style>
                    </head>
                    <body>
                      <div class="header">
                        <h1>MEMORIA DIFENSIVA PARZIALE PER: ${clienteNome}</h1>
                        <p>Generata il: ${new Date().toLocaleDateString('it-IT')}</p>
                      </div>
                      \${selectedReati}
                    </body>
                  </html>
                \`;
              } else {
                content = document.documentElement.outerHTML;
              }

              // Scarica come file Word
              const blob = new Blob([content], { type: 'application/msword' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = \`memoria-difensiva-\${soloSelezionati ? 'selezionati' : 'completo'}.doc\`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }

            function toggleStampaMode() {
              const toggleButton = document.getElementById('toggleButton');
              const isSoloSelezionati = toggleButton.textContent === 'Solo Selezionati';

              if (isSoloSelezionati) {
                toggleButton.textContent = 'Tutti';
                toggleButton.classList.remove('active');
              } else {
                toggleButton.textContent = 'Solo Selezionati';
                toggleButton.classList.add('active');
              }
            }

            function updateDocumentTypeLabel() {
              const checkboxes = document.querySelectorAll('.reato-checkbox');
              const checkedCount = document.querySelectorAll('.reato-checkbox:checked').length;
              const totalCount = checkboxes.length;
              const label = document.getElementById('documentTypeLabel');
              const stampaBlock = document.getElementById('stampaBlock');
              const tuttiButton = document.getElementById('tuttiButton');
              const nessunoButton = document.getElementById('nessunoButton');

              // Reset button states
              tuttiButton.classList.remove('tutti-active');
              nessunoButton.classList.remove('nessuno-active');

              if (checkedCount === totalCount) {
                label.textContent = 'COMPLETO';
                label.className = 'document-type-label completo';
                stampaBlock.classList.remove('hidden');
                tuttiButton.classList.add('tutti-active');
              } else if (checkedCount === 0) {
                label.textContent = 'NESSUNO';
                label.className = 'document-type-label nessuno';
                stampaBlock.classList.add('hidden');
                nessunoButton.classList.add('nessuno-active');
              } else {
                label.textContent = 'SELEZIONA';
                label.className = 'document-type-label selezione';
                stampaBlock.classList.remove('hidden');
              }
            }

            // Inizializza tutto espanso
            document.addEventListener('DOMContentLoaded', function() {
              const allContents = document.querySelectorAll('.collapsible-content');
              allContents.forEach(content => {
                content.classList.remove('collapsed');
              });

              // Aggiungi listener alle checkbox
              const checkboxes = document.querySelectorAll('.reato-checkbox');
              checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', updateDocumentTypeLabel);
              });

              // Inizializza etichetta documento
              updateDocumentTypeLabel();
            });
          </script>
        </html>
      `

            setGeneratedDocument(htmlContent)
            console.log('✅ [DefenseMemoryViewer] Documento generato con successo!')

        } catch (error) {
            console.error('❌ [DefenseMemoryViewer] Errore nella generazione:', error)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleDownloadPDF = () => {
        if (generatedDocument) {
            // Per ora scarica come HTML, poi implementeremo PDF
            const blob = new Blob([generatedDocument], { type: 'text/html' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `Memoria-Difensiva-${clienteNome}-${new Date().toISOString().split('T')[0]}.html`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }
    }

    return (
        <div className="p-6 space-y-6 bg-white min-h-screen">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <span className="text-2xl">🛡️</span>
                        <span>Memoria Difensiva - {clienteNome}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div className="bg-red-50 p-3 rounded">
                                <div className="font-semibold text-red-700">Reati</div>
                                <div className="text-2xl font-bold text-red-600">
                                    {extracts.filter(e => e.type === 'reato').length}
                                </div>
                            </div>
                            <div className="bg-blue-50 p-3 rounded">
                                <div className="font-semibold text-blue-700">Motivazioni</div>
                                <div className="text-2xl font-bold text-blue-600">
                                    {extracts.filter(e => e.type === 'motivazione').length}
                                </div>
                            </div>
                            <div className="bg-green-50 p-3 rounded">
                                <div className="font-semibold text-green-700">Contromotivazioni</div>
                                <div className="text-2xl font-bold text-green-600">
                                    {extracts.filter(e => e.type === 'contromotivazione').length}
                                </div>
                            </div>
                            <div className="bg-purple-50 p-3 rounded">
                                <div className="font-semibold text-purple-700">Prove</div>
                                <div className="text-2xl font-bold text-purple-600">
                                    {extracts.filter(e => e.type === 'prova').length}
                                </div>
                            </div>
                            <div className="bg-orange-50 p-3 rounded">
                                <div className="font-semibold text-orange-700">Testimonianze</div>
                                <div className="text-2xl font-bold text-orange-600">
                                    {extracts.filter(e => e.type === 'testimonianza').length}
                                </div>
                            </div>
                        </div>

                        <div className="flex space-x-4">
                            <Button
                                onClick={handleGenerateDocument}
                                disabled={isGenerating || extracts.length === 0}
                                className="flex items-center space-x-2"
                            >
                                <FileText size={16} />
                                <span>{isGenerating ? 'Generando...' : 'Genera Documento'}</span>
                            </Button>

                            {generatedDocument && (
                                <Button
                                    onClick={handleDownloadPDF}
                                    variant="outline"
                                    className="flex items-center space-x-2"
                                >
                                    <Download size={16} />
                                    <span>Scarica PDF</span>
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {generatedDocument && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <Eye size={20} />
                            <span>Anteprima Documento</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-lg overflow-hidden">
                            <iframe
                                srcDoc={generatedDocument}
                                className="w-full h-[1200px]"
                                title="Anteprima Memoria Difensiva"
                            />
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
