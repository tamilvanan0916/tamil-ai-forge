import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';

const TRANSITIONS = [
  { type: 'cut', label: 'Cut', description: 'Instant, no transition' },
  { type: 'cross_dissolve', label: 'Cross Dissolve', description: 'Blend between clips' },
  { type: 'fade_from_black', label: 'Fade from Black', description: 'Fades in from black' },
  { type: 'fade_to_black', label: 'Fade to Black', description: 'Fades out to black' },
  { type: 'dip_to_black', label: 'Dip to Black', description: 'Dips through black' },
  { type: 'dip_to_white', label: 'Dip to White', description: 'Dips through white' },
];

interface TransitionPickerProps {
  clipAId: string; // clip whose out-transition we're setting
  clipBId: string; // clip whose in-transition we're setting
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
  currentDurationMs = 500,
  onClose,
}) => {
  const { setClipTransition } = useTimelineStore();
  const [selectedType, setSelectedType] = useState(currentType || 'cross_dissolve');
  const [durationMs, setDurationMs] = useState(currentDurationMs);
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
      setClipTransition(clipAId, 'out', null);
      setClipTransition(clipBId, 'in', null);
    } else {
      const config = { type: selectedType, duration_ms: durationMs };
      setClipTransition(clipAId, 'out', config);
      setClipTransition(clipBId, 'in', config);
    }
    onClose();
  };

  const handleRemove = () => {
    setClipTransition(clipAId, 'out', null);
    setClipTransition(clipBId, 'in', null);
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
