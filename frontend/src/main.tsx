import React from 'react'
import ReactDOM from 'react-dom/client'
import { ActivationGate } from '@chamber-19/desktop-toolkit/activation'
import { ToolkitThemeProvider } from '@chamber-19/desktop-toolkit/theme'
import App from './App'
import './styles/tokens.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToolkitThemeProvider storageKey="block-library.theme">
      <ActivationGate>
        <App />
      </ActivationGate>
    </ToolkitThemeProvider>
  </React.StrictMode>
)