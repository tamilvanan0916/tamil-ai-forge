import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';

import { VideoTransitionType } from '../../types';

const TRANSITIONS: Array<{ type: VideoTransitionType | 'cut'; label: string; description: string }> = [
  { type: 'crossfade', label: 'Crossfade', description: 'Smooth blend between clips' },
  { type: 'fade_black', label: 'Fade Through Black', description: 'Dips through black between clips' },
  { type: 'fade_white', label: 'Fade Through White', description: 'Dips through white between clips' },
  { type: 'cut', label: 'Cut (None)', description: 'Instant cut, remove transition' },
];

interface TransitionPickerProps {
  clipAId: string; // outgoing clip
  clipBId: string; // incoming clip
  position: { x: number; y: number };
  currentType?: string;
  currentDurationMs?: number;
  onClose: () => void;
}

export const TransitionPicker: React.FC<TransitionPickerProps> = ({
  clipAId,
  clipBId,
  position,
  currentType,
  currentDurationMs = 1000,
  onClose,
}) => {
  const { applyVideoTransition, removeVideoTransition, setClipTransition, timeline } = useTimelineStore();

  // Calculate max allowed duration from clip durations
  let maxDuration = 2000;
  if (timeline) {
    let clipA, clipB;
    for (const track of timeline.tracks) {
      if (!clipA) clipA = track.clips.find((c) => c.id === clipAId);
      if (!clipB) clipB = track.clips.find((c) => c.id === clipBId);
    }
    if (clipA && clipB) {
      maxDuration = Math.min(clipA.duration_ms, clipB.duration_ms);
    } else if (clipA) {
      maxDuration = clipA.duration_ms;
    }
  }

  const initialType = (currentType === 'cross_dissolve' || currentType === 'crossfade')
    ? 'crossfade'
    : (currentType === 'fade_black' || currentType === 'dip_to_black' || currentType === 'fade_to_black')
    ? 'fade_black'
    : (currentType === 'fade_white' || currentType === 'dip_to_white')
    ? 'fade_white'
    : 'crossfade';

  const [selectedType, setSelectedType] = useState<VideoTransitionType | 'cut'>(initialType);
  const [durationMs, setDurationMs] = useState(Math.min(currentDurationMs, maxDuration));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleApply = () => {
    if (selectedType === 'cut') {
      if (clipAId && clipBId && clipAId !== clipBId) {
        removeVideoTransition(clipAId, clipBId);
      } else {
        setClipTransition(clipAId, 'out', null);
      }
    } else {
      const clampedDuration = Math.max(100, Math.min(durationMs, maxDuration));
      if (clipAId && clipBId && clipAId !== clipBId) {
        applyVideoTransition(clipAId, clipBId, selectedType, clampedDuration);
      } else {
        const config = { type: selectedType, duration_ms: clampedDuration };
        setClipTransition(clipAId, 'out', config);
      }
    }
    onClose();
  };

  const handleRemove = () => {
    if (clipAId && clipBId && clipAId !== clipBId) {
      removeVideoTransition(clipAId, clipBId);
    } else {
      setClipTransition(clipAId, 'out', null);
    }
    onClose();
  };

  // Keep picker within viewport
  const left = Math.min(position.x, window.innerWidth - 240);
  const top = Math.min(position.y, window.innerHeight - 360);

  return (
    <div
      ref={ref}
      className="fixed z-[200] w-56 bg-cinema-850 border border-cinema-borderLight rounded-lg shadow-2xl text-xs"
      style={{ left, top }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-cinema-border">
        <span className="font-semibold text-white">Transition</span>
        <button onClick={onClose} className="p-0.5 text-cinema-textDim hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-2 space-y-1">
        {TRANSITIONS.map((t) => (
          <button
            key={t.type}
            onClick={() => setSelectedType(t.type)}
            className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
              selectedType === t.type
                ? 'bg-cinema-ai/20 border border-cinema-ai/40 text-cinema-ai'
                : 'hover:bg-cinema-800 text-cinema-textMuted hover:text-white border border-transparent'
            }`}
          >
            <div className="font-medium">{t.label}</div>
            <div className="text-[10px] text-cinema-textDim">{t.description}</div>
          </button>
        ))}
      </div>

      {selectedType !== 'cut' && (
        <div className="px-3 pb-2 border-t border-cinema-border pt-2">
          <label className="text-cinema-textDim block mb-1">Duration (ms)</label>
          <input
            type="number"
            min={100}
            max={2000}
            step={50}
            value={durationMs}
            onChange={(e) => setDurationMs(parseInt(e.target.value) || 500)}
            className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text outline-none focus:border-cinema-ai"
          />
        </div>
      )}

      <div className="flex gap-2 p-2 border-t border-cinema-border">
        <button
          onClick={handleRemove}
          className="flex-1 py-1.5 border border-cinema-border rounded text-cinema-textDim hover:text-white hover:border-cinema-borderLight transition-colors"
        >
          Remove
        </button>
        <button
          onClick={handleApply}
          className="flex-1 py-1.5 bg-cinema-red hover:bg-cinema-redHover text-white rounded transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
};
