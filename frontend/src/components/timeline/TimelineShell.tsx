import React, { useRef, useCallback, useState, useEffect, memo } from 'react';
import {
  ZoomIn, ZoomOut, Magnet, Volume2, VolumeX, Eye, EyeOff,
  Lock, Unlock, Scissors, Trash2, Copy, Repeat, CornerDownLeft, History,
} from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { Track, Clip, Asset } from '../../types';
import { WaveformBar } from './WaveformBar';
import { TransitionPicker } from './TransitionPicker';
import { TimelineRevisionsModal } from './TimelineRevisionsModal';
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
}

const TrackHeader = memo<TrackHeaderProps>(({ track }) => {
  const {
    toggleTrackMute, toggleTrackSolo, toggleTrackLock, toggleTrackVisibility,
    selectedTrackId, selectTrack,
  } = useTimelineStore();
  const isSelected = selectedTrackId === track.id;
  const color = TRACK_COLORS[track.track_role] || '#475569';
  const height = track.height_px || DEFAULT_TRACK_HEIGHT;

  return (
    <div
      className={`flex items-center gap-1 px-1.5 border-b border-cinema-border cursor-pointer select-none
        ${isSelected ? 'bg-cinema-750' : 'bg-cinema-850 hover:bg-cinema-800'} transition-colors`}
      style={{ height, minHeight: height }}
      onClick={() => selectTrack(track.id)}
    >
      {/* Color swatch */}
      <div
        className="w-1 h-5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Track name */}
      <span className="text-[9px] text-cinema-textMuted font-medium truncate flex-1 mx-0.5">
        {track.name}
      </span>

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}
          className={`p-0.5 rounded transition-colors ${track.is_muted ? 'text-red-400' : 'text-cinema-textDim hover:text-cinema-text'}`}
          title={track.is_muted ? 'Unmute' : 'Mute'}
        >
          {track.is_muted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleTrackVisibility(track.id); }}
          className={`p-0.5 rounded transition-colors ${!track.is_visible ? 'text-cinema-textDim' : 'text-cinema-text hover:text-white'}`}
          title={track.is_visible ? 'Hide' : 'Show'}
        >
          {track.is_visible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleTrackLock(track.id); }}
          className={`p-0.5 rounded transition-colors ${track.is_locked ? 'text-amber-400' : 'text-cinema-textDim hover:text-cinema-text'}`}
          title={track.is_locked ? 'Unlock' : 'Lock'}
        >
          {track.is_locked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
        </button>
      </div>
    </div>
  );
});
TrackHeader.displayName = 'TrackHeader';

// ───────────────────────────── ClipBlock ─────────────────────────────
interface ClipBlockProps {
  clip: Clip;
  zoomLevel: number;
  trackColor: string;
  trackHeight: number;
  isAudioTrack: boolean;
  waveformData?: number[];
  onOpenTransition?: (clipId: string, edge: 'out', e: React.MouseEvent) => void;
}

const ClipBlock = memo<ClipBlockProps>(({
  clip, zoomLevel, trackColor, trackHeight, isAudioTrack, waveformData, onOpenTransition,
}) => {
  const { selectClip, trimClip, moveClipToTrack, scheduleAutoSave, pushHistory } = useTimelineStore();
  const { isSelected: isClipSelected, selectClip: selectInStore, toggleClipSelected } = useSelectionStore();
  const isSelected = isClipSelected(clip.id);
  const left = (clip.start_time_ms / 1000) * zoomLevel;
  const width = Math.max(4, (clip.duration_ms / 1000) * zoomLevel);

  // ─── Drag to move clip ───
  const dragStartX = useRef<number | null>(null);
  const dragStartMs = useRef<number>(0);
  const isDragging = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Check if clicking trim handles — handled by trim handle elements
    const target = e.target as HTMLElement;
    if (target.dataset.trim) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    dragStartMs.current = clip.start_time_ms;
    isDragging.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    const deltaX = e.clientX - dragStartX.current;
    if (Math.abs(deltaX) > 3) isDragging.current = true;
    if (!isDragging.current) return;

    const deltaMs = (deltaX / zoomLevel) * 1000;
    const newStart = Math.max(0, Math.round(dragStartMs.current + deltaMs));

    useTimelineStore.getState().updateClip(clip.id, (c) => {
      c.start_time_ms = newStart;
    }, true); // skipHistory during drag for performance
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (isDragging.current) {
      pushHistory();
      scheduleAutoSave();
    } else {
      // It's a click — select clip
      if (e.shiftKey) {
        toggleClipSelected(clip.id);
      } else {
        selectInStore(clip.id);
        selectClip(clip.id);
      }
    }
    dragStartX.current = null;
    isDragging.current = false;
  };

  // ─── Trim handles ───
  const trimStartX = useRef<number | null>(null);
  const trimStartMs = useRef<number>(0);

  const handleTrimPointerDown = (e: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    trimStartX.current = e.clientX;
    trimStartMs.current = 0;
  };

  const handleTrimPointerMove = (e: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
    if (trimStartX.current === null) return;
    const deltaX = e.clientX - trimStartX.current;
    const deltaMs = (deltaX / zoomLevel) * 1000;
    const totalDelta = deltaMs - trimStartMs.current;
    if (Math.abs(totalDelta) > (1000 / zoomLevel)) {
      trimClip(clip.id, edge, totalDelta);
      trimStartMs.current = deltaMs;
    }
  };

  const handleTrimPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    trimStartX.current = null;
    pushHistory();
    scheduleAutoSave();
  };

  const hasTransitionOut = !!clip.transition_out;

  return (
    <div
      className={`absolute top-0.5 bottom-0.5 rounded cursor-grab active:cursor-grabbing flex items-center overflow-hidden select-none border border-cinema-border/70 ${
        isSelected
          ? 'ring-1.5 ring-cinema-ai ring-offset-1 ring-offset-cinema-void bg-cinema-750'
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
      title={`${clip.name} (${formatTimecode(clip.start_time_ms)} → ${formatTimecode(clip.start_time_ms + clip.duration_ms)})`}
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

      {/* Clip name label */}
      {width > 24 && (
        <span className="text-[9px] text-cinema-text font-medium truncate pl-2 pr-1.5 relative z-10 flex-shrink-0 drop-shadow">
          {clip.name}
        </span>
      )}

      {/* Keyframe indicator */}
      {clip.keyframes.length > 0 && (
        <div className="absolute bottom-0.5 right-1 flex gap-0.5 z-10">
          {clip.keyframes.slice(0, 3).map((kf) => (
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

      {/* Left trim handle */}
      <div
        data-trim="left"
        className="absolute left-0 top-0 bottom-0 cursor-col-resize z-20 hover:bg-white/30 transition-colors"
        style={{ width: TRIM_HANDLE_WIDTH }}
        onPointerDown={(e) => handleTrimPointerDown(e, 'left')}
        onPointerMove={(e) => handleTrimPointerMove(e, 'left')}
        onPointerUp={handleTrimPointerUp}
      />
      {/* Right trim handle */}
      <div
        data-trim="right"
        className="absolute right-0 top-0 bottom-0 cursor-col-resize z-20 hover:bg-white/30 transition-colors"
        style={{ width: TRIM_HANDLE_WIDTH }}
        onPointerDown={(e) => handleTrimPointerDown(e, 'right')}
        onPointerMove={(e) => handleTrimPointerMove(e, 'right')}
        onPointerUp={handleTrimPointerUp}
      />
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
    timeline, playheadMs, zoomLevel, snapEnabled,
    setPlayhead, setZoomLevel, toggleSnap, selectClip, isSaving, saveStatus,
    selectedClipId, selectedTrackId, deleteClip, duplicateClip, splitClipAtPlayhead,
    rippleDelete, addClipToTrack,
  } = useTimelineStore();
  const { clearSelection } = useSelectionStore();
  const isMobile = useIsMobile();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [transitionPicker, setTransitionPicker] = useState<{
    clipAId: string;
    clipBId: string | null;
    position: { x: number; y: number };
  } | null>(null);

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
  const canActOnClip = !!selectedClipId;

  return (
    <div
      className="flex flex-col h-full bg-cinema-950 select-none"
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 md:gap-3 px-2 md:px-3 py-1.5 border-b border-cinema-border bg-cinema-900 flex-shrink-0 overflow-x-auto scrollbar-none">
        {/* Zoom */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => setZoomLevel(zoomLevel / 1.4)} className="p-1 hover:bg-cinema-750 rounded text-cinema-textDim hover:text-white" title="Zoom Out">
            <ZoomOut className="w-3 h-3 md:w-3.5 md:h-3.5" />
          </button>
          <span className="text-[9px] md:text-[10px] text-cinema-textDim font-mono w-10 text-center">{Math.round(zoomLevel)}px/s</span>
          <button onClick={() => setZoomLevel(zoomLevel * 1.4)} className="p-1 hover:bg-cinema-750 rounded text-cinema-textDim hover:text-white" title="Zoom In">
            <ZoomIn className="w-3 h-3 md:w-3.5 md:h-3.5" />
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

        {/* History / Revisions */}
        <button
          onClick={() => setShowRevisions(true)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors flex-shrink-0"
          title="Timeline Revision History"
        >
          <History className="w-2.5 h-2.5 md:w-3 md:h-3" /> History
        </button>

        {/* Clip actions — only show when clip is selected */}
        {canActOnClip && (
          <>
            <div className="w-px h-4 bg-cinema-border flex-shrink-0" />
            <button
              onClick={() => selectedClipId && splitClipAtPlayhead(selectedClipId)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors flex-shrink-0"
              title="Split at Playhead (S)"
            >
              <Scissors className="w-2.5 h-2.5" /> Split
            </button>
            <button
              onClick={() => selectedClipId && duplicateClip(selectedClipId)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors flex-shrink-0"
              title="Duplicate Clip"
            >
              <Copy className="w-2.5 h-2.5" /> Dupe
            </button>
            <button
              onClick={() => selectedClipId && rippleDelete(selectedClipId)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-red-900/60 text-red-400 hover:text-red-300 hover:border-red-700 transition-colors flex-shrink-0"
              title="Ripple Delete (shift+gap close)"
            >
              <CornerDownLeft className="w-2.5 h-2.5" /> Ripple Del
            </button>
            <button
              onClick={() => selectedClipId && deleteClip(selectedClipId)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-red-900/60 text-red-400 hover:text-red-300 hover:border-red-700 transition-colors flex-shrink-0"
              title="Delete Clip (Del)"
            >
              <Trash2 className="w-2.5 h-2.5" /> Delete
            </button>
          </>
        )}

        {/* Timecode */}
        <span className="text-[9px] md:text-[10px] text-cinema-textDim font-mono ml-auto flex-shrink-0">
          {formatTimecode(playheadMs)} / {formatTimecode(timeline.duration_ms)}
        </span>

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

      {/* Main body: headers + track area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Track headers — hidden on very small mobile to maximize timeline */}
        <div
          className={`flex-shrink-0 border-r border-cinema-border bg-cinema-900 ${isMobile ? 'w-20' : ''}`}
          style={{ width: isMobile ? 80 : HEADER_WIDTH }}
        >
          {/* Corner */}
          <div
            className="border-b border-cinema-border bg-cinema-900 flex items-end px-1 md:px-2"
            style={{ height: RULER_HEIGHT }}
          >
            <span className="text-[8px] md:text-[9px] text-cinema-textDim">TRACKS</span>
          </div>
          {/* Track headers */}
          <div className="overflow-hidden" style={{ height: `calc(100% - ${RULER_HEIGHT}px)` }}>
            {timeline.tracks.map((track) => (
              <TrackHeader key={track.id} track={track} />
            ))}
          </div>
        </div>

        {/* Right: Scrollable timeline area */}
        <div
          ref={scrollRef}
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
            >
              <Ruler duration_ms={timeline.duration_ms} zoomLevel={zoomLevel} />
            </div>
          </div>

          {/* Track lanes + clips */}
          <div
            className="relative"
            style={{ width: totalWidth }}
            onClick={() => { selectClip(null); clearSelection(); }}
          >
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
                  {/* Clips — virtualized: only render visible clips */}
                  {track.clips
                    .filter((clip) => {
                      const clipLeft = (clip.start_time_ms / 1000) * zoomLevel;
                      const clipRight = clipLeft + (clip.duration_ms / 1000) * zoomLevel;
                      return clipRight > scrollLeft - 200 && clipLeft < scrollLeft + 2000;
                    })
                    .map((clip) => (
                      <ClipBlock
                        key={clip.id}
                        clip={clip}
                        zoomLevel={zoomLevel}
                        trackColor={color}
                        trackHeight={trackHeight}
                        isAudioTrack={isAudio}
                        waveformData={(clip as any)._waveformData}
                        onOpenTransition={handleOpenTransition}
                      />
                    ))}

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

    </div>
  );
};
