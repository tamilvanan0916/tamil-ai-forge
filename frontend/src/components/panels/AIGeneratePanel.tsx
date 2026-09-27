import React, { useState, useEffect } from 'react';
import { Sparkles, Film, RefreshCw, Play, Plus, Clock, AlertCircle, CheckCircle2, Sliders, ExternalLink, Lock, Layers, RotateCcw, Volume2, Music, Subtitles, FastForward } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';


export const AIGeneratePanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { timeline, addClipToTrack } = useTimelineStore();
  const { setAIQueueModalOpen, setAISettingsModalOpen, showNotification } = useUIStore();

  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState<number>(5.0);
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [currentJob, setCurrentJob] = useState<any>(null);
  const [activeVideoProvider, setActiveVideoProvider] = useState<string>('8scale');
  const [videoProviderStatus, setVideoProviderStatus] = useState<string>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addedSuccess, setAddedSuccess] = useState<boolean>(false);
  const [panelTab, setPanelTab] = useState<'clip' | 'production'>('clip');
  const [productionStatus, setProductionStatus] = useState<any>(null);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [isAssembling, setIsAssembling] = useState<boolean>(false);

  const EXAMPLE_PROMPT = 'Create a cinematic Tamil village festival at sunset. Colorful decorations, children playing, villagers celebrating, warm cinematic lighting and smooth camera movement.';

  const checkProviderStatus = async () => {
    try {
      const res = await api.get('/ai/providers');
      const vProv = res.data.find((p: any) => p.capability === 'video');
      if (vProv) {
        if (vProv.active_provider) {
          setActiveVideoProvider(vProv.active_provider);
        }
        setVideoProviderStatus(vProv.is_configured ? 'configured' : 'not_configured');
      } else {
        setVideoProviderStatus('not_configured');
      }
    } catch {
      setVideoProviderStatus('not_configured');
    }
  };

  const fetchProductionStatus = async () => {
    if (!activeProject) return;
    try {
      const res = await api.get(`/production/${activeProject.id}/status`);
      setProductionStatus(res.data);
    } catch {}
  };

  useEffect(() => {
    checkProviderStatus();
    if (activeProject) {
      fetchProductionStatus();
    }
  }, [activeProject, panelTab]);

  const handleCreatePlan = async () => {
    if (!activeProject) return;
    setIsPlanning(true);
    try {
      await api.post('/production/plan', {
        project_id: activeProject.id,
        prompt: prompt.trim() || undefined,
        target_duration_sec: durationSec,
        aspect_ratio: aspectRatio,
      });
      showNotification('Created multi-scene production plan', 'success');
      await fetchProductionStatus();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to create plan', 'error');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleStartProduction = async () => {
    if (!activeProject) return;
    setIsStarting(true);
    try {
      const res = await api.post(`/production/${activeProject.id}/start`);
      showNotification(`Production started (${res.data.enqueued_tasks?.length || 0} tasks enqueued)`, 'success');
      await fetchProductionStatus();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to start production', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!activeProject) return;
    setIsRetrying(true);
    try {
      const res = await api.post(`/production/${activeProject.id}/retry`);
      showNotification(`Retried ${res.data.retried_count || 0} transient failed scenes`, 'info');
      await fetchProductionStatus();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to retry', 'error');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleAutoAssemble = async () => {
    if (!activeProject) return;
    setIsAssembling(true);
    try {
      await api.post(`/film/${activeProject.id}/assemble`);
      showNotification('Auto-assembled timeline using probed media durations!', 'success');
      await fetchProductionStatus();
    } catch {
      try {
        await api.post(`/production/${activeProject.id}/auto-assemble`);
        showNotification('Auto-assembled timeline using probed media durations!', 'success');
        await fetchProductionStatus();
      } catch (err: any) {
        showNotification(err.response?.data?.detail || 'Failed to auto-assemble', 'error');
      }
    } finally {
      setIsAssembling(false);
    }
  };

  const handleGenerateVoice = async () => {
    if (!activeProject) return;
    try {
      const res = await api.post(`/film/${activeProject.id}/generate-audio?language=ta`);
      showNotification(`Generated dialogue voice audio (${res.data.dialogue_tasks?.length || 0} lines)`, 'success');
      await fetchProductionStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Voice generation failed', 'error');
    }
  };

  const handleGenerateMusic = async () => {
    if (!activeProject) return;
    try {
      await api.post(`/film/${activeProject.id}/generate-audio`);
      showNotification('Generated cinematic background score', 'success');
      await fetchProductionStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Music generation failed', 'error');
    }
  };

  const handleGenerateCaptions = async () => {
    if (!activeProject) return;
    try {
      const res = await api.post(`/film/${activeProject.id}/generate-captions?language=ta`);
      showNotification(`Generated ${res.data.captions_count || 0} captions`, 'success');
      await fetchProductionStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Captions generation failed', 'error');
    }
  };

  const handleRenderFilm = async () => {
    if (!activeProject) return;
    try {
      const res = await api.post(`/film/${activeProject.id}/render`, { export_format: 'mp4', resolution: '1080p' });
      showNotification(`Render job queued: ${res.data.job_id || 'active'}`, 'success');
      await fetchProductionStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Render enqueue failed', 'error');
    }
  };

  const handleRegenerateScene = async (sceneId: string) => {
    try {
      await api.post(`/film/scenes/${sceneId}/regenerate`);
      showNotification('Scene regeneration queued (previous asset preserved)', 'info');
      await fetchProductionStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Regenerate scene failed', 'error');
    }
  };

  const handleExtendScene = async (sceneId: string) => {
    try {
      await api.post(`/film/scenes/${sceneId}/extend?extend_sec=4.0`);
      showNotification('Scene duration extended by 4.0s', 'success');
      await fetchProductionStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Extend scene failed', 'error');
    }
  };


  const getProviderDisplayName = (provider: string) => {
    const p = provider.toLowerCase();
    if (p.includes('mock')) return 'Mock Video Generator';
    if (p.includes('omni')) return 'Omni Video Factory';
    if (p.includes('runway')) return 'Runway';
    if (p.includes('luma')) return 'Luma Dream Machine';
    return '8Scale';
  };

  const getProviderSubtitle = (provider: string) => {
    const p = provider.toLowerCase();
    if (p.includes('mock')) return '(Offline Simulation)';
    if (p.includes('omni')) return '(ZeroGPU)';
    if (p.includes('runway')) return '(Gen-3 / Gen-4)';
    if (p.includes('luma')) return '(Ray 2)';
    return '(Wan 2.2 14B)';
  };

  const getProviderStatusBadge = (provider: string, status: string) => {
    if (status !== 'configured') {
      return 'PROVIDER NOT CONFIGURED';
    }
    const p = provider.toLowerCase();
    if (p.includes('mock')) {
      return 'CONFIGURED (LOCAL MOCK)';
    }
    if (p.includes('omni')) {
      return 'CONFIGURED (ZEROGPU)';
    }
    return 'CONFIGURED (REAL API)';
  };

  const getProviderConfigMessage = (provider: string) => {
    const p = provider.toLowerCase();
    if (p.includes('mock')) return 'Local mock provider is active (no API key required)';
    if (p.includes('omni')) return 'Configure HF_TOKEN in server environment';
    if (p.includes('runway')) return 'Configure RUNWAY_API_KEY in server environment';
    if (p.includes('luma')) return 'Configure LUMA_API_KEY in server environment';
    return 'Configure EIGHTSCALE_API_KEY in server environment';
  };

  const handleGenerate = async () => {
    if (!activeProject || !prompt.trim()) return;
    setIsGenerating(true);
    setErrorMsg(null);
    setAddedSuccess(false);

    try {
      if (durationSec > 10.0) {
        // Multi-scene workflow for longer duration requests (1s to 10m)
        const res = await api.post(`/ai/video/workflow?project_id=${activeProject.id}&prompt=${encodeURIComponent(prompt.trim())}&target_duration_sec=${durationSec}`);
        if (res.data.status === 'provider_not_configured') {
          setErrorMsg(res.data.message || 'Video provider is not configured. Please configure your API key in AI Settings.');
          setCurrentJob(null);
        } else {
          showNotification(`Multi-scene workflow started (${res.data.scenes_count} scenes)`, 'success');
          setAIQueueModalOpen(true);
        }
      } else {
        // Single clip generation
        const res = await api.post('/ai/video/text-to-video', {
          project_id: activeProject.id,
          prompt: prompt.trim(),
          duration_sec: durationSec,
          aspect_ratio: aspectRatio,
        });
        setCurrentJob(res.data);
        pollJob(res.data.id);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to submit generation request';
      setErrorMsg(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const pollJob = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/ai/jobs/${jobId}`);
        const job = res.data;
        setCurrentJob(job);
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(interval);
          if (job.status === 'failed') {
            setErrorMsg(job.error_message || 'Video generation failed');
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleAddToTimeline = () => {
    if (!timeline || !currentJob || !currentJob.output_url) return;
    const vTrack = timeline.tracks.find(t => t.track_type === 'video') || timeline.tracks[0];
    if (!vTrack) {
      showNotification('No video track found on timeline', 'error');
      return;
    }

    const durMs = Math.round(durationSec * 1000);
    addClipToTrack(vTrack.id, {
      id: `clip-ai-${Date.now()}`,
      name: `AI: ${prompt.slice(0, 24)}...`,
      clip_type: 'media',
      duration_ms: durMs,
      source_in_ms: 0,
      source_out_ms: durMs,
      start_time_ms: 0,
      asset_id: currentJob.result_asset_id,
      effects: [],
      keyframes: []
    });

    setAddedSuccess(true);
    showNotification('AI video clip added to Timeline Track V1!', 'success');
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 text-cinema-text">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cinema-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-cinema-ai" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">AI Text-to-Video Engine</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAIQueueModalOpen(true)}
            className="px-2 py-1 bg-cinema-800 hover:bg-cinema-750 text-[10px] font-bold text-cinema-ai rounded border border-cinema-ai/30 transition-colors"
            title="View Generation Queue"
          >
            Queue
          </button>
          <button
            onClick={() => setAISettingsModalOpen(true)}
            className="p-1 text-cinema-textDim hover:text-white transition-colors"
            title="AI Provider Settings"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!activeProject ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-cinema-textDim text-center p-6">
          <Film className="w-8 h-8 opacity-30" />
          <p className="text-xs">Open a project to generate AI video clips</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Provider Status Banner */}
          <div className="bg-cinema-850 border border-cinema-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-white">Provider:</span>
                <span className="text-[11px] text-cinema-ai font-bold">
                  {getProviderDisplayName(activeVideoProvider)}
                </span>
                <span className="text-[10px] text-cinema-textDim">
                  {getProviderSubtitle(activeVideoProvider)}
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                videoProviderStatus === 'configured'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}>
                {getProviderStatusBadge(activeVideoProvider, videoProviderStatus)}
              </span>
            </div>
            {videoProviderStatus !== 'configured' && (
              <div className="flex items-center justify-between pt-1 border-t border-cinema-border/50 text-[10px]">
                <span className="text-amber-400/80">
                  {getProviderConfigMessage(activeVideoProvider)}
                </span>
                <button
                  onClick={() => setAISettingsModalOpen(true)}
                  className="text-cinema-ai hover:underline flex items-center gap-1 font-semibold"
                >
                  Set Key <ExternalLink className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-cinema-850 rounded-lg border border-cinema-border text-xs">
            <button
              onClick={() => setPanelTab('clip')}
              className={`py-1.5 font-bold rounded flex items-center justify-center gap-1.5 transition-colors ${
                panelTab === 'clip' ? 'bg-cinema-ai text-black shadow' : 'text-cinema-textDim hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Single Clip
            </button>
            <button
              id="production-tab-btn"
              data-testid="production-tab-btn"
              onClick={() => { setPanelTab('production'); fetchProductionStatus(); }}
              className={`py-1.5 font-bold rounded flex items-center justify-center gap-1.5 transition-colors ${
                panelTab === 'production' ? 'bg-cinema-ai text-black shadow' : 'text-cinema-textDim hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Production Orchestrator
            </button>
          </div>

          {panelTab === 'production' && (
            <div className="space-y-3">
              {/* Overall Progress */}
              <div className="bg-cinema-850 border border-cinema-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-[11px] uppercase tracking-wider">Overall Progress</span>
                  <span className="font-mono text-cinema-ai font-bold text-xs">
                    {productionStatus?.overall_progress_percent ?? 0}%
                  </span>
                </div>
                <div className="w-full bg-cinema-950 rounded-full h-2 overflow-hidden border border-cinema-border/40">
                  <div
                    className="bg-cinema-ai h-full transition-all duration-500 rounded-full"
                    style={{ width: `${productionStatus?.overall_progress_percent ?? 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-cinema-textDim">{productionStatus?.summary || 'No active production plan. Click Plan Scenes to start.'}</p>
              </div>

              {/* Character Consistency Lock */}
              {productionStatus?.character_locks && productionStatus.character_locks.length > 0 && (
                <div className="bg-cinema-850 border border-cinema-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-[11px] uppercase tracking-wider">Character Lock</span>
                    <span className="text-[10px] text-emerald-400 font-semibold">Consistent</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {productionStatus.character_locks.map((c: any) => (
                      <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cinema-900 border border-cinema-border text-[10px] text-cinema-text">
                        <Lock className="w-2.5 h-2.5 text-cinema-ai" />
                        <span className="font-semibold">{c.name}</span>
                        {c.tamil_name && <span className="text-cinema-textDim">({c.tamil_name})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Scenes Breakdown */}
              <div className="bg-cinema-850 border border-cinema-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-cinema-border/50 pb-1.5">
                  <span className="font-bold text-white text-[11px] uppercase tracking-wider">
                    Scenes ({productionStatus?.scenes?.length || 0})
                  </span>
                  <button onClick={fetchProductionStatus} className="text-cinema-textDim hover:text-white p-0.5" title="Refresh">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {(!productionStatus?.scenes || productionStatus.scenes.length === 0) ? (
                    <p className="text-[11px] text-cinema-textDim py-2 text-center">No scenes planned yet</p>
                  ) : (
                    productionStatus.scenes.map((s: any) => (
                      <div key={s.scene_id} className="p-2 rounded bg-cinema-900 border border-cinema-border/60 text-[11px] space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate">
                            {s.status === 'READY' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                            {s.status === 'GENERATING' && <RefreshCw className="w-3.5 h-3.5 text-cinema-ai animate-spin flex-shrink-0" />}
                            {s.status === 'FAILED' && <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                            {s.status === 'QUEUED' && <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                            {s.status === 'PLANNED' && <div className="w-3.5 h-3.5 rounded-full border border-cinema-textDim flex-shrink-0" />}
                            <span className="font-medium text-white truncate">Scene {s.scene_number} — {s.title}</span>
                          </div>
                          <span className={`scene-status-pill px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase flex-shrink-0 ${
                            s.status === 'READY' ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60' :
                            s.status === 'FAILED' ? 'text-red-400 bg-red-950/60 border border-red-800/60' :
                            s.status === 'GENERATING' ? 'text-cinema-ai bg-cyan-950/60 border border-cyan-800/60 animate-pulse' :
                            'text-cinema-textDim bg-cinema-800'
                          }`}>
                            {s.status === 'GENERATING' ? `${Math.round(s.progress_percent)}%` : s.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-cinema-border/30">
                          <button
                            id={`regenerate-scene-btn-${s.scene_id}`}
                            data-testid="regenerate-scene-btn"
                            onClick={() => handleRegenerateScene(s.scene_id)}
                            className="px-2 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-ai rounded border border-cinema-ai/30 text-[10px] font-medium flex items-center gap-1"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            Regenerate Scene
                          </button>
                          <button
                            id={`extend-scene-btn-${s.scene_id}`}
                            data-testid="extend-scene-btn"
                            onClick={() => handleExtendScene(s.scene_id)}
                            className="px-2 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-emerald-400 rounded border border-emerald-800/40 text-[10px] font-medium flex items-center gap-1"
                          >
                            <FastForward className="w-2.5 h-2.5" />
                            Extend Scene
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="plan-production-btn"
                    data-testid="plan-production-btn"
                    onClick={handleCreatePlan}
                    disabled={isPlanning}
                    className="py-2 bg-cinema-800 hover:bg-cinema-750 text-white font-bold rounded flex items-center justify-center gap-1.5 text-xs border border-cinema-border"
                  >
                    {isPlanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5 text-cinema-ai" />}
                    Plan Scenes
                  </button>
                  <button
                    id="generate-all-scenes-btn"
                    data-testid="generate-all-scenes-btn"
                    onClick={handleStartProduction}
                    disabled={isStarting}
                    className="py-2 bg-cinema-ai hover:bg-cinema-ai/90 text-black font-bold rounded flex items-center justify-center gap-1.5 text-xs"
                  >
                    {isStarting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-black" />}
                    Generate All Scenes
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    id="generate-voice-btn"
                    data-testid="generate-voice-btn"
                    onClick={handleGenerateVoice}
                    className="py-1.5 bg-cinema-800 hover:bg-cinema-750 text-white text-[11px] font-medium rounded border border-cinema-border flex items-center justify-center gap-1"
                  >
                    <Volume2 className="w-3 h-3 text-cinema-ai" />
                    Generate Voice
                  </button>
                  <button
                    id="generate-music-btn"
                    data-testid="generate-music-btn"
                    onClick={handleGenerateMusic}
                    className="py-1.5 bg-cinema-800 hover:bg-cinema-750 text-white text-[11px] font-medium rounded border border-cinema-border flex items-center justify-center gap-1"
                  >
                    <Music className="w-3 h-3 text-purple-400" />
                    Generate Music
                  </button>
                  <button
                    id="generate-captions-btn"
                    data-testid="generate-captions-btn"
                    onClick={handleGenerateCaptions}
                    className="py-1.5 bg-cinema-800 hover:bg-cinema-750 text-white text-[11px] font-medium rounded border border-cinema-border flex items-center justify-center gap-1"
                  >
                    <Subtitles className="w-3 h-3 text-amber-400" />
                    Generate Captions
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="assemble-timeline-btn"
                    data-testid="assemble-timeline-btn"
                    onClick={handleAutoAssemble}
                    disabled={isAssembling}
                    className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center justify-center gap-1.5 text-xs"
                  >
                    {isAssembling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
                    Assemble Timeline
                  </button>
                  <button
                    id="render-film-btn"
                    data-testid="render-film-btn"
                    onClick={handleRenderFilm}
                    className="py-2 bg-cinema-red hover:bg-cinema-redHover text-white font-bold rounded flex items-center justify-center gap-1.5 text-xs"
                  >
                    <Film className="w-3.5 h-3.5" />
                    Render Film
                  </button>
                </div>

                <button
                  id="retry-failed-btn"
                  data-testid="retry-failed-btn"
                  onClick={handleRetryFailed}
                  disabled={isRetrying}
                  className="w-full py-1.5 bg-cinema-800 hover:bg-cinema-750 text-amber-300 font-semibold rounded flex items-center justify-center gap-1.5 text-[11px] border border-amber-900/40"
                >
                  {isRetrying ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Retry Failed
                </button>
              </div>
            </div>
          )}

          {panelTab === 'clip' && (
            <>
              {/* Generation Form */}
              <div className="space-y-3 bg-cinema-850 border border-cinema-border rounded-lg p-3">


            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-cinema-textDim uppercase">Prompt</label>
              <button
                onClick={() => setPrompt(EXAMPLE_PROMPT)}
                className="text-[10px] text-cinema-ai hover:underline font-medium"
              >
                Load Example Tamil Prompt
              </button>
            </div>
            <textarea
              id="text-to-video-prompt"
              data-testid="text-to-video-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your scene in detail (e.g., Cinematic Tamil village festival at sunset...)"
              className="w-full bg-cinema-900 border border-cinema-border rounded p-2.5 text-xs text-white placeholder-cinema-textDim/50 focus:outline-none focus:border-cinema-ai resize-none"
            />

            {/* Duration & Aspect Ratio */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-semibold text-cinema-textDim block mb-1">Duration</label>
                <select
                  value={durationSec}
                  onChange={(e) => setDurationSec(parseFloat(e.target.value))}
                  className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-xs text-white focus:outline-none focus:border-cinema-ai"
                >
                  <option value={4.0}>4 seconds (Short Shot)</option>
                  <option value={5.0}>5 seconds (Standard Runway)</option>
                  <option value={10.0}>10 seconds (Full Clip)</option>
                  <option value={30.0}>30 seconds (Multi-Scene 6x)</option>
                  <option value={60.0}>1 minute (Story Scene 12x)</option>
                  <option value={300.0}>5 minutes (Cinema Feature)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-cinema-textDim block mb-1">Aspect Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-xs text-white focus:outline-none focus:border-cinema-ai"
                >
                  <option value="16:9">16:9 (Cinema / YouTube)</option>
                  <option value="9:16">9:16 (Shorts / Reels)</option>
                  <option value="1:1">1:1 (Square Feed)</option>
                </select>
              </div>
            </div>

            {/* Error Banner */}
            {errorMsg && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-900/50 rounded flex items-start gap-2 text-[11px] text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Generate Action Button */}
            <button
              id="generate-video-btn"
              data-testid="generate-video-btn"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-2 bg-cinema-ai hover:bg-cinema-ai/90 disabled:opacity-40 text-black font-bold rounded flex items-center justify-center gap-2 text-xs transition-all shadow-md"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting to Provider...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Video Clip</span>
                </>
              )}
            </button>
          </div>

          {/* Active Job / Generation Stage Display */}
          {currentJob && (
            <div className="bg-cinema-850 border border-cinema-border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white uppercase text-[11px]">Job Status</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  currentJob.status === 'completed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                  currentJob.status === 'failed' ? 'bg-red-950 text-red-400 border border-red-800' :
                  'bg-cyan-950 text-cyan-400 border border-cyan-800'
                }`}>
                  {currentJob.status}
                </span>
              </div>

              {/* Progress Stage Description */}
              <div className="space-y-1">
                <p className="text-[10px] text-cinema-textDim">Stage:</p>
                <p className="text-xs font-mono text-cinema-ai font-semibold">
                  {currentJob.status === 'queued' && '1/5 Queued for execution'}
                  {currentJob.status === 'running' && '2/5 Initializing runner...'}
                  {currentJob.status === 'provider_processing' && '3/5 Provider generating video stream...'}
                  {currentJob.status === 'downloading' && '4/5 Downloading raw provider media...'}
                  {currentJob.status === 'validating' && '5/5 Validating video with FFprobe...'}
                  {currentJob.status === 'registering_asset' && 'Registering media asset in database...'}
                  {currentJob.status === 'completed' && '✓ Validated & Registered as Project Asset'}
                  {currentJob.status === 'failed' && '✗ Generation halted'}
                </p>
              </div>

              {/* Result Preview & Add to Timeline */}
              {currentJob.status === 'completed' && currentJob.output_url && (
                <div className="space-y-3 pt-2 border-t border-cinema-border">
                  <div className="rounded overflow-hidden bg-black aspect-video relative flex items-center justify-center">
                    <video
                      src={currentJob.output_url}
                      controls
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <button
                    id="add-ai-video-to-timeline"
                    data-testid="add-ai-video-to-timeline"
                    onClick={handleAddToTimeline}
                    disabled={addedSuccess}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-bold rounded flex items-center justify-center gap-1.5 text-xs transition-colors"
                  >
                    {addedSuccess ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Added to Track V1</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add to Timeline (V1)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
            </>
          )}

          {/* System Rules Guarantee */}

          <div className="p-3 bg-cinema-800/60 border border-cinema-border rounded-lg space-y-1 text-[11px] text-cinema-textDim">
            <span className="text-cinema-ai font-semibold">Zero-Fake Policy:</span>
            <p className="leading-relaxed">
              When unconfigured, TAMIL AI FORGE returns an honest unavailable state. Real video generation requires a configured external provider key. Generated videos are downloaded, validated with FFprobe, and registered as true media assets.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
