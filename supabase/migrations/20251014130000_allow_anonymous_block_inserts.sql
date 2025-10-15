-- Temporary policy to allow anonymous block inserts for testing
-- This should be removed in production and replaced with proper authentication

CREATE POLICY "Anonymous users can insert blocks (TESTING ONLY)"
  ON blocks FOR INSERT
  TO anon
  WITH CHECK (true);

-- Also allow anonymous updates for category paths
CREATE POLICY "Anonymous users can update categories (TESTING ONLY)"
  ON categories FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
