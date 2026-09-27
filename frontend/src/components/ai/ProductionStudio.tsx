import React, { useState, useEffect, useRef } from 'react';
import {
  Clapperboard, Sparkles, RefreshCw, Play, Pause, Layers,
  Volume2, VolumeX, Music, Subtitles, Film, CheckCircle2,
  AlertCircle, Clock, Lock, FastForward, Loader2,
  Sliders, ArrowRight, Maximize2, Download, ExternalLink,
  FileText, Check, RotateCcw, AlertTriangle, History, Wand2, Activity,
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api, mediaUrl } from '../../services/api';
import { WorkflowStepper } from './WorkflowStepper';
import { TimelineRevisionsModal } from '../timeline/TimelineRevisionsModal';

export const ProductionStudio: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { showNotification, setActiveSidebarTab, setProjectStatusModalOpen } = useUIStore();

  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState<number>(30.0);
  const [genre, setGenre] = useState('Historical Epic');
  const [mood, setMood] = useState('Cinematic & Grand');
  const [language, setLanguage] = useState('ta');
  const [aspectRatio, setAspectRatio] = useState('16:9');

  const [productionStatus, setProductionStatus] = useState<any>(null);
  const [deliverables, setDeliverables] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingDeliverables, setIsLoadingDeliverables] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [isAssembling, setIsAssembling] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [operatingSceneId, setOperatingSceneId] = useState<string | null>(null);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [isProducingFullFilm, setIsProducingFullFilm] = useState(false);
  const [produceStageMessage, setProduceStageMessage] = useState<string | null>(null);

  const [audioStem, setAudioStem] = useState<'dialogue' | 'music' | 'sfx' | null>(null);
  const [stemPlaying, setStemPlaying] = useState(false);
  const [stemTime, setStemTime] = useState(0);
  const [stemDuration, setStemDuration] = useState(0);
  const [stemVolume, setStemVolume] = useState(1.0);
  const stemAudioRef = useRef<HTMLAudioElement>(null);
  const [showRevisions, setShowRevisions] = useState(false);

  // Cinema Screening Theater State
  const [screeningAspect, setScreeningAspect] = useState<'16:9' | '9:16' | '2.39:1'>('16:9');
  const [isPlayingScreening, setIsPlayingScreening] = useState(false);
  const [screeningTime, setScreeningTime] = useState(0);
  const [screeningDuration, setScreeningDuration] = useState(0);
  const [screeningVolume, setScreeningVolume] = useState(1.0);
  const [isScreeningMuted, setIsScreeningMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [captions, setCaptions] = useState<Array<{ id: string; start_time_ms: number; end_time_ms: number; text: string }>>([]);

  const screeningVideoRef = useRef<HTMLVideoElement>(null);
  const theaterContainerRef = useRef<HTMLDivElement>(null);

  // Load captions for active project
  useEffect(() => {
    if (!activeProject?.id) return;
    api.get(`/projects/${activeProject.id}/captions`)
      .then(res => setCaptions(res.data || []))
      .catch(() => setCaptions([]));
  }, [activeProject?.id]);

  const getScreeningMediaUrl = (pathOrUrl?: string) => {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    if (pathOrUrl.startsWith('/api/v1/')) {
      const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      return `${base}${pathOrUrl}`;
    }
    return mediaUrl(pathOrUrl);
  };

  const togglePlayScreening = () => {
    if (!screeningVideoRef.current) return;
    if (isPlayingScreening) {
      screeningVideoRef.current.pause();
    } else {
      screeningVideoRef.current.play().catch(() => {});
    }
  };

  const handleScreeningSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!screeningVideoRef.current || !screeningDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * screeningDuration;
    screeningVideoRef.current.currentTime = targetSec;
    setScreeningTime(targetSec);
  };

  const toggleScreeningMute = () => {
    if (!screeningVideoRef.current) return;
    screeningVideoRef.current.muted = !isScreeningMuted;
    setIsScreeningMuted(!isScreeningMuted);
  };

  const handleScreeningVolumeChange = (vol: number) => {
    if (!screeningVideoRef.current) return;
    screeningVideoRef.current.volume = vol;
    setScreeningVolume(vol);
    if (vol > 0 && isScreeningMuted) {
      screeningVideoRef.current.muted = false;
      setIsScreeningMuted(false);
    }
  };

  const toggleScreeningFullscreen = () => {
    if (!theaterContainerRef.current) return;
    if (!document.fullscreenElement) {
      theaterContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const currentMs = screeningTime * 1000;
  const activeCaption = captions.find(c => c.start_time_ms <= currentMs && currentMs <= c.end_time_ms);

  const masterRender = productionStatus?.master_render;
  const renderInfo = productionStatus?.breakdown?.render || {};
  const renderStatus = (renderInfo.status || 'IDLE').toUpperCase();
  const renderProgress = renderInfo.progress_percent || 0.0;
  const renderError = renderInfo.error;
  const isMasterStale: boolean = productionStatus?.is_master_stale === true;

  // Phase 12 Stage 7 — Retry failed generation tasks
  const handleRetryFailed = async () => {
    if (!activeProject?.id) return;
    setIsRetryingFailed(true);
    try {
      const failedScenes = (productionStatus?.scenes || []).filter(
        (sc: any) => sc.status === 'FAILED'
      );
      let retried = 0;
      for (const sc of failedScenes) {
        if (!sc.scene_id) continue;
        try {
          await api.post(`/film/scenes/${sc.scene_id}/regenerate`);
          retried++;
        } catch {
          // skip scenes that fail to queue; non-retryable handled server-side
        }
      }
      showNotification(
        retried > 0 ? `Queued ${retried} scene(s) for retry` : 'No retryable scenes found',
        retried > 0 ? 'success' : 'info'
      );
      await fetchStatus();
    } catch {
      showNotification('Failed to retry generation tasks', 'error');
    } finally {
      setIsRetryingFailed(false);
    }
  };

  // Phase 12 Stage 5 — Audio stem auditioning helpers
  const toggleStemPlay = (stemRole: 'dialogue' | 'music' | 'sfx', stemUrl?: string) => {
    if (!stemAudioRef.current || !stemUrl) return;
    if (audioStem === stemRole && stemPlaying) {
      stemAudioRef.current.pause();
      setStemPlaying(false);
    } else {
      if (audioStem !== stemRole) {
        stemAudioRef.current.src = stemUrl.startsWith('http')
          ? stemUrl
          : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}${stemUrl}`;
        stemAudioRef.current.load();
        setAudioStem(stemRole);
        setStemTime(0);
      }
      stemAudioRef.current.volume = stemVolume;
      stemAudioRef.current.play().catch(() => {});
      setStemPlaying(true);
    }
  };

  const handleStemSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stemAudioRef.current || !stemDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * stemDuration;
    stemAudioRef.current.currentTime = targetSec;
    setStemTime(targetSec);
  };

  const handleStemVolumeChange = (vol: number) => {
    if (!stemAudioRef.current) return;
    stemAudioRef.current.volume = vol;
    setStemVolume(vol);
  };


  const fetchDeliverables = async () => {
    if (!activeProject?.id) return;
    setIsLoadingDeliverables(true);
    try {
      const res = await api.get(`/film/${activeProject.id}/deliverables`);
      setDeliverables(res.data);
    } catch {
      setDeliverables(null);
    } finally {
      setIsLoadingDeliverables(false);
    }
  };

  const fetchStatus = async () => {
    if (!activeProject) return;
    setIsLoadingStatus(true);
    try {
      const res = await api.get(`/film/${activeProject.id}/progress`);
      setProductionStatus(res.data);
      if (res.data?.master_render) {
        fetchDeliverables();
      }
    } catch {
      // Fallback to production endpoint if film progress is initializing
      try {
        const altRes = await api.get(`/production/${activeProject.id}/status`);
        setProductionStatus(altRes.data);
        if (altRes.data?.master_render) {
          fetchDeliverables();
        }
      } catch {
        setProductionStatus(null);
      }
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchDeliverables();
  }, [activeProject?.id]);

  // Active status polling while producing full film or while render is active
  useEffect(() => {
    if (!activeProject?.id) return;
    const isBusy =
      isProducingFullFilm ||
      ['QUEUED', 'PROCESSING', 'RENDERING'].includes(renderStatus) ||
      (productionStatus?.scenes || []).some((sc: any) => ['GENERATING', 'QUEUED'].includes(sc.status));

    if (!isBusy) return;

    const interval = setInterval(() => {
      fetchStatus();
      fetchDeliverables();
    }, 2500);

    return () => clearInterval(interval);
  }, [activeProject?.id, isProducingFullFilm, renderStatus, productionStatus?.scenes]);

  const handlePlanFilm = async () => {
    if (!activeProject) return;
    setIsPlanning(true);
    const filmPrompt = prompt.trim() || activeProject.description || 'Cinematic Tamil film production';
    try {
      await api.post(`/film/${activeProject.id}/analyze`, {
        prompt: filmPrompt,
        target_duration_sec: durationSec,
        genre,
        mood,
        language,
        aspect_ratio: aspectRatio,
      });
      // Also ensure production plan is initialized
      await api.post('/production/plan', {
        project_id: activeProject.id,
        prompt: filmPrompt,
        target_duration_sec: durationSec,
        aspect_ratio: aspectRatio,
        genre,
        mood,
      });
      showNotification('Film production plan created successfully', 'success');
      await fetchStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Failed to create plan', 'error');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleGenerateAllScenes = async () => {
    if (!activeProject) return;
    setIsGeneratingAll(true);
    try {
      const res = await api.post(`/film/${activeProject.id}/generate`);
      showNotification(`Generation started for all scenes (${res.data.tasks?.length || 0} tasks)`, 'success');
      await fetchStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Scene generation failed', 'error');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleRegenerateScene = async (sceneId: string) => {
    setOperatingSceneId(sceneId);
    try {
      await api.post(`/film/scenes/${sceneId}/regenerate`);
      showNotification(`Scene regeneration enqueued (previous version preserved)`, 'info');
      await fetchStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Regeneration failed', 'error');
    } finally {
      setOperatingSceneId(null);
    }
  };

  const handleExtendScene = async (sceneId: string) => {
    setOperatingSceneId(sceneId);
    try {
      await api.post(`/film/scenes/${sceneId}/extend?extend_sec=4.0`);
      showNotification(`Scene duration extended by 4.0s`, 'success');
      await fetchStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Extend scene failed', 'error');
    } finally {
      setOperatingSceneId(null);
    }
  };

  const handleGenerateVoice = async () => {
    if (!activeProject) return;
    setIsGeneratingVoice(true);
    try {
      const res = await api.post(`/film/${activeProject.id}/generate-audio?language=${language}`);
      showNotification(`Generated dialogue voice audio (${res.data.dialogue_tasks?.length || 0} lines)`, 'success');
      await fetchStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Voice generation failed', 'error');
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const handleGenerateMusic = async () => {
    if (!activeProject) return;
    setIsGeneratingMusic(true);
    try {
      await api.post(`/film/${activeProject.id}/generate-audio`);
      showNotification(`Cinematic background score generated`, 'success');
      await fetchStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Music generation failed', 'error');
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const handleGenerateCaptions = async () => {
    if (!activeProject) return;
    setIsGeneratingCaptions(true);
    try {
      const res = await api.post(`/film/${activeProject.id}/generate-captions?language=${language}`);
      showNotification(`Generated ${res.data.captions_count || 0} timed subtitles`, 'success');
      await fetchStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Captions generation failed', 'error');
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  const handleAssembleTimeline = async () => {
    if (!activeProject) return;
    setIsAssembling(true);
    try {
      const res = await api.post(`/film/${activeProject.id}/assemble`);
      showNotification(`Timeline assembled with ${res.data.tracks_count || 0} tracks using FFprobe durations!`, 'success');
      await fetchStatus();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Timeline assembly failed', 'error');
    } finally {
      setIsAssembling(false);
    }
  };

  const handleRenderFilm = async () => {
    if (!activeProject) return;
    setIsRendering(true);
    try {
      const framing = screeningAspect === '9:16' ? 'center_crop' : screeningAspect === '2.39:1' ? 'cinemascope' : 'fit';
      const res = await api.post(`/film/${activeProject.id}/render`, {
        export_format: 'mp4',
        resolution: '1080p',
        framing_mode: framing,
        burn_subtitles: showSubtitles,
        export_stems: true,
      });
      showNotification(`Film render job queued: ${res.data.job_id || 'active'}`, 'success');
      await fetchStatus();
      await fetchDeliverables();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Render enqueue failed', 'error');
    } finally {
      setIsRendering(false);
    }
  };

  const handleProduceFullFilm = async () => {
    if (!activeProject?.id || isProducingFullFilm) return;
    setIsProducingFullFilm(true);
    setProduceStageMessage('Executing full "From Words to Cinema" pipeline...');
    try {
      const filmPrompt = prompt.trim() || activeProject.description || 'Cinematic Tamil film production';
      const res = await api.post(`/film/${activeProject.id}/produce-all`, {
        prompt: filmPrompt,
        target_duration_sec: durationSec,
        genre,
        mood,
        language,
        aspect_ratio: aspectRatio,
        force: false,
      });

      if (res.data?.status === 'already_running') {
        showNotification(res.data.message || 'Production pipeline is already in progress.', 'info');
        setProduceStageMessage(res.data.message || 'Pipeline in progress.');
      } else {
        showNotification('Full film production pipeline running! Master render enqueued.', 'success');
        setProduceStageMessage('Master render enqueued. Finalizing theatrical deliverables...');
      }
      await fetchStatus();
      await fetchDeliverables();
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || 'Production pipeline failed';
      showNotification(errorMsg, 'error');
      setProduceStageMessage(`Failed: ${errorMsg}`);
    } finally {
      setIsProducingFullFilm(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs text-cinema-text" id="production-studio">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-850">
        <div className="flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-cinema-ai" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            AI Film Production Studio
          </span>
          <span className="px-1.5 py-0.5 bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/30 text-[9px] font-bold rounded">
            Phase 13 • From Words to Cinema
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="production-unified-status-btn"
            data-testid="production-unified-status-btn"
            onClick={() => setProjectStatusModalOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 bg-cinema-800 hover:bg-cinema-750 text-cinema-ai hover:text-white rounded border border-cinema-ai/30 text-[10px] font-medium transition-colors"
            title="Open Pipeline Health & 10-Stage Status Overview"
          >
            <Activity className="w-3 h-3 text-cinema-ai" />
            <span>Pipeline Status</span>
          </button>
          <button
            id="production-ai-transform-btn"
            data-testid="production-ai-transform-btn"
            onClick={() => setActiveSidebarTab('media-transform')}
            className="flex items-center gap-1.5 px-2 py-1 bg-cinema-ai/10 hover:bg-cinema-ai/20 text-cinema-ai rounded border border-cinema-ai/30 text-[10px] font-medium transition-colors"
            title="Open AI Media Transformation Studio"
          >
            <Wand2 className="w-3 h-3 text-cinema-ai" />
            <span>AI Transform</span>
          </button>
          <button
            id="production-revisions-btn"
            data-testid="production-revisions-btn"
            onClick={() => setShowRevisions(true)}
            className="flex items-center gap-1.5 px-2 py-1 bg-cinema-800 hover:bg-cinema-750 text-cinema-textDim hover:text-white rounded border border-cinema-border text-[10px] font-medium transition-colors"
            title="Timeline Revision History & Restore"
          >
            <History className="w-3 h-3 text-cinema-ai" />
            <span>Revisions</span>
          </button>
          <button
            onClick={fetchStatus}
            disabled={isLoadingStatus}
            className="p-1.5 text-cinema-textDim hover:text-white transition-colors"
            title="Refresh Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!activeProject ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-cinema-textDim p-6">
          <Clapperboard className="w-8 h-8 opacity-30" />
          <p className="text-xs">Open or create a project to start AI Film Production</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Film Planning Form */}
          <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-white">Film Vision / Story Prompt</label>
              <span className="text-[10px] text-cinema-textDim">Full Production Pipeline</span>
            </div>
            <textarea
              id="production-prompt-input"
              data-testid="production-prompt-input"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Master silk weaver in Kanchipuram passing down ancestral craft to his granddaughter..."
              rows={2}
              className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-cinema-text text-xs outline-none focus:border-cinema-ai resize-none"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Target Duration</label>
                <select
                  value={durationSec}
                  onChange={e => setDurationSec(parseFloat(e.target.value))}
                  className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-[11px]"
                >
                  <option value={15.0}>15 Seconds (Teaser)</option>
                  <option value={30.0}>30 Seconds (Short Scene)</option>
                  <option value={60.0}>60 Seconds (Trailer)</option>
                  <option value={120.0}>2 Minutes (Extended)</option>
                  <option value={300.0}>5 Minutes (Short Film)</option>
                  <option value={600.0}>10 Minutes (Epic Short)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Genre</label>
                <select value={genre} onChange={e => setGenre(e.target.value)} className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-[11px]">
                  <option value="Historical Epic">Historical Epic</option>
                  <option value="Drama">Drama</option>
                  <option value="Action Thriller">Action Thriller</option>
                  <option value="Mythological">Mythological</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Mood</label>
                <select value={mood} onChange={e => setMood(e.target.value)} className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-[11px]">
                  <option value="Cinematic & Grand">Cinematic & Grand</option>
                  <option value="Emotional & Warm">Emotional & Warm</option>
                  <option value="Dark & Gritty">Dark & Gritty</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-cinema-900 border border-cinema-border rounded p-1.5 text-white text-[11px]">
                  <option value="ta">Tamil (தமிழ்)</option>
                  <option value="en">English</option>
                  <option value="ta+en">Tamil + English</option>
                </select>
              </div>
            </div>
            <button
              id="plan-production-btn"
              data-testid="plan-production-btn"
              onClick={handlePlanFilm}
              disabled={isPlanning}
              className="w-full py-2 bg-cinema-800 hover:bg-cinema-750 text-white font-bold rounded flex items-center justify-center gap-1.5 border border-cinema-border transition-colors text-xs disabled:opacity-50"
            >
              {isPlanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5 text-cinema-ai" />}
              Plan Production (Characters, Scenes &amp; Continuity)
            </button>
          </div>

          {/* 8-Stage Multi-Stage Progress */}
          <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs uppercase tracking-wider">
                Production Progress
              </span>
              <span className="font-mono text-cinema-ai font-bold text-sm" id="production-overall-percent">
                {productionStatus?.overall_progress_percent ?? 0}%
              </span>
            </div>
            <div className="w-full bg-cinema-950 rounded-full h-2.5 overflow-hidden border border-cinema-border/50">
              <div
                id="production-overall-progress"
                className="bg-gradient-to-r from-cinema-ai to-emerald-400 h-full transition-all duration-500 rounded-full"
                style={{ width: `${productionStatus?.overall_progress_percent ?? 0}%` }}
              />
            </div>

            {/* Stages Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[10px]">
              {[
                { name: 'Story', val: productionStatus?.stage_progress?.story ?? 100 },
                { name: 'Characters', val: productionStatus?.stage_progress?.characters ?? 100 },
                { name: 'Scenes', val: productionStatus?.stage_progress?.scenes ?? 100 },
                { name: 'Video', val: productionStatus?.stage_progress?.video ?? 0 },
                { name: 'Voice', val: productionStatus?.stage_progress?.voice ?? 0 },
                { name: 'Music', val: productionStatus?.stage_progress?.music ?? 0 },
                { name: 'Captions', val: productionStatus?.stage_progress?.captions ?? 0 },
                { name: 'Render', val: productionStatus?.stage_progress?.render ?? 0 },
              ].map(st => (
                <div key={st.name} className="p-2 bg-cinema-900 rounded border border-cinema-border/50 flex items-center justify-between">
                  <span className="text-cinema-textDim">{st.name}</span>
                  <span className="font-mono text-cinema-ai font-semibold">{Math.round(st.val)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Phase 12 — 14-Step Workflow Stepper */}
          <div
            id="workflow-stepper"
            data-testid="workflow-stepper"
            className="p-4 bg-cinema-850 border border-cinema-border rounded-lg"
          >
            <WorkflowStepper productionStatus={productionStatus} />
          </div>

          {/* Character Consistency Locks */}
          {productionStatus?.character_locks && productionStatus.character_locks.length > 0 && (
            <div className="p-3 bg-cinema-850 border border-cinema-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" /> Character Consistency Locked
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">12 Attributes Synced</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {productionStatus.character_locks.map((c: any) => (
                  <div key={c.id || c.name} className="px-2.5 py-1.5 bg-cinema-900 border border-cinema-border rounded text-[11px] space-y-0.5">
                    <div className="font-semibold text-white flex items-center gap-1">
                      <span>{c.name}</span>
                      {c.tamil_name && <span className="text-cinema-ai">({c.tamil_name})</span>}
                    </div>
                    {c.appearance && <p className="text-[10px] text-cinema-textDim line-clamp-1">{c.appearance}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Production Workflow Action Controls */}
          <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs uppercase tracking-wider block">
                Orchestrator Actions
              </span>
              {produceStageMessage && (
                <span className="text-[11px] text-cinema-ai animate-pulse font-medium">
                  {produceStageMessage}
                </span>
              )}
            </div>

            {/* Stage 3: Prominent One-Click "Produce Full Film (Words to Cinema)" Action */}
            <div className="p-3.5 bg-gradient-to-r from-cinema-ai/15 via-cinema-900 to-cinema-950 border border-cinema-ai/40 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-cinema-ai/5">
              <div className="space-y-0.5 text-center sm:text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <Sparkles className="w-4 h-4 text-cinema-ai" />
                  <span className="font-bold text-white text-sm">Produce Full Film (Words to Cinema)</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/30 uppercase tracking-wider">
                    One-Click Pipeline
                  </span>
                </div>
                <p className="text-[11px] text-cinema-textDim">
                  Automates Story &rarr; Scene Media &rarr; Dialogue &rarr; Music &rarr; Captions &rarr; Timeline &rarr; Master Render
                </p>
              </div>

              <button
                id="produce-full-film-btn"
                data-testid="produce-full-film-btn"
                onClick={handleProduceFullFilm}
                disabled={isProducingFullFilm || isRendering}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-cinema-ai to-amber-400 hover:from-cinema-ai/90 hover:to-amber-400/90 text-black font-extrabold rounded-lg flex items-center justify-center gap-2 text-xs shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
              >
                {isProducingFullFilm ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Producing Cinema...</span>
                  </>
                ) : (
                  <>
                    <FastForward className="w-4 h-4 fill-black" />
                    <span>Produce Full Film</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Generate All Scenes */}
              <button
                id="generate-all-scenes-btn"
                data-testid="generate-all-scenes-btn"
                onClick={handleGenerateAllScenes}
                disabled={isGeneratingAll}
                className="py-2.5 px-3 bg-cinema-ai hover:bg-cinema-ai/90 text-black font-bold rounded flex items-center justify-center gap-2 text-xs transition-colors disabled:opacity-50"
              >
                {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-black" />}
                Generate All Scenes
              </button>

              {/* Generate Voice */}
              <button
                id="generate-voice-btn"
                data-testid="generate-voice-btn"
                onClick={handleGenerateVoice}
                disabled={isGeneratingVoice}
                className="py-2.5 px-3 bg-cinema-800 hover:bg-cinema-750 text-white font-semibold rounded flex items-center justify-center gap-2 text-xs border border-cinema-border transition-colors disabled:opacity-50"
              >
                {isGeneratingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4 text-cinema-ai" />}
                Generate Voice
              </button>

              {/* Generate Music */}
              <button
                id="generate-music-btn"
                data-testid="generate-music-btn"
                onClick={handleGenerateMusic}
                disabled={isGeneratingMusic}
                className="py-2.5 px-3 bg-cinema-800 hover:bg-cinema-750 text-white font-semibold rounded flex items-center justify-center gap-2 text-xs border border-cinema-border transition-colors disabled:opacity-50"
              >
                {isGeneratingMusic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4 text-purple-400" />}
                Generate Music
              </button>

              {/* Generate Captions */}
              <button
                id="generate-captions-btn"
                data-testid="generate-captions-btn"
                onClick={handleGenerateCaptions}
                disabled={isGeneratingCaptions}
                className="py-2.5 px-3 bg-cinema-800 hover:bg-cinema-750 text-white font-semibold rounded flex items-center justify-center gap-2 text-xs border border-cinema-border transition-colors disabled:opacity-50"
              >
                {isGeneratingCaptions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Subtitles className="w-4 h-4 text-amber-400" />}
                Generate Captions
              </button>

              {/* Assemble Timeline */}
              <button
                id="assemble-timeline-btn"
                data-testid="assemble-timeline-btn"
                onClick={handleAssembleTimeline}
                disabled={isAssembling}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center justify-center gap-2 text-xs transition-colors disabled:opacity-50"
              >
                {isAssembling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                Assemble Timeline
              </button>

              {/* Render Film */}
              <button
                id="render-film-btn"
                data-testid="render-film-btn"
                onClick={handleRenderFilm}
                disabled={isRendering}
                className="py-2.5 px-3 bg-cinema-red hover:bg-cinema-redHover text-white font-bold rounded flex items-center justify-center gap-2 text-xs transition-colors disabled:opacity-50"
              >
                {isRendering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                Render Film
              </button>

              {/* Phase 12 Stage 7 — Retry Failed Generation Tasks */}
              {(productionStatus?.scenes || []).some((sc: any) => sc.status === 'FAILED') && (
                <button
                  id="retry-failed-btn"
                  data-testid="retry-failed-btn"
                  onClick={handleRetryFailed}
                  disabled={isRetryingFailed}
                  className="py-2.5 px-3 bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded flex items-center justify-center gap-2 text-xs transition-colors disabled:opacity-50 col-span-1 sm:col-span-1"
                  title="Retry all failed scene generation tasks (skips permanent failures)"
                >
                  {isRetryingFailed ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Retry Failed Tasks
                </button>
              )}
            </div>
          </div>

          {/* Phase 12 Stage 6 — Stale Master Warning Banner */}
          {isMasterStale && (
            <div
              id="stale-master-banner"
              data-testid="stale-master-banner"
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-amber-700/50 bg-amber-950/40"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-300">Master Render is Stale</p>
                  <p className="text-[10px] text-amber-400/80">
                    The timeline was edited after the last render. Re-render to update the master.
                  </p>
                </div>
              </div>
              <button
                onClick={handleRenderFilm}
                disabled={isRendering}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
              >
                {isRendering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Re-render
              </button>
            </div>
          )}

          {/* Cinema Screening Theater */}
          <div
            id="cinema-screening-theater"
            data-testid="cinema-screening-theater"
            ref={theaterContainerRef}
            className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3"
          >
            <div className="flex items-center justify-between border-b border-cinema-border/60 pb-2">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-cinema-ai" />
                <span className="font-bold text-white text-xs uppercase tracking-wider">
                  Cinema Screening Theater
                </span>
                <span className={`px-1.5 py-0.5 border text-[9px] font-bold rounded ${
                  masterRender?.status === 'completed' && masterRender.file_exists
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                    : renderStatus === 'PROCESSING'
                    ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60 animate-pulse'
                    : renderStatus === 'FAILED'
                    ? 'bg-red-950/60 text-red-400 border-red-800/60'
                    : 'bg-cinema-ai/20 text-cinema-ai border-cinema-ai/30'
                }`}>
                  {masterRender?.status === 'completed' && masterRender.file_exists ? 'Master Ready' : renderStatus}
                </span>
                {/* Probed media specs pill */}
                <div
                  id="cinema-media-specs"
                  data-testid="cinema-media-specs"
                  className="px-2 py-0.5 rounded bg-cinema-900 border border-cinema-border text-[9px] font-mono text-cinema-textDim hidden md:inline"
                >
                  {masterRender && masterRender.file_exists
                    ? `${masterRender.width || 1920}x${masterRender.height || 1080} • ${masterRender.fps || 30}fps • ${masterRender.codec_video || masterRender.codec || 'h264'} • ${
                        masterRender.file_size_bytes || masterRender.file_size
                          ? ((masterRender.file_size_bytes || masterRender.file_size) / (1024 * 1024)).toFixed(1) + 'MB'
                          : ''
                      } • ${masterRender.duration_sec || masterRender.duration || 0}s`
                    : '1080p • 30fps • ProRes / H.264 Standby'}
                </div>
              </div>

              {/* Right Controls: Subtitles Toggle & Aspect Ratio Framing Controls */}
              <div className="flex items-center gap-2 text-[10px]">
                {/* Subtitles / CC Toggle */}
                <button
                  id="cinema-subtitles-toggle-btn"
                  data-testid="cinema-subtitles-btn"
                  onClick={() => setShowSubtitles(!showSubtitles)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded font-mono font-semibold text-[10px] border transition-colors ${
                    showSubtitles
                      ? 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                      : 'bg-cinema-900 text-cinema-textDim hover:text-white border-cinema-border/40'
                  }`}
                  title="Toggle Subtitles / Captions Overlay"
                >
                  <Subtitles className="w-3 h-3" />
                  <span>CC Subtitles</span>
                </button>

                {/* Aspect Ratio Framing Controls */}
                <div className="flex items-center gap-1" id="cinema-aspect-ratio-select">
                  <span className="text-cinema-textDim hidden sm:inline mr-1">Framing:</span>
                  {(['16:9', '9:16', '2.39:1'] as const).map(ar => (
                    <button
                      key={ar}
                      id={`cinema-aspect-${ar.replace(':', '-')}`}
                      onClick={() => setScreeningAspect(ar)}
                      className={`px-2 py-0.5 rounded font-mono font-semibold transition-colors ${
                        screeningAspect === ar
                          ? 'bg-cinema-ai text-black font-bold'
                          : 'bg-cinema-900 text-cinema-textDim hover:text-white border border-cinema-border/40'
                      }`}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Screening Viewport / Standby Slate */}
            <div
              id="cinema-theater-screen"
              data-testid="cinema-theater-screen"
              className="w-full bg-[#030407] rounded-lg overflow-hidden flex items-center justify-center p-2 sm:p-4 min-h-[220px] relative border border-cinema-border/50"
            >
              {masterRender && masterRender.file_exists && masterRender.download_url ? (
                <div
                  className={`relative transition-all duration-300 flex items-center justify-center bg-black overflow-hidden shadow-2xl rounded ${
                    screeningAspect === '16:9'
                      ? 'w-full max-w-2xl aspect-video'
                      : screeningAspect === '9:16'
                      ? 'w-full max-w-[240px] sm:max-w-[280px] aspect-[9/16]'
                      : 'w-full max-w-2xl aspect-[2.39/1]'
                  }`}
                >
                  <video
                    ref={screeningVideoRef}
                    src={getScreeningMediaUrl(masterRender.download_url || masterRender.output_path)}
                    playsInline
                    preload="auto"
                    onTimeUpdate={() => {
                      if (screeningVideoRef.current) {
                        setScreeningTime(screeningVideoRef.current.currentTime);
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (screeningVideoRef.current) {
                        setScreeningDuration(screeningVideoRef.current.duration || masterRender.duration_sec || 0);
                      }
                    }}
                    onPlay={() => setIsPlayingScreening(true)}
                    onPause={() => setIsPlayingScreening(false)}
                    onEnded={() => setIsPlayingScreening(false)}
                    className="w-full h-full object-contain pointer-events-auto"
                    onClick={togglePlayScreening}
                  />

                  {/* CinemaScope 2.39:1 Letterbox Matte Bars */}
                  {screeningAspect === '2.39:1' && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-[4%] bg-black/90 pointer-events-none z-10 border-b border-white/5" />
                      <div className="absolute bottom-0 left-0 right-0 h-[4%] bg-black/90 pointer-events-none z-10 border-t border-white/5" />
                    </>
                  )}

                  {/* Subtitle / Caption Overlay */}
                  {showSubtitles && activeCaption && (
                    <div className="absolute bottom-4 left-4 right-4 text-center pointer-events-none z-20">
                      <span className="inline-block px-3 py-1 bg-black/80 text-white font-medium text-xs sm:text-sm rounded border border-white/10 shadow-lg backdrop-blur-sm">
                        {activeCaption.text}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* Honest Standby / Progress / Error Slate */
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-2 text-cinema-textDim">
                  {renderStatus === 'PROCESSING' ? (
                    <>
                      <Loader2 className="w-8 h-8 text-cinema-ai animate-spin mb-1" />
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Rendering Film Master</p>
                      <p className="text-[11px] text-cinema-textMuted">Local FFmpeg worker compositing scenes, audio &amp; color grade ({Math.round(renderProgress)}%)</p>
                      <div className="w-48 bg-cinema-800 rounded-full h-1.5 overflow-hidden mt-2">
                        <div className="h-full bg-cinema-ai rounded-full transition-all duration-300" style={{ width: `${Math.max(5, renderProgress)}%` }} />
                      </div>
                    </>
                  ) : renderStatus === 'QUEUED' ? (
                    <>
                      <Clock className="w-8 h-8 text-amber-400 mb-1" />
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Render Job Queued</p>
                      <p className="text-[11px]">Waiting in background queue for composition worker...</p>
                    </>
                  ) : renderStatus === 'FAILED' ? (
                    <>
                      <AlertCircle className="w-8 h-8 text-red-400 mb-1" />
                      <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Render Composition Failed</p>
                      <p className="text-[11px] text-red-300/80 max-w-md bg-red-950/30 border border-red-900/30 rounded p-2">
                        {renderError || 'An error occurred during video encoding.'}
                      </p>
                      <button
                        onClick={handleRenderFilm}
                        className="px-3 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-xs font-semibold rounded mt-1 transition-colors"
                      >
                        Retry Render
                      </button>
                    </>
                  ) : masterRender && !masterRender.file_exists ? (
                    <>
                      <AlertCircle className="w-8 h-8 text-amber-400 mb-1" />
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Master Output File Missing</p>
                      <p className="text-[11px] text-cinema-textMuted">Render record exists, but output MP4 was moved or deleted from disk.</p>
                      <button
                        onClick={handleRenderFilm}
                        className="px-3 py-1 bg-cinema-ai text-black text-xs font-bold rounded mt-1 transition-colors"
                      >
                        Re-Render Film Master
                      </button>
                    </>
                  ) : (
                    <>
                      <Clapperboard className="w-8 h-8 opacity-30 mb-1 text-cinema-ai" />
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Master render is not ready yet.</p>
                      <p className="text-[11px] text-cinema-textDim max-w-sm">
                        Assemble your timeline and click &ldquo;Render Film&rdquo; to screen your completed cinema masterpiece here.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Cinema Transport & Scrubbing Bar */}
            {masterRender && masterRender.file_exists && (
              <div className="space-y-2 pt-1">
                {/* Seek Bar */}
                <div
                  id="cinema-seek-bar"
                  data-testid="cinema-seek-bar"
                  onClick={handleScreeningSeek}
                  className="w-full bg-cinema-800 hover:bg-cinema-750 h-2 rounded-full cursor-pointer relative overflow-hidden transition-colors"
                >
                  <div
                    className="h-full bg-cinema-ai rounded-full transition-all duration-100"
                    style={{
                      width: `${screeningDuration > 0 ? (screeningTime / screeningDuration) * 100 : 0}%`
                    }}
                  />
                </div>

                {/* Transport Controls & Timecode */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {/* Play/Pause */}
                    <button
                      id="cinema-play-btn"
                      data-testid="cinema-play-btn"
                      onClick={togglePlayScreening}
                      className="p-1.5 bg-cinema-ai hover:bg-cinema-ai/90 text-black rounded font-bold transition-colors"
                      title={isPlayingScreening ? 'Pause (Space)' : 'Play (Space)'}
                    >
                      {isPlayingScreening ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black" />}
                    </button>

                    {/* Timecode */}
                    <span className="font-mono text-[11px] text-cinema-textDim" id="cinema-timecode">
                      <span className="text-white font-semibold">{formatSeconds(screeningTime)}</span> / {formatSeconds(screeningDuration || masterRender.duration_sec || 0)}
                    </span>

                    {/* Volume & Mute */}
                    <div className="flex items-center gap-1 pl-2 border-l border-cinema-border/60">
                      <button
                        id="cinema-volume-btn"
                        data-testid="cinema-volume-btn"
                        onClick={toggleScreeningMute}
                        className="p-1 text-cinema-textDim hover:text-white transition-colors"
                        title={isScreeningMuted ? 'Unmute' : 'Mute'}
                      >
                        {isScreeningMuted || screeningVolume === 0 ? (
                          <VolumeX className="w-3.5 h-3.5 text-cinema-red" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isScreeningMuted ? 0 : screeningVolume}
                        onChange={e => handleScreeningVolumeChange(parseFloat(e.target.value))}
                        className="w-16 h-1 accent-cinema-ai cursor-pointer"
                        title="Volume"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Subtitle Toggle */}
                    <button
                      id="cinema-subtitles-btn"
                      data-testid="cinema-subtitles-btn"
                      onClick={() => setShowSubtitles(!showSubtitles)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
                        showSubtitles
                          ? 'bg-amber-950/40 text-amber-300 border-amber-700/40'
                          : 'bg-cinema-800 text-cinema-textDim border-cinema-border'
                      }`}
                      title="Toggle Captions"
                    >
                      <Subtitles className="w-3.5 h-3.5" />
                      <span>Subtitles</span>
                    </button>

                    {/* Fullscreen */}
                    <button
                      id="cinema-fullscreen-btn"
                      data-testid="cinema-fullscreen-btn"
                      onClick={toggleScreeningFullscreen}
                      className="p-1 text-cinema-textDim hover:text-white transition-colors"
                      title="Fullscreen Theater"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Master Specs Pill */}
                    <span className="text-[10px] text-cinema-textDim font-mono hidden xl:inline" id="cinema-transport-specs">
                      {masterRender.width}x{masterRender.height} • {masterRender.fps}fps • {masterRender.codec || masterRender.codec_video || 'h264'}
                      {masterRender.file_size_bytes || masterRender.file_size
                        ? ` • ${(((masterRender.file_size_bytes || masterRender.file_size)) / (1024 * 1024)).toFixed(1)}MB`
                        : ''}
                    </span>

                    {/* Master Download */}
                    {masterRender.download_url && (
                      <a
                        id="cinema-download-master-btn"
                        data-testid="cinema-download-master-btn"
                        href={getScreeningMediaUrl(masterRender.download_url)}
                        download={masterRender.file_name || 'master_film.mp4'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-[11px] transition-colors"
                        title="Download Final Master MP4"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Master</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Media Specs Badge */}
                <div
                  id="cinema-media-specs"
                  data-testid="cinema-media-specs"
                  className="flex flex-wrap items-center gap-2 p-2 bg-cinema-900 border border-cinema-border/50 rounded text-[10px] font-mono text-cinema-textDim"
                >
                  <span className="text-emerald-400 font-bold uppercase">PROBED SPECS:</span>
                  <span className="px-1.5 py-0.2 bg-cinema-800 rounded text-white">{masterRender.width}×{masterRender.height}</span>
                  <span className="px-1.5 py-0.2 bg-cinema-800 rounded text-cinema-ai">{masterRender.fps} FPS</span>
                  <span className="px-1.5 py-0.2 bg-cinema-800 rounded text-amber-300 uppercase">{masterRender.codec_video || 'H.264'}</span>
                  <span className="px-1.5 py-0.2 bg-cinema-800 rounded text-purple-300 uppercase">{masterRender.codec_audio || 'AAC'}</span>
                  {masterRender.duration_sec && (
                    <span className="px-1.5 py-0.2 bg-cinema-800 rounded text-cinema-text">{masterRender.duration_sec}s</span>
                  )}
                  {masterRender.file_size_bytes > 0 && (
                    <span className="text-cinema-textMuted">
                      {(masterRender.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Phase 11: Film Deliverables & Master Package */}
          <div
            id="film-deliverables-panel"
            data-testid="film-deliverables-panel"
            className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3"
          >
            <div className="flex items-center justify-between border-b border-cinema-border/60 pb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cinema-ai" />
                <span className="font-bold text-white text-xs uppercase tracking-wider">
                  Film Deliverables Package
                </span>
                <span className="px-1.5 py-0.5 bg-purple-950 text-purple-300 border border-purple-800 text-[9px] font-bold rounded">
                  Phase 11
                </span>
              </div>
              <button
                id="refresh-deliverables-btn"
                data-testid="refresh-deliverables-btn"
                onClick={fetchDeliverables}
                disabled={isLoadingDeliverables}
                className="text-[10px] text-cinema-textDim hover:text-white transition-colors flex items-center gap-1"
                title="Refresh Deliverables Package"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingDeliverables ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <p className="text-[11px] text-cinema-textDim leading-relaxed">
              Full theatrical deliverable assets including master conform, isolated audio stems (Dialogue, Music, SFX), and timed subtitle tracks ready for exhibition and OTT distribution.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. Master Video Card */}
              <div className="p-3 bg-cinema-900 border border-cinema-border rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-cinema-ai" /> Master Video
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${masterRender ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-cinema-800 text-cinema-textDim'}`}>
                    {masterRender ? 'READY' : 'PENDING'}
                  </span>
                </div>
                <div className="text-[10px] text-cinema-textDim space-y-0.5 font-mono">
                  <p>Format: {masterRender?.format?.toUpperCase() || 'MP4'}</p>
                  <p>Resolution: {masterRender?.width || 1920}×{masterRender?.height || 1080}</p>
                  <p>Framing: {screeningAspect}</p>
                </div>
                {masterRender?.download_url ? (
                  <a
                    id="deliverables-download-master"
                    data-testid="deliverables-download-master"
                    href={getScreeningMediaUrl(masterRender.download_url)}
                    download={masterRender.file_name || 'master_film.mp4'}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-1 px-2 bg-cinema-800 hover:bg-cinema-750 text-cinema-ai text-center rounded border border-cinema-ai/30 font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download Master</span>
                  </a>
                ) : (
                  <button
                    disabled
                    className="w-full py-1 px-2 bg-cinema-850 text-cinema-textDim text-center rounded border border-cinema-border text-[10px] cursor-not-allowed"
                  >
                    Render Required
                  </button>
                )}
              </div>

              {/* 2. Audio Stems Card */}
              <div className="p-3 bg-cinema-900 border border-cinema-border rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-purple-400" /> Audio Stems (WAV)
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${deliverables?.audio_stems?.dialogue || deliverables?.audio_stems?.music ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-cinema-800 text-cinema-textDim'}`}>
                    {deliverables?.audio_stems?.dialogue || deliverables?.audio_stems?.music ? 'AVAILABLE' : 'PENDING'}
                  </span>
                </div>
                <div className="space-y-1.5 pt-1">
                  {/* Dialogue Stem */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-cinema-text">A1 Dialogue Stem</span>
                    {deliverables?.audio_stems?.dialogue?.media_url ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          id="audition-stem-dialogue-btn"
                          data-testid="audition-stem-dialogue-btn"
                          onClick={() => toggleStemPlay('dialogue', deliverables.audio_stems.dialogue.media_url)}
                          className={`px-2 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 border transition-colors ${
                            audioStem === 'dialogue' && stemPlaying
                              ? 'bg-cyan-600 text-white border-cyan-500'
                              : 'bg-cinema-800 hover:bg-cinema-750 text-cyan-300 border-cyan-800/40'
                          }`}
                          title="Audition Dialogue Stem"
                        >
                          {audioStem === 'dialogue' && stemPlaying ? (
                            <Pause className="w-2.5 h-2.5" />
                          ) : (
                            <Play className="w-2.5 h-2.5" />
                          )}
                          <span>{audioStem === 'dialogue' && stemPlaying ? 'Pause' : 'Audition'}</span>
                        </button>
                        <a
                          id="download-stems-dialogue"
                          data-testid="download-stems-dialogue"
                          href={getScreeningMediaUrl(deliverables.audio_stems.dialogue.media_url)}
                          download="stem_dialogue.wav"
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cyan-300 rounded border border-cyan-800/40 text-[9px] font-semibold flex items-center gap-1"
                        >
                          <Download className="w-2.5 h-2.5" /> WAV
                        </a>
                      </div>
                    ) : (
                      <span className="text-cinema-textDim text-[9px]">Unrendered</span>
                    )}
                  </div>

                  {/* Music Stem */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-cinema-text">A3 Music Stem</span>
                    {deliverables?.audio_stems?.music?.media_url ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          id="audition-stem-music-btn"
                          data-testid="audition-stem-music-btn"
                          onClick={() => toggleStemPlay('music', deliverables.audio_stems.music.media_url)}
                          className={`px-2 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 border transition-colors ${
                            audioStem === 'music' && stemPlaying
                              ? 'bg-purple-600 text-white border-purple-500'
                              : 'bg-cinema-800 hover:bg-cinema-750 text-purple-300 border-purple-800/40'
                          }`}
                          title="Audition Music Stem"
                        >
                          {audioStem === 'music' && stemPlaying ? (
                            <Pause className="w-2.5 h-2.5" />
                          ) : (
                            <Play className="w-2.5 h-2.5" />
                          )}
                          <span>{audioStem === 'music' && stemPlaying ? 'Pause' : 'Audition'}</span>
                        </button>
                        <a
                          id="download-stems-music"
                          data-testid="download-stems-music"
                          href={getScreeningMediaUrl(deliverables.audio_stems.music.media_url)}
                          download="stem_music.wav"
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-purple-300 rounded border border-purple-800/40 text-[9px] font-semibold flex items-center gap-1"
                        >
                          <Download className="w-2.5 h-2.5" /> WAV
                        </a>
                      </div>
                    ) : (
                      <span className="text-cinema-textDim text-[9px]">Unrendered</span>
                    )}
                  </div>

                  {/* SFX Stem */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-cinema-text">A4 SFX Stem</span>
                    {deliverables?.audio_stems?.sfx?.media_url ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          id="audition-stem-sfx-btn"
                          data-testid="audition-stem-sfx-btn"
                          onClick={() => toggleStemPlay('sfx', deliverables.audio_stems.sfx.media_url)}
                          className={`px-2 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 border transition-colors ${
                            audioStem === 'sfx' && stemPlaying
                              ? 'bg-amber-600 text-white border-amber-500'
                              : 'bg-cinema-800 hover:bg-cinema-750 text-amber-300 border-amber-800/40'
                          }`}
                          title="Audition SFX Stem"
                        >
                          {audioStem === 'sfx' && stemPlaying ? (
                            <Pause className="w-2.5 h-2.5" />
                          ) : (
                            <Play className="w-2.5 h-2.5" />
                          )}
                          <span>{audioStem === 'sfx' && stemPlaying ? 'Pause' : 'Audition'}</span>
                        </button>
                        <a
                          id="download-stems-sfx"
                          data-testid="download-stems-sfx"
                          href={getScreeningMediaUrl(deliverables.audio_stems.sfx.media_url)}
                          download="stem_sfx.wav"
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-amber-300 rounded border border-amber-800/40 text-[9px] font-semibold flex items-center gap-1"
                        >
                          <Download className="w-2.5 h-2.5" /> WAV
                        </a>
                      </div>
                    ) : (
                      <span className="text-cinema-textDim text-[9px]">Unrendered</span>
                    )}
                  </div>
                </div>

                {/* Active Stem Audition Player Bar */}
                {audioStem && (
                  <div
                    id="audio-stem-audition-bar"
                    data-testid="audio-stem-audition-bar"
                    className="mt-2 pt-2 border-t border-cinema-border/60 space-y-1.5 bg-cinema-950/70 p-2 rounded"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white font-semibold capitalize flex items-center gap-1">
                        <Volume2 className="w-3 h-3 text-cinema-ai" />
                        Auditioning {audioStem} Stem
                      </span>
                      <span id="audio-stem-timecode" className="font-mono text-cinema-ai text-[9px]">
                        {formatSeconds(stemTime)} / {formatSeconds(stemDuration)}
                      </span>
                    </div>

                    {/* Scrub Progress Bar */}
                    <div
                      id="audio-stem-scrub-bar"
                      data-testid="audio-stem-scrub-bar"
                      onClick={handleStemSeek}
                      className="w-full bg-cinema-800 h-1.5 rounded-full cursor-pointer overflow-hidden"
                    >
                      <div
                        className="bg-cinema-ai h-full transition-all duration-100"
                        style={{ width: `${stemDuration > 0 ? (stemTime / stemDuration) * 100 : 0}%` }}
                      />
                    </div>

                    {/* Volume & Close */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-1 text-[9px] text-cinema-textDim">
                        <Volume2 className="w-2.5 h-2.5" />
                        <input
                          id="audio-stem-volume-slider"
                          data-testid="audio-stem-volume-slider"
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={stemVolume}
                          onChange={e => handleStemVolumeChange(parseFloat(e.target.value))}
                          className="w-16 h-1 accent-cinema-ai cursor-pointer"
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (stemAudioRef.current) stemAudioRef.current.pause();
                          setStemPlaying(false);
                          setAudioStem(null);
                        }}
                        className="text-[9px] text-cinema-textDim hover:text-white px-1.5 py-0.5 rounded bg-cinema-850 border border-cinema-border/50"
                      >
                        Stop Audition
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Subtitle Deliverables Card */}
              <div className="p-3 bg-cinema-900 border border-cinema-border rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Subtitles className="w-3.5 h-3.5 text-amber-400" /> Subtitles (Tamil / Eng)
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${captions.length > 0 ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-cinema-800 text-cinema-textDim'}`}>
                    {captions.length > 0 ? `${captions.length} CUES` : 'EMPTY'}
                  </span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-cinema-text">SubRip (.srt)</span>
                    {activeProject ? (
                      <a
                        id="download-subtitles-srt"
                        data-testid="download-subtitles-srt"
                        href={getScreeningMediaUrl(`/api/v1/projects/${activeProject.id}/captions/export/srt`)}
                        download={`${activeProject.title || 'film'}_subtitles.srt`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-amber-300 rounded border border-amber-800/40 text-[9px] font-semibold flex items-center gap-1"
                      >
                        <Download className="w-2.5 h-2.5" /> SRT
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-cinema-text">WebVTT (.vtt)</span>
                    {activeProject ? (
                      <a
                        id="download-subtitles-vtt"
                        data-testid="download-subtitles-vtt"
                        href={getScreeningMediaUrl(`/api/v1/projects/${activeProject.id}/captions/export/vtt`)}
                        download={`${activeProject.title || 'film'}_subtitles.vtt`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-amber-300 rounded border border-amber-800/40 text-[9px] font-semibold flex items-center gap-1"
                      >
                        <Download className="w-2.5 h-2.5" /> VTT
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Deliverables Summary Inventory Bar */}
            {deliverables?.deliverables && deliverables.deliverables.length > 0 && (
              <div
                id="deliverables-inventory-summary"
                data-testid="deliverables-inventory-summary"
                className="p-2.5 bg-cinema-900 border border-cinema-border/60 rounded flex flex-wrap items-center justify-between text-[10px] text-cinema-textDim font-mono"
              >
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-white font-bold">DELIVERABLES INVENTORY:</span>
                  <span>{deliverables.deliverables.length} Theatrical Package Files</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-cyan-300">Master + Audio Stems + Multi-Lang Subtitles</span>
                </div>
              </div>
            )}
          </div>

          {/* Planned Scenes Breakdown with Regenerate & Extend */}
          <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
            <div className="flex items-center justify-between border-b border-cinema-border/60 pb-2">
              <span className="font-bold text-white text-xs uppercase tracking-wider">
                Production Scenes ({productionStatus?.scenes?.length || 0})
              </span>
              <span className="text-[10px] text-cinema-textDim font-mono">
                {durationSec}s Target
              </span>
            </div>

            {(!productionStatus?.scenes || productionStatus.scenes.length === 0) ? (
              <div className="py-8 text-center text-cinema-textDim space-y-1">
                <Film className="w-6 h-6 mx-auto opacity-30" />
                <p className="text-xs">No scenes planned yet</p>
                <p className="text-[10px]">Click &ldquo;Plan Production&rdquo; to generate character consistency and multi-scene plan.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {productionStatus.scenes.map((s: any) => {
                  const isBusy = operatingSceneId === s.scene_id;
                  return (
                    <div
                      key={s.scene_id}
                      className="p-3 bg-cinema-900 border border-cinema-border rounded-md space-y-2 hover:border-cinema-ai/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-cinema-800 text-cinema-ai rounded font-mono text-[10px] font-bold">
                            Scene {s.scene_number}
                          </span>
                          <span className="font-bold text-white text-xs">{s.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Scene Status Pill */}
                          <span
                            className={`scene-status-pill px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              s.status === 'READY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                              s.status === 'FAILED' ? 'bg-red-950 text-red-400 border border-red-800' :
                              s.status === 'GENERATING' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800 animate-pulse' :
                              s.status === 'QUEUED' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                              'bg-cinema-800 text-cinema-textDim border border-cinema-border'
                            }`}
                          >
                            {s.status}
                          </span>
                        </div>
                      </div>

                      {s.visual_prompt && (
                        <p className="text-[11px] text-cinema-textDim leading-relaxed">{s.visual_prompt}</p>
                      )}

                      {/* Scene Actions: Regenerate & Extend */}
                      <div className="flex items-center justify-between pt-1 border-t border-cinema-border/40 text-[10px]">
                        <span className="text-cinema-textDim font-mono">
                          {s.duration_sec ?? 5.0}s • {s.location || 'Location'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            id={`regenerate-scene-btn-${s.scene_id}`}
                            data-testid={`regenerate-scene-btn-${s.scene_id}`}
                            onClick={() => handleRegenerateScene(s.scene_id)}
                            disabled={isBusy}
                            className="regenerate-scene-btn px-2 py-1 bg-cinema-800 hover:bg-cinema-750 text-cinema-ai rounded border border-cinema-ai/30 font-semibold flex items-center gap-1 transition-colors disabled:opacity-40"
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Regenerate Scene
                          </button>
                          <button
                            id={`extend-scene-btn-${s.scene_id}`}
                            data-testid={`extend-scene-btn-${s.scene_id}`}
                            onClick={() => handleExtendScene(s.scene_id)}
                            disabled={isBusy}
                            className="extend-scene-btn px-2 py-1 bg-cinema-800 hover:bg-cinema-750 text-emerald-400 rounded border border-emerald-800/40 font-semibold flex items-center gap-1 transition-colors disabled:opacity-40"
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FastForward className="w-3 h-3" />}
                            Extend Scene (+4s)
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden Audio Player for Stem Auditioning */}
      <audio
        ref={stemAudioRef}
        id="audio-stem-player"
        data-testid="audio-stem-player"
        onTimeUpdate={() => {
          if (stemAudioRef.current) {
            setStemTime(stemAudioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (stemAudioRef.current) {
            setStemDuration(stemAudioRef.current.duration || 0);
          }
        }}
        onEnded={() => {
          setStemPlaying(false);
          setStemTime(0);
        }}
        className="hidden"
      />

      {/* Timeline Revision History Modal (Stage 3) */}
      {showRevisions && activeProject?.id && (
        <TimelineRevisionsModal
          projectId={activeProject.id}
          onClose={() => setShowRevisions(false)}
        />
      )}
    </div>
  );
};
