'use client'
import { useState, useEffect } from 'react'

function TypedText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    if (!text) return
    setDisplayed('')
    let i = 0
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i))
      i++
      if (i > text.length) clearInterval(interval)
    }, 12)
    return () => clearInterval(interval)
  }, [text])

  return <span>{displayed}<span className="animate-pulse text-lime-400">|</span></span>
}

export default function Home() {
  const [apiKey, setApiKey] = useState('')
  const [background, setBackground] = useState('')
  const [leads, setLeads] = useState<Record<string, string>[]>([])
  const [emails, setEmails] = useState<Record<number, {subject: string, body: string}>>({})
  const [loading, setLoading] = useState<Record<number, boolean>>({})
  const [selected, setSelected] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event: ProgressEvent<FileReader>) => {
      const text = event.target?.result as string
      const rows = text.trim().split('\n')
      const headers = rows[0].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)
        ?.map(h => h.replace(/"/g, '').trim()) || []
      const parsed = rows.slice(1).map(row => {
        const values = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)
          ?.map(v => v.replace(/"/g, '').trim()) || []
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => obj[h] = values[i] || '')
        return obj
      })
      setLeads(parsed)
    }
    reader.readAsText(file)
  }

  async function generateEmail(lead: Record<string, string>, index: number) {
    setLoading(prev => ({ ...prev, [index]: true }))
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        background,
        lead: {
          name: lead['First name, Last name'] || '',
          company: lead['Company name'] || '',
          title: lead['Title'] || '',
          summary: lead['Company One-Sentence Summary'] || '',
          challenge: lead['Growth Challenge'] || '',
          news: lead['Recent Company News'] || '',
        }
      })
    })
    const text = await res.text()
    const email = JSON.parse(text)
    setEmails(prev => ({ ...prev, [index]: email }))
    setLoading(prev => ({ ...prev, [index]: false }))
    setSelected(index)
  }

  async function generateAll() {
    for (let i = 0; i < leads.length; i++) {
      await generateEmail(leads[i], i)
    }
  }

  function copyEmail() {
    if (selected === null) return
    const email = emails[selected]
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const doneCount = Object.keys(emails).length

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-lime-400 flex items-center justify-center">
            <span className="text-black text-sm font-bold">W</span>
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight">Warmly</span>
            <p className="text-xs text-zinc-500">Upload your leads, paste your background, get hyper-personalized cold emails instantly</p>
          </div>
        </div>
        {leads.length > 0 && (
          <span className="text-xs text-lime-400 font-medium">{doneCount}/{leads.length} generated</span>
        )}
      </div>

      <div className="flex h-[calc(100vh-65px)]">
        <div className="w-64 border-r border-zinc-800 p-5 flex flex-col gap-5 overflow-y-auto shrink-0">
          <div>
            <label className="block text-xs font-medium text-lime-400 mb-2 uppercase tracking-wider">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full bg-zinc-900 border border-lime-400/30 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-lime-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-lime-400 mb-2 uppercase tracking-wider">Your Background</label>
            <textarea
              value={background}
              onChange={e => setBackground(e.target.value)}
              placeholder="Data analytics grad, worked at X, built Y..."
              className="w-full bg-zinc-900 border border-lime-400/30 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 h-36 resize-none focus:outline-none focus:border-lime-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-lime-400 mb-2 uppercase tracking-wider">Leads</label>
            <label className="flex items-center gap-2 w-full bg-zinc-900 border border-lime-400/30 border-dashed rounded-lg px-3 py-3 text-sm text-zinc-400 cursor-pointer hover:border-lime-400 hover:text-lime-400 transition-colors">
              <span>📁</span>
              <span>{leads.length > 0 ? `${leads.length} leads loaded ✓` : 'Upload CSV'}</span>
              <input type="file" accept=".csv" onChange={handleCSV} className="hidden" />
            </label>
            <p className="text-xs text-zinc-600 mt-2">Works with Apollo, Clay, LinkedIn exports.</p>
          </div>

          {leads.length > 0 && (
            <button
              onClick={generateAll}
              className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold rounded-lg px-4 py-3 text-sm transition-colors"
            >
              ⚡ Generate All
            </button>
          )}
        </div>

        {leads.length > 0 && (
          <div className="w-52 border-r border-zinc-800 overflow-y-auto shrink-0">
            {leads.map((lead, i) => (
              <div
                key={i}
                onClick={() => { setSelected(i); if (!emails[i]) generateEmail(lead, i) }}
                className={`px-4 py-3 cursor-pointer border-b border-zinc-800/50 transition-colors ${selected === i ? 'bg-lime-400/10 border-l-2 border-l-lime-400' : 'hover:bg-zinc-900'}`}
              >
                <div className={`font-medium text-sm truncate ${selected === i ? 'text-lime-400' : 'text-white'}`}>
                  {(lead['First name, Last name'] || `Lead ${i+1}`).split(' ')[0]}
                </div>
                <div className="text-xs text-zinc-500 truncate">{lead['Company name']}</div>
                <div className="text-xs mt-1">
                  {loading[i] ? <span className="text-lime-400">writing...</span> : emails[i] ? <span className="text-lime-400">✓</span> : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8">
          {selected !== null && emails[selected] ? (
            <div className="max-w-2xl">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="text-xs text-lime-400 uppercase tracking-wider mb-1">Subject</div>
                  <div className="text-xl font-semibold text-white">{emails[selected].subject}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => selected !== null && generateEmail(leads[selected], selected)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-lime-400/20 hover:bg-lime-400/30 text-lime-400 border border-lime-400/40 transition-colors"
                  >
                    ↺ Regenerate
                  </button>
                  <button
                    onClick={copyEmail}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${copied ? 'bg-lime-400 text-black' : 'bg-lime-400/20 hover:bg-lime-400/30 text-lime-400 border border-lime-400/40'}`}
                  >
                    {copied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="bg-zinc-900 rounded-xl p-6 border border-lime-400/20 text-zinc-300 leading-relaxed whitespace-pre-wrap text-sm">
                <TypedText text={emails[selected].body} />
              </div>
            </div>
          ) : selected !== null && loading[selected] ? (
            <div className="flex items-center gap-3 text-zinc-500">
              <div className="w-4 h-4 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
              Writing email...
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-4">⚡</div>
              <div className="text-zinc-400 text-sm">Select a lead to generate an email</div>
              <div className="text-zinc-600 text-xs mt-2">or hit Generate All to run all leads at once</div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}