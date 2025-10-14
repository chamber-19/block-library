/*
  # Add History Tracking and Enhanced Features

  1. New Tables
    - `operation_history`
      - `id` (uuid, primary key)
      - `operation_type` (text) - 'import', 'export', 'delete', 'update'
      - `block_ids` (jsonb) - array of affected block IDs
      - `details` (jsonb) - operation metadata
      - `user_id` (uuid) - who performed the operation
      - `created_at` (timestamptz)
      - `file_name` (text) - for import/export operations
      - `file_size` (bigint) - size in bytes
      - `status` (text) - 'success', 'failed', 'pending'
    
    - `user_preferences`
      - `id` (uuid, primary key)
      - `user_id` (uuid, unique) - foreign key to auth.users
      - `theme` (text) - 'light' or 'dark'
      - `favorites` (jsonb) - array of favorited block IDs
      - `settings` (jsonb) - other user settings
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `block_comparisons`
      - `id` (uuid, primary key)
      - `user_id` (uuid)
      - `block_ids` (jsonb) - array of blocks being compared
      - `notes` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to manage their own data
*/

-- Operation History Table
CREATE TABLE IF NOT EXISTS operation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL CHECK (operation_type IN ('import', 'export', 'delete', 'update', 'bulk_update')),
  block_ids jsonb DEFAULT '[]'::jsonb,
  details jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  file_name text,
  file_size bigint,
  status text DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending'))
);

ALTER TABLE operation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operation history"
  ON operation_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own operation history"
  ON operation_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
  favorites jsonb DEFAULT '[]'::jsonb,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Block Comparisons Table
CREATE TABLE IF NOT EXISTS block_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  block_ids jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE block_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own comparisons"
  ON block_comparisons FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comparisons"
  ON block_comparisons FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comparisons"
  ON block_comparisons FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comparisons"
  ON block_comparisons FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_operation_history_user_id ON operation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_history_created_at ON operation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_history_type ON operation_history(operation_type);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_block_comparisons_user_id ON block_comparisons(user_id);