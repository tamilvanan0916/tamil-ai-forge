import React, { useState, useEffect } from 'react';
import { BookOpen, Sparkles, Wand2, Loader2, Save, Layers, Film } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';

export const StoryStudio: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { showNotification } = useUIStore();
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState('Historical Epic');
  const [mood, setMood] = useState('Cinematic & Grand');
  const [language, setLanguage] = useState('ta');
  const [durationSec, setDurationSec] = useState(60);
  const [sceneCount, setSceneCount] = useState(4);
  const [visualStyle, setVisualStyle] = useState('Cinematic Kollywood Photorealistic');

  const [story, setStory] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAssembling, setIsAssembling] = useState(false);
  const [isCreatingVideo, setIsCreatingVideo] = useState(false);

  useEffect(() => {
    if (!activeProject) return;
    api.get(`/ai/projects/${activeProject.id}/story`)
      .then(r => setStory(r.data))
      .catch(() => setStory(null));
  }, [activeProject]);

  const handleGenerateStory = async () => {
    if (!activeProject || !prompt.trim()) {
      showNotification('Please enter a story prompt idea', 'warning');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await api.post('/ai/story/generate', {
        project_id: activeProject.id,
        prompt: prompt.trim(),
        genre,
        mood,
        language,
        target_duration_sec: durationSec,
        scene_count: sceneCount,
        visual_style: visualStyle,
      });
      setStory(res.data);
      showNotification('Story & Script generated successfully', 'success');
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Story generation failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateVideoFromStory = async () => {
    if (!activeProject) return;
    setIsCreatingVideo(true);
    try {
      const res = await api.post('/ai/story/create-video', {
        project_id: activeProject.id,
        prompt: prompt.trim() || undefined,
        target_duration_sec: durationSec,
        genre,
        mood,
      });
      if (res.data.status === 'provider_not_configured') {
        showNotification(res.data.message, 'warning');
      } else {
        showNotification(`Workflow started! Enqueued ${res.data.scenes_count} scene video jobs.`, 'success');
        api.get(`/ai/projects/${activeProject.id}/story`).then(r => setStory(r.data)).catch(() => {});
      }
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Video creation from story failed', 'error');
    } finally {
      setIsCreatingVideo(false);
    }
  };

  const handleAutoAssemble = async () => {
    if (!activeProject) return;
    setIsAssembling(true);
    try {
      const res = await api.post(`/ai/projects/${activeProject.id}/auto-assemble`);
      showNotification(`Timeline built! Created ${res.data.tracks_count} tracks from story.`, 'success');
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Timeline assembly failed', 'error');
    } finally {
      setIsAssembling(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs" id="story-studio">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-850">
        <span className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wider">
          <BookOpen className="w-4 h-4 text-cinema-ai" /> Story &amp; Script Studio
        </span>
        <div className="flex items-center gap-2">
          <button
            id="create-video-story-btn"
            data-testid="create-video-story-btn"
            onClick={handleCreateVideoFromStory}
            disabled={isCreatingVideo || isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cinema-800 border border-cinema-ai/40 text-cinema-ai font-semibold text-xs rounded hover:bg-cinema-ai/20 transition-colors disabled:opacity-50"
          >
            {isCreatingVideo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
            Create Video From Story
          </button>
          {story && (
            <button
              id="build-timeline-btn"
              data-testid="build-timeline-btn"
              onClick={handleAutoAssemble}
              disabled={isAssembling}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cinema-ai text-cinema-900 font-semibold text-xs rounded hover:bg-cinema-aiHover transition-colors disabled:opacity-50"
            >
              {isAssembling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              Build Timeline from Story
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Generator Form */}
        <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-white block mb-1">Story Idea / Prompt</label>
            <textarea
              id="story-prompt-input"
              data-testid="story-prompt-input"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. A secret messenger travels across ancient Tamil Nadu with urgent warnings of war..."
              rows={3}
              className="w-full bg-cinema-900 border border-cinema-border rounded p-2.5 text-cinema-text text-xs outline-none focus:border-cinema-ai resize-none"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-cinema-textDim block mb-1">Genre</label>
              <select value={genre} onChange={e => setGenre(e.target.value)} className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-cinema-text text-[11px]">
                <option value="Historical Epic">Historical Epic</option>
                <option value="Action Thriller">Action Thriller</option>
                <option value="Romantic Drama">Romantic Drama</option>
                <option value="Sci-Fi / Cyberpunk">Sci-Fi / Cyberpunk</option>
                <option value="Mythological">Mythological</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-cinema-textDim block mb-1">Mood</label>
              <select value={mood} onChange={e => setMood(e.target.value)} className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-cinema-text text-[11px]">
                <option value="Cinematic &amp; Grand">Cinematic &amp; Grand</option>
                <option value="Dark &amp; Gritty">Dark &amp; Gritty</option>
                <option value="Emotional &amp; Warm">Emotional &amp; Warm</option>
                <option value="High Energy / Suspense">High Energy / Suspense</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-cinema-textDim block mb-1">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-cinema-text text-[11px]">
                <option value="ta">Tamil (தமிழ்)</option>
                <option value="en">English</option>
                <option value="ta+en">Tamil + English (Bilingual)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-cinema-textDim block mb-1">Target Duration</label>
              <select value={durationSec} onChange={e => setDurationSec(parseInt(e.target.value))} className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-cinema-text text-[11px]">
                <option value={30}>30 Seconds (Teaser)</option>
                <option value={60}>60 Seconds (Short Film)</option>
                <option value={120}>2 Minutes (Trailer)</option>
                <option value={300}>5 Minutes (Full Scene)</option>
              </select>
            </div>
          </div>

          <button
            id="generate-story-btn"
            data-testid="generate-story-btn"
            onClick={handleGenerateStory}
            disabled={isGenerating}
            className="w-full py-2 bg-gradient-to-r from-cinema-red to-red-700 text-white font-semibold text-xs rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Story &amp; Script...</> : <><Sparkles className="w-4 h-4" /> Generate Story &amp; Script</>}
          </button>
        </div>

        {/* Display Generated Story */}
        {story && (
          <div className="space-y-4" id="story-display">
            <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-cinema-ai" /> {story.title}
              </h3>
              <p className="text-xs text-cinema-textDim italic">{story.logline}</p>
              <p className="text-xs text-cinema-text pt-2 leading-relaxed">{story.synopsis}</p>

              <div className="flex flex-wrap gap-1.5 pt-2">
                <span className="px-2 py-0.5 bg-cinema-800 text-cinema-ai rounded text-[10px] font-mono">{story.genre}</span>
                <span className="px-2 py-0.5 bg-cinema-800 text-amber-400 rounded text-[10px] font-mono">{story.mood}</span>
                <span className="px-2 py-0.5 bg-cinema-800 text-emerald-400 rounded text-[10px] font-mono">{story.language.toUpperCase()}</span>
                <span className="px-2 py-0.5 bg-cinema-800 text-purple-400 rounded text-[10px] font-mono">{story.target_duration_sec}s</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
