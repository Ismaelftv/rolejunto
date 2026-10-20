import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { I18nProvider } from './i18n';
import { StoreProvider } from './lib/store';
import { registerServiceWorker } from './lib/pwa';
import { initTheme } from './lib/theme';
import './styles.css';

// VITE_ROUTER=hash usa endereços com # (útil para prévias e para o app empacotado sem servidor).
const useHash = import.meta.env.VITE_ROUTER === 'hash';
const Router = ({ children }: { children: ReactNode }) =>
  useHash ? <HashRouter>{children}</HashRouter> : <BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>;

initTheme();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <I18nProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </I18nProvider>
    </Router>
  </StrictMode>,
);
