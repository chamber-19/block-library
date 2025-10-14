import { useEffect, useState } from 'react';
import { FileText, Folder, Clock, TrendingUp, Settings, Search, Box, Grid3x3, Upload, Download, RefreshCw, Activity, Layers, Cpu, Zap, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { RecentFile } from '../lib/supabase';

interface DashboardProps {
  onOpenLibrary: () => void;
  onOpenViewer: () => void;
  onOpenBulkOps?: () => void;
}

export function Dashboard({ onOpenLibrary, onOpenViewer, onOpenBulkOps }: DashboardProps) {
  const [stats, setStats] = useState({
    totalBlocks: 0,
    categories: 0,
    dwgFiles: 0,
    recentFiles: 0,
  });
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [recentActivity, setRecentActivity] = useState<Array<{ icon: string; action: string; time: string }>>([]);

  useEffect(() => {
    loadStats();
    loadRecentFiles();
    loadRecentActivity();
  }, []);

  const loadStats = async () => {
    try {
      const [categoriesRes, blocksRes, recentRes] = await Promise.all([
        supabase.from('categories').select('*', { count: 'exact' }),
        supabase.from('blocks').select('*', { count: 'exact' }),
        supabase.from('recent_files').select('*', { count: 'exact' }).limit(10),
      ]);

      setStats({
        totalBlocks: blocksRes.count || 0,
        categories: categoriesRes.count || 0,
        dwgFiles: blocksRes.count || 0,
        recentFiles: recentRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadRecentFiles = async () => {
    try {
      const { data } = await supabase
        .from('recent_files')
        .select('*')
        .order('opened_at', { ascending: false })
        .limit(5);
      setRecentFiles(data || []);
    } catch (error) {
      console.error('Error loading recent files:', error);
    }
  };

  const loadRecentActivity = async () => {
    setRecentActivity([
      { icon: '📂', action: 'Dashboard initialized', time: 'Just now' },
      { icon: '🔍', action: 'Loaded block categories', time: '1 min ago' },
      { icon: '📁', action: 'Synced with database', time: '2 min ago' },
    ]);
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 xl:p-10 3xl:p-12">
      <div className="max-w-7xl 3xl:max-w-[90rem] mx-auto space-y-6 md:space-y-8">
        <header className="glass-effect rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 smooth-shadow slide-in-up">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl 3xl:text-5xl font-bold text-slate-800 dark:text-blue-50 mb-2 flex items-center gap-2 md:gap-3">
                <Cpu className="w-8 h-8 sm:w-10 sm:h-10 3xl:w-12 3xl:h-12 text-blue-600 dark:text-blue-400" />
                Block Library Dashboard
              </h1>
              <p className="text-slate-600 dark:text-blue-200/80 text-sm sm:text-base lg:text-lg 3xl:text-xl">Real-time analytics • Modern design • Responsive interface</p>
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400 dark:text-blue-400/60 group-focus-within:text-blue-500 dark:group-focus-within:text-blue-400 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search blocks, files, and more..."
                className="w-full md:w-80 3xl:w-96 pl-10 sm:pl-12 pr-4 sm:pr-6 py-2.5 sm:py-3.5 text-sm sm:text-base bg-slate-100 dark:bg-black/50 rounded-2xl border-2 border-slate-300 dark:border-blue-500/40 text-slate-800 dark:text-blue-50 placeholder-slate-500 dark:placeholder-blue-200/60 outline-none transition-all hover:border-blue-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Blocks"
            value={stats.totalBlocks.toLocaleString()}
            icon={<Cpu className="w-6 h-6" />}
            color="blue"
            trend="+12%"
          />
          <StatCard
            title="Categories"
            value={stats.categories.toString()}
            icon={<Folder className="w-6 h-6" />}
            color="purple"
            trend={`+${stats.categories}`}
          />
          <StatCard
            title="DWG Files"
            value={stats.dwgFiles.toString()}
            icon={<Database className="w-6 h-6" />}
            color="teal"
            trend="Active"
          />
          <StatCard
            title="Recent Files"
            value={stats.recentFiles.toString()}
            icon={<Zap className="w-6 h-6" />}
            color="pink"
            trend="Ready"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-blue-50 mb-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <ActionCard title="Block Library" description="Browse all blocks" icon={<Layers className="w-5 h-5" />} onClick={onOpenLibrary} color="blue" />
                <ActionCard title="Grid Viewer" description="3D view & HUD" icon={<Grid3x3 className="w-5 h-5" />} onClick={onOpenViewer} color="green" />
                <ActionCard title="Bulk Operations" description="Import/Export" icon={<Box className="w-5 h-5" />} onClick={onOpenBulkOps} color="teal" />
                <ActionCard title="Export" description="Export selection" icon={<Download className="w-5 h-5" />} onClick={() => {}} color="pink" />
                <ActionCard title="Import" description="Upload files" icon={<Upload className="w-5 h-5" />} onClick={() => {}} color="amber" />
                <ActionCard title="Sync" description="Update database" icon={<RefreshCw className="w-5 h-5" />} onClick={() => {}} color="indigo" />
              </div>
            </section>

            <section className="glass-effect rounded-2xl p-6 smooth-shadow">
              <h2 className="text-xl font-bold text-slate-800 dark:text-blue-50 mb-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                Recent Files
              </h2>
              <div className="space-y-3">
                {recentFiles.length > 0 ? (
                  recentFiles.map((file) => (
                    <RecentFileItem
                      key={file.id}
                      name={file.file_name}
                      path={file.file_path}
                      time={formatTimeAgo(file.opened_at)}
                    />
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-blue-200/60 text-center py-4 italic">No recent files</p>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <div className="glass-effect rounded-2xl p-6 smooth-shadow">
              <h2 className="text-xl font-bold text-slate-800 dark:text-blue-50 mb-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                Recent Activity
              </h2>
              <div className="space-y-3">
                {recentActivity.map((activity, idx) => (
                  <ActivityItem key={idx} {...activity} />
                ))}
              </div>

              <div className="mt-6 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-blue-500/40 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/30 flex items-center justify-center text-xl">
                    👤
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800 dark:text-blue-50">User</div>
                    <div className="text-xs text-slate-600 dark:text-blue-200/70">Administrator</div>
                  </div>
                  <button className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-900/50 border border-slate-300 dark:border-blue-500/30 flex items-center justify-center text-slate-600 dark:text-blue-400 hover:bg-slate-300 dark:hover:bg-slate-800/70 transition-all hover:scale-110">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, trend }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'border-blue-300/50 dark:border-blue-500/30 from-blue-100/80 dark:from-blue-500/20 to-blue-50/30 dark:to-blue-500/5',
    purple: 'border-purple-300/50 dark:border-purple-500/30 from-purple-100/80 dark:from-purple-500/20 to-purple-50/30 dark:to-purple-500/5',
    teal: 'border-teal-300/50 dark:border-teal-500/30 from-teal-100/80 dark:from-teal-500/20 to-teal-50/30 dark:to-teal-500/5',
    pink: 'border-pink-300/50 dark:border-pink-500/30 from-pink-100/80 dark:from-pink-500/20 to-pink-50/30 dark:to-pink-500/5',
  };

  const iconColorClasses: Record<string, string> = {
    blue: 'bg-blue-100 dark:bg-blue-500/20 border-blue-300 dark:border-blue-500/40 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-100 dark:bg-purple-500/20 border-purple-300 dark:border-purple-500/40 text-purple-600 dark:text-purple-400',
    teal: 'bg-teal-100 dark:bg-teal-500/20 border-teal-300 dark:border-teal-500/40 text-teal-600 dark:text-teal-400',
    pink: 'bg-pink-100 dark:bg-pink-500/20 border-pink-300 dark:border-pink-500/40 text-pink-600 dark:text-pink-400',
  };

  return (
    <div className={`stat-card card-hover bg-gradient-to-br ${colorClasses[color]} border backdrop-blur-sm rounded-2xl p-6 smooth-shadow group`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-2xl ${iconColorClasses[color]} border flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-3`}>
          {icon}
        </div>
        {trend && (
          <span className="bg-slate-100 dark:bg-black/50 border border-slate-300 dark:border-blue-500/40 rounded-xl px-3 py-1 text-xs font-bold text-slate-700 dark:text-blue-50">
            {trend}
          </span>
        )}
      </div>
      <div className="text-4xl font-bold text-slate-800 dark:text-blue-50 mb-1">{value}</div>
      <div className="text-xs font-semibold text-slate-600 dark:text-blue-200/80 uppercase tracking-wider">{title}</div>
    </div>
  );
}

function ActionCard({ title, description, icon, onClick, color }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'hover:border-blue-500',
    green: 'hover:border-green-500',
    teal: 'hover:border-teal-500',
    pink: 'hover:border-pink-500',
    amber: 'hover:border-amber-500',
    indigo: 'hover:border-indigo-500',
  };

  const iconBgClasses: Record<string, string> = {
    blue: 'bg-gradient-to-br from-blue-500 to-blue-600 group-hover:from-blue-600 group-hover:to-blue-700',
    green: 'bg-gradient-to-br from-green-500 to-emerald-600 group-hover:from-green-600 group-hover:to-emerald-700',
    teal: 'bg-gradient-to-br from-teal-500 to-cyan-600 group-hover:from-teal-600 group-hover:to-cyan-700',
    pink: 'bg-gradient-to-br from-pink-500 to-rose-600 group-hover:from-pink-600 group-hover:to-rose-700',
    amber: 'bg-gradient-to-br from-amber-500 to-orange-600 group-hover:from-amber-600 group-hover:to-orange-700',
    indigo: 'bg-gradient-to-br from-indigo-500 to-blue-600 group-hover:from-indigo-600 group-hover:to-blue-700',
  };

  return (
    <button
      onClick={onClick}
      className={`action-card card-hover glass-effect rounded-2xl p-5 text-left border-2 border-transparent ${colorClasses[color]} hover:shadow-xl transition-all group relative overflow-hidden`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-white/10 dark:via-white/5 dark:to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className={`relative w-12 h-12 rounded-xl ${iconBgClasses[color]} flex items-center justify-center text-white mb-3 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 shadow-lg`}>
        {icon}
      </div>
      <div className="relative text-sm font-bold text-slate-800 dark:text-blue-50 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{title}</div>
      <div className="relative text-xs text-slate-600 dark:text-blue-200/70">{description}</div>
    </button>
  );
}

function RecentFileItem({ name, path, time }: any) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-blue-500/20 rounded-xl p-3 hover:bg-slate-100 dark:hover:bg-slate-900/50 hover:border-blue-400 dark:hover:border-blue-500/40 transition-all hover:scale-[1.02] group cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-500/20 dark:to-cyan-500/20 flex items-center justify-center border border-blue-200 dark:border-blue-500/30 transition-transform group-hover:scale-110">
          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800 dark:text-blue-50 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{name}</div>
          <div className="text-xs text-slate-500 dark:text-blue-200/70 truncate">{path}</div>
        </div>
        <div className="text-xs text-slate-400 dark:text-blue-200/60 whitespace-nowrap">{time}</div>
      </div>
    </div>
  );
}

function ActivityItem({ icon, action, time }: any) {
  const getIconBg = (icon: string) => {
    const iconMap: Record<string, string> = {
      '📂': 'from-blue-100 to-cyan-100 dark:from-blue-500/20 dark:to-cyan-500/20 border-blue-200 dark:border-blue-500/30',
      '🔍': 'from-green-100 to-emerald-100 dark:from-green-500/20 dark:to-emerald-500/20 border-green-200 dark:border-green-500/30',
      '📁': 'from-purple-100 to-pink-100 dark:from-purple-500/20 dark:to-pink-500/20 border-purple-200 dark:border-purple-500/30',
    };
    return iconMap[icon] || 'from-slate-100 to-slate-200 dark:from-slate-500/20 dark:to-slate-600/20 border-slate-200 dark:border-slate-500/30';
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-blue-500/20 rounded-xl p-3 hover:bg-slate-100 dark:hover:bg-slate-900/50 hover:border-blue-400 dark:hover:border-blue-500/40 transition-all hover:scale-[1.02] group">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${getIconBg(icon)} flex items-center justify-center border transition-transform group-hover:scale-110`}>
          <span className="text-sm">{icon}</span>
        </div>
        <div className="flex-1">
          <div className="text-sm text-slate-800 dark:text-blue-50 font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{action}</div>
          <div className="text-xs text-slate-500 dark:text-blue-200/70">{time}</div>
        </div>
      </div>
    </div>
  );
}
