import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './monaco-env'
import App from './App'
import { ThemeProvider } from './components/theme/ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
