import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Move, Crop, Video, Wand2, Palette, Volume2, Type, Sparkles,
  RotateCw, Sliders, Disc, Plus, Eye, EyeOff, ChevronUp, ChevronDown,
  Loader2, AlertCircle, Activity, Crosshair, ScanLine, Clock, Diamond, ArrowRightLeft,
  Gauge, Play, RotateCcw, Snowflake, Anchor, Copy, Clipboard, Scissors, Layers,
  Bookmark, Trash2, Lock, Unlock, VolumeX, Headphones, CornerDownLeft,
  Link, Unlink, FolderPlus, FolderMinus,
} from 'lucide-react';
import { useUIStore, InspectorTab } from '../../stores/useUIStore';
import { useTimelineStore, evaluateClipVolume, evaluateClipProperty } from '../../stores/useTimelineStore';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useUIStore as useUI } from '../../stores/useUIStore';
import { Clip, VideoTransitionType, TimelineMarker, MarkerColor, MARKER_COLOR_MAP } from '../../types';
import { api } from '../../services/api';

function formatTimecode(ms: number, fps = 30): string {
  const totalFrames = Math.floor((ms / 1000) * fps);
  const frames = totalFrames % fps;
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

const TABS: Array<{ id: InspectorTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'transform', label: 'Transform', icon: Move },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'ai', label: 'AI', icon: Sparkles },
];

// Helper slider row with keyframe support
const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accentClass?: string;
  isKeyframed?: boolean;
  hasKeyframeAtPlayhead?: boolean;
  onToggleKeyframe?: () => void;
  keyframeTestId?: string;
  onChange: (v: number) => void;
}> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  accentClass = 'accent-cinema-red',
  isKeyframed = false,
  hasKeyframeAtPlayhead = false,
  onToggleKeyframe,
  keyframeTestId,
  onChange,
}) => (
  <div>
    <div className="flex justify-between items-center text-[11px] text-cinema-text mb-1">
      <div className="flex items-center gap-1.5">
        {onToggleKeyframe && (
          <button
            type="button"
            data-testid={keyframeTestId}
            onClick={onToggleKeyframe}
            title={hasKeyframeAtPlayhead ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
            className={`p-0.5 rounded transition-colors ${
              hasKeyframeAtPlayhead
                ? 'text-amber-400 hover:text-amber-300'
                : isKeyframed
                ? 'text-amber-400/50 hover:text-amber-400'
                : 'text-cinema-textDim/50 hover:text-white'
            }`}
          >
            <Diamond
              className={`w-2.5 h-2.5 ${hasKeyframeAtPlayhead ? 'fill-amber-400' : ''}`}
            />
          </button>
        )}
        <span>{label}</span>
      </div>
      <span className="font-mono text-cinema-ai">
        {typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(2) : value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`w-full ${accentClass}`}
    />
  </div>
);

// Helper number row with keyframe support
const NumberRow: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  isKeyframed?: boolean;
  hasKeyframeAtPlayhead?: boolean;
  onToggleKeyframe?: () => void;
  testId?: string;
  keyframeTestId?: string;
  onChange: (v: number) => void;
}> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  isKeyframed = false,
  hasKeyframeAtPlayhead = false,
  onToggleKeyframe,
  testId,
  keyframeTestId,
  onChange,
}) => (
  <div className="bg-cinema-900 border border-cinema-border rounded px-2 py-1.5 flex items-center justify-between">
    <div className="flex items-center gap-1.5">
      {onToggleKeyframe && (
        <button
          type="button"
          data-testid={keyframeTestId}
          onClick={onToggleKeyframe}
          title={hasKeyframeAtPlayhead ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
          className={`p-0.5 rounded transition-colors ${
            hasKeyframeAtPlayhead
              ? 'text-amber-400 hover:text-amber-300'
              : isKeyframed
              ? 'text-amber-400/50 hover:text-amber-400'
              : 'text-cinema-textDim/50 hover:text-white'
          }`}
        >
          <Diamond
            className={`w-2.5 h-2.5 ${hasKeyframeAtPlayhead ? 'fill-amber-400' : ''}`}
          />
        </button>
      )}
      <span className="text-cinema-textDim text-[11px]">{label}</span>
    </div>
    <div className="flex items-center gap-1">
      <input
        type="number"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-16 bg-transparent text-right outline-none font-mono text-cinema-text text-[11px]"
      />
      {unit && <span className="text-cinema-textDim text-[10px]">{unit}</span>}
    </div>
  </div>
);

export const DynamicInspector: React.FC = () => {
  const { activeInspectorTab, setActiveInspectorTab } = useUIStore();
  const {
    selectedClipId, timeline, updateClip, playheadMs,
    addKeyframe, deleteKeyframe, moveKeyframe, updateKeyframeValue, clearAudioAutomation, setPlayhead,
    applyVideoTransition, removeVideoTransition,
    setClipSpeed, setClipReverse,
    applyFreezeFrame, removeFreezeFrame,
    applyFrameHold, removeFrameHold,
    duplicateClip, copyClip, pasteClip, clipboardClip, clipboardClips, splitClipAtPlayhead,
    duplicateSelectedClips, copySelectedClips, pasteSelectedClips,
    openCompoundClip, ungroupCompoundClip, createCompoundClip,
    addTimelineMarker, addClipMarker, updateMarker, deleteMarker, clearMarkers, goToNextMarker, goToPrevMarker,
    selectedTrackId, renameTrack, deleteTrack, reorderTrack, toggleTrackLock, toggleTrackVisibility, toggleTrackMute, toggleTrackSolo, setTrackVolume, setTrackPan,
    slipClip, slideClip, rollEdit, activeTimelineTool, setActiveTimelineTool,
    deleteClip, deleteSelectedClips, rippleDelete, rippleDeleteSelectedClips,
    selectedGap, setSelectedGap, deleteGap,
    groupSelectedClips, ungroupSelectedClips, linkSelectedClips, unlinkSelectedClips, realignLinkedClip,
  } = useTimelineStore();
  const selectedClipIds = useSelectionStore((s) => s.selectedClipIds);
  const { showNotification } = useUI();

  // Find selected track (Phase 37)
  const selectedTrack = timeline?.tracks.find((t) => t.id === selectedTrackId) || null;

  // Find selected clip
  let selectedClip: Clip | null = null;
  let trackRole = '';
  if (selectedClipId && timeline) {
    for (const track of timeline.tracks) {
      const c = track.clips.find((clip) => clip.id === selectedClipId);
      if (c) {
        selectedClip = c;
        trackRole = track.track_role;
        break;
      }
    }
  }

  // Phase 39: Detect adjacent touching clips for Rolling Edit
  const rollPair = useMemo(() => {
    if (!timeline?.tracks || !selectedClip) return null;
    const track = timeline.tracks.find((t) => t.clips.some((c) => c.id === selectedClip.id));
    if (!track) return null;
    const sorted = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
    const idx = sorted.findIndex((c) => c.id === selectedClip.id);
    const pred = idx > 0 ? sorted[idx - 1] : null;
    const succ = idx < sorted.length - 1 ? sorted[idx + 1] : null;
    const isPredTouching = pred ? Math.abs((pred.start_time_ms + pred.duration_ms) - selectedClip.start_time_ms) <= 5 : false;
    const isSuccTouching = succ ? Math.abs((selectedClip.start_time_ms + selectedClip.duration_ms) - succ.start_time_ms) <= 5 : false;

    if (isSuccTouching && succ) {
      return {
        pred: selectedClip,
        succ: succ,
        cutMs: selectedClip.start_time_ms + selectedClip.duration_ms,
      };
    } else if (isPredTouching && pred) {
      return {
        pred: pred,
        succ: selectedClip,
        cutMs: selectedClip.start_time_ms,
      };
    }
    return null;
  }, [timeline?.tracks, selectedClip]);

  // Auto-switch tab when a clip is selected
  useEffect(() => {
    if (!selectedClip) return;
    if (['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(trackRole)) {
      setActiveInspectorTab('audio');
    } else if (selectedClip.clip_type === 'caption' || selectedClip.clip_type === 'title' || trackRole === 'graphics') {
      setActiveInspectorTab('text');
    } else if (activeInspectorTab === 'audio' || activeInspectorTab === 'text') {
      setActiveInspectorTab('transform');
    }
  }, [selectedClipId]); // eslint-disable-line

  const update = (updater: (clip: Clip) => void) => {
    if (selectedClip) updateClip(selectedClip.id, updater);
  };

  const handleAIStub = (action: string) => {
    showNotification(`AI provider not configured: ${action}. Configure a provider in Settings.`, 'warning');
  };

  // Resolve adjacent transition pair if video clips are selected or adjacent
  const transitionPair = React.useMemo<{
    clipA: Clip;
    clipB: Clip;
    track: any;
    currentTransition: any;
  } | null>(() => {
    if (!timeline) return null;

    // Check multi-selection (2 clips selected)
    const selArray = Array.from(selectedClipIds);
    if (selArray.length === 2) {
      for (const track of timeline.tracks) {
        if (track.track_type !== 'video' && track.track_role !== 'video') continue;
        const sorted = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
        const idx0 = sorted.findIndex((c) => c.id === selArray[0]);
        const idx1 = sorted.findIndex((c) => c.id === selArray[1]);
        if (idx0 !== -1 && idx1 !== -1) {
          const firstIdx = Math.min(idx0, idx1);
          const secondIdx = Math.max(idx0, idx1);
          if (secondIdx === firstIdx + 1) {
            const clipA = sorted[firstIdx];
            const clipB = sorted[secondIdx];
            return {
              clipA,
              clipB,
              track,
              currentTransition: clipA.transition_out || clipB.transition_in || null,
            };
          }
        }
      }
    }

    // Single selected clip fallback: find adjacent clip on same video track
    if (selectedClip) {
      for (const track of timeline.tracks) {
        if (track.track_type !== 'video' && track.track_role !== 'video') continue;
        const sorted = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
        const idx = sorted.findIndex((c) => c.id === selectedClip.id);
        if (idx !== -1) {
          if (idx + 1 < sorted.length) {
            const clipA = sorted[idx];
            const clipB = sorted[idx + 1];
            return {
              clipA,
              clipB,
              track,
              currentTransition: clipA.transition_out || clipB.transition_in || null,
            };
          }
          if (idx - 1 >= 0) {
            const clipA = sorted[idx - 1];
            const clipB = sorted[idx];
            return {
              clipA,
              clipB,
              track,
              currentTransition: clipA.transition_out || clipB.transition_in || null,
            };
          }
        }
      }
    }

    return null;
  }, [timeline, selectedClipIds, selectedClip]);

  const [transitionType, setTransitionType] = useState<VideoTransitionType>('crossfade');
  const [transitionDuration, setTransitionDuration] = useState<number>(1000);

  useEffect(() => {
    if (transitionPair?.currentTransition) {
      const ct = transitionPair.currentTransition;
      if (ct.type === 'crossfade' || ct.type === 'fade_black' || ct.type === 'fade_white') {
        setTransitionType(ct.type);
      }
      if (typeof ct.duration_ms === 'number' && ct.duration_ms > 0) {
        setTransitionDuration(ct.duration_ms);
      }
    }
  }, [transitionPair]);

  // Phase 28: Freeze frame local state
  const [freezeDuration, setFreezeDuration] = useState<number>(2000);
  const [freezeAtOffsetMs, setFreezeAtOffsetMs] = useState<number>(0);

  useEffect(() => {
    if (selectedClip) {
      if (selectedClip.freeze_duration_ms && [1000, 2000, 3000, 5000].includes(selectedClip.freeze_duration_ms)) {
        setFreezeDuration(selectedClip.freeze_duration_ms);
      }
      if (typeof selectedClip.freeze_at_ms === 'number') {
        setFreezeAtOffsetMs(selectedClip.freeze_at_ms);
      } else {
        const offset = Math.max(0, Math.min(Math.max(0, selectedClip.duration_ms - 1), playheadMs - selectedClip.start_time_ms));
        setFreezeAtOffsetMs(offset);
      }
    }
  }, [selectedClip?.id, selectedClip?.is_frozen, selectedClip?.freeze_at_ms, selectedClip?.freeze_duration_ms]);

  // Phase 29: Frame hold local state
  const [frameHoldDuration, setFrameHoldDuration] = useState<number>(2000);
  const [frameHoldAtOffsetMs, setFrameHoldAtOffsetMs] = useState<number>(0);

  useEffect(() => {
    if (selectedClip) {
      if (selectedClip.frame_hold_duration_ms && [1000, 2000, 3000, 5000].includes(selectedClip.frame_hold_duration_ms)) {
        setFrameHoldDuration(selectedClip.frame_hold_duration_ms);
      }
      if (typeof selectedClip.frame_hold_at_ms === 'number') {
        setFrameHoldAtOffsetMs(selectedClip.frame_hold_at_ms);
      } else {
        const offset = Math.max(0, Math.min(Math.max(0, selectedClip.duration_ms - 1), playheadMs - selectedClip.start_time_ms));
        setFrameHoldAtOffsetMs(offset);
      }
    }
  }, [selectedClip?.id, selectedClip?.is_frame_hold, selectedClip?.frame_hold_at_ms, selectedClip?.frame_hold_duration_ms]);

  return (
    <div className="flex flex-col h-full bg-cinema-850 border-l border-cinema-border select-none text-xs">
      {/* Inspector Header */}
      <div className="h-10 border-b border-cinema-border flex items-center justify-between px-3 flex-shrink-0">
        <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cinema-red" />
          Inspector
        </span>
        {selectedClip ? (
          <span className="text-[10px] text-cinema-ai truncate max-w-[130px] font-mono">
            {selectedClip.name}
          </span>
        ) : selectedGap ? (
          <span className="text-[10px] text-amber-400 truncate max-w-[130px] font-mono">
            Gap ({Math.round(selectedGap.durationMs)}ms)
          </span>
        ) : selectedTrack ? (
          <span className="text-[10px] text-cinema-ai truncate max-w-[130px] font-mono">
            {selectedTrack.name}
          </span>
        ) : (
          <span className="text-[10px] text-cinema-textDim">No selection</span>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center border-b border-cinema-border overflow-x-auto bg-cinema-900 scrollbar-none flex-shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeInspectorTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveInspectorTab(tab.id)}
              title={tab.label}
              className={`flex-1 py-1.5 md:py-2 px-1 flex flex-col items-center gap-0.5 md:gap-1 border-b-2 transition-colors min-w-[36px] ${
                isActive
                  ? 'border-cinema-red text-white bg-cinema-800'
                  : 'border-transparent text-cinema-textDim hover:text-cinema-text hover:bg-cinema-850'
              }`}
            >
              <Icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${isActive ? 'text-cinema-red' : ''}`} />
              <span className="text-[8px] md:text-[9px] font-medium truncate hidden sm:block">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Inspector Content Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4">

        {/* Phase 35: Multi-Clip Compound Action Bar (if multiple clips selected) */}
        {selectedClipIds.size >= 2 && (
          <div className="p-3 bg-indigo-950/60 rounded-lg border border-indigo-500/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-200 text-[11px]">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Multi-Clip Actions</span>
              </div>
              <span className="text-[10px] text-indigo-300 font-mono">
                {selectedClipIds.size} clips selected
              </span>
            </div>
            <button
              type="button"
              id="inspector-create-compound-btn"
              data-testid="inspector-create-compound-btn"
              onClick={() => {
                const newId = createCompoundClip();
                if (newId) showNotification('Compound clip created', 'success');
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition-colors shadow-sm"
              title="Create Compound Clip (Ctrl+G)"
            >
              <Layers className="w-3 h-3 text-white" />
              <span>Create Compound Clip ({selectedClipIds.size})</span>
            </button>
          </div>
        )}

        {/* Phase 35: Compound Clip Section (if selected clip is a compound clip) */}
        {selectedClip && selectedClip.is_compound && (
          <div
            id="compound-clip-section"
            data-testid="compound-clip-section"
            className="p-3 bg-indigo-950/60 rounded-lg border border-indigo-500/60 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-200 text-[11px]">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Compound Clip</span>
              </div>
              <span
                id="compound-clip-status-badge"
                data-testid="compound-clip-status-badge"
                className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 font-mono"
              >
                Nested
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-cinema-950/80 p-2 rounded border border-indigo-900/40 font-mono">
              <div>
                <span className="text-cinema-textDim text-[10px] block">Duration</span>
                <span className="text-indigo-200">{formatTimecode(selectedClip.duration_ms)}</span>
              </div>
              <div>
                <span className="text-cinema-textDim text-[10px] block">Nested Elements</span>
                <span className="text-indigo-200">
                  {selectedClip.nested_tracks?.length ?? 0} tracks, {selectedClip.nested_tracks?.flatMap((t) => t.clips).length ?? 0} clips
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-indigo-900/40">
              <button
                type="button"
                id="inspector-open-compound-btn"
                data-testid="inspector-open-compound-btn"
                onClick={() => {
                  openCompoundClip(selectedClip.id);
                  showNotification(`Opened ${selectedClip.name}`, 'info');
                }}
                className="flex-1 py-1.5 rounded border border-indigo-500 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Layers className="w-3 h-3" />
                <span>Open Nested Timeline</span>
              </button>
              <button
                type="button"
                id="inspector-ungroup-compound-btn"
                data-testid="inspector-ungroup-compound-btn"
                onClick={() => {
                  const ok = ungroupCompoundClip(selectedClip.id);
                  if (ok) showNotification('Compound clip ungrouped', 'info');
                }}
                className="py-1.5 px-3 rounded border border-indigo-800 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 hover:text-white text-[11px] font-medium transition-colors"
                title="Ungroup Compound Clip (Ctrl+Shift+G)"
              >
                Ungroup
              </button>
            </div>
          </div>
        )}

        {/* Phase 42: Clip Grouping & Audio-Video Linking Section */}
        {selectedClip && (selectedClip.group_id || selectedClip.linked_clip_id || selectedClipIds.size >= 2) && (
          <div
            id="inspector-group-link-section"
            data-testid="inspector-group-link-section"
            className="p-3 bg-purple-950/40 rounded-lg border border-purple-500/40 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-purple-200 text-[11px]">
                <FolderPlus className="w-3.5 h-3.5 text-purple-400" />
                <span>Group & Link Status</span>
              </div>
              <div className="flex items-center gap-1">
                {selectedClip.group_id && (
                  <span
                    id="inspector-group-badge"
                    data-testid="inspector-group-badge"
                    className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 border border-purple-500/50 font-mono"
                  >
                    Grouped
                  </span>
                )}
                {selectedClip.linked_clip_id && (
                  <span
                    id="inspector-link-badge"
                    data-testid="inspector-link-badge"
                    className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-300 border border-sky-500/50 font-mono"
                  >
                    Linked
                  </span>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="text-[11px] bg-cinema-950/80 p-2 rounded border border-purple-900/40 font-mono space-y-1">
              {selectedClip.group_id && (
                <div className="flex justify-between">
                  <span className="text-cinema-textDim text-[10px]">Group ID:</span>
                  <span className="text-purple-300">{selectedClip.group_id.slice(0, 8)}...</span>
                </div>
              )}
              {selectedClip.linked_clip_id && (
                <div className="flex justify-between">
                  <span className="text-cinema-textDim text-[10px]">Linked Clip:</span>
                  <span className="text-sky-300">{selectedClip.linked_clip_id.slice(0, 8)}...</span>
                </div>
              )}
              {selectedClip.linked_clip_id && (() => {
                const partner = timeline?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClip.linked_clip_id);
                if (!partner) return null;
                const drift = selectedClip.start_time_ms - partner.start_time_ms;
                return (
                  <div className="flex justify-between items-center pt-1 border-t border-purple-900/40">
                    <span className="text-cinema-textDim text-[10px]">Sync Status:</span>
                    <span className={`text-[10px] font-bold ${drift === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {drift === 0 ? 'In-Sync (0ms)' : `Drift: ${drift > 0 ? '+' : ''}${Math.round(drift)}ms`}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-purple-900/40">
              {selectedClipIds.size >= 2 && !selectedClip.group_id && (
                <button
                  type="button"
                  id="inspector-group-btn"
                  data-testid="inspector-group-btn"
                  onClick={() => {
                    const gId = groupSelectedClips();
                    if (gId) showNotification('Clips grouped', 'success');
                  }}
                  className="py-1 px-2 rounded border border-purple-600 bg-purple-900/60 hover:bg-purple-800 text-purple-200 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <FolderPlus className="w-3 h-3" /> Group Clips
                </button>
              )}
              {selectedClip.group_id && (
                <button
                  type="button"
                  id="inspector-ungroup-btn"
                  data-testid="inspector-ungroup-btn"
                  onClick={() => {
                    const ok = ungroupSelectedClips();
                    if (ok) showNotification('Clips ungrouped', 'info');
                  }}
                  className="py-1 px-2 rounded border border-purple-700 bg-purple-950 hover:bg-purple-900 text-purple-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <FolderMinus className="w-3 h-3" /> Ungroup
                </button>
              )}
              {selectedClipIds.size === 2 && !selectedClip.linked_clip_id && (
                <button
                  type="button"
                  id="inspector-link-btn"
                  data-testid="inspector-link-btn"
                  onClick={() => {
                    const ok = linkSelectedClips();
                    if (ok) showNotification('Clips linked', 'success');
                  }}
                  className="py-1 px-2 rounded border border-sky-600 bg-sky-900/60 hover:bg-sky-800 text-sky-200 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <Link className="w-3 h-3" /> Link Clips
                </button>
              )}
              {selectedClip.linked_clip_id && (
                <button
                  type="button"
                  id="inspector-unlink-btn"
                  data-testid="inspector-unlink-btn"
                  onClick={() => {
                    const ok = unlinkSelectedClips();
                    if (ok) showNotification('Clips unlinked', 'info');
                  }}
                  className="py-1 px-2 rounded border border-sky-700 bg-sky-950 hover:bg-sky-900 text-sky-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <Unlink className="w-3 h-3" /> Unlink
                </button>
              )}
              {selectedClip.linked_clip_id && (() => {
                const partner = timeline?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClip.linked_clip_id);
                if (!partner || partner.start_time_ms === selectedClip.start_time_ms) return null;
                return (
                  <button
                    type="button"
                    id="inspector-realign-sync-btn"
                    data-testid="inspector-realign-sync-btn"
                    onClick={() => {
                      const ok = realignLinkedClip(selectedClip.id);
                      if (ok) showNotification('Realigned with linked partner', 'success');
                    }}
                    className="col-span-2 py-1 px-2 rounded border border-emerald-600 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    Re-align In-Sync
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {/* Quick Clip Actions */}
        {selectedClip && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="inspector-ripple-delete-btn"
              data-testid="inspector-ripple-delete-btn"
              onClick={() => {
                if (selectedClipIds.size > 1) {
                  rippleDeleteSelectedClips();
                  showNotification(`Ripple deleted ${selectedClipIds.size} clips`, 'info');
                } else if (selectedClip) {
                  rippleDelete(selectedClip.id);
                  showNotification('Ripple deleted clip', 'info');
                }
              }}
              className="flex-1 py-1.5 px-2 bg-amber-950/70 hover:bg-amber-900 border border-amber-600/70 text-amber-300 hover:text-white rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Ripple Delete Clip (Shift+Delete)"
            >
              <CornerDownLeft className="w-3 h-3 text-amber-400" />
              <span>Ripple Delete</span>
            </button>
            <button
              type="button"
              id="inspector-delete-clip-btn"
              data-testid="inspector-delete-clip-btn"
              onClick={() => {
                if (selectedClipIds.size > 1) {
                  deleteSelectedClips();
                  showNotification(`Deleted ${selectedClipIds.size} clips`, 'info');
                } else if (selectedClip) {
                  deleteClip(selectedClip.id);
                  showNotification('Deleted clip', 'info');
                }
              }}
              className="py-1.5 px-3 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 hover:text-white rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Delete Clip (Delete)"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
              <span>Delete</span>
            </button>
          </div>
        )}

        {/* Phase 38: Slip & Slide Editing Inspector Section */}
        {selectedClip && (
          <div
            id="inspector-slip-slide-section"
            data-testid="inspector-slip-slide-section"
            className="p-3 bg-cinema-900/90 rounded-lg border border-cinema-border space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Slip & Slide Editing</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="inspector-tool-slip-btn"
                  data-testid="inspector-tool-slip-btn"
                  onClick={() => setActiveTimelineTool('slip')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    activeTimelineTool === 'slip'
                      ? 'bg-amber-400 text-cinema-void font-bold shadow-sm'
                      : 'bg-cinema-850 text-cinema-textDim hover:text-white border border-cinema-border'
                  }`}
                  title="Activate Slip Tool (Y)"
                >
                  Slip
                </button>
                <button
                  type="button"
                  id="inspector-tool-slide-btn"
                  data-testid="inspector-tool-slide-btn"
                  onClick={() => setActiveTimelineTool('slide')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    activeTimelineTool === 'slide'
                      ? 'bg-cyan-400 text-cinema-void font-bold shadow-sm'
                      : 'bg-cinema-850 text-cinema-textDim hover:text-white border border-cinema-border'
                  }`}
                  title="Activate Slide Tool (U)"
                >
                  Slide
                </button>
              </div>
            </div>

            {/* Timeline Timing Overview */}
            <div className="grid grid-cols-2 gap-2 text-[10px] bg-cinema-950 p-2 rounded border border-cinema-border/50 font-mono">
              <div>
                <span className="text-cinema-textDim block">Timeline Start</span>
                <span className="text-white font-medium">{formatTimecode(selectedClip.start_time_ms)}</span>
              </div>
              <div>
                <span className="text-cinema-textDim block">Duration</span>
                <span className="text-white font-medium">{formatTimecode(selectedClip.duration_ms)}</span>
              </div>
            </div>

            {/* Source In / Out Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <label className="text-cinema-textDim">Source In / Out</label>
                <span className="text-[10px] font-mono text-cinema-ai">
                  Window: {formatTimecode(selectedClip.source_out_ms - selectedClip.source_in_ms)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-cinema-textDim block">In (ms)</span>
                  <input
                    type="number"
                    id="inspector-source-in"
                    data-testid="inspector-source-in"
                    value={selectedClip.source_in_ms}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        slipClip(selectedClip.id, val - selectedClip.source_in_ms);
                      }
                    }}
                    className="w-full bg-cinema-950 border border-cinema-border rounded px-2 py-1 text-xs text-white font-mono focus:border-amber-400 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-cinema-textDim block">Out (ms)</span>
                  <input
                    type="number"
                    id="inspector-source-out"
                    data-testid="inspector-source-out"
                    value={selectedClip.source_out_ms}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        slipClip(selectedClip.id, val - selectedClip.source_out_ms);
                      }
                    }}
                    className="w-full bg-cinema-950 border border-cinema-border rounded px-2 py-1 text-xs text-white font-mono focus:border-amber-400 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Nudge Controls */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cinema-border/50">
              {/* Slip Nudge */}
              <div className="space-y-1">
                <span className="text-[10px] text-amber-300 font-medium block">Slip Window</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    id="inspector-slip-left-btn"
                    data-testid="inspector-slip-left-btn"
                    onClick={() => slipClip(selectedClip.id, -100)}
                    className="flex-1 py-1 rounded bg-cinema-850 hover:bg-cinema-800 border border-amber-500/40 text-amber-300 hover:text-white text-[11px] font-mono transition-colors"
                    title="Slip source left by 100ms"
                  >
                    -100ms
                  </button>
                  <button
                    type="button"
                    id="inspector-slip-right-btn"
                    data-testid="inspector-slip-right-btn"
                    onClick={() => slipClip(selectedClip.id, 100)}
                    className="flex-1 py-1 rounded bg-cinema-850 hover:bg-cinema-800 border border-amber-500/40 text-amber-300 hover:text-white text-[11px] font-mono transition-colors"
                    title="Slip source right by 100ms"
                  >
                    +100ms
                  </button>
                </div>
              </div>

              {/* Slide Nudge */}
              <div className="space-y-1">
                <span className="text-[10px] text-cyan-300 font-medium block">Slide Clip</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    id="inspector-slide-left-btn"
                    data-testid="inspector-slide-left-btn"
                    onClick={() => slideClip(selectedClip.id, -100)}
                    className="flex-1 py-1 rounded bg-cinema-850 hover:bg-cinema-800 border border-cyan-500/40 text-cyan-300 hover:text-white text-[11px] font-mono transition-colors"
                    title="Slide clip left by 100ms"
                  >
                    -100ms
                  </button>
                  <button
                    type="button"
                    id="inspector-slide-right-btn"
                    data-testid="inspector-slide-right-btn"
                    onClick={() => slideClip(selectedClip.id, 100)}
                    className="flex-1 py-1 rounded bg-cinema-850 hover:bg-cinema-800 border border-cyan-500/40 text-cyan-300 hover:text-white text-[11px] font-mono transition-colors"
                    title="Slide clip right by 100ms"
                  >
                    +100ms
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 39: Rolling Edit Tool Inspector Section */}
        {selectedClip && (
          <div
            id="inspector-roll-edit-section"
            data-testid="inspector-roll-edit-section"
            className="p-3 bg-cinema-900/90 rounded-lg border border-cinema-border space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
                <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span>Rolling Edit</span>
              </div>
              <button
                type="button"
                id="inspector-tool-roll-btn"
                data-testid="inspector-tool-roll-btn"
                onClick={() => setActiveTimelineTool('roll')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  activeTimelineTool === 'roll'
                    ? 'bg-emerald-400 text-cinema-void font-bold shadow-sm'
                    : 'bg-cinema-850 text-cinema-textDim hover:text-white border border-cinema-border'
                }`}
                title="Activate Roll Tool (N)"
              >
                Roll (N)
              </button>
            </div>

            {rollPair ? (
              <>
                {/* Outgoing & Incoming Clips Overview */}
                <div className="grid grid-cols-2 gap-2 text-[10px] bg-cinema-950 p-2 rounded border border-cinema-border/50 font-mono">
                  <div>
                    <span className="text-cinema-textDim block">Outgoing (A)</span>
                    <span id="inspector-roll-outgoing-name" data-testid="inspector-roll-outgoing-name" className="text-emerald-300 font-medium truncate block">
                      {rollPair.pred.name}
                    </span>
                    <span className="text-[9px] text-cinema-textDim/70 block">
                      Tail: {formatTimecode(rollPair.pred.source_out_ms)}
                    </span>
                  </div>
                  <div>
                    <span className="text-cinema-textDim block">Incoming (B)</span>
                    <span id="inspector-roll-incoming-name" data-testid="inspector-roll-incoming-name" className="text-emerald-300 font-medium truncate block">
                      {rollPair.succ.name}
                    </span>
                    <span className="text-[9px] text-cinema-textDim/70 block">
                      Head: {formatTimecode(rollPair.succ.source_in_ms)}
                    </span>
                  </div>
                </div>

                {/* Common Edit Cut Point */}
                <div className="flex items-center justify-between px-2 py-1.5 bg-cinema-950/80 rounded border border-cinema-border/40 text-[10px] font-mono">
                  <span className="text-cinema-textDim">Cut Point:</span>
                  <span id="inspector-roll-cut-point" data-testid="inspector-roll-cut-point" className="text-emerald-400 font-bold">
                    {formatTimecode(rollPair.cutMs)}
                  </span>
                </div>

                {/* Nudge Controls */}
                <div className="space-y-1 pt-1 border-t border-cinema-border/50">
                  <span className="text-[10px] text-emerald-300 font-medium block">Nudge Cut Point</span>
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      type="button"
                      id="inspector-roll-left-1s-btn"
                      data-testid="inspector-roll-left-1s-btn"
                      onClick={() => rollEdit(rollPair.pred.id, rollPair.succ.id, -1000)}
                      className="py-1 rounded bg-cinema-850 hover:bg-cinema-800 border border-emerald-500/40 text-emerald-300 hover:text-white text-[10px] font-mono transition-colors"
                      title="Roll cut left by 1s"
                    >
                      -1s
                    </button>
                    <button
                      type="button"
                      id="inspector-roll-left-btn"
                      data-testid="inspector-roll-left-btn"
                      onClick={() => rollEdit(rollPair.pred.id, rollPair.succ.id, -100)}
                      className="py-1 rounded bg-cinema-850 hover:bg-cinema-800 border border-emerald-500/40 text-emerald-300 hover:text-white text-[10px] font-mono transition-colors"
                      title="Roll cut left by 100ms"
                    >
                      -100ms
                    </button>
                    <button
                      type="button"
                      id="inspector-roll-right-btn"
                      data-testid="inspector-roll-right-btn"
                      onClick={() => rollEdit(rollPair.pred.id, rollPair.succ.id, 100)}
                      className="py-1 rounded bg-cinema-850 hover:bg-cinema-800 border border-emerald-500/40 text-emerald-300 hover:text-white text-[10px] font-mono transition-colors"
                      title="Roll cut right by 100ms"
                    >
                      +100ms
                    </button>
                    <button
                      type="button"
                      id="inspector-roll-right-1s-btn"
                      data-testid="inspector-roll-right-1s-btn"
                      onClick={() => rollEdit(rollPair.pred.id, rollPair.succ.id, 1000)}
                      className="py-1 rounded bg-cinema-850 hover:bg-cinema-800 border border-emerald-500/40 text-emerald-300 hover:text-white text-[10px] font-mono transition-colors"
                      title="Roll cut right by 1s"
                    >
                      +1s
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-[10px] text-cinema-textDim bg-cinema-950 p-2 rounded border border-cinema-border/40 italic">
                No touching adjacent clip found on this track. Position clips adjacent to roll their shared cut point.
              </div>
            )}
          </div>
        )}

        {/* Phase 36: Marker System Inspector Section */}
        <div
          id="marker-inspector-section"
          data-testid="marker-inspector-section"
          className="p-3 bg-cinema-900/90 rounded-lg border border-cinema-border space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
              <Bookmark className="w-3.5 h-3.5 text-blue-400" />
              <span>Markers & Annotations</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                id="inspector-add-marker-btn"
                data-testid="inspector-add-marker-btn"
                onClick={() => {
                  addTimelineMarker(playheadMs);
                  showNotification('Timeline marker added', 'info');
                }}
                className="px-2 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-700/60 hover:bg-blue-900 hover:text-white transition-colors"
                title="Add Sequence Marker at Playhead"
              >
                + Sequence
              </button>
              {selectedClip && (
                <button
                  type="button"
                  id="inspector-add-clip-marker-btn"
                  data-testid="inspector-add-clip-marker-btn"
                  onClick={() => {
                    addClipMarker(selectedClip.id);
                    showNotification('Clip marker added', 'info');
                  }}
                  className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-700/60 hover:bg-cyan-900 hover:text-white transition-colors"
                  title="Add Clip Marker at Playhead"
                >
                  + Clip
                </button>
              )}
            </div>
          </div>

          {/* Sequence Markers List */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-cinema-textDim">
              <span>Sequence Markers ({timeline?.markers?.length || 0})</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="inspector-prev-marker-btn"
                  data-testid="inspector-prev-marker-btn"
                  onClick={() => goToPrevMarker()}
                  className="hover:text-white transition-colors text-[10px]"
                  title="Go to previous marker"
                >
                  Prev
                </button>
                <span>•</span>
                <button
                  type="button"
                  id="inspector-next-marker-btn"
                  data-testid="inspector-next-marker-btn"
                  onClick={() => goToNextMarker()}
                  className="hover:text-white transition-colors text-[10px]"
                  title="Go to next marker"
                >
                  Next
                </button>
              </div>
            </div>

            {Array.isArray(timeline?.markers) && timeline.markers.length > 0 ? (
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {timeline.markers.map((m) => {
                  const style = MARKER_COLOR_MAP[m.color] || MARKER_COLOR_MAP.blue;
                  return (
                    <div
                      key={m.id}
                      id={`inspector-marker-row-${m.id}`}
                      data-testid={`inspector-marker-row-${m.id}`}
                      className="flex items-center justify-between bg-cinema-850 p-1.5 rounded border border-cinema-border/50 text-[11px] group"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: style.bg }}
                        />
                        <button
                          type="button"
                          onClick={() => setPlayhead(m.time_ms)}
                          className="text-cinema-text hover:text-white truncate font-medium text-left"
                          title="Click to seek"
                        >
                          {m.name}
                        </button>
                        {m.comment && (
                          <span className="text-[10px] text-cinema-textDim truncate max-w-[80px]">
                            ({m.comment})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] font-mono text-cinema-textDim">
                          {formatTimecode(m.time_ms)}
                        </span>
                        <button
                          type="button"
                          id={`inspector-delete-marker-${m.id}`}
                          data-testid={`inspector-delete-marker-${m.id}`}
                          onClick={() => deleteMarker(m.id)}
                          className="text-cinema-textDim hover:text-red-400 p-0.5 rounded transition-colors"
                          title="Delete marker"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10px] text-cinema-textDim/60 italic py-1">No sequence markers</p>
            )}
          </div>

          {/* Clip Markers List (if a clip is selected) */}
          {selectedClip && (
            <div className="space-y-1.5 pt-2 border-t border-cinema-border/40">
              <span className="text-[10px] text-cinema-textDim block">
                Clip Markers ({selectedClip.markers?.length || 0})
              </span>
              {Array.isArray(selectedClip.markers) && selectedClip.markers.length > 0 ? (
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {selectedClip.markers.map((cm) => {
                    const style = MARKER_COLOR_MAP[cm.color] || MARKER_COLOR_MAP.blue;
                    const absTime = selectedClip.start_time_ms + cm.time_ms;
                    return (
                      <div
                        key={cm.id}
                        id={`inspector-clip-marker-row-${cm.id}`}
                        data-testid={`inspector-clip-marker-row-${cm.id}`}
                        className="flex items-center justify-between bg-cinema-850 p-1.5 rounded border border-cinema-border/50 text-[11px] group"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: style.bg }}
                          />
                          <button
                            type="button"
                            onClick={() => setPlayhead(absTime)}
                            className="text-cyan-200 hover:text-white truncate font-medium text-left"
                            title="Click to seek"
                          >
                            {cm.name}
                          </button>
                          {cm.comment && (
                            <span className="text-[10px] text-cinema-textDim truncate max-w-[80px]">
                              ({cm.comment})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] font-mono text-cinema-textDim">
                            +{formatTimecode(cm.time_ms)}
                          </span>
                          <button
                            type="button"
                            id={`inspector-delete-clip-marker-${cm.id}`}
                            data-testid={`inspector-delete-clip-marker-${cm.id}`}
                            onClick={() => deleteMarker(cm.id, selectedClip.id)}
                            className="text-cinema-textDim hover:text-red-400 p-0.5 rounded transition-colors"
                            title="Delete clip marker"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-cinema-textDim/60 italic py-1">No markers on selected clip</p>
              )}
            </div>
          )}
        </div>

        {/* ─── Phase 37: Track Management Inspector ─── */}
        {!selectedClip && selectedClipIds.size < 2 && selectedTrack && (
          <div
            id="track-inspector-section"
            data-testid="track-inspector-section"
            className="p-3 bg-cinema-900/90 rounded-lg border border-cinema-border space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
                {selectedTrack.track_type === 'video' ? (
                  <Video className="w-3.5 h-3.5 text-cinema-red" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-cinema-gold" />
                )}
                <span>Track Inspector</span>
              </div>
              <span
                id="inspector-track-type-badge"
                data-testid="inspector-track-type-badge"
                className="text-[9px] px-1.5 py-0.5 rounded bg-cinema-800 text-cinema-textDim border border-cinema-border font-mono uppercase"
              >
                {selectedTrack.track_type} ({selectedTrack.track_role})
              </span>
            </div>

            {/* Track Name */}
            <div className="space-y-1">
              <label className="text-[10px] text-cinema-textDim block">Track Name</label>
              <input
                type="text"
                id="inspector-track-name"
                data-testid="inspector-track-name"
                value={selectedTrack.name}
                onChange={(e) => renameTrack(selectedTrack.id, e.target.value)}
                className="w-full bg-cinema-950 border border-cinema-border rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cinema-accent font-medium"
              />
            </div>

            {/* Track Toggles Grid */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {/* Lock Toggle */}
              <button
                type="button"
                id="inspector-track-lock"
                data-testid="inspector-track-lock"
                onClick={() => {
                  toggleTrackLock(selectedTrack.id);
                  showNotification(`Track ${selectedTrack.is_locked ? 'unlocked' : 'locked'}`, 'info');
                }}
                className={`py-1.5 px-2 rounded border text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  selectedTrack.is_locked
                    ? 'bg-amber-950 border-amber-600 text-amber-300'
                    : 'bg-cinema-850 border-cinema-border text-cinema-text hover:text-white'
                }`}
                title={selectedTrack.is_locked ? 'Unlock Track' : 'Lock Track'}
              >
                {selectedTrack.is_locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{selectedTrack.is_locked ? 'Locked' : 'Unlocked'}</span>
              </button>

              {/* Visibility Toggle */}
              <button
                type="button"
                id="inspector-track-visibility"
                data-testid="inspector-track-visibility"
                onClick={() => {
                  toggleTrackVisibility(selectedTrack.id);
                  showNotification(`Track ${selectedTrack.is_visible ? 'hidden' : 'visible'}`, 'info');
                }}
                className={`py-1.5 px-2 rounded border text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  !selectedTrack.is_visible
                    ? 'bg-red-950/80 border-red-700 text-red-300'
                    : 'bg-cinema-850 border-cinema-border text-cinema-text hover:text-white'
                }`}
                title={selectedTrack.is_visible ? 'Hide Track' : 'Show Track'}
              >
                {selectedTrack.is_visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>{selectedTrack.is_visible ? 'Visible' : 'Hidden'}</span>
              </button>

              {/* Mute Toggle */}
              <button
                type="button"
                id="inspector-track-mute"
                data-testid="inspector-track-mute"
                onClick={() => {
                  toggleTrackMute(selectedTrack.id);
                  showNotification(`Track ${selectedTrack.is_muted ? 'unmuted' : 'muted'}`, 'info');
                }}
                className={`py-1.5 px-2 rounded border text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  selectedTrack.is_muted
                    ? 'bg-red-950/80 border-red-700 text-red-300'
                    : 'bg-cinema-850 border-cinema-border text-cinema-text hover:text-white'
                }`}
                title={selectedTrack.is_muted ? 'Unmute Track' : 'Mute Track'}
              >
                {selectedTrack.is_muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                <span>{selectedTrack.is_muted ? 'Muted' : 'Unmuted'}</span>
              </button>

              {/* Solo Toggle */}
              <button
                type="button"
                id="inspector-track-solo"
                data-testid="inspector-track-solo"
                onClick={() => {
                  toggleTrackSolo(selectedTrack.id);
                  showNotification(`Track Solo ${selectedTrack.is_solo ? 'off' : 'on'}`, 'info');
                }}
                className={`py-1.5 px-2 rounded border text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  selectedTrack.is_solo
                    ? 'bg-yellow-950 border-yellow-500 text-yellow-300'
                    : 'bg-cinema-850 border-cinema-border text-cinema-text hover:text-white'
                }`}
                title={selectedTrack.is_solo ? 'Disable Solo' : 'Solo Track'}
              >
                <Headphones className="w-3 h-3" />
                <span>{selectedTrack.is_solo ? 'Solo (On)' : 'Solo (Off)'}</span>
              </button>
            </div>

            {/* Volume & Pan Controls */}
            <div className="space-y-2 pt-2 border-t border-cinema-border/50">
              <div>
                <div className="flex justify-between items-center text-[11px] text-cinema-text mb-1">
                  <span>Track Volume</span>
                  <span className="font-mono text-cinema-ai">
                    {(selectedTrack.volume_db ?? 0) > 0 ? `+${(selectedTrack.volume_db ?? 0).toFixed(1)}` : (selectedTrack.volume_db ?? 0).toFixed(1)} dB
                  </span>
                </div>
                <input
                  type="range"
                  id="inspector-track-volume"
                  data-testid="inspector-track-volume"
                  min={-60}
                  max={12}
                  step={0.5}
                  value={selectedTrack.volume_db ?? 0}
                  onChange={(e) => setTrackVolume(selectedTrack.id, parseFloat(e.target.value))}
                  className="w-full accent-cinema-gold"
                />
              </div>

              <div>
                <div className="flex justify-between items-center text-[11px] text-cinema-text mb-1">
                  <span>Track Pan</span>
                  <span className="font-mono text-cinema-ai">
                    {(selectedTrack.pan ?? 0) === 0 ? 'C' : (selectedTrack.pan ?? 0) < 0 ? `L ${Math.round(Math.abs(selectedTrack.pan ?? 0) * 100)}%` : `R ${Math.round((selectedTrack.pan ?? 0) * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  id="inspector-track-pan"
                  data-testid="inspector-track-pan"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={selectedTrack.pan ?? 0}
                  onChange={(e) => setTrackPan(selectedTrack.id, parseFloat(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>

            {/* Reorder and Delete Actions */}
            <div className="space-y-1.5 pt-2 border-t border-cinema-border/50">
              <span className="text-[10px] text-cinema-textDim block">Track Ordering & Management</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="inspector-track-move-up"
                  data-testid="inspector-track-move-up"
                  onClick={() => reorderTrack(selectedTrack.id, 'up')}
                  className="py-1 px-2 rounded border border-cinema-border bg-cinema-850 hover:bg-cinema-800 text-cinema-text hover:text-white text-[11px] flex items-center justify-center gap-1 transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Move Up</span>
                </button>
                <button
                  type="button"
                  id="inspector-track-move-down"
                  data-testid="inspector-track-move-down"
                  onClick={() => reorderTrack(selectedTrack.id, 'down')}
                  className="py-1 px-2 rounded border border-cinema-border bg-cinema-850 hover:bg-cinema-800 text-cinema-text hover:text-white text-[11px] flex items-center justify-center gap-1 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Move Down</span>
                </button>
              </div>

              <button
                type="button"
                id="inspector-track-delete"
                data-testid="inspector-track-delete"
                onClick={() => {
                  deleteTrack(selectedTrack.id);
                  showNotification(`Track ${selectedTrack.name} deleted`, 'info');
                }}
                className="w-full mt-2 py-1.5 px-3 rounded border border-red-900 bg-red-950/60 hover:bg-red-900/80 text-red-300 hover:text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Track</span>
              </button>
            </div>

            {/* Track Info */}
            <div className="text-[10px] text-cinema-textDim/70 font-mono bg-cinema-950/50 p-2 rounded border border-cinema-border/30 space-y-0.5">
              <div>Clips count: {selectedTrack.clips.length}</div>
              <div>Order index: {selectedTrack.order_index}</div>
              <div className="truncate">Track ID: {selectedTrack.id}</div>
            </div>
          </div>
        )}

        {/* ─── Phase 40: Gap Management Inspector ─── */}
        {!selectedClip && selectedClipIds.size < 2 && selectedGap && (
          <div
            id="inspector-gap-section"
            data-testid="inspector-gap-section"
            className="p-3 bg-cinema-900/90 rounded-lg border border-amber-500/50 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300 text-[11px]">
                <CornerDownLeft className="w-3.5 h-3.5 text-amber-400" />
                <span>Gap Management</span>
              </div>
              <span
                id="inspector-gap-status-badge"
                data-testid="inspector-gap-status-badge"
                className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono uppercase"
              >
                Track Gap
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-cinema-950/80 p-2.5 rounded border border-cinema-border/50 font-mono">
              <div>
                <span className="text-cinema-textDim text-[10px] block">Start Time</span>
                <span id="inspector-gap-start" data-testid="inspector-gap-start" className="text-amber-200">
                  {formatTimecode(selectedGap.startMs)} ({Math.round(selectedGap.startMs)}ms)
                </span>
              </div>
              <div>
                <span className="text-cinema-textDim text-[10px] block">Duration</span>
                <span id="inspector-gap-duration" data-testid="inspector-gap-duration" className="text-amber-200">
                  {formatTimecode(selectedGap.durationMs)} ({Math.round(selectedGap.durationMs)}ms)
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-cinema-border/30">
                <span className="text-cinema-textDim text-[10px] block">End Time</span>
                <span id="inspector-gap-end" data-testid="inspector-gap-end" className="text-cinema-text">
                  {formatTimecode(selectedGap.startMs + selectedGap.durationMs)} ({Math.round(selectedGap.startMs + selectedGap.durationMs)}ms)
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                id="inspector-close-gap-btn"
                data-testid="inspector-close-gap-btn"
                onClick={() => {
                  const ok = deleteGap(selectedGap.trackId, selectedGap.startMs, 'track');
                  if (ok) {
                    showNotification('Gap closed (track)', 'success');
                  } else {
                    showNotification('Track is locked or gap could not be closed', 'warning');
                  }
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                title="Ripple delete gap on this track"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>Close Gap (Track)</span>
              </button>

              <button
                type="button"
                id="inspector-close-gap-all-btn"
                data-testid="inspector-close-gap-all-btn"
                onClick={() => {
                  const ok = deleteGap(selectedGap.trackId, selectedGap.startMs, 'all');
                  if (ok) {
                    showNotification('Gap closed across all tracks', 'success');
                  } else {
                    showNotification('Tracks locked or gap could not be closed', 'warning');
                  }
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border text-cinema-text hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                title="Ripple delete gap across all tracks"
              >
                <CornerDownLeft className="w-3 h-3 text-amber-400" />
                <span>Close Gap (All Tracks)</span>
              </button>

              <button
                type="button"
                id="inspector-deselect-gap-btn"
                data-testid="inspector-deselect-gap-btn"
                onClick={() => setSelectedGap(null)}
                className="w-full py-1 text-cinema-textDim hover:text-white text-[10px] text-center transition-colors"
              >
                Deselect Gap
              </button>
            </div>
          </div>
        )}

        {/* ─── No clip, track, or gap selected fallback ─── */}
        {!selectedClip && selectedClipIds.size < 2 && !selectedTrack && !selectedGap && (
          <div className="text-center py-8 text-cinema-textDim space-y-2">
            <Sliders className="w-8 h-8 mx-auto opacity-20" />
            <p className="font-semibold text-white text-xs">No Selection</p>
            <p className="text-[11px]">Select a clip, gap, or track header in the timeline to edit properties.</p>
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                id="inspector-razor-tool-btn"
                data-testid="inspector-razor-tool-btn"
                onClick={() => {
                  const nextTool = activeTimelineTool === 'razor' ? 'select' : 'razor';
                  setActiveTimelineTool(nextTool);
                  showNotification(`Razor Tool ${nextTool === 'razor' ? 'activated' : 'deactivated'}`, 'info');
                }}
                className={`flex items-center gap-1.5 py-1.5 px-3 border rounded text-[11px] font-medium transition-colors ${
                  activeTimelineTool === 'razor'
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500 font-bold shadow-sm'
                    : 'bg-cinema-850 hover:bg-cinema-800 text-cinema-text hover:text-white border-cinema-border'
                }`}
                title="Activate Razor / Blade Tool (C) — click on clip to cut at cursor"
              >
                <Scissors className="w-3 h-3 text-rose-400" />
                <span>{activeTimelineTool === 'razor' ? 'Razor Active (Click to Cut)' : 'Razor Tool (C)'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ─── TAB: TRANSFORM ─── */}
        {activeInspectorTab === 'transform' && selectedClip && (() => {
          const clipOffsetMs = Math.max(0, Math.min(selectedClip.duration_ms, playheadMs - selectedClip.start_time_ms));

          const getKeyframeAtPlayhead = (prop: string) => {
            if (!selectedClip?.keyframes) return undefined;
            return selectedClip.keyframes.find(
              (k) => k.property_path === prop && Math.abs(k.time_offset_ms - clipOffsetMs) <= 60
            );
          };

          const hasKeyframesForProp = (prop: string) => {
            if (!selectedClip?.keyframes) return false;
            return selectedClip.keyframes.some((k) => k.property_path === prop);
          };

          const toggleKeyframe = (prop: string, defaultVal: number) => {
            if (!selectedClip) return;
            const existingKf = getKeyframeAtPlayhead(prop);
            if (existingKf && existingKf.id) {
              deleteKeyframe(selectedClip.id, existingKf.id);
            } else {
              const currentVal = evaluateClipProperty(selectedClip, prop, clipOffsetMs, defaultVal);
              addKeyframe(selectedClip.id, {
                property_path: prop,
                time_offset_ms: clipOffsetMs,
                value: Math.round(currentVal * 10000) / 10000,
                interpolation: 'linear',
              });
            }
          };

          const handlePropertyChange = (prop: string, newVal: number, defaultVal: number) => {
            if (!selectedClip) return;
            const existingKf = getKeyframeAtPlayhead(prop);
            if (existingKf && existingKf.id) {
              updateKeyframeValue(selectedClip.id, existingKf.id, newVal);
            } else if (hasKeyframesForProp(prop)) {
              addKeyframe(selectedClip.id, {
                property_path: prop,
                time_offset_ms: clipOffsetMs,
                value: newVal,
                interpolation: 'linear',
              });
            } else {
              update((c) => {
                (c as any)[prop] = newVal;
              });
            }
          };

          const curPosX = evaluateClipProperty(selectedClip, 'position_x', clipOffsetMs, selectedClip.position_x ?? 0.5);
          const curPosY = evaluateClipProperty(selectedClip, 'position_y', clipOffsetMs, selectedClip.position_y ?? 0.5);
          const curScaleX = evaluateClipProperty(selectedClip, 'scale_x', clipOffsetMs, selectedClip.scale_x ?? 1.0);
          const curScaleY = evaluateClipProperty(selectedClip, 'scale_y', clipOffsetMs, selectedClip.scale_y ?? 1.0);
          const curRot = evaluateClipProperty(selectedClip, 'rotation', clipOffsetMs, selectedClip.rotation ?? 0.0);
          const curOpacity = evaluateClipProperty(selectedClip, 'opacity', clipOffsetMs, selectedClip.opacity ?? 1.0);

          const totalVideoKeyframes = (selectedClip.keyframes || []).filter((k) =>
            ['position_x', 'position_y', 'scale_x', 'scale_y', 'rotation', 'opacity'].includes(k.property_path)
          ).length;

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[11px] pb-1 border-b border-cinema-border/50 text-cinema-textDim">
                <span className="flex items-center gap-1 text-cinema-ai font-semibold">
                  <Clock className="w-3 h-3 text-cinema-ai" />
                  Keyframing & Motion
                </span>
                <span className="font-mono text-[10px] bg-cinema-800 px-1.5 py-0.5 rounded text-cinema-text">
                  {totalVideoKeyframes} keyframe{totalVideoKeyframes === 1 ? '' : 's'}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-cinema-text block mb-2">Position</label>
                <div className="grid grid-cols-2 gap-2">
                  <NumberRow
                    label="X"
                    value={curPosX}
                    step={0.01}
                    min={-2}
                    max={2}
                    isKeyframed={hasKeyframesForProp('position_x')}
                    hasKeyframeAtPlayhead={Boolean(getKeyframeAtPlayhead('position_x'))}
                    onToggleKeyframe={() => toggleKeyframe('position_x', selectedClip.position_x ?? 0.5)}
                    onChange={(v) => handlePropertyChange('position_x', v, selectedClip.position_x ?? 0.5)}
                    keyframeTestId="keyframe-toggle-position_x"
                    testId="input-position_x"
                  />
                  <NumberRow
                    label="Y"
                    value={curPosY}
                    step={0.01}
                    min={-2}
                    max={2}
                    isKeyframed={hasKeyframesForProp('position_y')}
                    hasKeyframeAtPlayhead={Boolean(getKeyframeAtPlayhead('position_y'))}
                    onToggleKeyframe={() => toggleKeyframe('position_y', selectedClip.position_y ?? 0.5)}
                    onChange={(v) => handlePropertyChange('position_y', v, selectedClip.position_y ?? 0.5)}
                    keyframeTestId="keyframe-toggle-position_y"
                    testId="input-position_y"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-cinema-text block mb-2">Scale</label>
                <div className="grid grid-cols-2 gap-2">
                  <NumberRow
                    label="X"
                    value={curScaleX}
                    step={0.01}
                    min={0.01}
                    max={10}
                    isKeyframed={hasKeyframesForProp('scale_x')}
                    hasKeyframeAtPlayhead={Boolean(getKeyframeAtPlayhead('scale_x'))}
                    onToggleKeyframe={() => toggleKeyframe('scale_x', selectedClip.scale_x ?? 1.0)}
                    onChange={(v) => handlePropertyChange('scale_x', v, selectedClip.scale_x ?? 1.0)}
                    keyframeTestId="keyframe-toggle-scale_x"
                    testId="input-scale_x"
                  />
                  <NumberRow
                    label="Y"
                    value={curScaleY}
                    step={0.01}
                    min={0.01}
                    max={10}
                    isKeyframed={hasKeyframesForProp('scale_y')}
                    hasKeyframeAtPlayhead={Boolean(getKeyframeAtPlayhead('scale_y'))}
                    onToggleKeyframe={() => toggleKeyframe('scale_y', selectedClip.scale_y ?? 1.0)}
                    onChange={(v) => handlePropertyChange('scale_y', v, selectedClip.scale_y ?? 1.0)}
                    keyframeTestId="keyframe-toggle-scale_y"
                    testId="input-scale_y"
                  />
                </div>
              </div>

              <NumberRow
                label="Rotation"
                value={curRot}
                step={0.5}
                min={-360}
                max={360}
                unit="°"
                isKeyframed={hasKeyframesForProp('rotation')}
                hasKeyframeAtPlayhead={Boolean(getKeyframeAtPlayhead('rotation'))}
                onToggleKeyframe={() => toggleKeyframe('rotation', selectedClip.rotation ?? 0.0)}
                onChange={(v) => handlePropertyChange('rotation', v, selectedClip.rotation ?? 0.0)}
                keyframeTestId="keyframe-toggle-rotation"
                testId="input-rotation"
              />

              <div>
                <label className="text-[11px] font-semibold text-cinema-text block mb-2">Anchor Point</label>
                <div className="grid grid-cols-2 gap-2">
                  <NumberRow label="X" value={selectedClip.anchor_x} step={0.01} min={0} max={1} onChange={(v) => update((c) => { c.anchor_x = v; })} />
                  <NumberRow label="Y" value={selectedClip.anchor_y} step={0.01} min={0} max={1} onChange={(v) => update((c) => { c.anchor_y = v; })} />
                </div>
              </div>

              <SliderRow
                label="Opacity"
                value={curOpacity}
                min={0}
                max={1}
                step={0.01}
                unit={` ${Math.round(curOpacity * 100)}%`}
                isKeyframed={hasKeyframesForProp('opacity')}
                hasKeyframeAtPlayhead={Boolean(getKeyframeAtPlayhead('opacity'))}
                onToggleKeyframe={() => toggleKeyframe('opacity', selectedClip.opacity ?? 1.0)}
                onChange={(v) => handlePropertyChange('opacity', v, selectedClip.opacity ?? 1.0)}
                keyframeTestId="keyframe-toggle-opacity"
              />

              <div>
                <label className="text-[11px] font-semibold text-cinema-text block mb-1">Blend Mode</label>
                <select
                  value={selectedClip.blend_mode}
                  onChange={(e) => update((c) => { c.blend_mode = e.target.value; })}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1.5 text-cinema-text outline-none text-[11px]"
                >
                  {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'].map((m) => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1).replace('-', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })()}

        {/* ─── TAB: CROP ─── */}
        {activeInspectorTab === 'crop' && selectedClip && (
          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold text-cinema-text">Edge Crop (0.0–0.5)</h4>
            {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
              <div key={side} className="flex items-center justify-between bg-cinema-900 p-2 rounded border border-cinema-border">
                <span className="capitalize text-cinema-textDim text-[11px]">{side}</span>
                <input
                  type="number"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={selectedClip[`crop_${side}` as keyof Clip] as number}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    update((c) => { (c as any)[`crop_${side}`] = Math.max(0, Math.min(0.5, val)); });
                  }}
                  className="w-16 bg-transparent text-right outline-none font-mono text-cinema-text text-[11px]"
                />
              </div>
            ))}
          </div>
        )}

        {/* ─── TAB: VIDEO ─── */}
        {activeInspectorTab === 'video' && selectedClip && (
          <div className="space-y-4">
            {/* Phase 30: Video Clip Duplicate / Copy-Paste Section */}
            <div data-testid="clip-actions-section" className="p-3 bg-cinema-900 rounded-lg border border-cinema-border space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
                  <Copy className="w-3.5 h-3.5 text-cinema-ai" />
                  <span>Clip Actions</span>
                </div>
                <span className="text-[10px] text-cinema-textDim font-mono">
                  {selectedClip.name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="inspector-duplicate-clip-btn"
                  onClick={() => {
                    if (selectedClipIds.size > 1) {
                      const newIds = duplicateSelectedClips();
                      if (newIds) showNotification(`${newIds.length} clips duplicated`, 'info');
                    } else if (selectedClip) {
                      const newId = duplicateClip(selectedClip.id);
                      if (newId) showNotification('Clip duplicated', 'info');
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-cinema-800 hover:bg-cinema-750 text-cinema-text hover:text-white border border-cinema-border rounded text-[11px] font-medium transition-colors"
                  title={selectedClipIds.size > 1 ? `Duplicate (${selectedClipIds.size} clips) (Ctrl+D)` : "Duplicate clip immediately after source clip (Ctrl+D)"}
                >
                  <Copy className="w-3 h-3 text-cinema-ai" />
                  <span>{selectedClipIds.size > 1 ? `Duplicate (${selectedClipIds.size})` : 'Duplicate'}</span>
                </button>
                <button
                  type="button"
                  data-testid="inspector-copy-clip-btn"
                  onClick={() => {
                    if (selectedClipIds.size > 1) {
                      const ok = copySelectedClips();
                      if (ok) showNotification(`${selectedClipIds.size} clips copied to clipboard`, 'info');
                    } else if (selectedClip) {
                      const ok = copyClip(selectedClip.id);
                      if (ok) showNotification('Clip copied to clipboard', 'info');
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-cinema-800 hover:bg-cinema-750 text-cinema-text hover:text-white border border-cinema-border rounded text-[11px] font-medium transition-colors"
                  title={selectedClipIds.size > 1 ? `Copy (${selectedClipIds.size} clips) (Ctrl+C)` : "Copy clip to clipboard (Ctrl+C)"}
                >
                  <Copy className="w-3 h-3 text-emerald-400" />
                  <span>{selectedClipIds.size > 1 ? `Copy (${selectedClipIds.size})` : 'Copy'}</span>
                </button>
              </div>
              <button
                type="button"
                data-testid="inspector-split-clip-btn"
                disabled={!(selectedClip && playheadMs > selectedClip.start_time_ms && playheadMs < selectedClip.start_time_ms + selectedClip.duration_ms)}
                onClick={() => {
                  if (selectedClip && playheadMs > selectedClip.start_time_ms && playheadMs < selectedClip.start_time_ms + selectedClip.duration_ms) {
                    splitClipAtPlayhead(selectedClip.id);
                    showNotification('Clip split at playhead', 'info');
                  }
                }}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2 border rounded text-[11px] font-medium transition-colors ${
                  selectedClip && playheadMs > selectedClip.start_time_ms && playheadMs < selectedClip.start_time_ms + selectedClip.duration_ms
                    ? 'bg-cinema-800 hover:bg-cinema-750 text-cinema-text hover:text-white border-cinema-border'
                    : 'bg-cinema-950 text-cinema-textDim/40 border-cinema-border cursor-not-allowed'
                }`}
                title={
                  selectedClip && playheadMs > selectedClip.start_time_ms && playheadMs < selectedClip.start_time_ms + selectedClip.duration_ms
                    ? 'Split clip at playhead position (S)'
                    : 'Playhead must be inside clip range to split'
                }
              >
                <Scissors className="w-3 h-3 text-amber-400" />
                <span>Split at Playhead (S)</span>
              </button>
              <button
                type="button"
                id="inspector-razor-tool-btn"
                data-testid="inspector-razor-tool-btn"
                onClick={() => {
                  const nextTool = activeTimelineTool === 'razor' ? 'select' : 'razor';
                  setActiveTimelineTool(nextTool);
                  showNotification(`Razor Tool ${nextTool === 'razor' ? 'activated' : 'deactivated'}`, 'info');
                }}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2 border rounded text-[11px] font-medium transition-colors ${
                  activeTimelineTool === 'razor'
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500 font-bold shadow-sm'
                    : 'bg-cinema-800 hover:bg-cinema-750 text-cinema-text hover:text-white border-cinema-border'
                }`}
                title="Activate Razor / Blade Tool (C) — click on clip to cut at cursor"
              >
                <Scissors className="w-3 h-3 text-rose-400" />
                <span>{activeTimelineTool === 'razor' ? 'Razor Active (Click to Cut)' : 'Razor Tool (C)'}</span>
              </button>
              <button
                type="button"
                data-testid="inspector-paste-clip-btn"
                disabled={!clipboardClip && (!clipboardClips || clipboardClips.length === 0)}
                onClick={() => {
                  if (clipboardClips && clipboardClips.length > 1) {
                    const newIds = pasteSelectedClips();
                    if (newIds) showNotification(`${newIds.length} clips pasted from clipboard`, 'info');
                  } else {
                    const newId = pasteClip();
                    if (newId) showNotification('Clip pasted from clipboard', 'info');
                  }
                }}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2 border rounded text-[11px] font-medium transition-colors ${
                  (clipboardClip || (clipboardClips && clipboardClips.length > 0))
                    ? 'bg-cinema-ai/10 hover:bg-cinema-ai/20 text-cinema-ai border-cinema-ai/40'
                    : 'bg-cinema-950 text-cinema-textDim/40 border-cinema-border cursor-not-allowed'
                }`}
                title={
                  (clipboardClip || (clipboardClips && clipboardClips.length > 0))
                    ? (clipboardClips && clipboardClips.length > 1 ? `Paste (${clipboardClips.length} clips) at Playhead (Ctrl+V)` : 'Paste clip at current playhead position (Ctrl+V)')
                    : 'Clipboard is empty. Copy a clip first (Ctrl+C)'
                }
              >
                <Clipboard className="w-3 h-3" />
                <span>{(clipboardClips && clipboardClips.length > 1) ? `Paste (${clipboardClips.length} clips)` : 'Paste Clip (at Playhead)'}</span>
              </button>
            </div>

            {/* Phase 27: Video Speed & Reverse Section */}
            <div data-testid="clip-speed-section" className="p-3 bg-cinema-900 rounded-lg border border-cinema-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
                  <Gauge className="w-3.5 h-3.5 text-cinema-ai" />
                  <span>Speed & Direction</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    data-testid="current-speed-display"
                    className="text-[10px] px-1.5 py-0.5 rounded bg-cinema-950 text-cinema-text border border-cinema-border font-mono font-medium"
                  >
                    {(selectedClip.speed_factor ?? 1.0)}x
                  </span>
                  <span
                    data-testid="current-direction-display"
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-medium ${
                      selectedClip.is_reversed
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-cinema-950 text-cinema-textDim border-cinema-border'
                    }`}
                  >
                    {selectedClip.is_reversed ? 'Reverse' : 'Forward'}
                  </span>
                </div>
              </div>

              {/* Speed Presets Grid (0.25x, 0.5x, 1.0x, 1.5x, 2.0x, 4.0x) */}
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1.5 font-medium">Speed Multiplier</label>
                <div className="grid grid-cols-6 gap-1 mb-2">
                  {[0.25, 0.5, 1.0, 1.5, 2.0, 4.0].map((s) => {
                    const isActive = Math.abs((selectedClip.speed_factor ?? 1.0) - s) < 0.01;
                    return (
                      <button
                        key={s}
                        type="button"
                        data-testid={`speed-preset-${s}`}
                        onClick={() => setClipSpeed(selectedClip.id, s)}
                        className={`py-1 rounded border text-[10px] font-mono transition-colors ${
                          isActive
                            ? 'bg-cinema-red border-cinema-red text-white font-semibold shadow-sm'
                            : 'bg-cinema-950 border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-border/80'
                        }`}
                      >
                        {s}x
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-cinema-textDim font-medium whitespace-nowrap">Custom:</span>
                  <input
                    type="number"
                    min={0.1}
                    max={10.0}
                    step={0.05}
                    data-testid="custom-speed-input"
                    value={selectedClip.speed_factor ?? 1.0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) {
                        setClipSpeed(selectedClip.id, v);
                      }
                    }}
                    className="w-full bg-cinema-950 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text outline-none text-[11px] focus:border-cinema-ai"
                    placeholder="1.0"
                  />
                </div>
              </div>

              {/* Playback Direction Controls */}
              <div className="pt-2 border-t border-cinema-border/60 space-y-2">
                <label className="text-[10px] text-cinema-textDim block font-medium">Playback Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="direction-forward-btn"
                    onClick={() => setClipReverse(selectedClip.id, false)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded border text-[11px] transition-colors ${
                      !selectedClip.is_reversed
                        ? 'bg-cinema-red border-cinema-red text-white font-semibold'
                        : 'bg-cinema-950 border-cinema-border text-cinema-textDim hover:text-white'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Forward</span>
                  </button>
                  <button
                    type="button"
                    data-testid="direction-reverse-btn"
                    onClick={() => setClipReverse(selectedClip.id, true)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded border text-[11px] transition-colors ${
                      selectedClip.is_reversed
                        ? 'bg-amber-600 border-amber-600 text-white font-semibold'
                        : 'bg-cinema-950 border-cinema-border text-cinema-textDim hover:text-white'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reverse</span>
                  </button>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    data-testid="clip-reverse-toggle"
                    checked={!!selectedClip.is_reversed}
                    onChange={(e) => setClipReverse(selectedClip.id, e.target.checked)}
                    className="rounded border-cinema-border accent-cinema-red"
                  />
                  <span className="text-cinema-text text-[11px]">Reverse Playback Mode</span>
                </label>
              </div>
            </div>

            {/* Phase 28: Video Freeze Frame Section */}
            <div data-testid="freeze-frame-section" className="p-3 bg-cinema-900 rounded-lg border border-cinema-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
                  <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Freeze Frame</span>
                </div>
                <span
                  data-testid="freeze-frame-status-badge"
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-medium ${
                    selectedClip.is_frozen
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-cinema-950 text-cinema-textDim border-cinema-border'
                  }`}
                >
                  {selectedClip.is_frozen
                    ? `Frozen (${(selectedClip.freeze_duration_ms ?? 2000) / 1000}s @ ${selectedClip.freeze_at_ms ?? 0}ms)`
                    : 'Inactive'}
                </span>
              </div>

              {/* Option A Mutual Exclusion Notice: Frame Hold is active */}
              {selectedClip.is_frame_hold && (
                <div data-testid="freeze-frame-blocked-notice" className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span>Frame Hold is active on this clip. Remove Frame Hold before applying Freeze Frame.</span>
                </div>
              )}

              {/* Source Frame Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-cinema-textDim font-medium">Source Frame (Offset ms)</label>
                  <button
                    type="button"
                    data-testid="use-playhead-frame-btn"
                    disabled={Boolean(selectedClip.is_frame_hold)}
                    onClick={() => {
                      const offset = Math.max(0, Math.min(Math.max(0, selectedClip.duration_ms - 1), playheadMs - selectedClip.start_time_ms));
                      setFreezeAtOffsetMs(offset);
                    }}
                    className="text-[9px] text-cyan-400 hover:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 underline underline-offset-2"
                    title="Capture playhead position relative to clip start"
                  >
                    <Clock className="w-2.5 h-2.5" />
                    Use Playhead
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    data-testid="freeze-at-input"
                    disabled={Boolean(selectedClip.is_frame_hold)}
                    min={0}
                    max={Math.max(0, selectedClip.duration_ms - 1)}
                    step={100}
                    value={freezeAtOffsetMs}
                    onChange={(e) => setFreezeAtOffsetMs(Math.max(0, Math.min(Math.max(0, selectedClip.duration_ms - 1), parseInt(e.target.value) || 0)))}
                    className="w-full bg-cinema-950 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text outline-none text-[11px] focus:border-cyan-400 disabled:opacity-50"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-cinema-textDim font-mono whitespace-nowrap">
                    {formatTimecode(freezeAtOffsetMs)}
                  </span>
                </div>
              </div>

              {/* Freeze Duration Buttons */}
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1.5 font-medium">Freeze Duration</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '1s', ms: 1000, testId: 'freeze-dur-1' },
                    { label: '2s', ms: 2000, testId: 'freeze-dur-2' },
                    { label: '3s', ms: 3000, testId: 'freeze-dur-3' },
                    { label: '5s', ms: 5000, testId: 'freeze-dur-5' },
                  ].map((d) => {
                    const isSelected = freezeDuration === d.ms;
                    return (
                      <button
                        key={d.ms}
                        type="button"
                        data-testid={d.testId}
                        disabled={Boolean(selectedClip.is_frame_hold)}
                        onClick={() => setFreezeDuration(d.ms)}
                        className={`py-1 rounded border text-[10px] font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-cyan-600 border-cyan-500 text-white font-semibold shadow-sm'
                            : 'bg-cinema-950 border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-border/80'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons: Apply & Remove */}
              <div className="flex items-center gap-2 pt-1 border-t border-cinema-border/60">
                <button
                  type="button"
                  data-testid="apply-freeze-btn"
                  disabled={Boolean(selectedClip.is_frame_hold)}
                  onClick={() => applyFreezeFrame(selectedClip.id, freezeAtOffsetMs, freezeDuration)}
                  className="flex-1 py-1.5 rounded border border-cyan-500 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Snowflake className="w-3 h-3" />
                  <span>Apply Freeze</span>
                </button>
                {selectedClip.is_frozen && (
                  <button
                    type="button"
                    data-testid="remove-freeze-btn"
                    onClick={() => removeFreezeFrame(selectedClip.id)}
                    className="py-1.5 px-3 rounded border border-cinema-border bg-cinema-950 hover:bg-rose-950 hover:border-rose-500 hover:text-rose-200 text-cinema-textDim text-[11px] font-medium transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Phase 29: Video Frame Hold / Repeat Section */}
            <div data-testid="frame-hold-section" className="p-3 bg-cinema-900 rounded-lg border border-cinema-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
                  <Anchor className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Frame Hold</span>
                </div>
                <span
                  data-testid="frame-hold-status-badge"
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-medium ${
                    selectedClip.is_frame_hold
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-cinema-950 text-cinema-textDim border-cinema-border'
                  }`}
                >
                  {selectedClip.is_frame_hold
                    ? `Held (${(selectedClip.frame_hold_duration_ms ?? 2000) / 1000}s @ ${selectedClip.frame_hold_at_ms ?? 0}ms)`
                    : 'Inactive'}
                </span>
              </div>

              {/* Option A Mutual Exclusion Notice: Freeze Frame is active */}
              {selectedClip.is_frozen && (
                <div data-testid="frame-hold-blocked-notice" className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span>Freeze Frame is active on this clip. Remove Freeze Frame before applying Frame Hold.</span>
                </div>
              )}

              {/* Source Frame Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-cinema-textDim font-medium">Hold Frame (Offset ms)</label>
                  <button
                    type="button"
                    data-testid="use-playhead-hold-btn"
                    disabled={Boolean(selectedClip.is_frozen)}
                    onClick={() => {
                      const offset = Math.max(0, Math.min(Math.max(0, selectedClip.duration_ms - 1), playheadMs - selectedClip.start_time_ms));
                      setFrameHoldAtOffsetMs(offset);
                    }}
                    className="text-[9px] text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 underline underline-offset-2"
                    title="Capture playhead position relative to clip start"
                  >
                    <Clock className="w-2.5 h-2.5" />
                    Use Playhead
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    data-testid="frame-hold-at-input"
                    disabled={Boolean(selectedClip.is_frozen)}
                    min={0}
                    max={Math.max(0, selectedClip.duration_ms - 1)}
                    step={100}
                    value={frameHoldAtOffsetMs}
                    onChange={(e) => setFrameHoldAtOffsetMs(Math.max(0, Math.min(Math.max(0, selectedClip.duration_ms - 1), parseInt(e.target.value) || 0)))}
                    className="w-full bg-cinema-950 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text outline-none text-[11px] focus:border-emerald-400 disabled:opacity-50"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-cinema-textDim font-mono whitespace-nowrap">
                    {formatTimecode(frameHoldAtOffsetMs)}
                  </span>
                </div>
              </div>

              {/* Hold Duration Buttons */}
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1.5 font-medium">Hold Duration</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '1s', ms: 1000, testId: 'frame-hold-dur-1' },
                    { label: '2s', ms: 2000, testId: 'frame-hold-dur-2' },
                    { label: '3s', ms: 3000, testId: 'frame-hold-dur-3' },
                    { label: '5s', ms: 5000, testId: 'frame-hold-dur-5' },
                  ].map((d) => {
                    const isSelected = frameHoldDuration === d.ms;
                    return (
                      <button
                        key={d.ms}
                        type="button"
                        data-testid={d.testId}
                        disabled={Boolean(selectedClip.is_frozen)}
                        onClick={() => setFrameHoldDuration(d.ms)}
                        className={`py-1 rounded border text-[10px] font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-500 text-white font-semibold shadow-sm'
                            : 'bg-cinema-950 border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-border/80'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons: Apply & Remove */}
              <div className="flex items-center gap-2 pt-1 border-t border-cinema-border/60">
                <button
                  type="button"
                  data-testid="apply-frame-hold-btn"
                  disabled={Boolean(selectedClip.is_frozen)}
                  onClick={() => applyFrameHold(selectedClip.id, frameHoldAtOffsetMs, frameHoldDuration)}
                  className="flex-1 py-1.5 rounded border border-emerald-500 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Anchor className="w-3 h-3" />
                  <span>Apply Frame Hold</span>
                </button>
                {selectedClip.is_frame_hold && (
                  <button
                    type="button"
                    data-testid="remove-frame-hold-btn"
                    onClick={() => removeFrameHold(selectedClip.id)}
                    className="py-1.5 px-3 rounded border border-cinema-border bg-cinema-950 hover:bg-rose-950 hover:border-rose-500 hover:text-rose-200 text-cinema-textDim text-[11px] font-medium transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Multi-Clip Video Transitions Section */}
            <div data-testid="video-transitions-section" className="p-3 bg-cinema-900 rounded-lg border border-cinema-border space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-cinema-text text-[11px]">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-cinema-ai" />
                  <span>Video Transitions</span>
                </div>
                {transitionPair?.currentTransition && (
                  <span
                    data-testid="active-transition-badge"
                    className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono"
                  >
                    {transitionPair.currentTransition.type} ({transitionPair.currentTransition.duration_ms}ms)
                  </span>
                )}
              </div>

              {transitionPair ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] text-cinema-textDim bg-cinema-950 p-1.5 rounded border border-cinema-border/60">
                    <span className="truncate max-w-[45%]" title={transitionPair.clipA.name}>
                      A: <span className="text-cinema-text font-medium">{transitionPair.clipA.name}</span>
                    </span>
                    <span className="text-cinema-ai">→</span>
                    <span className="truncate max-w-[45%]" title={transitionPair.clipB.name}>
                      B: <span className="text-cinema-text font-medium">{transitionPair.clipB.name}</span>
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-cinema-textDim block mb-1">Transition Type</label>
                    <select
                      data-testid="transition-type-select"
                      value={transitionType}
                      onChange={(e) => setTransitionType(e.target.value as VideoTransitionType)}
                      className="w-full bg-cinema-800 border border-cinema-border rounded px-2 py-1 text-[11px] text-cinema-text outline-none focus:border-cinema-ai"
                    >
                      <option value="crossfade">Crossfade</option>
                      <option value="fade_black">Fade Through Black</option>
                      <option value="fade_white">Fade Through White</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-[10px] text-cinema-textDim mb-1">
                      <span>Duration (ms)</span>
                      <span className="font-mono text-cinema-ai">
                        {transitionDuration} ms (max {Math.min(transitionPair.clipA.duration_ms, transitionPair.clipB.duration_ms)} ms)
                      </span>
                    </div>
                    <input
                      data-testid="transition-duration-input"
                      type="number"
                      min={100}
                      max={Math.min(transitionPair.clipA.duration_ms, transitionPair.clipB.duration_ms)}
                      step={50}
                      value={transitionDuration}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setTransitionDuration(val);
                      }}
                      className="w-full bg-cinema-800 border border-cinema-border rounded px-2 py-1 text-[11px] font-mono text-cinema-text outline-none focus:border-cinema-ai"
                    />
                    {transitionDuration > Math.min(transitionPair.clipA.duration_ms, transitionPair.clipB.duration_ms) && (
                      <p className="text-[10px] text-red-400 mt-1">Duration exceeds maximum allowable clip duration.</p>
                    )}
                    {transitionDuration <= 0 && (
                      <p className="text-[10px] text-red-400 mt-1">Duration must be greater than 0 ms.</p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      data-testid="apply-transition-btn"
                      type="button"
                      disabled={
                        transitionDuration <= 0 ||
                        transitionDuration > Math.min(transitionPair.clipA.duration_ms, transitionPair.clipB.duration_ms)
                      }
                      onClick={() => {
                        const success = applyVideoTransition(
                          transitionPair.clipA.id,
                          transitionPair.clipB.id,
                          transitionType,
                          transitionDuration
                        );
                        if (success) {
                          showNotification(`Applied ${transitionType} transition (${transitionDuration}ms)`, 'success');
                        } else {
                          showNotification('Failed to apply transition: validation error', 'error');
                        }
                      }}
                      className="flex-1 py-1.5 bg-cinema-red hover:bg-cinema-redHover disabled:opacity-40 disabled:pointer-events-none text-white font-medium text-[11px] rounded transition-colors"
                    >
                      {transitionPair.currentTransition ? 'Update Transition' : 'Apply Transition'}
                    </button>

                    {transitionPair.currentTransition && (
                      <button
                        data-testid="remove-transition-btn"
                        type="button"
                        onClick={() => {
                          removeVideoTransition(transitionPair.clipA.id, transitionPair.clipB.id);
                          showNotification('Transition removed', 'info');
                        }}
                        className="px-3 py-1.5 border border-cinema-border rounded text-[11px] text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-cinema-textDim">
                  Select two adjacent clips or a video clip with a neighboring clip on the same track to configure transitions.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB: EFFECTS ─── */}
        {activeInspectorTab === 'effects' && selectedClip && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold text-cinema-text">Applied Effects</h4>
              <button
                onClick={() => showNotification('Effect library coming in Phase 3.', 'info')}
                className="flex items-center gap-1 text-[10px] text-cinema-ai hover:text-white transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Effect
              </button>
            </div>

            {selectedClip.effects.length === 0 ? (
              <div className="text-center py-6 text-cinema-textDim border border-dashed border-cinema-border rounded">
                <Wand2 className="w-5 h-5 mx-auto mb-2 opacity-30" />
                <p className="text-[11px]">No effects applied</p>
                <p className="text-[10px] mt-1">Effects library arrives in Phase 3</p>
              </div>
            ) : (
              selectedClip.effects.map((effect, idx) => (
                <div key={effect.id || idx} className="flex items-center justify-between bg-cinema-900 p-2 rounded border border-cinema-border">
                  <span className="text-cinema-text text-[11px]">{effect.effect_type}</span>
                  <button
                    onClick={() => update((c) => {
                      const e = c.effects[idx];
                      if (e) e.is_enabled = !e.is_enabled;
                    })}
                    className={effect.is_enabled ? 'text-cinema-text' : 'text-cinema-textDim'}
                  >
                    {effect.is_enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── TAB: COLOR ─── */}
        {activeInspectorTab === 'color' && selectedClip && (
          <ColorInspectorContent
            selectedClip={selectedClip}
            update={update}
            showNotification={showNotification}
          />
        )}

        {/* ─── TAB: AUDIO ─── */}
        {activeInspectorTab === 'audio' && selectedClip && (
          <div className="space-y-3.5">
            {/* 0. CLIP TIMING & BOUNDS */}
            <div data-testid="inspector-audio-timing" className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-cinema-text">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cinema-ai" />
                  Clip Timing & Bounds
                </span>
                <span className="text-[10px] font-mono text-cinema-ai">
                  {formatTimecode(selectedClip.start_time_ms)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-cinema-850 p-1.5 rounded border border-cinema-border/50">
                  <span className="text-cinema-textDim block text-[9px]">Timeline Start</span>
                  <span className="font-mono text-cinema-text">{selectedClip.start_time_ms} ms</span>
                </div>
                <div className="bg-cinema-850 p-1.5 rounded border border-cinema-border/50">
                  <span className="text-cinema-textDim block text-[9px]">Duration</span>
                  <span className="font-mono text-cinema-text">{selectedClip.duration_ms} ms</span>
                </div>
                <div className="bg-cinema-850 p-1.5 rounded border border-cinema-border/50">
                  <span className="text-cinema-textDim block text-[9px]">Media In</span>
                  <span className="font-mono text-cinema-text">{selectedClip.source_in_ms} ms</span>
                </div>
                <div className="bg-cinema-850 p-1.5 rounded border border-cinema-border/50">
                  <span className="text-cinema-textDim block text-[9px]">Media Out</span>
                  <span className="font-mono text-cinema-text">{selectedClip.source_out_ms} ms</span>
                </div>
              </div>
            </div>

            {/* 1. BASIC GAIN & PAN */}
            <div className="space-y-2.5 p-2.5 bg-cinema-900/80 rounded border border-cinema-border">
              <div className="flex items-center justify-between text-[11px] font-semibold text-cinema-text">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  Basic Audio
                </span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
                  <input
                    type="checkbox"
                    checked={selectedClip.volume_db <= -60}
                    onChange={(e) => update((c) => { c.volume_db = e.target.checked ? -60 : 0; })}
                    className="rounded accent-cinema-red"
                  />
                  <span>Mute</span>
                </label>
              </div>

              <SliderRow
                label="Volume Gain"
                value={selectedClip.volume_db}
                min={-60}
                max={12}
                step={0.5}
                unit=" dB"
                accentClass="accent-emerald-500"
                onChange={(v) => update((c) => { c.volume_db = v; })}
              />

              <SliderRow
                label="Pan / Balance"
                value={selectedClip.pan ?? 0.0}
                min={-1.0}
                max={1.0}
                step={0.05}
                unit=""
                accentClass="accent-cyan-500"
                onChange={(v) => update((c) => { c.pan = v; })}
              />
              <div className="flex justify-between text-[8px] font-mono text-cinema-textDim px-0.5">
                <span>L 100%</span>
                <span>CENTER</span>
                <span>R 100%</span>
              </div>
            </div>

            {/* 1.5. AUDIO AUTOMATION (VOLUME CURVE) */}
            {(() => {
              const volumeKeyframes = (selectedClip.keyframes || [])
                .filter((k) => k.property_path === 'volume_db')
                .sort((a, b) => a.time_offset_ms - b.time_offset_ms);
              const isPlayheadInClip = playheadMs >= selectedClip.start_time_ms && playheadMs <= selectedClip.start_time_ms + selectedClip.duration_ms;
              const currentVolAtPlayhead = isPlayheadInClip
                ? evaluateClipVolume(selectedClip, playheadMs - selectedClip.start_time_ms)
                : (selectedClip.volume_db ?? 0);

              return (
                <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-cinema-text">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      Volume Automation
                    </span>
                    {volumeKeyframes.length > 0 ? (
                      <span
                        data-testid="inspector-automation-active-badge"
                        className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      >
                        {volumeKeyframes.length} KEYFRAME{volumeKeyframes.length > 1 ? 'S' : ''}
                      </span>
                    ) : (
                      <span className="text-[9px] text-cinema-textDim">Static Gain</span>
                    )}
                  </div>

                  {/* Status & Add Keyframe row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-cinema-textDim">
                      {isPlayheadInClip ? (
                        <span>
                          At playhead: <strong className="text-amber-400 font-mono">{currentVolAtPlayhead > 0 ? `+${currentVolAtPlayhead.toFixed(1)}` : currentVolAtPlayhead.toFixed(1)} dB</strong>
                        </span>
                      ) : (
                        <span>Playhead outside clip</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        data-testid="add-volume-keyframe-btn"
                        onClick={() => {
                          const offsetMs = Math.max(0, Math.min(selectedClip.duration_ms, playheadMs - selectedClip.start_time_ms));
                          const val = evaluateClipVolume(selectedClip, offsetMs);
                          addKeyframe(selectedClip.id, {
                            id: crypto.randomUUID(),
                            property_path: 'volume_db',
                            time_offset_ms: offsetMs,
                            value: Math.round(val * 10) / 10,
                            interpolation: 'linear',
                          });
                        }}
                        className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[9.5px] font-medium flex items-center gap-1 transition-colors"
                        title="Add volume keyframe at current playhead position"
                      >
                        <Plus className="w-3 h-3" />
                        Keyframe
                      </button>
                      {volumeKeyframes.length > 0 && (
                        <button
                          type="button"
                          data-testid="clear-volume-automation-btn"
                          onClick={() => clearAudioAutomation(selectedClip.id)}
                          className="px-1.5 py-1 bg-cinema-800 hover:bg-red-950/60 hover:text-red-300 text-cinema-textDim border border-cinema-border rounded text-[9.5px] transition-colors"
                          title="Clear all volume automation keyframes"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Automation quick presets */}
                  <div className="flex flex-wrap gap-1">
                    {[
                      {
                        name: 'Fade In',
                        kfs: [
                          { time_offset_ms: 0, value: -60 },
                          { time_offset_ms: Math.min(1500, selectedClip.duration_ms), value: selectedClip.volume_db || 0 },
                        ],
                      },
                      {
                        name: 'Fade Out',
                        kfs: [
                          { time_offset_ms: Math.max(0, selectedClip.duration_ms - 1500), value: selectedClip.volume_db || 0 },
                          { time_offset_ms: selectedClip.duration_ms, value: -60 },
                        ],
                      },
                      {
                        name: 'Dip Center (-6dB)',
                        kfs: [
                          { time_offset_ms: 0, value: selectedClip.volume_db || 0 },
                          { time_offset_ms: Math.round(selectedClip.duration_ms * 0.3), value: selectedClip.volume_db || 0 },
                          { time_offset_ms: Math.round(selectedClip.duration_ms * 0.5), value: (selectedClip.volume_db || 0) - 6 },
                          { time_offset_ms: Math.round(selectedClip.duration_ms * 0.7), value: selectedClip.volume_db || 0 },
                          { time_offset_ms: selectedClip.duration_ms, value: selectedClip.volume_db || 0 },
                        ],
                      },
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        data-testid={`auto-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
                        onClick={() => {
                          clearAudioAutomation(selectedClip.id);
                          for (const kf of preset.kfs) {
                            addKeyframe(selectedClip.id, {
                              id: crypto.randomUUID(),
                              property_path: 'volume_db',
                              time_offset_ms: kf.time_offset_ms,
                              value: kf.value,
                              interpolation: 'linear',
                            });
                          }
                        }}
                        className="px-1.5 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-textDim hover:text-cinema-text rounded text-[8.5px] border border-cinema-border/60 transition-colors"
                      >
                        + {preset.name}
                      </button>
                    ))}
                  </div>

                  {/* Keyframe Table/List */}
                  {volumeKeyframes.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-cinema-border/50 max-h-40 overflow-y-auto pr-0.5 scrollbar-thin">
                      {volumeKeyframes.map((kf) => (
                        <div
                          key={kf.id}
                          data-testid={`inspector-keyframe-item-${kf.id}`}
                          className="flex items-center justify-between gap-1 p-1 bg-cinema-850 rounded border border-cinema-border/40 text-[9px]"
                        >
                          <button
                            type="button"
                            onClick={() => setPlayhead(selectedClip.start_time_ms + kf.time_offset_ms)}
                            className="font-mono text-cinema-text hover:text-amber-300 text-left min-w-[50px] transition-colors"
                            title="Seek playhead to this keyframe"
                          >
                            {formatTimecode(kf.time_offset_ms)}
                          </button>
                          <div className="flex items-center gap-1 flex-1 px-1">
                            <input
                              type="range"
                              min={-60}
                              max={12}
                              step={0.5}
                              value={Number(kf.value)}
                              onChange={(e) => updateKeyframeValue(selectedClip.id, kf.id || '', parseFloat(e.target.value))}
                              className="w-full accent-amber-400 h-1"
                            />
                            <span className="font-mono text-[8.5px] text-amber-300 min-w-[34px] text-right">
                              {Number(kf.value) > 0 ? `+${kf.value}` : kf.value} dB
                            </span>
                          </div>
                          <button
                            type="button"
                            data-testid={`delete-kf-${kf.id}`}
                            onClick={() => deleteKeyframe(selectedClip.id, kf.id || '')}
                            className="text-cinema-textDim hover:text-red-400 px-1 py-0.5 transition-colors font-bold"
                            title="Delete keyframe"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 2. FADES */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text block">Fades & Crossfade</span>
                <button
                  type="button"
                  data-testid="auto-preset-crossfade"
                  onClick={() => update((c) => {
                    const dur = Math.min(1000, Math.floor(c.duration_ms / 2));
                    c.fade_in_ms = dur;
                    c.fade_out_ms = dur;
                  })}
                  className="px-1.5 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-ai hover:text-white rounded text-[8.5px] border border-cinema-ai/40 transition-colors"
                  title="Apply balanced equal-power crossfade curves"
                >
                  + Balanced Crossfade
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-cinema-textDim block mb-1">Fade In (ms)</label>
                  <input
                    type="number"
                    data-testid="inspector-fade-in-input"
                    min={0}
                    max={selectedClip.duration_ms}
                    step={50}
                    value={selectedClip.fade_in_ms}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(selectedClip.duration_ms, parseInt(e.target.value) || 0));
                      update((c) => { c.fade_in_ms = val; });
                    }}
                    className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-cinema-textDim block mb-1">Fade Out (ms)</label>
                  <input
                    type="number"
                    data-testid="inspector-fade-out-input"
                    min={0}
                    max={selectedClip.duration_ms}
                    step={50}
                    value={selectedClip.fade_out_ms}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(selectedClip.duration_ms, parseInt(e.target.value) || 0));
                      update((c) => { c.fade_out_ms = val; });
                    }}
                    className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                  />
                </div>
              </div>
            </div>

            {/* 3. 5-BAND EQUALIZER */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  5-Band Cinema EQ
                </span>
                <button
                  type="button"
                  onClick={() => update((c) => {
                    if (!c.metadata_info) c.metadata_info = {};
                    c.metadata_info.equalizer = { low_80: 0, low_mid_250: 0, mid_1000: 0, high_mid_4000: 0, high_12000: 0 };
                  })}
                  className="text-[9px] text-cinema-textDim hover:text-white"
                >
                  Reset Flat
                </button>
              </div>

              {/* EQ Presets */}
              <div className="flex flex-wrap gap-1">
                {[
                  { name: 'Voice Clarity', eq: { low_80: -3, low_mid_250: -2, mid_1000: 1, high_mid_4000: 3, high_12000: 2 } },
                  { name: 'Dialogue (Tamil)', eq: { low_80: -4, low_mid_250: 0, mid_1000: 2.5, high_mid_4000: 3.5, high_12000: 1 } },
                  { name: 'Music Warmth', eq: { low_80: 2.5, low_mid_250: 1.5, mid_1000: -1, high_mid_4000: 1, high_12000: 2 } },
                  { name: 'Bass Boost', eq: { low_80: 6, low_mid_250: 3, mid_1000: 0, high_mid_4000: 0, high_12000: -1 } },
                  { name: 'Bright / Air', eq: { low_80: -2, low_mid_250: 0, mid_1000: 1, high_mid_4000: 4, high_12000: 5 } },
                  { name: 'Cinema Punch', eq: { low_80: 4, low_mid_250: -2, mid_1000: 1, high_mid_4000: 3, high_12000: 3 } },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      c.metadata_info.equalizer = { ...preset.eq };
                    })}
                    className="px-1.5 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text rounded text-[9px] border border-cinema-border/60 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              {/* 5 Sliders: 80Hz, 250Hz, 1kHz, 4kHz, 12kHz */}
              <div className="space-y-1.5 pt-1">
                {[
                  { band: 'low_80', label: 'Low (80 Hz)' },
                  { band: 'low_mid_250', label: 'Low-Mid (250 Hz)' },
                  { band: 'mid_1000', label: 'Mid (1 kHz)' },
                  { band: 'high_mid_4000', label: 'High-Mid (4 kHz)' },
                  { band: 'high_12000', label: 'High (12 kHz)' },
                ].map(({ band, label }) => {
                  const eqState = selectedClip.metadata_info?.equalizer || {};
                  const val = eqState[band] ?? 0.0;
                  return (
                    <SliderRow
                      key={band}
                      label={label}
                      value={val}
                      min={-15}
                      max={15}
                      step={0.5}
                      unit=" dB"
                      accentClass="accent-cyan-400"
                      onChange={(v) => update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.equalizer) c.metadata_info.equalizer = {};
                        c.metadata_info.equalizer[band] = v;
                      })}
                    />
                  );
                })}
              </div>
            </div>

            {/* 4. DYNAMICS / COMPRESSOR */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text">Dynamics (Compressor)</span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
                  <input
                    type="checkbox"
                    checked={!!selectedClip.metadata_info?.compressor?.enabled}
                    onChange={(e) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.compressor) c.metadata_info.compressor = {
                        enabled: true, threshold_db: -18, ratio: 3.5, attack_ms: 20, release_ms: 120, makeup_gain_db: 3.0
                      };
                      c.metadata_info.compressor.enabled = e.target.checked;
                    })}
                    className="rounded accent-cinema-ai"
                  />
                  <span>Enable</span>
                </label>
              </div>

              {/* Compressor Presets */}
              <div className="flex gap-1">
                {[
                  { name: 'Dialogue', cfg: { threshold_db: -18, ratio: 3.5, attack_ms: 20, release_ms: 120, makeup_gain_db: 3.0 } },
                  { name: 'Voice Over', cfg: { threshold_db: -20, ratio: 4.0, attack_ms: 15, release_ms: 100, makeup_gain_db: 4.0 } },
                  { name: 'Music Bus', cfg: { threshold_db: -12, ratio: 2.0, attack_ms: 40, release_ms: 250, makeup_gain_db: 1.5 } },
                  { name: 'Master', cfg: { threshold_db: -3, ratio: 8.0, attack_ms: 5, release_ms: 60, makeup_gain_db: 0.0 } },
                ].map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      c.metadata_info.compressor = { enabled: true, ...p.cfg };
                    })}
                    className="px-1.5 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text rounded text-[9px] border border-cinema-border/60 transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              {selectedClip.metadata_info?.compressor?.enabled && (
                <div className="space-y-2 pt-1 border-t border-cinema-border/50">
                  <SliderRow
                    label="Threshold"
                    value={selectedClip.metadata_info?.compressor?.threshold_db ?? -18}
                    min={-40}
                    max={0}
                    step={1}
                    unit=" dB"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                      c.metadata_info.compressor.threshold_db = v;
                    })}
                  />
                  <SliderRow
                    label="Ratio"
                    value={selectedClip.metadata_info?.compressor?.ratio ?? 3.5}
                    min={1}
                    max={20}
                    step={0.5}
                    unit=":1"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                      c.metadata_info.compressor.ratio = v;
                    })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <NumberRow
                      label="Attack (ms)"
                      value={selectedClip.metadata_info?.compressor?.attack_ms ?? 20}
                      min={1}
                      max={200}
                      onChange={(v) => update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                        c.metadata_info.compressor.attack_ms = v;
                      })}
                    />
                    <NumberRow
                      label="Release (ms)"
                      value={selectedClip.metadata_info?.compressor?.release_ms ?? 120}
                      min={10}
                      max={1000}
                      onChange={(v) => update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                        c.metadata_info.compressor.release_ms = v;
                      })}
                    />
                  </div>
                  <SliderRow
                    label="Makeup Gain"
                    value={selectedClip.metadata_info?.compressor?.makeup_gain_db ?? 3}
                    min={0}
                    max={24}
                    step={0.5}
                    unit=" dB"
                    accentClass="accent-emerald-500"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                      c.metadata_info.compressor.makeup_gain_db = v;
                    })}
                  />
                </div>
              )}
            </div>

            {/* 5. NOISE REDUCTION */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text">Noise Reduction</span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
                  <input
                    type="checkbox"
                    checked={!!selectedClip.metadata_info?.noise_reduction?.enabled}
                    onChange={(e) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.noise_reduction) c.metadata_info.noise_reduction = { enabled: true, mode: 'medium', amount_db: -12 };
                      c.metadata_info.noise_reduction.enabled = e.target.checked;
                    })}
                    className="rounded accent-cinema-ai"
                  />
                  <span>Enable</span>
                </label>
              </div>

              {selectedClip.metadata_info?.noise_reduction?.enabled && (
                <div className="space-y-2 pt-1 border-t border-cinema-border/50">
                  <div className="flex gap-1">
                    {[
                      { mode: 'light', label: 'Light (-6dB)', db: -6 },
                      { mode: 'medium', label: 'Medium (-12dB)', db: -12 },
                      { mode: 'strong', label: 'Strong (-18dB)', db: -18 },
                    ].map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        onClick={() => update((c) => {
                          if (!c.metadata_info) c.metadata_info = {};
                          if (!c.metadata_info.noise_reduction) c.metadata_info.noise_reduction = {};
                          c.metadata_info.noise_reduction.mode = m.mode;
                          c.metadata_info.noise_reduction.amount_db = m.db;
                        })}
                        className={`flex-1 py-1 rounded text-[10px] border transition-colors ${
                          selectedClip.metadata_info?.noise_reduction?.mode === m.mode
                            ? 'bg-cinema-ai/20 border-cinema-ai text-cinema-ai font-semibold'
                            : 'bg-cinema-850 border-cinema-border text-cinema-textDim hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <SliderRow
                    label="Suppression Amount"
                    value={selectedClip.metadata_info?.noise_reduction?.amount_db ?? -12}
                    min={-24}
                    max={0}
                    step={1}
                    unit=" dB"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.noise_reduction) c.metadata_info.noise_reduction = {};
                      c.metadata_info.noise_reduction.amount_db = v;
                      c.metadata_info.noise_reduction.mode = 'custom';
                    })}
                  />
                </div>
              )}
            </div>

            {/* 6. AUDIO DUCKING */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text">Audio Ducking</span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
                  <input
                    type="checkbox"
                    checked={!!selectedClip.metadata_info?.ducking?.enabled}
                    onChange={(e) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.ducking) c.metadata_info.ducking = {
                        enabled: true, source_role: 'dialogue', duck_amount_db: -12, attack_ms: 200, release_ms: 500
                      };
                      c.metadata_info.ducking.enabled = e.target.checked;
                    })}
                    className="rounded accent-cinema-ai"
                  />
                  <span>Enable</span>
                </label>
              </div>

              {selectedClip.metadata_info?.ducking?.enabled && (
                <div className="space-y-2 pt-1 border-t border-cinema-border/50">
                  <div className="flex items-center justify-between text-[10px] text-cinema-textDim">
                    <span>Duck Against:</span>
                    <select
                      value={selectedClip.metadata_info?.ducking?.source_role || 'dialogue'}
                      onChange={(e) => update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.ducking) c.metadata_info.ducking = {};
                        c.metadata_info.ducking.source_role = e.target.value;
                      })}
                      className="bg-cinema-850 border border-cinema-border rounded px-2 py-0.5 text-cinema-text text-[10px]"
                    >
                      <option value="dialogue">A1 Dialogue (Tamil)</option>
                      <option value="voiceover">A2 Voice Over</option>
                    </select>
                  </div>
                  <SliderRow
                    label="Ducking Reduction"
                    value={selectedClip.metadata_info?.ducking?.duck_amount_db ?? -12}
                    min={-30}
                    max={-6}
                    step={1}
                    unit=" dB"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.ducking) c.metadata_info.ducking = {};
                      c.metadata_info.ducking.duck_amount_db = v;
                    })}
                  />
                </div>
              )}
            </div>

            {/* 7. AUTOMATION & KEYFRAMES */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text">Automation Keyframes</span>
                <span className="text-[9px] font-mono text-cinema-ai">
                  {selectedClip.keyframes?.filter((k) => k.property_path.startsWith('volume') || k.property_path === 'pan').length || 0} pts
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const timeOffsetMs = Math.max(0, playheadMs - selectedClip.start_time_ms);
                    addKeyframe(selectedClip.id, {
                      id: crypto.randomUUID(),
                      property_path: 'volume_db',
                      time_offset_ms: timeOffsetMs,
                      value: selectedClip.volume_db,
                      interpolation: 'linear',
                    });
                    showNotification(`Added Volume Keyframe at ${Math.round(timeOffsetMs / 1000)}s`, 'info');
                  }}
                  className="flex-1 py-1.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text rounded text-[10px] font-medium border border-cinema-border transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3 text-emerald-400" />
                  + Vol Keyframe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const timeOffsetMs = Math.max(0, playheadMs - selectedClip.start_time_ms);
                    addKeyframe(selectedClip.id, {
                      id: crypto.randomUUID(),
                      property_path: 'pan',
                      time_offset_ms: timeOffsetMs,
                      value: selectedClip.pan ?? 0.0,
                      interpolation: 'linear',
                    });
                    showNotification(`Added Pan Keyframe at ${Math.round(timeOffsetMs / 1000)}s`, 'info');
                  }}
                  className="flex-1 py-1.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text rounded text-[10px] font-medium border border-cinema-border transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3 text-cyan-400" />
                  + Pan Keyframe
                </button>
              </div>

              {/* Keyframe list */}
              {(selectedClip.keyframes?.filter((k) => k.property_path.startsWith('volume') || k.property_path === 'pan').length || 0) > 0 && (
                <div className="space-y-1 pt-1 max-h-24 overflow-y-auto">
                  {selectedClip.keyframes
                    .filter((k) => k.property_path.startsWith('volume') || k.property_path === 'pan')
                    .map((kf, i) => (
                      <div key={kf.id || i} className="flex items-center justify-between px-2 py-1 bg-cinema-850 rounded text-[9px] font-mono">
                        <span className={kf.property_path === 'pan' ? 'text-cyan-400' : 'text-emerald-400'}>
                          {kf.property_path === 'pan' ? 'PAN' : 'VOL'}: {typeof kf.value === 'number' ? kf.value.toFixed(1) : kf.value}
                        </span>
                        <span className="text-cinema-textDim">+{Math.round(kf.time_offset_ms / 100) / 10}s</span>
                        {kf.id && (
                          <button
                            type="button"
                            onClick={() => deleteKeyframe(selectedClip.id, kf.id!)}
                            className="text-red-400 hover:text-red-300 ml-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 8. AI AUDIO CLEANUP */}
            <div className="p-2.5 bg-gradient-to-br from-cinema-900 to-cinema-850 rounded border border-cinema-ai/30 space-y-2">
              <div className="flex items-center gap-1.5 text-cinema-ai font-semibold text-xs">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>AI Audio Processing</span>
              </div>
              <div className="space-y-1.5">
                {[
                  'AI Dialog Isolation (Tamil)',
                  'AI De-Reverb (Studio Dry)',
                  'AI Electrical De-Hum (50/60Hz)',
                ].map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleAIStub(action)}
                    className="w-full py-1.5 px-2.5 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-left flex items-center justify-between text-cinema-text text-[10px] transition-colors"
                  >
                    <span>{action}</span>
                    <Sparkles className="w-3 h-3 text-cinema-ai" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: TEXT ─── */}
        {activeInspectorTab === 'text' && selectedClip && (
          <div className="space-y-3">
            {/* Graphics Preset Banner if clip has graphics metadata */}
            {selectedClip.metadata_info?.graphics && (
              <div className="p-2.5 rounded-lg bg-orange-950/40 border border-orange-600/40 flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-orange-400 font-bold block">
                    Cinematic Graphics Preset
                  </span>
                  <span className="text-[11px] font-semibold text-white">
                    {(selectedClip.metadata_info.graphics.preset_id as string) || 'Custom Title'}
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-orange-900/60 border border-orange-700/50 text-[10px] text-orange-200 font-mono">
                  {selectedClip.metadata_info.graphics.alignment || 'center'}
                </span>
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-cinema-text block mb-1">
                {selectedClip.metadata_info?.graphics ? 'Primary Title Text' : 'Text Content'}
              </label>
              <textarea
                value={
                  (selectedClip.metadata_info?.graphics?.title as string) ??
                  (selectedClip.metadata_info?.text?.content as string) ??
                  selectedClip.name.replace(/^Title:\s*/, '')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  update((c) => {
                    if (!c.metadata_info) c.metadata_info = {};
                    if (!c.metadata_info.text) c.metadata_info.text = {};
                    c.metadata_info.text.content = val;
                    if (c.metadata_info.graphics) {
                      c.metadata_info.graphics.title = val;
                    }
                    if (c.clip_type === 'title') {
                      c.name = `Title: ${val}`;
                    }
                  });
                }}
                rows={2}
                placeholder="Enter title text..."
                className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1.5 text-cinema-text text-[11px] outline-none focus:border-cinema-ai resize-none"
              />
            </div>

            {/* Subtitle / Secondary text for Graphics clips */}
            {selectedClip.metadata_info?.graphics && (
              <div>
                <label className="text-[10px] font-semibold text-cinema-textDim block mb-1">
                  Subtitle / Secondary Line
                </label>
                <input
                  type="text"
                  value={(selectedClip.metadata_info.graphics.subtitle as string) ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.graphics) c.metadata_info.graphics = {};
                      c.metadata_info.graphics.subtitle = val;
                    });
                  }}
                  placeholder="Enter secondary line..."
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 text-cinema-text text-[11px] outline-none focus:border-cinema-ai"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Font Family</label>
                <select
                  value={
                    (selectedClip.metadata_info?.graphics?.font_family as string) ??
                    (selectedClip.metadata_info?.text?.font_family as string) ??
                    'Noto Sans Tamil'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.text) c.metadata_info.text = {};
                      c.metadata_info.text.font_family = val;
                      if (c.metadata_info.graphics) c.metadata_info.graphics.font_family = val;
                    });
                  }}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 text-cinema-text text-[10px] outline-none"
                >
                  <option value="Noto Sans Tamil">Tamil (Noto Sans)</option>
                  <option value="Nirmala UI">Nirmala UI</option>
                  <option value="Inter">Inter (Sans)</option>
                  <option value="Consolas">Consolas (Mono)</option>
                  <option value="serif">Serif</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Font Size (px)</label>
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={
                    (selectedClip.metadata_info?.graphics?.font_size as number) ??
                    (selectedClip.metadata_info?.text?.font_size as number) ??
                    44
                  }
                  onChange={(e) => {
                    const sz = parseInt(e.target.value) || 36;
                    update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.text) c.metadata_info.text = {};
                      c.metadata_info.text.font_size = sz;
                      if (c.metadata_info.graphics) c.metadata_info.graphics.font_size = sz;
                    });
                  }}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Text Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={
                      (selectedClip.metadata_info?.graphics?.font_color as string) ??
                      (selectedClip.metadata_info?.text?.font_color as string) ??
                      '#ffffff'
                    }
                    onChange={(e) => {
                      const col = e.target.value;
                      update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.text) c.metadata_info.text = {};
                        c.metadata_info.text.font_color = col;
                        if (c.metadata_info.graphics) c.metadata_info.graphics.font_color = col;
                      });
                    }}
                    className="w-7 h-7 bg-cinema-900 border border-cinema-border rounded cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-cinema-textDim truncate">
                    {(selectedClip.metadata_info?.graphics?.font_color as string) || '#ffffff'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Backdrop Opacity</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={(selectedClip.metadata_info?.graphics?.box_opacity as number) ?? 0.6}
                  onChange={(e) => {
                    const op = parseFloat(e.target.value);
                    update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.graphics) c.metadata_info.graphics = {};
                      c.metadata_info.graphics.box_opacity = op;
                    });
                  }}
                  className="w-full accent-orange-500 bg-cinema-900 h-1.5 rounded cursor-pointer mt-2"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-cinema-textDim block mb-1">Alignment / Layout</label>
              <div className="grid grid-cols-4 gap-1">
                {(['center', 'lower_third', 'top_left', 'bottom'] as const).map((align) => {
                  const currentAlign =
                    (selectedClip.metadata_info?.graphics?.alignment as string) ||
                    (selectedClip.metadata_info?.text?.alignment as string) ||
                    'center';
                  return (
                    <button
                      key={align}
                      type="button"
                      onClick={() =>
                        update((c) => {
                          if (!c.metadata_info) c.metadata_info = {};
                          if (!c.metadata_info.text) c.metadata_info.text = {};
                          c.metadata_info.text.alignment = align;
                          if (c.metadata_info.graphics) c.metadata_info.graphics.alignment = align;
                          if (align === 'lower_third') {
                            c.position_x = 0.08;
                            c.position_y = 0.80;
                          } else if (align === 'top_left') {
                            c.position_x = 0.06;
                            c.position_y = 0.12;
                          } else if (align === 'bottom') {
                            c.position_x = 0.5;
                            c.position_y = 0.82;
                          } else {
                            c.position_x = 0.5;
                            c.position_y = 0.5;
                          }
                        })
                      }
                      className={`py-1 rounded border text-[9px] uppercase tracking-wider transition-colors ${
                        currentAlign === align
                          ? 'bg-orange-600 border-orange-500 text-white font-bold'
                          : 'bg-cinema-900 border-cinema-border text-cinema-textDim hover:text-white'
                      }`}
                    >
                      {align.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cinema-border/50">
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Fade In (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={100}
                  value={selectedClip.fade_in_ms ?? 0}
                  onChange={(e) => {
                    const fi = parseInt(e.target.value) || 0;
                    update((c) => {
                      c.fade_in_ms = fi;
                    });
                  }}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Fade Out (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={100}
                  value={selectedClip.fade_out_ms ?? 0}
                  onChange={(e) => {
                    const fo = parseInt(e.target.value) || 0;
                    update((c) => {
                      c.fade_out_ms = fo;
                    });
                  }}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: AI ─── */}
        {activeInspectorTab === 'ai' && (
          <div className="space-y-3">
            <div className="p-3 bg-gradient-to-br from-cinema-800 to-cinema-900 rounded-lg border border-cinema-ai/30 space-y-2">
              <div className="flex items-center gap-1.5 text-cinema-ai font-semibold text-xs">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>AI Clip Operations</span>
              </div>
              <p className="text-[11px] text-cinema-textDim">
                Configure an AI provider in Settings to enable these operations.
              </p>
            </div>

            <div className="space-y-2">
              {[
                'AI Scene Regeneration',
                'AI Scene Extension (+4s)',
                'Change Background / Sky',
                'Re-align Tamil Lip Sync',
                'Remove Background (Roto)',
                'AI Object Removal',
              ].map((action) => (
                <button
                  key={action}
                  onClick={() => handleAIStub(action)}
                  className="w-full py-2 px-3 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-left flex items-center justify-between text-cinema-text group transition-colors text-[11px]"
                >
                  <span>{action}</span>
                  <Sparkles className="w-3.5 h-3.5 text-cinema-ai group-hover:scale-110 transition-transform" />
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// COLOR INSPECTOR — Phase 5 full implementation
// ═══════════════════════════════════════════════════════════════════

interface ColorInspectorContentProps {
  selectedClip: Clip;
  update: (updater: (clip: Clip) => void) => void;
  showNotification: (msg: string, type?: 'error' | 'info' | 'success' | 'warning') => void;
}

const ColorInspectorContent: React.FC<ColorInspectorContentProps> = ({ selectedClip, update, showNotification }) => {
  const [luts, setLuts] = useState<Array<{ id: string; name: string; path: string }>>([]);
  const [loadingLuts, setLoadingLuts] = useState(false);
  const [scopeUrl, setScopeUrl] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<'waveform' | 'histogram' | 'vectorscope'>('waveform');
  const [loadingScope, setLoadingScope] = useState(false);
  const [trackingResult, setTrackingResult] = useState<string | null>(null);
  const [stabResult, setStabResult] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const cg = (selectedClip.metadata_info?.color_grade || {}) as Record<string, any>;
  const hsl = (cg.hsl || {}) as Record<string, any>;

  const updateCG = useCallback((key: string, val: unknown) => {
    update((c) => {
      if (!c.metadata_info) c.metadata_info = {};
      if (!c.metadata_info.color_grade) c.metadata_info.color_grade = {};
      c.metadata_info.color_grade[key] = val;
    });
  }, [update]);

  const updateHSL = useCallback((key: string, val: unknown) => {
    update((c) => {
      if (!c.metadata_info) c.metadata_info = {};
      if (!c.metadata_info.color_grade) c.metadata_info.color_grade = {};
      if (!c.metadata_info.color_grade.hsl) c.metadata_info.color_grade.hsl = { enabled: true };
      c.metadata_info.color_grade.hsl[key] = val;
    });
  }, [update]);

  useEffect(() => {
    setLoadingLuts(true);
    api.get('/luts').then(r => { setLuts(r.data); }).catch(() => {}).finally(() => setLoadingLuts(false));
  }, []);

  const handleLoadScope = async () => {
    const filePath = (selectedClip as any).file_path || (selectedClip.asset_id ? `assets/${selectedClip.asset_id}` : null);
    if (!filePath) { showNotification('No source file on this clip', 'warning'); return; }
    setLoadingScope(true);
    setScopeUrl(null);
    try {
      const r = await api.post('/scopes/analyze', { file_path: filePath, scope_type: scopeType });
      if (r.data.status === 'unavailable') {
        showNotification(`Scopes unavailable: ${r.data.message}`, 'warning');
      } else if (r.data.scope_url) {
        setScopeUrl(r.data.scope_url);
      }
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Scope analysis failed', 'error');
    } finally {
      setLoadingScope(false);
    }
  };

  const handleTracking = async () => {
    const filePath = (selectedClip as any).file_path || (selectedClip.asset_id ? `assets/${selectedClip.asset_id}` : null);
    if (!filePath) { showNotification('No source file on this clip', 'warning'); return; }
    setProcessing('tracking');
    setTrackingResult(null);
    try {
      const r = await api.post('/tracking/analyze', { file_path: filePath, end_frame: 30 });
      if (r.data.status === 'unavailable') {
        setTrackingResult(`Unavailable: ${r.data.message}`);
      } else {
        setTrackingResult(`Tracked ${r.data.tracked_points?.length || 0} points over ${r.data.end_frame || 0} frames`);
      }
    } catch (e: any) {
      setTrackingResult(`Error: ${e?.response?.data?.detail || 'failed'}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleStabilize = async () => {
    const filePath = (selectedClip as any).file_path || (selectedClip.asset_id ? `assets/${selectedClip.asset_id}` : null);
    if (!filePath) { showNotification('No source file on this clip', 'warning'); return; }
    setProcessing('stabilize');
    setStabResult(null);
    try {
      const r = await api.post('/stabilization/analyze', { file_path: filePath });
      if (r.data.status === 'unavailable') {
        setStabResult(`Unavailable: ${r.data.message}`);
      } else {
        setStabResult(`Job enqueued: ${r.data.job_id}`);
      }
    } catch (e: any) {
      setStabResult(`Error: ${e?.response?.data?.detail || 'failed'}`);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-4" id="color-inspector">

      {/* ─── COLOR BASICS ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2.5">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-cinema-ai" /> Color Basics
        </span>

        <SliderRow label="Saturation" value={cg.saturation ?? 1.0} min={0} max={2} step={0.01}
          onChange={v => updateCG('saturation', v)} />
        <SliderRow label="Contrast" value={cg.contrast ?? 1.0} min={0} max={2} step={0.01}
          onChange={v => updateCG('contrast', v)} />
        <SliderRow label="Brightness" value={cg.brightness ?? 0.0} min={-1} max={1} step={0.01}
          onChange={v => updateCG('brightness', v)} />
        <SliderRow label="Temperature (K)" value={cg.temperature ?? 6500} min={2000} max={10000} step={100} unit="K"
          accentClass="accent-amber-500" onChange={v => updateCG('temperature', v)} />
        <SliderRow label="Exposure (EV)" value={cg.exposure ?? 0.0} min={-5} max={5} step={0.1}
          onChange={v => updateCG('exposure', v)} />
        <SliderRow label="Highlights" value={cg.highlights ?? 0.0} min={-1} max={1} step={0.01}
          onChange={v => updateCG('highlights', v)} />
        <SliderRow label="Shadows" value={cg.shadows ?? 0.0} min={-1} max={1} step={0.01}
          onChange={v => updateCG('shadows', v)} />
        <SliderRow label="Hue Shift (°)" value={cg.hue_shift ?? 0} min={-180} max={180} step={1} unit="°"
          accentClass="accent-purple-500" onChange={v => updateCG('hue_shift', v)} />
        <SliderRow label="Film Grain" value={cg.grain_strength ?? 0} min={0} max={100} step={1}
          onChange={v => updateCG('grain_strength', v)} />
        <SliderRow label="Blur" value={cg.blur ?? 0} min={0} max={50} step={0.5}
          onChange={v => updateCG('blur', v)} />
      </div>

      {/* ─── HSL QUALIFIER ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white">HSL Qualifier</span>
          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
            <input type="checkbox" checked={!!hsl.enabled}
              onChange={e => updateHSL('enabled', e.target.checked)}
              className="rounded accent-cinema-ai" />
            Enable
          </label>
        </div>
        {hsl.enabled && (
          <div className="space-y-1.5 pt-1 border-t border-cinema-border/50">
            <SliderRow label="Hue Adjust" value={hsl.hue_adjust ?? 0} min={-180} max={180} step={1} unit="°"
              accentClass="accent-purple-400" onChange={v => updateHSL('hue_adjust', v)} />
            <SliderRow label="Saturation" value={hsl.sat_adjust ?? 1.0} min={0} max={3} step={0.01}
              accentClass="accent-pink-400" onChange={v => updateHSL('sat_adjust', v)} />
            <SliderRow label="Luminance" value={hsl.luma_adjust ?? 1.0} min={0} max={3} step={0.01}
              accentClass="accent-yellow-400" onChange={v => updateHSL('luma_adjust', v)} />
          </div>
        )}
      </div>

      {/* ─── RGB CURVES ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
        <span className="text-[11px] font-semibold text-white">RGB Curves</span>
        <p className="text-[10px] text-cinema-textDim">
          Curves stored as {JSON.stringify((cg.curves) || 'linear')} — edit via curve points below.
        </p>
        {(['master', 'red', 'green', 'blue'] as const).map(ch => {
          const colors: Record<string, string> = {
            master: 'accent-white', red: 'accent-red-400', green: 'accent-green-400', blue: 'accent-blue-400'
          };
          const labels: Record<string, string> = { master: 'Master (All)', red: 'Red', green: 'Green', blue: 'Blue' };
          const pts: [number, number][] = Array.isArray((cg.curves as any)?.[ch]) ? (cg.curves as any)[ch] : [[0, 0], [1, 1]];
          const midY = pts.find(p => Math.abs(p[0] - 0.5) < 0.1)?.[1] ?? 0.5;
          return (
            <div key={ch} className="space-y-1">
              <label className="text-[10px] text-cinema-textDim">{labels[ch]}</label>
              <input type="range" min={0} max={1} step={0.01} value={midY}
                className={`w-full ${colors[ch]}`}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  update(c => {
                    if (!c.metadata_info) c.metadata_info = {};
                    if (!c.metadata_info.color_grade) c.metadata_info.color_grade = {};
                    if (!c.metadata_info.color_grade.curves) c.metadata_info.color_grade.curves = {};
                    c.metadata_info.color_grade.curves[ch] = [[0, 0], [0.5, v], [1, 1]];
                  });
                }}
              />
              <div className="flex justify-between text-[8px] font-mono text-cinema-textDim px-0.5">
                <span>Blacks</span><span className="text-cinema-ai">{midY.toFixed(2)}</span><span>Whites</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── LUT SELECTOR ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
        <span className="text-[11px] font-semibold text-white">3D LUT</span>
        {loadingLuts ? (
          <div className="flex items-center gap-1.5 text-cinema-textDim text-[10px]">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading LUTs...
          </div>
        ) : luts.length === 0 ? (
          <p className="text-[10px] text-cinema-textDim">No LUTs available. Upload .cube files in the Color panel.</p>
        ) : (
          <select
            id="lut-selector"
            value={(cg.lut_path as string) || ''}
            onChange={e => updateCG('lut_path', e.target.value || null)}
            className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1.5 text-cinema-text text-[11px] outline-none"
          >
            <option value="">— None —</option>
            {luts.map(l => (
              <option key={l.id} value={l.path}>{l.name}</option>
            ))}
          </select>
        )}
        {cg.lut_path && (
          <p className="text-[9px] text-cinema-ai font-mono truncate">LUT: {String(cg.lut_path).split('/').pop()}</p>
        )}
      </div>

      {/* ─── SCOPES VIEWER ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2" id="scopes-section">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" /> Video Scopes
        </span>
        <div className="flex gap-1">
          {(['waveform', 'histogram', 'vectorscope'] as const).map(t => (
            <button key={t} onClick={() => setScopeType(t)}
              className={`flex-1 py-1 rounded text-[9px] font-medium border transition-colors capitalize ${
                scopeType === t ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-cinema-850 border-cinema-border text-cinema-textDim hover:text-white'
              }`}>
              {t}
            </button>
          ))}
        </div>
        <button
          id="load-scope-btn"
          onClick={handleLoadScope}
          disabled={loadingScope}
          className="w-full py-1.5 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-[10px] text-cinema-text transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {loadingScope ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</> : <><ScanLine className="w-3 h-3" /> Load {scopeType}</>}
        </button>
        {scopeUrl && (
          <img src={`http://localhost:8000${scopeUrl}`} alt={scopeType} className="w-full rounded border border-cinema-border" />
        )}
      </div>

      {/* ─── MOTION TRACKING ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2" id="tracking-section">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5 text-emerald-400" /> Motion Tracking
        </span>
        <button
          id="launch-tracking-btn"
          onClick={handleTracking}
          disabled={processing === 'tracking'}
          className="w-full py-1.5 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-[10px] text-cinema-text transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {processing === 'tracking' ? <><Loader2 className="w-3 h-3 animate-spin" /> Tracking...</> : <><Crosshair className="w-3 h-3" /> Analyze Track (OpenCV)</>}
        </button>
        {trackingResult && (
          <p className={`text-[10px] ${trackingResult.startsWith('Unavailable') || trackingResult.startsWith('Error') ? 'text-amber-400' : 'text-emerald-400'}`}>
            {trackingResult}
          </p>
        )}
      </div>

      {/* ─── STABILIZATION ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2" id="stabilization-section">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-amber-400" /> Stabilization
        </span>
        <button
          id="launch-stabilize-btn"
          onClick={handleStabilize}
          disabled={processing === 'stabilize'}
          className="w-full py-1.5 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-[10px] text-cinema-text transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {processing === 'stabilize' ? <><Loader2 className="w-3 h-3 animate-spin" /> Queuing...</> : <><RotateCw className="w-3 h-3" /> Enqueue Stabilization</>}
        </button>
        {stabResult && (
          <p className={`text-[10px] ${stabResult.startsWith('Unavailable') || stabResult.startsWith('Error') ? 'text-amber-400' : 'text-emerald-400'}`}>
            {stabResult}
          </p>
        )}
      </div>

    </div>
  );
};
