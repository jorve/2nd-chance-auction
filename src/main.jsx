import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import RootErrorBoundary from './RootErrorBoundary.jsx'
import './index.css'

const el = document.getElementById('root')
if (!el) {
  document.body.innerHTML = '<p style="font-family:monospace;padding:24px">Missing #root</p>'
} else {
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  )
}
