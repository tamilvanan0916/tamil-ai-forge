import React from 'react';
import { Clapperboard, Plus, Loader2, MapPin, Clock } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { api } from '../../services/api';
import { Scene } from '../../types';

export const ScenesPanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const [scenes, setScenes] = React.useState<Scene[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/projects/${activeProject.id}/scenes`);
      setScenes(res.data);
    } catch { setScenes([]); }
    setIsLoading(false);
  }, [activeProject]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full bg-cinema-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-cinema-border">
        <span className="text-xs font-bold text-cinema-text flex items-center gap-2">
          <Clapperboard className="w-3.5 h-3.5 text-cinema-ai" /> Scenes
        </span>
        <button className="flex items-center gap-1 px-2 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-xs rounded">
          <Plus className="w-3.5 h-3.5" /> New Scene
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!activeProject ? (
          <p className="text-xs text-cinema-textDim text-center mt-8">Open a project to manage scenes</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-24 gap-2 text-cinema-textDim text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : scenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-cinema-textDim text-center">
            <Clapperboard className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium">No scenes yet</p>
            <p className="text-[11px]">Generate scenes from your story or create manually</p>
          </div>
        ) : (
          scenes.map((scene, i) => (
            <div key={scene.id} className="bg-cinema-850 border border-cinema-border rounded-lg p-3 cursor-pointer hover:border-cinema-ai/40 transition-all">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-cinema-ai">SCENE {i + 1}</span>
                <span className="text-[9px] text-cinema-textDim font-mono">{scene.duration_sec}s</span>
              </div>
              <p className="text-xs font-semibold text-cinema-text">{scene.title}</p>
              {scene.description && <p className="text-[10px] text-cinema-textDim mt-0.5 line-clamp-2">{scene.description}</p>}
              <div className="flex items-center gap-3 mt-1 text-[9px] text-cinema-textDim">
                {scene.location && <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{scene.location}</span>}
                {scene.time_of_day && <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{scene.time_of_day}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
