# SignFlow — DocuSign Mini Clone

A production-ready electronic signature platform built with **Next.js 14** + **Supabase**.

## ✨ Features

- 📄 **PDF Upload** — Drag & drop PDF upload with Supabase Storage
- 🔗 **Unique Signing Links** — Each document gets a secure, shareable URL
- ✍️ **Signature Canvas** — Smooth drawing on both desktop (mouse) and mobile (touch/stylus)
- 📷 **Selfie Verification** — Optional live photo capture for identity proof
- 🔒 **Device Fingerprinting** — Browser, OS, screen, timezone, language, platform captured
- 📍 **Geolocation** — Optional GPS coordinates recorded with consent
- 🧾 **PDF Embedding** — Signature is stamped directly into the PDF
- 📋 **Audit Certificate** — Full audit trail viewable from the dashboard
- ✅ **One-time Signing** — Documents can only be signed once

---

## 🚀 Quick Setup

### 1. Install dependencies

```bash
cd signflow
npm install
```

### 2. Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your **Project URL** and **API Keys** from Settings → API

### 3. Set up the database

In your Supabase dashboard → **SQL Editor**, paste and run the contents of:
```
supabase/schema.sql
```

This creates:
- `documents` table
- `signatures` table
- Storage buckets: `documents`, `signatures`, `signed-docs`
- RLS policies

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
signflow/
├── app/
│   ├── page.tsx                        # Dashboard (upload + manage docs)
│   ├── layout.tsx                      # Root layout
│   ├── globals.css                     # Global styles + design tokens
│   ├── api/
│   │   ├── upload/route.ts             # POST — upload PDF
│   │   ├── sign/route.ts               # POST — submit signature
│   │   └── documents/
│   │       ├── route.ts                # GET — list documents
│   │       └── [docId]/
│   │           └── signature/route.ts  # GET — signature details
│   └── sign/
│       └── [token]/
│           ├── page.tsx                # Server component (loads doc)
│           └── SigningClient.tsx       # Full signing experience
├── lib/
│   ├── supabase.ts                     # Browser Supabase client
│   └── supabase-server.ts              # Server Supabase client (admin)
├── supabase/
│   └── schema.sql                      # DB schema + storage setup
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🔄 Workflow

```
You (Dashboard)                    Client (Signing Page)
──────────────                     ─────────────────────
1. Upload PDF                      
2. Copy signing link  ──────────►  3. Opens link in browser
                                   4. Reviews document
                                   5. Draws signature
                                   6. Takes selfie (optional)
                                   7. Confirms & submits
8. See "Signed" badge  ◄──────────
9. View audit certificate
10. Download signed PDF
```

---

## 🗄️ Supabase Storage Buckets

| Bucket | Contents |
|--------|----------|
| `documents` | Original uploaded PDFs |
| `signatures` | Signature PNGs + selfie photos |
| `signed-docs` | Final signed PDFs with embedded signature |

---

## 🔐 Security Features

| Feature | Implementation |
|---------|---------------|
| IP Address | Captured from `x-forwarded-for` / `x-real-ip` headers |
| Browser fingerprint | `userAgent`, `platform`, `language`, `colorDepth` |
| Screen info | `screen.width × screen.height`, `viewport` |
| Timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| Geolocation | `navigator.geolocation` (user consent required) |
| Selfie photo | `getUserMedia({ facingMode: 'user' })` |
| One-time signing | `status = 'signed'` check before allowing signature |
| PDF audit trail | Timestamp + IP embedded in PDF footer |

---

## 🚢 Deployment (Vercel)

```bash
npm install -g vercel
vercel
```

Set environment variables in Vercel dashboard → Settings → Environment Variables.

Update `NEXT_PUBLIC_APP_URL` to your production URL.

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage |
| PDF Processing | pdf-lib |
| Styling | Tailwind CSS |
| Toasts | react-hot-toast |
| File Upload | react-dropzone |

---

## ⚠️ Troubleshooting

**"Failed to upload file"** → Make sure the `documents` bucket exists in Supabase Storage and is set to public.

**"Camera access denied"** → Camera requires HTTPS in production. On localhost it works without HTTPS.

**PDF not loading in iframe** → Check that the Supabase bucket is set to public and the file URL is correct.

**RLS errors** → Make sure you ran the full `schema.sql` including the RLS policies section.
