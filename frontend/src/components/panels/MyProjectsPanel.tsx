import React from 'react';
import { FolderHeart, Plus, Search, Film, Copy, Trash2, ExternalLink, Clock, Loader2 } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { Project } from '../../types';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

export const MyProjectsPanel: React.FC = () => {
  const { projects, activeProject, selectProject, createProject, deleteProject, duplicateProject, isLoading, fetchProjects } = useProjectStore();
  const { setNewProjectModalOpen, showNotification } = useUIStore();
  const [search, setSearch] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  React.useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const filtered = projects.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    showNotification('Project deleted', 'info');
    setConfirmDelete(null);
  };

  const handleDuplicate = async (id: string) => {
    const copy = await duplicateProject(id);
    if (copy) showNotification(`Duplicated: "${copy.title}"`, 'success');
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-cinema-border">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cinema-textDim pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full bg-cinema-800 border border-cinema-border rounded pl-7 pr-3 py-1 text-xs text-cinema-text outline-none placeholder:text-cinema-textDim focus:border-cinema-ai"
          />
        </div>
        <button
          onClick={() => setNewProjectModalOpen(true)}
          className="flex items-center gap-1 px-2 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-xs rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 gap-2 text-cinema-textDim text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading projects...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-cinema-textDim text-center">
            <FolderHeart className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium">No projects yet</p>
            <button
              onClick={() => setNewProjectModalOpen(true)}
              className="text-xs text-cinema-ai hover:underline"
            >
              Create your first project
            </button>
          </div>
        ) : (
          filtered.map(project => {
            const isActive = activeProject?.id === project.id;
            return (
              <div
                key={project.id}
                className={`group relative bg-cinema-850 border rounded-lg p-3 cursor-pointer transition-all ${
                  isActive
                    ? 'border-cinema-ai/60 bg-cinema-800'
                    : 'border-cinema-border hover:border-cinema-borderLight'
                }`}
                onClick={() => selectProject(project)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-cinema-ai flex-shrink-0" />}
                      <p className={`text-xs font-semibold truncate ${isActive ? 'text-cinema-ai' : 'text-cinema-text'}`}>
                        {project.title}
                      </p>
                    </div>
                    {project.description && (
                      <p className="text-[10px] text-cinema-textDim mt-0.5 line-clamp-2">{project.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[9px] text-cinema-textDim flex items-center gap-1">
                        <Film className="w-2.5 h-2.5" />
                        {project.settings.width}×{project.settings.height} @ {project.settings.fps}fps
                      </span>
                      <span className="text-[9px] text-cinema-textDim flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {timeAgo(project.updated_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); handleDuplicate(project.id); }}
                      className="p-1 hover:bg-cinema-750 rounded text-cinema-textDim hover:text-white"
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(project.id); }}
                      className="p-1 hover:bg-red-950 rounded text-cinema-textDim hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {confirmDelete === project.id && (
                  <div className="mt-2 pt-2 border-t border-cinema-border flex items-center justify-between">
                    <span className="text-[10px] text-red-400">Delete project permanently?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                        className="text-[10px] px-2 py-0.5 bg-cinema-750 rounded text-cinema-text"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(project.id); }}
                        className="text-[10px] px-2 py-0.5 bg-red-800 hover:bg-red-700 rounded text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
