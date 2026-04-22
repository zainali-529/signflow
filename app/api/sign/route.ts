import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export const dynamic = 'force-dynamic'

interface SigPos { xPct: number; yPct: number; wPct: number; hPct: number; page: number }

interface SignPayload {
  token: string
  signerName: string
  signerEmail: string
  signatureData: string
  photoData: string | null
  deviceInfo: Record<string, string>
  locationData: { latitude: number; longitude: number } | null
  signaturePosition: SigPos | null
}

function dataURLToBytes(dataURL: string): Uint8Array {
  return new Uint8Array(Buffer.from(dataURL.split(',')[1], 'base64'))
}

function getIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || req.headers.get('cf-connecting-ip')
    || 'Unknown'
}

export async function POST(request: NextRequest) {
  try {
    const body: SignPayload = await request.json()
    const { token, signerName, signerEmail, signatureData, photoData, deviceInfo, locationData, signaturePosition } = body

    if (!token || !signerName || !signerEmail || !signatureData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get document
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('token', token)
      .single()

    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    if (doc.status === 'signed') return NextResponse.json({ error: 'Document already signed' }, { status: 409 })

    // Check expiry
    if (doc.expires_at && new Date(doc.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Signing link has expired' }, { status: 410 })
    }

    const signedAt = new Date()
    const ipAddress = getIP(request)

    // ── Upload signature image ──────────────────────────────────────────

    const sigBytes = dataURLToBytes(signatureData)
    const sigPath = `${doc.id}/signature_${Date.now()}.png`
    await supabaseAdmin.storage.from('signatures').upload(sigPath, sigBytes, { contentType: 'image/png' })

    // ── Upload selfie (optional) ────────────────────────────────────────

    let photoPath: string | null = null
    if (photoData) {
      const photoBytes = dataURLToBytes(photoData)
      photoPath = `${doc.id}/photo_${Date.now()}.jpg`
      const { error } = await supabaseAdmin.storage.from('signatures').upload(photoPath, photoBytes, { contentType: 'image/jpeg' })
      if (error) photoPath = null
    }

    // ── Embed signature in PDF ──────────────────────────────────────────

    let signedDocUrl: string | null = null
    let signedDocPath: string | null = null

    try {
      const pdfRes = await fetch(doc.file_url)
      if (!pdfRes.ok) throw new Error('Could not fetch PDF')
      const pdfBuf = await pdfRes.arrayBuffer()
      const pdfDoc = await PDFDocument.load(pdfBuf)

      const sigPng = await pdfDoc.embedPng(sigBytes)
      const pages = pdfDoc.getPages()

      // Determine target page (from drag placement or default to last page)
      const targetPageIdx = signaturePosition ? Math.min(signaturePosition.page - 1, pages.length - 1) : pages.length - 1
      const targetPage = pages[targetPageIdx]
      const { width: pW, height: pH } = targetPage.getSize()

      let sigX: number, sigY: number, sigW: number, sigH: number

      if (signaturePosition) {
        // Use exact drag-placed position
        sigW = signaturePosition.wPct * pW
        sigH = signaturePosition.hPct * pH
        sigX = signaturePosition.xPct * pW
        // PDF y-axis is flipped (0 = bottom)
        sigY = pH - (signaturePosition.yPct * pH) - sigH
      } else {
        // Default: bottom-right
        sigW = 200; sigH = 70
        sigX = pW - sigW - 40
        sigY = 30
      }

      // Background box
      targetPage.drawRectangle({
        x: sigX - 5, y: sigY - 5, width: sigW + 10, height: sigH + 30,
        color: rgb(0.99, 0.99, 0.99), borderColor: rgb(0.78, 0.57, 0.2), borderWidth: 0.75, opacity: 0.92,
      })

      // Signature image
      targetPage.drawImage(sigPng, { x: sigX, y: sigY + 14, width: sigW, height: sigH - 14 })

      // Name + timestamp text
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
      const fontN = await pdfDoc.embedFont(StandardFonts.Helvetica)
      targetPage.drawText(signerName, { x: sigX, y: sigY + 4, size: 8, font: fontN, color: rgb(0.15, 0.15, 0.15) })
      targetPage.drawText(signedAt.toISOString().slice(0, 10), { x: sigX + 120, y: sigY + 4, size: 7, font, color: rgb(0.5, 0.5, 0.5) })

      // Footer audit line on last page
      const lastPage = pages[pages.length - 1]
      const { width: lW } = lastPage.getSize()
      const footerFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
      lastPage.drawText(`Electronically signed by ${signerName} <${signerEmail}>  |  IP: ${ipAddress}  |  ${signedAt.toISOString()}  |  SignFlow`, {
        x: 30, y: 8, size: 6.5, font: footerFont, color: rgb(0.55, 0.55, 0.55),
        maxWidth: lW - 60,
      })

      // Save and upload
      const signedBytes = await pdfDoc.save()
      signedDocPath = `${doc.id}/signed_${Date.now()}.pdf`
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('signed-docs')
        .upload(signedDocPath, signedBytes, { contentType: 'application/pdf' })

      if (!uploadErr) {
        signedDocUrl = supabaseAdmin.storage.from('signed-docs').getPublicUrl(signedDocPath).data.publicUrl
      }
    } catch (pdfErr) {
      console.error('PDF error (non-fatal):', pdfErr)
    }

    // ── Save signature record ───────────────────────────────────────────

    await supabaseAdmin.from('signatures').insert({
      document_id: doc.id,
      signer_name: signerName,
      signer_email: signerEmail,
      signature_path: sigPath,
      photo_path: photoPath,
      signed_doc_url: signedDocUrl,
      signed_doc_path: signedDocPath,
      ip_address: ipAddress,
      user_agent: deviceInfo.userAgent,
      device_info: deviceInfo,
      location_data: locationData,
      signed_at: signedAt.toISOString(),
    })

    // ── Mark document signed ────────────────────────────────────────────

    await supabaseAdmin.from('documents').update({ status: 'signed', signed_at: signedAt.toISOString() }).eq('id', doc.id)

    return NextResponse.json({ success: true, signed_doc_url: signedDocUrl, signed_at: signedAt.toISOString() })
  } catch (err) {
    console.error('Sign API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}