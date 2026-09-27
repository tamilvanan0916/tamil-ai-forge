import React, { useState, useEffect, useRef } from 'react';
import {
  Wand2, Upload, Film, Image as ImageIcon, Sparkles, RefreshCw,
  Play, CheckCircle2, AlertCircle, Clock, Sliders, ArrowRight,
  Download, Plus, Layers, UserCheck, Trash2, X, FileVideo,
  FileImage, Eye, LayoutGrid, Check, RotateCcw
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { api, mediaUrl } from '../../services/api';
import { MediaComparisonViewer } from './MediaComparisonViewer';

interface StylePreset {
  id: string;
  name: string;
  description: string;
  badge: string;
  stylePrompt: string;
  negativePrompt: string;
  gradient: string;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: '3d_cartoon',
    name: '3D Cartoon',
    description: 'Vibrant modern 3D feature animation with expressive lighting and smooth shapes',
    badge: 'Popular',
    stylePrompt: 'Polished 3D cartoon feature animation style, expressive shapes, vibrant colors, cinematic rim lighting, subsurface scattering, ambient occlusion',
    negativePrompt: 'photorealistic, live action, noisy, low resolution, glitchy, 2d flat',
    gradient: 'from-amber-500/20 to-orange-500/20 border-orange-500/40 text-orange-400',
  },
  {
    id: 'pixar_family',
    name: 'Pixar-inspired 3D Animation',
    description: 'Heartwarming family 3D animation aesthetic with tactile textures and rich emotion',
    badge: 'Family',
    stylePrompt: 'Family 3D feature animation aesthetic, stylized character proportions, tactile fabric textures, soft volumetric lighting, warm emotional depth',
    negativePrompt: 'harsh shadows, gritty realism, flat anime, desaturated, scary',
    gradient: 'from-blue-500/20 to-cyan-500/20 border-cyan-500/40 text-cyan-400',
  },
  {
    id: 'cute_kids',
    name: 'Cute Kids Cartoon',
    description: 'Playful, bright, rounded characters perfect for young audiences and preschool shows',
    badge: 'Kids',
    stylePrompt: 'Cute playful kids cartoon style, soft rounded curves, cheerful pastel colors, bright sunlit ambience, friendly expressions',
    negativePrompt: 'dark, mature, violent, grim, muted colors, horror',
    gradient: 'from-pink-500/20 to-rose-500/20 border-rose-500/40 text-rose-400',
  },
  {
    id: 'cinematic_3d',
    name: 'Cinematic 3D',
    description: 'Grand scale cinematic lighting, cinematic lens blur, and dramatic film framing',
    badge: 'Epic',
    stylePrompt: 'High-end cinematic 3D style, anamorphic lens flare, shallow depth of field, dramatic atmospheric haze, 8k render quality',
    negativePrompt: 'cartoonish oversimplification, blown out highlights, artifacting',
    gradient: 'from-purple-500/20 to-indigo-500/20 border-indigo-500/40 text-indigo-400',
  },
  {
    id: 'anime',
    name: 'Anime',
    description: 'Crisp cel-shaded character art with vibrant Japanese animation styling',
    badge: 'Anime',
    stylePrompt: 'High quality anime aesthetic, crisp cel-shaded lines, dynamic anime eyes, vibrant color grading, painted anime background',
    negativePrompt: 'western 3d cartoon, 3d uncanny valley, blurry outlines, realistic skin pores',
    gradient: 'from-red-500/20 to-pink-500/20 border-red-500/40 text-red-400',
  },
  {
    id: 'clay',
    name: 'Clay Animation',
    description: 'Charming handcrafted stop-motion claymation with authentic thumbprint textures',
    badge: 'Handcrafted',
    stylePrompt: 'Stop-motion clay animation style, tactile plasticine clay surface, subtle fingerprint marks, charming hand-made miniature aesthetic',
    negativePrompt: 'digital gloss, ultra smooth vectors, photorealistic skin',
    gradient: 'from-amber-600/20 to-yellow-600/20 border-amber-600/40 text-amber-300',
  },
  {
    id: 'storybook',
    name: 'Storybook Cartoon',
    description: 'Illustrated fairy-tale picture book art with watercolor washes and ink outlines',
    badge: 'Illustrated',
    stylePrompt: 'Storybook illustration style, gentle watercolor washes, soft ink lines, whimsical hand-drawn fantasy storybook art',
    negativePrompt: '3d cgi render, modern photograph, harsh neon lights',
    gradient: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-400',
  },
  {
    id: 'realistic_cinematic',
    name: 'Realistic Cinematic',
    description: 'Photorealistic film grading with natural skin tones and live-action depth',
    badge: 'Film',
    stylePrompt: 'Photorealistic cinematic film footage, 35mm film grain, natural skin textures, practical cinematic lighting, Panavision aesthetic',
    negativePrompt: 'cartoon, animated, plastic, 3d model, saturation overload',
    gradient: 'from-slate-500/20 to-zinc-500/20 border-zinc-500/40 text-zinc-300',
  },
  {
    id: 'custom',
    name: 'Custom Style',
    description: 'Full creative freedom to guide your unique transformation purely through prompts',
    badge: 'Custom',
    stylePrompt: '',
    negativePrompt: '',
    gradient: 'from-cinema-ai/20 to-cinema-ai/10 border-cinema-ai/40 text-cinema-ai',
  }
];

interface ModeConfig {
  id: string;
  name: string;
  badge: string;
  description: string;
  requiresRef: boolean;
  mediaRequirement: 'image' | 'video' | 'any';
  mediaLabel: string;
  icon: any;
}

const TRANSFORMATION_MODES: ModeConfig[] = [
  {
    id: 'IMAGE_TO_3D_CARTOON',
    name: 'Image → 3D Cartoon',
    badge: '3D Image',
    description: 'Transform uploaded photo/artwork into a high-end 3D animated character or scene asset.',
    requiresRef: false,
    mediaRequirement: 'image',
    mediaLabel: 'Image Required',
    icon: ImageIcon,
  },
  {
    id: 'VIDEO_TO_3D_CARTOON',
    name: 'Video → 3D Cartoon',
    badge: '3D Video',
    description: 'Convert video to 3D cartoon preserving motion, timing, and audio.',
    requiresRef: false,
    mediaRequirement: 'video',
    mediaLabel: 'Video Required',
    icon: Film,
  },
  {
    id: 'CHARACTER_REPLACEMENT',
    name: 'Character Replacement',
    badge: 'Ref Required',
    description: 'Replace actor/character with reference character while retaining timing & performance.',
    requiresRef: true,
    mediaRequirement: 'any',
    mediaLabel: 'Video or Image + Ref Image',
    icon: UserCheck,
  },
  {
    id: 'IMAGE_CHARACTER_STYLE',
    name: 'Character Style',
    badge: 'Ref Required',
    description: 'Apply reference character facial identity & aesthetic style to target portrait/scene.',
    requiresRef: true,
    mediaRequirement: 'image',
    mediaLabel: 'Image + Ref Image',
    icon: Sparkles,
  },
];

export const MediaTransformationStudio: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { showNotification, setActiveSidebarTab } = useUIStore();
  const { fetchTimeline } = useTimelineStore();

  // Uploaded media state
  const [sourceAsset, setSourceAsset] = useState<any>(null);
  const [referenceAsset, setReferenceAsset] = useState<any>(null);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  // Studio modes
  const [selectedMode, setSelectedMode] = useState<string>('IMAGE_TO_3D_CARTOON');
  const [selectedPreset, setSelectedPreset] = useState<string>('3d_cartoon');

  // Sliders and Prompts
  const [prompt, setPrompt] = useState<string>('');
  const [negativePrompt, setNegativePrompt] = useState<string>('');
  const [styleStrength, setStyleStrength] = useState<number>(85);
  const [characterConsistency, setCharacterConsistency] = useState<number>(90);
  const [motionPreservation, setMotionPreservation] = useState<number>(90);
  const [backgroundPreservation, setBackgroundPreservation] = useState<number>(75);
  const [preserveAudio, setPreserveAudio] = useState<boolean>(true);

  // Active Job State
  const [activeJob, setActiveJob] = useState<any>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [jobError, setJobError] = useState<string | null>(null); // Phase 15: error panel
  const [isTransforming, setIsTransforming] = useState<boolean>(false);
  const [selectedTrackRole, setSelectedTrackRole] = useState<string>('v1_main');
  const [isAddingTimeline, setIsAddingTimeline] = useState<boolean>(false);
  const [isAddedToTimeline, setIsAddedToTimeline] = useState<boolean>(false);

  // Phase 15: poll interval ref for cleanup on unmount / cancel
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // File input refs
  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Phase 16: Restore active transformation job on project change / page refresh
  useEffect(() => {
    if (!activeProject?.id) return;
    try {
      const savedJobId = localStorage.getItem(`tamil_ai_forge_transform_job_${activeProject.id}`);
      if (savedJobId && !activeJob) {
        api.get(`/ai/media-transform/${savedJobId}`)
          .then(async (res) => {
            const j = res.data;
            setActiveJob(j);
            if (j.status === 'completed') {
              const rRes = await api.get(`/ai/media-transform/${savedJobId}/result`);
              setJobResult(rRes.data);
            } else if (j.status === 'queued' || j.status === 'processing') {
              setIsTransforming(true);
              pollJobStatus(savedJobId);
            }
          })
          .catch(() => {
            try {
              localStorage.removeItem(`tamil_ai_forge_transform_job_${activeProject.id}`);
            } catch {}
          });
      }
    } catch {}
  }, [activeProject?.id]);

  // Phase 15: helper utilities
  const formatBytes = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (ms?: number): string => {
    if (!ms || ms <= 0) return '';
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const STAGE_ORDER = ['QUEUED', 'VALIDATING', 'PROCESSING', 'FINALIZING', 'COMPLETED'];
  const stageIndex = (stage?: string) => STAGE_ORDER.indexOf(stage?.toUpperCase() || '');
  const currentStage = activeJob?.current_stage || activeJob?.metadata?.stage || '';

  // Auto-set compatible mode when source asset changes
  useEffect(() => {
    if (!sourceAsset) return;
    const isVid = sourceAsset.asset_type === 'video';
    if (isVid) {
      if (selectedMode === 'IMAGE_TO_3D_CARTOON' || selectedMode === 'IMAGE_CHARACTER_STYLE') {
        setSelectedMode('VIDEO_TO_3D_CARTOON');
      }
    } else {
      if (selectedMode === 'VIDEO_TO_3D_CARTOON') {
        setSelectedMode('IMAGE_TO_3D_CARTOON');
      }
    }
  }, [sourceAsset]);

  // Update prompt template when preset changes if user hasn't typed heavily
  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    const p = STYLE_PRESETS.find(item => item.id === presetId);
    if (p) {
      if (!prompt || prompt.includes('Transform') || prompt.length < 30) {
        const targetType = sourceAsset?.asset_type === 'video' ? 'video' : 'character';
        setPrompt(`Transform this uploaded ${targetType} into a high-quality ${p.name.toLowerCase()} while preserving facial identity, clothing, motion, and scene composition.`);
      }
      if (p.negativePrompt) {
        setNegativePrompt(p.negativePrompt);
      }
    }
  };

  // Upload handler
  const handleFileUpload = async (file: File, isReference: boolean = false) => {
    if (!activeProject) {
      showNotification('Please select or create a project first', 'error');
      return;
    }

    const setLoader = isReference ? setIsUploadingRef : setIsUploadingSource;
    setLoader(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_path', isReference ? '/Reference Media' : '/Source Media');

      const res = await api.post(`/projects/${activeProject.id}/assets/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const asset = res.data;
      if (isReference) {
        setReferenceAsset(asset);
        showNotification(`Uploaded reference asset: ${asset.file_name}`, 'success');
      } else {
        setSourceAsset(asset);
        setJobResult(null);
        showNotification(`Uploaded source media: ${asset.file_name}`, 'success');
      }
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to upload media file', 'error');
    } finally {
      setLoader(false);
    }
  };

  // Quick prompt chip adder
  const handleAddChip = (chipText: string) => {
    setPrompt(prev => prev ? `${prev}, ${chipText}` : chipText);
  };

  // Phase 15: Start Transformation — with duplicate job prevention
  const handleStartTransformation = async () => {
    if (!activeProject) return;
    if (!sourceAsset) {
      showNotification('Please upload source media first', 'error');
      return;
    }

    const currentMode = TRANSFORMATION_MODES.find(m => m.id === selectedMode) || TRANSFORMATION_MODES[0];
    const isVid = sourceAsset.asset_type === 'video';

    // Validate media type compatibility
    if (currentMode.mediaRequirement === 'video' && !isVid) {
      showNotification('This mode requires a video source. Please upload a video file (MP4/MOV/WEBM).', 'error');
      return;
    }
    if (currentMode.mediaRequirement === 'image' && isVid) {
      showNotification('This mode requires an image source. Please upload an image file (PNG/JPG/WEBP).', 'error');
      return;
    }
    if (currentMode.requiresRef && !referenceAsset) {
      showNotification(`Reference character image is required for "${currentMode.name}" mode. Please upload a reference image.`, 'error');
      return;
    }

    // Phase 15: Prevent double-submit while already transforming
    if (isTransforming) {
      showNotification('A transformation is already running. Wait for it to complete or cancel it first.', 'info');
      return;
    }

    setIsTransforming(true);
    setJobResult(null);
    setJobError(null);

    try {
      const payload = {
        project_id: activeProject.id,
        mode: selectedMode,
        source_asset_id: sourceAsset.id,
        reference_asset_id: referenceAsset?.id || null,
        prompt: prompt.trim() || undefined,
        options: {
          style_preset: selectedPreset,
          style_strength: styleStrength,
          character_consistency: characterConsistency,
          motion_preservation: motionPreservation,
          background_preservation: backgroundPreservation,
          negative_prompt: negativePrompt.trim() || undefined,
          preserve_audio: preserveAudio,
        }
      };

      let jobId: string;
      try {
        const res = await api.post('/ai/media-transform/create', payload);
        const job = res.data;
        setActiveJob(job);
        jobId = job.job_id;
        try {
          if (typeof window !== 'undefined') localStorage.setItem(`tamil_ai_forge_transform_job_${activeProject.id}`, jobId);
        } catch {}
        showNotification('Transformation job queued', 'info');
      } catch (err: any) {
        // Phase 15: Handle 409 Conflict (duplicate job) gracefully — resume polling
        if (err.response?.status === 409 && err.response?.data?.detail?.job_id) {
          const detail = err.response.data.detail;
          jobId = detail.job_id;
          try {
            if (typeof window !== 'undefined') localStorage.setItem(`tamil_ai_forge_transform_job_${activeProject.id}`, jobId);
          } catch {}
          showNotification(`Resuming existing transformation job (${detail.status})…`, 'info');
          const existing = await api.get(`/ai/media-transform/${jobId}`);
          setActiveJob(existing.data);
          if (existing.data.status === 'completed') {
            setIsTransforming(false);
            const rRes = await api.get(`/ai/media-transform/${jobId}/result`);
            setJobResult(rRes.data);
            return;
          }
        } else {
          throw err;
        }
      }

      pollJobStatus(jobId!);
    } catch (err: any) {
      setIsTransforming(false);
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (detail?.message || 'Transformation request failed');
      setJobError(msg);
      showNotification(msg, 'error');
    }
  };

  // Phase 15: Poll job status — uses pollIntervalRef for cleanup safety
  const pollJobStatus = (jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/ai/media-transform/${jobId}`);
        const job = res.data;
        setActiveJob(job);

        if (job.status === 'completed') {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setIsTransforming(false);
          setJobError(null);
          showNotification('Transformation complete!', 'success');
          // Fetch rich result with source+output file info
          const rRes = await api.get(`/ai/media-transform/${jobId}/result`);
          setJobResult(rRes.data);
        } else if (job.status === 'failed') {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setIsTransforming(false);
          const errMsg = job.error || 'Transformation failed. Please retry.';
          setJobError(errMsg);
          showNotification(errMsg, 'error');
        } else if (job.status === 'cancelled') {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setIsTransforming(false);
          setJobError('Transformation was cancelled.');
          showNotification('Transformation cancelled', 'info');
        }
      } catch (err) {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = null;
        setIsTransforming(false);
        setJobError('Lost connection while polling transformation status.');
      }
    }, 500);
  };

  // Phase 15: Cancel job — properly clears polling interval
  const handleCancelJob = async () => {
    if (!activeJob) return;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    try {
      await api.post(`/ai/media-transform/${activeJob.job_id}/cancel`);
      setIsTransforming(false);
      setJobError('Transformation was cancelled.');
      showNotification('Transformation cancelled', 'info');
    } catch {
      setIsTransforming(false);
    }
  };

  // Phase 15: Retry failed/cancelled job
  const handleRetryJob = async () => {
    if (!activeJob?.job_id) return;
    setIsTransforming(true);
    setJobError(null);
    setJobResult(null);
    try {
      const res = await api.post(`/ai/media-transform/${activeJob.job_id}/retry`);
      const newJob = res.data;
      setActiveJob(newJob);
      showNotification('Retrying transformation…', 'info');
      pollJobStatus(newJob.job_id);
    } catch (err: any) {
      setIsTransforming(false);
      const msg = err.response?.data?.detail || 'Retry failed';
      setJobError(msg);
      showNotification(msg, 'error');
    }
  };

  // Add to Timeline
  const handleAddToTimeline = async () => {
    if (!activeJob?.job_id) return;
    setIsAddingTimeline(true);
    try {
      const res = await api.post(`/ai/media-transform/${activeJob.job_id}/add-to-timeline`, {
        track_role: selectedTrackRole
      });
      showNotification(res.data.message || 'Added to timeline successfully', 'success');
      setIsAddedToTimeline(true);
      if (activeProject) {
        await fetchTimeline(activeProject.id);
      }
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to add to timeline', 'error');
    } finally {
      setIsAddingTimeline(false);
    }
  };

  // Add to Assets
  const handleAddToAssets = async () => {
    if (!activeJob?.job_id) return;
    try {
      const res = await api.post(`/ai/media-transform/${activeJob.job_id}/add-to-assets`);
      showNotification(res.data.message || 'Saved to Media Library', 'success');
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to save to assets', 'error');
    }
  };

  // Use as Character Reference in Character Studio
  const handleUseInCharacterStudio = () => {
    setActiveSidebarTab('characters');
    showNotification('Switched to Character Studio. You can bind the transformed asset to your character references.', 'info');
  };

  const isVideoSource = sourceAsset?.asset_type === 'video';

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs text-cinema-text" id="media-transformation-studio">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-cinema-border bg-cinema-850 gap-2">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-cinema-ai" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            AI Media Transformation Studio
          </span>
          <span className="hidden sm:inline-block px-1.5 py-0.5 bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/30 text-[9px] font-bold rounded">
            Phase 14 • From Any Media to Cinema
          </span>
        </div>

        {/* Offline Preview Notice Badge */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold rounded flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            OFFLINE DEMO TRANSFORMATION • Offline Preview
          </span>
        </div>
      </div>

      {!activeProject ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-cinema-textDim p-6">
          <Wand2 className="w-8 h-8 opacity-30" />
          <p className="text-xs">Select or create a project to start AI Media Transformation</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Top Banner Notice */}
          <div className="p-3 bg-cinema-800/80 border border-amber-500/30 rounded-lg flex flex-wrap items-center justify-between text-[11px] text-cinema-textMuted gap-2">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold rounded uppercase tracking-wider">
                OFFLINE DEMO TRANSFORMATION
              </span>
              <span>
                Deterministic local FFmpeg processing. 0 external AI calls & 0 quota consumed. Real H.264/AAC output.
              </span>
            </div>
            <button
              onClick={() => setActiveSidebarTab('production-studio')}
              className="text-cinema-ai hover:underline text-[10px] font-medium flex-shrink-0"
            >
              Open Production Studio →
            </button>
          </div>

          {/* Main Grid: Upload & Settings (Left) | Viewer & Result (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Uploads & Transformation Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Media Upload Area */}
              <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-cinema-ai" />
                    Source Media Upload
                  </label>
                  <span className="text-[10px] text-cinema-textDim">MP4, MOV, WEBM, PNG, JPG, WEBP</span>
                </div>

                {/* Dropzone Container */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Primary Source Media Dropzone */}
                  <div
                    onClick={() => sourceFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      sourceAsset
                        ? 'border-cinema-ai/60 bg-cinema-ai/5'
                        : 'border-cinema-border hover:border-cinema-ai/40 hover:bg-cinema-800'
                    }`}
                  >
                    <input
                      ref={sourceFileInputRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileUpload(e.target.files[0], false);
                      }}
                    />

                    {isUploadingSource ? (
                      <div className="flex flex-col items-center gap-1.5 py-4">
                        <RefreshCw className="w-5 h-5 text-cinema-ai animate-spin" />
                        <span className="text-[11px] text-cinema-text">Uploading & Probing Media…</span>
                      </div>
                    ) : sourceAsset ? (
                      <div className="w-full flex flex-col items-center gap-1.5">
                        <div className="w-full h-24 bg-cinema-900 rounded overflow-hidden flex items-center justify-center relative border border-cinema-border">
                          {sourceAsset.asset_type === 'video' ? (
                            <video
                              src={mediaUrl(sourceAsset.storage_key)}
                              className="w-full h-full object-cover"
                              muted
                            />
                          ) : (
                            <img
                              src={mediaUrl(sourceAsset.storage_key)}
                              alt={sourceAsset.file_name}
                              className="w-full h-full object-contain"
                            />
                          )}
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 text-[9px] font-bold rounded text-white capitalize">
                            {sourceAsset.asset_type}
                          </span>
                        </div>
                        <div className="w-full flex items-center justify-between text-[10px]">
                          <span className="truncate max-w-[140px] font-medium text-white" title={sourceAsset.file_name}>
                            {sourceAsset.file_name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSourceAsset(null);
                            }}
                            className="p-1 text-rose-400 hover:text-rose-300"
                            title="Remove Source"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="w-full flex flex-wrap items-center gap-2 text-[9px] text-cinema-textDim">
                          <span>{formatBytes(sourceAsset.file_size_bytes)}</span>
                          {sourceAsset.duration_ms ? <span>{formatDuration(sourceAsset.duration_ms)}</span> : null}
                          {(sourceAsset.metadata_info?.width && sourceAsset.metadata_info?.height)
                            ? <span>{sourceAsset.metadata_info.width}×{sourceAsset.metadata_info.height}</span>
                            : null}
                          <span className="text-emerald-400 font-bold ml-auto">Ready</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 flex flex-col items-center gap-1.5">
                        <Upload className="w-6 h-6 text-cinema-ai opacity-80" />
                        <span className="text-[11px] font-semibold text-white">Click or Drop Source Media</span>
                        <span className="text-[10px] text-cinema-textDim">Video (MP4/MOV) or Image (PNG/JPG)</span>
                      </div>
                    )}
                  </div>

                  {/* Reference Character Image Dropzone */}
                  {(() => {
                    const currentModeObj = TRANSFORMATION_MODES.find(m => m.id === selectedMode);
                    const isRefRequired = Boolean(currentModeObj?.requiresRef);

                    return (
                      <div
                        onClick={() => refFileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                          referenceAsset
                            ? 'border-purple-500/60 bg-purple-500/5'
                            : isRefRequired
                            ? 'border-purple-500/80 bg-purple-500/10 hover:bg-purple-500/15'
                            : 'border-cinema-border hover:border-purple-500/40 hover:bg-cinema-800'
                        }`}
                      >
                        <input
                          ref={refFileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleFileUpload(e.target.files[0], true);
                          }}
                        />

                        {isUploadingRef ? (
                          <div className="flex flex-col items-center gap-1.5 py-4">
                            <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
                            <span className="text-[11px] text-cinema-text">Uploading Character Reference…</span>
                          </div>
                        ) : referenceAsset ? (
                          <div className="w-full flex flex-col items-center gap-1.5">
                            <div className="w-full h-24 bg-cinema-900 rounded overflow-hidden flex items-center justify-center relative border border-cinema-border">
                              <img
                                src={mediaUrl(referenceAsset.storage_key)}
                                alt={referenceAsset.file_name}
                                className="w-full h-full object-contain"
                              />
                              <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-purple-900/80 text-[9px] font-bold rounded text-white">
                                Reference
                              </span>
                            </div>
                            <div className="w-full flex items-center justify-between text-[10px]">
                              <span className="truncate max-w-[140px] font-medium text-white" title={referenceAsset.file_name}>
                                {referenceAsset.file_name}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReferenceAsset(null);
                                }}
                                className="p-1 text-rose-400 hover:text-rose-300"
                                title="Remove Reference"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="w-full flex items-center justify-between text-[9px] text-cinema-textDim">
                              <span>Ref Character Image</span>
                              <span className="text-purple-400 font-bold">Bound</span>
                            </div>
                          </div>
                        ) : (
                          <div className="py-4 flex flex-col items-center gap-1.5">
                            <UserCheck className={`w-6 h-6 ${isRefRequired ? 'text-purple-400' : 'text-purple-400 opacity-80'}`} />
                            <span className="text-[11px] font-semibold text-white">
                              {isRefRequired ? 'Reference Character (Required)' : 'Optional Reference Character'}
                            </span>
                            <span className="text-[10px] text-cinema-textDim">
                              {isRefRequired
                                ? `Upload character image required for ${currentModeObj?.name}`
                                : 'Upload character to guide style / face'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Transformation Mode Selector */}
              <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-white tracking-wider">
                    Transformation Mode
                  </label>
                  <span className="text-[10px] text-cinema-textDim">4 Creative Workflows</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TRANSFORMATION_MODES.map((mode) => {
                    const isSelected = selectedMode === mode.id;
                    const ModeIcon = mode.icon;

                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSelectedMode(mode.id)}
                        className={`p-3 rounded-lg border text-left flex flex-col justify-between gap-2 transition-all relative ${
                          isSelected
                            ? 'bg-cinema-ai/20 border-cinema-ai ring-1 ring-cinema-ai/50 text-white shadow-sm'
                            : 'bg-cinema-800 border-cinema-border text-cinema-textDim hover:text-white hover:bg-cinema-750'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-2">
                            <ModeIcon className={`w-4 h-4 ${isSelected ? 'text-cinema-ai' : 'text-cinema-textDim'}`} />
                            <span className="font-bold text-[12px] text-white">{mode.name}</span>
                          </div>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                            mode.requiresRef
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/30'
                          }`}>
                            {mode.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-cinema-textMuted line-clamp-2 leading-relaxed">
                          {mode.description}
                        </p>
                        <div className="flex items-center justify-between pt-1 border-t border-cinema-border/50 text-[9px] text-cinema-textDim">
                          <span>{mode.mediaLabel}</span>
                          {isSelected && <span className="text-cinema-ai font-bold flex items-center gap-0.5"><Check className="w-3 h-3" /> Active</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Style Presets Grid */}
              <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-white uppercase tracking-wider">
                    Visual Style Preset
                  </label>
                  <span className="text-[10px] text-cinema-textDim">Select exactly 1 style preset</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {STYLE_PRESETS.map((p) => {
                    const isSelected = selectedPreset === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handlePresetSelect(p.id)}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                          isSelected
                            ? `bg-cinema-800 border-2 ${p.gradient}`
                            : 'bg-cinema-900 border-cinema-border hover:border-cinema-borderLight'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[11px] text-white truncate">{p.name}</span>
                          <span className="text-[8px] font-extrabold uppercase px-1 py-0.2 rounded bg-black/40 border border-white/10">
                            {p.badge}
                          </span>
                        </div>
                        <p className="text-[9px] text-cinema-textDim line-clamp-2 mb-2 leading-tight">
                          {p.description}
                        </p>
                        <div className="flex items-center justify-end">
                          {isSelected ? (
                            <span className="w-4 h-4 rounded-full bg-cinema-ai text-white flex items-center justify-center text-[10px]">
                              ✓
                            </span>
                          ) : (
                            <span className="w-4 h-4 rounded-full border border-cinema-border" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Prompt & Sliders */}
              <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
                <label className="text-[11px] font-bold text-white uppercase tracking-wider">
                  Describe Your Transformation
                </label>

                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Transform this uploaded character into a high-quality 3D cartoon character while preserving the same face, clothing, colors, proportions and identity..."
                  className="w-full h-20 p-2.5 bg-cinema-900 border border-cinema-border rounded text-xs text-white placeholder-cinema-textDim focus:outline-none focus:border-cinema-ai resize-none"
                />

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '+ 3D Cartoon',
                    '+ Cinematic Lighting',
                    '+ Character Consistency',
                    '+ Preserve Motion',
                    '+ Preserve Camera',
                    '+ Kids Friendly',
                    '+ High Detail',
                    '+ Smooth Animation',
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleAddChip(chip.replace('+ ', ''))}
                      className="px-2 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-textDim hover:text-white rounded border border-cinema-border text-[9px] font-medium transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Sliders Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-cinema-border">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-cinema-textDim">Style Strength</span>
                      <strong className="text-white">{styleStrength}%</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={styleStrength}
                      onChange={(e) => setStyleStrength(parseInt(e.target.value))}
                      className="w-full h-1 bg-cinema-700 rounded appearance-none cursor-pointer accent-cinema-ai"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-cinema-textDim">Character Consistency</span>
                      <strong className="text-white">{characterConsistency}%</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={characterConsistency}
                      onChange={(e) => setCharacterConsistency(parseInt(e.target.value))}
                      className="w-full h-1 bg-cinema-700 rounded appearance-none cursor-pointer accent-cinema-ai"
                    />
                  </div>

                  {isVideoSource && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-cinema-textDim">Motion Preservation</span>
                        <strong className="text-white">{motionPreservation}%</strong>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={motionPreservation}
                        onChange={(e) => setMotionPreservation(parseInt(e.target.value))}
                        className="w-full h-1 bg-cinema-700 rounded appearance-none cursor-pointer accent-cinema-ai"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-cinema-textDim">Background Preservation</span>
                      <strong className="text-white">{backgroundPreservation}%</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={backgroundPreservation}
                      onChange={(e) => setBackgroundPreservation(parseInt(e.target.value))}
                      className="w-full h-1 bg-cinema-700 rounded appearance-none cursor-pointer accent-cinema-ai"
                    />
                  </div>
                </div>

                {isVideoSource && (
                  <div className="flex items-center gap-2 pt-1 text-[10px]">
                    <input
                      type="checkbox"
                      id="preserveAudio"
                      checked={preserveAudio}
                      onChange={(e) => setPreserveAudio(e.target.checked)}
                      className="rounded accent-cinema-ai"
                    />
                    <label htmlFor="preserveAudio" className="text-cinema-textDim cursor-pointer">
                      Preserve original audio track from source video
                    </label>
                  </div>
                )}
              </div>

              {/* Action Button & In-Flight Progress */}
              <div className="p-4 bg-cinema-850 border border-cinema-border rounded-lg space-y-3">
                {/* Phase 15: Validation messages for empty/wrong states */}
                {!sourceAsset && (
                  <div className="flex items-center gap-2 p-2.5 bg-cinema-900 rounded border border-cinema-border text-[10px] text-cinema-textDim">
                    <Upload className="w-3.5 h-3.5 text-cinema-ai opacity-60" />
                    <span>Upload a source media file to get started</span>
                  </div>
                )}
                {sourceAsset && (() => {
                  const currentModeObj = TRANSFORMATION_MODES.find(m => m.id === selectedMode);
                  const isVid = sourceAsset.asset_type === 'video';
                  if (currentModeObj?.mediaRequirement === 'video' && !isVid) {
                    return (
                      <div className="flex items-center gap-2 p-2.5 bg-rose-950/40 rounded border border-rose-900 text-[10px] text-rose-300">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                        <span>Video Required — switch to a video mode or upload a video file</span>
                      </div>
                    );
                  }
                  if (currentModeObj?.mediaRequirement === 'image' && isVid) {
                    return (
                      <div className="flex items-center gap-2 p-2.5 bg-rose-950/40 rounded border border-rose-900 text-[10px] text-rose-300">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                        <span>Image Required — switch to a video mode or upload an image file</span>
                      </div>
                    );
                  }
                  if (currentModeObj?.requiresRef && !referenceAsset) {
                    return (
                      <div className="flex items-center gap-2 p-2.5 bg-amber-950/40 rounded border border-amber-900 text-[10px] text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span>Reference Character — Required for this mode. Upload reference image above.</span>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStartTransformation}
                    disabled={isTransforming || !sourceAsset}
                    className={`flex-1 py-2.5 px-4 rounded font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                      isTransforming || !sourceAsset
                        ? 'bg-cinema-800 text-cinema-textDim cursor-not-allowed border border-cinema-border'
                        : 'bg-cinema-ai hover:bg-cinema-ai/90 text-white shadow-lg shadow-cinema-ai/20'
                    }`}
                  >
                    {isTransforming ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Transforming Media ({activeJob?.progress_percent?.toFixed(0) || 0}%)…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Generate Transformation</span>
                      </>
                    )}
                  </button>

                  {isTransforming && (
                    <button
                      onClick={handleCancelJob}
                      className="px-3 py-2.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800 rounded font-medium text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {/* Phase 15: Stage Stepper — QUEUED → VALIDATING → PROCESSING → FINALIZING → COMPLETED */}
                {isTransforming && activeJob && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      {(['QUEUED', 'VALIDATING', 'PROCESSING', 'FINALIZING', 'COMPLETED'] as const).map((stage, idx) => {
                        const curIdx = stageIndex(currentStage);
                        const isActive = idx === curIdx;
                        const isDone = idx < curIdx;
                        return (
                          <div key={stage} className="flex-1 flex flex-col items-center gap-0.5">
                            <div className={`w-full h-1 rounded-full transition-all duration-300 ${
                              isDone ? 'bg-emerald-500' : isActive ? 'bg-cinema-ai' : 'bg-cinema-700'
                            }`} />
                            <span className={`text-[8px] font-bold text-center leading-tight ${
                              isActive ? 'text-cinema-ai' : isDone ? 'text-emerald-400' : 'text-cinema-textDim'
                            }`}>{stage}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-cinema-textDim">
                      <span>{activeJob?.metadata?.stage_detail || currentStage || 'Processing transformation'}</span>
                      <span className="font-mono text-cinema-ai">{activeJob?.progress_percent?.toFixed(0) || 0}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-cinema-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cinema-ai transition-all duration-300 rounded-full"
                        style={{ width: `${activeJob?.progress_percent || 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Phase 15: Failed / Cancelled Error Panel with Retry button */}
                {!isTransforming && jobError && !jobResult && (
                  <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-lg space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <p className="text-[11px] font-bold text-rose-200">Transformation Failed</p>
                        <p className="text-[10px] text-rose-300 break-words">{jobError}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {activeJob?.status === 'failed' && (
                        <button
                          onClick={handleRetryJob}
                          className="flex-1 py-1.5 px-3 bg-cinema-ai hover:bg-cinema-ai/90 text-white rounded font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Transformation</span>
                        </button>
                      )}
                      <button
                        onClick={() => { setJobError(null); setActiveJob(null); }}
                        className="py-1.5 px-3 bg-cinema-800 hover:bg-cinema-750 text-cinema-textDim rounded border border-cinema-border font-medium text-xs transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Viewer, Comparison & Deliverables (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-cinema-850 border border-cinema-border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                    Transformation Preview & Comparison
                  </span>
                  {jobResult && (
                    <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold rounded">
                      Completed
                    </span>
                  )}
                </div>

                {/* Viewer Container */}
                {jobResult ? (
                  <div className="h-[340px] w-full">
                    <MediaComparisonViewer
                      mediaType={sourceAsset?.asset_type === 'video' ? 'video' : 'image'}
                      sourceUrl={jobResult.source_url}
                      transformedUrl={jobResult.output_url}
                      metadata={jobResult.metadata}
                    />
                  </div>
                ) : sourceAsset ? (
                  /* Single preview before generation */
                  <div className="h-[280px] w-full bg-cinema-950 rounded border border-cinema-border flex flex-col items-center justify-center relative overflow-hidden">
                    <span className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-black/70 text-cinema-textDim text-[10px] font-bold rounded">
                      Source Media
                    </span>
                    {sourceAsset.asset_type === 'video' ? (
                      <video
                        src={mediaUrl(sourceAsset.storage_key)}
                        controls
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img
                        src={mediaUrl(sourceAsset.storage_key)}
                        alt={sourceAsset.file_name}
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                ) : (
                  <div className="h-[280px] w-full bg-cinema-950 rounded border border-dashed border-cinema-border flex flex-col items-center justify-center gap-2 text-cinema-textDim p-6">
                    <LayoutGrid className="w-8 h-8 opacity-30" />
                    <p className="text-xs text-center">
                      Upload source media on the left and configure your style to preview transformation
                    </p>
                  </div>
                )}

                {/* Action Bar when completed */}
                {jobResult && (
                  <div className="pt-2 border-t border-cinema-border space-y-2">
                    {/* Phase 15: Rich output file info */}
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="p-2 bg-cinema-900 rounded border border-cinema-border space-y-0.5">
                        <p className="text-cinema-textDim font-semibold uppercase tracking-wider text-[9px]">Source</p>
                        <p className="text-white truncate font-medium" title={jobResult.source_file_name}>{jobResult.source_file_name || sourceAsset?.file_name || '—'}</p>
                        <div className="flex flex-wrap gap-2 text-cinema-textDim">
                          {jobResult.source_asset_type && <span className="capitalize">{jobResult.source_asset_type}</span>}
                          {jobResult.source_width && jobResult.source_height && <span>{jobResult.source_width}×{jobResult.source_height}</span>}
                          {formatDuration(jobResult.source_duration_ms) && <span>{formatDuration(jobResult.source_duration_ms)}</span>}
                          {formatBytes(jobResult.source_file_size_bytes) && <span>{formatBytes(jobResult.source_file_size_bytes)}</span>}
                        </div>
                      </div>
                      <div className="p-2 bg-cinema-900 rounded border border-cinema-ai/30 space-y-0.5">
                        <p className="text-cinema-ai font-semibold uppercase tracking-wider text-[9px]">Output</p>
                        <p className="text-white truncate font-medium" title={jobResult.output_file_name}>{jobResult.output_file_name || '—'}</p>
                        <div className="flex flex-wrap gap-2 text-cinema-textDim">
                          {jobResult.output_width && jobResult.output_height && <span>{jobResult.output_width}×{jobResult.output_height}</span>}
                          {formatDuration(jobResult.output_duration_ms) && <span>{formatDuration(jobResult.output_duration_ms)}</span>}
                          {formatBytes(jobResult.output_file_size_bytes) && <span>{formatBytes(jobResult.output_file_size_bytes)}</span>}
                          {jobResult.transformation_mode && <span className="text-cinema-ai capitalize">{jobResult.transformation_mode.replace(/_/g, ' ')}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleAddToAssets}
                        className="py-1.5 px-3 bg-cinema-800 hover:bg-cinema-750 text-white rounded border border-cinema-border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Layers className="w-3.5 h-3.5 text-cinema-ai" />
                        <span>Add to Assets</span>
                      </button>

                      <a
                        href={mediaUrl(jobResult.output_url)}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="py-1.5 px-3 bg-cinema-800 hover:bg-cinema-750 text-white rounded border border-cinema-border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors text-center"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    </div>

                    {/* Timeline Insertion Section */}
                    <div className="p-2.5 bg-cinema-900 rounded border border-cinema-border space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-white">Add to Timeline Sequence</span>
                        <select
                          value={selectedTrackRole}
                          onChange={(e) => setSelectedTrackRole(e.target.value)}
                          className="bg-cinema-800 border border-cinema-border text-white text-[10px] rounded px-2 py-0.5"
                        >
                          <option value="v1_main">Track V1 (Video)</option>
                          <option value="dialogue">Track A1 (Dialogue)</option>
                          <option value="music">Track A3 (Music)</option>
                          <option value="sfx">Track A4 (SFX)</option>
                        </select>
                      </div>

                      <button
                        onClick={handleAddToTimeline}
                        disabled={isAddingTimeline || isAddedToTimeline}
                        className={`w-full py-1.5 px-3 text-white rounded font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                          isAddedToTimeline
                            ? 'bg-emerald-700/80 cursor-default text-emerald-200'
                            : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        {isAddingTimeline ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : isAddedToTimeline ? (
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>{isAddedToTimeline ? 'Added to Timeline ✓' : 'Insert Clip into Timeline'}</span>
                      </button>
                    </div>

                    {/* Character Studio Binding */}
                    {!isVideoSource && (
                      <button
                        onClick={handleUseInCharacterStudio}
                        className="w-full py-1.5 px-3 bg-purple-950/60 hover:bg-purple-900/60 text-purple-200 border border-purple-800 rounded font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                        <span>Use as Character Reference in Studio</span>
                      </button>
                    )}

                    {/* Transform Again Button */}
                    <button
                      onClick={() => {
                        setJobResult(null);
                        setActiveJob(null);
                      }}
                      className="w-full py-1.5 px-3 bg-cinema-800 hover:bg-cinema-750 text-white rounded border border-cinema-border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-cinema-ai" />
                      <span>Transform Again</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
