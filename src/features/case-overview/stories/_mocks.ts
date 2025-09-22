import type { CaseGraph } from '../types/graph'

export const baselineGraph: CaseGraph = {
  nodes: [
    { id:'proc', label:'Procedimento', kind:'CONTAINER', counts:{ items:0 } },
    { id:'reati', label:'Reati contestati', kind:'DOCUMENT', counts:{ items:0 } },
    { id:'procura', label:'Procura che procede', kind:'CONTAINER', counts:{ items:0 } },
    { id:'ufficioPG', label:'Ufficio PG', kind:'CONTAINER', counts:{ items:0 } },
    { id:'anagrafe', label:'Anagrafe entità', kind:'CONTAINER', counts:{ items:0 } },
    { id:'soggetto', label:'Soggetto centrale', kind:'CONTAINER', counts:{ items:0 } },
    { id:'incontri', label:'Incontri documentati', kind:'EVENT', counts:{ items:0 } },
    { id:'intercettazioni', label:'Intercettazioni', kind:'DOCUMENT', counts:{ items:0 } },
    { id:'contattiTel', label:'Contatti telefonici', kind:'EVENT', counts:{ items:0 } },
    { id:'elencoNomi', label:'Elenco nomi citati', kind:'DOCUMENT', counts:{ items:0 } },
    { id:'atti', label:'Atti ed eventi', kind:'CONTAINER', counts:{ items:0 } },
    { id:'misure', label:'Misure', kind:'MEASURE', counts:{ items:0 } },
    { id:'attiDifesa', label:'Atti difensivi', kind:'DOCUMENT', counts:{ items:0 } },
    { id:'termini', label:'Termini processuali', kind:'DOCUMENT', counts:{ items:0 } },
    { id:'custodia', label:'Catena di custodia', kind:'EVIDENCE', counts:{ items:0 } },
    { id:'elencoVerbali', label:'Elenco verbali redatti', kind:'DOCUMENT', counts:{ items:0 } },
    { id:'avvocati', label:'Avvocati nominati', kind:'CONTAINER', counts:{ items:0 } },
    { id:'verbaleArresto', label:'Verbale di arresto', kind:'DOCUMENT', counts:{ items:0 } },
    { id:'verbaleSequestro', label:'Verbale di sequestro', kind:'DOCUMENT', counts:{ items:0 } },
    { id:'timeline', label:'Timeline', kind:'TIMELINE', counts:{ items:0 } },
  ],
  edges: [
    { id:'e1', source:'proc', target:'soggetto' },
    { id:'e2', source:'soggetto', target:'atti' },
    { id:'e3', source:'atti', target:'misure' },
    { id:'e4', source:'atti', target:'attiDifesa' },
    { id:'e5', source:'atti', target:'termini' },
    { id:'e6', source:'atti', target:'custodia' },
    { id:'e7', source:'misure', target:'timeline' },
    { id:'e8', source:'termini', target:'timeline' },
    { id:'e9', source:'incontri', target:'timeline' },
    { id:'e10', source:'intercettazioni', target:'atti' },
    { id:'e11', source:'contattiTel', target:'intercettazioni' },
    { id:'e12', source:'procura', target:'proc' },
    { id:'e13', source:'ufficioPG', target:'proc' },
    { id:'e14', source:'reati', target:'proc' },
    { id:'e15', source:'elencoVerbali', target:'atti' },
    { id:'e16', source:'avvocati', target:'soggetto' },
    { id:'e17', source:'verbaleArresto', target:'misure' },
    { id:'e18', source:'verbaleSequestro', target:'misure' },
  ]
}


