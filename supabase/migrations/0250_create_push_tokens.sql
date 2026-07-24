-- Migration: Create push_tokens table for Firebase Cloud Messaging tokens
-- Enables Row Level Security (RLS) to ensure users can only access their own tokens

CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  device_token text UNIQUE NOT NULL,
  platform text DEFAULT 'web',
  role text DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to view their own push tokens
CREATE POLICY "Allow select for owner" ON push_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Allow users to insert their own push tokens
CREATE POLICY "Allow insert for owner" ON push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Allow users to update their own push tokens or claim a token
-- using (true) lets them search for the conflicting token, but with check restricts them to claiming it as their own.
CREATE POLICY "Allow update for owner or claiming token" ON push_tokens
  FOR UPDATE USING (true) WITH CHECK (auth.uid() = user_id);

-- Policy: Allow users to delete their own push tokens
CREATE POLICY "Allow delete for owner" ON push_tokens
  FOR DELETE USING (auth.uid() = user_id);
