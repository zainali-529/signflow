import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
 
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { docId: string } }
) {
  try {
    const { docId } = params
 
    // Get document to find file paths
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('file_path')
      .eq('id', docId)
      .single()
 
    // Get signatures to clean up storage
    const { data: sigs } = await supabaseAdmin
      .from('signatures')
      .select('signature_path, photo_path, signed_doc_path')
      .eq('document_id', docId)
 
    // Delete storage files
    if (doc?.file_path) {
      await supabaseAdmin.storage.from('documents').remove([doc.file_path])
    }
 
    if (sigs) {
      for (const sig of sigs) {
        if (sig.signature_path) await supabaseAdmin.storage.from('signatures').remove([sig.signature_path])
        if (sig.photo_path) await supabaseAdmin.storage.from('signatures').remove([sig.photo_path])
        if (sig.signed_doc_path) await supabaseAdmin.storage.from('signed-docs').remove([sig.signed_doc_path])
      }
    }
 
    // Delete DB records (cascades to signatures)
    const { error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', docId)
 
    if (error) throw error
 
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete error:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { docId: string } }
) {
  try {
    const { data: signature, error } = await supabaseAdmin
      .from('signatures')
      .select('*')
      .eq('document_id', params.docId)
      .single()

    if (error || !signature) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 })
    }

    return NextResponse.json({ signature })
  } catch (error) {
    console.error('Fetch signature error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
