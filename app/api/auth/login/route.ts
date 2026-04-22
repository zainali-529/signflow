import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()
    const ADMIN_USER = process.env.ADMIN_USER || 'admin'
    const ADMIN_PASS = process.env.ADMIN_PASS || 'password'

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const res = NextResponse.json({ ok: true })
      // Set a simple HttpOnly cookie to mark authenticated session
      res.cookies.set('sf_auth', '1', { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7 })
      return res
    }
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  } catch (err) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
