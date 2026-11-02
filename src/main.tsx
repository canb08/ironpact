import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import bigShouldersLatin from '@fontsource-variable/big-shoulders/files/big-shoulders-latin-opsz-normal.woff2';
import interTightLatin from '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2';
import App from './App.tsx';
import './ui/tokens.css';

// The two self-hosted Latin fonts share their URLs with tokens.css and the precache.
for (const href of [bigShouldersLatin, interTightLatin]) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'font';
  link.type = 'font/woff2';
  link.crossOrigin = 'anonymous';
  link.href = href;
  document.head.appendChild(link);
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
