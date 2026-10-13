import React, { useRef, useCallback, useState, useEffect, memo, useMemo } from 'react';
import {
  ZoomIn, ZoomOut, Magnet, Volume2, VolumeX, Eye, EyeOff,
  Lock, Unlock, Scissors, Trash2, Copy, Repeat, CornerDownLeft, History, Clipboard, Layers, ArrowLeft,
  Bookmark, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus,
  Link, Unlink, FolderPlus, FolderMinus, Download, RefreshCw, Gauge,
  Maximize2, Clock, Map as MapIcon,
} from 'lucide-react';
import { useTimelineStore, calculateTrackGaps } from '../../stores/useTimelineStore';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { Track, Clip, Asset, Keyframe, TimelineMarker, MarkerColor, MARKER_COLORS, MARKER_COLOR_MAP } from '../../types';
import { WaveformBar } from './WaveformBar';
import { TransitionPicker } from './TransitionPicker';
import { TimelineRevisionsModal } from './TimelineRevisionsModal';
import { TimelineMiniMap } from './TimelineMiniMap';
import { api } from '../../services/api';
import { useIsMobile } from '../../hooks/useMediaQuery';

const RULER_HEIGHT = 24;
const DEFAULT_TRACK_HEIGHT = 36;
const HEADER_WIDTH = 160;
const TRIM_HANDLE_WIDTH = 6;

// Track colour mapping by role
const TRACK_COLORS: Record<string, string> = {
  video: '#2563eb',
  dialogue: '#16a34a',
  voiceover: '#059669',
  music: '#d97706',
  sfx: '#7c3aed',
  ambience: '#0891b2',
  captions: '#db2777',
  graphics: '#ea580c',
  adjustment: '#475569',
  custom: '#64748b',
};

function formatTimecode(ms: number, fps = 30): string {
  const totalFrames = Math.floor((ms / 1000) * fps);
  const frames = totalFrames % fps;
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  return hr > 0
    ? `${hr}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
    : `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

// ───────────────────────────── TrackHeader ─────────────────────────────
interface TrackHeaderProps {
  track: Track;
  index: number;
  totalTracks: number;
  onContextMenu?: (e: React.MouseEvent, trackId: string) => void;
}

const TrackHeader = memo<TrackHeaderProps>(({ track, index, totalTracks, onContextMenu }) => {
  const {
    toggleTrackMute, toggleTrackSolo, toggleTrackLock, toggleTrackVisibility,
    selectedTrackId, selectTrack, selectClip, renameTrack, deleteTrack, reorderTrack,
    targetVideoTrackId, targetAudioTrackId, setTargetTrack, timeline,
  } = useTimelineStore();
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(track.name);
  const isSelected = selectedTrackId === track.id;
  const isAudio = track.track_type === 'audio' || ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(track.track_role);
  const color = TRACK_COLORS[track.track_role] || '#475569';
  const height = track.height_px || DEFAULT_TRACK_HEIGHT;

  const firstUnlockedAudioId = useMemo(() => {
    return timeline?.tracks.find((t) => (t.track_type === 'audio' || ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(t.track_role)) && !t.is_locked)?.id;
  }, [timeline]);

  const firstUnlockedVideoId = useMemo(() => {
    return timeline?.tracks.find((t) => (t.track_type === 'video' || t.track_role === 'video' || t.track_role === 'graphics') && !t.is_locked)?.id;
  }, [timeline]);

  const isAudioTarget = isAudio && (targetAudioTrackId === track.id || (!targetAudioTrackId && firstUnlockedAudioId === track.id));
  const isVideoTarget = !isAudio && (targetVideoTrackId === track.id || (!targetVideoTrackId && firstUnlockedVideoId === track.id));

  useEffect(() => {
    setTempName(track.name);
  }, [track.name]);

  const handleCommitName = () => {
    const trimmed = tempName.trim();
    if (trimmed && trimmed !== track.name) {
      renameTrack(track.id, trimmed);
    } else {
      setTempName(track.name);
    }
    setIsEditingName(false);
  };

  return (
    <div
      id={`track-header-${track.id}`}
      data-testid={`track-header-${track.id}`}
      className={`flex items-center gap-1 px-1.5 border-b border-cinema-border cursor-pointer select-none group
        ${isSelected ? 'bg-cinema-750' : 'bg-cinema-850 hover:bg-cinema-800'} transition-colors`}
      style={{ height, minHeight: height }}
      onClick={() => {
        selectTrack(track.id);
        selectClip(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, track.id);
      }}
    >
      {/* Color swatch */}
      <div
        className="w-1 h-5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        title={`Track Type: ${track.track_type} | Role: ${track.track_role}`}
      />

      {/* Track name / inline edit */}
      {isEditingName ? (
        <input
          id={`track-name-input-${track.id}`}
          data-testid={`track-name-input-${track.id}`}
          type="text"
          value={tempName}
          autoFocus
          onChange={(e) => setTempName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCommitName();
            else if (e.key === 'Escape') {
              setTempName(track.name);
              setIsEditingName(false);
            }
          }}
          onBlur={handleCommitName}
          onClick={(e) => e.stopPropagation()}
          className="text-[9px] bg-cinema-900 border border-cinema-ai/60 text-white rounded px-1 py-0.5 flex-1 mx-0.5 outline-none min-w-0"
        />
      ) : (
        <span
          id={`track-name-${track.id}`}
          data-testid={`track-name-${track.id}`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setTempName(track.name);
            setIsEditingName(true);
          }}
          className="text-[9px] text-cinema-textMuted font-medium truncate flex-1 mx-0.5 hover:text-white cursor-text"
          title={`${track.name} (Double-click to rename)`}
        >
          {track.name}
        </span>
      )}

      {/* Controls */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {isAudio ? (
          <>
            <button
              id={`track-target-a-${track.id}`}
              data-testid={`track-target-a-${track.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setTargetTrack(track.id, 'audio');
              }}
              className={`w-4 h-3.5 rounded text-[7.5px] font-bold font-mono transition-colors flex items-center justify-center ${
                isAudioTarget
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
                  : 'bg-cinema-750 text-cinema-textDim hover:text-emerald-300 hover:bg-cinema-700'
              }`}
              title={isAudioTarget ? 'Active Audio Target Destination [A1]' : 'Patch Audio Destination [A1]'}
            >
              A1
            </button>
            <button
              id={`track-mute-${track.id}`}
              data-testid={`track-mute-${track.id}`}
              onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}
              className={`w-3.5 h-3.5 rounded text-[8px] font-bold transition-colors flex items-center justify-center ${
                track.is_muted
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-cinema-750 text-cinema-textDim hover:text-red-400 hover:bg-cinema-700'
              }`}
              title={track.is_muted ? 'Unmute (M)' : 'Mute (M)'}
            >
              M
            </button>
            <button
              id={`track-solo-${track.id}`}
              data-testid={`track-solo-${track.id}`}
              onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id); }}
              className={`w-3.5 h-3.5 rounded text-[8px] font-bold transition-colors flex items-center justify-center ${
                track.is_solo
                  ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                  : 'bg-cinema-750 text-cinema-textDim hover:text-amber-400 hover:bg-cinema-700'
              }`}
              title={track.is_solo ? 'Disable Solo (S)' : 'Solo (S)'}
            >
              S
            </button>
            <span
              className="text-[7.5px] font-mono px-0.5 py-0.2 rounded bg-cinema-800 text-cinema-textDim border border-cinema-border/40"
              title={`Track Volume: ${track.volume_db ?? 0} dB`}
            >
              {(track.volume_db ?? 0) > 0 ? `+${track.volume_db}` : `${track.volume_db ?? 0}`}
            </span>
          </>
        ) : (
          <>
            <button
              id={`track-target-v-${track.id}`}
              data-testid={`track-target-v-${track.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setTargetTrack(track.id, 'video');
              }}
              className={`w-4 h-3.5 rounded text-[7.5px] font-bold font-mono transition-colors flex items-center justify-center ${
                isVideoTarget
                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                  : 'bg-cinema-750 text-cinema-textDim hover:text-blue-300 hover:bg-cinema-700'
              }`}
              title={isVideoTarget ? 'Active Video Target Destination [V1]' : 'Patch Video Destination [V1]'}
            >
              V1
            </button>
            <button
              id={`track-visibility-${track.id}`}
              data-testid={`track-visibility-${track.id}`}
              onClick={(e) => { e.stopPropagation(); toggleTrackVisibility(track.id); }}
              className={`p-0.5 rounded transition-colors ${!track.is_visible ? 'text-cinema-textDim' : 'text-cinema-text hover:text-white'}`}
              title={track.is_visible ? 'Hide Track' : 'Show Track'}
            >
              {track.is_visible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5 text-red-400" />}
            </button>
          </>
        )}

        {/* Lock button for both video and audio tracks */}
        <button
          id={`track-lock-${track.id}`}
          data-testid={`track-lock-${track.id}`}
          onClick={(e) => { e.stopPropagation(); toggleTrackLock(track.id); }}
          className={`p-0.5 rounded transition-colors ${track.is_locked ? 'text-amber-400' : 'text-cinema-textDim hover:text-cinema-text'}`}
          title={track.is_locked ? 'Unlock Track' : 'Lock Track'}
        >
          {track.is_locked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
        </button>

        {/* Move up / down buttons */}
        <button
          id={`track-move-up-${track.id}`}
          data-testid={`track-move-up-${track.id}`}
          disabled={index === 0}
          onClick={(e) => { e.stopPropagation(); reorderTrack(track.id, 'up'); }}
          className={`p-0.5 rounded transition-colors ${index === 0 ? 'text-cinema-border/40 cursor-not-allowed' : 'text-cinema-textDim hover:text-white'}`}
          title="Move Track Up"
        >
          <ChevronUp className="w-2.5 h-2.5" />
        </button>
        <button
          id={`track-move-down-${track.id}`}
          data-testid={`track-move-down-${track.id}`}
          disabled={index >= totalTracks - 1}
          onClick={(e) => { e.stopPropagation(); reorderTrack(track.id, 'down'); }}
          className={`p-0.5 rounded transition-colors ${index >= totalTracks - 1 ? 'text-cinema-border/40 cursor-not-allowed' : 'text-cinema-textDim hover:text-white'}`}
          title="Move Track Down"
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>

        {/* Delete Track button */}
        <button
          id={`track-delete-${track.id}`}
          data-testid={`track-delete-${track.id}`}
          onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }}
          className="p-0.5 rounded text-cinema-textDim hover:text-red-400 transition-colors"
          title="Delete Track"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
});
TrackHeader.displayName = 'TrackHeader';

// Helper functions for mapping volume dB (-60 to +12) to clip height in pixels
function volDbToY(db: number, height: number): number {
  const minDb = -60;
  const maxDb = 12;
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  const norm = (clamped - minDb) / (maxDb - minDb);
  return (height - 8) * (1 - norm) + 4;
}

function yToVolDb(y: number, height: number): number {
  const minDb = -60;
  const maxDb = 12;
  const norm = 1 - (y - 4) / Math.max(1, height - 8);
  const clampedNorm = Math.max(0, Math.min(1, norm));
  return Math.round(minDb + clampedNorm * (maxDb - minDb));
}

// ───────────────────────────── ClipBlock ─────────────────────────────
interface ClipBlockProps {
  clip: Clip;
  zoomLevel: number;
  trackColor: string;
  trackHeight: number;
  isAudioTrack: boolean;
  isTrackLocked?: boolean;
  waveformData?: number[];
  onOpenTransition?: (clipId: string, edge: 'out', e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent, clipId: string) => void;
  onEditMarker?: (marker: TimelineMarker, clipId?: string) => void;
  onSeek?: (ms: number) => void;
}

const ClipBlock = memo<ClipBlockProps>(({
  clip, zoomLevel, trackColor, trackHeight, isAudioTrack, isTrackLocked, waveformData, onOpenTransition, onContextMenu, onEditMarker, onSeek,
}) => {
  const {
    selectClip, trimClip, moveClipToTrack, scheduleAutoSave, pushHistory,
    moveKeyframe, updateKeyframeValue, deleteKeyframe, addKeyframe,
    snapEnabled, playheadMs, timeline, openCompoundClip, rippleEnabled,
    activeTimelineTool, slipClip, slideClip, rollEdit,
    razorCutClip, razorCutAllTracks, getRelatedClipIds,
    startTrimPreview, updateTrimPreview, endTrimPreview, isTrimPreviewActive,
  } = useTimelineStore();
  const [hoverCutX, setHoverCutX] = useState<number | null>(null);
  const { isSelected: isClipSelected, selectClip: selectInStore, toggleClipSelected } = useSelectionStore();
  const isSelected = isClipSelected(clip.id);
  const left = (clip.start_time_ms / 1000) * zoomLevel;
  const width = Math.max(4, (clip.duration_ms / 1000) * zoomLevel);
  const svgHeight = Math.max(20, trackHeight - 4);

  // Audio volume automation keyframes
  const volumeKeyframes = useMemo(() => {
    return (clip.keyframes || [])
      .filter((k) => k.property_path === 'volume_db')
      .sort((a, b) => a.time_offset_ms - b.time_offset_ms);
  }, [clip.keyframes]);

  const otherKeyframes = useMemo(() => {
    return (clip.keyframes || []).filter((k) => k.property_path !== 'volume_db');
  }, [clip.keyframes]);

  // Phase 39: Detect touching adjacent predecessor and successor clips for Rolling Edit
  const { touchingPred, touchingSucc } = useMemo(() => {
    if (!timeline?.tracks) return { touchingPred: null, touchingSucc: null };
    for (const t of timeline.tracks) {
      const idx = t.clips.findIndex((c) => c.id === clip.id);
      if (idx !== -1) {
        const sorted = [...t.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
        const sIdx = sorted.findIndex((c) => c.id === clip.id);
        const pred = sIdx > 0 ? sorted[sIdx - 1] : null;
        const succ = sIdx < sorted.length - 1 ? sorted[sIdx + 1] : null;
        const isPredTouching = pred ? Math.abs((pred.start_time_ms + pred.duration_ms) - clip.start_time_ms) <= 5 : false;
        const isSuccTouching = succ ? Math.abs((clip.start_time_ms + clip.duration_ms) - succ.start_time_ms) <= 5 : false;
        return {
          touchingPred: isPredTouching ? pred : null,
          touchingSucc: isSuccTouching ? succ : null,
        };
      }
    }
    return { touchingPred: null, touchingSucc: null };
  }, [timeline?.tracks, clip.id, clip.start_time_ms, clip.duration_ms]);

  // Phase 42: Find linked partner clip and compute sync drift
  const linkedPartner = useMemo(() => {
    if (!clip.linked_clip_id || !timeline?.tracks) return null;
    for (const t of timeline.tracks) {
      for (const c of t.clips) {
        if (c.id === clip.linked_clip_id) return c;
      }
    }
    return null;
  }, [clip.linked_clip_id, timeline?.tracks]);

  const syncDriftMs = useMemo(() => {
    if (!linkedPartner) return 0;
    return clip.start_time_ms - linkedPartner.start_time_ms;
  }, [clip.start_time_ms, linkedPartner]);

  const rollPairRef = useRef<{ predId: string; succId: string } | null>(null);
  const trimAccumDeltaMs = useRef(0);

  // Keyframe dragging
  const activeKfRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startTime: number;
    startVal: number;
  } | null>(null);

  const handleKfPointerDown = (e: React.PointerEvent, kf: Keyframe) => {
    if (isTrackLocked) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    activeKfRef.current = {
      id: kf.id || '',
      startX: e.clientX,
      startY: e.clientY,
      startTime: kf.time_offset_ms,
      startVal: Number(kf.value),
    };
  };

  const handleKfPointerMove = (e: React.PointerEvent) => {
    if (!activeKfRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - activeKfRef.current.startX;
    const dy = e.clientY - activeKfRef.current.startY;
    const dtMs = (dx / zoomLevel) * 1000;
    const newTimeMs = Math.max(0, Math.min(clip.duration_ms, Math.round(activeKfRef.current.startTime + dtMs)));
    const dbPerPx = 72 / svgHeight;
    const newDb = Math.max(-60, Math.min(12, Math.round(activeKfRef.current.startVal - (dy * dbPerPx))));
    moveKeyframe(clip.id, activeKfRef.current.id, newTimeMs);
    updateKeyframeValue(clip.id, activeKfRef.current.id, newDb, true);
  };

  const handleKfPointerUp = (e: React.PointerEvent) => {
    if (!activeKfRef.current) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    activeKfRef.current = null;
    pushHistory();
    scheduleAutoSave();
  };

  // SVG path calculation for volume automation
  const pathD = useMemo(() => {
    if (volumeKeyframes.length === 0) return '';
    const pts: [number, number][] = [];
    const firstKf = volumeKeyframes[0];
    const firstX = (firstKf.time_offset_ms / clip.duration_ms) * width;
    const firstY = volDbToY(Number(firstKf.value), svgHeight);
    if (firstX > 0) {
      pts.push([0, firstY]);
    }
    for (const kf of volumeKeyframes) {
      const x = (kf.time_offset_ms / clip.duration_ms) * width;
      const y = volDbToY(Number(kf.value), svgHeight);
      pts.push([x, y]);
    }
    const lastKf = volumeKeyframes[volumeKeyframes.length - 1];
    const lastX = (lastKf.time_offset_ms / clip.duration_ms) * width;
    const lastY = volDbToY(Number(lastKf.value), svgHeight);
    if (lastX < width) {
      pts.push([width, lastY]);
    }
    return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  }, [volumeKeyframes, clip.duration_ms, width, svgHeight]);

  // ─── Drag to move clip (single or multi-clip coordinated) ───
  const dragStartX = useRef<number | null>(null);
  const dragStartPositions = useRef<Map<string, number>>(new Map());
  const isDragging = useRef(false);
  const wasDraggingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Check if clicking trim handles — handled by trim handle elements
    const target = e.target as HTMLElement;
    if (target.dataset.trim || target.dataset.keyframe) return;

    if (isTrackLocked) {
      e.stopPropagation();
      const selStore = useSelectionStore.getState();
      const isAlreadySelected = selStore.selectedClipIds.has(clip.id);
      if (!isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.altKey) {
          selectInStore(clip.id, false);
          selectClip(clip.id);
        } else {
          const related = getRelatedClipIds(clip.id);
          if (related.length > 1) {
            selStore.selectClips(related);
            selectClip(clip.id);
          } else {
            selectInStore(clip.id, false);
            selectClip(clip.id);
          }
        }
      } else if (e.ctrlKey || e.metaKey) {
        toggleClipSelected(clip.id);
      }
      return;
    }

    // Razor / Blade tool mode (single clip click or Shift+click multi-track)
    if (activeTimelineTool === 'razor') {
      e.stopPropagation();
      if (isTrackLocked) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const cutTimeMs = clip.start_time_ms + Math.round(clickRatio * clip.duration_ms);

      if (e.shiftKey) {
        razorCutAllTracks(cutTimeMs);
      } else {
        razorCutClip(clip.id, cutTimeMs);
      }
      return;
    }

    // Slip, Slide, and Roll tool modes
    if (activeTimelineTool === 'slip' || activeTimelineTool === 'slide' || activeTimelineTool === 'roll') {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartX.current = e.clientX;
      trimAccumDeltaMs.current = 0;
      isDragging.current = false;
      wasDraggingRef.current = false;
      selectInStore(clip.id, false);
      selectClip(clip.id);

      if (activeTimelineTool === 'roll') {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickRatio = (e.clientX - rect.left) / Math.max(1, rect.width);
        if (clickRatio < 0.5 && touchingPred) {
          rollPairRef.current = { predId: touchingPred.id, succId: clip.id };
        } else if (touchingSucc) {
          rollPairRef.current = { predId: clip.id, succId: touchingSucc.id };
        } else if (touchingPred) {
          rollPairRef.current = { predId: touchingPred.id, succId: clip.id };
        } else {
          rollPairRef.current = null;
        }
        if (rollPairRef.current) {
          startTrimPreview({
            tool: 'roll',
            clipId: clip.id,
            predClipId: rollPairRef.current.predId,
            succClipId: rollPairRef.current.succId,
          });
        }
      } else if (activeTimelineTool === 'slip') {
        startTrimPreview({
          tool: 'slip',
          clipId: clip.id,
        });
      } else if (activeTimelineTool === 'slide') {
        startTrimPreview({
          tool: 'slide',
          clipId: clip.id,
        });
      }
      return;
    }

    // Shift/Alt + click to add volume keyframe on audio track
    if ((e.shiftKey || e.altKey) && isAudioTrack) {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const timeMs = Math.max(0, Math.min(clip.duration_ms, Math.round((clickX / width) * clip.duration_ms)));
      const valDb = yToVolDb(clickY, svgHeight);
      addKeyframe(clip.id, {
        id: crypto.randomUUID(),
        property_path: 'volume_db',
        time_offset_ms: timeMs,
        value: valDb,
        interpolation: 'linear',
      });
      return;
    }

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    isDragging.current = false;
    wasDraggingRef.current = false;

    // Multi-clip selection coordination
    const selStore = useSelectionStore.getState();
    const isAlreadySelected = selStore.selectedClipIds.has(clip.id);

    if (!isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.altKey) {
        selectInStore(clip.id, false);
        selectClip(clip.id);
      } else {
        const related = getRelatedClipIds(clip.id);
        if (related.length > 1) {
          selStore.selectClips(related);
          selectClip(clip.id);
        } else {
          selectInStore(clip.id, false);
          selectClip(clip.id);
        }
      }
    }

    // Capture starting positions of all clips in the active selection
    dragStartPositions.current.clear();
    const currentSel = useSelectionStore.getState().selectedClipIds;
    const targetIds = currentSel.has(clip.id) ? Array.from(currentSel) : [clip.id];

    if (timeline?.tracks) {
      for (const t of timeline.tracks) {
        for (const c of t.clips) {
          if (targetIds.includes(c.id)) {
            dragStartPositions.current.set(c.id, c.start_time_ms);
          }
        }
      }
    }
    if (!dragStartPositions.current.has(clip.id)) {
      dragStartPositions.current.set(clip.id, clip.start_time_ms);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTimelineTool === 'razor' && !isTrackLocked) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      setHoverCutX(relX);
      return;
    }

    if (dragStartX.current === null) return;

    if (activeTimelineTool === 'slip') {
      const deltaX = e.clientX - dragStartX.current;
      if (Math.abs(deltaX) > 2) isDragging.current = true;
      if (!isDragging.current) return;
      const deltaMs = (deltaX / zoomLevel) * 1000;
      if (Math.abs(deltaMs) >= 1) {
        trimAccumDeltaMs.current += deltaMs;
        slipClip(clip.id, deltaMs, true);
        updateTrimPreview(trimAccumDeltaMs.current);
        dragStartX.current = e.clientX;
      }
      return;
    }

    if (activeTimelineTool === 'slide') {
      const deltaX = e.clientX - dragStartX.current;
      if (Math.abs(deltaX) > 2) isDragging.current = true;
      if (!isDragging.current) return;
      const deltaMs = (deltaX / zoomLevel) * 1000;
      if (Math.abs(deltaMs) >= 1) {
        trimAccumDeltaMs.current += deltaMs;
        slideClip(clip.id, deltaMs, true, snapEnabled);
        updateTrimPreview(trimAccumDeltaMs.current);
        dragStartX.current = e.clientX;
      }
      return;
    }

    if (activeTimelineTool === 'roll') {
      const deltaX = e.clientX - dragStartX.current;
      if (Math.abs(deltaX) > 2) isDragging.current = true;
      if (!isDragging.current || !rollPairRef.current) return;
      const deltaMs = (deltaX / zoomLevel) * 1000;
      if (Math.abs(deltaMs) >= 1) {
        trimAccumDeltaMs.current += deltaMs;
        rollEdit(rollPairRef.current.predId, rollPairRef.current.succId, deltaMs, true, snapEnabled);
        updateTrimPreview(trimAccumDeltaMs.current);
        dragStartX.current = e.clientX;
      }
      return;
    }

    const deltaX = e.clientX - dragStartX.current;
    if (Math.abs(deltaX) > 3) isDragging.current = true;
    if (!isDragging.current) return;

    const rawDeltaMs = (deltaX / zoomLevel) * 1000;
    const initialPositions = Array.from(dragStartPositions.current.entries());
    if (initialPositions.length === 0) return;

    const minStart = Math.min(...initialPositions.map(([_, s]) => s));
    let effectiveDelta = Math.max(-minStart, Math.round(rawDeltaMs));

    // Audio & media clip snapping support (evaluates dragged clip against non-selected clip edges)
    if (snapEnabled) {
      const snapThresholdMs = (10 / zoomLevel) * 1000;
      const snapTargets: number[] = [0, playheadMs];
      if (Array.isArray(timeline?.markers)) {
        for (const m of timeline.markers) {
          snapTargets.push(m.time_ms);
        }
      }
      if (timeline?.tracks) {
        for (const t of timeline.tracks) {
          for (const c of t.clips) {
            if (!dragStartPositions.current.has(c.id)) {
              snapTargets.push(c.start_time_ms);
              snapTargets.push(c.start_time_ms + c.duration_ms);
            }
          }
        }
      }

      const draggedInitStart = dragStartPositions.current.get(clip.id) ?? clip.start_time_ms;
      const candidateStart = draggedInitStart + effectiveDelta;
      const candidateEnd = candidateStart + clip.duration_ms;

      let bestOffset: number | null = null;
      for (const target of snapTargets) {
        if (Math.abs(candidateStart - target) <= snapThresholdMs) {
          bestOffset = target - candidateStart;
          break;
        }
        if (Math.abs(candidateEnd - target) <= snapThresholdMs) {
          bestOffset = (target - clip.duration_ms) - candidateStart;
          break;
        }
      }

      if (bestOffset !== null && (minStart + effectiveDelta + bestOffset) >= 0) {
        effectiveDelta += bestOffset;
      }
    }

    // Coordinated atomic batch update of all selected clips (delta offset invariant)
    useTimelineStore.getState().batchUpdateClips((state) => {
      if (!state.timeline) return;
      for (const track of state.timeline.tracks) {
        for (const c of track.clips) {
          const initStart = dragStartPositions.current.get(c.id);
          if (initStart !== undefined) {
            c.start_time_ms = Math.max(0, initStart + effectiveDelta);
          }
        }
        track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
      }
    }, true); // skipHistory during drag for smooth 60fps performance
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    wasDraggingRef.current = isDragging.current;
    if (isDragging.current) {
      if (activeTimelineTool === 'slip' || activeTimelineTool === 'slide' || activeTimelineTool === 'roll') {
        endTrimPreview(true);
      } else {
        pushHistory();
        scheduleAutoSave();
      }
    } else {
      if (activeTimelineTool === 'slip' || activeTimelineTool === 'slide' || activeTimelineTool === 'roll') {
        endTrimPreview(false);
      }
    }
    dragStartX.current = null;
    isDragging.current = false;
    rollPairRef.current = null;
  };

  // ─── Trim handles ───
  const trimStartX = useRef<number | null>(null);
  const trimStartMs = useRef<number>(0);

  const handleTrimPointerDown = (e: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
    if (isTrackLocked) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    trimStartX.current = e.clientX;
    trimStartMs.current = 0;
    const isRipple = activeTimelineTool === 'ripple' || rippleEnabled;
    startTrimPreview({
      tool: isRipple ? 'ripple' : 'trim',
      clipId: clip.id,
      edge,
    });
  };

  const handleTrimPointerMove = (e: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
    if (trimStartX.current === null) return;
    const deltaX = e.clientX - trimStartX.current;
    const deltaMs = (deltaX / zoomLevel) * 1000;
    const totalDelta = deltaMs - trimStartMs.current;
    if (Math.abs(totalDelta) > (1000 / zoomLevel)) {
      const isRipple = activeTimelineTool === 'ripple' || rippleEnabled;
      trimClip(clip.id, edge, totalDelta, true, isRipple);
      trimStartMs.current = deltaMs;
      updateTrimPreview(deltaMs);
    }
  };

  const handleTrimPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    trimStartX.current = null;
    endTrimPreview(true);
  };

  const hasTransitionOut = !!clip.transition_out;

  return (
    <div
      id={`clip-${clip.id}`}
      data-testid={`timeline-clip-${clip.id}`}
      data-clip-id={clip.id}
      data-is-compound={clip.is_compound ? 'true' : undefined}
      onPointerLeave={() => {
        if (hoverCutX !== null) setHoverCutX(null);
      }}
      className={`absolute top-0.5 bottom-0.5 rounded ${
        isTrackLocked
          ? 'cursor-default opacity-85'
          : activeTimelineTool === 'razor'
          ? 'cursor-crosshair'
          : activeTimelineTool === 'slip'
          ? 'cursor-ew-resize'
          : activeTimelineTool === 'slide' || activeTimelineTool === 'roll'
          ? 'cursor-col-resize'
          : 'cursor-grab active:cursor-grabbing'
      } flex items-center overflow-hidden select-none border ${
        clip.is_compound
          ? 'border-indigo-500/80 bg-indigo-950/70 shadow-[0_0_8px_rgba(99,102,241,0.25)]'
          : 'border-cinema-border/70'
      } ${
        isSelected
          ? 'ring-2 ring-cinema-ai ring-offset-1 ring-offset-cinema-void bg-cinema-750 shadow-lg shadow-cyan-950/40 z-20'
          : clip.is_compound
          ? 'hover:bg-indigo-900/80'
          : 'bg-cinema-800/95 hover:bg-cinema-750'
      } transition-colors`}
      style={{
        left,
        width,
        opacity: clip.is_frozen ? 0.7 : clip.opacity,
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        if (clip.is_compound && clip.nested_tracks) {
          e.stopPropagation();
          openCompoundClip(clip.id);
        }
      }}
      onClick={(e) => {
        if (wasDraggingRef.current) return;
        if (e.shiftKey) {
          // Range selection on the same track
          const { timeline: tl } = useTimelineStore.getState();
          const selStore = useSelectionStore.getState();
          const primaryId = selStore.primaryClipId;
          let trackClips: Clip[] = [];
          if (tl?.tracks) {
            for (const track of tl.tracks) {
              if (track.clips.some((c) => c.id === clip.id)) {
                trackClips = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
                break;
              }
            }
          }

          const clickedIdx = trackClips.findIndex((c) => c.id === clip.id);
          const primaryIdx = primaryId ? trackClips.findIndex((c) => c.id === primaryId) : -1;

          if (clickedIdx !== -1 && primaryIdx !== -1) {
            const startIdx = Math.min(primaryIdx, clickedIdx);
            const endIdx = Math.max(primaryIdx, clickedIdx);
            const rangeIds = trackClips.slice(startIdx, endIdx + 1).map((c) => c.id);
            selStore.selectRange(rangeIds, clip.id);
            selectClip(clip.id);
          } else {
            toggleClipSelected(clip.id);
            selectClip(clip.id);
          }
        } else if (e.ctrlKey || e.metaKey) {
          toggleClipSelected(clip.id);
          const nextSel = useSelectionStore.getState().selectedClipIds;
          selectClip(nextSel.has(clip.id) ? clip.id : (Array.from(nextSel)[0] ?? null));
        } else {
          if (e.altKey) {
            selectInStore(clip.id, false);
            selectClip(clip.id);
          } else {
            const related = getRelatedClipIds(clip.id);
            if (related.length > 1) {
              useSelectionStore.getState().selectClips(related);
              selectClip(clip.id);
            } else {
              selectInStore(clip.id, false);
              selectClip(clip.id);
            }
          }
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const selStore = useSelectionStore.getState();
        if (!selStore.selectedClipIds.has(clip.id)) {
          if (e.altKey) {
            selectInStore(clip.id, false);
            selectClip(clip.id);
          } else {
            const related = getRelatedClipIds(clip.id);
            if (related.length > 1) {
              selStore.selectClips(related);
              selectClip(clip.id);
            } else {
              selectInStore(clip.id, false);
              selectClip(clip.id);
            }
          }
        }
        onContextMenu?.(e, clip.id);
      }}
      title={`${clip.name} (${formatTimecode(clip.start_time_ms)} → ${formatTimecode(clip.start_time_ms + clip.duration_ms)})${isAudioTrack ? ' • Shift+Click to add volume keyframe' : ''}`}
    >
      {/* Subtle 3px track color accent notch on left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 flex-shrink-0 z-10"
        style={{ backgroundColor: trackColor }}
      />

      {/* Waveform for audio clips */}
      {isAudioTrack && (
        <WaveformBar
          peakData={waveformData}
          color="rgba(0, 229, 255, 0.4)"
          width={width}
          height={trackHeight - 4}
        />
      )}

      {/* Audio volume automation curve overlay for audio tracks */}
      {isAudioTrack && volumeKeyframes.length > 0 && (
        <svg
          data-testid="audio-automation-curve"
          className="absolute inset-0 pointer-events-none z-15 overflow-visible"
          width={width}
          height={svgHeight}
        >
          <path
            d={pathD}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray={volumeKeyframes.length === 1 ? '3 3' : undefined}
            opacity="0.9"
          />
        </svg>
      )}

      {/* Draggable keyframe nodes for audio tracks */}
      {isAudioTrack && volumeKeyframes.map((kf) => {
        const kfX = (kf.time_offset_ms / clip.duration_ms) * width;
        const kfY = volDbToY(Number(kf.value), svgHeight);
        return (
          <div
            key={kf.id}
            data-testid={`audio-keyframe-point-${kf.id}`}
            data-keyframe="true"
            className="absolute w-2.5 h-2.5 -ml-1.25 -mt-1.25 rounded-full bg-amber-400 border border-black shadow hover:scale-125 transition-transform cursor-grab active:cursor-grabbing z-20"
            style={{
              left: `${kfX}px`,
              top: `${kfY}px`,
            }}
            title={`Volume: ${kf.value} dB at ${formatTimecode(kf.time_offset_ms)} (Double-click to delete)`}
            onPointerDown={(e) => handleKfPointerDown(e, kf)}
            onPointerMove={handleKfPointerMove}
            onPointerUp={handleKfPointerUp}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (kf.id) deleteKeyframe(clip.id, kf.id);
            }}
          />
        );
      })}

      {/* Phase 38: Slip Tool Overlay Indicator */}
      {activeTimelineTool === 'slip' && (
        <div
          id={`clip-slip-overlay-${clip.id}`}
          data-testid={`clip-slip-overlay-${clip.id}`}
          className="absolute inset-0 bg-amber-500/10 border-2 border-amber-400/60 pointer-events-none z-15 flex items-center justify-center"
        >
          <span className="text-[8.5px] font-mono text-amber-300 bg-black/75 px-1 py-0.5 rounded shadow">
            SLIP: {formatTimecode(clip.source_in_ms)}
          </span>
        </div>
      )}

      {/* Phase 38: Slide Tool Overlay Indicator */}
      {activeTimelineTool === 'slide' && (
        <div
          id={`clip-slide-overlay-${clip.id}`}
          data-testid={`clip-slide-overlay-${clip.id}`}
          className="absolute inset-0 bg-cyan-500/10 border-2 border-cyan-400/60 pointer-events-none z-15 flex items-center justify-center"
        >
          <span className="text-[8.5px] font-mono text-cyan-300 bg-black/75 px-1 py-0.5 rounded shadow">
            SLIDE: {formatTimecode(clip.start_time_ms)}
          </span>
        </div>
      )}

      {/* Phase 39: Roll Tool Overlay Indicator & Seam Indicator */}
      {activeTimelineTool === 'roll' && (
        <div
          id={`clip-roll-overlay-${clip.id}`}
          data-testid={`clip-roll-overlay-${clip.id}`}
          className="absolute inset-0 bg-emerald-500/10 border-2 border-emerald-400/60 pointer-events-none z-15 flex items-center justify-center"
        >
          <span className="text-[8.5px] font-mono text-emerald-300 bg-black/75 px-1 py-0.5 rounded shadow">
            ROLL: {formatTimecode(clip.start_time_ms + clip.duration_ms)}
          </span>
        </div>
      )}

      {activeTimelineTool === 'roll' && touchingSucc && (
        <div
          id="timeline-roll-seam-indicator"
          data-testid="timeline-roll-seam-indicator"
          className="absolute -right-0.5 top-0 bottom-0 w-1.5 bg-emerald-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(52,211,153,0.9)] rounded-sm"
        />
      )}

      {/* Phase 41: Razor / Blade Cut Guide Line */}
      {activeTimelineTool === 'razor' && !isTrackLocked && typeof hoverCutX === 'number' && Number.isFinite(hoverCutX) && (
        <div
          id={`razor-cut-guide-${clip.id}`}
          data-testid="razor-cut-guide"
          className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.9)]"
          style={{ left: `${Math.round(hoverCutX)}px` }}
        >
          <div className="absolute -top-3.5 -translate-x-1/2 bg-rose-600 text-[8px] text-white font-mono px-1 py-0.2 rounded shadow whitespace-nowrap pointer-events-none">
            {formatTimecode(clip.start_time_ms + Math.round((hoverCutX / Math.max(1, width)) * clip.duration_ms))}
          </div>
        </div>
      )}

      {/* Clip name label and AUTO / COMPOUND badge */}
      {width > 24 && (
        <div className="flex items-center gap-1 pl-2 pr-1.5 relative z-10 flex-shrink-0 drop-shadow truncate">
          {isTrackLocked && (
            <span title="Track is locked">
              <Lock className="w-2.5 h-2.5 text-amber-400 flex-shrink-0 mr-0.5" />
            </span>
          )}
          <span className="text-[9px] text-cinema-text font-medium truncate">
            {clip.name}
          </span>
          {clip.is_compound && (
            <span
              id={`compound-badge-${clip.id}`}
              data-testid={`compound-badge-${clip.id}`}
              className="text-[7.5px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 uppercase tracking-wider"
              title="Compound Clip (Double-click to open nested timeline)"
            >
              COMPOUND
            </span>
          )}
          {volumeKeyframes.length > 0 && (
            <span
              data-testid="clip-auto-badge"
              className="text-[7.5px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
              title={`${volumeKeyframes.length} volume keyframe(s)`}
            >
              AUTO
            </span>
          )}
          {clip.group_id && (
            <span
              id={`clip-group-badge-${clip.id}`}
              data-testid={`clip-group-badge-${clip.id}`}
              className="text-[7.5px] font-mono font-bold px-1 py-0.2 rounded bg-purple-500/30 text-purple-300 border border-purple-500/50 uppercase tracking-wider flex items-center gap-0.5"
              title={`Grouped clip (Group ID: ${clip.group_id.slice(0, 8)})`}
            >
              <FolderPlus className="w-2 h-2" /> GRP
            </span>
          )}
          {clip.linked_clip_id && (
            <span
              id={`clip-link-badge-${clip.id}`}
              data-testid={`clip-link-badge-${clip.id}`}
              className="text-[7.5px] font-mono font-bold px-1 py-0.2 rounded bg-sky-500/30 text-sky-300 border border-sky-500/50 uppercase tracking-wider flex items-center gap-0.5"
              title={`Linked to clip ${clip.linked_clip_id.slice(0, 8)}`}
            >
              <Link className="w-2 h-2" /> LINK
            </span>
          )}
          {clip.linked_clip_id && linkedPartner && syncDriftMs !== 0 && (
            <span
              id={`clip-sync-drift-${clip.id}`}
              data-testid={`clip-sync-drift-${clip.id}`}
              className="text-[7.5px] font-mono font-bold px-1 py-0.2 rounded bg-rose-500/40 text-rose-300 border border-rose-500/60 uppercase tracking-wider"
              title={`Out of sync by ${syncDriftMs > 0 ? '+' : ''}${Math.round(syncDriftMs)}ms with linked partner`}
            >
              {syncDriftMs > 0 ? `+${Math.round(syncDriftMs)}ms` : `${Math.round(syncDriftMs)}ms`}
            </span>
          )}
        </div>
      )}

      {/* Keyframe indicator for non-volume keyframes */}
      {otherKeyframes.length > 0 && (
        <div className="absolute bottom-0.5 right-1 flex gap-0.5 z-10">
          {otherKeyframes.slice(0, 3).map((kf) => (
            <div
              key={kf.id}
              className="w-1.5 h-1.5 rotate-45 bg-yellow-400"
              style={{ left: (kf.time_offset_ms / 1000) * zoomLevel }}
            />
          ))}
        </div>
      )}

      {/* Transition-out indicator */}
      {hasTransitionOut && onOpenTransition && (
        <button
          className="absolute right-0 top-0 bottom-0 w-4 bg-white/20 hover:bg-white/40 flex items-center justify-center z-20 rounded-r"
          onClick={(e) => { e.stopPropagation(); onOpenTransition(clip.id, 'out', e); }}
          title="Edit transition"
        >
          <div className="w-2 h-2 border border-white/80 rotate-45" />
        </button>
      )}

      {/* Clip Markers */}
      {Array.isArray(clip.markers) && clip.markers.map((cm) => {
        const markerTime = typeof cm.time_ms === 'number' ? cm.time_ms : ((cm as any).time_offset_ms ?? 0);
        const markerLeft = (markerTime / 1000) * zoomLevel;
        const colorStyle = MARKER_COLOR_MAP[cm.color] || MARKER_COLOR_MAP.blue;
        return (
          <div
            key={cm.id}
            id={`clip-marker-${cm.id}`}
            data-testid={`clip-marker-${cm.id}`}
            className="absolute top-0 w-2.5 h-3 -translate-x-1/2 z-30 cursor-pointer group pointer-events-auto"
            style={{ left: `${Math.round(markerLeft)}px` }}
            onClick={(e) => {
              e.stopPropagation();
              onSeek?.(clip.start_time_ms + cm.time_ms);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onEditMarker?.(cm, clip.id);
            }}
            title={`${cm.name}: ${cm.comment || 'No comment'} (${formatTimecode(clip.start_time_ms + cm.time_ms)}) — Double-click to edit`}
          >
            <div
              className="w-2.5 h-2.5 rounded-sm border shadow-sm transition-transform group-hover:scale-125"
              style={{ backgroundColor: colorStyle.bg, borderColor: colorStyle.border }}
            />
            <div
              className="w-0.5 h-full mx-auto opacity-70"
              style={{ backgroundColor: colorStyle.bg }}
            />
          </div>
        );
      })}

      {/* Left and right trim handles — only if track is not locked */}
      {!isTrackLocked && (
        <>
          <div
            id={`clip-trim-handle-left-${clip.id}`}
            data-trim="left"
            data-testid={`trim-handle-left-${clip.id}`}
            className={`absolute left-0 top-0 bottom-0 cursor-col-resize z-20 transition-colors ${
              activeTimelineTool === 'ripple' || rippleEnabled
                ? 'bg-amber-500/25 hover:bg-amber-400/50 border-r-2 border-amber-400'
                : 'hover:bg-white/30'
            }`}
            style={{ width: TRIM_HANDLE_WIDTH }}
            onPointerDown={(e) => handleTrimPointerDown(e, 'left')}
            onPointerMove={(e) => handleTrimPointerMove(e, 'left')}
            onPointerUp={handleTrimPointerUp}
          >
            {(activeTimelineTool === 'ripple' || rippleEnabled) && (
              <div className="absolute inset-y-0 left-0 flex items-center justify-center pointer-events-none text-[8px] font-bold text-amber-300 select-none">
                ⫷
              </div>
            )}
          </div>
          <div
            id={`clip-trim-handle-right-${clip.id}`}
            data-trim="right"
            data-testid={`trim-handle-right-${clip.id}`}
            className={`absolute right-0 top-0 bottom-0 cursor-col-resize z-20 transition-colors ${
              activeTimelineTool === 'ripple' || rippleEnabled
                ? 'bg-amber-500/25 hover:bg-amber-400/50 border-l-2 border-amber-400'
                : 'hover:bg-white/30'
            }`}
            style={{ width: TRIM_HANDLE_WIDTH }}
            onPointerDown={(e) => handleTrimPointerDown(e, 'right')}
            onPointerMove={(e) => handleTrimPointerMove(e, 'right')}
            onPointerUp={handleTrimPointerUp}
          >
            {(activeTimelineTool === 'ripple' || rippleEnabled) && (
              <div className="absolute inset-y-0 right-0 flex items-center justify-center pointer-events-none text-[8px] font-bold text-amber-300 select-none">
                ⫸
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
ClipBlock.displayName = 'ClipBlock';


// ───────────────────────────── Ruler ─────────────────────────────
const Ruler = memo<{ duration_ms: number; zoomLevel: number }>(({
  duration_ms, zoomLevel,
}) => {
  const totalWidth = Math.max(800, (duration_ms / 1000) * zoomLevel + 300);
  const tickIntervalSec = zoomLevel < 10 ? 10 : zoomLevel < 30 ? 5 : zoomLevel < 80 ? 2 : 1;
  const numTicks = Math.ceil(totalWidth / (zoomLevel * tickIntervalSec)) + 2;

  const ticks: React.ReactElement[] = [];
  for (let i = 0; i <= numTicks; i++) {
    const sec = i * tickIntervalSec;
    const x = sec * zoomLevel;
    const isMajor = i % 2 === 0 || tickIntervalSec >= 5;
    ticks.push(
      <div key={sec} className="absolute flex flex-col items-center" style={{ left: x }}>
        <div className={`w-px bg-cinema-borderLight ${isMajor ? 'h-3' : 'h-1.5'}`} />
        {isMajor && (
          <span className="text-[9px] text-cinema-textDim font-mono mt-0.5 whitespace-nowrap">
            {formatTimecode(sec * 1000)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: totalWidth, height: RULER_HEIGHT }}>
      {ticks}
    </div>
  );
});
Ruler.displayName = 'Ruler';

// ───────────────────────────── Main TimelineShell ─────────────────────────────
export const TimelineShell: React.FC = () => {
  const {
    timeline, playheadMs, zoomLevel, snapEnabled, rippleEnabled,
    setPlayhead, setZoomLevel, toggleSnap, toggleRipple, selectClip, isSaving, saveStatus,
    selectedClipId, selectedTrackId, deleteClip, duplicateClip, splitClipAtPlayhead,
    rippleDelete, addClipToTrack, copyClip, pasteClip, clipboardClip, clipboardClips,
    duplicateSelectedClips, copySelectedClips, pasteSelectedClips, deleteSelectedClips, rippleDeleteSelectedClips,
    breadcrumbStack, createCompoundClip, openCompoundClip, exitCompoundClip, ungroupCompoundClip,
    addTimelineMarker, addClipMarker, updateMarker, deleteMarker, clearMarkers, goToNextMarker, goToPrevMarker,
    addTrack, deleteTrack, renameTrack, reorderTrack, toggleTrackLock, toggleTrackVisibility, toggleTrackMute, toggleTrackSolo,
    activeTimelineTool, setActiveTimelineTool, slipClip, slideClip, rollEdit,
    selectedGap, setSelectedGap, deleteGap, closeGapAtPlayhead,
    groupSelectedClips, ungroupSelectedClips, linkSelectedClips, unlinkSelectedClips, realignLinkedClip,
    markIn, markOut, markClipRange, clearInOut, setInOutRange, liftRange, extractRange, rippleTrimToPlayhead,
    targetVideoTrackId, targetAudioTrackId, setTargetTrack, insertEdit, overwriteEdit, replaceEdit, fitToFillEdit,
    matchFrame, setHighlightedAssetId,
    shuttleRate, zoomToFit, setTimecodeModalOpen, jumpToInPoint, jumpToOutPoint,
    jumpToNextCut, jumpToPreviousCut, jumpToSequenceStart, jumpToSequenceEnd,
  } = useTimelineStore();
  const selectedClipIds = useSelectionStore((s) => s.selectedClipIds);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const { assets } = useProjectStore();
  const isMobile = useIsMobile();

  const [editingMarker, setEditingMarker] = useState<{ marker: TimelineMarker; clipId?: string } | null>(null);
  const [markerDraft, setMarkerDraft] = useState<{ name: string; comment: string; color: MarkerColor; time_ms: number; duration_ms: number }>({
    name: '',
    comment: '',
    color: 'blue',
    time_ms: 0,
    duration_ms: 0,
  });

  useEffect(() => {
    if (editingMarker) {
      setMarkerDraft({
        name: editingMarker.marker.name || '',
        comment: editingMarker.marker.comment || '',
        color: editingMarker.marker.color || 'blue',
        time_ms: editingMarker.marker.time_ms ?? 0,
        duration_ms: editingMarker.marker.duration_ms ?? 0,
      });
    }
  }, [editingMarker]);

  const assetMap = useMemo(() => {
    const map: Record<string, Asset> = {};
    if (Array.isArray(assets)) {
      for (const a of assets) {
        if (a && a.id) map[a.id] = a;
      }
    }
    return map;
  }, [assets]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clipId: string;
  } | null>(null);

  const contextMenuClip = useMemo(() => {
    if (!contextMenu?.clipId || !timeline) return null;
    for (const t of timeline.tracks) {
      const c = t.clips.find((clip) => clip.id === contextMenu.clipId);
      if (c) return c;
    }
    return null;
  }, [contextMenu?.clipId, timeline]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [contextMenu]);

  const [trackContextMenu, setTrackContextMenu] = useState<{
    x: number;
    y: number;
    trackId: string;
  } | null>(null);

  useEffect(() => {
    if (!trackContextMenu) return;
    const closeMenu = () => setTrackContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [trackContextMenu]);

  const [gapContextMenu, setGapContextMenu] = useState<{
    x: number;
    y: number;
    trackId: string;
    startMs: number;
    durationMs: number;
  } | null>(null);

  useEffect(() => {
    if (!gapContextMenu) return;
    const closeMenu = () => setGapContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [gapContextMenu]);

  const [transitionPicker, setTransitionPicker] = useState<{
    clipAId: string;
    clipBId: string | null;
    position: { x: number; y: number };
  } | null>(null);

  // Phase 50: Mini-map toggle and ruler context menu
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [rulerContextMenu, setRulerContextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!rulerContextMenu) return;
    const closeMenu = () => setRulerContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [rulerContextMenu]);

  // Auto-scroll playhead into view while playing
  const { isPlaying } = useTimelineStore();
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return;
    const containerWidth = scrollRef.current.clientWidth;
    const playheadX = (playheadMs / 1000) * zoomLevel;
    const currentScroll = scrollRef.current.scrollLeft;
    if (playheadX > currentScroll + containerWidth * 0.8) {
      scrollRef.current.scrollLeft = playheadX - containerWidth * 0.2;
    } else if (playheadX < currentScroll) {
      scrollRef.current.scrollLeft = Math.max(0, playheadX - 40);
    }
  }, [playheadMs, zoomLevel, isPlaying]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  }, []);

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const ms = Math.max(0, (x / zoomLevel) * 1000);
    setPlayhead(ms);
  }, [zoomLevel, setPlayhead, scrollLeft]);

  // Ctrl+Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      setZoomLevel(zoomLevel * factor);
    }
  }, [zoomLevel, setZoomLevel]);

  // Drop from MediaBrowserPanel
  const handleTrackDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetTrackId(trackId);
  };

  const handleTrackDrop = async (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    setDropTargetTrackId(null);
    const assetId = e.dataTransfer.getData('application/x-asset-id');
    const assetName = e.dataTransfer.getData('application/x-asset-name');
    if (!assetId || !timeline) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dropX = e.clientX - rect.left + scrollLeft;
    const startMs = Math.max(0, Math.round((dropX / zoomLevel) * 1000));

    // Fetch asset duration
    let durationMs = 4000;
    let clipName = assetName || 'Clip';
    try {
      const res = await api.get<any>(`/assets/${assetId}`);
      durationMs = res.data.duration_ms || 4000;
      clipName = res.data.file_name || clipName;
    } catch { /* use defaults */ }

    addClipToTrack(trackId, {
      asset_id: assetId,
      name: clipName.replace(/\.[^.]+$/, ''),
      start_time_ms: startMs,
      duration_ms: durationMs,
      source_out_ms: durationMs,
    });
  };

  const handleTrackDragLeave = () => {
    setDropTargetTrackId(null);
  };

  const handleOpenTransition = useCallback((clipId: string, _edge: 'out', e: React.MouseEvent) => {
    if (!timeline) return;
    // Find the next clip on the same track
    let clipBId: string | null = null;
    for (const track of timeline.tracks) {
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx !== -1 && idx + 1 < track.clips.length) {
        clipBId = track.clips[idx + 1].id;
        break;
      }
    }
    setTransitionPicker({ clipAId: clipId, clipBId, position: { x: e.clientX, y: e.clientY + 10 } });
  }, [timeline]);

  // Phase 43: Work Area In/Out Handle Drag Handlers
  const draggingHandleRef = useRef<'in' | 'out' | null>(null);

  const handleInPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingHandleRef.current = 'in';
  }, []);

  const handleOutPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingHandleRef.current = 'out';
  }, []);

  const handleRulerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingHandleRef.current || !scrollRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    let targetMs = Math.max(0, Math.round((x / zoomLevel) * 1000));
    const maxDur = timeline?.duration_ms || 30000;
    targetMs = Math.min(maxDur, targetMs);

    if (snapEnabled) {
      const snapThresholdMs = (10 / zoomLevel) * 1000;
      const snapTargets: number[] = [0, playheadMs];
      if (Array.isArray(timeline?.markers)) {
        for (const m of timeline.markers) snapTargets.push(m.time_ms);
      }
      if (timeline?.tracks) {
        for (const t of timeline.tracks) {
          for (const c of t.clips) {
            snapTargets.push(c.start_time_ms);
            snapTargets.push(c.start_time_ms + c.duration_ms);
          }
        }
      }
      for (const st of snapTargets) {
        if (Math.abs(targetMs - st) <= snapThresholdMs) {
          targetMs = st;
          break;
        }
      }
    }

    if (draggingHandleRef.current === 'in') {
      useTimelineStore.getState().markIn(targetMs);
    } else if (draggingHandleRef.current === 'out') {
      useTimelineStore.getState().markOut(targetMs);
    }
  }, [zoomLevel, timeline, snapEnabled, playheadMs]);

  const handleRulerPointerUp = useCallback((e: React.PointerEvent) => {
    if (draggingHandleRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      draggingHandleRef.current = null;
    }
  }, []);

  if (!timeline) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-cinema-950 text-cinema-textDim gap-2">
        <div className="w-6 h-6 border-2 border-cinema-ai/40 border-t-cinema-ai rounded-full animate-spin" />
        <p className="text-xs">No timeline loaded — open or create a project</p>
      </div>
    );
  }

  const totalWidth = Math.max(800, (timeline.duration_ms / 1000) * zoomLevel + 300);
  const playheadX = (playheadMs / 1000) * zoomLevel;

  // Toolbar action for selected clip
  // Toolbar action for selected clip(s)
  const isMultiSelected = selectedClipIds.size > 1;
  const canActOnClip = Boolean(selectedClipId || selectedClipIds.size > 0);
  let selectedClip: Clip | null = null;
  if (selectedClipId && timeline) {
    for (const track of timeline.tracks) {
      const c = track.clips.find((clip) => clip.id === selectedClipId);
      if (c) {
        selectedClip = c;
        break;
      }
    }
  }

  const isPlayheadInsideSelectedClip = Boolean(
    selectedClip &&
    playheadMs > selectedClip.start_time_ms &&
    playheadMs < selectedClip.start_time_ms + selectedClip.duration_ms
  );

  const hasClipboard = Boolean(clipboardClip || (clipboardClips && clipboardClips.length > 0));

  // Phase 42: Grouping & Linking state helpers
  const targetIdsList = selectedClipIds.size > 0 ? Array.from(selectedClipIds) : (selectedClipId ? [selectedClipId] : []);
  const selectedClipsList: Clip[] = [];
  if (timeline) {
    for (const track of timeline.tracks) {
      for (const c of track.clips) {
        if (targetIdsList.includes(c.id)) {
          selectedClipsList.push(c);
        }
      }
    }
  }

  const canGroup = selectedClipsList.length >= 2;
  const canUngroup = selectedClipsList.some((c) => Boolean(c.group_id));
  const canLink = selectedClipsList.length === 2;
  const canUnlink = selectedClipsList.some((c) => Boolean(c.linked_clip_id));
  const hasValidWorkArea = Boolean(
    timeline &&
    timeline.in_point_ms !== null &&
    timeline.in_point_ms !== undefined &&
    timeline.out_point_ms !== null &&
    timeline.out_point_ms !== undefined &&
    timeline.out_point_ms > timeline.in_point_ms
  );

  return (
    <div
      className="flex flex-col h-full bg-cinema-950 select-none"
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 md:gap-3 px-2 md:px-3 py-1.5 border-b border-cinema-border bg-cinema-900 flex-shrink-0 overflow-x-auto scrollbar-none">
        {/* Zoom */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => setZoomLevel(zoomLevel / 1.4)} className="p-1 hover:bg-cinema-750 rounded text-cinema-textDim hover:text-white" title="Zoom Out (- / Ctrl+-)">
            <ZoomOut className="w-3 h-3 md:w-3.5 md:h-3.5" />
          </button>
          <span className="text-[9px] md:text-[10px] text-cinema-textDim font-mono w-10 text-center">{Math.round(zoomLevel)}px/s</span>
          <button onClick={() => setZoomLevel(zoomLevel * 1.4)} className="p-1 hover:bg-cinema-750 rounded text-cinema-textDim hover:text-white" title="Zoom In (+ / Ctrl+=)">
            <ZoomIn className="w-3 h-3 md:w-3.5 md:h-3.5" />
          </button>
          <button
            id="timeline-zoom-to-fit-btn"
            data-testid="timeline-zoom-to-fit-btn"
            onClick={() => zoomToFit()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors ml-0.5"
            title="Zoom to Fit Sequence (Shift+Z)"
          >
            <Maximize2 className="w-2.5 h-2.5" /> Fit
          </button>
        </div>

        {/* Snap */}
        <button
          onClick={toggleSnap}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-medium border transition-colors flex-shrink-0 ${
            snapEnabled
              ? 'bg-cinema-ai/10 border-cinema-ai/40 text-cinema-ai'
              : 'border-cinema-border text-cinema-textDim hover:text-white'
          }`}
          title="Toggle Snap to Grid"
        >
          <Magnet className="w-2.5 h-2.5 md:w-3 md:h-3" /> Snap
        </button>

        {/* Ripple */}
        <button
          id="timeline-ripple-toggle-btn"
          data-testid="timeline-ripple-toggle-btn"
          onClick={toggleRipple}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-medium border transition-colors flex-shrink-0 ${
            rippleEnabled
              ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
              : 'border-cinema-border text-cinema-textDim hover:text-white'
          }`}
          title="Toggle Ripple Mode (B)"
        >
          <Repeat className="w-2.5 h-2.5 md:w-3 md:h-3" /> Ripple
        </button>

        {/* Tool Mode Selector (Phase 38) */}
        <div className="w-px h-4 bg-cinema-border flex-shrink-0" />
        <div className="flex items-center bg-cinema-850 p-0.5 rounded border border-cinema-border flex-shrink-0 gap-0.5">
          <button
            id="timeline-tool-select"
            data-testid="timeline-tool-select"
            onClick={() => setActiveTimelineTool('select')}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              activeTimelineTool === 'select'
                ? 'bg-cinema-ai text-cinema-void font-bold shadow-sm'
                : 'text-cinema-textDim hover:text-white'
            }`}
            title="Selection Tool (V)"
          >
            Select (V)
          </button>
          <button
            id="timeline-tool-slip"
            data-testid="timeline-tool-slip"
            onClick={() => setActiveTimelineTool('slip')}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              activeTimelineTool === 'slip'
                ? 'bg-amber-400 text-cinema-void font-bold shadow-sm'
                : 'text-cinema-textDim hover:text-white'
            }`}
            title="Slip Tool (Y) — Change source in/out keeping timeline duration & position"
          >
            Slip (Y)
          </button>
          <button
            id="timeline-tool-slide"
            data-testid="timeline-tool-slide"
            onClick={() => setActiveTimelineTool('slide')}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              activeTimelineTool === 'slide'
                ? 'bg-cyan-400 text-cinema-void font-bold shadow-sm'
                : 'text-cinema-textDim hover:text-white'
            }`}
            title="Slide Tool (U) — Move clip keeping own duration & source window while adjusting neighbors"
          >
            Slide (U)
          </button>
          <button
            id="timeline-tool-roll"
            data-testid="timeline-tool-roll"
            onClick={() => setActiveTimelineTool('roll')}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              activeTimelineTool === 'roll'
                ? 'bg-emerald-400 text-cinema-void font-bold shadow-sm'
                : 'text-cinema-textDim hover:text-white'
            }`}
            title="Rolling Edit Tool (N) — Move edit cut point between adjacent touching clips"
          >
            Roll (N)
          </button>
          <button
            id="timeline-tool-ripple"
            data-testid="timeline-tool-ripple"
            onClick={() => {
              setActiveTimelineTool('ripple');
              if (!rippleEnabled) toggleRipple();
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              activeTimelineTool === 'ripple' || rippleEnabled
                ? 'bg-amber-600 text-white font-bold shadow-sm'
                : 'text-cinema-textDim hover:text-white'
            }`}
            title="Ripple Tool (B)"
          >
            Ripple (B)
          </button>
          <button
            id="timeline-tool-razor"
            data-testid="timeline-tool-razor"
            onClick={() => setActiveTimelineTool('razor')}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              activeTimelineTool === 'razor'
                ? 'bg-rose-500 text-white font-bold shadow-sm'
                : 'text-cinema-textDim hover:text-white'
            }`}
            title="Razor / Blade Tool (C) — Split clip at cursor position (Shift+Click to cut all unlocked tracks)"
          >
            Razor (C)
          </button>
        </div>

        {/* History / Revisions */}
        <button
          onClick={() => setShowRevisions(true)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors flex-shrink-0"
          title="Timeline Revision History"
        >
          <History className="w-2.5 h-2.5 md:w-3 md:h-3" /> History
        </button>

        {/* Blade & Razor Quick Action Buttons */}
        <button
          id="timeline-blade-btn"
          data-testid="timeline-blade-btn"
          onClick={() => setActiveTimelineTool(activeTimelineTool === 'razor' ? 'select' : 'razor')}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] border transition-colors flex-shrink-0 ${
            activeTimelineTool === 'razor'
              ? 'border-rose-500 bg-rose-500/20 text-rose-300 font-bold shadow-sm'
              : 'border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight'
          }`}
          title="Razor / Blade Tool (C) — Click clip to cut at cursor position"
        >
          <Scissors className="w-2.5 h-2.5 text-rose-400" /> Blade
        </button>
        <button
          id="timeline-razor-btn"
          data-testid="timeline-razor-btn"
          onClick={() => setActiveTimelineTool(activeTimelineTool === 'razor' ? 'select' : 'razor')}
          className="hidden"
          aria-hidden="true"
        />

        {/* Multi-selection count indicator */}
        {isMultiSelected && (
          <span
            id="timeline-selection-count"
            data-testid="timeline-selection-count"
            className="px-1.5 py-0.5 rounded text-[9px] bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/40 font-mono font-medium flex-shrink-0"
          >
            {selectedClipIds.size} clips selected
          </span>
        )}

        {/* Clip actions — show when clip is selected */}
        {canActOnClip && (
          <>
            <div className="w-px h-4 bg-cinema-border flex-shrink-0" />

            {/* Quick Slip & Slide Controls (Phase 38) */}
            <div className="flex items-center gap-0.5 bg-cinema-850 p-0.5 rounded border border-cinema-border/70 flex-shrink-0">
              <button
                id="timeline-slip-btn"
                data-testid="timeline-slip-btn"
                onClick={() => setActiveTimelineTool('slip')}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                  activeTimelineTool === 'slip'
                    ? 'bg-amber-400 text-cinema-void font-bold'
                    : 'text-amber-300 hover:text-white'
                }`}
                title="Activate Slip Tool (Y)"
              >
                Slip
              </button>
              <button
                id="timeline-slip-left-btn"
                data-testid="timeline-slip-left-btn"
                onClick={() => selectedClipId && slipClip(selectedClipId, -100)}
                className="px-1 py-0.5 rounded text-[9px] text-cinema-textDim hover:text-white hover:bg-cinema-750"
                title="Slip Source Left (-100ms)"
              >
                ◀
              </button>
              <button
                id="timeline-slip-right-btn"
                data-testid="timeline-slip-right-btn"
                onClick={() => selectedClipId && slipClip(selectedClipId, 100)}
                className="px-1 py-0.5 rounded text-[9px] text-cinema-textDim hover:text-white hover:bg-cinema-750"
                title="Slip Source Right (+100ms)"
              >
                ▶
              </button>
            </div>

            <div className="flex items-center gap-0.5 bg-cinema-850 p-0.5 rounded border border-cinema-border/70 flex-shrink-0">
              <button
                id="timeline-slide-btn"
                data-testid="timeline-slide-btn"
                onClick={() => setActiveTimelineTool('slide')}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                  activeTimelineTool === 'slide'
                    ? 'bg-cyan-400 text-cinema-void font-bold'
                    : 'text-cyan-300 hover:text-white'
                }`}
                title="Activate Slide Tool (U)"
              >
                Slide
              </button>
              <button
                id="timeline-slide-left-btn"
                data-testid="timeline-slide-left-btn"
                onClick={() => selectedClipId && slideClip(selectedClipId, -100)}
                className="px-1 py-0.5 rounded text-[9px] text-cinema-textDim hover:text-white hover:bg-cinema-750"
                title="Slide Clip Left (-100ms)"
              >
                ◀
              </button>
              <button
                id="timeline-slide-right-btn"
                data-testid="timeline-slide-right-btn"
                onClick={() => selectedClipId && slideClip(selectedClipId, 100)}
                className="px-1 py-0.5 rounded text-[9px] text-cinema-textDim hover:text-white hover:bg-cinema-750"
                title="Slide Clip Right (+100ms)"
              >
                ▶
              </button>
            </div>

            {/* Quick Roll Controls (Phase 39) */}
            <div className="flex items-center gap-0.5 bg-cinema-850 p-0.5 rounded border border-cinema-border/70 flex-shrink-0">
              <button
                id="timeline-roll-btn"
                data-testid="timeline-roll-btn"
                onClick={() => setActiveTimelineTool('roll')}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                  activeTimelineTool === 'roll'
                    ? 'bg-emerald-400 text-cinema-void font-bold'
                    : 'text-emerald-300 hover:text-white'
                }`}
                title="Activate Roll Tool (N)"
              >
                Roll
              </button>
              <button
                id="timeline-roll-left-btn"
                data-testid="timeline-roll-left-btn"
                onClick={() => {
                  if (!selectedClipId) return;
                  const track = timeline?.tracks.find((t) => t.clips.some((c) => c.id === selectedClipId));
                  if (!track) return;
                  const clips = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
                  const idx = clips.findIndex((c) => c.id === selectedClipId);
                  if (idx !== -1 && idx < clips.length - 1 && Math.abs((clips[idx].start_time_ms + clips[idx].duration_ms) - clips[idx + 1].start_time_ms) <= 5) {
                    rollEdit(clips[idx].id, clips[idx + 1].id, -100);
                  } else if (idx > 0 && Math.abs((clips[idx - 1].start_time_ms + clips[idx - 1].duration_ms) - clips[idx].start_time_ms) <= 5) {
                    rollEdit(clips[idx - 1].id, clips[idx].id, -100);
                  }
                }}
                className="px-1 py-0.5 rounded text-[9px] text-cinema-textDim hover:text-white hover:bg-cinema-750"
                title="Roll Cut Point Left (-100ms)"
              >
                ◀
              </button>
              <button
                id="timeline-roll-right-btn"
                data-testid="timeline-roll-right-btn"
                onClick={() => {
                  if (!selectedClipId) return;
                  const track = timeline?.tracks.find((t) => t.clips.some((c) => c.id === selectedClipId));
                  if (!track) return;
                  const clips = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
                  const idx = clips.findIndex((c) => c.id === selectedClipId);
                  if (idx !== -1 && idx < clips.length - 1 && Math.abs((clips[idx].start_time_ms + clips[idx].duration_ms) - clips[idx + 1].start_time_ms) <= 5) {
                    rollEdit(clips[idx].id, clips[idx + 1].id, 100);
                  } else if (idx > 0 && Math.abs((clips[idx - 1].start_time_ms + clips[idx - 1].duration_ms) - clips[idx].start_time_ms) <= 5) {
                    rollEdit(clips[idx - 1].id, clips[idx].id, 100);
                  }
                }}
                className="px-1 py-0.5 rounded text-[9px] text-cinema-textDim hover:text-white hover:bg-cinema-750"
                title="Roll Cut Point Right (+100ms)"
              >
                ▶
              </button>
            </div>

            <button
              id="timeline-split-btn"
              data-testid="timeline-split-btn"
              disabled={!isPlayheadInsideSelectedClip}
              onClick={() => selectedClipId && isPlayheadInsideSelectedClip && splitClipAtPlayhead(selectedClipId)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border transition-colors flex-shrink-0 ${
                isPlayheadInsideSelectedClip
                  ? 'border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight'
                  : 'border-cinema-border text-cinema-textDim/40 cursor-not-allowed'
              }`}
              title={isPlayheadInsideSelectedClip ? "Split at Playhead (S)" : "Playhead must be inside clip to split"}
            >
              <Scissors className="w-2.5 h-2.5" /> Split
            </button>

            <button
              id="timeline-copy-btn"
              data-testid="timeline-copy-btn"
              onClick={() => isMultiSelected ? copySelectedClips() : (selectedClipId && copyClip(selectedClipId))}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors flex-shrink-0"
              title={isMultiSelected ? `Copy (${selectedClipIds.size} clips) (Ctrl+C)` : "Copy Clip (Ctrl+C)"}
            >
              <Copy className="w-2.5 h-2.5" /> Copy
            </button>
            <button
              id="timeline-duplicate-btn"
              data-testid="timeline-duplicate-btn"
              onClick={() => isMultiSelected ? duplicateSelectedClips() : (selectedClipId && duplicateClip(selectedClipId))}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors flex-shrink-0"
              title={isMultiSelected ? `Duplicate (${selectedClipIds.size} clips) (Ctrl+D)` : "Duplicate Clip (Ctrl+D)"}
            >
              <Copy className="w-2.5 h-2.5" /> Dupe
            </button>
            <button
              id="timeline-ripple-delete-btn"
              data-testid="timeline-ripple-delete-btn"
              onClick={() => isMultiSelected ? rippleDeleteSelectedClips() : (selectedClipId && rippleDelete(selectedClipId))}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-red-900/60 text-red-400 hover:text-red-300 hover:border-red-700 transition-colors flex-shrink-0"
              title={isMultiSelected ? `Ripple Delete (${selectedClipIds.size} clips)` : "Ripple Delete (shift+gap close)"}
            >
              <CornerDownLeft className="w-2.5 h-2.5" /> Ripple Del
            </button>
            <button
              id="timeline-delete-btn"
              data-testid="timeline-delete-btn"
              onClick={() => isMultiSelected ? deleteSelectedClips() : (selectedClipId && deleteClip(selectedClipId))}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-red-900/60 text-red-400 hover:text-red-300 hover:border-red-700 transition-colors flex-shrink-0"
              title={isMultiSelected ? `Delete (${selectedClipIds.size} clips) (Del)` : "Delete Clip (Del)"}
            >
              <Trash2 className="w-2.5 h-2.5" /> Delete
            </button>
          </>
        )}

        {/* Phase 40: Close Gap Action */}
        <button
          id="timeline-close-gap-btn"
          data-testid="timeline-close-gap-btn"
          onClick={() => {
            if (selectedGap) {
              deleteGap(selectedGap.trackId, selectedGap.startMs);
            } else {
              closeGapAtPlayhead();
            }
          }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border transition-colors flex-shrink-0 ${
            selectedGap
              ? 'bg-amber-950/80 border-amber-500/80 text-amber-300 hover:text-white hover:bg-amber-900 shadow-sm'
              : 'border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight'
          }`}
          title={selectedGap ? `Close Selected Gap (${selectedGap.durationMs}ms)` : "Close Gap at Playhead / Delete Gap"}
        >
          <CornerDownLeft className="w-2.5 h-2.5 text-amber-400" /> Close Gap
        </button>

        {/* Compound Clip Actions */}
        {selectedClipIds.size >= 2 && (
          <button
            id="timeline-compound-btn"
            data-testid="timeline-compound-btn"
            onClick={() => createCompoundClip()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-indigo-950/80 border border-indigo-500/60 text-indigo-300 hover:text-white hover:bg-indigo-900 transition-colors flex-shrink-0"
            title={`Create Compound Clip from ${selectedClipIds.size} clips (Ctrl+G)`}
          >
            <Layers className="w-2.5 h-2.5" /> Compound
          </button>
        )}

        {/* Phase 42: Clip Grouping Actions */}
        {canGroup && (
          <button
            id="timeline-group-btn"
            data-testid="timeline-group-btn"
            onClick={() => groupSelectedClips()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-purple-950/80 border border-purple-500/60 text-purple-300 hover:text-white hover:bg-purple-900 transition-colors flex-shrink-0"
            title={`Group ${selectedClipsList.length} clips (Ctrl+G)`}
          >
            <FolderPlus className="w-2.5 h-2.5" /> Group
          </button>
        )}
        {(canUngroup || selectedClip?.is_compound) && (
          <button
            id="timeline-ungroup-btn"
            data-testid="timeline-ungroup-btn"
            onClick={() => {
              if (canUngroup) {
                ungroupSelectedClips();
              } else if (selectedClip?.is_compound) {
                ungroupCompoundClip(selectedClip.id);
              }
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-purple-700/60 text-purple-400 hover:text-purple-200 transition-colors flex-shrink-0"
            title={canUngroup ? "Ungroup Clips (Ctrl+Shift+G)" : "Ungroup Compound Clip (Ctrl+Shift+G)"}
          >
            <FolderMinus className="w-2.5 h-2.5" /> Ungroup
          </button>
        )}

        {/* Phase 42: Audio-Video Clip Linking Actions */}
        {canLink && (
          <button
            id="timeline-link-btn"
            data-testid="timeline-link-btn"
            onClick={() => linkSelectedClips()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-sky-950/80 border border-sky-500/60 text-sky-300 hover:text-white hover:bg-sky-900 transition-colors flex-shrink-0"
            title="Link Selected Clips (Ctrl+L)"
          >
            <Link className="w-2.5 h-2.5" /> Link
          </button>
        )}
        {canUnlink && (
          <button
            id="timeline-unlink-btn"
            data-testid="timeline-unlink-btn"
            onClick={() => unlinkSelectedClips()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-sky-700/60 text-sky-400 hover:text-sky-200 transition-colors flex-shrink-0"
            title="Unlink Selected Clips (Ctrl+L)"
          >
            <Unlink className="w-2.5 h-2.5" /> Unlink
          </button>
        )}

        {selectedClip?.is_compound && (
          <button
            id="timeline-open-compound-btn"
            data-testid="timeline-open-compound-btn"
            onClick={() => selectedClip && openCompoundClip(selectedClip.id)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-indigo-950/80 border border-indigo-500/60 text-indigo-300 hover:text-white hover:bg-indigo-900 transition-colors flex-shrink-0"
            title="Open Nested Timeline"
          >
            <Layers className="w-2.5 h-2.5" /> Open
          </button>
        )}

        {breadcrumbStack.length > 0 && (
          <button
            id="timeline-exit-compound-btn"
            data-testid="timeline-exit-compound-btn"
            onClick={() => exitCompoundClip()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-indigo-900 border border-indigo-500 text-indigo-100 hover:bg-indigo-800 transition-colors flex-shrink-0"
            title="Exit Compound Clip and return to parent sequence (Esc)"
          >
            <ArrowLeft className="w-2.5 h-2.5" /> Exit Nested
          </button>
        )}

        {/* Paste action */}
        <button
          id="timeline-paste-btn"
          data-testid="timeline-paste-btn"
          onClick={() => (clipboardClips && clipboardClips.length > 1) ? pasteSelectedClips() : pasteClip()}
          disabled={!hasClipboard}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border transition-colors flex-shrink-0 ${
            hasClipboard
              ? 'border-cinema-ai/60 text-cinema-ai hover:bg-cinema-ai/10'
              : 'border-cinema-border text-cinema-textDim/40 cursor-not-allowed'
          }`}
          title={hasClipboard ? (clipboardClips && clipboardClips.length > 1 ? `Paste (${clipboardClips.length} clips) (Ctrl+V)` : "Paste Clip (Ctrl+V)") : "Paste Clip (Ctrl+V) — Clipboard is empty"}
        >
          <Clipboard className="w-2.5 h-2.5" /> Paste
        </button>

        {/* Marker Actions (Phase 36) */}
        <div className="w-px h-4 bg-cinema-border flex-shrink-0" />
        <button
          id="timeline-prev-marker-btn"
          data-testid="timeline-prev-marker-btn"
          onClick={() => goToPrevMarker()}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors flex-shrink-0"
          title="Previous Marker (Alt+M)"
        >
          <ChevronLeft className="w-2.5 h-2.5" /> Prev
        </button>
        <button
          id="timeline-add-marker-btn"
          data-testid="timeline-add-marker-btn"
          onClick={() => {
            const mId = addTimelineMarker(playheadMs);
            const m: TimelineMarker = {
              id: mId,
              time_ms: playheadMs,
              name: `Marker ${(timeline?.markers?.length || 0) + 1}`,
              color: 'blue',
            };
            setEditingMarker({ marker: m });
          }}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-blue-950/80 border border-blue-500/60 text-blue-300 hover:text-white hover:bg-blue-900 transition-colors flex-shrink-0"
          title="Add Marker at Playhead (M)"
        >
          <Bookmark className="w-2.5 h-2.5" /> Marker
        </button>
        <button
          id="timeline-next-marker-btn"
          data-testid="timeline-next-marker-btn"
          onClick={() => goToNextMarker()}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors flex-shrink-0"
          title="Next Marker (Shift+M)"
        >
          Next <ChevronRight className="w-2.5 h-2.5" />
        </button>

        {/* Phase 43: Work Area & In/Out Range Actions */}
        <div className="w-px h-4 bg-cinema-border flex-shrink-0" />
        <div className="flex items-center gap-0.5 bg-cinema-850 p-0.5 rounded border border-cinema-border/70 flex-shrink-0">
          <button
            id="timeline-mark-in-btn"
            data-testid="timeline-mark-in-btn"
            onClick={() => markIn()}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono text-sky-300 hover:text-white hover:bg-sky-950/80 border border-sky-800/40 transition-colors"
            title="Mark In Point at Playhead (I)"
          >
            [ In (I)
          </button>
          <button
            id="timeline-mark-out-btn"
            data-testid="timeline-mark-out-btn"
            onClick={() => markOut()}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono text-sky-300 hover:text-white hover:bg-sky-950/80 border border-sky-800/40 transition-colors"
            title="Mark Out Point at Playhead (O)"
          >
            Out (O) ]
          </button>
          <button
            id="timeline-mark-clip-btn"
            data-testid="timeline-mark-clip-btn"
            onClick={() => markClipRange()}
            className="px-1.5 py-0.5 rounded text-[9px] text-cinema-textDim hover:text-white hover:bg-cinema-750 transition-colors"
            title="Mark Selected Clip Range (X)"
          >
            Clip (X)
          </button>
          <button
            id="timeline-clear-in-out-btn"
            data-testid="timeline-clear-in-out-btn"
            onClick={() => clearInOut()}
            disabled={
              (timeline?.in_point_ms === null || timeline?.in_point_ms === undefined) &&
              (timeline?.out_point_ms === null || timeline?.out_point_ms === undefined)
            }
            className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
              (timeline?.in_point_ms !== null && timeline?.in_point_ms !== undefined) ||
              (timeline?.out_point_ms !== null && timeline?.out_point_ms !== undefined)
                ? 'text-cinema-textDim hover:text-red-400 hover:bg-cinema-750'
                : 'text-cinema-textDim/40 cursor-not-allowed'
            }`}
            title="Clear In/Out Range (Alt+X)"
          >
            Clear
          </button>
          <button
            id="timeline-lift-btn"
            data-testid="timeline-lift-btn"
            onClick={() => liftRange()}
            disabled={!hasValidWorkArea}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              hasValidWorkArea
                ? 'bg-amber-950/80 border border-amber-500/60 text-amber-300 hover:text-white hover:bg-amber-900 shadow-sm'
                : 'text-cinema-textDim/40 cursor-not-allowed border border-cinema-border/30'
            }`}
            title={hasValidWorkArea ? "Lift Range (;): Delete inside Work Area leaving gap" : "Set In and Out points to Lift"}
          >
            Lift (;)
          </button>
          <button
            id="timeline-extract-btn"
            data-testid="timeline-extract-btn"
            onClick={() => extractRange()}
            disabled={!hasValidWorkArea}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              hasValidWorkArea
                ? 'bg-rose-950/80 border border-rose-500/60 text-rose-300 hover:text-white hover:bg-rose-900 shadow-sm'
                : 'text-cinema-textDim/40 cursor-not-allowed border border-cinema-border/30'
            }`}
            title={hasValidWorkArea ? "Extract Range ('): Ripple delete inside Work Area closing gap" : "Set In and Out points to Extract"}
          >
            Extract (')
          </button>
        </div>

        {/* Phase 44: Ripple Trim to Playhead Quick Actions */}
        <div className="w-px h-4 bg-cinema-border flex-shrink-0" />
        <div className="flex items-center gap-0.5 bg-cinema-850 p-0.5 rounded border border-cinema-border/70 flex-shrink-0">
          <button
            id="timeline-ripple-head-btn"
            data-testid="timeline-ripple-head-btn"
            onClick={() => rippleTrimToPlayhead('head')}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono text-amber-300 hover:text-white hover:bg-amber-950/80 border border-amber-800/40 transition-colors"
            title="Ripple Trim Head to Playhead (Q) — Trim clip start to playhead and ripple content left"
          >
            [ Q Head
          </button>
          <button
            id="timeline-ripple-tail-btn"
            data-testid="timeline-ripple-tail-btn"
            onClick={() => rippleTrimToPlayhead('tail')}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono text-amber-300 hover:text-white hover:bg-amber-950/80 border border-amber-800/40 transition-colors"
            title="Ripple Trim Tail to Playhead (W) — Trim clip end to playhead and ripple content left"
          >
            Tail W ]
          </button>
        </div>

        {/* Phase 45: 3-Point Editing (Insert, Overwrite, Replace) */}
        <div className="w-px h-4 bg-cinema-border flex-shrink-0" />
        <div className="flex items-center gap-0.5 bg-cinema-850 p-0.5 rounded border border-cinema-border/70 flex-shrink-0">
          <button
            id="timeline-insert-btn"
            data-testid="timeline-insert-btn"
            onClick={() => insertEdit()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono text-emerald-400 hover:text-white hover:bg-emerald-950/80 border border-emerald-800/40 transition-colors"
            title="Insert Edit (,) — Splice source into targeted tracks and ripple downstream clips right"
          >
            <Download className="w-2.5 h-2.5" /> Insert (,)
          </button>
          <button
            id="timeline-overwrite-btn"
            data-testid="timeline-overwrite-btn"
            onClick={() => overwriteEdit()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono text-blue-400 hover:text-white hover:bg-blue-950/80 border border-blue-800/40 transition-colors"
            title="Overwrite Edit (.) — Splice source over targeted tracks without shifting downstream clips"
          >
            <Download className="w-2.5 h-2.5 rotate-180" /> Overwrite (.)
          </button>
          <button
            id="timeline-replace-btn"
            data-testid="timeline-replace-btn"
            onClick={() => replaceEdit()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono text-purple-400 hover:text-white hover:bg-purple-950/80 border border-purple-800/40 transition-colors"
            title="Replace Edit (Shift+R / F11) — Swap media of clip under playhead while preserving timing and effects"
          >
            <RefreshCw className="w-2.5 h-2.5" /> Replace (F11)
          </button>
          <button
            id="timeline-fit-to-fill-btn"
            data-testid="timeline-fit-to-fill-btn"
            onClick={() => fitToFillEdit()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono text-emerald-400 hover:text-white hover:bg-emerald-950/80 border border-emerald-800/40 transition-colors"
            title="Fit to Fill (Shift+F11) — Retime playback speed to fit clip or sequence range"
          >
            <Gauge className="w-2.5 h-2.5" /> Fit-to-Fill (Shift+F11)
          </button>
        </div>

        {/* Track Actions (Phase 37) */}
        <div className="w-px h-4 bg-cinema-border flex-shrink-0" />
        <button
          id="timeline-add-track-btn"
          data-testid="timeline-add-track-btn"
          onClick={() => addTrack('video')}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-cinema-800 hover:bg-cinema-700 text-cinema-textDim hover:text-white border border-cinema-border transition-colors flex-shrink-0"
          title="Add Video Track"
        >
          <Plus className="w-2.5 h-2.5 text-cinema-ai" /> Track
        </button>
        <button
          id="add-video-track-btn"
          data-testid="add-video-track-btn"
          onClick={() => addTrack('video')}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-cinema-800 hover:bg-cinema-700 text-cinema-textDim hover:text-white border border-cinema-border transition-colors flex-shrink-0"
          title="Add Video Track"
        >
          <Plus className="w-2.5 h-2.5 text-cinema-red" /> Video
        </button>
        <button
          id="add-audio-track-btn"
          data-testid="add-audio-track-btn"
          onClick={() => addTrack('audio')}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-cinema-800 hover:bg-cinema-700 text-cinema-textDim hover:text-white border border-cinema-border transition-colors flex-shrink-0"
          title="Add Audio Track"
        >
          <Plus className="w-2.5 h-2.5 text-emerald-400" /> Audio
        </button>

        {/* Phase 50: Shuttle Rate Badge & Timecode Navigation */}
        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          {/* Shuttle Status Badge */}
          <div
            id="timeline-shuttle-badge"
            data-testid="timeline-shuttle-badge"
            data-shuttle-rate={shuttleRate}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
              shuttleRate === 0
                ? 'bg-cinema-850 text-cinema-textDim border border-cinema-border/60'
                : shuttleRate > 0
                ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/80 shadow-xs ring-1 ring-emerald-500/30'
                : 'bg-rose-950/90 text-rose-300 border border-rose-500/80 shadow-xs ring-1 ring-rose-500/30'
            }`}
            title="Shuttle Rate (J: Reverse, K: Stop, L: Forward, Shift+J/L: 0.5x Slow-mo)"
          >
            {shuttleRate === 0 ? (
              <span>■ 0x</span>
            ) : shuttleRate > 0 ? (
              <span>▶ {shuttleRate}x</span>
            ) : (
              <span>◀ {shuttleRate}x</span>
            )}
          </div>

          {/* Timecode Jump Button */}
          <button
            id="timeline-timecode-btn"
            data-testid="timeline-timecode-btn"
            onClick={() => setTimecodeModalOpen(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] bg-cinema-850 hover:bg-cinema-800 text-cinema-ai hover:text-white border border-cinema-border transition-colors font-mono"
            title="Go to Timecode (Ctrl+G)"
          >
            <Clock className="w-2.5 h-2.5 text-cinema-ai" />
            <span>{formatTimecode(playheadMs)}</span>
          </button>

          <span className="text-[9px] md:text-[10px] text-cinema-textDim font-mono">
            / {formatTimecode(timeline.duration_ms)}
          </span>

          {/* MiniMap Toggle */}
          <button
            id="timeline-minimap-toggle-btn"
            data-testid="timeline-minimap-toggle-btn"
            onClick={() => setShowMiniMap(!showMiniMap)}
            className={`p-1 rounded text-[9px] border transition-colors ${
              showMiniMap
                ? 'bg-cinema-ai/20 border-cinema-ai/60 text-cinema-ai'
                : 'border-cinema-border text-cinema-textDim hover:text-white'
            }`}
            title={showMiniMap ? 'Hide Timeline Mini-Map' : 'Show Timeline Mini-Map'}
          >
            <MapIcon className="w-2.5 h-2.5 md:w-3 md:h-3" />
          </button>
        </div>

        {/* Save status */}
        {saveStatus === 'saving' && (
          <span className="text-[9px] text-cinema-ai animate-pulse flex-shrink-0">Saving…</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-[9px] text-emerald-400 flex-shrink-0">Saved</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-[9px] text-red-400 flex-shrink-0">Save failed!</span>
        )}
      </div>

      {/* Breadcrumb Navigation Bar for Nested Timelines (Phase 35) */}
      {breadcrumbStack.length > 0 && (
        <div
          id="timeline-breadcrumb-bar"
          data-testid="timeline-breadcrumb-bar"
          className="h-7 bg-indigo-950/70 border-b border-indigo-800/50 px-3 flex items-center justify-between text-xs flex-shrink-0"
        >
          <div className="flex items-center gap-2">
            <button
              id="timeline-breadcrumb-back"
              data-testid="timeline-breadcrumb-back"
              onClick={() => exitCompoundClip()}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-indigo-900 hover:bg-indigo-800 text-indigo-100 border border-indigo-600 font-medium transition-colors"
              title="Exit Compound Clip and return to parent sequence (Esc)"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <div className="flex items-center gap-1.5 text-cinema-textDim text-[11px] font-mono">
              <span className="text-cinema-text">Main Timeline</span>
              {breadcrumbStack.map((item) => (
                <React.Fragment key={item.id}>
                  <span className="text-indigo-400">&gt;</span>
                  <span className="text-indigo-200 font-semibold">{item.name}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <span className="text-[10px] text-indigo-400 font-mono">
            Editing Nested Context
          </span>
        </div>
      )}

      {/* Timeline MiniMap / Overview (Phase 50) */}
      {showMiniMap && (
        <TimelineMiniMap scrollContainerRef={scrollRef} scrollLeft={scrollLeft} />
      )}

      {/* Main body: headers + track area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Track headers — hidden on very small mobile to maximize timeline */}
        <div
          className={`flex-shrink-0 border-r border-cinema-border bg-cinema-900 ${isMobile ? 'w-20' : ''}`}
          style={{ width: isMobile ? 80 : HEADER_WIDTH }}
        >
          {/* Corner */}
          <div
            className="border-b border-cinema-border bg-cinema-900 flex items-center justify-between px-1.5 md:px-2"
            style={{ height: RULER_HEIGHT }}
          >
            <span className="text-[8px] md:text-[9px] text-cinema-textDim font-bold uppercase tracking-wider">TRACKS</span>
            <button
              id="add-track-btn"
              data-testid="add-track-btn"
              onClick={() => addTrack('video')}
              className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] bg-cinema-800 hover:bg-cinema-700 text-cinema-textDim hover:text-white border border-cinema-border transition-colors"
              title="Add Video Track"
            >
              <Plus className="w-2.5 h-2.5" /> Track
            </button>
          </div>
          {/* Track headers */}
          <div className="overflow-hidden" style={{ height: `calc(100% - ${RULER_HEIGHT}px)` }}>
            {timeline.tracks.map((track, i) => (
              <TrackHeader
                key={track.id}
                track={track}
                index={i}
                totalTracks={timeline.tracks.length}
                onContextMenu={(e, tId) => setTrackContextMenu({ x: e.clientX, y: e.clientY, trackId: tId })}
              />
            ))}
          </div>
        </div>

        {/* Right: Scrollable timeline area */}
        <div
          ref={scrollRef}
          id="timeline-tracks-scroll-container"
          data-testid="timeline-tracks-scroll-container"
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onScroll={handleScroll}
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {/* Sticky Ruler */}
          <div className="sticky top-0 z-20" style={{ width: totalWidth }}>
            <div
              className="relative bg-cinema-900 border-b border-cinema-border cursor-crosshair"
              style={{ height: RULER_HEIGHT, width: totalWidth }}
              onClick={handleRulerClick}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setRulerContextMenu({ x: e.clientX, y: e.clientY });
              }}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            >
              <Ruler duration_ms={timeline.duration_ms} zoomLevel={zoomLevel} />

              {/* Work Area Bar & Handles (Phase 43) */}
              {timeline.in_point_ms !== null && timeline.in_point_ms !== undefined &&
               timeline.out_point_ms !== null && timeline.out_point_ms !== undefined && (
                <div
                  id="timeline-work-area-bar"
                  data-testid="timeline-work-area-bar"
                  className="absolute top-0 bottom-0 bg-sky-500/25 border-t-2 border-b-2 border-sky-400 z-15 pointer-events-none"
                  style={{
                    left: (Math.min(timeline.in_point_ms, timeline.out_point_ms) / 1000) * zoomLevel,
                    width: Math.max(2, (Math.abs(timeline.out_point_ms - timeline.in_point_ms) / 1000) * zoomLevel),
                  }}
                />
              )}
              {timeline.in_point_ms !== null && timeline.in_point_ms !== undefined && (
                <div
                  id="timeline-in-point-handle"
                  data-testid="timeline-in-point-handle"
                  className="absolute top-0 bottom-0 w-3.5 -translate-x-1/2 z-35 cursor-ew-resize flex items-center justify-center group pointer-events-auto"
                  style={{ left: (timeline.in_point_ms / 1000) * zoomLevel }}
                  onPointerDown={handleInPointerDown}
                  onClick={(e) => { e.stopPropagation(); setPlayhead(timeline.in_point_ms!); }}
                  title={`Mark In: ${formatTimecode(timeline.in_point_ms)}`}
                >
                  <div className="w-2 h-full bg-sky-400 text-black flex items-center justify-center shadow-md border-r border-sky-300 font-bold text-[9px] select-none hover:bg-sky-300">
                    [
                  </div>
                </div>
              )}
              {timeline.out_point_ms !== null && timeline.out_point_ms !== undefined && (
                <div
                  id="timeline-out-point-handle"
                  data-testid="timeline-out-point-handle"
                  className="absolute top-0 bottom-0 w-3.5 -translate-x-1/2 z-35 cursor-ew-resize flex items-center justify-center group pointer-events-auto"
                  style={{ left: (timeline.out_point_ms / 1000) * zoomLevel }}
                  onPointerDown={handleOutPointerDown}
                  onClick={(e) => { e.stopPropagation(); setPlayhead(timeline.out_point_ms!); }}
                  title={`Mark Out: ${formatTimecode(timeline.out_point_ms)}`}
                >
                  <div className="w-2 h-full bg-sky-400 text-black flex items-center justify-center shadow-md border-l border-sky-300 font-bold text-[9px] select-none hover:bg-sky-300">
                    ]
                  </div>
                </div>
              )}

              {/* Timeline Sequence Markers (Phase 36) */}
              {Array.isArray(timeline.markers) && timeline.markers.map((m) => {
                const markerLeft = (m.time_ms / 1000) * zoomLevel;
                const colorStyle = MARKER_COLOR_MAP[m.color] || MARKER_COLOR_MAP.blue;
                return (
                  <div
                    key={m.id}
                    id={`timeline-marker-${m.id}`}
                    data-testid={`timeline-marker-${m.id}`}
                    className="absolute top-0 w-3 h-full -translate-x-1/2 z-30 cursor-pointer group pointer-events-auto"
                    style={{ left: markerLeft }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlayhead(m.time_ms);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingMarker({ marker: m });
                    }}
                    title={`${m.name}: ${m.comment || 'No comment'} (${formatTimecode(m.time_ms)}) — Double-click to edit`}
                  >
                    {/* Diamond Flag Head */}
                    <div
                      className="w-2.5 h-2.5 rotate-45 mx-auto border shadow-sm transition-transform group-hover:scale-125"
                      style={{ backgroundColor: colorStyle.bg, borderColor: colorStyle.border }}
                    />
                    {/* Optional Duration Bar */}
                    {m.duration_ms && m.duration_ms > 0 ? (
                      <div
                        className="absolute top-1 left-1.5 h-1 opacity-70 pointer-events-none rounded-r"
                        style={{
                          width: (m.duration_ms / 1000) * zoomLevel,
                          backgroundColor: colorStyle.bg,
                        }}
                      />
                    ) : null}
                    {/* Guide line down ruler */}
                    <div
                      className="w-0.5 h-full mx-auto opacity-70"
                      style={{ backgroundColor: colorStyle.bg }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Track lanes + clips */}
          <div
            className="relative"
            style={{ width: totalWidth }}
            onClick={() => { selectClip(null); clearSelection(); setSelectedGap(null); }}
          >
            {/* Phase 43: Work Area Column Overlay */}
            {timeline.in_point_ms !== null && timeline.in_point_ms !== undefined &&
             timeline.out_point_ms !== null && timeline.out_point_ms !== undefined && (
              <div
                id="timeline-work-area-overlay"
                data-testid="timeline-work-area-overlay"
                className="absolute top-0 bottom-0 bg-sky-500/5 border-l border-r border-sky-400/30 pointer-events-none z-1"
                style={{
                  left: (Math.min(timeline.in_point_ms, timeline.out_point_ms) / 1000) * zoomLevel,
                  width: Math.max(2, (Math.abs(timeline.out_point_ms - timeline.in_point_ms) / 1000) * zoomLevel),
                }}
              />
            )}
            {timeline.tracks.map((track, i) => {
              const color = TRACK_COLORS[track.track_role] || '#475569';
              const isAudio = ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(track.track_role);
              const trackHeight = track.height_px || DEFAULT_TRACK_HEIGHT;
              const isDropTarget = dropTargetTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className={`relative border-b border-cinema-border/30 transition-colors ${
                    isDropTarget ? 'bg-cinema-ai/10 border-cinema-ai/30' : ''
                  }`}
                  style={{
                    height: trackHeight,
                    backgroundColor: isDropTarget ? undefined : (i % 2 === 0 ? '#0d1017' : '#0a0d13'),
                  }}
                  onDragOver={(e) => handleTrackDragOver(e, track.id)}
                  onDrop={(e) => handleTrackDrop(e, track.id)}
                  onDragLeave={handleTrackDragLeave}
                >
                  {/* Phase 40: Track Gap blocks */}
                  {calculateTrackGaps(track).map((gap) => {
                    const gapLeft = (gap.start_time_ms / 1000) * zoomLevel;
                    const gapWidth = Math.max(2, (gap.duration_ms / 1000) * zoomLevel);
                    const isSelected = selectedGap?.trackId === gap.track_id && selectedGap?.startMs === gap.start_time_ms;
                    return (
                      <div
                        key={`gap-${gap.track_id}-${gap.start_time_ms}`}
                        id={isSelected ? 'timeline-gap-selected' : undefined}
                        data-testid="timeline-gap-block"
                        data-track-id={gap.track_id}
                        data-start-ms={gap.start_time_ms}
                        data-duration-ms={gap.duration_ms}
                        className={`absolute top-0 bottom-0 cursor-pointer transition-colors z-5 group flex items-center justify-center ${
                          isSelected
                            ? 'bg-amber-500/20 border border-dashed border-amber-400'
                            : 'bg-transparent hover:bg-white/5 border border-dashed border-cinema-border/20 hover:border-amber-400/40'
                        }`}
                        style={{ left: gapLeft, width: gapWidth }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGap({
                            trackId: gap.track_id,
                            startMs: gap.start_time_ms,
                            durationMs: gap.duration_ms,
                          });
                          selectClip(null);
                          clearSelection();
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedGap({
                            trackId: gap.track_id,
                            startMs: gap.start_time_ms,
                            durationMs: gap.duration_ms,
                          });
                          setGapContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            trackId: gap.track_id,
                            startMs: gap.start_time_ms,
                            durationMs: gap.duration_ms,
                          });
                        }}
                        title={`Gap: ${formatTimecode(gap.start_time_ms)} - ${formatTimecode(gap.end_time_ms)} (${gap.duration_ms}ms) — Click to select, Right-click or Close Gap to delete`}
                      >
                        {gapWidth > 45 && (
                          <span className={`text-[7.5px] font-mono select-none px-1 py-0.2 rounded ${isSelected ? 'text-amber-300 bg-black/60 border border-amber-400/50' : 'text-cinema-textDim/40 group-hover:text-amber-300/70'}`}>
                            GAP {Math.round(gap.duration_ms)}ms
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Clips — virtualized: only render visible clips */}
                  {track.clips
                    .filter((clip) => {
                      const clipLeft = (clip.start_time_ms / 1000) * zoomLevel;
                      const clipRight = clipLeft + (clip.duration_ms / 1000) * zoomLevel;
                      return clipRight > scrollLeft - 200 && clipLeft < scrollLeft + 2000;
                    })
                    .map((clip) => {
                      const realWaveform = (clip as any)._waveformData || clip.metadata_info?.waveform_data || (clip.asset_id ? assetMap[clip.asset_id]?.waveform_data : undefined);
                      return (
                        <ClipBlock
                          key={clip.id}
                          clip={clip}
                          zoomLevel={zoomLevel}
                          trackColor={color}
                          trackHeight={trackHeight}
                          isAudioTrack={isAudio}
                          isTrackLocked={track.is_locked}
                          waveformData={realWaveform}
                          onOpenTransition={handleOpenTransition}
                          onContextMenu={(e, cId) => setContextMenu({ x: e.clientX, y: e.clientY, clipId: cId })}
                          onEditMarker={(m, cId) => setEditingMarker({ marker: m, clipId: cId })}
                          onSeek={(ms) => setPlayhead(ms)}
                        />
                      );
                    })}

                  {/* Drop indicator */}
                  {isDropTarget && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-cinema-ai font-medium">Drop here</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Playhead needle */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{ left: playheadX, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-full bg-cinema-red" />
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-2.5 bg-cinema-red"
                style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Transition picker */}
      {transitionPicker && (
        <TransitionPicker
          clipAId={transitionPicker.clipAId}
          clipBId={transitionPicker.clipBId || transitionPicker.clipAId}
          position={transitionPicker.position}
          onClose={() => setTransitionPicker(null)}
        />
      )}

      {/* Timeline Revision History Modal */}
      {showRevisions && timeline?.project_id && (
        <TimelineRevisionsModal
          projectId={timeline.project_id}
          onClose={() => setShowRevisions(false)}
        />
      )}

      {/* Clip Context Menu */}
      {contextMenu && (
        <div
          data-testid="timeline-clip-context-menu"
          className="fixed z-50 bg-cinema-850 border border-cinema-border rounded shadow-2xl py-1 px-1 text-xs min-w-[150px] animate-fadeIn backdrop-blur-md"
          style={{ left: Math.min(contextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 160 : contextMenu.x), top: Math.min(contextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 180 : contextMenu.y) }}
          onClick={(e) => e.stopPropagation()}
        >
          {selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId) && (
            <div className="px-2 py-1 text-[10px] text-cinema-ai font-medium border-b border-cinema-border/50 mb-1">
              {selectedClipIds.size} clips selected
            </div>
          )}
          <button
            data-testid="context-menu-duplicate"
            onClick={() => {
              if (selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId)) {
                duplicateSelectedClips();
              } else {
                duplicateClip(contextMenu.clipId);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>{selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId) ? `Duplicate (${selectedClipIds.size} clips)` : 'Duplicate'}</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+D</span>
          </button>
          <button
            data-testid="context-menu-copy"
            onClick={() => {
              if (selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId)) {
                copySelectedClips();
              } else {
                copyClip(contextMenu.clipId);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>{selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId) ? `Copy (${selectedClipIds.size} clips)` : 'Copy'}</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+C</span>
          </button>
          {(clipboardClip || (clipboardClips && clipboardClips.length > 0)) && (
            <button
              data-testid="context-menu-paste"
              onClick={() => {
                if (clipboardClips && clipboardClips.length > 1) {
                  pasteSelectedClips();
                } else {
                  pasteClip();
                }
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
            >
              <span>{clipboardClips && clipboardClips.length > 1 ? `Paste (${clipboardClips.length} clips)` : 'Paste'}</span>
              <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+V</span>
            </button>
          )}
          {selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId) && (
            <button
              id="context-menu-compound"
              data-testid="context-menu-compound"
              onClick={() => {
                createCompoundClip();
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-indigo-950/70 text-indigo-300 hover:text-indigo-100 flex items-center justify-between"
            >
              <span>Create Compound Clip</span>
              <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+G</span>
            </button>
          )}
          {contextMenuClip?.is_compound && (
            <>
              <button
                id="context-menu-open-compound"
                data-testid="context-menu-open-compound"
                onClick={() => {
                  openCompoundClip(contextMenu.clipId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-indigo-950/70 text-indigo-300 hover:text-indigo-100 flex items-center justify-between"
              >
                <span>Open Nested Timeline</span>
              </button>
              <button
                id="context-menu-ungroup"
                data-testid="context-menu-ungroup"
                onClick={() => {
                  ungroupCompoundClip(contextMenu.clipId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-indigo-950/70 text-indigo-300 hover:text-indigo-100 flex items-center justify-between"
              >
                <span>Ungroup Compound</span>
                <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+Shift+G</span>
              </button>
            </>
          )}

          {/* Phase 42: Grouping Context Menu Actions */}
          {selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId) && (
            <button
              id="context-menu-group"
              data-testid="context-menu-group"
              onClick={() => {
                groupSelectedClips();
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-purple-950/70 text-purple-300 hover:text-purple-100 flex items-center justify-between"
            >
              <span>Group Clips</span>
              <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+G</span>
            </button>
          )}
          {Boolean(contextMenuClip?.group_id || Array.from(selectedClipIds).some((id) => timeline?.tracks.some((t) => t.clips.some((c) => c.id === id && c.group_id)))) && (
            <button
              id="context-menu-ungroup-clips"
              data-testid="context-menu-ungroup-clips"
              onClick={() => {
                ungroupSelectedClips();
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-purple-950/70 text-purple-300 hover:text-purple-100 flex items-center justify-between"
            >
              <span>Ungroup Clips</span>
              <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+Shift+G</span>
            </button>
          )}

          {/* Phase 42: Audio-Video Linking Context Menu Actions */}
          {selectedClipIds.size === 2 && selectedClipIds.has(contextMenu.clipId) && (
            <button
              id="context-menu-link"
              data-testid="context-menu-link"
              onClick={() => {
                linkSelectedClips();
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-sky-950/70 text-sky-300 hover:text-sky-100 flex items-center justify-between"
            >
              <span>Link Clips</span>
              <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+L</span>
            </button>
          )}
          {Boolean(contextMenuClip?.linked_clip_id || Array.from(selectedClipIds).some((id) => timeline?.tracks.some((t) => t.clips.some((c) => c.id === id && c.linked_clip_id)))) && (
            <button
              id="context-menu-unlink"
              data-testid="context-menu-unlink"
              onClick={() => {
                unlinkSelectedClips();
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-sky-950/70 text-sky-300 hover:text-sky-100 flex items-center justify-between"
            >
              <span>Unlink Clips</span>
              <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+L</span>
            </button>
          )}
          {contextMenuClip?.linked_clip_id && (
            <button
              id="context-menu-realign-sync"
              data-testid="context-menu-realign-sync"
              onClick={() => {
                realignLinkedClip(contextMenu.clipId);
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-emerald-950/70 text-emerald-300 hover:text-emerald-100 flex items-center justify-between"
            >
              <span>Re-align In-Sync</span>
            </button>
          )}
          <div className="h-px bg-cinema-border my-1" />
          <button
            data-testid="context-menu-split"
            onClick={() => {
              splitClipAtPlayhead(contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>Split at Playhead</span>
            <span className="text-[10px] text-cinema-textDim font-mono">S</span>
          </button>
          <button
            id="context-menu-ripple-delete"
            data-testid="context-menu-ripple-delete"
            onClick={() => {
              if (selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId)) {
                rippleDeleteSelectedClips();
              } else {
                rippleDelete(contextMenu.clipId);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/60 text-amber-400 hover:text-amber-300 flex items-center justify-between"
          >
            <span>{selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId) ? `Ripple Delete (${selectedClipIds.size} clips)` : 'Ripple Delete'}</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Shift+Del</span>
          </button>
          <button
            id="context-menu-ripple-head"
            data-testid="context-menu-ripple-head"
            onClick={() => {
              rippleTrimToPlayhead('head', contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/60 text-amber-300 hover:text-amber-200 flex items-center justify-between"
          >
            <span>Ripple Trim Head to Playhead</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Q</span>
          </button>
          <button
            id="context-menu-ripple-tail"
            data-testid="context-menu-ripple-tail"
            onClick={() => {
              rippleTrimToPlayhead('tail', contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/60 text-amber-300 hover:text-amber-200 flex items-center justify-between"
          >
            <span>Ripple Trim Tail to Playhead</span>
            <span className="text-[10px] text-cinema-textDim font-mono">W</span>
          </button>
          <button
            data-testid="context-menu-delete"
            onClick={() => {
              if (selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId)) {
                deleteSelectedClips();
              } else {
                deleteClip(contextMenu.clipId);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-red-950/60 text-red-400 hover:text-red-300 flex items-center justify-between"
          >
            <span>{selectedClipIds.size > 1 && selectedClipIds.has(contextMenu.clipId) ? `Delete (${selectedClipIds.size} clips)` : 'Delete'}</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Del</span>
          </button>
          <div className="h-px bg-cinema-border my-1" />
          <button
            id="context-menu-add-clip-marker"
            data-testid="context-menu-add-clip-marker"
            onClick={() => {
              addClipMarker(contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>Add Clip Marker</span>
            <span className="text-[10px] text-cinema-textDim font-mono">M</span>
          </button>
          <button
            id="context-menu-add-marker"
            data-testid="context-menu-add-marker"
            onClick={() => {
              addTimelineMarker(playheadMs);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>Add Timeline Marker</span>
            <span className="text-[10px] text-cinema-textDim font-mono">M</span>
          </button>
          {/* Phase 43: Work Area Context Menu Actions */}
          <div className="h-px bg-cinema-border my-1" />
          <button
            id="context-menu-mark-clip-range"
            data-testid="context-menu-mark-clip-range"
            onClick={() => {
              markClipRange(contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-sky-950/70 text-sky-300 hover:text-sky-100 flex items-center justify-between"
          >
            <span>Mark Clip Range</span>
            <span className="text-[10px] text-cinema-textDim font-mono">X</span>
          </button>
          {hasValidWorkArea && (
            <>
              <button
                id="context-menu-lift-range"
                data-testid="context-menu-lift-range"
                onClick={() => {
                  liftRange();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/70 text-amber-300 hover:text-amber-100 flex items-center justify-between"
              >
                <span>Lift Work Area</span>
                <span className="text-[10px] text-cinema-textDim font-mono">;</span>
              </button>
              <button
                id="context-menu-extract-range"
                data-testid="context-menu-extract-range"
                onClick={() => {
                  extractRange();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-rose-950/70 text-rose-300 hover:text-rose-100 flex items-center justify-between"
              >
                <span>Extract Work Area</span>
                <span className="text-[10px] text-cinema-textDim font-mono">'</span>
              </button>
            </>
          )}
          {((timeline?.in_point_ms !== null && timeline?.in_point_ms !== undefined) ||
            (timeline?.out_point_ms !== null && timeline?.out_point_ms !== undefined)) && (
            <button
              id="context-menu-clear-in-out"
              data-testid="context-menu-clear-in-out"
              onClick={() => {
                clearInOut();
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-textDim hover:text-white flex items-center justify-between"
            >
              <span>Clear In/Out</span>
              <span className="text-[10px] text-cinema-textDim font-mono">Alt+X</span>
            </button>
          )}
          {/* Phase 45: 3-Point & Patching Actions */}
          <div className="h-px bg-cinema-border my-1" />
          <button
            id="context-menu-insert"
            data-testid="context-menu-insert"
            onClick={() => {
              insertEdit();
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-emerald-950/70 text-emerald-300 hover:text-emerald-100 flex items-center justify-between"
          >
            <span>Insert Edit</span>
            <span className="text-[10px] text-cinema-textDim font-mono">,</span>
          </button>
          <button
            id="context-menu-overwrite"
            data-testid="context-menu-overwrite"
            onClick={() => {
              overwriteEdit();
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-950/70 text-blue-300 hover:text-blue-100 flex items-center justify-between"
          >
            <span>Overwrite Edit</span>
            <span className="text-[10px] text-cinema-textDim font-mono">.</span>
          </button>
          <button
            id="context-menu-replace"
            data-testid="context-menu-replace"
            onClick={() => {
              replaceEdit(contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-purple-950/70 text-purple-300 hover:text-purple-100 flex items-center justify-between"
          >
            <span>Replace Clip (In Point)</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Shift+R</span>
          </button>
          <button
            id="context-menu-replace-playhead"
            data-testid="context-menu-replace-playhead"
            onClick={() => {
              replaceEdit(contextMenu.clipId, undefined, { mode: 'from_playhead' });
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-purple-950/70 text-purple-300 hover:text-purple-100 flex items-center justify-between"
          >
            <span>Replace from Playhead</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Sync</span>
          </button>
          <button
            id="context-menu-fit-to-fill"
            data-testid="context-menu-fit-to-fill"
            onClick={() => {
              fitToFillEdit(contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-emerald-950/70 text-emerald-300 hover:text-emerald-100 flex items-center justify-between"
          >
            <span>Fit to Fill from Source</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Shift+F11</span>
          </button>
          <div className="h-px bg-cinema-border/50 my-1" />
          <button
            id="context-clip-match-frame"
            data-testid="context-clip-match-frame"
            onClick={() => {
              matchFrame(contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/70 text-amber-300 hover:text-amber-100 flex items-center justify-between"
          >
            <span>Match Frame</span>
            <span className="text-[10px] text-cinema-textDim font-mono">F</span>
          </button>
          <button
            id="context-clip-reveal-browser"
            data-testid="context-clip-reveal-browser"
            onClick={() => {
              const targetClip = timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === contextMenu.clipId);
              if (targetClip?.asset_id) {
                setHighlightedAssetId(targetClip.asset_id);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-700/70 text-cinema-text flex items-center justify-between"
          >
            <span>Reveal in Media Browser</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Alt+Shift+F</span>
          </button>
        </div>
      )}

      {/* Track Context Menu (Phase 37) */}
      {trackContextMenu && (() => {
        const targetTrack = timeline.tracks.find((t) => t.id === trackContextMenu.trackId);
        if (!targetTrack) return null;
        const trackIndex = timeline.tracks.findIndex((t) => t.id === trackContextMenu.trackId);
        const isAudio = targetTrack.track_type === 'audio' || ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(targetTrack.track_role);

        return (
          <div
            id="track-context-menu"
            data-testid="track-context-menu"
            className="fixed z-50 bg-cinema-850 border border-cinema-border rounded shadow-2xl py-1 px-1 text-xs min-w-[170px] animate-fadeIn backdrop-blur-md"
            style={{
              left: Math.min(trackContextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 180 : trackContextMenu.x),
              top: Math.min(trackContextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 250 : trackContextMenu.y),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[10px] text-cinema-ai font-medium border-b border-cinema-border/50 mb-1 flex items-center justify-between">
              <span className="truncate">{targetTrack.name}</span>
              <span className="text-cinema-textDim font-mono uppercase">{targetTrack.track_type}</span>
            </div>
            {/* Phase 45: Patch Target Action in context menu */}
            <button
              id="context-track-target"
              data-testid="context-track-target"
              onClick={() => {
                setTargetTrack(targetTrack.id, isAudio ? 'audio' : 'video');
                setTrackContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
            >
              <span>{isAudio ? 'Patch Target Audio (A1)' : 'Patch Target Video (V1)'}</span>
              <span className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded ${
                (isAudio && targetAudioTrackId === targetTrack.id) || (!isAudio && targetVideoTrackId === targetTrack.id)
                  ? 'bg-blue-600 text-white'
                  : 'bg-cinema-800 text-cinema-textDim'
              }`}>
                {isAudio ? 'A1' : 'V1'}
              </span>
            </button>
            <div className="h-px bg-cinema-border my-1" />
            <button
              id="context-track-lock"
              data-testid="context-track-lock"
              onClick={() => {
                toggleTrackLock(targetTrack.id);
                setTrackContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
            >
              <span>{targetTrack.is_locked ? 'Unlock Track' : 'Lock Track'}</span>
              {targetTrack.is_locked ? <Unlock className="w-3 h-3 text-amber-400" /> : <Lock className="w-3 h-3 text-cinema-textDim" />}
            </button>
            <button
              id="context-track-visibility"
              data-testid="context-track-visibility"
              onClick={() => {
                toggleTrackVisibility(targetTrack.id);
                setTrackContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
            >
              <span>{targetTrack.is_visible ? 'Hide Track' : 'Show Track'}</span>
              {targetTrack.is_visible ? <EyeOff className="w-3 h-3 text-cinema-textDim" /> : <Eye className="w-3 h-3 text-emerald-400" />}
            </button>
            {isAudio && (
              <>
                <button
                  id="context-track-mute"
                  data-testid="context-track-mute"
                  onClick={() => {
                    toggleTrackMute(targetTrack.id);
                    setTrackContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
                >
                  <span>{targetTrack.is_muted ? 'Unmute Track' : 'Mute Track'}</span>
                  <VolumeX className="w-3 h-3 text-red-400" />
                </button>
                <button
                  id="context-track-solo"
                  data-testid="context-track-solo"
                  onClick={() => {
                    toggleTrackSolo(targetTrack.id);
                    setTrackContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
                >
                  <span>{targetTrack.is_solo ? 'Disable Solo' : 'Solo Track'}</span>
                  <Volume2 className="w-3 h-3 text-amber-400" />
                </button>
              </>
            )}
            <div className="h-px bg-cinema-border my-1" />
            <button
              id="context-track-move-up"
              data-testid="context-track-move-up"
              disabled={trackIndex === 0}
              onClick={() => {
                reorderTrack(targetTrack.id, 'up');
                setTrackContextMenu(null);
              }}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between ${
                trackIndex === 0 ? 'text-cinema-textDim/40 cursor-not-allowed' : 'hover:bg-cinema-750 text-cinema-text hover:text-white'
              }`}
            >
              <span>Move Track Up</span>
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              id="context-track-move-down"
              data-testid="context-track-move-down"
              disabled={trackIndex >= timeline.tracks.length - 1}
              onClick={() => {
                reorderTrack(targetTrack.id, 'down');
                setTrackContextMenu(null);
              }}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between ${
                trackIndex >= timeline.tracks.length - 1 ? 'text-cinema-textDim/40 cursor-not-allowed' : 'hover:bg-cinema-750 text-cinema-text hover:text-white'
              }`}
            >
              <span>Move Track Down</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            <div className="h-px bg-cinema-border my-1" />
            <button
              id="context-add-video-track"
              data-testid="context-add-video-track"
              onClick={() => {
                addTrack('video');
                setTrackContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-ai hover:text-white flex items-center justify-between"
            >
              <span>+ Add Video Track</span>
              <Plus className="w-3 h-3 text-cinema-ai" />
            </button>
            <button
              id="context-add-audio-track"
              data-testid="context-add-audio-track"
              onClick={() => {
                addTrack('audio');
                setTrackContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-emerald-400 hover:text-white flex items-center justify-between"
            >
              <span>+ Add Audio Track</span>
              <Plus className="w-3 h-3 text-emerald-400" />
            </button>
            <div className="h-px bg-cinema-border my-1" />
            <button
              id="context-track-delete"
              data-testid="context-track-delete"
              onClick={() => {
                deleteTrack(targetTrack.id);
                setTrackContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-red-950/60 text-red-400 hover:text-red-300 flex items-center justify-between"
            >
              <span>Delete Track</span>
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        );
      })()}

      {/* Phase 40: Gap Context Menu */}
      {gapContextMenu && (() => {
        return (
          <div
            id="gap-context-menu"
            data-testid="gap-context-menu"
            className="fixed z-50 bg-cinema-850 border border-cinema-border rounded shadow-2xl py-1 px-1 text-xs min-w-[170px] animate-fadeIn backdrop-blur-md"
            style={{
              left: Math.min(gapContextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 180 : gapContextMenu.x),
              top: Math.min(gapContextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 200 : gapContextMenu.y),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[10px] text-amber-400 font-medium border-b border-cinema-border/50 mb-1 flex items-center justify-between">
              <span>Gap Actions</span>
              <span className="text-cinema-textDim font-mono">{Math.round(gapContextMenu.durationMs)}ms</span>
            </div>
            <button
              id="context-close-gap"
              data-testid="context-close-gap"
              onClick={() => {
                deleteGap(gapContextMenu.trackId, gapContextMenu.startMs, 'track');
                setGapContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/70 text-amber-300 hover:text-white flex items-center justify-between"
            >
              <span>Close Gap (Track)</span>
              <CornerDownLeft className="w-3 h-3 text-amber-400" />
            </button>
            <button
              id="context-ripple-delete"
              data-testid="context-ripple-delete"
              onClick={() => {
                deleteGap(gapContextMenu.trackId, gapContextMenu.startMs, 'track');
                setGapContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/70 text-amber-300 hover:text-white flex items-center justify-between"
            >
              <span>Ripple Delete Gap</span>
              <CornerDownLeft className="w-3 h-3 text-amber-400" />
            </button>
            <button
              id="context-close-gap-all"
              data-testid="context-close-gap-all"
              onClick={() => {
                deleteGap(gapContextMenu.trackId, gapContextMenu.startMs, 'all');
                setGapContextMenu(null);
              }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/70 text-amber-300 hover:text-white flex items-center justify-between"
            >
              <span>Close Gap (All Tracks)</span>
              <CornerDownLeft className="w-3 h-3 text-amber-400" />
            </button>
          </div>
        );
      })()}

      {/* Phase 36: Marker Edit Dialog / Popover Modal */}
      {editingMarker && (
        <div
          id="marker-dialog"
          data-testid="marker-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setEditingMarker(null)}
        >
          <div
            className="w-full max-w-sm bg-cinema-900 border border-cinema-border rounded-lg shadow-2xl p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-cinema-border/60 pb-2">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-white text-sm">
                  {editingMarker.clipId ? 'Edit Clip Marker' : 'Edit Timeline Marker'}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-cinema-textDim">
                {formatTimecode(markerDraft.time_ms)}
              </span>
            </div>

            {/* Name input */}
            <div className="space-y-1">
              <label className="text-[11px] text-cinema-textDim block font-medium">Name</label>
              <input
                id="marker-name-input"
                data-testid="marker-name-input"
                type="text"
                value={markerDraft.name}
                onChange={(e) => setMarkerDraft({ ...markerDraft, name: e.target.value })}
                className="w-full bg-cinema-850 border border-cinema-border rounded px-2.5 py-1.5 text-cinema-text text-xs outline-none focus:border-blue-500"
                placeholder="Marker name..."
                autoFocus
              />
            </div>

            {/* Color Tag Picker */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-cinema-textDim block font-medium">Color Tag</label>
              <div className="flex items-center gap-2">
                {MARKER_COLORS.map((c) => {
                  const style = MARKER_COLOR_MAP[c];
                  const isSelected = markerDraft.color === c;
                  return (
                    <button
                      key={c}
                      id={`marker-color-${c}`}
                      data-testid={`marker-color-${c}`}
                      type="button"
                      onClick={() => setMarkerDraft({ ...markerDraft, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        isSelected ? 'scale-115 ring-2 ring-white ring-offset-1 ring-offset-cinema-900' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: style.bg, borderColor: style.border }}
                      title={c}
                    />
                  );
                })}
              </div>
            </div>

            {/* Comment / Annotation */}
            <div className="space-y-1">
              <label className="text-[11px] text-cinema-textDim block font-medium">Comment / Annotation</label>
              <textarea
                id="marker-comment-input"
                data-testid="marker-comment-input"
                value={markerDraft.comment}
                onChange={(e) => setMarkerDraft({ ...markerDraft, comment: e.target.value })}
                rows={2}
                className="w-full bg-cinema-850 border border-cinema-border rounded px-2.5 py-1.5 text-cinema-text text-xs outline-none focus:border-blue-500 resize-none"
                placeholder="Add notes, cues, or instructions..."
              />
            </div>

            {/* Time & Duration */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-cinema-textDim block">Time (ms)</label>
                <input
                  id="marker-time-input"
                  data-testid="marker-time-input"
                  type="number"
                  min={0}
                  value={markerDraft.time_ms}
                  onChange={(e) => setMarkerDraft({ ...markerDraft, time_ms: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1 text-cinema-text text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-cinema-textDim block">Duration (ms)</label>
                <input
                  id="marker-duration-input"
                  data-testid="marker-duration-input"
                  type="number"
                  min={0}
                  value={markerDraft.duration_ms}
                  onChange={(e) => setMarkerDraft({ ...markerDraft, duration_ms: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1 text-cinema-text text-xs font-mono"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-cinema-border/60">
              <button
                id="marker-delete-btn"
                data-testid="marker-delete-btn"
                type="button"
                onClick={() => {
                  deleteMarker(editingMarker.marker.id, editingMarker.clipId);
                  setEditingMarker(null);
                }}
                className="px-2.5 py-1.5 rounded text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/50 transition-colors"
              >
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  id="marker-cancel-btn"
                  data-testid="marker-cancel-btn"
                  type="button"
                  onClick={() => setEditingMarker(null)}
                  className="px-3 py-1.5 rounded text-xs text-cinema-textDim hover:text-white bg-cinema-800 hover:bg-cinema-750 transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="marker-save-btn"
                  data-testid="marker-save-btn"
                  type="button"
                  onClick={() => {
                    updateMarker(
                      editingMarker.marker.id,
                      {
                        name: markerDraft.name,
                        comment: markerDraft.comment,
                        color: markerDraft.color,
                        time_ms: markerDraft.time_ms,
                        duration_ms: markerDraft.duration_ms,
                      },
                      editingMarker.clipId
                    );
                    setEditingMarker(null);
                  }}
                  className="px-3 py-1.5 rounded text-xs text-white bg-blue-600 hover:bg-blue-500 font-medium transition-colors shadow-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 50: Ruler Navigation Context Menu */}
      {rulerContextMenu && (
        <div
          id="ruler-context-menu"
          data-testid="ruler-context-menu"
          className="fixed z-50 bg-cinema-850 border border-cinema-border rounded shadow-2xl py-1 px-1 text-xs min-w-[180px] animate-fadeIn backdrop-blur-md"
          style={{
            left: Math.min(rulerContextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 190 : rulerContextMenu.x),
            top: Math.min(rulerContextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 260 : rulerContextMenu.y),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] text-cinema-ai font-medium border-b border-cinema-border/50 mb-1 flex items-center justify-between">
            <span>Timeline Navigation</span>
            <span className="text-cinema-textDim font-mono">{formatTimecode(playheadMs)}</span>
          </div>
          <button
            id="ruler-context-zoom-to-fit"
            data-testid="ruler-context-zoom-to-fit"
            onClick={() => {
              zoomToFit();
              setRulerContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>Zoom to Fit</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Shift+Z</span>
          </button>
          <button
            id="ruler-context-timecode"
            data-testid="ruler-context-timecode"
            onClick={() => {
              setTimecodeModalOpen(true);
              setRulerContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>Go to Timecode...</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Ctrl+G</span>
          </button>
          <div className="h-px bg-cinema-border my-1" />
          <button
            id="ruler-context-jump-in"
            data-testid="ruler-context-jump-in"
            onClick={() => {
              jumpToInPoint();
              setRulerContextMenu(null);
            }}
            disabled={timeline.in_point_ms === null || timeline.in_point_ms === undefined}
            className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between ${
              timeline.in_point_ms !== null && timeline.in_point_ms !== undefined
                ? 'hover:bg-cinema-750 text-cinema-text hover:text-white'
                : 'text-cinema-textDim/40 cursor-not-allowed'
            }`}
          >
            <span>Jump to In Point</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Shift+I</span>
          </button>
          <button
            id="ruler-context-jump-out"
            data-testid="ruler-context-jump-out"
            onClick={() => {
              jumpToOutPoint();
              setRulerContextMenu(null);
            }}
            disabled={timeline.out_point_ms === null || timeline.out_point_ms === undefined}
            className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between ${
              timeline.out_point_ms !== null && timeline.out_point_ms !== undefined
                ? 'hover:bg-cinema-750 text-cinema-text hover:text-white'
                : 'text-cinema-textDim/40 cursor-not-allowed'
            }`}
          >
            <span>Jump to Out Point</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Shift+O</span>
          </button>
          <div className="h-px bg-cinema-border my-1" />
          <button
            id="ruler-context-jump-start"
            data-testid="ruler-context-jump-start"
            onClick={() => {
              jumpToSequenceStart();
              setRulerContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>Jump to Sequence Start</span>
            <span className="text-[10px] text-cinema-textDim font-mono">Home</span>
          </button>
          <button
            id="ruler-context-jump-end"
            data-testid="ruler-context-jump-end"
            onClick={() => {
              jumpToSequenceEnd();
              setRulerContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-cinema-750 text-cinema-text hover:text-white flex items-center justify-between"
          >
            <span>Jump to Sequence End</span>
            <span className="text-[10px] text-cinema-textDim font-mono">End</span>
          </button>
        </div>
      )}

    </div>
  );
};
