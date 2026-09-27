import React from 'react';
import { LayoutGrid, Image, Loader2, Plus } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { api } from '../../services/api';
import { Scene } from '../../types';

export const StoryboardPanel: React.FC = () => {
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
          <LayoutGrid className="w-3.5 h-3.5 text-cinema-ai" /> Storyboard
        </span>
        <button className="flex items-center gap-1 px-2 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-xs rounded">
          <Plus className="w-3.5 h-3.5" /> Add Frame
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {!activeProject ? (
          <p className="text-xs text-cinema-textDim text-center mt-8">Open a project to view storyboard</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-24 gap-2 text-cinema-textDim text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : scenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-cinema-textDim text-center">
            <LayoutGrid className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium">No storyboard frames yet</p>
            <p className="text-[11px]">Generate scenes in Story / Script to create storyboard frames</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {scenes.map((scene, i) => (
              <div key={scene.id} className="bg-cinema-850 border border-cinema-border rounded-lg overflow-hidden cursor-pointer hover:border-cinema-ai/40 transition-all">
                <div className="aspect-video bg-cinema-800 flex items-center justify-center relative">
                  {scene.storyboard_image_url ? (
                    <img src={scene.storyboard_image_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="text-center text-cinema-textDim/40">
                      <Image className="w-6 h-6 mx-auto mb-1" />
                      <p className="text-[10px]">Generate image</p>
                    </div>
                  )}
                  <span className="absolute top-1 left-1 bg-black/80 text-[9px] text-cinema-ai font-bold px-1.5 py-0.5 rounded">
                    S{i + 1}
                  </span>
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-[10px] text-cinema-text truncate font-medium">{scene.title}</p>
                  <p className="text-[9px] text-cinema-textDim">{scene.duration_sec}s</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
