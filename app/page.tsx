'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { formatDistanceToNow, format, isPast } from 'date-fns'

interface Document {
  id: string
  title: string
  file_url: string
  token: string
  status: 'pending' | 'signed' | 'expired'
  recipient_name?: string
  recipient_email?: string
  created_at: string
  signed_at?: string
  expires_at?: string
}

interface SignatureDetail {
  signer_name: string
  signer_email: string
  signed_at: string
  ip_address: string
  device_info: Record<string, string>
  location_data?: Record<string, number>
  signed_doc_url?: string
}

export default function Dashboard() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<SignatureDetail | null>(null)
  const [certLoading, setCertLoading] = useState(false)
  const [uploadForm, setUploadForm] = useState({ title: '', recipientName: '', recipientEmail: '', expiresIn: '7', file: null as File | null })
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [newDocResult, setNewDocResult] = useState<{ signingUrl: string; title: string } | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'signed'>('all')

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/documents', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      })
      if (!res.ok) throw new Error('API error ' + res.status)
      const data = await res.json()
      setDocuments(Array.isArray(data.documents) ? data.documents : [])
    } catch (err) {
      console.error('fetchDocuments error:', err)
      toast.error('Failed to load documents')
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const onDrop = useCallback((files: File[]) => {
    const f = files[0]
    if (!f) return
    if (f.type !== 'application/pdf') { toast.error('Only PDF files supported'); return }
    setUploadForm(p => ({ ...p, file: f, title: p.title || f.name.replace('.pdf', '') }))
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, maxSize: 20 * 1024 * 1024,
  })

  const handleUpload = async () => {
    if (!uploadForm.file) return toast.error('Select a PDF file')
    if (!uploadForm.title.trim()) return toast.error('Enter a document title')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadForm.file)
      fd.append('title', uploadForm.title)
      fd.append('recipientName', uploadForm.recipientName)
      fd.append('recipientEmail', uploadForm.recipientEmail)
      fd.append('expiresIn', uploadForm.expiresIn)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setShowUploadModal(false)
      setUploadForm({ title: '', recipientName: '', recipientEmail: '', expiresIn: '7', file: null })
      await fetchDocuments()
      setNewDocResult({ signingUrl: data.signingUrl, title: data.document.title })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/sign/${token}`)
    toast.success('Signing link copied!')
  }

  const viewCert = async (docId: string) => {
    setCertLoading(true)
    try {
      const res = await fetch(`/api/documents/${docId}/signature`, { cache: 'no-store' })
      const data = await res.json()
      if (data.signature) setSelectedDoc(data.signature)
      else toast.error('No signature found')
    } catch { toast.error('Failed to load certificate') }
    finally { setCertLoading(false) }
  }

  const deleteDoc = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Deleted')
      setDeleteConfirm(null)
      setDocuments(p => p.filter(d => d.id !== id))
    } catch { toast.error('Delete failed') }
  }

  const getStatus = (doc: Document) => {
    if (doc.status === 'signed') return 'signed'
    if (doc.expires_at && isPast(new Date(doc.expires_at))) return 'expired'
    return 'pending'
  }

  const filtered = documents.filter(d => filter === 'all' || getStatus(d) === filter)

  return (
    <div style={{ minHeight: '100vh', background: '#080810' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #1A1A28', background: 'rgba(8,8,16,0.95)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, #C9933A, #E8B84B)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080810" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </div>
            <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 19, fontWeight: 600, color: '#EDE8DF' }}>SignFlow</span>
          </div>
          <button onClick={() => setShowUploadModal(true)} className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Document
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '36px 24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total', value: documents.length, icon: '📄', color: '#C9933A' },
            { label: 'Pending', value: documents.filter(d => getStatus(d) === 'pending').length, icon: '⏳', color: '#E8B84B' },
            { label: 'Signed', value: documents.filter(d => d.status === 'signed').length, icon: '✅', color: '#3DB87A' },
          ].map(s => (
            <div key={s.label} style={{ background: '#0F0F1A', border: '1px solid #1E1E2E', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: 'Playfair Display, serif' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#4A4A60', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters + refresh */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center' }}>
          {(['all', 'pending', 'signed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Instrument Sans, sans-serif', background: filter === f ? '#C9933A' : '#161624', color: filter === f ? '#080810' : '#9A94A8', border: `1px solid ${filter === f ? '#C9933A' : '#252535'}`, fontWeight: filter === f ? 600 : 400 }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button onClick={fetchDocuments} style={{ marginLeft: 'auto', padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', background: '#161624', border: '1px solid #252535', color: '#4A4A60', fontFamily: 'Instrument Sans, sans-serif', transition: 'all 0.2s' }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#C9933A'; b.style.borderColor = '#C9933A' }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#4A4A60'; b.style.borderColor = '#252535' }}
          >↻ Refresh</button>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#4A4A60' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #252535', borderTopColor: '#C9933A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            Loading documents…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#0F0F1A', border: '2px dashed #252535', borderRadius: 14, padding: '50px 30px', textAlign: 'center' }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>📋</div>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#EDE8DF', marginBottom: 8 }}>
              {filter === 'all' ? 'No documents yet' : `No ${filter} documents`}
            </h3>
            {filter === 'all' && <button onClick={() => setShowUploadModal(true)} className="btn-gold" style={{ marginTop: 8 }}>Upload First Document</button>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {filtered.map(doc => {
              const status = getStatus(doc)
              return (
                <div key={doc.id} className="doc-card" style={{ background: '#0F0F1A', border: '1px solid #1E1E2E', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#161624', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9933A" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#EDE8DF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                      <div style={{ fontSize: 11, color: '#4A4A60', marginTop: 2 }}>
                        {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                        {doc.recipient_name && ` · ${doc.recipient_name}`}
                        {doc.expires_at && status === 'pending' && ` · Expires ${format(new Date(doc.expires_at), 'MMM d')}`}
                        {status === 'signed' && doc.signed_at && ` · Signed ${format(new Date(doc.signed_at), 'MMM d, yyyy')}`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600, ...(status === 'signed' ? { background: 'rgba(61,184,122,0.12)', color: '#3DB87A', border: '1px solid rgba(61,184,122,0.25)' } : status === 'expired' ? { background: 'rgba(224,91,91,0.1)', color: '#E05B5B', border: '1px solid rgba(224,91,91,0.2)' } : { background: 'rgba(201,147,58,0.1)', color: '#E8B84B', border: '1px solid rgba(201,147,58,0.25)' }) }}>
                        {status === 'signed' ? '✓ Signed' : status === 'expired' ? '⌛ Expired' : '⏳ Pending'}
                      </span>

                      {status === 'pending' && (
                        <Btn onClick={() => copyLink(doc.token)} title="Copy signing link" variant="ghost">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                          Copy
                        </Btn>
                      )}

                      {status === 'signed' && (
                        <Btn onClick={() => viewCert(doc.id)} variant="success">
                          {certLoading ? '…' : 'Certificate'}
                        </Btn>
                      )}

                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ background: '#161624', border: '1px solid #252535', borderRadius: 7, padding: '5px 11px', fontSize: 12, color: '#9A94A8', textDecoration: 'none', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onMouseEnter={e => { const a = e.currentTarget as HTMLAnchorElement; a.style.color = '#EDE8DF'; a.style.borderColor = '#4A4A60' }}
                        onMouseLeave={e => { const a = e.currentTarget as HTMLAnchorElement; a.style.color = '#9A94A8'; a.style.borderColor = '#252535' }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </a>

                      <button onClick={() => setDeleteConfirm(doc.id)} style={{ background: 'rgba(224,91,91,0.06)', border: '1px solid rgba(224,91,91,0.2)', borderRadius: 7, padding: '5px 9px', color: '#E05B5B', cursor: 'pointer', transition: 'all 0.2s', lineHeight: 1 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(224,91,91,0.15)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(224,91,91,0.06)' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <Modal onClose={() => setShowUploadModal(false)}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#EDE8DF', marginBottom: 18 }}>New Document</h2>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? '#C9933A' : uploadForm.file ? '#3DB87A' : '#252535'}`, borderRadius: 10, padding: '24px 16px', textAlign: 'center', cursor: 'pointer', background: isDragActive ? 'rgba(201,147,58,0.06)' : uploadForm.file ? 'rgba(61,184,122,0.06)' : '#161624', transition: 'all 0.2s', marginBottom: 16 }}>
            <input {...getInputProps()} />
            {uploadForm.file
              ? <><div style={{ fontSize: 26, marginBottom: 5 }}>📄</div><p style={{ color: '#3DB87A', fontWeight: 500, fontSize: 13 }}>{uploadForm.file.name}</p><p style={{ color: '#4A4A60', fontSize: 11, marginTop: 3 }}>{(uploadForm.file.size / 1024 / 1024).toFixed(2)} MB · click to change</p></>
              : <><div style={{ fontSize: 26, marginBottom: 5 }}>☁️</div><p style={{ color: '#EDE8DF', fontWeight: 500, fontSize: 13 }}>{isDragActive ? 'Drop here' : 'Drag & drop PDF'}</p><p style={{ color: '#4A4A60', fontSize: 11 }}>or click to browse · max 20MB</p></>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <SF label="Document Title *" placeholder="e.g. Service Agreement 2025" value={uploadForm.title} onChange={v => setUploadForm(p => ({ ...p, title: v }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SF label="Recipient Name" placeholder="Client name" value={uploadForm.recipientName} onChange={v => setUploadForm(p => ({ ...p, recipientName: v }))} />
              <SF label="Recipient Email" placeholder="email" type="email" value={uploadForm.recipientEmail} onChange={v => setUploadForm(p => ({ ...p, recipientEmail: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#9A94A8', display: 'block', marginBottom: 5 }}>Link Expires In</label>
              <select className="sf-input" value={uploadForm.expiresIn} onChange={e => setUploadForm(p => ({ ...p, expiresIn: e.target.value }))} style={{ cursor: 'pointer' }}>
                <option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option>
                <option value="14">14 days</option><option value="30">30 days</option><option value="0">No expiry</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => setShowUploadModal(false)} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
            <button onClick={handleUpload} disabled={uploading || !uploadForm.file || !uploadForm.title} className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {uploading ? <><Spin />Uploading…</> : '↑ Upload & Get Link'}
            </button>
          </div>
        </Modal>
      )}

      {/* New doc success — show link */}
      {newDocResult && (
        <Modal onClose={() => setNewDocResult(null)}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(61,184,122,0.15)', border: '2px solid #3DB87A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 22 }}>✓</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 19, color: '#EDE8DF', marginBottom: 5 }}>Ready to Send!</h2>
            <p style={{ color: '#9A94A8', fontSize: 13, marginBottom: 16 }}>Share this link with <strong style={{ color: '#EDE8DF' }}>{newDocResult.title}</strong></p>
            <div style={{ background: '#161624', border: '1px solid #252535', borderRadius: 9, padding: '10px 12px', marginBottom: 14, wordBreak: 'break-all', fontSize: 11, color: '#C9933A', textAlign: 'left', fontFamily: 'monospace' }}>
              {newDocResult.signingUrl}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { navigator.clipboard.writeText(newDocResult.signingUrl); toast.success('Copied!') }} className="btn-gold" style={{ flex: 1 }}>Copy Link</button>
              <button onClick={() => setNewDocResult(null)} className="btn-ghost" style={{ flex: 1 }}>Done</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗑️</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#EDE8DF', marginBottom: 7 }}>Delete Document?</h2>
            <p style={{ color: '#9A94A8', fontSize: 13, marginBottom: 22 }}>This permanently deletes the document and all signatures. Cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={() => deleteDoc(deleteConfirm)} style={{ flex: 1, background: '#E05B5B', border: 'none', borderRadius: 8, padding: 11, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'Instrument Sans, sans-serif' }}>Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Signature Certificate */}
      {selectedDoc && (
        <Modal onClose={() => setSelectedDoc(null)} wide>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 19, color: '#EDE8DF', marginBottom: 4 }}>Signature Certificate</h2>
          <p style={{ fontSize: 11, color: '#4A4A60', marginBottom: 18 }}>Legal audit trail · tamper-evident record</p>
          <div>
            {[
              ['Signer', selectedDoc.signer_name],
              ['Email', selectedDoc.signer_email],
              ['Signed At', new Date(selectedDoc.signed_at).toLocaleString()],
              ['IP Address', selectedDoc.ip_address],
              ['Browser', selectedDoc.device_info?.browser],
              ['OS', selectedDoc.device_info?.os],
              ['Screen', selectedDoc.device_info?.screen],
              ['Timezone', selectedDoc.device_info?.timezone],
              ['Language', selectedDoc.device_info?.language],
              ['Touch Device', selectedDoc.device_info?.touchSupport === 'true' ? 'Yes (mobile/tablet)' : 'No (desktop)'],
              selectedDoc.location_data?.latitude ? ['GPS Location', `${Number(selectedDoc.location_data.latitude).toFixed(5)}, ${Number(selectedDoc.location_data.longitude).toFixed(5)}`] : null,
            ].filter(Boolean).map(row => row && (
              <div key={row[0] as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1A1A28' }}>
                <span style={{ fontSize: 12, color: '#4A4A60', minWidth: 100 }}>{row[0]}</span>
                <span style={{ fontSize: 12, color: '#EDE8DF', textAlign: 'right', wordBreak: 'break-all', maxWidth: '62%' }}>{row[1]}</span>
              </div>
            ))}
          </div>
          {selectedDoc.signed_doc_url && (
            <a href={selectedDoc.signed_doc_url} target="_blank" rel="noopener noreferrer" className="btn-gold" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, textDecoration: 'none' }}>
              ↓ Download Signed PDF
            </a>
          )}
        </Modal>
      )}
    </div>
  )
}

// ── Micro components ──────────────────────────────────────────────────────

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#0F0F1A', border: '1px solid #252535', borderRadius: 18, padding: 26, width: '100%', maxWidth: wide ? 540 : 480, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, background: '#161624', border: '1px solid #252535', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9A94A8' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        {children}
      </div>
    </div>
  )
}

function SF({ label, placeholder, value, onChange, type = 'text' }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: '#9A94A8', display: 'block', marginBottom: 5 }}>{label}</label>
      <input className="sf-input" type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function Btn({ onClick, children, variant, title }: { onClick: () => void; children: React.ReactNode; variant: 'ghost' | 'success'; title?: string }) {
  const base: React.CSSProperties = { borderRadius: 7, padding: '5px 11px', fontSize: 12, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Instrument Sans, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid' }
  const styles = variant === 'ghost' ? { ...base, background: '#161624', borderColor: '#252535', color: '#9A94A8' } : { ...base, background: 'rgba(61,184,122,0.08)', borderColor: 'rgba(61,184,122,0.25)', color: '#3DB87A' }
  return <button onClick={onClick} style={styles} title={title}>{children}</button>
}

function Spin() {
  return <div style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#080810', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
}