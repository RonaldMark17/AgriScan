import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';
import { VoiceProvider } from './context/VoiceContext.jsx';
import { registerServiceWorker } from './pwa/registerSW.js';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <VoiceProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </VoiceProvider>
    </I18nProvider>
  </React.StrictMode>
);

registerServiceWorker();
