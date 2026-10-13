import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Gauge, FastForward, Clock, X, Check,
  SlidersHorizontal, ArrowRight, CornerDownRight, Film
} from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { FourPointResolution } from '../../types';

function formatTimecode(ms: number, fps: number = 30): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = safeMs / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export const FourPointEditModal: React.FC = () => {
  const {
    fourPointConflict,
    closeFourPointModal,
    resolveFourPointEdit,
  } = useTimelineStore();

  const [selectedResolution, setSelectedResolution] = useState<FourPointResolution>('fit_to_fill');

  // Reset default to fit_to_fill whenever conflict opens
  useEffect(() => {
    if (fourPointConflict) {
      setSelectedResolution('fit_to_fill');
    }
  }, [fourPointConflict]);

  const handleApply = useCallback(() => {
    if (!fourPointConflict) return;
    resolveFourPointEdit(selectedResolution);
  }, [fourPointConflict, resolveFourPointEdit, selectedResolution]);

  const handleCancel = useCallback(() => {
    closeFourPointModal();
  }, [closeFourPointModal]);

  // Keyboard shortcut listener for Enter and Escape
  useEffect(() => {
    if (!fourPointConflict) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleApply();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedResolution((prev) => {
          if (prev === 'fit_to_fill') return 'ignore_source_out';
          if (prev === 'ignore_source_out') return 'ignore_sequence_out';
          if (prev === 'ignore_sequence_out') return 'ignore_sequence_in';
          return 'fit_to_fill';
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedResolution((prev) => {
          if (prev === 'ignore_sequence_in') return 'ignore_sequence_out';
          if (prev === 'ignore_sequence_out') return 'ignore_source_out';
          if (prev === 'ignore_source_out') return 'fit_to_fill';
          return 'ignore_sequence_in';
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [fourPointConflict, handleApply, handleCancel]);

  if (!fourPointConflict) return null;

  const {
    sourceInMs,
    sourceOutMs,
    sourceDurationMs,
    sequenceInMs,
    sequenceOutMs,
    sequenceDurationMs,
    speedFactor,
    asset,
  } = fourPointConflict;

  const diffMs = sourceDurationMs - sequenceDurationMs;
  const fps = 30;
  const diffFrames = Math.round((diffMs / 1000) * fps);
  const speedPercent = (speedFactor * 100).toFixed(2);
  const clampedSpeed = Math.min(10.0, Math.max(0.1, Math.round(speedFactor * 1000) / 1000));
  const isSpeedClamped = Math.abs(clampedSpeed - speedFactor) > 0.001;

  return (
    <div
      id="four-point-edit-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        id="four-point-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="four-point-modal-title"
        className="w-full max-w-2xl bg-cinema-900 border border-cinema-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-cinema-950 border-b border-cinema-border">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 id="four-point-modal-title" className="text-sm sm:text-base font-bold text-white tracking-wide">
                4-Point Edit Duration Mismatch
              </h2>
              <p className="text-[11px] text-cinema-textDim">
                Source range does not match destination Sequence In/Out range
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 text-cinema-textDim hover:text-white hover:bg-cinema-800 rounded-md transition-colors"
            title="Cancel (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Duration Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Source Card */}
            <div className="bg-cinema-850/80 border border-amber-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  SOURCE RANGE
                </span>
                <span className="text-[11px] text-cinema-textDim truncate max-w-[140px]" title={asset.file_name}>
                  {asset.file_name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-cinema-textDim block">In Point:</span>
                  <span className="text-cinema-text font-semibold">{formatTimecode(sourceInMs, fps)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-cinema-textDim block">Out Point:</span>
                  <span className="text-cinema-text font-semibold">{formatTimecode(sourceOutMs, fps)}</span>
                </div>
              </div>
              <div className="pt-1.5 border-t border-cinema-border/50 flex items-center justify-between">
                <span className="text-[11px] text-cinema-textDim">Duration:</span>
                <span id="four-point-source-duration" className="text-xs font-mono font-bold text-amber-400">
                  {formatTimecode(sourceDurationMs, fps)} ({sourceDurationMs}ms)
                </span>
              </div>
            </div>

            {/* Sequence Card */}
            <div className="bg-cinema-850/80 border border-cyan-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                  SEQUENCE RANGE
                </span>
                <span className="text-[11px] text-cinema-textDim">Timeline In/Out</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-cinema-textDim block">In Point:</span>
                  <span className="text-cinema-text font-semibold">{formatTimecode(sequenceInMs, fps)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-cinema-textDim block">Out Point:</span>
                  <span className="text-cinema-text font-semibold">{formatTimecode(sequenceOutMs, fps)}</span>
                </div>
              </div>
              <div className="pt-1.5 border-t border-cinema-border/50 flex items-center justify-between">
                <span className="text-[11px] text-cinema-textDim">Duration:</span>
                <span id="four-point-sequence-duration" className="text-xs font-mono font-bold text-cyan-400">
                  {formatTimecode(sequenceDurationMs, fps)} ({sequenceDurationMs}ms)
                </span>
              </div>
            </div>
          </div>

          {/* Difference & Calculated Speed HUD */}
          <div className="bg-cinema-950/70 border border-cinema-border rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-cinema-textDim">Difference:</span>
              <span
                id="four-point-diff"
                className={`font-mono font-semibold px-2 py-0.5 rounded text-[11px] ${
                  diffMs > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
                }`}
              >
                {diffMs > 0 ? `+${diffFrames} frames (+${diffMs}ms)` : `${diffFrames} frames (${diffMs}ms)`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Gauge className="w-3.5 h-3.5 text-cinema-accent" />
              <span className="text-cinema-textDim">Fit-to-Fill Speed:</span>
              <span id="four-point-fit-speed" className="font-mono font-bold text-cinema-accent">
                {speedPercent}% {isSpeedClamped && `(clamped to ${(clampedSpeed * 100).toFixed(0)}%)`}
              </span>
            </div>
          </div>

          {/* Editorial Resolution Options */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-cinema-text tracking-wider uppercase block">
              Editorial Resolution Strategy:
            </label>

            <div className="space-y-2" role="radiogroup" aria-label="4-Point Conflict Options">
              {/* Option 1: Fit to Fill */}
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  selectedResolution === 'fit_to_fill'
                    ? 'bg-amber-500/10 border-amber-500/60 shadow-sm'
                    : 'bg-cinema-850/50 border-cinema-border/70 hover:bg-cinema-800/50'
                }`}
              >
                <input
                  type="radio"
                  name="four-point-resolution"
                  id="opt-fit-to-fill"
                  value="fit_to_fill"
                  checked={selectedResolution === 'fit_to_fill'}
                  onChange={() => setSelectedResolution('fit_to_fill')}
                  className="mt-0.5 text-amber-500 focus:ring-amber-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Change Clip Speed (Fit to Fill)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-cinema-textDim mt-0.5 leading-relaxed">
                    Retimes playback speed to <strong className="text-white font-mono">{speedPercent}%</strong> so the
                    source range precisely fills the <strong className="text-white font-mono">{formatTimecode(sequenceDurationMs, fps)}</strong> sequence duration without gaps.
                  </p>
                </div>
              </label>

              {/* Option 2: Ignore Source Out */}
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  selectedResolution === 'ignore_source_out'
                    ? 'bg-cyan-500/10 border-cyan-500/60 shadow-sm'
                    : 'bg-cinema-850/50 border-cinema-border/70 hover:bg-cinema-800/50'
                }`}
              >
                <input
                  type="radio"
                  name="four-point-resolution"
                  id="opt-ignore-source-out"
                  value="ignore_source_out"
                  checked={selectedResolution === 'ignore_source_out'}
                  onChange={() => setSelectedResolution('ignore_source_out')}
                  className="mt-0.5 text-cyan-500 focus:ring-cyan-500"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white">Ignore Source Out Point</span>
                  <p className="text-[11px] text-cinema-textDim mt-0.5 leading-relaxed">
                    Keeps Source In point and fills the sequence duration ({formatTimecode(sequenceDurationMs, fps)}) at normal 100% speed.
                  </p>
                </div>
              </label>

              {/* Option 3: Ignore Sequence Out */}
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  selectedResolution === 'ignore_sequence_out'
                    ? 'bg-cyan-500/10 border-cyan-500/60 shadow-sm'
                    : 'bg-cinema-850/50 border-cinema-border/70 hover:bg-cinema-800/50'
                }`}
              >
                <input
                  type="radio"
                  name="four-point-resolution"
                  id="opt-ignore-sequence-out"
                  value="ignore_sequence_out"
                  checked={selectedResolution === 'ignore_sequence_out'}
                  onChange={() => setSelectedResolution('ignore_sequence_out')}
                  className="mt-0.5 text-cyan-500 focus:ring-cyan-500"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white">Ignore Sequence Out Point</span>
                  <p className="text-[11px] text-cinema-textDim mt-0.5 leading-relaxed">
                    Overwrites starting at Sequence In for the full source duration ({formatTimecode(sourceDurationMs, fps)}), ignoring the sequence Out boundary.
                  </p>
                </div>
              </label>

              {/* Option 4: Ignore Sequence In */}
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  selectedResolution === 'ignore_sequence_in'
                    ? 'bg-cyan-500/10 border-cyan-500/60 shadow-sm'
                    : 'bg-cinema-850/50 border-cinema-border/70 hover:bg-cinema-800/50'
                }`}
              >
                <input
                  type="radio"
                  name="four-point-resolution"
                  id="opt-ignore-sequence-in"
                  value="ignore_sequence_in"
                  checked={selectedResolution === 'ignore_sequence_in'}
                  onChange={() => setSelectedResolution('ignore_sequence_in')}
                  className="mt-0.5 text-cyan-500 focus:ring-cyan-500"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white">Ignore Sequence In Point</span>
                  <p className="text-[11px] text-cinema-textDim mt-0.5 leading-relaxed">
                    Aligns Source Out with Sequence Out. The start position is calculated backward to prevent clip overflow.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-cinema-950 border-t border-cinema-border">
          <div className="text-[11px] text-cinema-textDim hidden sm:flex items-center gap-2">
            <span><kbd className="px-1.5 py-0.5 rounded bg-cinema-800 border border-cinema-border font-mono text-[10px]">Esc</kbd> Cancel</span>
            <span>•</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-cinema-800 border border-cinema-border font-mono text-[10px]">Enter</kbd> Apply</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="four-point-cancel-btn"
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg border border-cinema-border hover:bg-cinema-800 text-cinema-textDim hover:text-white text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              id="four-point-apply-btn"
              onClick={handleApply}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Resolution</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
