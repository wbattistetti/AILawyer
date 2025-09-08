# LegalFlow - MVP per Studi Legali Penali

Sistema di gestione documentale intelligente per studi legali penali con OCR automatico e classificazione dei documenti.

## 🚀 Caratteristiche Principali

- **Canvas Kanban**: Organizzazione visuale dei documenti in comparti specializzati per il penale
- **Upload Drag & Drop**: Caricamento semplificato di file multipli con supporto batch
- **OCR Intelligente**: Estrazione automatica del testo da PDF e immagini
- **Auto-classificazione**: Assegnazione automatica ai comparti basata su regole euristico-lessicali italiane
- **Gestione Asincrona**: Pipeline di elaborazione non bloccante con code Redis/BullMQ

## 🏗️ Architettura

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** per l'interfaccia
- **React Router** per la navigazione
- **React Hook Form** + **Zod** per la validazione

### Backend
- **Node.js** + **TypeScript** + **Fastify** (REST API)
- **Prisma** + **PostgreSQL** per il database
- **BullMQ** + **Redis** per le code di elaborazione
- **MinIO** (S3-compatibile) per lo storage dei file

### Servizi
- **OCR**: Tesseract.js (MVP) con interfaccia sostituibile
- **Classificazione**: Regole euristico-lessicali per documenti penali italiani
- **Storage**: MinIO per file binari, PostgreSQL per metadati

## 📋 Prerequisiti

- **Node.js** 18+ 
- **Docker** e **Docker Compose**
- **npm** o **yarn**

## 🛠️ Installazione e Setup

### 1. Clone del Repository
```bash
git clone <repository-url>
cd legal-practice-mvp
```

### 2. Installazione Dipendenze
```bash
# Frontend
npm install

# Backend
cd backend
npm install
cd ..
```

### 3. Configurazione Environment
```bash
# Copia i file di esempio
cp .env.example .env
cp backend/.env.example backend/.env

# Modifica i file .env con le tue configurazioni
```

### 4. Avvio Servizi Docker
```bash
# Avvia PostgreSQL, Redis e MinIO
docker-compose up -d

# Verifica che i servizi siano attivi
docker-compose ps
```

### 5. Setup Database
```bash
cd backend

# Genera il client Prisma
npm run db:generate

# Esegui le migrazioni
npm run db:migrate

# Popola il database con dati di esempio
npm run db:seed
```

## 🚀 Avvio dell'Applicazione

### Modalità Sviluppo

Apri 3 terminali separati:

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend API
npm run dev:backend

# Terminal 3: Worker per OCR
npm run dev:worker
```

L'applicazione sarà disponibile su:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

### Modalità Produzione

```bash
# Build frontend
npm run build

# Build backend
npm run build:backend

# Avvia in produzione
npm run start
```

## 📁 Struttura del Progetto

```
legal-practice-mvp/
├── src/                          # Frontend React
│   ├── components/               # Componenti UI modulari
│   │   ├── ui/                  # Componenti base (shadcn/ui)
│   │   ├── forms/               # Form components
│   │   ├── kanban/              # Componenti Kanban board
│   │   ├── layout/              # Layout components
│   │   ├── modals/              # Modal dialogs
│   │   ├── pages/               # Page components
│   │   ├── splash/              # Splash page
│   │   └── upload/              # Upload components
│   ├── hooks/                   # Custom React hooks
│   ├── lib/                     # Utilities e API client
│   └── types/                   # TypeScript type definitions
├── backend/                      # Backend Node.js
│   ├── src/
│   │   ├── config/              # Configurazione applicazione
│   │   ├── lib/                 # Database, storage, queue
│   │   ├── routes/              # API endpoints
│   │   ├── services/            # Business logic (OCR, classificazione)
│   │   ├── workers/             # BullMQ workers
│   │   ├── scripts/             # Script di utilità
│   │   └── types/               # TypeScript types
│   └── prisma/                  # Schema database e migrazioni
├── docker-compose.yml           # Servizi Docker
└── README.md
```

## 🎯 Comparti Penali Predefiniti

Il sistema include 10 comparti specializzati per il diritto penale:

1. **Da classificare** - Bucket di servizio per documenti non classificati
2. **Admin & Procure** - Procure alle liti, deleghe difensive
3. **Parti & Anagrafiche** - Documenti identità, fogli notizie
4. **Corrispondenza & PEC** - Comunicazioni, ricevute PEC
5. **Denuncia–Querela / Notizia di reato** - Atti introduttivi
6. **Indagini preliminari (PG/PM, 415-bis)** - Avvisi, sequestri, perquisizioni
7. **Perizie & Consulenze (CTP/CTU)** - Elaborati peritali
8. **Prove & Allegati** - Foto, audio, chat, supporti digitali
9. **Udienze & Verbali** - Verbali udienza, liste testi
10. **Provvedimenti del giudice** - Ordinanze, decreti, sentenze

## 🤖 Classificazione Automatica

Il sistema utilizza regole euristico-lessicali per classificare automaticamente i documenti:

- **Keyword matching** su testo estratto via OCR
- **Analisi filename** per contesto aggiuntivo
- **Boost per file multimediali** nel comparto "Prove & Allegati"
- **Soglie di confidenza** configurabili (default: 60% classificazione, 65% OCR)
- **Fallback intelligente** a "Da classificare" per bassa confidenza

### Tag Automatici
- 415-bis, cautelare, sequestro, perquisizione
- intercettazioni, dibattimento, provvedimento
- GIP, GUP, appello, cassazione, CTP, CTU, verbale, PEC

## 📊 Monitoraggio e Logging

- **Logging strutturato** per ogni fase del processo OCR
- **Progress tracking** per upload batch
- **Error handling** robusto senza blocco del sistema
- **Job status** visibile nell'interfaccia utente

## 🔧 Configurazione

### Variabili d'Ambiente Principali

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/legalflow

# Storage
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=legalflow-documents

# Soglie di qualità
OCR_CONFIDENCE_THRESHOLD=65
CLASSIFY_CONFIDENCE_THRESHOLD=60

# Limiti upload
MAX_UPLOAD_MB=50
MAX_FILES_PER_BATCH=50
```

## 🚧 Roadmap e Estensioni Future

### Immediate (fuori scope MVP)
- **Viewer con highlight** pagina → offset (già mappato)
- **Pannello regole** classificazione editabile
- **Switch OCR** a microservizio Python

### Medio termine
- **Ricerca full-text** nei documenti
- **Workflow approval** per documenti sensibili
- **Integrazione calendario** per scadenze
- **Export/Import** pratiche

### Lungo termine
- **AI/ML avanzato** per classificazione
- **OCR multilingua** e layout complessi
- **Integrazione PEC** diretta
- **Mobile app** per upload da smartphone

## 🐛 Troubleshooting

### Problemi Comuni

**Docker services non si avviano:**
```bash
docker-compose down
docker-compose up -d --force-recreate
```

**Errori di migrazione database:**
```bash
cd backend
npx prisma migrate reset
npm run db:seed
```

**Worker OCR non elabora:**
```bash
# Verifica Redis
docker-compose logs redis

# Riavvia worker
npm run dev:worker
```

**Upload fallisce:**
```bash
# Verifica MinIO
curl http://localhost:9000/minio/health/live

# Controlla logs
docker-compose logs minio
```

## 📝 Note di Sviluppo

- **File grandi**: Il sistema gestisce file fino a 50MB per default
- **Concorrenza OCR**: 2 job simultanei per evitare sovraccarico
- **Retry automatico**: 3 tentativi per job falliti con backoff esponenziale
- **Cleanup automatico**: Job completati rimossi dopo 100 successi/50 fallimenti

## 🤝 Contributi

Per contribuire al progetto:

1. Fork del repository
2. Crea un branch feature (`git checkout -b feature/amazing-feature`)
3. Commit delle modifiche (`git commit -m 'Add amazing feature'`)
4. Push al branch (`git push origin feature/amazing-feature`)
5. Apri una Pull Request

## 📄 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.

---

**LegalFlow** - Gestione documentale intelligente per l'avvocatura penale moderna.