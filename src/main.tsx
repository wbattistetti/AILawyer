import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Inizializza memoria globale per estratti temporanei
if (!(window as any).__pendingExtracts) {
  (window as any).__pendingExtracts = [];
  // Memoria estratti inizializzata
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
