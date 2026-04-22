"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Login failed')
      }
      // Redirect to home (or the original path)
      const url = new URL(window.location.href)
      const from = url.searchParams.get('from') || '/'
      router.push(from)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 420, background: '#0F0F1A', border: '1px solid #1E1E2E', padding: 24, borderRadius: 12 }}>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#EDE8DF', marginBottom: 8 }}>Administrator Login</h2>
        <p style={{ color: '#9A94A8', fontSize: 13, marginBottom: 16 }}>Enter credentials to access protected routes.</p>
        <label style={{ display: 'block', fontSize: 12, color: '#9A94A8', marginBottom: 6 }}>Username</label>
        <input value={username} onChange={e => setUsername(e.target.value)} className="sf-input" style={{ marginBottom: 12 }} />
        <label style={{ display: 'block', fontSize: 12, color: '#9A94A8', marginBottom: 6 }}>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="sf-input" style={{ marginBottom: 16 }} />
        {error && <div style={{ color: '#E05B5B', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => router.push('/')} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button type="submit" className="btn-gold" style={{ flex: 1 }} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  )
}
