'use client'

import { useEffect, useState } from 'react'

interface StatusResponse {
  timestamp: number
  models: {
    churn_classifier:   { registered: boolean; version?: string; metrics?: Record<string, number> }
    product_recommender:{ registered: boolean; version?: string; metrics?: Record<string, number> }
  }
  data: { customers: number | null; products: number | null }
}

const FASTAPI_URL   = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001'
const POLL_INTERVAL = 10_000

function useStatus() {
  const [status, setStatus]       = useState<StatusResponse | null>(null)
  const [error,  setError]        = useState(false)
  const [lastMs, setLastMs]       = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch(`${FASTAPI_URL}/api/status`, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const json: StatusResponse = await res.json()
        if (alive) { setStatus(json); setError(false); setLastMs(Date.now()) }
      } catch {
        if (alive) setError(true)
      }
    }
    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return { status, error, lastMs }
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface Pill {
  id:    string
  label: string
  value: string
  sub?:  string
  state: 'ok' | 'warn' | 'off' | 'neutral'
}

export default function MetricsBar() {
  const { status, error, lastMs } = useStatus()
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const secondsAgo = lastMs ? Math.floor((Date.now() - lastMs) / 1000) : null
  const churn = status?.models.churn_classifier
  const rec   = status?.models.product_recommender

  const pills: Pill[] = [
    {
      id: 'api',
      label: 'API',
      value: error ? 'offline' : status ? 'online' : '…',
      state: error ? 'off' : status ? 'ok' : 'neutral',
    },
    {
      id: 'customers',
      label: 'Customers',
      value: fmt(status?.data.customers),
      state: status?.data.customers ? 'ok' : 'neutral',
    },
    {
      id: 'churn',
      label: 'Churn model',
      value: churn?.registered ? `v${churn.version}` : '—',
      sub:   churn?.metrics?.val_auc != null ? `auc ${churn.metrics.val_auc.toFixed(2)}` : undefined,
      state: churn?.registered ? 'ok' : 'neutral',
    },
    {
      id: 'recommender',
      label: 'Recommender',
      value: rec?.registered ? `v${rec.version}` : '—',
      sub:   rec?.metrics?.train_rmse != null ? `rmse ${rec.metrics.train_rmse.toFixed(4)}` : undefined,
      state: rec?.registered ? 'ok' : 'neutral',
    },
    {
      id: 'products',
      label: 'Products',
      value: fmt(status?.data.products),
      state: status?.data.products ? 'ok' : 'neutral',
    },
    {
      id: 'sync',
      label: 'Last sync',
      value: secondsAgo != null ? `${secondsAgo}s` : '—',
      state: secondsAgo != null && secondsAgo < 15 ? 'ok' : 'warn',
    },
  ]

  const stateColor = {
    ok:      'var(--green)',
    warn:    'var(--amber)',
    off:     'var(--red)',
    neutral: 'var(--ink-tertiary)',
  }

  return (
    <div style={{
      height: 'var(--metrics-h)',
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border-hairline)',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.03)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 6,
      flexShrink: 0,
      position: 'relative',
      zIndex: 10,
    }}>
      {/* Live indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingRight: 16,
        borderRight: '1px solid var(--border-hairline)',
        marginRight: 6,
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative', width: 7, height: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: error ? 'var(--red)' : 'var(--green)',
          }} />
          {!error && (
            <div style={{
              position: 'absolute', inset: -1.5,
              borderRadius: '50%',
              border: '1.5px solid rgba(22,163,74,0.4)',
              animation: 'pulse-ring 2s ease-out infinite',
            }} />
          )}
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.16em',
          color: 'var(--ink-tertiary)',
          textTransform: 'uppercase',
        }}>Live</span>
      </div>

      {/* Pills */}
      <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'nowrap', overflow: 'hidden' }}>
        {pills.map((pill, i) => (
          <div
            key={pill.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 7,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-hairline)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              flexShrink: 0,
              /* Stagger: 40ms apart, offset after header finishes (300ms) */
              opacity: 0,
              animation: `pill-in 250ms cubic-bezier(0.23, 1, 0.32, 1) ${300 + i * 40}ms forwards`,
            }}
          >
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 10.5,
              color: 'var(--ink-tertiary)',
              fontWeight: 400,
              letterSpacing: '-0.01em',
            }}>{pill.label}</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              fontWeight: 500,
              color: stateColor[pill.state],
              letterSpacing: '0.01em',
              /* Value updates: short, punchy ease-out */
              animation: 'value-in 150ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}>{pill.value}</span>
            {pill.sub && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--ink-ghost)',
                letterSpacing: '0.04em',
              }}>{pill.sub}</span>
            )}
          </div>
        ))}
      </div>

      {/* Profile + phase */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 16,
        borderLeft: '1px solid var(--border-hairline)',
        flexShrink: 0,
      }}>
        <div style={{
          padding: '4px 9px',
          borderRadius: 6,
          background: 'rgba(79,70,229,0.07)',
          border: '1px solid rgba(79,70,229,0.15)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: '#4f46e5',
          letterSpacing: '0.08em',
          fontWeight: 500,
        }}>
          {process.env.NEXT_PUBLIC_PROFILE ?? 'core'}
        </div>
      </div>
    </div>
  )
}
