import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, ArrowRight, X, AlertCircle } from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';

function formatTimecode(ms: number, fps: number = 30): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = safeMs / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export const TimecodeJumpModal: React.FC = () => {
  const {
    isTimecodeModalOpen,
    setTimecodeModalOpen,
    jumpToTimecode,
    playheadMs,
    timeline,
  } = useTimelineStore();

  const [inputVal, setInputVal] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fps = (timeline as any)?.fps || 30;

  useEffect(() => {
    if (isTimecodeModalOpen) {
      setInputVal('');
      setErrorMessage(null);
      // Focus input on open
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isTimecodeModalOpen]);

  const handleApply = useCallback(() => {
    if (!inputVal.trim()) {
      setErrorMessage('Please enter a timecode or frame offset');
      return;
    }
    const res = jumpToTimecode(inputVal, fps);
    if (res.success) {
      setTimecodeModalOpen(false);
    } else {
      setErrorMessage(res.error || 'Invalid timecode format');
    }
  }, [inputVal, jumpToTimecode, fps, setTimecodeModalOpen]);

  const handleCancel = useCallback(() => {
    setTimecodeModalOpen(false);
  }, [setTimecodeModalOpen]);

  useEffect(() => {
    if (!isTimecodeModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleApply();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isTimecodeModalOpen, handleCancel, handleApply]);

  if (!isTimecodeModalOpen) return null;

  return (
    <div
      id="timecode-jump-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className="w-full max-w-md bg-cinema-950 border border-cinema-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cinema-border bg-cinema-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cinema-ai/10 border border-cinema-ai/30 flex items-center justify-center text-cinema-ai">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Go to Timecode</h3>
              <p className="text-[11px] text-cinema-textDim">Jump directly to sequence frame or offset</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded-lg text-cinema-textDim hover:text-white hover:bg-cinema-800 transition-colors"
            title="Close (Escape)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Current Position */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-cinema-900 border border-cinema-border rounded-lg text-xs">
            <span className="text-cinema-textDim">Current Playhead:</span>
            <span id="timecode-current-display" className="font-mono text-cinema-ai font-semibold text-sm">
              {formatTimecode(playheadMs, fps)}
            </span>
          </div>

          {/* Timecode Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-cinema-textDim flex items-center justify-between">
              <span>Target Timecode / Frame Delta:</span>
              <span className="text-[10px] text-cinema-textDim/70">FPS: {fps}</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="timecode-input"
                type="text"
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="00:01:23:15, +30, -60, or 45s"
                className="w-full px-3.5 py-2.5 bg-cinema-900 border border-cinema-border focus:border-cinema-ai focus:ring-1 focus:ring-cinema-ai rounded-lg text-white font-mono text-sm placeholder:text-cinema-textDim/50 focus:outline-none transition-all"
              />
            </div>
            {errorMessage && (
              <div id="timecode-error-msg" className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Supported Format Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-cinema-textDim uppercase tracking-wider font-semibold">
              Supported Formats
            </span>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-mono text-cinema-textDim">
              <button
                type="button"
                onClick={() => setInputVal('00:00:10:00')}
                className="px-2 py-0.5 bg-cinema-900/80 hover:bg-cinema-800 border border-cinema-border rounded text-cinema-textDim hover:text-white transition-colors"
              >
                00:00:10:00
              </button>
              <button
                type="button"
                onClick={() => setInputVal('+30')}
                className="px-2 py-0.5 bg-cinema-900/80 hover:bg-cinema-800 border border-cinema-border rounded text-cinema-textDim hover:text-white transition-colors"
              >
                +30 (frames)
              </button>
              <button
                type="button"
                onClick={() => setInputVal('-60')}
                className="px-2 py-0.5 bg-cinema-900/80 hover:bg-cinema-800 border border-cinema-border rounded text-cinema-textDim hover:text-white transition-colors"
              >
                -60 (frames)
              </button>
              <button
                type="button"
                onClick={() => setInputVal('+1.5s')}
                className="px-2 py-0.5 bg-cinema-900/80 hover:bg-cinema-800 border border-cinema-border rounded text-cinema-textDim hover:text-white transition-colors"
              >
                +1.5s
              </button>
              <button
                type="button"
                onClick={() => setInputVal('00:00:00:00')}
                className="px-2 py-0.5 bg-cinema-900/80 hover:bg-cinema-800 border border-cinema-border rounded text-cinema-textDim hover:text-white transition-colors"
              >
                Start
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-cinema-border bg-cinema-900/40">
          <button
            id="timecode-cancel-btn"
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg text-xs font-medium text-cinema-textDim hover:text-white hover:bg-cinema-800/80 transition-colors"
          >
            Cancel
          </button>
          <button
            id="timecode-apply-btn"
            type="button"
            onClick={handleApply}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-cinema-ai hover:bg-cinema-ai/90 text-white shadow-lg shadow-cinema-ai/20 transition-all"
          >
            <span>Jump</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
