import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Maximize2, Volume2, VolumeX, Film, X, CornerDownRight, ArrowDownToLine,
  SlidersHorizontal, Sparkles, FolderOpen, LocateFixed, RefreshCw, Gauge
} from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { mediaUrl } from '../../services/api';

function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * 30);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export const SourceMonitor: React.FC<{ isDualView?: boolean }> = ({ isDualView = false }) => {
  const {
    sourceAsset,
    sourcePlayheadMs,
    sourceInPointMs,
    sourceOutPointMs,
    sourceIsPlaying,
    activeMonitorFocus,
    setSourcePlayhead,
    setSourceInPoint,
    setSourceOutPoint,
    clearSourceInOut,
    toggleSourcePlay,
    setSourceIsPlaying,
    stepSourceFrame,
    setActiveMonitorFocus,
    closeSourceAsset,
    insertFromSource,
    overwriteFromSource,
    reverseMatchFrame,
    setHighlightedAssetId,
    replaceEdit,
    fitToFillEdit,
    timeline,
  } = useTimelineStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingInHandle, setIsDraggingInHandle] = useState(false);
  const [isDraggingOutHandle, setIsDraggingOutHandle] = useState(false);

  const durationMs = Math.max(100, sourceAsset?.duration_ms ?? 4000);
  const inMs = sourceInPointMs ?? 0;
  const outMs = sourceOutPointMs !== null && sourceOutPointMs !== undefined && sourceOutPointMs > inMs
    ? sourceOutPointMs
    : durationMs;
  const rangeDurationMs = Math.max(33, outMs - inMs);

  const hasSourceRange = sourceInPointMs !== null && sourceOutPointMs !== null && sourceOutPointMs > sourceInPointMs;
  const hasSeqRange = timeline?.in_point_ms !== null && timeline?.in_point_ms !== undefined &&
                      timeline?.out_point_ms !== null && timeline?.out_point_ms !== undefined &&
                      timeline.out_point_ms > timeline.in_point_ms;
  const isFourPointActive = Boolean(hasSourceRange && hasSeqRange);

  // Playback sync with HTML5 video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sourceAsset) return;

    if (sourceIsPlaying) {
      video.play().catch(() => setSourceIsPlaying(false));
    } else {
      video.pause();
    }
  }, [sourceIsPlaying, sourceAsset, setSourceIsPlaying]);

  // Sync video time when playhead is set externally
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sourceAsset || isDraggingPlayhead) return;

    const targetSec = sourcePlayheadMs / 1000;
    if (Math.abs(video.currentTime - targetSec) > 0.05) {
      video.currentTime = targetSec;
    }
  }, [sourcePlayheadMs, sourceAsset, isDraggingPlayhead]);

  // Video timeupdate handler
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isDraggingPlayhead) return;
    const currentMs = Math.round(video.currentTime * 1000);
    setSourcePlayhead(currentMs);

    // Auto-loop or stop at sourceOutPointMs
    if (sourceIsPlaying && sourceOutPointMs !== null && currentMs >= sourceOutPointMs) {
      video.currentTime = (sourceInPointMs ?? 0) / 1000;
      setSourcePlayhead(sourceInPointMs ?? 0);
    }
  }, [isDraggingPlayhead, setSourcePlayhead, sourceIsPlaying, sourceInPointMs, sourceOutPointMs]);

  const handleVideoEnded = useCallback(() => {
    setSourceIsPlaying(false);
  }, [setSourceIsPlaying]);

  // Scrubber drag handlers
  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !sourceAsset) return;
    setActiveMonitorFocus('source');
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingPlayhead(true);

    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = Math.round(ratio * durationMs);
    setSourcePlayhead(targetMs);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !sourceAsset) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = Math.round(ratio * durationMs);

    if (isDraggingPlayhead) {
      setSourcePlayhead(targetMs);
    } else if (isDraggingInHandle) {
      setSourceInPoint(targetMs);
    } else if (isDraggingOutHandle) {
      setSourceOutPoint(targetMs);
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDraggingPlayhead(false);
    setIsDraggingInHandle(false);
    setIsDraggingOutHandle(false);
  };

  const isFocused = activeMonitorFocus === 'source';

  const inPercent = (inMs / durationMs) * 100;
  const outPercent = (outMs / durationMs) * 100;
  const playheadPercent = (sourcePlayheadMs / durationMs) * 100;

  return (
    <div
      id="source-monitor"
      tabIndex={0}
      onClick={() => setActiveMonitorFocus('source')}
      className={`flex flex-col h-full w-full bg-cinema-950 select-none overflow-hidden border-2 transition-all duration-150 ${
        isFocused ? 'border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.15)]' : 'border-cinema-border/50'
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-cinema-900 border-b border-cinema-border text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40">
            SOURCE
          </span>
          {isFourPointActive && (
            <span
              id="source-four-point-badge"
              className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse"
              title="4-Point In/Out ranges defined on Source and Sequence"
            >
              4-POINT
            </span>
          )}
          <span
            id="source-asset-name"
            className="font-medium text-cinema-text truncate max-w-[160px] sm:max-w-[260px]"
            title={sourceAsset?.file_name || 'No Media Loaded'}
          >
            {sourceAsset?.file_name || 'No Media Loaded'}
          </span>
        </div>

        {/* Timecode Displays */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <div className="flex items-center gap-1 text-cinema-textDim">
            <span className="text-[9px] uppercase font-semibold text-cinema-textDim">Pos:</span>
            <span id="source-playhead-timecode" className="text-amber-400 font-bold">
              {formatTimecode(sourcePlayheadMs)}
            </span>
          </div>

          <div className="flex items-center gap-1 text-cinema-textDim hidden sm:flex">
            <span className="text-[9px] uppercase font-semibold text-cinema-textDim">Dur:</span>
            <span
              id="source-range-duration"
              data-testid="source-duration-timecode"
              className="text-cyan-400 font-medium"
            >
              {formatTimecode(rangeDurationMs)}
            </span>
          </div>

          <div className="flex items-center gap-1 text-cinema-textDim hidden md:flex">
            <span className="text-[9px] uppercase font-semibold text-cinema-textDim">Total:</span>
            <span
              id="source-duration"
              data-testid="source-total-timecode"
              className="text-cinema-text"
            >
              {formatTimecode(durationMs)}
            </span>
          </div>

          {sourceAsset && (
            <>
              <button
                id="source-reveal-browser-btn"
                data-testid="source-reveal-browser-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setHighlightedAssetId(sourceAsset.id);
                  setTimeout(() => setHighlightedAssetId(null), 3000);
                }}
                className="p-1 hover:bg-cinema-800 rounded text-cinema-textDim hover:text-amber-400 transition-colors ml-1"
                title="Reveal in Media Browser (Alt+Shift+F)"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
              <button
                id="close-source-asset-btn"
                onClick={(e) => { e.stopPropagation(); closeSourceAsset(); }}
                className="p-1 hover:bg-cinema-800 rounded text-cinema-textDim hover:text-white transition-colors"
                title="Close Source Asset"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Video / Media Canvas Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-0">
        {!sourceAsset ? (
          <div
            id="source-empty-state"
            className="flex flex-col items-center justify-center p-6 text-center space-y-3 text-cinema-textDim"
          >
            <div className="w-14 h-14 rounded-full bg-cinema-900/80 border border-cinema-border flex items-center justify-center text-amber-500/70 shadow-inner">
              <Film className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Source Monitor</p>
              <p className="text-xs text-cinema-textDim mt-1 max-w-xs">
                Double-click any clip in the Media Browser or Assets panel to preview, mark In/Out, and cut to timeline.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-amber-400/90 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
              <Sparkles className="w-3 h-3" />
              <span>Shortcut: Press <b>Q</b> to toggle Source / Program focus</span>
            </div>
          </div>
        ) : sourceAsset.asset_type === 'image' ? (
          <img
            src={mediaUrl(sourceAsset.storage_key || '')}
            alt={sourceAsset.file_name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <video
            id="source-video"
            data-testid="source-video-player"
            ref={videoRef}
            src={mediaUrl(sourceAsset.storage_key || '')}
            poster={sourceAsset.thumbnail_url ? mediaUrl(sourceAsset.thumbnail_url) : undefined}
            muted={isMuted}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
            className="max-h-full max-w-full object-contain"
            playsInline
          />
        )}
      </div>

      {/* Scrubber & In/Out Track */}
      <div className="px-3 pt-2 pb-1 bg-cinema-900 border-t border-cinema-border">
        <div
          id="source-scrubber-track"
          ref={scrubberRef}
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberPointerUp}
          className="relative h-5 w-full bg-cinema-950 rounded cursor-pointer select-none overflow-visible border border-cinema-border/70"
        >
          {/* Shaded In/Out Region */}
          <div
            id="source-inout-region"
            style={{ left: `${inPercent}%`, width: `${Math.max(0, outPercent - inPercent)}%` }}
            className="absolute top-0 bottom-0 bg-cyan-500/20 border-t-2 border-b-2 border-cyan-400 pointer-events-none"
          />

          {/* In Handle Bracket */}
          <div
            id="source-in-point"
            data-testid="source-in-handle"
            style={{ left: `${inPercent}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsDraggingInHandle(true);
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              setIsDraggingInHandle(false);
            }}
            className="absolute top-0 bottom-0 -ml-1.5 w-3 flex items-center justify-center cursor-ew-resize z-20 group"
            title={`Source In: ${formatTimecode(inMs)}`}
          >
            <div className="w-1.5 h-full bg-cyan-400 rounded-l shadow-sm group-hover:bg-cyan-300" />
          </div>

          {/* Out Handle Bracket */}
          <div
            id="source-out-point"
            data-testid="source-out-handle"
            style={{ left: `${outPercent}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsDraggingOutHandle(true);
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              setIsDraggingOutHandle(false);
            }}
            className="absolute top-0 bottom-0 -ml-1.5 w-3 flex items-center justify-center cursor-ew-resize z-20 group"
            title={`Source Out: ${formatTimecode(outMs)}`}
          >
            <div className="w-1.5 h-full bg-cyan-400 rounded-r shadow-sm group-hover:bg-cyan-300" />
          </div>

          {/* Playhead Scrub Line and Handle */}
          <div
            id="source-playhead"
            data-testid="source-playhead-handle"
            style={{ left: `${playheadPercent}%` }}
            className="absolute top-0 bottom-0 -ml-1 w-2 flex flex-col items-center pointer-events-none z-30"
          >
            <div className="w-2.5 h-2 bg-amber-400 rotate-45 -mt-1 shadow" />
            <div className="w-0.5 h-full bg-amber-400 shadow" />
          </div>
        </div>
      </div>

      {/* Transport Controls Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-cinema-900 border-t border-cinema-border/50 text-cinema-text">
        {/* Left: Mark Range Controls */}
        <div className="flex items-center gap-1">
          <button
            id="source-mark-in-btn"
            onClick={() => setSourceInPoint()}
            disabled={!sourceAsset}
            className="px-2 py-1 bg-cinema-800 hover:bg-cinema-750 disabled:opacity-40 text-cyan-400 hover:text-cyan-300 rounded text-xs font-bold font-mono transition-colors border border-cinema-border"
            title="Mark Source In (I)"
          >
            [ In
          </button>
          <button
            id="source-mark-out-btn"
            onClick={() => setSourceOutPoint()}
            disabled={!sourceAsset}
            className="px-2 py-1 bg-cinema-800 hover:bg-cinema-750 disabled:opacity-40 text-cyan-400 hover:text-cyan-300 rounded text-xs font-bold font-mono transition-colors border border-cinema-border"
            title="Mark Source Out (O)"
          >
            Out ]
          </button>
          <button
            id="source-clear-inout-btn"
            onClick={clearSourceInOut}
            disabled={!sourceAsset}
            className="px-1.5 py-1 bg-cinema-800 hover:bg-cinema-750 disabled:opacity-40 text-cinema-textDim hover:text-white rounded text-[10px] font-mono transition-colors border border-cinema-border"
            title="Clear In/Out (Alt+X)"
          >
            Clr
          </button>
        </div>

        {/* Center: Playback / Transport */}
        <div className="flex items-center gap-1.5">
          <button
            id="source-go-in-btn"
            data-testid="source-goto-in-btn"
            onClick={() => setSourcePlayhead(inMs)}
            disabled={!sourceAsset}
            className="p-1 hover:bg-cinema-800 disabled:opacity-40 rounded text-cinema-textDim hover:text-white transition-colors"
            title="Go to In Point (Shift+I)"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            id="source-frame-back-btn"
            data-testid="source-step-back-btn"
            onClick={() => stepSourceFrame(-1)}
            disabled={!sourceAsset}
            className="p-1 hover:bg-cinema-800 disabled:opacity-40 rounded text-cinema-textDim hover:text-white transition-colors"
            title="Step 1 Frame Back (←)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            id="source-play-btn"
            onClick={toggleSourcePlay}
            disabled={!sourceAsset}
            className="p-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black rounded-full transition-all shadow-md active:scale-95 mx-0.5"
            title="Play / Pause Source (Space)"
          >
            {sourceIsPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
          </button>

          <button
            id="source-frame-forward-btn"
            data-testid="source-step-forward-btn"
            onClick={() => stepSourceFrame(1)}
            disabled={!sourceAsset}
            className="p-1 hover:bg-cinema-800 disabled:opacity-40 rounded text-cinema-textDim hover:text-white transition-colors"
            title="Step 1 Frame Forward (→)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            id="source-go-out-btn"
            data-testid="source-goto-out-btn"
            onClick={() => setSourcePlayhead(outMs)}
            disabled={!sourceAsset}
            className="p-1 hover:bg-cinema-800 disabled:opacity-40 rounded text-cinema-textDim hover:text-white transition-colors"
            title="Go to Out Point (Shift+O)"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            id="source-reverse-match-btn"
            data-testid="source-reverse-match-btn"
            onClick={() => reverseMatchFrame()}
            disabled={!sourceAsset}
            className="p-1 hover:bg-cinema-800 disabled:opacity-40 rounded text-amber-400 hover:text-amber-300 transition-colors ml-0.5"
            title="Reverse Match Frame on Timeline (Shift+F)"
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Edit Actions */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <button
            id="source-replace-btn"
            data-testid="source-replace-btn"
            onClick={() => replaceEdit()}
            disabled={!sourceAsset}
            className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/50 hover:border-purple-400 rounded text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm"
            title="Replace Target Timeline Clip from Source (Shift+R / F11)"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Replace</span>
          </button>

          <button
            id="source-fit-to-fill-btn"
            data-testid="source-fit-to-fill-btn"
            onClick={() => fitToFillEdit()}
            disabled={!sourceAsset}
            className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 hover:border-emerald-400 rounded text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm"
            title="Fit to Fill Target Timeline Clip from Source (Shift+F11)"
          >
            <Gauge className="w-3 h-3" />
            <span>Fit-to-Fill</span>
          </button>

          <button
            id="source-insert-btn"
            onClick={insertFromSource}
            disabled={!sourceAsset}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/50 hover:border-amber-400 rounded text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm"
            title="Insert into Patched Timeline Tracks (,)"
          >
            <CornerDownRight className="w-3.5 h-3.5" />
            <span>Insert</span>
          </button>

          <button
            id="source-overwrite-btn"
            onClick={overwriteFromSource}
            disabled={!sourceAsset}
            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 hover:border-cyan-400 rounded text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm"
            title="Overwrite into Patched Timeline Tracks (.)"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Overwrite</span>
          </button>
        </div>
      </div>
    </div>
  );
};
