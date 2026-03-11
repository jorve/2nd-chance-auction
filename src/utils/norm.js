/** Normalize player name for matching (must match generate_data.py norm) */
export function norm(name) {
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
