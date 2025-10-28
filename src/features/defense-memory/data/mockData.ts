import { Estratto } from '@/types'

export interface MockExtractData {
    id: string
    type: 'reato' | 'motivazione' | 'contromotivazione' | 'prova' | 'testimonianza' | 'altro'
    title: string
    content: string
    extractDate: string
    parentReatoId?: string
    parentMotivazioneId?: string
    notesAnalyst?: string
    notesDescription?: string
    notesStrategy?: string
    notesDefense?: string
    sourceDocId?: string
    sourceDocTitle?: string
    sourceDocPage?: number
    bbox?: { x: number; y: number; width: number; height: number }
}

export const MOCK_EXTRACTS: MockExtractData[] = [
    // REATI
    {
        id: 'mock-reato-1',
        type: 'reato',
        title: 'Estorsione',
        content: 'Il soggetto ha estorto denaro mediante minacce gravi e violenza morale, costringendo la vittima a consegnare una somma di €5.000. Le minacce erano rivolte anche ai familiari della vittima.',
        extractDate: '2024-01-15',
        notesAnalyst: 'Reato principale contestato - elemento oggettivo e soggettivo presenti',
        notesDescription: 'Estorsione mediante minacce gravi',
        notesStrategy: 'Difesa: mancanza di elementi costitutivi del reato',
        notesDefense: 'Non sussistono le condizioni per la configurazione del reato di estorsione. Le minacce non erano sufficientemente gravi.',
        sourceDocId: 'doc-1',
        sourceDocTitle: 'Verbale sequestro',
        sourceDocPage: 1,
        bbox: { x: 100, y: 200, width: 300, height: 50 }
    },
    {
        id: 'mock-reato-2',
        type: 'reato',
        title: 'Truffa',
        content: 'Il soggetto ha indotto in errore la vittima mediante false dichiarazioni, facendole firmare un contratto svantaggioso per un valore di €10.000.',
        extractDate: '2024-01-20',
        notesAnalyst: 'Secondo reato contestato - truffa mediante raggiri',
        notesDescription: 'Truffa mediante false dichiarazioni contrattuali',
        notesStrategy: 'Difesa: buona fede del convenuto e mancanza di dolo',
        notesDefense: 'Il convenuto agiva in buona fede senza dolo specifico. Le dichiarazioni erano basate su informazioni errate ricevute.',
        sourceDocId: 'doc-2',
        sourceDocTitle: 'Contratto commerciale',
        sourceDocPage: 2,
        bbox: { x: 150, y: 300, width: 400, height: 80 }
    },

    // MOTIVAZIONI per Estorsione
    {
        id: 'mock-motivazione-1',
        type: 'motivazione',
        parentReatoId: 'mock-reato-1',
        title: 'Minacce gravi e specifiche',
        content: 'Le minacce erano di tale gravità da determinare nella vittima un timore fondato per la propria incolumità e quella dei propri familiari.',
        extractDate: '2024-01-16',
        notesAnalyst: 'Elemento soggettivo del reato - timore nella vittima',
        notesDescription: 'Minacce rivolte alla persona e ai familiari',
        notesStrategy: 'Contestare la gravità e specificità delle minacce',
        notesDefense: 'Le minacce non erano sufficientemente gravi e specifiche da determinare un timore fondato.',
        sourceDocId: 'doc-1',
        sourceDocTitle: 'Interrogatorio',
        sourceDocPage: 2,
        bbox: { x: 120, y: 250, width: 280, height: 40 }
    },
    {
        id: 'mock-motivazione-2',
        type: 'motivazione',
        parentReatoId: 'mock-reato-1',
        title: 'Violenza morale esercitata',
        content: 'La violenza morale esercitata ha determinato nella vittima uno stato di soggezione psicologica che l\'ha indotta a consegnare il denaro.',
        extractDate: '2024-01-17',
        notesAnalyst: 'Elemento oggettivo - violenza morale',
        notesDescription: 'Pressione psicologica sulla vittima',
        notesStrategy: 'Dimostrare assenza di violenza morale effettiva',
        notesDefense: 'Non vi è stata alcuna violenza morale. La vittima ha agito liberamente.',
        sourceDocId: 'doc-1',
        sourceDocTitle: 'Interrogatorio',
        sourceDocPage: 3,
        bbox: { x: 100, y: 300, width: 300, height: 60 }
    },

    // CONTROMOTIVAZIONI per Motivazione 1
    {
        id: 'mock-contromotivazione-1',
        type: 'contromotivazione',
        parentMotivazioneId: 'mock-motivazione-1',
        title: 'Minacce generiche e non specifiche',
        content: 'Le minacce erano generiche e non specifiche, non rivolte a persone determinate e non accompagnate da comportamenti concreti.',
        extractDate: '2024-01-18',
        notesAnalyst: 'Controprova - genericità delle minacce',
        notesDescription: 'Minacce troppo vaghe per costituire reato',
        notesStrategy: 'Evidenziare la genericità e mancanza di specificità',
        notesDefense: 'Le minacce erano troppo vaghe e generiche per costituire elemento costitutivo del reato.',
        sourceDocId: 'doc-3',
        sourceDocTitle: 'Contratto',
        sourceDocPage: 3,
        bbox: { x: 200, y: 150, width: 250, height: 45 }
    },
    {
        id: 'mock-contromotivazione-2',
        type: 'contromotivazione',
        parentMotivazioneId: 'mock-motivazione-1',
        title: 'Mancanza di timore effettivo',
        content: 'La vittima non ha dimostrato di aver provato un timore effettivo e fondato per la propria incolumità.',
        extractDate: '2024-01-19',
        notesAnalyst: 'Elemento psicologico - assenza di timore',
        notesDescription: 'Vittima non ha provato timore reale',
        notesStrategy: 'Dimostrare assenza di timore effettivo',
        notesDefense: 'La vittima non ha provato timore effettivo e fondato per la propria incolumità.',
        sourceDocId: 'doc-3',
        sourceDocTitle: 'Contratto',
        sourceDocPage: 4,
        bbox: { x: 180, y: 200, width: 270, height: 50 }
    },

    // PROVE
    {
        id: 'mock-prova-1',
        type: 'prova',
        title: 'Testimonianza della vittima',
        content: 'La vittima ha dichiarato di aver subito pressioni psicologiche e minacce che l\'hanno indotta a consegnare il denaro contro la sua volontà.',
        extractDate: '2024-01-21',
        notesAnalyst: 'Prova testimoniale principale',
        notesDescription: 'Dichiarazioni della vittima',
        notesStrategy: 'Contestare credibilità e coerenza della testimonianza',
        notesDefense: 'La testimonianza della vittima è contraddittoria e poco credibile.',
        sourceDocId: 'doc-4',
        sourceDocTitle: 'Documento probatorio',
        sourceDocPage: 4,
        bbox: { x: 100, y: 100, width: 350, height: 70 }
    },
    {
        id: 'mock-prova-2',
        type: 'prova',
        title: 'Intercettazioni telefoniche',
        content: 'Dalle intercettazioni telefoniche emerge che il soggetto ha discusso con terzi riguardo alla necessità di "convincere" la vittima.',
        extractDate: '2024-01-22',
        notesAnalyst: 'Prova documentale - intercettazioni',
        notesDescription: 'Conversazioni telefoniche intercettate',
        notesStrategy: 'Contestare validità e interpretazione delle intercettazioni',
        notesDefense: 'Le intercettazioni sono state ottenute in violazione della legge e la loro interpretazione è forzata.',
        sourceDocId: 'doc-5',
        sourceDocTitle: 'Documento probatorio',
        sourceDocPage: 5,
        bbox: { x: 150, y: 180, width: 300, height: 60 }
    },

    // TESTIMONIANZE
    {
        id: 'mock-testimonianza-1',
        type: 'testimonianza',
        title: 'Testimone oculare',
        content: 'Il testimone ha visto il soggetto avvicinarsi alla vittima in modo minaccioso e ha sentito parole che potevano essere interpretate come minacce.',
        extractDate: '2024-01-23',
        notesAnalyst: 'Testimonianza diretta di un terzo',
        notesDescription: 'Testimone presente al fatto',
        notesStrategy: 'Contestare attendibilità e precisione del testimone',
        notesDefense: 'Il testimone non è attendibile per precedenti penali e la sua testimonianza è imprecisa.',
        sourceDocId: 'doc-6',
        sourceDocTitle: 'Verbale testimonianza',
        sourceDocPage: 5,
        bbox: { x: 120, y: 220, width: 320, height: 55 }
    }
]

// Funzione per convertire mock data in formato Estratto
export const convertMockToEstratto = (mock: MockExtractData, praticaId: string, clienteId: string): Estratto => {
    return {
        id: mock.id,
        praticaId,
        clienteId,
        type: mock.type,
        title: mock.title,
        content: mock.content,
        extractDate: new Date(mock.extractDate),
        parentReatoId: mock.parentReatoId,
        parentMotivazioneId: mock.parentMotivazioneId,
        notesAnalyst: mock.notesAnalyst,
        notesDescription: mock.notesDescription,
        notesStrategy: mock.notesStrategy,
        notesDefense: mock.notesDefense,
        sourceDocId: mock.sourceDocId,
        sourceDocTitle: mock.sourceDocTitle,
        sourceDocPage: mock.sourceDocPage,
        bbox: mock.bbox,
        analystId: 'mock-analyst',
        createdAt: new Date(),
        updatedAt: new Date()
    }
}

// Funzione per generare estratti mock per una pratica
export const generateMockExtractsForPratica = (praticaId: string, clienteId: string): Estratto[] => {
    return MOCK_EXTRACTS.map(mock => convertMockToEstratto(mock, praticaId, clienteId))
}
