-- ============================================================
-- SignFlow Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'expired')),
  recipient_name  TEXT,
  recipient_email TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  signed_at   TIMESTAMPTZ
);

-- Signatures table
CREATE TABLE IF NOT EXISTS signatures (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id     UUID REFERENCES documents(id) ON DELETE CASCADE,
  signer_name     TEXT NOT NULL,
  signer_email    TEXT NOT NULL,
  signature_path  TEXT NOT NULL,        -- signature image in storage
  photo_path      TEXT,                 -- selfie in storage
  signed_doc_url  TEXT,                 -- final signed PDF URL
  signed_doc_path TEXT,
  ip_address      TEXT,
  user_agent      TEXT,
  device_info     JSONB,               -- screen, browser, OS, timezone etc
  location_data   JSONB,               -- GPS if granted
  signed_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Storage Buckets (run these separately or create in dashboard)
-- ============================================================

-- Create storage buckets via Supabase dashboard:
-- 1. "documents"       → Public bucket
-- 2. "signatures"      → Public bucket  
-- 3. "signed-docs"     → Public bucket

-- Or run via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('documents', 'documents', true),
  ('signatures', 'signatures', true),
  ('signed-docs', 'signed-docs', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS Policies (disable RLS for simplicity, or use these)
-- ============================================================

-- Allow all operations (for MVP without auth)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read documents" ON documents FOR SELECT USING (true);
CREATE POLICY "Public read signatures" ON signatures FOR SELECT USING (true);

-- Service role write access (API routes use service role key)
CREATE POLICY "Service insert documents" ON documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update documents" ON documents FOR UPDATE USING (true);
CREATE POLICY "Service insert signatures" ON signatures FOR INSERT WITH CHECK (true);

-- Storage policies
CREATE POLICY "Public read documents storage" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Public read signatures storage" ON storage.objects FOR SELECT USING (bucket_id = 'signatures');
CREATE POLICY "Public read signed-docs storage" ON storage.objects FOR SELECT USING (bucket_id = 'signed-docs');
CREATE POLICY "Service write documents storage" ON storage.objects FOR INSERT WITH CHECK (bucket_id IN ('documents', 'signatures', 'signed-docs'));
CREATE POLICY "Service update storage" ON storage.objects FOR UPDATE USING (bucket_id IN ('documents', 'signatures', 'signed-docs'));
