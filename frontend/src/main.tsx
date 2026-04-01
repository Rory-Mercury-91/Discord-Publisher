// main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/tauri-api'; 
import { AdminViewProvider } from './state/adminViewContext'; // Importe le nouveau context

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminViewProvider> {/* Enveloppe ici */}
      <App />
    </AdminViewProvider>
  </React.StrictMode>
);