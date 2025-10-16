-- Complete setup script for new Supabase project
-- Run this in your new Supabase project's SQL Editor

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text NOT NULL DEFAULT '#4a9eff',
  icon text NOT NULL DEFAULT '📦',
  path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create blocks table
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

-- 3. Create recent_files table
CREATE TABLE IF NOT EXISTS recent_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  opened_at timestamptz DEFAULT now()
);

-- 4. Create operation_history table
CREATE TABLE IF NOT EXISTS operation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL CHECK (operation_type IN ('import', 'export', 'delete', 'update', 'bulk_update')),
  block_ids jsonb DEFAULT '[]'::jsonb,
  details jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  file_name text,
  file_size bigint,
  status text DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending'))
);

-- 5. Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  theme text DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
  favorites jsonb DEFAULT '[]'::jsonb,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Create block_comparisons table
CREATE TABLE IF NOT EXISTS block_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  block_ids jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_blocks_name ON blocks(name);
CREATE INDEX IF NOT EXISTS idx_blocks_category ON blocks(category_id);
CREATE INDEX IF NOT EXISTS idx_recent_files_opened ON recent_files(opened_at DESC);

-- 8. Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_comparisons ENABLE ROW LEVEL SECURITY;

-- 9. Create policies (PERMISSIVE FOR TESTING)
-- Categories policies
CREATE POLICY "Anyone can view categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Anyone can insert categories" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update categories" ON categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete categories" ON categories FOR DELETE USING (true);

-- Blocks policies  
CREATE POLICY "Anyone can view blocks" ON blocks FOR SELECT USING (true);
CREATE POLICY "Anyone can insert blocks" ON blocks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update blocks" ON blocks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete blocks" ON blocks FOR DELETE USING (true);

-- Recent files policies
CREATE POLICY "Anyone can view recent files" ON recent_files FOR SELECT USING (true);
CREATE POLICY "Anyone can insert recent files" ON recent_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete recent files" ON recent_files FOR DELETE USING (true);

-- Operation history policies
CREATE POLICY "Anyone can view operation history" ON operation_history FOR SELECT USING (true);
CREATE POLICY "Anyone can insert operation history" ON operation_history FOR INSERT WITH CHECK (true);

-- User preferences policies
CREATE POLICY "Anyone can view user preferences" ON user_preferences FOR SELECT USING (true);
CREATE POLICY "Anyone can insert user preferences" ON user_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update user preferences" ON user_preferences FOR UPDATE USING (true) WITH CHECK (true);

-- Block comparisons policies
CREATE POLICY "Anyone can view block comparisons" ON block_comparisons FOR SELECT USING (true);
CREATE POLICY "Anyone can insert block comparisons" ON block_comparisons FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update block comparisons" ON block_comparisons FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete block comparisons" ON block_comparisons FOR DELETE USING (true);

-- 10. Insert default categories with proper paths
INSERT INTO categories (name, color, icon, path) VALUES
  ('Relay Panels', '#e74c3c', '🔌', 'C:/BlockLibrary/Relay_Panels'),
  ('Schematic', '#3498db', '📋', 'C:/BlockLibrary/Schematic'),
  ('Wiring', '#f39c12', '🔌', 'C:/BlockLibrary/Wiring'),
  ('Grounding', '#27ae60', '⚡', 'C:/BlockLibrary/Grounding'),
  ('Conduit', '#9b59b6', '🔧', 'C:/BlockLibrary/Conduit'),
  ('One-Line', '#e67e22', '📊', 'C:/BlockLibrary/One_Line'),
  ('Vendor', '#34495e', '🏢', 'C:/BlockLibrary/Vendor'),
  ('Logic', '#1abc9c', '🧠', 'C:/BlockLibrary/Logic'),
  ('Structural', '#95a5a6', '🏗️', 'C:/BlockLibrary/Structural'),
  ('Equipment', '#2c3e50', '⚙️', 'C:/BlockLibrary/Equipment'),
  ('Drafting Standards', '#8e44ad', '📐', 'C:/BlockLibrary/Drafting_Standards'),
  ('Stamps', '#d35400', '🔖', 'C:/BlockLibrary/Stamps'),
  ('Logos', '#c0392b', '🎨', 'C:/BlockLibrary/Logos')
ON CONFLICT (name) DO UPDATE SET
  path = EXCLUDED.path,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon;

-- 11. Add some sample blocks for testing
INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata)
SELECT
  'ground_grid',
  c.id,
  'C:/BlockLibrary/Grounding/ground_grid.dwg',
  NOW(),
  '{"type": "grounding", "voltage": "any"}'::jsonb
FROM categories c WHERE c.name = 'Grounding'
ON CONFLICT DO NOTHING;

INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata)
SELECT
  'equipment_ground',
  c.id,
  'C:/BlockLibrary/Grounding/equipment_ground.dwg',
  NOW(),
  '{"type": "grounding", "voltage": "any"}'::jsonb
FROM categories c WHERE c.name = 'Grounding'
ON CONFLICT DO NOTHING;

-- Verify setup
SELECT 'Categories created:' as info, count(*) as count FROM categories
UNION ALL
SELECT 'Blocks created:', count(*) FROM blocks
UNION ALL
SELECT 'Policies created:', count(*) FROM pg_policies WHERE tablename IN ('categories', 'blocks');
