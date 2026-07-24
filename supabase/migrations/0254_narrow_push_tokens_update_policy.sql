-- Migration: Narrow push_tokens UPDATE policy to prevent unauthorized cross-user claiming/updates
-- Drops the previous USING (true) policy and replaces it with USING (auth.uid() = user_id)

DROP POLICY IF EXISTS "Allow update for owner or claiming token" ON push_tokens;

CREATE POLICY "Allow update for owner or claiming token" ON push_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
