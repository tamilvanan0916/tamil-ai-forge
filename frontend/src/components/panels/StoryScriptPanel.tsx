import React from 'react';
import { FileText, Plus, Loader2, Film, MapPin, Sun, Smile } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { api } from '../../services/api';
import { Scene } from '../../types';

export const StoryScriptPanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const [prompt, setPrompt] = React.useState('');
  const [duration, setDuration] = React.useState(120);
  const [genre, setGenre] = React.useState('Drama');
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [story, setStory] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!prompt.trim() || !activeProject) return;
    setIsAnalyzing(true);
    setError(null);
    setStory(null);
    try {
      const res = await api.post('/ai/story/analyze', {
        prompt: prompt.trim(),
        target_duration_sec: duration,
        genre,
      });
      setStory(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900">
      <div className="px-4 py-3 border-b border-cinema-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-cinema-ai" />
          <h2 className="text-sm font-bold text-white">Story & Script</h2>
        </div>
        <p className="text-[11px] text-cinema-textDim mt-0.5">Describe your story. AI will break it into scenes, characters and storyboard prompts.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!activeProject ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-cinema-textDim text-center">
            <Film className="w-8 h-8 opacity-30" />
            <p className="text-sm">Open a project to write a story</p>
          </div>
        ) : (
          <>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe your story, characters, and key scenes... e.g. 'A young fisherman from Rameswaram discovers an ancient temple underwater and must choose between fame and protecting it from treasure hunters.'"
              rows={6}
              className="w-full bg-cinema-850 border border-cinema-border rounded-lg p-3 text-xs text-cinema-text placeholder:text-cinema-textDim outline-none resize-none focus:border-cinema-ai transition-colors leading-relaxed"
              style={{ userSelect: 'text' }}
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-cinema-textDim mb-1">Target Duration</label>
                <select
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1.5 text-xs text-cinema-text outline-none"
                >
                  <option value={30}>30 seconds</option>
                  <option value={60}>1 minute</option>
                  <option value={120}>2 minutes</option>
                  <option value={180}>3 minutes</option>
                  <option value={300}>5 minutes</option>
                  <option value={600}>10 minutes</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-cinema-textDim mb-1">Genre</label>
                <select
                  value={genre}
                  onChange={e => setGenre(e.target.value)}
                  className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1.5 text-xs text-cinema-text outline-none"
                >
                  {['Drama', 'Action', 'Romance', 'Thriller', 'Comedy', 'Historical', 'Fantasy', 'Devotional'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!prompt.trim() || isAnalyzing}
              className="w-full py-2 bg-cinema-ai/20 hover:bg-cinema-ai/30 border border-cinema-ai/40 text-cinema-ai font-semibold text-xs rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isAnalyzing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing Story...</>
              ) : (
                <><Plus className="w-3.5 h-3.5" /> Analyze & Generate Story Structure</>
              )}
            </button>

            {error && (
              <div className="text-[11px] text-red-400 bg-red-950/30 border border-red-800/40 rounded p-2">{error}</div>
            )}

            {story && (
              <div className="space-y-3 mt-2">
                <div className="bg-cinema-850 border border-cinema-border rounded-lg p-3 space-y-2">
                  <h3 className="text-sm font-bold text-cinema-ai">{story.title}</h3>
                  <p className="text-[11px] text-cinema-text italic">"{story.logline}"</p>
                  <p className="text-[10px] text-cinema-textDim">{story.synopsis}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {story.themes?.map((t: string) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 bg-cinema-800 border border-cinema-border rounded text-cinema-textMuted">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {story.character_outlines?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-cinema-textMuted uppercase tracking-wider">Characters</p>
                    {story.character_outlines.map((c: any, i: number) => (
                      <div key={i} className="bg-cinema-850 border border-cinema-border rounded p-2 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-cinema-700 flex items-center justify-center text-[10px] font-bold text-cinema-textMuted">
                          {c.name?.[0] || '?'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-cinema-text">{c.name} {c.tamil_name && <span className="text-cinema-textDim">({c.tamil_name})</span>}</p>
                          <p className="text-[10px] text-cinema-textDim">{c.role} • {c.archetype}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {story.scene_outlines?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-cinema-textMuted uppercase tracking-wider">Scenes ({story.scene_outlines.length})</p>
                    {story.scene_outlines.map((s: any) => (
                      <div key={s.scene_number} className="bg-cinema-850 border border-cinema-border rounded p-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-cinema-text">Scene {s.scene_number}: {s.title}</span>
                          <span className="text-[9px] text-cinema-textDim font-mono">{s.duration_sec}s</span>
                        </div>
                        <div className="flex items-center gap-3 text-[9px] text-cinema-textDim">
                          {s.location && <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{s.location}</span>}
                          {s.time_of_day && <span className="flex items-center gap-1"><Sun className="w-2.5 h-2.5" />{s.time_of_day}</span>}
                          {s.mood && <span className="flex items-center gap-1"><Smile className="w-2.5 h-2.5" />{s.mood}</span>}
                        </div>
                        {s.dialogue && <p className="text-[10px] text-emerald-400/80 italic border-l-2 border-emerald-800 pl-2">{s.dialogue}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
