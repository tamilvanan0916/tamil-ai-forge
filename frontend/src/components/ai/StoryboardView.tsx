import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutGrid,
  MoveUp,
  MoveDown,
  Camera,
  Eye,
  Focus,
  ZoomIn,
  Sparkles,
  Loader2,
  Plus,
  Layers,
  Film,
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api, mediaUrl } from '../../services/api';

const SHOT_TYPES = [
  { id: 'all', label: 'All Shots' },
  { id: 'establishing', label: 'Establishing (24mm)', badge: 'Establishing', focal: '24mm Wide' },
  { id: 'medium', label: 'Medium (50mm)', badge: 'Medium Shot', focal: '50mm Standard' },
  { id: 'close-up', label: 'Close-up (85mm)', badge: 'Close-up', focal: '85mm Telephoto' },
  { id: 'detail', label: 'Detail (100mm)', badge: 'Detail / Insert', focal: '100mm Macro' },
] as const;

export const StoryboardView: React.FC = () => {
  const { activeProject, getAsset } = useProjectStore();
  const { showNotification } = useUIStore();
  const [scenes, setScenes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating4Shot, setIsCreating4Shot] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const loadStoryboard = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/ai/projects/${activeProject.id}/scenes`);
      setScenes(res.data);
    } catch {
      setScenes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStoryboard();
  }, [activeProject]);

  const handleMoveScene = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === scenes.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...scenes];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    setScenes(reordered);

    try {
      await api.post(`/ai/projects/${activeProject!.id}/storyboard/reorder`, {
        scene_ids: reordered.map((s) => s.id),
      });
      showNotification('Storyboard order updated', 'info');
    } catch {
      showNotification('Failed to save storyboard order', 'error');
      await loadStoryboard();
    }
  };

  const handleUpdateShotType = async (sceneId: string, newShotType: string) => {
    try {
      await api.patch(`/ai/scenes/${sceneId}`, { shot_type: newShotType });
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, shot_type: newShotType } : s))
      );
      showNotification('Shot type updated', 'info');
    } catch {
      showNotification('Failed to update shot type', 'error');
    }
  };

  const handleCreate4ShotCoverage = async () => {
    if (!activeProject) return;
    setIsCreating4Shot(true);
    try {
      const baseNum = scenes.length;
      const templates = [
        {
          scene_number: baseNum + 1,
          title: `Shot ${baseNum + 1} - Establishing Environment`,
          shot_type: 'Establishing Shot',
          camera_directions: '24mm Wide Angle • Slow Cinematic Pan',
          duration_sec: 5.0,
          visual_prompt: 'Cinematic wide establishing shot, atmospheric depth, golden hour illumination',
          location: 'Outdoor / Exterior',
          time_of_day: 'Sunset',
        },
        {
          scene_number: baseNum + 2,
          title: `Shot ${baseNum + 2} - Medium Subject Interaction`,
          shot_type: 'Medium Shot',
          camera_directions: '50mm Standard Lens • Gentle Eye-level Push-in',
          duration_sec: 5.0,
          visual_prompt: 'Medium two-shot framing characters in natural conversation, balanced composition',
          location: 'Interior / Studio',
          time_of_day: 'Evening',
        },
        {
          scene_number: baseNum + 3,
          title: `Shot ${baseNum + 3} - Close-up Emotional Nuance`,
          shot_type: 'Close-up',
          camera_directions: '85mm Telephoto Portrait • Shallow Depth of Field',
          duration_sec: 4.0,
          visual_prompt: 'Intimate close-up portrait focusing on eyes and subtle facial expressions, soft bokeh',
          location: 'Interior / Studio',
          time_of_day: 'Night',
        },
        {
          scene_number: baseNum + 4,
          title: `Shot ${baseNum + 4} - Detail Dramatic Insert`,
          shot_type: 'Detail Shot',
          camera_directions: '100mm Macro Lens • Dutch Angle Tension',
          duration_sec: 3.0,
          visual_prompt: 'High-contrast tactile detail insert shot emphasizing pivotal object and tension',
          location: 'Interior / Studio',
          time_of_day: 'Night',
        },
      ];

      for (const t of templates) {
        await api.post(`/ai/projects/${activeProject.id}/scenes`, t);
      }

      showNotification('4-Shot Cinematic Coverage added to storyboard', 'success');
      await loadStoryboard();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Failed to add 4-shot coverage', 'error');
    } finally {
      setIsCreating4Shot(false);
    }
  };

  // Helper to categorize shot
  const getShotCategory = (sc: any): 'establishing' | 'medium' | 'close-up' | 'detail' => {
    const raw = `${sc.shot_type || ''} ${sc.camera_directions || ''}`.toLowerCase();
    if (raw.includes('establishing') || raw.includes('wide') || raw.includes('24mm')) {
      return 'establishing';
    }
    if (raw.includes('close') || raw.includes('portrait') || raw.includes('85mm')) {
      return 'close-up';
    }
    if (raw.includes('detail') || raw.includes('insert') || raw.includes('macro') || raw.includes('100mm')) {
      return 'detail';
    }
    return 'medium';
  };

  const filteredScenes = useMemo(() => {
    if (selectedFilter === 'all') return scenes;
    return scenes.filter((sc) => getShotCategory(sc) === selectedFilter);
  }, [scenes, selectedFilter]);

  const getShotBadgeStyle = (category: string) => {
    switch (category) {
      case 'establishing':
        return {
          badge: 'bg-cyan-950/80 border-cyan-700/60 text-cyan-300',
          focal: '24mm Wide',
          icon: <Camera className="w-3 h-3 text-cyan-400" />,
        };
      case 'medium':
        return {
          badge: 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300',
          focal: '50mm Standard',
          icon: <Eye className="w-3 h-3 text-emerald-400" />,
        };
      case 'close-up':
        return {
          badge: 'bg-amber-950/80 border-amber-700/60 text-amber-300',
          focal: '85mm Telephoto',
          icon: <Focus className="w-3 h-3 text-amber-400" />,
        };
      case 'detail':
        return {
          badge: 'bg-purple-950/80 border-purple-700/60 text-purple-300',
          focal: '100mm Macro',
          icon: <ZoomIn className="w-3 h-3 text-purple-400" />,
        };
      default:
        return {
          badge: 'bg-cinema-800 border-cinema-border text-cinema-textDim',
          focal: '35mm Prime',
          icon: <Film className="w-3 h-3 text-cinema-ai" />,
        };
    }
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs" id="storyboard-view">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-850">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-cinema-ai" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            4-Shot Storyboard &amp; Coverage
          </span>
          <span className="text-[11px] text-cinema-textDim font-mono">({scenes.length} Total Shots)</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate4ShotCoverage}
            disabled={!activeProject || isCreating4Shot}
            id="add-4shot-btn"
            data-testid="add-4shot-btn"
            className="flex items-center gap-1.5 px-3 py-1 bg-cinema-ai hover:bg-cyan-500 text-cinema-void font-bold text-xs rounded transition-colors disabled:opacity-50"
            title="Generate standard 4-shot cinematic coverage (Establishing, Medium, Close-up, Detail)"
          >
            {isCreating4Shot ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Layers className="w-3.5 h-3.5" />
            )}
            <span>+ Add 4-Shot Coverage</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-cinema-border/60 bg-cinema-900 overflow-x-auto">
        <span className="text-[10px] text-cinema-textDim uppercase font-semibold mr-1">Filter:</span>
        {SHOT_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedFilter(t.id)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              selectedFilter === t.id
                ? 'bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/40 font-bold'
                : 'text-cinema-textDim hover:text-white hover:bg-cinema-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Storyboard Content Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {!activeProject ? (
          <p className="text-xs text-cinema-textDim text-center mt-8">
            Open a project to view and arrange storyboard shots
          </p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-24 text-cinema-textDim gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading storyboard shots...
          </div>
        ) : scenes.length === 0 ? (
          <div className="text-center py-12 text-cinema-textDim space-y-3">
            <LayoutGrid className="w-10 h-10 mx-auto opacity-20 text-cinema-ai" />
            <p className="text-sm font-semibold text-white">Storyboard Empty</p>
            <p className="text-xs max-w-sm mx-auto">
              Start with the 4-shot cinematic framework (Establishing, Medium, Close-up, Detail) or create scenes in Story Studio.
            </p>
            <button
              onClick={handleCreate4ShotCoverage}
              disabled={isCreating4Shot}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-cinema-red hover:bg-cinema-redHover text-white text-xs font-semibold rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Initialize 4-Shot Coverage
            </button>
          </div>
        ) : filteredScenes.length === 0 ? (
          <div className="text-center py-10 text-cinema-textDim">
            No shots matching "{selectedFilter}".
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredScenes.map((sc, idx) => {
              const category = getShotCategory(sc);
              const style = getShotBadgeStyle(category);
              const asset = sc.generated_asset_id ? getAsset(sc.generated_asset_id) : null;
              const previewUrl = asset?.storage_key ? mediaUrl(asset.storage_key) : null;

              return (
                <div
                  key={sc.id}
                  data-testid="storyboard-shot-card"
                  className="bg-cinema-850 border border-cinema-border rounded-lg overflow-hidden flex flex-col justify-between p-3.5 space-y-3 hover:border-cinema-ai/40 transition-colors shadow-lg"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-cinema-900 border border-cinema-border text-white font-mono text-[10px] font-bold rounded">
                        Shot #{sc.scene_number}
                      </span>
                      <span
                        data-testid="shot-type-badge"
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${style.badge}`}
                      >
                        {style.icon}
                        <span>{sc.shot_type || category.toUpperCase()}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveScene(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 text-cinema-textDim hover:text-white disabled:opacity-30 rounded hover:bg-cinema-800"
                        title="Move Shot Up"
                      >
                        <MoveUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveScene(idx, 'down')}
                        disabled={idx === scenes.length - 1}
                        className="p-1 text-cinema-textDim hover:text-white disabled:opacity-30 rounded hover:bg-cinema-800"
                        title="Move Shot Down"
                      >
                        <MoveDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Cinematic Visual Slate / Media Preview */}
                  <div className="aspect-video bg-cinema-950 border border-cinema-border/70 rounded relative overflow-hidden flex flex-col items-center justify-center p-3 text-center group">
                    {previewUrl ? (
                      <video
                        src={previewUrl}
                        className="w-full h-full object-cover rounded"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-1.5 text-cinema-textDim">
                        <Sparkles className="w-6 h-6 text-cinema-ai/40 group-hover:text-cinema-ai transition-colors" />
                        <p className="text-[11px] font-semibold text-white truncate max-w-[220px]">
                          {sc.title}
                        </p>
                        <p className="text-[10px] text-cinema-textDim font-mono">
                          {style.focal}
                        </p>
                      </div>
                    )}

                    {/* Duration badge overlay */}
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded font-mono text-[9px] text-white border border-white/20">
                      {sc.duration_sec}s
                    </div>
                  </div>

                  {/* Prompt & Details */}
                  <div className="space-y-1">
                    <p className="text-[10px] text-cinema-textDim line-clamp-2 italic">
                      "{sc.visual_prompt || 'No visual prompt specified.'}"
                    </p>
                    {sc.dialogue_text && (
                      <div className="text-[9px] text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 rounded px-2 py-1 font-serif line-clamp-1">
                        <span className="font-bold">Dialogue:</span> {sc.dialogue_text}
                      </div>
                    )}
                  </div>

                  {/* Camera & Technical Specs */}
                  <div className="pt-2 border-t border-cinema-border/60 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 text-cinema-textDim truncate max-w-[180px]">
                      <Camera className="w-3 h-3 text-cinema-ai flex-shrink-0" />
                      <span className="truncate">{sc.camera_directions || 'Static / Neutral'}</span>
                    </div>

                    {/* Shot Type Dropdown Switcher */}
                    <select
                      value={sc.shot_type || 'Medium Shot'}
                      onChange={(e) => handleUpdateShotType(sc.id, e.target.value)}
                      className="bg-cinema-900 border border-cinema-border rounded px-1.5 py-0.5 text-[10px] text-cinema-text outline-none hover:border-cinema-ai transition-colors"
                      title="Change Shot Framing Type"
                    >
                      <option value="Establishing Shot">Establishing (24mm)</option>
                      <option value="Medium Shot">Medium (50mm)</option>
                      <option value="Close-up">Close-up (85mm)</option>
                      <option value="Detail Shot">Detail (100mm)</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
