'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { isPast } from 'date-fns'

type Step = 'review' | 'sign' | 'place' | 'identify' | 'confirm' | 'done'
type SigMode = 'draw' | 'type'

interface DocData {
  id: string; title: string; file_url: string; token: string
  status: string; recipient_name?: string; recipient_email?: string; expires_at?: string
}
interface SigPos { xPct: number; yPct: number; wPct: number; hPct: number; page: number }

export default function SigningClient({ document: doc, token }: { document: DocData; token: string }) {
  const [step, setStep] = useState<Step>('review')
  const [sigMode, setSigMode] = useState<SigMode>('draw')
  const [name, setName] = useState(doc.recipient_name || '')
  const [email, setEmail] = useState(doc.recipient_email || '')
  const [agreed, setAgreed] = useState(false)
  const [sigData, setSigData] = useState<string | null>(null)
  const [typedName, setTypedName] = useState('')
  const [sigPos, setSigPos] = useState<SigPos | null>(null)
  const [photoData, setPhotoData] = useState<string | null>(null)
  const [photoSkipped, setPhotoSkipped] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [locationData, setLocationData] = useState<{ latitude: number; longitude: number } | null>(null)
  const [signedDocUrl, setSignedDocUrl] = useState<string | null>(null)

  // Draw sig canvas
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const [drawn, setDrawn] = useState(false)

  // Typed sig canvas
  const typeCanvasRef = useRef<HTMLCanvasElement>(null)

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const photoCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [camReady, setCamReady] = useState(false)
  const [captured, setCaptured] = useState(false)

  // PDF drag placement
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const [sigBoxPos, setSigBoxPos] = useState({ x: 60, y: 60 })  // px on preview
  const [isDraggingSig, setIsDraggingSig] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [pdfRendered, setPdfRendered] = useState(false)
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const [totalPages, setTotalPages] = useState(1)
  const [activePage, setActivePage] = useState(1)
  const pdfDocRef = useRef<unknown>(null)

  // ── Guards ──────────────────────────────────────────────────────────────

  const isExpired = doc.expires_at && isPast(new Date(doc.expires_at)) && doc.status !== 'signed'
  const alreadySigned = doc.status === 'signed'

  // ── Draw signature ──────────────────────────────────────────────────────

  const initCanvas = useCallback(() => {
    const c = canvasRef.current; if (!c) return
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = r.width * dpr; c.height = r.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr); ctx.strokeStyle = '#C9933A'; ctx.lineWidth = 2.5
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  useEffect(() => { if (step === 'sign') setTimeout(initCanvas, 80) }, [step, initCanvas])

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); isDrawing.current = true; lastPos.current = getPos(e)
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
  }
  const onDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); if (!isDrawing.current || !lastPos.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = getPos(e)
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    lastPos.current = p; setDrawn(true)
  }
  const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); isDrawing.current = false; lastPos.current = null
    if (drawn) {
      // Export drawn signature with white background so it's visible in dark UI
      const src = canvasRef.current!
      const out = document.createElement('canvas')
      out.width = src.width; out.height = src.height
      const outCtx = out.getContext('2d')!
      outCtx.fillStyle = '#ffffff'
      outCtx.fillRect(0, 0, out.width, out.height)
      outCtx.drawImage(src, 0, 0)
      setSigData(out.toDataURL('image/png'))
    }
  }
  const clearDraw = () => {
    const c = canvasRef.current!; const dpr = window.devicePixelRatio || 1
    c.getContext('2d')!.clearRect(0, 0, c.width / dpr, c.height / dpr)
    setDrawn(false); setSigData(null)
  }

  // ── Typed signature ─────────────────────────────────────────────────────

  useEffect(() => {
    if (sigMode !== 'type' || !typedName || step !== 'sign') return
    const c = typeCanvasRef.current; if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = 400 * dpr; c.height = 120 * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, 400, 120)
    ctx.font = `italic 48px 'Playfair Display', Georgia, serif`
    ctx.fillStyle = '#C9933A'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(typedName).width
    const scale = tw > 340 ? 340 / tw : 1
    ctx.save(); ctx.translate(200, 60); ctx.scale(scale, 1); ctx.fillText(typedName, -tw / 2, 0); ctx.restore()
    // Export typed signature with white background so it's visible in dark UI
    const out = document.createElement('canvas')
    out.width = c.width; out.height = c.height
    const outCtx = out.getContext('2d')!
    outCtx.fillStyle = '#ffffff'
    outCtx.fillRect(0, 0, out.width, out.height)
    outCtx.drawImage(c, 0, 0)
    setSigData(out.toDataURL('image/png'))
  }, [typedName, sigMode, step])

  // ── PDF rendering with PDF.js ────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'place') return
    let cancelled = false

    const renderPage = async (pdfDoc: unknown, pageNum: number) => {
      const canvas = pdfCanvasRef.current; if (!canvas || cancelled) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = await (pdfDoc as any).getPage(pageNum)
      const container = pdfContainerRef.current
      const maxW = container ? container.clientWidth - 32 : 560
      const origVp = page.getViewport({ scale: 1 })
      const scale = maxW / origVp.width
      const vp = page.getViewport({ scale })
      canvas.width = vp.width; canvas.height = vp.height
      canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px'
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      if (!cancelled) { setPdfRendered(true); setSigBoxPos({ x: vp.width - 230, y: vp.height - 100 }) }
    }

    const load = async () => {
      try {
        // Load PDF.js from CDN
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfjsLib = (window as any).pdfjsLib
        if (!pdfjsLib) {
          // PDF.js not loaded yet, retry
          setTimeout(() => { if (!cancelled) load() }, 500)
          return
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        const pdfDoc = await pdfjsLib.getDocument(doc.file_url).promise
        if (cancelled) return
        pdfDocRef.current = pdfDoc
        setTotalPages(pdfDoc.numPages)
        await renderPage(pdfDoc, activePage)
      } catch (err) {
        console.error('PDF.js error:', err)
        if (!cancelled) setPdfRendered(true) // fallback: show without preview
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, doc.file_url])

  const changePage = async (n: number) => {
    if (!pdfDocRef.current) return
    setActivePage(n); setPdfRendered(false)
    const canvas = pdfCanvasRef.current; if (!canvas) return
    const container = pdfContainerRef.current
    const maxW = container ? container.clientWidth - 32 : 560
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (pdfDocRef.current as any).getPage(n)
    const origVp = page.getViewport({ scale: 1 })
    const scale = maxW / origVp.width
    const vp = page.getViewport({ scale })
    canvas.width = vp.width; canvas.height = vp.height
    canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px'
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    setPdfRendered(true)
  }

  // ── Drag-to-place signature ─────────────────────────────────────────────

  const SIG_W = 200, SIG_H = 70

  const onSigMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); e.stopPropagation()
    setIsDraggingSig(true)
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
    dragOffset.current = { x: clientX - sigBoxPos.x, y: clientY - sigBoxPos.y }
  }

  useEffect(() => {
    if (!isDraggingSig) return
    const canvas = pdfCanvasRef.current

    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY
      if (!canvas) return
      const maxX = canvas.width - SIG_W, maxY = canvas.height - SIG_H
      const nx = Math.max(0, Math.min(maxX, clientX - dragOffset.current.x))
      const ny = Math.max(0, Math.min(maxY, clientY - dragOffset.current.y))
      setSigBoxPos({ x: nx, y: ny })
    }
    const up = () => setIsDraggingSig(false)

    window.addEventListener('mousemove', move, { passive: false })
    window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
    }
  }, [isDraggingSig])

  const computeSigPosition = (): SigPos | null => {
    const canvas = pdfCanvasRef.current; if (!canvas) return null
    return {
      xPct: sigBoxPos.x / canvas.width,
      yPct: sigBoxPos.y / canvas.height,
      wPct: SIG_W / canvas.width,
      hPct: SIG_H / canvas.height,
      page: activePage,
    }
  }

  // ── Camera ──────────────────────────────────────────────────────────────

  const startCam = async () => {
    setCamError(null); setCamReady(false)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
      streamRef.current = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); setCamReady(true) }
      }
    } catch { setCamError('Camera denied. You can skip this step.') }
  }
  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setCamReady(false)
  }, [])
  useEffect(() => { if (step === 'identify') startCam(); else stopCam() }, [step, stopCam])

  const capturePhoto = () => {
    if (!videoRef.current || !photoCanvasRef.current) return
    const v = videoRef.current; const c = photoCanvasRef.current
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    setPhotoData(c.toDataURL('image/jpeg', 0.8)); setCaptured(true); stopCam()
  }

  // ── Geolocation ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (step === 'confirm') navigator.geolocation?.getCurrentPosition(p => setLocationData({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => {})
  }, [step])

  // ── Device info ─────────────────────────────────────────────────────────

  const getDevice = () => {
    const ua = navigator.userAgent
    let browser = 'Unknown', os = 'Unknown'
    if (/Chrome/.test(ua) && !/Chromium|Edge/.test(ua)) browser = 'Chrome'
    else if (/Firefox/.test(ua)) browser = 'Firefox'
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'
    else if (/Edge/.test(ua)) browser = 'Edge'
    if (/Windows NT 10/.test(ua)) os = 'Windows 10/11'
    else if (/Mac OS X/.test(ua)) os = 'macOS'
    else if (/Android/.test(ua)) os = 'Android'
    else if (/iPhone|iPad/.test(ua)) os = 'iOS'
    else if (/Linux/.test(ua)) os = 'Linux'
    return { browser, os, userAgent: ua, screen: `${screen.width}x${screen.height}`, viewport: `${innerWidth}x${innerHeight}`, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: navigator.language, platform: navigator.platform, touchSupport: String('ontouchstart' in window), colorDepth: String(screen.colorDepth) }
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const submit = async () => {
    if (!sigData) return toast.error('Please create your signature first')
    setSubmitting(true)
    try {
      const pos = sigPos || computeSigPosition()
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signerName: name, signerEmail: email, signatureData: sigData, photoData: photoData || null, deviceInfo: getDevice(), locationData, signaturePosition: pos }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to sign')
      setSignedDocUrl(data.signed_doc_url)
      stopCam()
      setStep('done')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Signing failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Guards ───────────────────────────────────────────────────────────────

  if (alreadySigned) return (
    <Shell title={doc.title}>
      <div style={{ textAlign: 'center', padding: '50px 20px' }}>
        <div style={{ fontSize: 60, marginBottom: 14 }}>🔒</div>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, color: '#EDE8DF', marginBottom: 8 }}>Already Signed</h2>
        <p style={{ color: '#9A94A8', fontSize: 14, maxWidth: 360, margin: '0 auto' }}>This document has already been signed. Each signing link can only be used once to ensure authenticity.</p>
      </div>
    </Shell>
  )

  if (isExpired) return (
    <Shell title={doc.title}>
      <div style={{ textAlign: 'center', padding: '50px 20px' }}>
        <div style={{ fontSize: 60, marginBottom: 14 }}>⌛</div>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, color: '#EDE8DF', marginBottom: 8 }}>Link Expired</h2>
        <p style={{ color: '#9A94A8', fontSize: 14, maxWidth: 360, margin: '0 auto' }}>This signing link has expired. Please ask the document sender to generate a new one.</p>
      </div>
    </Shell>
  )

  if (step === 'done') return (
    <Shell title={doc.title}>
      <div style={{ textAlign: 'center', padding: '30px 20px' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(61,184,122,0.15)', border: '2px solid #3DB87A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>✓</div>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, color: '#EDE8DF', marginBottom: 8 }}>Signed Successfully!</h2>
        <p style={{ color: '#9A94A8', fontSize: 14, marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>Your signature has been recorded and embedded in the document. The sender has been notified.</p>
        {signedDocUrl && (
          <a href={signedDocUrl} target="_blank" rel="noopener noreferrer" className="btn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 20 }}>
            ↓ Download Signed PDF
          </a>
        )}
        <div style={{ background: '#0F0F1A', border: '1px solid #1E1E2E', borderRadius: 10, padding: '14px 18px', textAlign: 'left', maxWidth: 380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 12, color: '#4A4A60' }}>🔒 Your IP, device info, and timestamp are recorded as legal proof.</p>
          {locationData && <p style={{ fontSize: 12, color: '#4A4A60' }}>📍 GPS location captured for additional verification.</p>}
          {photoData && <p style={{ fontSize: 12, color: '#4A4A60' }}>📷 Identity photo attached to your signature record.</p>}
        </div>
      </div>
    </Shell>
  )

  // ── Steps progress bar ──────────────────────────────────────────────────

  const steps = [
    { id: 'review', label: 'Review' },
    { id: 'sign', label: 'Sign' },
    { id: 'place', label: 'Place' },
    { id: 'identify', label: 'Verify' },
    { id: 'confirm', label: 'Confirm' },
  ]
  const si = steps.findIndex(s => s.id === step)

  return (
    <Shell title={doc.title}>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
        {steps.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, transition: 'all 0.3s', background: i < si ? '#3DB87A' : i === si ? '#C9933A' : '#1A1A28', color: i <= si ? '#080810' : '#3A3A50', border: `2px solid ${i === si ? '#E8B84B' : 'transparent'}` }}>
                {i < si ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 10, color: i === si ? '#C9933A' : '#3A3A50', letterSpacing: '0.03em' }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: '0 6px', marginBottom: 14, background: i < si ? '#3DB87A' : '#1A1A28', transition: 'background 0.3s' }} />
            )}
          </div>
        ))}
      </div>

      {/* ── STEP: Review ─────────────────────────────────────────────────────── */}
      {step === 'review' && (
        <div>
          <h2 style={H2}>Review Document</h2>
          <p style={SUB}>Read carefully before proceeding to sign.</p>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #252535', marginBottom: 18, height: '48vh', minHeight: 280 }}>
            <iframe src={`${doc.file_url}#toolbar=1`} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} title={doc.title} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={LBL}>Your Full Name *</label>
              <input className="sf-input" placeholder="Legal name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Your Email *</label>
              <input className="sf-input" type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 18 }}>
            <div onClick={() => setAgreed(p => !p)} style={{ width: 17, height: 17, borderRadius: 4, marginTop: 1, flexShrink: 0, background: agreed ? '#C9933A' : 'transparent', border: `2px solid ${agreed ? '#C9933A' : '#252535'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', cursor: 'pointer' }}>
              {agreed && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#080810" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 6 5 9 10 3"/></svg>}
            </div>
            <span style={{ fontSize: 13, color: '#9A94A8', lineHeight: 1.5 }}>I have read and agree to sign this document electronically. I understand this constitutes a legally binding signature.</span>
          </label>
          <button onClick={() => setStep('sign')} disabled={!agreed || !name.trim() || !email.trim()} className="btn-gold" style={{ width: '100%' }}>
            Proceed to Sign →
          </button>
        </div>
      )}

      {/* ── STEP: Sign ───────────────────────────────────────────────────────── */}
      {step === 'sign' && (
        <div>
          <h2 style={H2}>Create Your Signature</h2>
          <p style={SUB}>Draw your signature or type your name.</p>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#161624', borderRadius: 10, padding: 4 }}>
            {(['draw', 'type'] as const).map(m => (
              <button key={m} onClick={() => { setSigMode(m); setSigData(null); setDrawn(false) }} style={{ flex: 1, padding: '8px', borderRadius: 7, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s', background: sigMode === m ? '#C9933A' : 'transparent', color: sigMode === m ? '#080810' : '#9A94A8', border: 'none', fontWeight: sigMode === m ? 600 : 400, fontFamily: 'Instrument Sans, sans-serif' }}>
                {m === 'draw' ? '✍️ Draw' : 'Aa Type'}
              </button>
            ))}
          </div>

          {sigMode === 'draw' ? (
            <>
              <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `2px solid ${drawn ? '#C9933A' : '#252535'}`, background: '#0A0A14', marginBottom: 10, transition: 'border-color 0.2s' }}>
                <canvas ref={canvasRef} className="sig-canvas" style={{ display: 'block', width: '100%', height: 180 }} onPointerDown={startDraw} onPointerMove={onDraw} onPointerUp={endDraw} onPointerLeave={endDraw} />
                {!drawn && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#252535', fontSize: 14 }}>✍️ Draw your signature here</div>}
                <div style={{ position: 'absolute', bottom: 40, left: 20, right: 20, height: 1, background: '#1E1E2E', pointerEvents: 'none' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <button onClick={clearDraw} className="btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }}>Clear</button>
                <span style={{ fontSize: 12, color: drawn ? '#C9933A' : '#4A4A60' }}>{drawn ? '✓ Signature captured' : 'Use mouse or finger to sign'}</span>
              </div>
            </>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <label style={LBL}>Type your full name</label>
              <input className="sf-input" placeholder="Your legal name" value={typedName} onChange={e => setTypedName(e.target.value)} style={{ marginBottom: 12 }} />
              {typedName && (
                <div style={{ background: '#0A0A14', border: '1px solid #252535', borderRadius: 10, padding: '16px', marginBottom: 8 }}>
                  <p style={{ fontSize: 10, color: '#4A4A60', marginBottom: 6 }}>Preview:</p>
                  <canvas ref={typeCanvasRef} style={{ width: '100%', height: 60, display: 'block', objectFit: 'contain' }} />
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('review')} className="btn-ghost" style={{ flex: 1 }}>← Back</button>
            <button onClick={() => { if (sigData) setStep('place') }} disabled={!sigData} className="btn-gold" style={{ flex: 1 }}>Place Signature →</button>
          </div>
        </div>
      )}

      {/* ── STEP: Place ─────────────────────────────────────────────────────── */}
      {step === 'place' && (
        <div>
          <h2 style={H2}>Place Your Signature</h2>
          <p style={SUB}>Drag the gold box to where you want your signature on the document.</p>

          {/* PDF.js script */}
          <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" async />

          <div ref={pdfContainerRef} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #252535', marginBottom: 14, background: '#0A0A14', cursor: isDraggingSig ? 'grabbing' : 'default', minHeight: 200 }}>
            {!pdfRendered && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                <div style={{ textAlign: 'center', color: '#4A4A60' }}>
                  <div style={{ width: 28, height: 28, border: '2px solid #252535', borderTopColor: '#C9933A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
                  <p style={{ fontSize: 12 }}>Loading PDF…</p>
                </div>
              </div>
            )}
            <canvas ref={pdfCanvasRef} style={{ display: 'block', maxWidth: '100%', opacity: pdfRendered ? 1 : 0.3, transition: 'opacity 0.3s' }} />

            {/* Draggable signature box */}
              {pdfRendered && sigData && (
              <div onMouseDown={onSigMouseDown} onTouchStart={onSigMouseDown} style={{ position: 'absolute', left: sigBoxPos.x, top: sigBoxPos.y, width: SIG_W, height: SIG_H, border: `2px solid #C9933A`, borderRadius: 6, background: 'rgba(201,147,58,0.08)', cursor: isDraggingSig ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none', overflow: 'hidden', boxShadow: '0 0 0 4px rgba(201,147,58,0.15)' }}>
                <img src={sigData} alt="sig" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', filter: isDraggingSig ? 'brightness(1.2)' : 'none', background: '#ffffff', padding: 4 }} />
                <div style={{ position: 'absolute', bottom: 1, right: 4, fontSize: 9, color: '#C9933A', opacity: 0.7, fontFamily: 'Instrument Sans, sans-serif' }}>⠿ drag</div>
              </div>
            )}
          </div>

          {/* Page controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
              <button onClick={() => activePage > 1 && changePage(activePage - 1)} disabled={activePage <= 1} style={{ background: '#161624', border: '1px solid #252535', borderRadius: 7, padding: '6px 12px', fontSize: 12, color: '#9A94A8', cursor: activePage <= 1 ? 'not-allowed' : 'pointer', fontFamily: 'Instrument Sans, sans-serif' }}>← Prev</button>
              <span style={{ fontSize: 12, color: '#9A94A8' }}>Page {activePage} of {totalPages}</span>
              <button onClick={() => activePage < totalPages && changePage(activePage + 1)} disabled={activePage >= totalPages} style={{ background: '#161624', border: '1px solid #252535', borderRadius: 7, padding: '6px 12px', fontSize: 12, color: '#9A94A8', cursor: activePage >= totalPages ? 'not-allowed' : 'pointer', fontFamily: 'Instrument Sans, sans-serif' }}>Next →</button>
            </div>
          )}

          <p style={{ fontSize: 11, color: '#4A4A60', textAlign: 'center', marginBottom: 14 }}>
            💡 Drag the gold box to position your signature exactly where you want it.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('sign')} className="btn-ghost" style={{ flex: 1 }}>← Back</button>
            <button onClick={() => { setSigPos(computeSigPosition()); setStep('identify') }} className="btn-gold" style={{ flex: 1 }}>Confirm Placement →</button>
          </div>
        </div>
      )}

      {/* ── STEP: Identify ───────────────────────────────────────────────────── */}
      {step === 'identify' && (
        <div>
          <h2 style={H2}>Identity Verification</h2>
          <p style={SUB}>A quick selfie confirms your identity and strengthens the legal validity.</p>

          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #252535', background: '#080810', marginBottom: 14, position: 'relative', aspectRatio: '4/3', maxHeight: 300 }}>
            {!captured ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                {!camReady && !camError && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0A14', flexDirection: 'column', gap: 8 }}>
                    <div style={{ width: 28, height: 28, border: '2px solid #252535', borderTopColor: '#C9933A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <p style={{ fontSize: 12, color: '#4A4A60' }}>Starting camera…</p>
                  </div>
                )}
                {camError && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0A14', flexDirection: 'column', gap: 8, padding: 20, textAlign: 'center' }}>
                    <span style={{ fontSize: 28 }}>🚫</span>
                    <p style={{ color: '#E05B5B', fontSize: 12 }}>{camError}</p>
                  </div>
                )}
                {camReady && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: 110, height: 150, border: '2px solid rgba(201,147,58,0.6)', borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%' }} />
                  </div>
                )}
              </>
            ) : (
              photoData && <img src={photoData} alt="captured" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            )}
          </div>
          <canvas ref={photoCanvasRef} style={{ display: 'none' }} />

          <div style={{ display: 'flex', gap: 10 }}>
            {!captured ? (
              <>
                <button onClick={() => { setPhotoSkipped(true); stopCam(); setStep('confirm') }} className="btn-ghost" style={{ flex: 1 }}>Skip</button>
                <button onClick={capturePhoto} disabled={!camReady || !!camError} className="btn-gold" style={{ flex: 1 }}>
                  📸 Capture
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setPhotoData(null); setCaptured(false); startCam() }} className="btn-ghost" style={{ flex: 1 }}>Retake</button>
                <button onClick={() => setStep('confirm')} className="btn-gold" style={{ flex: 1 }}>Use Photo →</button>
              </>
            )}
          </div>
          {camError && !captured && (
            <button onClick={() => setStep('confirm')} className="btn-gold" style={{ width: '100%', marginTop: 10 }}>Continue Without Photo →</button>
          )}
          <button onClick={() => setStep('place')} style={{ background: 'none', border: 'none', color: '#4A4A60', fontSize: 12, cursor: 'pointer', marginTop: 10, display: 'block' }}>← Back</button>
        </div>
      )}

      {/* ── STEP: Confirm ────────────────────────────────────────────────────── */}
      {step === 'confirm' && (
        <div>
          <h2 style={H2}>Final Review</h2>
          <p style={SUB}>Review everything before submitting your signature.</p>

          <div style={{ background: '#0F0F1A', border: '1px solid #1E1E2E', borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: photoData ? '1fr auto' : '1fr', gap: 14, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[
                  { l: 'Document', v: doc.title },
                  { l: 'Signer', v: name },
                  { l: 'Email', v: email },
                  { l: 'Signature Type', v: sigMode === 'draw' ? 'Handwritten (drawn)' : 'Typed' },
                  { l: 'Identity Photo', v: photoData ? '✅ Captured' : photoSkipped ? '⚠️ Skipped' : '—' },
                  { l: 'GPS Location', v: locationData ? '📍 Captured' : '⏳ Requesting…' },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#4A4A60' }}>{r.l}</span>
                    <span style={{ fontSize: 12, color: '#EDE8DF', textAlign: 'right' }}>{r.v}</span>
                  </div>
                ))}
              </div>
              {photoData && <img src={photoData} alt="id" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, transform: 'scaleX(-1)', border: '2px solid #252535', flexShrink: 0 }} />}
            </div>
            {sigData && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1A1A28' }}>
                <p style={{ fontSize: 11, color: '#4A4A60', marginBottom: 6 }}>Signature preview:</p>
                <div style={{ background: '#0A0A14', borderRadius: 8, padding: 8, border: '1px solid #1E1E2E' }}>
                  <div style={{ background: '#ffffff', display: 'inline-block', padding: 6, borderRadius: 6 }}>
                    <img src={sigData} alt="sig" style={{ height: 50, maxWidth: '100%', objectFit: 'contain', display: 'block' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '12px 14px', background: 'rgba(201,147,58,0.06)', border: '1px solid rgba(201,147,58,0.2)', borderRadius: 9, marginBottom: 18 }}>
            <p style={{ fontSize: 12, color: '#9A94A8', lineHeight: 1.6 }}>
              🔐 <strong style={{ color: '#C9933A' }}>Legal Notice:</strong> By clicking Sign Document, your electronic signature becomes legally binding. Your IP address, device fingerprint, and timestamp are permanently recorded.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('identify')} className="btn-ghost" style={{ flex: 1 }}>← Back</button>
            <button onClick={submit} disabled={submitting} className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {submitting ? <><Spin />Processing…</> : '✍️ Sign Document'}
            </button>
          </div>
        </div>
      )}
    </Shell>
  )
}

// ── Shell layout ──────────────────────────────────────────────────────────

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', flexDirection: 'column' }}>
      <header style={{ borderBottom: '1px solid #1A1A28', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #C9933A, #E8B84B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#080810" strokeWidth="2.5" strokeLinecap="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 17, color: '#EDE8DF' }}>SignFlow</span>
        <span style={{ color: '#252535' }}>·</span>
        <span style={{ fontSize: 13, color: '#9A94A8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </header>
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '28px 16px' }}>
        <div style={{ width: '100%', maxWidth: 640, background: '#0F0F1A', border: '1px solid #1E1E2E', borderRadius: 18, padding: '28px 24px', boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>
          {children}
        </div>
      </main>
      <footer style={{ padding: '12px 20px', textAlign: 'center', borderTop: '1px solid #1A1A28' }}>
        <p style={{ fontSize: 11, color: '#252535' }}>Powered by SignFlow · Secure Electronic Signatures</p>
      </footer>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Spin() { return <div style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#080810', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> }

// Style constants
const H2: React.CSSProperties = { fontFamily: 'Playfair Display, serif', fontSize: 21, color: '#EDE8DF', marginBottom: 5 }
const SUB: React.CSSProperties = { color: '#9A94A8', fontSize: 13, marginBottom: 18 }
const LBL: React.CSSProperties = { fontSize: 12, color: '#9A94A8', display: 'block', marginBottom: 5 }