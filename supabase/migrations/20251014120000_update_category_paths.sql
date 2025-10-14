-- Update categories with folder paths
UPDATE categories SET path = 'C:/BlockLibrary/Relay_Panels' WHERE name = 'Relay Panels';
UPDATE categories SET path = 'C:/BlockLibrary/Schematic' WHERE name = 'Schematic';
UPDATE categories SET path = 'C:/BlockLibrary/Wiring' WHERE name = 'Wiring';
UPDATE categories SET path = 'C:/BlockLibrary/Grounding' WHERE name = 'Grounding';
UPDATE categories SET path = 'C:/BlockLibrary/Conduit' WHERE name = 'Conduit';
UPDATE categories SET path = 'C:/BlockLibrary/One_Line' WHERE name = 'One-Line';
UPDATE categories SET path = 'C:/BlockLibrary/Vendor' WHERE name = 'Vendor';
UPDATE categories SET path = 'C:/BlockLibrary/Logic' WHERE name = 'Logic';
UPDATE categories SET path = 'C:/BlockLibrary/Structural' WHERE name = 'Structural';
UPDATE categories SET path = 'C:/BlockLibrary/Equipment' WHERE name = 'Equipment';
UPDATE categories SET path = 'C:/BlockLibrary/Drafting_Standards' WHERE name = 'Drafting Standards';
UPDATE categories SET path = 'C:/BlockLibrary/Stamps' WHERE name = 'Stamps';

-- Insert some sample blocks for testing
INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata) 
SELECT 
  'ground_rod',
  c.id,
  'C:/BlockLibrary/Grounding/ground_rod.dwg',
  NOW(),
  '{"type": "grounding", "voltage": "any"}'::jsonb
FROM categories c WHERE c.name = 'Grounding'
ON CONFLICT DO NOTHING;

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

INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata) 
SELECT 
  'relay_panel_1',
  c.id,
  'C:/BlockLibrary/Relay_Panels/relay_panel_1.dwg',
  NOW(),
  '{"type": "panel", "voltage": "480V"}'::jsonb
FROM categories c WHERE c.name = 'Relay Panels'
ON CONFLICT DO NOTHING;

INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata) 
SELECT 
  'relay_panel_2',
  c.id,
  'C:/BlockLibrary/Relay_Panels/relay_panel_2.dwg',
  NOW(),
  '{"type": "panel", "voltage": "480V"}'::jsonb
FROM categories c WHERE c.name = 'Relay Panels'
ON CONFLICT DO NOTHING;

INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata) 
SELECT 
  'single_line',
  c.id,
  'C:/BlockLibrary/Schematic/single_line.dwg',
  NOW(),
  '{"type": "schematic", "diagram_type": "single_line"}'::jsonb
FROM categories c WHERE c.name = 'Schematic'
ON CONFLICT DO NOTHING;

INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata) 
SELECT 
  'three_line',
  c.id,
  'C:/BlockLibrary/Schematic/three_line.dwg',
  NOW(),
  '{"type": "schematic", "diagram_type": "three_line"}'::jsonb
FROM categories c WHERE c.name = 'Schematic'
ON CONFLICT DO NOTHING;

INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata) 
SELECT 
  'conduit_run',
  c.id,
  'C:/BlockLibrary/Wiring/conduit_run.dwg',
  NOW(),
  '{"type": "wiring", "conduit_size": "2_inch"}'::jsonb
FROM categories c WHERE c.name = 'Wiring'
ON CONFLICT DO NOTHING;

INSERT INTO blocks (name, category_id, dwg_path, last_modified, metadata) 
SELECT 
  'cable_tray',
  c.id,
  'C:/BlockLibrary/Wiring/cable_tray.dwg',
  NOW(),
  '{"type": "wiring", "tray_width": "12_inch"}'::jsonb
FROM categories c WHERE c.name = 'Wiring'
ON CONFLICT DO NOTHING;
