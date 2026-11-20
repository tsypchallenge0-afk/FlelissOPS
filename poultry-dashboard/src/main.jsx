import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { WSProvider } from './context/WSContext';
import { Toaster } from 'sonner';
import { isSuperAdminDomain } from './lib/tenant';
import SuperAdminApp from './SuperAdminApp';
// Self-hosted font (no Google Fonts request — works offline)
import '@fontsource-variable/urbanist';
import './styles/global.css';
// FXGate-style design layer: re-points the variables above and restyles shared classes. Must stay last.
import './styles/fxgate.css';


function RootApp() {
  if (isSuperAdminDomain()) {
    return <SuperAdminApp />;
  }

  // Optional: if there is no tenant slug in PROD, a landing page could be rendered here
  // (getCurrentTenantSlug() === null && import.meta.env.PROD).

  return (
    <ThemeProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-mid)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            letterSpacing: '0.04em',
          },
          classNames: {
            success: 'toast-success',
            error: 'toast-error',
            warning: 'toast-warning',
          }
        }}
        richColors
      />
      <AuthProvider>
        <WSProvider>
          <App />
        </WSProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
