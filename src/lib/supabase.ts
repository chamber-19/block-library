import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase URL:', supabaseUrl ? 'SET' : 'NOT SET');
console.log('Supabase Key:', supabaseAnonKey ? 'SET' : 'NOT SET');

// Create client with fallback values if env vars are not set
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export type BlockCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
  path?: string;
  created_at: string;
  updated_at: string;
};

export type Block = {
  id: string;
  name: string;
  category_id: string;
  dwg_path?: string;
  thumbnail_url?: string;
  last_modified?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type RecentFile = {
  id: string;
  user_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  opened_at: string;
};
