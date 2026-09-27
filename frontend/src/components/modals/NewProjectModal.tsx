import React from 'react';
import { X, Film, CheckCircle2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useProjectStore } from '../../stores/useProjectStore';

const RESOLUTIONS = [
  { label: '4K UHD — 3840×2160', width: 3840, height: 2160 },
  { label: '2K DCI — 2048×1080', width: 2048, height: 1080 },
  { label: 'Full HD — 1920×1080', width: 1920, height: 1080 },
  { label: 'HD Ready — 1280×720', width: 1280, height: 720 },
  { label: 'Vertical — 1080×1920 (Reels)', width: 1080, height: 1920 },
  { label: 'Square — 1080×1080', width: 1080, height: 1080 },
];

const FPS_OPTIONS = [24, 25, 30, 48, 50, 60];

export const NewProjectModal: React.FC = () => {
  const { isNewProjectModalOpen, setNewProjectModalOpen, showNotification } = useUIStore();
  const { createProject, selectProject } = useProjectStore();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [resolutionIdx, setResolutionIdx] = React.useState(2); // Full HD default
  const [fps, setFps] = React.useState(30);
  const [isCreating, setIsCreating] = React.useState(false);

  if (!isNewProjectModalOpen) return null;

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    const { width, height } = RESOLUTIONS[resolutionIdx];
    const project = await createProject({
      title: title.trim(),
      description: description.trim() || undefined,
      settings: { width, height, fps, sample_rate: 48000, color_space: 'rec709', max_duration_sec: 600 },
    });
    setIsCreating(false);
    if (project) {
      selectProject(project);
      showNotification(`Project "${project.title}" created`, 'success');
      setNewProjectModalOpen(false);
      setTitle('');
      setDescription('');
    } else {
      showNotification('Failed to create project', 'error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && title.trim()) handleCreate();
    if (e.key === 'Escape') setNewProjectModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={() => setNewProjectModalOpen(false)}
    >
      <div
        className="bg-cinema-900 border border-cinema-borderLight rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cinema-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cinema-red/20 border border-cinema-red/40 flex items-center justify-center">
              <Film className="w-4 h-4 text-cinema-red" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">New Project</h2>
              <p className="text-[11px] text-cinema-textDim">TAMIL AI FORGE</p>
            </div>
          </div>
          <button onClick={() => setNewProjectModalOpen(false)} className="p-1.5 hover:bg-cinema-800 rounded-lg transition-colors">
            <X className="w-4 h-4 text-cinema-textDim" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-semibold text-cinema-textMuted uppercase tracking-wider mb-1.5">
              Project Title <span className="text-cinema-red">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Ponniyin Selvan — Scene 1"
              autoFocus
              className="w-full bg-cinema-850 border border-cinema-border rounded-lg px-3 py-2 text-sm text-cinema-text placeholder:text-cinema-textDim outline-none focus:border-cinema-ai transition-colors"
              style={{ userSelect: 'text' }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-cinema-textMuted uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the project..."
              rows={2}
              className="w-full bg-cinema-850 border border-cinema-border rounded-lg px-3 py-2 text-sm text-cinema-text placeholder:text-cinema-textDim outline-none resize-none focus:border-cinema-ai transition-colors"
              style={{ userSelect: 'text' }}
            />
          </div>

          {/* Resolution + FPS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-cinema-textMuted uppercase tracking-wider mb-1.5">Resolution</label>
              <select
                value={resolutionIdx}
                onChange={e => setResolutionIdx(Number(e.target.value))}
                className="w-full bg-cinema-850 border border-cinema-border rounded-lg px-3 py-2 text-xs text-cinema-text outline-none"
              >
                {RESOLUTIONS.map((r, i) => (
                  <option key={r.label} value={i}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-cinema-textMuted uppercase tracking-wider mb-1.5">Frame Rate</label>
              <select
                value={fps}
                onChange={e => setFps(Number(e.target.value))}
                className="w-full bg-cinema-850 border border-cinema-border rounded-lg px-3 py-2 text-xs text-cinema-text outline-none"
              >
                {FPS_OPTIONS.map(f => <option key={f} value={f}>{f} fps</option>)}
              </select>
            </div>
          </div>

          {/* Video length constraint notice */}
          <div className="text-[10px] text-cinema-textDim bg-cinema-800/60 border border-cinema-border rounded-lg px-3 py-2">
            Video length: 30 seconds minimum — 10 minutes maximum. AI generation processes in chunks; no single generation will exceed 10 seconds.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cinema-border bg-cinema-850">
          <button
            onClick={() => setNewProjectModalOpen(false)}
            className="px-4 py-2 text-sm text-cinema-textMuted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="flex items-center gap-2 px-5 py-2 bg-cinema-red hover:bg-cinema-redHover text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {isCreating ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};
