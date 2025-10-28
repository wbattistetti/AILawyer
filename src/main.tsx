import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { generateMockExtractsForPratica } from './features/defense-memory/data/mockData';

// Inizializza memoria globale per estratti temporanei
if (!(window as any).__pendingExtracts) {
  // Carica mock data per test
  const mockExtracts = generateMockExtractsForPratica('test-pratica', 'test-cliente')
    ; (window as any).__pendingExtracts = mockExtracts
  console.log('🎭 [MOCK] Mock data caricati globalmente:', mockExtracts.length)
  console.log('🎭 [MOCK] Reati mock:', mockExtracts.filter(e => e.type === 'reato').length)
  console.log('🎭 [MOCK] Motivazioni mock:', mockExtracts.filter(e => e.type === 'motivazione').length)
  console.log('🎭 [MOCK] Contromotivazioni mock:', mockExtracts.filter(e => e.type === 'contromotivazione').length)
  console.log('🎭 [MOCK] Prove mock:', mockExtracts.filter(e => e.type === 'prova').length)
  console.log('🎭 [MOCK] Testimonianze mock:', mockExtracts.filter(e => e.type === 'testimonianza').length)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
