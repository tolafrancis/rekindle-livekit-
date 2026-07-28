-- Migration: Create push_tokens table, secure it with RLS, and add claim_push_token security definer function

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

-- Policy: Allow users to update their own push tokens
CREATE POLICY "Allow update for owner" ON push_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policy: Allow users to delete their own push tokens
CREATE POLICY "Allow delete for owner" ON push_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- SECURITY DEFINER Function to handle cross-user token claiming (for shared devices / kiosk mode)
CREATE OR REPLACE FUNCTION claim_push_token(
  p_device_token text,
  p_platform text DEFAULT 'web',
  p_role text DEFAULT 'user'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete any existing push token registration for this device_token that belongs to a different user
  DELETE FROM push_tokens
  WHERE device_token = p_device_token AND user_id != v_user_id;

  -- Upsert the current user's registration for this device token
  INSERT INTO push_tokens (user_id, device_token, platform, role, updated_at)
  VALUES (v_user_id, p_device_token, p_platform, p_role, now())
  ON CONFLICT (user_id, device_token)
  DO UPDATE SET
    platform = EXCLUDED.platform,
    role = EXCLUDED.role,
    updated_at = now();
END;
$$;
