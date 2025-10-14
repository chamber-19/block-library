import React, { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  FolderOpen,
  Image,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader,
  Package,
  Grid3x3,
  FileText,
  AlertCircle,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DragDropUpload } from './DragDropUpload';
import { HistoryViewer } from './HistoryViewer';

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  path?: string;
}

interface ImportFile {
  name: string;
  path: string;
  category?: string;
  status: 'pending' | 'importing' | 'success' | 'error';
  error?: string;
}

interface BulkOperationsProps {
  onClose: () => void;
}

export default function BulkOperations({ onClose }: BulkOperationsProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'thumbnails' | 'history'>('import');
  const [showHistory, setShowHistory] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [importFiles, setImportFiles] = useState<ImportFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('grounding');

  // Debug logging for state changes
  useEffect(() => {
    console.log('🎯 selectedCategory state changed:', selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    console.log('📁 importFiles state changed:', importFiles);
  }, [importFiles]);

  useEffect(() => {
    console.log('📂 categories state changed:', categories);
  }, [categories]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [thumbnailStats, setThumbnailStats] = useState({
    total: 0,
    generated: 0,
    missing: 0,
    pending: 0
  });

  useEffect(() => {
    loadCategories();
    loadThumbnailStats();
  }, []);

  // Update file paths when category changes
  useEffect(() => {
    console.log('🔄 useEffect triggered - selectedCategory changed:', selectedCategory);
    console.log('📁 Current import files:', importFiles);
    console.log('📂 Available categories:', categories);

    if (importFiles.length > 0 && selectedCategory && categories.length > 0) {
      const category = categories.find(c => c.id === selectedCategory);
      console.log('📂 Found category in useEffect:', category);

      const categoryPath = category?.path || 'C:/Block-Library/Unknown';
      console.log('📍 Using category path in useEffect:', categoryPath);

      const updatedFiles = importFiles.map(file => {
        const newPath = `${categoryPath}/${file.name}`;
        console.log(`📝 useEffect updating file ${file.name}: ${file.path} → ${newPath}`);
        return {
          ...file,
          path: newPath
        };
      });

      console.log('📁 useEffect setting updated files:', updatedFiles);
      setImportFiles(updatedFiles);
    }
  }, [selectedCategory, categories, importFiles.length]);

  const loadCategories = async () => {
    console.log('📂 Loading categories...');
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (data && !error) {
      console.log('📂 Loaded categories:', data);

      // Check if paths need to be updated
      const needsPathUpdate = data.some(cat => !cat.path);
      if (needsPathUpdate) {
        console.log('🔧 Some categories missing paths, updating...');
        await updateCategoryPaths();
        // Reload categories after updating paths
        const { data: updatedData } = await supabase
          .from('categories')
          .select('*')
          .order('name');
        if (updatedData) {
          console.log('📂 Reloaded categories with paths:', updatedData);
          setCategories(updatedData);
        }
      } else {
        setCategories(data);
      }

      if (data.length > 0) {
        // Find grounding category or use first one
        const groundingCategory = data.find(cat => cat.name.toLowerCase() === 'grounding');
        const defaultCategory = groundingCategory || data[0];
        console.log('🎯 Setting default selected category:', defaultCategory.id, defaultCategory.name);
        setSelectedCategory(defaultCategory.id);
      }
    } else {
      console.error('❌ Error loading categories:', error);
    }
  };

  const updateCategoryPaths = async () => {
    const pathUpdates = [
      { name: 'Relay Panels', path: 'C:/Block-Library/Relay_Panels' },
      { name: 'Schematic', path: 'C:/Block-Library/Schematic' },
      { name: 'Wiring', path: 'C:/Block-Library/Wiring' },
      { name: 'Grounding', path: 'C:/Block-Library/Grounding' },
      { name: 'Conduit', path: 'C:/Block-Library/Conduit' },
      { name: 'One-Line', path: 'C:/Block-Library/One_Line' },
      { name: 'Vendor', path: 'C:/Block-Library/Vendor' },
      { name: 'Logic', path: 'C:/Block-Library/Logic' },
      { name: 'Structural', path: 'C:/Block-Library/Structural' },
      { name: 'Equipment', path: 'C:/Block-Library/Equipment' },
      { name: 'Drafting Standards', path: 'C:/Block-Library/Drafting_Standards' },
      { name: 'Stamps', path: 'C:/Block-Library/Stamps' },
      { name: 'Logos', path: 'C:/Block-Library/Logos' }
    ];

    for (const update of pathUpdates) {
      try {
        const { error } = await supabase
          .from('categories')
          .update({ path: update.path })
          .eq('name', update.name);

        if (error) {
          console.error(`❌ Failed to update path for ${update.name}:`, error);
        } else {
          console.log(`✅ Updated path for ${update.name}: ${update.path}`);
        }
      } catch (err) {
        console.error(`❌ Error updating ${update.name}:`, err);
      }
    }

    // Apply the anonymous insert policy for testing
    try {
      console.log('🔧 Applying anonymous insert policy...');
      // Use a direct SQL execution approach
      const policySQL = `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE tablename = 'blocks'
            AND policyname = 'Anonymous users can insert blocks (TESTING ONLY)'
          ) THEN
            CREATE POLICY "Anonymous users can insert blocks (TESTING ONLY)"
              ON blocks FOR INSERT
              TO anon
              WITH CHECK (true);
          END IF;
        END $$;
      `;

      // For now, we'll skip the policy creation and just log it
      console.log('📝 Policy SQL prepared (manual application needed):', policySQL);
    } catch (err) {
      console.warn('⚠️ Could not prepare anonymous policy:', err);
    }
  };

  const loadThumbnailStats = async () => {
    const { data: blocks } = await supabase
      .from('blocks')
      .select('id, thumbnail_url');

    if (blocks) {
      const total = blocks.length;
      const generated = blocks.filter(b => b.thumbnail_url).length;
      const missing = total - generated;

      setThumbnailStats({
        total,
        generated,
        missing,
        pending: 0
      });
    }
  };

  const handleFileSelect = async () => {
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.dwg,.dxf';

    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        handleFilesSelected(Array.from(target.files));
      }
    };

    input.click();
  };

  const handleFilesSelected = (files: File[]) => {
    const selectedCategory = categories.find(c => c.id === selectedCategory);
    const categoryPath = selectedCategory?.path || 'C:/Block-Library/Unknown';

    const importFiles: ImportFile[] = files.map(file => ({
      name: file.name,
      path: `${categoryPath}/${file.name}`,
      status: 'pending' as const
    }));

    setImportFiles(importFiles);
  };

  const handleBulkImport = async () => {
    if (!selectedCategory || importFiles.length === 0) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: importFiles.length });

    for (let i = 0; i < importFiles.length; i++) {
      const file = importFiles[i];

      setImportFiles(prev => prev.map((f, idx) =>
        idx === i ? { ...f, status: 'importing' } : f
      ));

      try {
        // Get the selected category info
        const category = categories.find(c => c.id === selectedCategory);
        const categoryPath = category?.path || 'C:/Block-Library/Unknown';

        console.log(`🔄 Importing ${file.name} to category ${category?.name} (${categoryPath})`);

        // First, insert the block into the database
        const { data: insertedBlock, error } = await supabase
          .from('blocks')
          .insert({
            name: file.name.replace(/\.(dwg|dxf)$/i, ''),
            category_id: selectedCategory,
            dwg_path: `${categoryPath}/${file.name}`,
            last_modified: new Date().toISOString(),
            metadata: {
              imported: true,
              source: 'bulk_import',
              original_filename: file.name,
              category_name: category?.name || 'Unknown'
            }
          })
          .select()
          .single();

        if (error) {
          console.error(`❌ Import error for ${file.name}:`, error);

          // Check if it's an authentication error
          if (error.message.includes('row-level security') || error.message.includes('401')) {
            throw new Error('Authentication required. Please set up Supabase authentication or disable RLS policies for testing.');
          }

          throw error;
        }

        console.log(`✅ Successfully imported ${file.name}`);

        // Try to generate thumbnail (optional - don't fail import if this fails)
        try {
          console.log(`🖼️ Generating thumbnail for ${file.name}...`);

          // Create a File object from the original file for thumbnail generation
          // Note: In a real implementation, you'd need the actual file content
          // For now, we'll just update the database record to indicate thumbnail is needed

          if (insertedBlock) {
            await supabase
              .from('blocks')
              .update({
                metadata: {
                  ...insertedBlock.metadata,
                  thumbnail_needed: true,
                  thumbnail_requested_at: new Date().toISOString()
                }
              })
              .eq('id', insertedBlock.id);

            console.log(`📝 Marked ${file.name} for thumbnail generation`);
          }
        } catch (thumbError) {
          console.warn(`⚠️ Could not request thumbnail for ${file.name}:`, thumbError);
          // Don't fail the import for thumbnail issues
        }

        setImportFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'success' } : f
        ));
      } catch (err: any) {
        console.error(`❌ Failed to import ${file.name}:`, err);
        setImportFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'error', error: err.message } : f
        ));
      }

      setProgress({ current: i + 1, total: importFiles.length });
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsProcessing(false);

    // Refresh thumbnail stats after import
    loadThumbnailStats();
  };

  const handleBulkExport = async () => {
    setIsProcessing(true);

    try {
      const { data: blocks } = await supabase
        .from('blocks')
        .select(`
          id,
          name,
          dwg_path,
          categories (name, color, icon)
        `)
        .order('name');

      if (blocks) {
        const exportData = blocks.map(block => ({
          name: block.name,
          path: block.dwg_path,
          category: block.categories?.name
        }));

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `block_library_export_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }

    setIsProcessing(false);
  };

  const handleThumbnailRegeneration = async () => {
    setIsProcessing(true);

    const { data: blocks } = await supabase
      .from('blocks')
      .select('id, name, dwg_path')
      .is('thumbnail_url', null);

    if (blocks) {
      setThumbnailStats(prev => ({ ...prev, pending: blocks.length }));
      setProgress({ current: 0, total: blocks.length });

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        try {
          const response = await fetch(
            `http://localhost:8000/api/thumbnails/${encodeURIComponent(block.name)}?size=256`,
            { method: 'POST' }
          );

          if (response.ok) {
            const thumbnailUrl = `/thumbnails/${block.name}.png`;
            await supabase
              .from('blocks')
              .update({ thumbnail_url: thumbnailUrl })
              .eq('id', block.id);

            setThumbnailStats(prev => ({
              ...prev,
              generated: prev.generated + 1,
              missing: prev.missing - 1,
              pending: prev.pending - 1
            }));
          }
        } catch (err) {
          console.error(`Failed to generate thumbnail for ${block.name}:`, err);
        }

        setProgress({ current: i + 1, total: blocks.length });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setIsProcessing(false);
    loadThumbnailStats();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-blue-500/30 shadow-2xl shadow-blue-500/20 w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-blue-900/50 to-cyan-900/50 border-b border-blue-500/30 px-6 py-4 backdrop-blur-xl rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 flex items-center gap-2">
                <Package className="w-6 h-6 text-blue-400" />
                Bulk Operations
              </h2>
              <p className="text-sm text-slate-400 mt-1">Import, export, and manage thumbnails</p>
            </div>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg border border-red-500/30 transition-all shadow-lg shadow-red-500/10"
            >
              Close
            </button>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'import'
                  ? 'bg-blue-500/30 text-blue-300 border border-blue-400/50'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'
              }`}
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={() => setActiveTab('export')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'export'
                  ? 'bg-blue-500/30 text-blue-300 border border-blue-400/50'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'
              }`}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={() => setActiveTab('thumbnails')}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'thumbnails'
                  ? 'bg-blue-500/30 text-blue-300 border border-blue-400/50'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'
              }`}
            >
              <Image className="w-4 h-4" />
              Thumbnails
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="px-4 py-2 rounded-lg transition-all flex items-center gap-2 bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50"
            >
              <Clock className="w-4 h-4" />
              History
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'import' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  Select Category
                </h3>
                <p className="text-sm text-slate-400 mb-4">Choose which folder/category the imported blocks will be assigned to:</p>
                <div className="grid grid-cols-3 gap-3">
                  {categories.map(category => (
                    <button
                      key={category.id}
                      onClick={() => {
                        console.log('🎯 Category clicked:', category.id, category.name, category.path);
                        console.log('📁 Current import files before update:', importFiles);

                        setSelectedCategory(category.id);

                        // Update file paths when category changes
                        if (importFiles.length > 0) {
                          const updatedFiles = importFiles.map(file => {
                            const newPath = `${category.path || 'C:/Block-Library/Unknown'}/${file.name}`;
                            console.log(`📝 Updating file ${file.name}: ${file.path} → ${newPath}`);
                            return {
                              ...file,
                              path: newPath
                            };
                          });
                          console.log('📁 Updated import files:', updatedFiles);
                          setImportFiles(updatedFiles);
                        }
                      }}
                      className={`p-4 rounded-lg transition-all border-2 ${
                        selectedCategory === category.id
                          ? 'border-blue-400 bg-blue-500/20'
                          : 'border-slate-700 bg-slate-800/50 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="text-2xl mb-2">{category.icon}</div>
                      <div className="text-sm font-medium text-slate-200">{category.name}</div>
                      {category.path && (
                        <div className="text-xs text-slate-400 mt-1 truncate">{category.path}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-200">Files to Import</h3>
                  {selectedCategory && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <span>Importing to:</span>
                      <span className="px-2 py-1 bg-blue-500/20 border border-blue-400/30 rounded text-blue-300">
                        {categories.find(c => c.id === selectedCategory)?.name || 'Unknown'}
                      </span>
                    </div>
                  )}
                </div>

                {importFiles.length === 0 ? (
                  <DragDropUpload
                    onFilesSelected={(files) => {
                      console.log('📤 Files uploaded:', files.map(f => f.name));
                      console.log('🎯 Current selected category:', selectedCategory);
                      console.log('📂 Available categories for lookup:', categories);

                      const category = categories.find(c => c.id === selectedCategory);
                      console.log('📂 Found category:', category);

                      // Use the path from the category, but ensure it's not null
                      let categoryPath = category?.path;
                      if (!categoryPath) {
                        console.warn('⚠️ Category path is null, using default');
                        categoryPath = 'C:/Block-Library/Unknown';
                      }
                      console.log('📍 Using category path:', categoryPath);

                      const newFiles: ImportFile[] = files.map(f => {
                        const filePath = `${categoryPath}/${f.name}`;
                        console.log(`📝 Creating file entry: ${f.name} → ${filePath}`);
                        return {
                          name: f.name,
                          path: filePath,
                          status: 'pending'
                        };
                      });

                      console.log('📁 Setting import files:', newFiles);
                      setImportFiles(newFiles);
                    }}
                  />
                ) : (
                  <>
                    <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                      {importFiles.map((file, idx) => {
                        console.log(`🗂️ Rendering file ${idx}:`, file);
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <FileText className="w-5 h-5 text-blue-400" />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-slate-200">{file.name}</div>
                                <div className="text-xs text-slate-400">{file.path}</div>
                              </div>
                            </div>
                            <div>
                              {file.status === 'pending' && <AlertCircle className="w-5 h-5 text-slate-500" />}
                              {file.status === 'importing' && <Loader className="w-5 h-5 text-blue-400 animate-spin" />}
                              {file.status === 'success' && <CheckCircle className="w-5 h-5 text-green-400" />}
                              {file.status === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {isProcessing && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm text-slate-400 mb-2">
                          <span>Progress</span>
                          <span>{progress.current} / {progress.total}</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setImportFiles([])}
                        disabled={isProcessing}
                        className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Clear Files
                      </button>
                      <button
                        onClick={handleBulkImport}
                        disabled={isProcessing || !selectedCategory}
                        className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? 'Importing...' : 'Import All Blocks'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Export Block Library</h3>
                <p className="text-sm text-slate-400 mb-6">
                  Export all blocks and their metadata to a JSON file. This includes block names, file paths, and category assignments.
                </p>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="text-2xl font-bold text-blue-400">{categories.length}</div>
                    <div className="text-sm text-slate-400">Categories</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="text-2xl font-bold text-cyan-400">0</div>
                    <div className="text-sm text-slate-400">Total Blocks</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="text-2xl font-bold text-green-400">JSON</div>
                    <div className="text-sm text-slate-400">Format</div>
                  </div>
                </div>

                <button
                  onClick={handleBulkExport}
                  disabled={isProcessing}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg font-semibold transition-all shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Export Library
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'thumbnails' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Thumbnail Statistics</h3>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="text-2xl font-bold text-blue-400">{thumbnailStats.total}</div>
                    <div className="text-sm text-slate-400">Total Blocks</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="text-2xl font-bold text-green-400">{thumbnailStats.generated}</div>
                    <div className="text-sm text-slate-400">Generated</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="text-2xl font-bold text-red-400">{thumbnailStats.missing}</div>
                    <div className="text-sm text-slate-400">Missing</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="text-2xl font-bold text-amber-400">{thumbnailStats.pending}</div>
                    <div className="text-sm text-slate-400">Pending</div>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-slate-300">
                      <p className="font-semibold mb-1">About Thumbnail Generation</p>
                      <p className="text-slate-400">
                        Thumbnails are rendered from the actual 2D geometry in your DWG files using the Python backend
                        (thumb_nailer.py). This process extracts the first block from each file, renders it to an image,
                        and caches it for fast access.
                      </p>
                    </div>
                  </div>
                </div>

                {isProcessing && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-slate-400 mb-2">
                      <span>Generating Thumbnails</span>
                      <span>{progress.current} / {progress.total}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleThumbnailRegeneration}
                  disabled={isProcessing || thumbnailStats.missing === 0}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-semibold transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      Regenerate Missing Thumbnails ({thumbnailStats.missing})
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showHistory && <HistoryViewer onClose={() => setShowHistory(false)} />}
    </div>
  );
}
