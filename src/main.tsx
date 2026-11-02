import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import bigShouldersLatin from '@fontsource-variable/big-shoulders/files/big-shoulders-latin-opsz-normal.woff2';
import interTightLatin from '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2';
import jetbrainsMonoLatin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2';
import App from './App.tsx';
import './ui/tokens.css';

// Big Shoulders (opsz) and Inter Tight are the spec preload pair. Mono is preloaded too so the three latin files share one URL with tokens.css.
for (const href of [bigShouldersLatin, interTightLatin, jetbrainsMonoLatin]) {
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
