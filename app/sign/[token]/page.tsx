import { supabaseAdmin } from '@/lib/supabase-server'
import SigningClient from './SigningClient'
import { notFound } from 'next/navigation'

// CRITICAL: force-dynamic prevents Next.js from caching this page
// so "already signed" status always reflects reality on refresh
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: { token: string }
}

export default async function SignPage({ params }: PageProps) {
  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('token', params.token)
    .single()

  if (!document) return notFound()

  return <SigningClient document={document} token={params.token} />
}

export async function generateMetadata({ params }: PageProps) {
  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('title')
    .eq('token', params.token)
    .single()

  return {
    title: document ? `Sign: ${document.title} — SignFlow` : 'Document Not Found',
  }
}