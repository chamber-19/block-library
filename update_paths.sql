-- Update category paths to use C:/Block-Library instead of C:/BlockLibrary

UPDATE categories SET path = 'C:/Block-Library/Relay_Panels' WHERE name = 'Relay Panels';
UPDATE categories SET path = 'C:/Block-Library/Schematic' WHERE name = 'Schematic';
UPDATE categories SET path = 'C:/Block-Library/Wiring' WHERE name = 'Wiring';
UPDATE categories SET path = 'C:/Block-Library/Grounding' WHERE name = 'Grounding';
UPDATE categories SET path = 'C:/Block-Library/Conduit' WHERE name = 'Conduit';
UPDATE categories SET path = 'C:/Block-Library/One_Line' WHERE name = 'One-Line';
UPDATE categories SET path = 'C:/Block-Library/Vendor' WHERE name = 'Vendor';
UPDATE categories SET path = 'C:/Block-Library/Logic' WHERE name = 'Logic';
UPDATE categories SET path = 'C:/Block-Library/Structural' WHERE name = 'Structural';
UPDATE categories SET path = 'C:/Block-Library/Equipment' WHERE name = 'Equipment';
UPDATE categories SET path = 'C:/Block-Library/Drafting_Standards' WHERE name = 'Drafting Standards';
UPDATE categories SET path = 'C:/Block-Library/Stamps' WHERE name = 'Stamps';
UPDATE categories SET path = 'C:/Block-Library/Logos' WHERE name = 'Logos';

-- Update existing block paths to use C:/Block-Library
UPDATE blocks SET dwg_path = REPLACE(dwg_path, 'C:/BlockLibrary/', 'C:/Block-Library/') WHERE dwg_path LIKE 'C:/BlockLibrary/%';

-- Verify the updates
SELECT name, path FROM categories ORDER BY name;
SELECT name, dwg_path FROM blocks WHERE dwg_path LIKE 'C:/Block-Library/%' LIMIT 10;
