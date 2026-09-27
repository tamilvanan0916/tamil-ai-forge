import React from 'react';
import { Users, Plus, User, Loader2, Sparkles } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { api } from '../../services/api';
import { Character } from '../../types';

export const CharactersPanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/projects/${activeProject.id}/characters`);
      setCharacters(res.data);
    } catch { setCharacters([]); }
    setIsLoading(false);
  }, [activeProject]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full bg-cinema-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-cinema-border">
        <span className="text-xs font-bold text-cinema-text flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-cinema-ai" /> Characters
        </span>
        <button className="flex items-center gap-1 px-2 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-xs rounded">
          <Plus className="w-3.5 h-3.5" /> New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!activeProject ? (
          <p className="text-xs text-cinema-textDim text-center mt-8">Open a project to manage characters</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-24 gap-2 text-cinema-textDim text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-cinema-textDim text-center">
            <User className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium">No characters yet</p>
            <p className="text-[11px]">Create characters with visual reference images for AI consistency</p>
            <div className="mt-2 p-3 bg-cinema-800 border border-cinema-border rounded-lg text-left max-w-xs">
              <p className="text-[10px] text-cinema-ai font-semibold flex items-center gap-1 mb-1">
                <Sparkles className="w-3 h-3" /> Character Consistency
              </p>
              <p className="text-[10px] text-cinema-textDim">
                Upload reference images to generate AI shots with consistent character appearance across all scenes.
                Requires an image generation provider key.
              </p>
            </div>
          </div>
        ) : (
          characters.map(char => (
            <div key={char.id} className="bg-cinema-850 border border-cinema-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-cinema-ai/40 transition-all">
              <div className="w-10 h-10 rounded-full bg-cinema-700 flex items-center justify-center text-sm font-bold text-cinema-textMuted flex-shrink-0 overflow-hidden">
                {char.reference_images?.[0] ? <img src={char.reference_images[0]} className="w-full h-full object-cover" alt="" /> : (char.name?.[0] || '?')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-cinema-text">{char.name}</p>
                <p className="text-[10px] text-cinema-textDim truncate">{char.description || 'No description'}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
