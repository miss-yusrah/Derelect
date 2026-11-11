import React from 'react'
import ReactDOM from 'react-dom/client'
// Latin subsets only: the interface text needs no other scripts.
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles.css'
import { App } from './App'
import { installPopupGuard } from './lib/popupGuard'
import stationArt from './assets/station-illustration.webp'

installPopupGuard()

// Fetch the station art while the wallet session and chain reads resolve.
const preload = document.createElement('link')
preload.rel = 'preload'
preload.as = 'image'
preload.href = stationArt
document.head.append(preload)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
