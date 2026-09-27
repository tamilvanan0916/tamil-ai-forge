import React, { useState, useEffect } from 'react';
import { Film, Plus, Trash2, Edit, Layers, Play, Loader2 } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';

export const SceneStudio: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { showNotification } = useUIStore();
  const [scenes, setScenes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('Interior / Studio');
  const [timeOfDay, setTimeOfDay] = useState('Day');
  const [durationSec, setDurationSec] = useState(5.0);
  const [visualPrompt, setVisualPrompt] = useState('');
  const [dialogueText, setDialogueText] = useState('');

  const loadScenes = async () => {
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
    loadScenes();
  }, [activeProject]);

  const handleCreateScene = async () => {
    if (!activeProject || !title.trim()) return;
    try {
      await api.post(`/ai/projects/${activeProject.id}/scenes`, {
        title: title.trim(),
        location,
        time_of_day: timeOfDay,
        duration_sec: durationSec,
        visual_prompt: visualPrompt.trim() || title,
        dialogue_text: dialogueText.trim() || undefined,
      });
      setTitle('');
      setVisualPrompt('');
      setDialogueText('');
      setIsCreating(false);
      showNotification('Scene created successfully', 'success');
      await loadScenes();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Failed to create scene', 'error');
    }
  };

  const handleDeleteScene = async (id: string) => {
    try {
      await api.delete(`/ai/scenes/${id}`);
      await loadScenes();
    } catch {
      showNotification('Failed to delete scene', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs" id="scene-studio">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-850">
        <span className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wider">
          <Film className="w-4 h-4 text-cinema-ai" /> Scene Studio
        </span>
        <button
          id="add-scene-btn"
          data-testid="add-scene-btn"
          onClick={() => setIsCreating(prev => !prev)}
          disabled={!activeProject}
          className="flex items-center gap-1.5 px-3 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-xs rounded transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Add Scene
        </button>
      </div>

      {isCreating && (
        <div className="p-4 bg-cinema-850 border-b border-cinema-border space-y-3">
          <p className="text-xs font-bold text-white">Create New Scene</p>
          <input type="text" placeholder="Scene Title (e.g. The Waterfront Encounter)..." value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs" />
          <div className="grid grid-cols-3 gap-2">
            <input type="text" placeholder="Location" value={location} onChange={e => setLocation(e.target.value)} className="bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs" />
            <select value={timeOfDay} onChange={e => setTimeOfDay(e.target.value)} className="bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs">
              <option value="Day">Day</option>
              <option value="Night">Night</option>
              <option value="Golden Hour">Golden Hour</option>
              <option value="Dawn">Dawn</option>
            </select>
            <input type="number" step="0.5" placeholder="Duration (s)" value={durationSec} onChange={e => setDurationSec(parseFloat(e.target.value) || 5.0)} className="bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs font-mono" />
          </div>
          <textarea placeholder="Visual prompt (e.g. Wide tracking shot of Marina waterfront at sunset, 8k resolution)..." value={visualPrompt} onChange={e => setVisualPrompt(e.target.value)} rows={2} className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs" />
          <input type="text" placeholder="Dialogue text (e.g. நம்பிக்கை தான் நம்முடைய பலம்)..." value={dialogueText} onChange={e => setDialogueText(e.target.value)} className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs font-serif" />
          <div className="flex justify-end pt-1">
            <button onClick={handleCreateScene} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded transition-colors">
              Save Scene
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!activeProject ? (
          <p className="text-xs text-cinema-textDim text-center mt-8">Open a project to view scenes</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-24 text-cinema-textDim gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading scenes...</div>
        ) : scenes.length === 0 ? (
          <div className="text-center py-12 text-cinema-textDim space-y-2">
            <Film className="w-8 h-8 mx-auto opacity-20" />
            <p className="text-xs font-semibold text-white">No Scenes Created</p>
            <p className="text-[11px]">Generate a story or click Add Scene to outline scenes.</p>
          </div>
        ) : (
          scenes.map(sc => (
            <div key={sc.id} className="p-3 bg-cinema-850 border border-cinema-border rounded-lg space-y-2 hover:border-cinema-ai/40 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-cinema-ai/20 text-cinema-ai font-mono text-[10px] font-bold rounded">Scene {sc.scene_number}</span>
                  <span className="font-bold text-white text-xs">{sc.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-cinema-textDim font-mono">{sc.duration_sec}s</span>
                  <button onClick={() => handleDeleteScene(sc.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <p className="text-[11px] text-cinema-textDim leading-relaxed">{sc.visual_prompt}</p>
              {sc.dialogue_text && (
                <p className="text-[11px] text-cinema-ai bg-cinema-900/60 p-2 rounded border border-cinema-border/50 font-serif">
                  &ldquo;{sc.dialogue_text}&rdquo;
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
