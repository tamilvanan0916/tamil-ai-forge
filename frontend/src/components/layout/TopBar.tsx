import React, { useState } from 'react';
import {
  Film,
  Sparkles,
  Save,
  Undo2,
  Redo2,
  Download,
  ListOrdered,
  Settings as SettingsIcon,
  ChevronDown,
  Plus,
  CheckCircle2,
  Loader2,
  Menu,
  Activity,
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';
import { AICommandResponse } from '../../types';

interface TopBarProps {
  onMenuClick?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuClick }) => {
  const { projects, activeProject, selectProject } = useProjectStore();
  const { undo, redo, saveTimeline, isSaving, saveStatus, historyIndex, history } = useTimelineStore();
  const {
    aiCommandPrompt,
    setAICommandPrompt,
    isExecutingAICommand,
    setExecutingAICommand,
    setExportModalOpen,
    setRenderQueueModalOpen,
    setSettingsModalOpen,
    setNewProjectModalOpen,
    setProjectStatusModalOpen,
    showNotification,
  } = useUIStore();

  const [isProjectMenuOpen, setProjectMenuOpen] = useState(false);

  const handleRunAICommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiCommandPrompt.trim() || !activeProject) return;

    setExecutingAICommand(true);
    try {
      const res = await api.post('/ai/command', {
        project_id: activeProject.id,
        command: aiCommandPrompt.trim(),
      });
      const data = res.data;
      showNotification(`AI Action Executed: ${data.summary}`, 'success');

      // Execute structured actions against timeline store if clip is selected
      if (data.actions && data.actions.length > 0) {
        const store = useTimelineStore.getState();
        for (const act of data.actions) {
          if (act.type === 'SET_CLIP_DURATION' && store.selectedClipId) {
            store.updateClip(store.selectedClipId, c => { c.duration_ms = act.duration_ms || 8000; });
          } else if ((act.type === 'SET_CLIP_COLOR' || act.type === 'APPLY_CINEMATIC_GRADE') && store.selectedClipId && act.color_grade) {
            store.updateClip(store.selectedClipId, c => {
              if (!c.metadata_info) c.metadata_info = {};
              c.metadata_info.color_grade = { ...(c.metadata_info.color_grade || {}), ...act.color_grade };
            });
          } else if (act.type === 'SPLIT_CLIP' && store.selectedClipId) {
            store.splitClipAtPlayhead(store.selectedClipId);
          } else if (act.type === 'ADD_TRANSITION' && store.selectedClipId) {
            store.setClipTransition(store.selectedClipId, 'out', {
              type: act.details?.transition_type || 'crossfade',
              duration_ms: act.details?.duration_ms || 1000,
            });
          } else if (act.type === 'MOVE_CLIP_TRACK' && store.selectedClipId && store.timeline) {
            const trTarget = store.timeline.tracks.find(t =>
              t.name.toUpperCase().includes(act.track_id || 'V2') ||
              (t.order_index === 1 && t.track_type === 'video')
            );
            if (trTarget) {
              const currentClip = store.timeline.tracks.flatMap(t => t.clips).find(c => c.id === store.selectedClipId);
              if (currentClip) {
                store.moveClipToTrack(store.selectedClipId, trTarget.id, currentClip.start_time_ms);
              }
            }
          } else if (act.type === 'SET_TRACK_VOLUME' && store.timeline) {
            const tr = store.timeline.tracks.find(t => t.track_role === 'music' || t.name.includes('Music'));
            if (tr) store.setTrackVolume(tr.id, act.volume_db ?? -12.0);
          } else if (act.type === 'SET_CLIP_SPEED' && store.selectedClipId) {
            store.updateClip(store.selectedClipId, c => { c.speed_factor = act.details?.speed_factor || 0.5; });
          } else if (act.type === 'RENDER_FILM') {
            setExportModalOpen(true);
          }
        }
      }

      setAICommandPrompt('');
    } catch (err: any) {
      showNotification(`AI Command failed: ${err?.response?.data?.detail || err.message || 'Unknown error'}`, 'error');
    } finally {
      setExecutingAICommand(false);
    }
  };


  return (
    <header className="h-11 bg-cinema-850 border-b border-cinema-border flex items-center justify-between px-2 md:px-4 z-40 select-none">
      {/* Mobile & Tablet navigation hamburger (visible below desktop lg breakpoint) */}
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="p-1.5 mr-1 text-cinema-textDim hover:text-white lg:hidden flex-shrink-0"
          title="Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Brand & Project Selector */}
      <div className="flex items-center gap-2 md:gap-4 min-w-0 md:min-w-[280px]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 md:w-8 md:h-8 rounded bg-gradient-to-br from-cinema-red to-red-800 flex items-center justify-center shadow-lg shadow-red-950/50 flex-shrink-0">
            <Film className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5 leading-tight">
              <span className="font-extrabold tracking-wider text-xs md:text-sm text-white">TAMIL AI FORGE</span>
              <span className="text-[9px] uppercase font-semibold px-1 py-0.5 bg-cinema-red/20 text-cinema-red border border-cinema-red/40 rounded hidden md:inline">Cinema</span>
            </div>
            <p className="text-[10px] text-cinema-textDim leading-none hidden md:block">From Words to Cinema.</p>
          </div>
        </div>

        {/* Project Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProjectMenuOpen(!isProjectMenuOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-cinema-800 hover:bg-cinema-700 border border-cinema-border rounded text-xs text-cinema-text transition-colors max-w-[180px]"
          >
            <span className="truncate font-medium">
              {activeProject ? activeProject.title : 'Select Project'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-cinema-textMuted flex-shrink-0" />
          </button>

          {isProjectMenuOpen && (
            <div
              className="absolute left-0 top-full mt-1.5 w-64 bg-cinema-850 border border-cinema-border rounded-md shadow-2xl z-50 py-1"
              onMouseLeave={() => setProjectMenuOpen(false)}
            >
              <div className="px-3 py-1.5 border-b border-cinema-border flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-cinema-textDim font-bold">Projects</span>
                <button
                  type="button"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setNewProjectModalOpen(true);
                  }}
                  className="flex items-center gap-1 text-[11px] text-cinema-red hover:underline"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto py-1">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      selectProject(p);
                      setProjectMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-cinema-750 transition-colors ${
                      activeProject?.id === p.id ? 'text-cinema-ai font-semibold bg-cinema-800' : 'text-cinema-text'
                    }`}
                  >
                    <span className="truncate">{p.title}</span>
                    {activeProject?.id === p.id && <CheckCircle2 className="w-3.5 h-3.5 text-cinema-ai" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Save / Undo / Redo + Save status indicator */}
        <div className="flex items-center gap-1 border-l border-cinema-border pl-2 md:pl-3">
          <button
            type="button"
            onClick={() => {
              saveTimeline();
              showNotification('Timeline saved', 'success');
            }}
            disabled={isSaving}
            title="Save Project (Ctrl+S)"
            className="p-1 md:p-1.5 hover:bg-cinema-750 rounded text-cinema-textMuted hover:text-white transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin text-cinema-ai" /> : <Save className="w-3.5 h-3.5 md:w-4 md:h-4" />}
          </button>
          {/* Visual autosave indicator */}
          <span className={`text-[9px] font-medium hidden md:block ${
            saveStatus === 'saving' ? 'text-cinema-ai animate-pulse' :
            saveStatus === 'saved' ? 'text-emerald-400' :
            saveStatus === 'error' ? 'text-red-400' :
            'text-cinema-textDim'
          }`}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '⚠ Error' : ''}
          </span>
          <button
            type="button"
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
            className="p-1 md:p-1.5 hover:bg-cinema-750 rounded text-cinema-textMuted hover:text-white transition-colors disabled:opacity-30"
          >
            <Undo2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl+Y)"
            className="p-1 md:p-1.5 hover:bg-cinema-750 rounded text-cinema-textMuted hover:text-white transition-colors disabled:opacity-30"
          >
            <Redo2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>
      </div>

      {/* Center: AI Command Bar */}
      <div className="flex-1 max-w-xl mx-4">
        <form onSubmit={handleRunAICommand} className="relative flex items-center">
          <div className="absolute left-3 text-cinema-ai pointer-events-none flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 animate-pulse-cyan" />
          </div>
          <input
            type="text"
            value={aiCommandPrompt}
            onChange={(e) => setAICommandPrompt(e.target.value)}
            disabled={isExecutingAICommand}
            placeholder='AI Command: "Make this scene cinematic" or "Add emotional Tamil instrumental music"...'
            className="w-full bg-cinema-900 border border-cinema-border hover:border-cinema-borderLight focus:border-cinema-ai text-cinema-text text-xs pl-9 pr-24 py-1.5 rounded-full outline-none transition-all placeholder:text-cinema-textDim"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-cinema-textDim bg-cinema-800 border border-cinema-border rounded">
              Enter
            </kbd>
            {isExecutingAICommand && <Loader2 className="w-3.5 h-3.5 animate-spin text-cinema-ai" />}
          </div>
        </form>
      </div>

      {/* Right Controls: Project Status, Render Queue, Export, Settings */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          id="topbar-project-status-btn"
          data-testid="topbar-project-status-btn"
          onClick={() => setProjectStatusModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-cinema-800 hover:bg-cinema-700 border border-cinema-border rounded text-xs text-cinema-text transition-colors"
          title="Project Pipeline Status & Health"
        >
          <Activity className="w-3.5 h-3.5 text-cinema-ai" />
          <span className="hidden md:inline">Status</span>
        </button>

        <button
          type="button"
          onClick={() => setRenderQueueModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-cinema-800 hover:bg-cinema-700 border border-cinema-border rounded text-xs text-cinema-text transition-colors"
          title="Render Queue"
        >
          <ListOrdered className="w-3.5 h-3.5 text-cinema-textMuted" />
          <span className="hidden md:inline">Queue</span>
        </button>

        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cinema-red hover:bg-cinema-redHover text-white font-medium rounded text-xs shadow-lg shadow-red-950/40 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        <button
          type="button"
          onClick={() => setSettingsModalOpen(true)}
          className="p-1.5 hover:bg-cinema-750 text-cinema-textMuted hover:text-white rounded transition-colors"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
