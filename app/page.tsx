'use client'

import { useEffect, useState } from 'react'
import compose from './compose.module.css'

type LeadStatus = 'New' | 'Email found' | 'Drafted' | 'Sent' | 'Replied' | 'Follow-up needed' | 'Closed'
type Lead = Record<string, string> & { id: string; status: LeadStatus; tags: string; notes: string; snoozedUntil: string; sentAt: string }
type Email = { subject: string; body: string }

const followUpAfterDays = 3
const heroLine = 'Find, write, send, and track - all in one place.'

function nameOf(lead: Lead, index: number) {
  return lead['First name, Last name'] || lead['Company name'] || `Lead ${index + 1}`
}

function hasPerson(lead: Lead) {
  return Boolean(lead['First name, Last name']?.trim())
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
}

function makeLead(raw: Record<string, string>, index: number): Lead {
  const email = raw.Email || raw.email || ''
  return { ...raw, id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, status: email ? 'Email found' : 'New', tags: raw.tags || '', notes: '', snoozedUntil: '', sentAt: '', Email: email }
}

function pasteLooksLikeCompanyLink(text: string) {
  const trimmed = text.trim()
  const leftover = trimmed.replace(/https?:\/\/[^\s]+/gi, '').trim()
  return /https?:\/\//i.test(trimmed) && leftover.length < 8
}

function dayKey(value: string) {
  return value.slice(0, 10)
}

function isToday(value: string) {
  return dayKey(value) === new Date().toISOString().slice(0, 10)
}

function daysSince(value: string) {
  const then = Date.parse(`${dayKey(value)}T00:00:00`)
  const now = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00`)
  return Math.round((now - then) / 86400000)
}

function sendStreak(leads: Lead[]) {
  const days = new Set(leads.filter(lead => lead.sentAt).map(lead => dayKey(lead.sentAt)))
  const cursor = new Date()
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export default function Home() {
  const [background, setBackground] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [emails, setEmails] = useState<Record<string, Email>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [findingEmail, setFindingEmail] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [parseLoading, setParseLoading] = useState(false)
  const [replyLoading, setReplyLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [typedHero, setTypedHero] = useState('')
  const [dailyGoal, setDailyGoal] = useState(5)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedHero(heroLine)
      return
    }

    let index = 0
    let timeout = window.setTimeout(function type() {
      index += 1
      setTypedHero(heroLine.slice(0, index))
      if (index < heroLine.length) timeout = window.setTimeout(type, 42)
    }, 420)

    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem('warmly-leads')
    const savedBackground = window.localStorage.getItem('warmly-background')
    const savedGoal = window.localStorage.getItem('warmly-goal')
    if (saved) setLeads(JSON.parse(saved))
    if (savedBackground) setBackground(savedBackground)
    if (savedGoal) setDailyGoal(Number(savedGoal) || 5)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('warmly-leads', JSON.stringify(leads))
    window.localStorage.setItem('warmly-background', background)
    window.localStorage.setItem('warmly-goal', String(dailyGoal))
  }, [leads, background, dailyGoal])

  useEffect(() => {
    setLeads(current => current.map(lead => {
      if (lead.status !== 'Sent' || !lead.sentAt || daysSince(lead.sentAt) < followUpAfterDays) return lead
      return { ...lead, status: 'Follow-up needed' }
    }))
  }, [leads.length])

  const selected = leads.find(lead => lead.id === selectedId) || null
  const sentToday = leads.filter(lead => lead.sentAt && isToday(lead.sentAt)).length
  const streak = sendStreak(leads)

  function updateLead(id: string, changes: Record<string, string>) {
    setLeads(current => current.map(lead => lead.id === id ? { ...lead, ...changes } : lead))
  }

  function replaceLeads(next: Lead[]) {
    setLeads(next)
    setSelectedId(next[0]?.id || null)
    setEmails({})
  }

  function clearLeads() {
    replaceLeads([])
    setError('')
  }

  function handleCSV(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = loadEvent => {
      const text = loadEvent.target?.result as string
      const rows = text.trim().split('\n')
      const headers = rows[0]?.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(value => value.replace(/"/g, '').trim()) || []
      const parsed = rows.slice(1).filter(Boolean).map((row, index) => {
        const values = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(value => value.replace(/"/g, '').trim()) || []
        const raw: Record<string, string> = {}
        headers.forEach((header, valueIndex) => { raw[header] = values[valueIndex] || '' })
        return makeLead(raw, index)
      })
      replaceLeads(parsed)
    }
    reader.readAsText(file)
  }

  async function parsePastedLeads() {
    setParseLoading(true)
    setError('')
    try {
      const endpoint = pasteLooksLikeCompanyLink(pasteText) ? '/api/discover' : '/api/parse'
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: pasteText }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to parse leads')
      const parsedLeads = (data.leads || []).map((lead: Record<string, string>, index: number) => makeLead(lead, index))
      replaceLeads(parsedLeads)
      const companyUrls = [...new Set(parsedLeads.map(lead => lead['Company URL']).filter(Boolean))]
      for (const url of companyUrls) {
        const alreadyEnriched = parsedLeads.some(lead => lead['Company URL'] === url && lead['Company One-Sentence Summary'])
        if (alreadyEnriched) continue
        const enrichResponse = await fetch('/api/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
        if (!enrichResponse.ok) continue
        const enrichment = await enrichResponse.json()
        setLeads(current => current.map(lead => lead['Company URL'] !== url ? lead : {
          ...lead,
          'Company name': enrichment.companyName || lead['Company name'] || '',
          'Company One-Sentence Summary': enrichment.summary || lead['Company One-Sentence Summary'] || '',
          'Growth Challenge': enrichment.challenge || lead['Growth Challenge'] || '',
          'Recent Company News': enrichment.news || lead['Recent Company News'] || '',
        }))
      }
      const unnamed = parsedLeads.filter(lead => !hasPerson(lead))
      const missingEmail = parsedLeads.filter(lead => hasPerson(lead) && !lead.Email?.trim())
      for (const lead of missingEmail) {
        await findEmail(lead)
      }
      if (unnamed.length && unnamed.length === parsedLeads.length) {
        setError('We found the company. Add a contact name (and email if you have it), then draft.')
      }
      setPasteText('')
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Unable to parse leads')
    } finally {
      setParseLoading(false)
    }
  }

  async function findEmail(lead: Lead) {
    const [firstName, ...rest] = (lead['First name, Last name'] || '').split(' ')
    if (!firstName || !rest.length) {
      setError('Add a first and last name before looking up an email.')
      return
    }
    setFindingEmail(current => ({ ...current, [lead.id]: true }))
    setError('')
    try {
      const response = await fetch('/api/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName: rest.join(' '),
          domain: lead['Company URL'] || '',
          company: lead['Company name'] || '',
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      updateLead(lead.id, {
        Email: data.email,
        status: 'Email found',
        'Company name': data.companyName || lead['Company name'] || '',
        'Company URL': data.companyUrl || lead['Company URL'] || '',
      })
      return data.email as string
    } catch (findError) {
      setError(findError instanceof Error ? findError.message : 'Unable to find email')
    } finally {
      setFindingEmail(current => ({ ...current, [lead.id]: false }))
    }
  }

  async function generateEmail(lead: Lead) {
    setSelectedId(lead.id)
    if (!hasPerson(lead)) {
      setError('Add a first and last name before drafting. A company URL alone is not a contact.')
      return
    }
    if (!background.trim()) {
      setError('Add your background so the draft can be personalized.')
      return
    }
    setLoading(current => ({ ...current, [lead.id]: true }))
    setError('')
    try {
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ background, followUp: lead.status === 'Follow-up needed', lead: { name: lead['First name, Last name'] || '', company: lead['Company name'] || '', title: lead.Title || '', summary: lead['Company One-Sentence Summary'] || '', challenge: lead['Growth Challenge'] || '', news: lead['Recent Company News'] || '' } }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to generate email')
      setEmails(current => ({ ...current, [lead.id]: data }))
      updateLead(lead.id, { status: 'Drafted' })
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Unable to generate email')
    } finally {
      setLoading(current => ({ ...current, [lead.id]: false }))
    }
  }

  async function checkReplies() {
    const sent = leads.filter(lead => lead.Email && (lead.status === 'Sent' || lead.status === 'Follow-up needed'))
    if (!sent.length) {
      setError('Send at least one email first, then check Gmail for replies.')
      return
    }
    setReplyLoading(true)
    setError('')
    try {
      const response = await fetch('/api/replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: sent.map(lead => ({ id: lead.id, email: lead.Email, sentAt: lead.sentAt })) }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (data.configured === false) {
          window.location.href = '/api/gmail/connect'
          return
        }
        throw new Error(data.error || 'Unable to check Gmail')
      }
      const ids = new Set(data.ids || [])
      if (!ids.size) {
        setError('No new replies in Gmail for sent leads.')
        return
      }
      setLeads(current => current.map(lead => ids.has(lead.id) ? { ...lead, status: 'Replied' } : lead))
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Unable to check Gmail')
    } finally {
      setReplyLoading(false)
    }
  }

  function sendEmail(lead: Lead) {
    const email = emails[lead.id]
    if (!email) return
    window.location.href = `mailto:${encodeURIComponent(lead.Email || '')}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`
    updateLead(lead.id, { status: 'Sent', sentAt: new Date().toISOString() })
  }

  function copyEmail() {
    if (!selected || !emails[selected.id]) return
    const email = emails[selected.id]
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function updateDraft(changes: Partial<Email>) {
    if (!selected) return
    setEmails(current => ({
      ...current,
      [selected.id]: {
        subject: current[selected.id]?.subject || '',
        body: current[selected.id]?.body || '',
        ...changes,
      },
    }))
  }

  const activeEmail = selected ? emails[selected.id] : null

  return (
    <main className="app-shell">
      <nav className="flow-nav" aria-label="Primary navigation">
        <div className="flow-brand">
          <span className="flow-mark" aria-hidden="true">
            <span className="flow-envelope"><span className="flow-seal">W</span></span>
          </span>
          Warmly
        </div>
        <div className="flow-links">
          <span className="goal-label">{sentToday}/{dailyGoal} sent · {streak}-day streak</span>
          <label className="goal-edit">Goal
            <input type="number" min="1" max="20" value={dailyGoal} onChange={event => setDailyGoal(Number(event.target.value) || 1)} />
          </label>
          <button className="flow-nav-cta" onClick={checkReplies} disabled={replyLoading}>{replyLoading ? 'Checking…' : 'Check replies'}</button>
        </div>
      </nav>

      <header className="hero-bar">
        <div className="hero-copy-wrap">
          <h1>Messy notes into cold outreach.</h1>
          <p className="hero-copy" aria-label={heroLine}>
            {typedHero}
            <span className="hero-cursor" aria-hidden="true">|</span>
          </p>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="lead-column">
          <div className="section-heading">
            <h2>{leads.length} lead{leads.length === 1 ? '' : 's'}</h2>
            {leads.length > 0 && <button className="outline-button" onClick={clearLeads}>Clear</button>}
          </div>
          <div className="import-panel">
            <label className="eyebrow" htmlFor="your-background">Your background</label>
            <textarea id="your-background" value={background} onChange={event => setBackground(event.target.value)} placeholder="Roles, strengths, and what you want them to know..." />
            <label className="eyebrow" htmlFor="quick-capture">Quick capture</label>
            <textarea id="quick-capture" value={pasteText} onChange={event => setPasteText(event.target.value)} placeholder="Paste a company URL to load people and emails, or paste names..." />
            <div className="import-actions">
              <button className="yellow-button" onClick={parsePastedLeads} disabled={!pasteText.trim() || parseLoading}>{parseLoading ? 'Organizing...' : 'Parse pasted leads'}</button>
              <label className="outline-button file-button">Upload CSV<input type="file" accept=".csv" onChange={handleCSV} /></label>
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="lead-list">
            {leads.length ? leads.map((lead, index) => (
              <button key={lead.id} className={`lead-row ${selectedId === lead.id ? 'selected' : ''}`} onClick={() => { setSelectedId(lead.id); if (hasPerson(lead) && background.trim() && !emails[lead.id]) generateEmail(lead) }}>
                <span className="avatar">{initials(nameOf(lead, index))}</span>
                <span className="lead-copy">
                  <strong>{nameOf(lead, index)}</strong>
                  <small>{lead.Email || lead['Company name'] || 'Company not listed'}{lead.Title ? ` · ${lead.Title}` : ''}</small>
                </span>
                <span className="lead-status">{loading[lead.id] ? 'Writing' : lead.status}</span>
              </button>
            )) : (
              <div className="empty-state">Your queue is clear. Paste names or upload a CSV.</div>
            )}
          </div>
        </div>

        <aside className="detail-column">
          {selected ? (
            <>
              <article className={compose.root}>
                <div className={compose.titlebar}>
                  <span className={compose.dots} aria-hidden="true">
                    <span className={`${compose.dot} ${compose.dotRed}`} />
                    <span className={`${compose.dot} ${compose.dotYellow}`} />
                    <span className={`${compose.dot} ${compose.dotGreen}`} />
                  </span>
                  New message
                </div>
                <div className={compose.row}>
                  <span className={compose.label}>To</span>
                  <div className={compose.to}>
                    <span className={compose.chip}>
                      <span className={compose.chipAvatar}>{initials(nameOf(selected, leads.indexOf(selected)))}</span>
                      <span className={compose.chipName}>{nameOf(selected, leads.indexOf(selected))}</span>
                    </span>
                    <span className={compose.address}>{selected.Email || 'name@company.com'}</span>
                    <button className={compose.find} type="button" onClick={() => findEmail(selected)} disabled={findingEmail[selected.id]}>
                      {findingEmail[selected.id] ? 'Finding…' : 'Find'}
                    </button>
                    <span className={compose.company}>{selected['Company name'] || ''}</span>
                  </div>
                </div>
                <div className={compose.row}>
                  <span className={compose.label}>Subject</span>
                  <input
                    className={compose.subject}
                    value={activeEmail?.subject || ''}
                    onChange={event => updateDraft({ subject: event.target.value })}
                    placeholder="Subject"
                  />
                </div>
                {loading[selected.id] ? (
                  <p className={compose.loading}>Writing…</p>
                ) : (
                  <textarea
                    className={compose.body}
                    value={activeEmail?.body || ''}
                    onChange={event => updateDraft({ body: event.target.value })}
                    placeholder="Write or generate a note…"
                  />
                )}
                <div className={compose.footer}>
                  <button className={compose.ghost} type="button" onClick={() => generateEmail(selected)}>New</button>
                  <div className={compose.actions}>
                    <button className={compose.ghost} type="button" onClick={() => generateEmail(selected)} disabled={loading[selected.id]}>
                      {loading[selected.id] ? 'Writing…' : 'Regenerate'}
                    </button>
                    <button className={compose.ghost} type="button" onClick={copyEmail} disabled={!activeEmail}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button className={compose.send} type="button" onClick={() => sendEmail(selected)} disabled={!activeEmail?.body}>
                      Send →
                    </button>
                  </div>
                </div>
              </article>
            </>
          ) : <div className="empty-detail">Select a lead to review its context and draft.</div>}
        </aside>
      </section>
    </main>
  )
}
