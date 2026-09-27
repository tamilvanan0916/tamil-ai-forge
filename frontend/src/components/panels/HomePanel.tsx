import React from 'react';
import { Film, Plus, FolderHeart, Clock, TrendingUp, Sparkles } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';

export const HomePanel: React.FC = () => {
  const { projects, activeProject, fetchProjects } = useProjectStore();
  const { setNewProjectModalOpen, setActiveSidebarTab } = useUIStore();

  React.useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const recentProjects = projects.slice(0, 5);

  return (
    <div className="flex flex-col h-full bg-cinema-900 overflow-y-auto">
      {/* Hero */}
      <div className="p-6 border-b border-cinema-border bg-gradient-to-br from-cinema-900 via-cinema-850 to-cinema-900">
        <div className="space-y-1 mb-4">
          <p className="text-[9px] font-bold text-cinema-ai tracking-[0.3em] uppercase">Welcome to</p>
          <h1 className="text-xl font-extrabold text-white tracking-wider">TAMIL AI FORGE</h1>
          <p className="text-xs text-cinema-textDim italic">From Words to Cinema.</p>
        </div>

        {activeProject ? (
          <div className="bg-cinema-800/80 border border-cinema-ai/20 rounded-lg p-3">
            <p className="text-[10px] text-cinema-ai font-semibold uppercase tracking-wider mb-0.5">Active Project</p>
            <p className="text-sm font-bold text-white truncate">{activeProject.title}</p>
            <p className="text-[10px] text-cinema-textDim">{activeProject.settings.width}×{activeProject.settings.height} • {activeProject.settings.fps}fps</p>
          </div>
        ) : (
          <button
            onClick={() => setNewProjectModalOpen(true)}
            className="w-full py-3 bg-cinema-red/20 hover:bg-cinema-red/30 border border-cinema-red/40 rounded-lg text-cinema-red font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create New Project
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="p-4 space-y-3">
        <h3 className="text-[10px] font-bold text-cinema-textMuted uppercase tracking-wider">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Import Media', icon: Film, tab: 'media' as const, desc: 'Add video, audio, images' },
            { label: 'Story / Script', icon: Sparkles, tab: 'story-script' as const, desc: 'Write with AI' },
            { label: 'Characters', icon: FolderHeart, tab: 'characters' as const, desc: 'Create characters' },
            { label: 'Music Library', icon: Clock, tab: 'music-library' as const, desc: 'Browse Tamil music' },
          ].map(({ label, icon: Icon, tab, desc }) => (
            <button
              key={tab}
              onClick={() => setActiveSidebarTab(tab)}
              className="bg-cinema-850 border border-cinema-border rounded-lg p-3 text-left hover:border-cinema-ai/30 transition-all group"
            >
              <Icon className="w-4 h-4 text-cinema-ai mb-1.5 group-hover:scale-110 transition-transform" />
              <p className="text-xs font-semibold text-cinema-text">{label}</p>
              <p className="text-[10px] text-cinema-textDim">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          <h3 className="text-[10px] font-bold text-cinema-textMuted uppercase tracking-wider">Recent Projects</h3>
          {recentProjects.map(p => (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all ${
                activeProject?.id === p.id
                  ? 'bg-cinema-800 border-cinema-ai/40'
                  : 'bg-cinema-850 border-cinema-border hover:border-cinema-borderLight'
              }`}
            >
              <Film className="w-4 h-4 text-cinema-textDim flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-cinema-text truncate">{p.title}</p>
                <p className="text-[10px] text-cinema-textDim">{p.settings.width}×{p.settings.height}</p>
              </div>
              {activeProject?.id === p.id && <div className="w-1.5 h-1.5 rounded-full bg-cinema-ai flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
