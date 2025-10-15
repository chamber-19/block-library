-- Check current database state before updating paths

-- Check categories and their current paths
SELECT 'CATEGORIES:' as table_name, name, path FROM categories ORDER BY name;

-- Check blocks and their current dwg_path
SELECT 'BLOCKS:' as table_name, name, dwg_path FROM blocks ORDER BY name;

-- Count records
SELECT 'COUNTS:' as info, 
       (SELECT count(*) FROM categories) as categories,
       (SELECT count(*) FROM blocks) as blocks;
