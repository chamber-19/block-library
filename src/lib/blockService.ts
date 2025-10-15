import { supabase } from './supabase';
import type { BlockCategory, Block, RecentFile } from './supabase';

export class BlockService {
  static async getCategories(): Promise<BlockCategory[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) throw error;
    return data || [];
  }

  static async getBlocks(categoryId?: string): Promise<Block[]> {
    let query = supabase.from('blocks').select('*');

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query.order('name');

    if (error) throw error;
    return data || [];
  }

  static async getBlocksWithCategory(): Promise<(Block & { category: BlockCategory })[]> {
    const { data, error } = await supabase
      .from('blocks')
      .select(`
        *,
        category:categories(*)
      `)
      .order('name');

    if (error) throw error;
    return data as any || [];
  }

  static async searchBlocks(query: string): Promise<Block[]> {
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .ilike('name', `%${query}%`)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  static async getRecentBlocks(days: number = 30): Promise<Block[]> {
    const date = new Date();
    date.setDate(date.getDate() - days);

    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .gte('last_modified', date.toISOString())
      .order('last_modified', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async addRecentFile(
    filePath: string,
    fileName: string,
    fileType: string,
    userId?: string
  ): Promise<RecentFile> {
    const { data, error } = await supabase
      .from('recent_files')
      .insert({
        user_id: userId || null,
        file_path: filePath,
        file_name: fileName,
        file_type: fileType,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getRecentFiles(limit: number = 10): Promise<RecentFile[]> {
    const { data, error } = await supabase
      .from('recent_files')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  static async createCategory(
    name: string,
    color: string,
    icon: string,
    path?: string
  ): Promise<BlockCategory> {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name, color, icon, path })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateCategory(
    id: string,
    updates: Partial<BlockCategory>
  ): Promise<BlockCategory> {
    const { data, error } = await supabase
      .from('categories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async createBlock(block: Omit<Block, 'id' | 'created_at' | 'updated_at'>): Promise<Block> {
    const { data, error } = await supabase
      .from('blocks')
      .insert(block)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateBlock(
    id: string,
    updates: Partial<Block>
  ): Promise<Block> {
    const { data, error } = await supabase
      .from('blocks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteBlock(id: string): Promise<void> {
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async getStats() {
    const [categoriesRes, blocksRes, recentRes] = await Promise.all([
      supabase.from('categories').select('*', { count: 'exact', head: true }),
      supabase.from('blocks').select('*', { count: 'exact', head: true }),
      supabase.from('recent_files').select('*', { count: 'exact', head: true }),
    ]);

    return {
      totalCategories: categoriesRes.count || 0,
      totalBlocks: blocksRes.count || 0,
      recentFiles: recentRes.count || 0,
    };
  }

  static subscribeToBlocks(callback: (payload: any) => void) {
    return supabase
      .channel('blocks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks' },
        callback
      )
      .subscribe();
  }

  static subscribeToCategories(callback: (payload: any) => void) {
    return supabase
      .channel('categories_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        callback
      )
      .subscribe();
  }

  // Folder scanning functionality
  static async scanCategoryFolder(categoryId: string): Promise<{ files: string[], total: number }> {
    // This would integrate with your Python backend to scan the folder
    // For now, return mock data - you'll need to implement the API endpoint
    try {
      const response = await fetch(`/api/categories/${categoryId}/scan`);
      if (!response.ok) throw new Error('Failed to scan folder');
      return await response.json();
    } catch (error) {
      console.warn('Folder scanning not implemented yet:', error);
      return { files: [], total: 0 };
    }
  }

  static async syncCategoryBlocks(categoryId: string): Promise<{ synced: number, total: number }> {
    // This would sync blocks from the folder to the database
    try {
      const response = await fetch(`/api/categories/${categoryId}/sync`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to sync blocks');
      return await response.json();
    } catch (error) {
      console.warn('Block syncing not implemented yet:', error);
      return { synced: 0, total: 0 };
    }
  }
}

export const formatTimeAgo = (date: string | Date): string => {
  const timestamp = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
};

export const getCategoryColor = (categoryName: string): string => {
  const colorMap: Record<string, string> = {
    'Relay Panels': '#4a9eff',
    'Schematic': '#6c5ce7',
    'Wiring': '#00cec9',
    'Grounding': '#fd79a8',
    'Conduit': '#fdcb6e',
    'One-Line': '#e17055',
    'Vendor': '#00b894',
    'Logic': '#a29bfe',
    'Structural': '#fd79a8',
    'Equipment': '#fdcb6e',
    'Drafting Standards': '#00cec9',
    'Stamps': '#6c5ce7',
    'Logos': '#4a9eff',
  };
  return colorMap[categoryName] || '#4a9eff';
};

export const getCategoryIcon = (categoryName: string): string => {
  const iconMap: Record<string, string> = {
    'Relay Panels': '📦',
    'Schematic': '📐',
    'Wiring': '🔌',
    'Grounding': '⚡',
    'Conduit': '🔧',
    'One-Line': '📊',
    'Vendor': '🏢',
    'Logic': '🧠',
    'Structural': '🏗️',
    'Equipment': '⚙️',
    'Drafting Standards': '📏',
    'Stamps': '✅',
    'Logos': '🎨',
  };
  return iconMap[categoryName] || '📦';
};
