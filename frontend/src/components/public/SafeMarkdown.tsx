import { Link } from 'react-router-dom'

// Só dois padrões inline são reconhecidos de propósito: **negrito** e [texto](url).
// Links externos ficam restritos a http(s) — qualquer outro esquema vira texto puro.
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g

function inline(text: string) {
  const parts = []
  let cursor = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index))
    if (match[3] !== undefined) parts.push(<strong key={match.index}>{match[3]}</strong>)
    else if (match[2].startsWith('/')) parts.push(<Link key={match.index} to={match[2]}>{match[1]}</Link>)
    else if (/^https?:\/\//i.test(match[2])) parts.push(<a key={match.index} href={match[2]} target="_blank" rel="noreferrer">{match[1]}</a>)
    else parts.push(match[1])
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

export default function SafeMarkdown({ content = '' }) {
  const blocks = content.replace(/\r/g, '').split(/\n{2,}/).filter(Boolean)
  return (
    <div className="article-content">
      {blocks.map((block, index) => {
        if (block.startsWith('### ')) return <h3 key={index}>{inline(block.slice(4))}</h3>
        if (block.startsWith('## ')) return <h2 key={index}>{inline(block.slice(3))}</h2>
        if (block.startsWith('# ')) return <h2 key={index}>{inline(block.slice(2))}</h2>
        if (block.startsWith('> ')) return <blockquote key={index}>{inline(block.slice(2))}</blockquote>
        if (block.split('\n').every((line) => line.startsWith('- '))) return <ul key={index}>{block.split('\n').map((line, i) => <li key={i}>{inline(line.slice(2))}</li>)}</ul>
        return <p key={index}>{block.split('\n').map((line, i) => <span key={i}>{inline(line)}{i < block.split('\n').length - 1 && <br />}</span>)}</p>
      })}
    </div>
  )
}
