import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

// Prevent Next.js from caching this route
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ documents }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (error) {
    console.error('Fetch documents error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}