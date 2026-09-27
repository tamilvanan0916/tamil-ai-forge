import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Film,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Music,
  Subtitles,
  Layers,
  Video,
  Clapperboard,
  Download,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';
import { SidebarTab } from '../../types';

interface UnifiedProjectStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UnifiedProjectStatusModal: React.FC<UnifiedProjectStatusModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { activeProject } = useProjectStore();
  const { setActiveSidebarTab } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    if (!activeProject?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/projects/${activeProject.id}/unified-status`);
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load project status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeProject?.id) {
      fetchStatus();
    }
  }, [isOpen, activeProject?.id]);

  if (!isOpen) return null;

  const navigateToTab = (tab: SidebarTab) => {
    setActiveSidebarTab(tab);
    onClose();
  };

  const stages = data?.stages || {};

  const pipelineStages: Array<{
    key: string;
    num: number;
    title: string;
    targetTab: SidebarTab;
    icon: React.ComponentType<{ className?: string }>;
    status: 'completed' | 'in_progress' | 'pending' | 'warning' | 'idle';
    summary: string;
    detail: string;
  }> = [
    {
      key: 'project_setup',
      num: 1,
      title: 'Project Setup',
      targetTab: 'my-projects',
      icon: Film,
      status: stages.project_setup ? 'completed' : 'pending',
      summary: stages.project_setup?.resolution ? `${stages.project_setup.resolution} @ ${stages.project_setup.fps} fps` : 'Initialized',
      detail: stages.project_setup?.title || activeProject?.title || 'Project configured',
    },
    {
      key: 'story',
      num: 2,
      title: 'Story & Script',
      targetTab: 'story-script',
      icon: Clapperboard,
      status: stages.story?.has_story ? 'completed' : 'pending',
      summary: stages.story?.has_story ? (stages.story?.genre || 'Script Ready') : 'Not started',
      detail: stages.story?.has_story ? `Title: ${stages.story?.title || 'Story generated'} • Mood: ${stages.story?.mood || 'Standard'}` : 'Write or generate project screenplay',
    },
    {
      key: 'scene_generation',
      num: 3,
      title: 'AI Scenes & Visuals',
      targetTab: 'scenes',
      icon: Sparkles,
      status: stages.scene_generation?.total_scenes > 0 && stages.scene_generation?.ready_scenes === stages.scene_generation?.total_scenes
        ? 'completed'
        : stages.scene_generation?.ready_scenes > 0
        ? 'in_progress'
        : 'pending',
      summary: `${stages.scene_generation?.ready_scenes || 0} / ${stages.scene_generation?.total_scenes || 0} scenes ready`,
      detail: stages.scene_generation?.total_scenes > 0 ? 'Shots & keyframes generated via mock video engine' : 'No scenes planned yet',
    },
    {
      key: 'audio',
      num: 4,
      title: 'Voice & Tamil Dubbing',
      targetTab: 'voice-dubbing',
      icon: VolumeCheckIcon,
      status: (stages.audio?.dialogue_count || 0) > 0 ? 'completed' : 'pending',
      summary: `${stages.audio?.dialogue_count || 0} voice tracks`,
      detail: (stages.audio?.dialogue_count || 0) > 0 ? 'Dialogue lines generated & synced' : 'Record or synthesize Tamil voice tracks',
    },
    {
      key: 'music',
      num: 5,
      title: 'Music & BGM',
      targetTab: 'music-library',
      icon: Music,
      status: (stages.music?.music_count || 0) > 0 ? 'completed' : 'pending',
      summary: `${stages.music?.music_count || 0} music tracks`,
      detail: (stages.music?.music_count || 0) > 0 ? 'Background score & thematic soundtrack assigned' : 'Add background score from library or AI',
    },
    {
      key: 'captions',
      num: 6,
      title: 'Subtitles & Captions',
      targetTab: 'captions',
      icon: Subtitles,
      status: (stages.captions?.captions_count || 0) > 0 ? 'completed' : 'pending',
      summary: `${stages.captions?.captions_count || 0} captions`,
      detail: (stages.captions?.captions_count || 0) > 0 ? 'Tamil & English timecoded subtitle blocks' : 'Generate or auto-transcribe subtitles',
    },
    {
      key: 'timeline',
      num: 7,
      title: 'Timeline Assembly',
      targetTab: 'edit',
      icon: Layers,
      status: (stages.timeline?.clips_count || 0) > 0 ? 'completed' : 'pending',
      summary: `${stages.timeline?.clips_count || 0} clips across ${stages.timeline?.tracks_count || 0} tracks`,
      detail: stages.timeline?.duration_ms ? `Duration: ${(stages.timeline.duration_ms / 1000).toFixed(1)}s` : 'Add clips to timeline',
    },
    {
      key: 'transformation',
      num: 8,
      title: 'Media Transformation',
      targetTab: 'media-transform',
      icon: Sparkles,
      status: stages.transformation?.status === 'completed'
        ? 'completed'
        : stages.transformation?.status === 'in_progress'
        ? 'in_progress'
        : 'pending',
      summary: `${stages.transformation?.transformed_assets_count || 0} transformed assets (${stages.transformation?.jobs_count || 0} jobs)`,
      detail: stages.transformation?.latest_mode ? `Latest: ${stages.transformation.latest_mode}` : 'Video-to-Video, Inpainting, Stylization',
    },
    {
      key: 'rendering',
      num: 9,
      title: 'Master Rendering',
      targetTab: 'render-queue',
      icon: Video,
      status: stages.rendering?.is_master_stale
        ? 'warning'
        : stages.rendering?.file_available
        ? 'completed'
        : ['queued', 'processing', 'rendering'].includes(stages.rendering?.status)
        ? 'in_progress'
        : 'pending',
      summary: stages.rendering?.is_master_stale
        ? 'Master Stale (Edits made)'
        : stages.rendering?.file_available
        ? 'Master Render Ready'
        : stages.rendering?.status === 'processing'
        ? `Rendering (${stages.rendering?.progress_percent || 0}%)`
        : 'Not rendered',
      detail: stages.rendering?.is_master_stale
        ? 'Timeline modified after render; re-render recommended'
        : stages.rendering?.file_available
        ? 'High-res master exported and verified'
        : 'Full composition export pending',
    },
    {
      key: 'deliverables',
      num: 10,
      title: 'Cinema & Deliverables',
      targetTab: 'production-studio',
      icon: Package,
      status: stages.deliverables?.package_ready ? 'completed' : 'pending',
      summary: stages.deliverables?.package_ready ? `${stages.deliverables.files_count || 0} release files` : 'Pending master render',
      detail: stages.deliverables?.package_ready ? 'Full DCI-compliant deliverable package ready' : 'Screen master in Theater and package deliverables',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-cinema-900 border border-cinema-border rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        id="unified-project-status-modal"
        data-testid="unified-project-status-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cinema-border bg-cinema-850">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cinema-ai/10 border border-cinema-ai/30 rounded-lg">
              <Activity className="w-5 h-5 text-cinema-ai" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Project Pipeline Status & Health</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-cinema-800 text-cinema-textDim border border-cinema-border rounded">
                  {data?.project_id ? `ID: ${data.project_id.slice(0, 8)}…` : ''}
                </span>
              </div>
              <p className="text-xs text-cinema-textDim">
                {activeProject ? `Project: "${activeProject.title}"` : 'End-to-End Filmmaking Pipeline'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchStatus}
              disabled={loading}
              className="p-2 text-cinema-textDim hover:text-white hover:bg-cinema-800 rounded-lg transition-colors"
              title="Refresh Pipeline Status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-cinema-textDim hover:text-white hover:bg-cinema-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button
                id="modal-retry-status-btn"
                data-testid="modal-retry-status-btn"
                onClick={fetchStatus}
                className="px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-[11px] font-bold transition-colors flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Honest Mode Pill Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-cinema-800/60 border border-cinema-border rounded-lg text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="font-semibold text-white">Environment Integrity:</span>
              <span className="text-cinema-ai font-mono text-[11px] font-bold">
                {data?.offline_label || 'OFFLINE DEMO MODE (MOCK)'}
              </span>
            </div>
            <span className="text-[10px] text-cinema-textDim">
              Status: <span className="text-amber-400 font-medium">NOT REAL-PROVIDER-VERIFIED</span> (Zero External Quota)
            </span>
          </div>

          {/* Progress Overview Card */}
          <div className="p-4 bg-cinema-850 border border-cinema-border rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span id="project-overall-progress-title" data-testid="project-overall-progress-title" className="text-[11px] uppercase tracking-wider text-cinema-textDim font-bold">Overall Progress</span>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {data?.honest_message || 'Initializing project pipeline…'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-cinema-ai">
                  {data?.completion_percent !== undefined ? `${data.completion_percent}%` : '0%'}
                </span>
                <p className="text-[10px] text-cinema-textDim">Production Complete</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-cinema-900 rounded-full h-2.5 overflow-hidden border border-cinema-border">
              <div
                className="bg-gradient-to-r from-cinema-red via-cinema-ai to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${data?.completion_percent || 0}%` }}
              />
            </div>

            {stages.rendering?.is_master_stale && (
              <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded-lg flex items-center gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                <span>
                  <strong>Master Stale:</strong> Timeline edits occurred after the latest render. Re-render to update the master cinema preview.
                </span>
              </div>
            )}
          </div>

          {/* 10 Pipeline Stages Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-wider text-cinema-textDim font-bold">
                10-Stage Filmmaking Pipeline
              </h3>
              <span className="text-[11px] text-cinema-textDim">Click any stage to jump into that workspace</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pipelineStages.map((stage) => {
                const IconComponent = stage.icon;
                return (
                  <div
                    key={stage.key}
                    id={`pipeline-stage-${stage.key}`}
                    data-testid={`pipeline-stage-${stage.key}`}
                    onClick={() => navigateToTab(stage.targetTab)}
                    className="p-3 bg-cinema-850 hover:bg-cinema-800 border border-cinema-border hover:border-cinema-ai/50 rounded-lg cursor-pointer transition-all flex items-start justify-between group"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                          stage.status === 'completed'
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                            : stage.status === 'in_progress'
                            ? 'bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/40 animate-pulse'
                            : stage.status === 'warning'
                            ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                            : 'bg-cinema-800 text-cinema-textDim border border-cinema-border'
                        }`}
                      >
                        {stage.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : stage.status === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                        ) : stage.status === 'in_progress' ? (
                          <Clock className="w-4 h-4 text-cinema-ai" />
                        ) : (
                          stage.num
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white group-hover:text-cinema-ai transition-colors">
                            {stage.num}. {stage.title}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                              stage.status === 'completed'
                                ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
                                : stage.status === 'in_progress'
                                ? 'bg-cinema-ai/10 text-cinema-ai border border-cinema-ai/30'
                                : stage.status === 'warning'
                                ? 'bg-amber-900/30 text-amber-400 border border-amber-800/40'
                                : 'bg-cinema-800 text-cinema-textDim border border-cinema-border'
                            }`}
                          >
                            {stage.status === 'completed'
                              ? 'Ready'
                              : stage.status === 'in_progress'
                              ? 'Working'
                              : stage.status === 'warning'
                              ? 'Stale'
                              : 'Pending'}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-cinema-text mt-0.5 truncate">
                          {stage.summary}
                        </p>
                        <p className="text-[10px] text-cinema-textDim mt-0.5 truncate">
                          {stage.detail}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-cinema-textDim group-hover:text-cinema-ai group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2 mt-1" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-cinema-border bg-cinema-850 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-cinema-textDim">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>All mock providers operational locally</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text hover:text-white rounded-md text-xs font-medium border border-cinema-border transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const VolumeCheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);
