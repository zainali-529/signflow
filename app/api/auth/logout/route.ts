import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  // delete accepts a single argument (cookie name) in newer Next types
  res.cookies.delete('sf_auth')
  return res
}
