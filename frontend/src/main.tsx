import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/tauri-api'; // Charge l'API Tauri

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
