/**
 * Minimal API server for player notes.
 * Reads/writes data/player_notes.json (manual_notes section).
 * Run: node server/index.js (typically alongside Vite via npm run dev)
 */
const fs = require('fs')
const path = require('path')
const express = require('express')

const NOTES_PATH = path.join(__dirname, '..', 'data', 'player_notes.json')

function norm(name) {
  if (!name || typeof name !== 'string') return ''
  let s = name.toLowerCase().trim()
  s = s.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o')
  s = s.replace(/ú/g, 'u').replace(/ü/g, 'u').replace(/ñ/g, 'n').replace(/ö/g, 'o')
  s = s.replace(/\./g, '').replace(/-/g, ' ').replace(/'/g, '').replace(/`/g, '')
  for (const suf of [' jr', ' sr', ' iii', ' iv', ' ii']) {
    if (s.endsWith(suf)) s = s.slice(0, -suf.length)
  }
  return s.replace(/\s+/g, ' ').trim()
}

function loadNotes() {
  if (!fs.existsSync(NOTES_PATH)) {
    return { _readme: {}, players: [], manual_notes: {} }
  }
  const raw = fs.readFileSync(NOTES_PATH, 'utf-8')
  const data = JSON.parse(raw)
  if (!data.manual_notes || typeof data.manual_notes !== 'object') {
    data.manual_notes = {}
  }
  return data
}

function saveNotes(data) {
  const dir = path.dirname(NOTES_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(NOTES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

const app = express()
app.use(express.json())

// CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// GET /api/player-notes — returns manual_notes only (for UI merge)
app.get('/api/player-notes', (req, res) => {
  try {
    const data = loadNotes()
    res.json({ manual_notes: data.manual_notes || {} })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/player-notes — add or update a manual note
app.put('/api/player-notes', (req, res) => {
  try {
    const { name, note } = req.body
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' })
    }
    const key = norm(name)
    if (!key) return res.status(400).json({ error: 'invalid name' })

    const data = loadNotes()
    if (!note || String(note).trim() === '') {
      delete data.manual_notes[key]
    } else {
      data.manual_notes[key] = String(note).trim()
    }
    saveNotes(data)
    res.json({ ok: true, manual_notes: data.manual_notes })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/player-notes — remove manual note for a player
app.delete('/api/player-notes', (req, res) => {
  try {
    const name = req.query.name || req.body?.name
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' })
    }
    const key = norm(name)
    const data = loadNotes()
    delete data.manual_notes[key]
    saveNotes(data)
    res.json({ ok: true, manual_notes: data.manual_notes })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PLAYER_NOTES_PORT || 3001
app.listen(PORT, () => {
  console.log(`Player notes API at http://localhost:${PORT}/api`)
})
