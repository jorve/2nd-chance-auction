// Shared API key — persisted in localStorage, readable everywhere
import { create } from 'zustand'

const LS_KEY = 'ldb_anthropic_key'

function readKeySafe() {
  try {
    return localStorage.getItem(LS_KEY) || ''
  } catch {
    return ''
  }
}

function writeKeySafe(trimmed) {
  try {
    if (trimmed) localStorage.setItem(LS_KEY, trimmed)
    else localStorage.removeItem(LS_KEY)
  } catch {
    /* quota / private mode / disabled storage */
  }
}

export const useApiKeyStore = create((set) => ({
  apiKey: readKeySafe(),
  setApiKey: (key) => {
    const trimmed = key.trim()
    writeKeySafe(trimmed)
    set({ apiKey: trimmed })
  },
}))
