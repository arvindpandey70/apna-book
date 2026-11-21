import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Provider } from 'react-redux'
import {store} from './store/store.ts'

const originalFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  const apiBase = import.meta.env.VITE_API_URL || ''
  const isApi = (apiBase && url.startsWith(apiBase)) || url.startsWith('/api')
  if (!isApi) return originalFetch(input, init)

  const token = localStorage.getItem('token')
  if (!token) return originalFetch(input, init)

  const headers = new Headers(
    init?.headers || (input instanceof Request ? input.headers : undefined)
  )
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return originalFetch(input, { ...(init || {}), headers })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
    <App />
    </Provider>
  </StrictMode>,
)
