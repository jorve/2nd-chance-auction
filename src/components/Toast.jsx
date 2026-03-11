import { create } from 'zustand'

const TOAST_DURATION = 2500

const useToastStore = create((set) => ({
  toasts: [],
  add: (msg, type = 'success') => {
    const id = Date.now() + Math.random()
    set(s => ({ toasts: [...s.toasts, { id, msg, type }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), TOAST_DURATION)
  },
}))

export function toast(msg, type = 'success') {
  useToastStore.getState().add(msg, type)
}

export function ToastProvider({ children }) {
  const toasts = useToastStore(s => s.toasts)

  return (
    <>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 5000, display: 'flex', flexDirection: 'column', gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(({ id, msg, type }) => (
          <div
            key={id}
            style={{
              background: type === 'success' ? 'rgba(74,222,128,.95)' : type === 'error' ? 'rgba(248,113,113,.95)' : 'var(--surface)',
              color: type === 'success' || type === 'error' ? '#0a0c10' : 'var(--text)',
              border: `1px solid ${type === 'success' ? 'rgba(74,222,128,.6)' : type === 'error' ? 'rgba(248,113,113,.6)' : 'var(--border)'}`,
              borderRadius: 8, padding: '10px 20px',
              fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600,
              boxShadow: '0 8px 24px rgba(0,0,0,.4)',
              animation: 'toastIn 0.25s ease-out',
            }}
          >
            {msg}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

