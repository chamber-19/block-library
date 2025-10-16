-- Run this SQL in your Supabase SQL Editor to fix the authentication issues
-- This allows anonymous users to insert blocks for testing purposes

-- Allow anonymous users to insert blocks (TESTING ONLY)
CREATE POLICY IF NOT EXISTS "Anonymous users can insert blocks (TESTING ONLY)"
  ON blocks FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous users to update categories (TESTING ONLY)  
CREATE POLICY IF NOT EXISTS "Anonymous users can update categories (TESTING ONLY)"
  ON categories FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Verify the policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('blocks', 'categories')
ORDER BY tablename, policyname;
