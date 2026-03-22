import React from 'react'

/** Catches render errors so a blank screen becomes a readable stack trace. */
export default class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  componentDidCatch(err, info) {
    console.error('LDB root error:', err, info?.componentStack)
  }

  render() {
    const { err } = this.state
    if (err) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: 24,
            background: '#07090e',
            color: '#f87171',
            fontFamily: 'DM Mono, ui-monospace, monospace',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <h1 style={{ color: '#e2e8f4', fontSize: 18, marginBottom: 12 }}>Something broke</h1>
          <p style={{ color: '#9ba8c4', marginBottom: 16 }}>
            Copy the text below if you need to report this. Try clearing site data for this origin
            (especially <code style={{ color: '#c8f135' }}>localStorage</code> key{' '}
            <code style={{ color: '#c8f135' }}>ldb_auction_2026</code>) if the problem started after a
            long draft session.
          </p>
          <pre style={{ margin: 0, lineHeight: 1.45 }}>{String(err?.stack || err)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
