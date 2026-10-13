import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Play,
  Scissors,
  Trash2,
  Move,
  Volume2,
  VolumeX,
  Type,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Sliders,
  ChevronRight,
  ShieldCheck,
  Film
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';
import { EditPlan, EditOperation, EditPlanResponse } from '../../types';

interface AIEditingAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_PROMPTS = [
  'Trim the first clip to 5 seconds',
  'Split clip at playhead',
  'Ripple delete second clip',
  'Mute music track',
  'Add 1s crossfade',
  'Add title "TAMIL CINEMA INTRO" at the beginning',
];

export const AIEditingAssistantModal: React.FC<AIEditingAssistantModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { activeProject } = useProjectStore();
  const timelineStore = useTimelineStore();
  const { timeline, playheadMs, selectedClipId, selectedTrackId } = timelineStore;
  const { aiCommandPrompt, setAICommandPrompt, showNotification } = useUIStore();

  const [prompt, setPrompt] = useState(aiCommandPrompt || '');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Sync initial prompt from UI store when modal opens
  useEffect(() => {
    if (isOpen) {
      if (aiCommandPrompt) {
        setPrompt(aiCommandPrompt);
      }
      setError(null);
    }
  }, [isOpen, aiCommandPrompt]);

  if (!isOpen) return null;

  // Selected clip metadata for context preview
  const selectedClip = timeline?.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId);

  // Auto-analyze / Generate Plan
  const handleGeneratePlan = async (customPrompt?: string) => {
    const textToAnalyze = (customPrompt !== undefined ? customPrompt : prompt).trim();
    if (!textToAnalyze) {
      setError('Please enter an editing instruction.');
      return;
    }

    if (!activeProject?.id) {
      setError('No active project found.');
      return;
    }

    setLoading(true);
    setError(null);

    // Build timeline context snapshot to send to backend assistant
    const contextSnapshot = {
      project_id: activeProject.id,
      tracks: timeline?.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        track_type: t.track_type,
        track_role: t.track_role,
        volume_db: t.volume_db,
        is_muted: t.is_muted,
        clips: t.clips.map((c) => ({
          id: c.id,
          name: c.name,
          start_time_ms: c.start_time_ms,
          duration_ms: c.duration_ms,
          source_in_ms: c.source_in_ms,
          source_out_ms: c.source_out_ms,
          clip_type: c.clip_type,
          speed_factor: c.speed_factor,
        })),
      })) || [],
      duration_ms: timeline?.duration_ms || 30000,
    };

    try {
      const res = await api.post<EditPlanResponse>('/ai/editing-plan', {
        project_id: activeProject.id,
        prompt: textToAnalyze,
        selected_clip_id: selectedClipId,
        selected_track_id: selectedTrackId,
        playhead_ms: playheadMs,
        timeline_context: contextSnapshot,
      });

      const data = res.data;
      if (data && data.plan) {
        setPlan(data.plan);
      } else {
        setError('Received invalid response from editing assistant.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to generate edit plan.');
    } finally {
      setLoading(false);
    }
  };

  // Execute the approved plan against useTimelineStore primitives
  const handleApplyPlan = () => {
    if (!plan || !plan.is_valid || plan.operations.length === 0) return;

    setIsApplying(true);
    try {
      // Step 1: Push undo history point before mutating
      timelineStore.pushHistory();

      // Step 2: Sequentially apply each operation
      for (const op of plan.operations) {
        switch (op.operation_type) {
          case 'trim': {
            const targetId = op.target_id || selectedClipId;
            if (targetId) {
              const edge = op.parameters.edge || 'right';
              const deltaMs = op.parameters.delta_ms;
              if (deltaMs !== undefined) {
                timelineStore.trimClip(targetId, edge, deltaMs);
              } else if (op.parameters.new_duration_ms !== undefined) {
                timelineStore.updateClip(targetId, (clip) => {
                  clip.duration_ms = op.parameters.new_duration_ms;
                  clip.source_out_ms = clip.source_in_ms + op.parameters.new_duration_ms;
                });
              }
            }
            break;
          }

          case 'split': {
            const targetId = op.target_id || selectedClipId;
            if (targetId) {
              timelineStore.splitClipAtPlayhead(targetId);
            }
            break;
          }

          case 'delete': {
            const targetId = op.target_id || selectedClipId;
            if (targetId) {
              timelineStore.deleteClip(targetId);
            }
            break;
          }

          case 'ripple_delete': {
            const targetId = op.target_id || selectedClipId;
            if (targetId) {
              timelineStore.rippleDelete(targetId);
            }
            break;
          }

          case 'move': {
            const targetId = op.target_id || selectedClipId;
            const targetTrackId = op.track_id || op.parameters.track_id;
            const newStartMs = op.parameters.new_start_ms ?? 0;
            if (targetId && targetTrackId) {
              timelineStore.moveClipToTrack(targetId, targetTrackId, newStartMs);
            }
            break;
          }

          case 'transition': {
            const targetId = op.target_id || selectedClipId;
            if (targetId) {
              const edge = op.parameters.edge || 'out';
              const transitionData = {
                type: op.parameters.transition_type || 'crossfade',
                duration_ms: op.parameters.duration_ms || 1000,
              };
              timelineStore.setClipTransition(targetId, edge, transitionData);
            }
            break;
          }

          case 'volume': {
            const trackId = op.track_id;
            const volDb = op.parameters.volume_db ?? 0.0;
            if (trackId) {
              timelineStore.setTrackVolume(trackId, volDb);
            }
            break;
          }

          case 'mute': {
            const trackId = op.track_id;
            if (trackId) {
              timelineStore.toggleTrackMute(trackId);
            }
            break;
          }

          case 'title': {
            // Find graphics/title track or create on V1
            const titleTrack = timeline?.tracks.find((t) => t.track_role === 'graphics' || t.name.toLowerCase().includes('title') || t.name.toLowerCase().includes('text')) || timeline?.tracks[0];
            if (titleTrack) {
              const titleText = op.parameters.text || 'TITLE';
              const durationMs = op.parameters.duration_ms || 5000;
              const startMs = op.parameters.start_time_ms || 0;
              timelineStore.addClipToTrack(titleTrack.id, {
                name: titleText,
                clip_type: 'title',
                start_time_ms: startMs,
                duration_ms: durationMs,
                metadata_info: {
                  graphic_template: 'lower_third',
                  title: titleText,
                  subtitle: op.parameters.subtitle || 'Tamil Cinema Production',
                  animation_in: 'fade',
                  animation_out: 'fade',
                },
              });
            }
            break;
          }

          case 'adjust_duration': {
            const targetId = op.target_id || selectedClipId;
            if (targetId && op.parameters.new_duration_ms) {
              timelineStore.updateClip(targetId, (clip) => {
                clip.duration_ms = op.parameters.new_duration_ms;
                clip.source_out_ms = clip.source_in_ms + op.parameters.new_duration_ms;
              });
            }
            break;
          }

          default:
            console.warn(`Unhandled AI operation type: ${op.operation_type}`);
            break;
        }
      }

      // Save and notify user
      timelineStore.saveTimeline();
      showNotification('AI Edit Plan applied successfully! Press Ctrl+Z to undo.', 'success');
      setAICommandPrompt('');
      onClose();
    } catch (err: any) {
      setError(`Failed to apply changes: ${err.message || 'Unknown error'}`);
    } finally {
      setIsApplying(false);
    }
  };

  const getOpIcon = (type: string) => {
    switch (type) {
      case 'trim':
      case 'adjust_duration':
        return <Scissors className="w-4 h-4 text-amber-400" />;
      case 'split':
        return <Scissors className="w-4 h-4 text-cyan-400" />;
      case 'delete':
      case 'ripple_delete':
        return <Trash2 className="w-4 h-4 text-red-400" />;
      case 'move':
        return <Move className="w-4 h-4 text-blue-400" />;
      case 'transition':
        return <Layers className="w-4 h-4 text-purple-400" />;
      case 'volume':
        return <Volume2 className="w-4 h-4 text-emerald-400" />;
      case 'mute':
        return <VolumeX className="w-4 h-4 text-orange-400" />;
      case 'title':
      case 'caption':
        return <Type className="w-4 h-4 text-pink-400" />;
      default:
        return <Sliders className="w-4 h-4 text-cinema-textDim" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-cinema-900 border border-cinema-border rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
        id="ai-editing-assistant-modal"
        data-testid="ai-editing-assistant-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cinema-border bg-cinema-850">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cinema-ai/10 border border-cinema-ai/30 rounded-lg">
              <Sparkles className="w-5 h-5 text-cinema-ai animate-pulse-cyan" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  AI Editing Assistant / Prompt-to-Edit
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/40 rounded">
                  Phase 19
                </span>
              </div>
              <p className="text-xs text-cinema-textDim">
                Natural-language timeline modifications with diff review, confirmation guardrails, and instant undo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-cinema-textDim hover:text-white hover:bg-cinema-800 rounded-lg transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Active Context Bar */}
          <div className="bg-cinema-850 border border-cinema-border/60 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-3">
              <span className="text-cinema-textDim flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-cinema-textMuted" />
                Project: <strong className="text-cinema-text">{activeProject?.title || 'None'}</strong>
              </span>
              <span className="text-cinema-textDim border-l border-cinema-border pl-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cinema-textMuted" />
                Playhead: <strong className="text-cinema-text">{(playheadMs / 1000).toFixed(2)}s</strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-cinema-textDim flex items-center gap-1.5">
                Selected Clip:{' '}
                <strong className={selectedClip ? 'text-cinema-ai' : 'text-cinema-textMuted'}>
                  {selectedClip ? selectedClip.name : 'None (Context Auto-detect)'}
                </strong>
              </span>
              <span className="text-cinema-textDim border-l border-cinema-border pl-3">
                Tracks: <strong className="text-cinema-text">{timeline?.tracks.length || 0}</strong>
              </span>
            </div>
          </div>

          {/* Prompt Input Form */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-cinema-text uppercase tracking-wider">
              Editing Instruction (Tamil or English)
            </label>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGeneratePlan();
                  }
                }}
                rows={2}
                placeholder="e.g. 'Trim the first clip to 5 seconds', 'Split clip at playhead', 'Ripple delete clip 2', 'Mute music track', or 'Add title at the beginning'..."
                className="w-full bg-cinema-950 border border-cinema-border focus:border-cinema-ai rounded-lg px-3 py-2 text-sm text-cinema-text outline-none resize-none transition-all placeholder:text-cinema-textDim"
              />
              <button
                type="button"
                id="generate-edit-plan-btn"
                data-testid="generate-edit-plan-btn"
                onClick={() => handleGeneratePlan()}
                disabled={loading || !prompt.trim()}
                className="absolute right-2 bottom-3 flex items-center gap-1.5 px-3 py-1.5 bg-cinema-ai hover:bg-cyan-400 text-cinema-950 font-semibold text-xs rounded-md shadow-md transition-all disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Edit Plan</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preset Suggestions */}
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-cinema-textDim font-medium">
              Quick Suggestions:
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_PROMPTS.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(suggestion);
                    handleGeneratePlan(suggestion);
                  }}
                  className="px-2.5 py-1 text-xs bg-cinema-800 hover:bg-cinema-750 text-cinema-textDim hover:text-cinema-text border border-cinema-border rounded-md transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-start gap-2.5 text-xs text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Structured Edit Plan Preview */}
          {plan && (
            <div className="space-y-4 pt-2 border-t border-cinema-border/70">
              {/* Plan Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-cinema-850 p-3.5 rounded-lg border border-cinema-border">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Proposed Plan:
                    </span>
                    <span className="text-xs font-medium text-cinema-text">{plan.summary}</span>
                  </div>
                  <div className="text-[11px] text-cinema-textDim">
                    Plan ID: <code className="text-cinema-ai">{plan.plan_id}</code> • Original Prompt:{' '}
                    <em>"{plan.request}"</em>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={`px-2.5 py-1 rounded text-xs font-semibold border flex items-center gap-1.5 ${
                      plan.confidence >= 0.8
                        ? 'bg-emerald-950/50 text-emerald-300 border-emerald-700/60'
                        : plan.confidence >= 0.5
                        ? 'bg-amber-950/50 text-amber-300 border-amber-700/60'
                        : 'bg-red-950/50 text-red-300 border-red-700/60'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{(plan.confidence * 100).toFixed(0)}% Confidence</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                      plan.status === 'ready_for_review'
                        ? 'bg-cinema-ai/20 text-cinema-ai border-cinema-ai/40'
                        : plan.status === 'ambiguous'
                        ? 'bg-amber-950/40 text-amber-400 border-amber-800'
                        : 'bg-red-950/40 text-red-400 border-red-800'
                    }`}
                  >
                    {plan.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {/* Validation / Ambiguity Warnings */}
              {!plan.is_valid && (
                <div className="p-3.5 bg-amber-950/40 border border-amber-800/60 rounded-lg space-y-2 text-xs text-amber-200">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Plan Cannot Be Applied:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-cinema-textDim pl-2">
                    {plan.validation_errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                  {plan.clarification_prompt && (
                    <div className="mt-2 pt-2 border-t border-amber-800/40 text-cinema-text">
                      <strong className="text-amber-300">Suggestion:</strong> {plan.clarification_prompt}
                    </div>
                  )}
                </div>
              )}

              {/* Operations List */}
              {plan.operations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-cinema-textDim uppercase tracking-wider">
                    <span>Operations to Apply ({plan.operations.length})</span>
                    <span className="text-[11px] text-cinema-textMuted lowercase">
                      Requires explicit confirmation
                    </span>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1" data-testid="edit-plan-operations">
                    {plan.operations.map((op, idx) => (
                      <div
                        key={op.operation_id || idx}
                        className="bg-cinema-950 border border-cinema-border hover:border-cinema-borderLight rounded-lg p-3 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-cinema-850 border border-cinema-border rounded-md mt-0.5">
                            {getOpIcon(op.operation_type)}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-cinema-800 text-cinema-ai border border-cinema-border rounded">
                                {op.operation_type.replace(/_/g, ' ')}
                              </span>
                              <span className="font-semibold text-cinema-text">
                                {op.target_name || op.target_id ? `Target: ${op.target_name || op.target_id}` : 'Timeline Global'}
                              </span>
                              {op.track_id && (
                                <span className="text-[10px] text-cinema-textDim font-mono">
                                  Track: {op.track_id}
                                </span>
                              )}
                            </div>
                            <p className="text-cinema-textDim text-xs">{op.description}</p>
                            {/* Parameters tags */}
                            {Object.keys(op.parameters).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {Object.entries(op.parameters).map(([key, val]) => (
                                  <span
                                    key={key}
                                    className="px-1.5 py-0.5 bg-cinema-900 text-cinema-textDim border border-cinema-border/60 rounded text-[10px] font-mono"
                                  >
                                    {key}: {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-cinema-border bg-cinema-850 flex items-center justify-between">
          <div className="text-[11px] text-cinema-textDim">
            💡 Full undo/redo support available via <kbd className="px-1 py-0.5 bg-cinema-800 border border-cinema-border rounded text-white font-mono">Ctrl+Z</kbd> after applying.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              id="cancel-ai-plan-btn"
              data-testid="cancel-ai-plan-btn"
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-cinema-text hover:text-white hover:bg-cinema-800 rounded-md transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              id="apply-ai-plan-btn"
              data-testid="apply-ai-plan-btn"
              onClick={handleApplyPlan}
              disabled={!plan || !plan.is_valid || plan.operations.length === 0 || isApplying}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-md shadow-lg shadow-emerald-950/40 transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying Changes…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Apply Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
