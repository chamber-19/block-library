/*
  # Block Library Database Schema

  1. New Tables
    - `categories`
      - `id` (uuid, primary key)
      - `name` (text, unique) - Category name
      - `color` (text) - Hex color code
      - `icon` (text) - Emoji or icon identifier
      - `path` (text, nullable) - File system path
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `blocks`
      - `id` (uuid, primary key)
      - `name` (text) - Block name
      - `category_id` (uuid, foreign key) - References categories
      - `dwg_path` (text, nullable) - Path to DWG file
      - `thumbnail_url` (text, nullable) - URL to thumbnail
      - `last_modified` (timestamptz, nullable) - Last file modification
      - `metadata` (jsonb, nullable) - Additional block data
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `recent_files`
      - `id` (uuid, primary key)
      - `user_id` (uuid, nullable) - User who opened the file
      - `file_path` (text) - Full file path
      - `file_name` (text) - File name only
      - `file_type` (text) - File extension
      - `opened_at` (timestamptz) - When file was opened

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read/write their own data
    - Public read access for categories and blocks

  3. Indexes
    - Index on category names for fast lookups
    - Index on block names and categories for search
    - Index on recent_files by opened_at for sorting
*/

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text NOT NULL DEFAULT '#4a9eff',
  icon text NOT NULL DEFAULT '📦',
  path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create blocks table
CREATE TABLE IF NOT EXISTS blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  dwg_path text,
  thumbnail_url text,
  last_modified timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create recent_files table
CREATE TABLE IF NOT EXISTS recent_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  opened_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_blocks_name ON blocks(name);
CREATE INDEX IF NOT EXISTS idx_blocks_category ON blocks(category_id);
CREATE INDEX IF NOT EXISTS idx_recent_files_opened ON recent_files(opened_at DESC);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_files ENABLE ROW LEVEL SECURITY;

-- Categories policies (public read, authenticated write)
CREATE POLICY "Anyone can view categories"
  ON categories FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (true);

-- Blocks policies (public read, authenticated write)
CREATE POLICY "Anyone can view blocks"
  ON blocks FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert blocks"
  ON blocks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update blocks"
  ON blocks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete blocks"
  ON blocks FOR DELETE
  TO authenticated
  USING (true);

-- Recent files policies (users can only see their own)
CREATE POLICY "Users can view their own recent files"
  ON recent_files FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert their own recent files"
  ON recent_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete their own recent files"
  ON recent_files FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Insert default categories
INSERT INTO categories (name, color, icon) VALUES
  ('Relay Panels', '#4a9eff', '📦'),
  ('Schematic', '#6c5ce7', '📐'),
  ('Wiring', '#00cec9', '🔌'),
  ('Grounding', '#fd79a8', '⚡'),
  ('Conduit', '#fdcb6e', '🔧'),
  ('One-Line', '#e17055', '📊'),
  ('Vendor', '#00b894', '🏢'),
  ('Logic', '#a29bfe', '🧠'),
  ('Structural', '#fd79a8', '🏗️'),
  ('Equipment', '#fdcb6e', '⚙️'),
  ('Drafting Standards', '#00cec9', '📏'),
  ('Stamps', '#6c5ce7', '✅'),
  ('Logos', '#4a9eff', '🎨')
ON CONFLICT (name) DO NOTHING;
