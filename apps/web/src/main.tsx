import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles.css'
import { App } from './App'
import { installPopupGuard } from './lib/popupGuard'

installPopupGuard()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
