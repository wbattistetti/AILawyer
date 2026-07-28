import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './pwa/registerServiceWorker';

// Inizializza memoria globale per estratti temporanei
if (!(window as any).__pendingExtracts) {
  (window as any).__pendingExtracts = [];
  // Memoria estratti inizializzata
}

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
