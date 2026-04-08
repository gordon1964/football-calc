import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

// ─── CONFIG ───────────────────────────────────────────────
const BASE_URL = 'https://api.football-data.org/v4'

const LEAGUES = [
  { code: 'PL',  name: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League' },
  { code: 'BL1', name: '🇩🇪 Bundesliga' },
  { code: 'SA',  name: '🇮🇹 Serie A' },
  { code: 'PD',  name: '🇪🇸 La Liga' },
  { code: 'FL1', name: '🇫🇷 Ligue 1' },
  { code: 'DED', name: '🇳🇱 Eredivisie' },
  { code: 'PPL', name: '🇵🇹 Primeira Liga' },
  { code: 'ELC', name: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Championship' },
  { code: 'BSA', name: '🇧🇷 Série A' },
  { code: 'CL',  name: '🏆 Champions League' },
]

const LEAGUE_BASELINES = {
  PL:  { faule: 21.2, rozne: 9.8,  zolte: 3.2, czerwone: 0.20 },
  BL1: { faule: 22.8, rozne: 9.2,  zolte: 3.5, czerwone: 0.22 },
  SA:  { faule: 26.4, rozne: 9.6,  zolte: 4.8, czerwone: 0.35 },
  PD:  { faule: 24.1, rozne: 9.4,  zolte: 4.2, czerwone: 0.28 },
  FL1: { faule: 23.6, rozne: 8.8,  zolte: 3.9, czerwone: 0.24 },
  DED: { faule: 20.8, rozne: 9.0,  zolte: 3.1, czerwone: 0.18 },
  PPL: { faule: 24.8, rozne: 8.6,  zolte: 4.4, czerwone: 0.30 },
  ELC: { faule: 23.2, rozne: 10.2, zolte: 3.8, czerwone: 0.22 },
  BSA: { faule: 27.6, rozne: 8.4,  zolte: 5.2, czerwone: 0.42 },
  CL:  { faule: 20.4, rozne: 9.6,  zolte: 3.0, czerwone: 0.18 },
}

const EC  = { faule: '#7eb8f7', rozne: '#6adf6a', zolte: '#f0c040', czerwone: '#f07070' }
const EL  = { faule: 'Faule', rozne: 'Rzuty rożne', zolte: 'Żółte kartki', czerwone: 'Czerwone kartki' }
const THR = { faule: [16,20,24,28], rozne: [6,8,10,13], zolte: [2,3,4,6], czerwone: [1,2] }
const MKK = { faule: 42, rozne: 20, zolte: 10, czerwone: 5 }

// ─── POISSON ──────────────────────────────────────────────
function pmf(k, λ) {
  if (λ <= 0) return k === 0 ? 1 : 0
  let logP = k * Math.log(λ) - λ
  for (let i = 1; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}
function cdf(upTo, λ) {
  let s = 0
  for (let i = 0; i <= upTo; i++) s += pmf(i, λ)
  return Math.min(s, 1)
}
function dist(λ, maxK) {
  return Array.from({ length: maxK + 1 }, (_, k) => ({
    k, prob: Math.round(pmf(k, λ) * 1000) / 10,
  }))
}

// ─── HELPERS ──────────────────────────────────────────────
function matchWeight(hp, ap) {
  if (!hp || !ap) return { label: 'Ligowy', w: { faule:1, rozne:1, zolte:1, czerwone:1 } }
  if (hp <= 3 && ap <= 3)   return { label: 'Szczyt tabeli 🏆', w: { faule:1.1, rozne:1.06, zolte:1.2, czerwone:1.25 } }
  if (hp >= 16 && ap >= 16) return { label: 'Walka o utrzymanie ⬇️', w: { faule:1.14, rozne:1.04, zolte:1.28, czerwone:1.3 } }
  if (Math.abs(hp-ap) <= 2 && hp <= 6) return { label: 'Starcie czołówki ⚡', w: { faule:1.08, rozne:1.04, zolte:1.15, czerwone:1.2 } }
  return { label: 'Ligowy', w: { faule:1, rozne:1, zolte:1, czerwone:1 } }
}

function intensity(matches) {
  if (!matches?.length) return { val: 1.0, avg: null, n: 0 }
  const slice = matches.slice(0, 8)
  const avg = slice.reduce((s, m) =>
    s + (m.score?.fullTime?.home ?? 0) + (m.score?.fullTime?.away ?? 0), 0) / slice.length
  return { val: Math.min(Math.max(avg / 2.5, 0.75), 1.35), avg: avg.toFixed(1), n: slice.length }
}

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pl-PL', { day:'2-digit', month:'2-digit', weekday:'short' })
}

// ─── API FETCH (direct — works from real domain, not iframe) ──
async function apiFetch(path, apiKey) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': apiKey }
  })
  if (!res.ok) {
    const msg = res.status === 403
      ? 'Nieprawidłowy klucz API (403)'
      : res.status === 429
      ? 'Limit zapytań przekroczony (429) — odczekaj minutę'
      : `Błąd HTTP ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

// ─── COMPONENTS ───────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0f1923', border:'1px solid #2a3a4a', borderRadius:8, padding:'10px 14px', fontSize:13 }}>
      <div style={{ color:'#7eb8f7', fontWeight:700, marginBottom:4 }}>Dokładnie {label} zdarzeń</div>
      <div style={{ color:'#e0eaf5' }}>P = <strong>{payload[0].value}%</strong></div>
    </div>
  )
}

function Pill({ k, p }) {
  const color  = p > 0.6 ? '#6adf6a' : p > 0.35 ? '#f0c040' : '#f07070'
  const bg     = p > 0.6 ? '#1a3a1a' : p > 0.35 ? '#2a2a0a' : '#2a1010'
  const border = p > 0.6 ? '#3a8a3a' : p > 0.35 ? '#8a7a20' : '#8a2020'
  return (
    <span style={{ background:bg, border:`1px solid ${border}`, borderRadius:6,
      padding:'3px 10px', fontSize:12, color, fontWeight:600 }}>
      ≥{k}: {Math.round(p * 100)}%
    </span>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKey]     = useState(() => localStorage.getItem('fdApiKey') || '')
  const [league, setLeague]     = useState('PL')
  const [fixtures, setFixtures] = useState([])
  const [standings, setStandings] = useState([])
  const [selected, setSelected] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [loadingH, setLoadingH] = useState(false)
  const [error, setError]       = useState(null)
  const [activeEvent, setActiveEvent] = useState('faule')

  const saveKey = (k) => {
    setApiKey(k)
    localStorage.setItem('fdApiKey', k)
  }

  const loadLeague = useCallback(async () => {
    if (!apiKey.trim()) return
    setLoading(true); setError(null)
    setFixtures([]); setSelected(null); setTeamStats(null)
    try {
      const fData = await apiFetch(`/competitions/${league}/matches?status=SCHEDULED`, apiKey)
      const upcoming = (fData.matches || []).slice(0, 30)
      setFixtures(upcoming)

      if (!['CL'].includes(league)) {
        try {
          const sData = await apiFetch(`/competitions/${league}/standings`, apiKey)
          setStandings(sData?.standings?.[0]?.table || [])
        } catch { setStandings([]) }
      } else {
        setStandings([])
      }

      if (upcoming.length > 0) setSelected(upcoming[0])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [apiKey, league])

  useEffect(() => { if (apiKey) loadLeague() }, [league])

  useEffect(() => {
    if (!selected || !apiKey) return
    const go = async () => {
      setLoadingH(true); setTeamStats(null)
      try {
        const [hd, ad] = await Promise.all([
          apiFetch(`/teams/${selected.homeTeam.id}/matches?status=FINISHED&limit=10`, apiKey),
          apiFetch(`/teams/${selected.awayTeam.id}/matches?status=FINISHED&limit=10`, apiKey),
        ])
        const hi = intensity(hd.matches || [])
        const ai = intensity(ad.matches || [])
        const i  = (hi.val + ai.val) / 2
        const b  = LEAGUE_BASELINES[league] || LEAGUE_BASELINES.PL
        setTeamStats({
          faule: b.faule * i, rozne: b.rozne * i,
          zolte: b.zolte * i, czerwone: b.czerwone * i,
          hAvg: hi.avg, hN: hi.n, aAvg: ai.avg, aN: ai.n,
        })
      } catch (e) { console.warn('Historia:', e) }
      finally { setLoadingH(false) }
    }
    go()
  }, [selected])

  // Lambdas
  const base   = teamStats || LEAGUE_BASELINES[league] || LEAGUE_BASELINES.PL
  const refName = selected?.referees?.[0]?.name || ''
  const hp     = standings.find(s => s.team.id === selected?.homeTeam?.id)?.position
  const ap     = standings.find(s => s.team.id === selected?.awayTeam?.id)?.position
  const waga   = matchWeight(hp, ap)
  const λs     = Object.fromEntries(
    ['faule','rozne','zolte','czerwone'].map(t => [t, Math.max(0.01, base[t] * waga.w[t])])
  )

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 20px' }}>

      {/* Google fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontFamily:'Barlow Condensed', fontSize:10, letterSpacing:'0.2em', color:'#3a6a9a', textTransform:'uppercase', marginBottom:4 }}>
          football-data.org · Model Poissona
        </div>
        <h1 style={{ fontFamily:'Barlow Condensed', fontSize:36, fontWeight:800, margin:0, lineHeight:1,
          background:'linear-gradient(90deg,#7eb8f7,#4a8acf)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          KALKULATOR ZDARZEŃ MECZOWYCH
        </h1>
        <p style={{ fontSize:12, color:'#4a6a8a', marginTop:6 }}>
          Faule · Rzuty rożne · Żółte kartki · Czerwone kartki
        </p>
      </div>

      {/* API KEY */}
      <div style={{ background:'#0d1f30', border:'1px solid #1e3048', borderRadius:12, padding:'16px 20px', marginBottom:20 }}>
        <div style={{ fontSize:11, letterSpacing:'0.12em', color:'#4a7aaa', textTransform:'uppercase', marginBottom:8 }}>
          Klucz API football-data.org
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input
            type="password"
            value={apiKey}
            onChange={e => saveKey(e.target.value)}
            placeholder="Wklej swój klucz API..."
            style={{ flex:1, background:'#07111c', border:'1px solid #1e3048', borderRadius:8,
              color:'#e0eaf5', padding:'10px 14px', fontSize:13, fontFamily:'DM Mono,monospace' }}
          />
          <button onClick={loadLeague} disabled={!apiKey || loading}
            style={{ background: apiKey && !loading ? '#1a4a7a' : '#0d1f30',
              border:'1px solid #2a6aaa', borderRadius:8, color:'#7eb8f7',
              padding:'10px 20px', fontSize:13, fontWeight:600 }}>
            {loading ? '⏳' : '▶ Załaduj'}
          </button>
        </div>
        <div style={{ fontSize:10, color:'#3a5a7a', marginTop:8 }}>
          Klucz jest zapisywany lokalnie w przeglądarce. Zarejestruj się bezpłatnie na football-data.org
        </div>
      </div>

      {/* LEAGUE TABS */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, letterSpacing:'0.12em', color:'#4a7aaa', textTransform:'uppercase', marginBottom:8 }}>Liga</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {LEAGUES.map(l => (
            <button key={l.code} onClick={() => setLeague(l.code)}
              style={{ background: league === l.code ? '#1a4a7a' : '#0d1f30',
                border:`1px solid ${league === l.code ? '#3a7ab8' : '#1e3048'}`,
                borderRadius:8, padding:'7px 12px',
                color: league === l.code ? '#e0eaf5' : '#8aaac8',
                fontSize:11, fontFamily:'DM Mono,monospace',
                fontWeight: league === l.code ? 600 : 400 }}>
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div style={{ background:'#2a1010', border:'1px solid #8a2020', borderRadius:10,
          padding:'12px 16px', color:'#f07070', fontSize:13, marginBottom:16 }}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#4a7aaa', fontSize:14 }}>
          ⏳ Pobieranie terminarza...
        </div>
      )}

      {!loading && !error && fixtures.length === 0 && apiKey && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#3a5a7a', fontSize:13 }}>
          Brak zaplanowanych meczów dla tej ligi lub kliknij ▶ Załaduj
        </div>
      )}

      {!loading && fixtures.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:20 }}>

          {/* LEFT: FIXTURES */}
          <div>
            <div style={{ fontSize:11, letterSpacing:'0.12em', color:'#4a7aaa', textTransform:'uppercase', marginBottom:8 }}>
              Terminarz ({fixtures.length})
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:'70vh', overflowY:'auto' }}>
              {fixtures.map(m => {
                const sel = selected?.id === m.id
                return (
                  <div key={m.id} onClick={() => setSelected(m)}
                    style={{ background: sel ? '#0d2035' : '#09161f',
                      border:`1px solid ${sel ? '#3a7ab8' : '#1a2d3a'}`,
                      borderRadius:8, padding:'10px 12px', cursor:'pointer',
                      transition:'all 0.15s' }}>
                    <div style={{ fontSize:12, color: sel ? '#e0eaf5' : '#8aaac8', fontWeight: sel ? 600 : 400 }}>
                      {m.homeTeam?.shortName || m.homeTeam?.name}
                    </div>
                    <div style={{ fontSize:11, color:'#3a6a9a', margin:'2px 0' }}>vs</div>
                    <div style={{ fontSize:12, color: sel ? '#e0eaf5' : '#8aaac8', fontWeight: sel ? 600 : 400 }}>
                      {m.awayTeam?.shortName || m.awayTeam?.name}
                    </div>
                    <div style={{ fontSize:10, color:'#4a6a8a', marginTop:4 }}>{fmt(m.utcDate)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT: ANALYSIS */}
          {selected && (
            <div>
              {/* Match header */}
              <div style={{ background:'linear-gradient(135deg,#0d2035,#091520)',
                border:'1px solid #1e3a5a', borderRadius:12, padding:'16px 20px', marginBottom:14 }}>
                <div style={{ fontFamily:'Barlow Condensed', fontSize:22, fontWeight:800, color:'#e0eaf5', marginBottom:8 }}>
                  {selected.homeTeam?.name} <span style={{color:'#3a6a9a'}}>—</span> {selected.awayTeam?.name}
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:12 }}>
                  <span style={{color:'#4a7aaa'}}>📅 {fmt(selected.utcDate)}</span>
                  {refName && <span style={{color:'#c0c060'}}>👨‍⚖️ {refName}</span>}
                  <span style={{color:'#7eb8f7'}}>⚖️ {waga.label}</span>
                  {hp && ap && <span style={{color:'#6a9a6a'}}>#{hp} vs #{ap}</span>}
                </div>
                {loadingH && <div style={{fontSize:11,color:'#4a6a8a',marginTop:8}}>⏳ Historia drużyn...</div>}
                {teamStats && !loadingH && (
                  <div style={{fontSize:11,color:'#4a8a6a',marginTop:8}}>
                    ✅ {selected.homeTeam?.shortName}: {teamStats.hN} mecz., avg {teamStats.hAvg} goli · {selected.awayTeam?.shortName}: {teamStats.aN} mecz., avg {teamStats.aAvg} goli
                  </div>
                )}
              </div>

              {/* Lambda cards */}
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {Object.entries(λs).map(([type, lam]) => (
                  <button key={type} onClick={() => setActiveEvent(type)} style={{
                    flex:1, background: activeEvent === type ? `${EC[type]}20` : '#0d1f30',
                    border:`1px solid ${activeEvent === type ? EC[type] : '#1e3048'}`,
                    borderRadius:10, padding:'10px 12px', textAlign:'left' }}>
                    <div style={{fontSize:9,letterSpacing:'0.1em',color:EC[type],textTransform:'uppercase',marginBottom:3}}>{EL[type]}</div>
                    <div style={{fontSize:24,fontWeight:700,fontFamily:'Barlow Condensed',color:EC[type]}}>{lam.toFixed(1)}</div>
                    <div style={{fontSize:9,color:'#4a6a8a'}}>λ</div>
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div style={{ background:'#0d1f30', border:'1px solid #1e3048', borderRadius:14, padding:'14px 12px', marginBottom:14 }}>
                <div style={{fontSize:12,color:EC[activeEvent],textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:2}}>{EL[activeEvent]}</div>
                <div style={{fontSize:11,color:'#4a6a8a',marginBottom:12}}>Rozkład Poissona · λ = {λs[activeEvent].toFixed(2)}</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dist(λs[activeEvent], MKK[activeEvent])} margin={{top:2,right:2,left:-20,bottom:2}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2d40" vertical={false} />
                    <XAxis dataKey="k" tick={{fill:'#4a6a8a',fontSize:10}} axisLine={{stroke:'#1e3048'}} tickLine={false} />
                    <YAxis tick={{fill:'#4a6a8a',fontSize:10}} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip content={<ChartTooltip />} cursor={{fill:'#1a2d40'}} />
                    <ReferenceLine x={Math.round(λs[activeEvent])} stroke={EC[activeEvent]} strokeDasharray="4 2" strokeOpacity={0.5} />
                    <Bar dataKey="prob" fill={EC[activeEvent]} radius={[3,3,0,0]} fillOpacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Thresholds */}
              <div style={{fontSize:11,letterSpacing:'0.12em',color:'#4a7aaa',textTransform:'uppercase',marginBottom:10}}>
                Prawdopodobieństwo progów
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}>
                {Object.entries(THR).map(([type, ks]) => (
                  <div key={type} style={{ background:'linear-gradient(135deg,#0d1f30,#0a1520)',
                    border:'1px solid #1e3048', borderRadius:12, padding:'12px 14px', flex:'1 1 160px' }}>
                    <div style={{fontSize:9,letterSpacing:'0.1em',color:EC[type],textTransform:'uppercase',marginBottom:6}}>{EL[type]}</div>
                    <div style={{fontSize:14,color:'#f0c040',fontWeight:700,marginBottom:8}}>λ = {λs[type].toFixed(1)}</div>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      {ks.map(k => <Pill key={k} k={k} p={1 - cdf(k-1, λs[type])} />)}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{padding:'10px 14px',background:'#0a1520',border:'1px solid #142030',borderRadius:10,fontSize:11,color:'#3a5a7a',lineHeight:1.7}}>
                <strong style={{color:'#4a7aaa'}}>Model:</strong> λ = baseline ligi × intensywność z historii (avg goli, ostatnie 8 meczów) × waga meczu z tabeli.
                Statystyki faulów i rożnych niedostępne w darmowym planie — proxy z intensywności gry.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
