// Shared API key — persisted in localStorage, readable everywhere
const LS_KEY = 'ldb_anthropic_key'
import { create } from 'zustand'

export const useApiKeyStore = create((set) => ({
  apiKey: localStorage.getItem(LS_KEY) || '',
  setApiKey: (key) => {
    const trimmed = key.trim()
    if (trimmed) localStorage.setItem(LS_KEY, trimmed)
    else localStorage.removeItem(LS_KEY)
    set({ apiKey: trimmed })
  },
}))
