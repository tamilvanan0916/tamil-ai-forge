import React, { memo, useMemo } from 'react';

interface WaveformBarProps {
  peakData?: number[]; // normalized 0.0–1.0 values
  color?: string;
  width: number;
  height: number;
  isStereo?: boolean;
}

/**
 * Professional cinema waveform renderer for audio clips.
 * Renders anti-aliased mirrored peak bars with zoom-aware density.
 */
export const WaveformBar: React.FC<WaveformBarProps> = memo(({
  peakData,
  color = 'rgba(0, 229, 255, 0.45)', // subtle cinema-ai cyan tint
  width,
  height,
  isStereo = false,
}) => {
  // If no peak data provided, generate subtle harmonic procedural peaks based on width
  const peaks = useMemo(() => {
    if (peakData && peakData.length > 0) return peakData;
    // Procedural fallback pattern
    const count = 60;
    const generated: number[] = [];
    for (let i = 0; i < count; i++) {
      const v = Math.abs(Math.sin(i * 0.28) * 0.6 + Math.cos(i * 0.12) * 0.3);
      generated.push(Math.max(0.15, Math.min(0.95, v)));
    }
    return generated;
  }, [peakData]);

  if (width <= 2 || height <= 2) return null;

  const barCount = Math.max(4, Math.min(peaks.length, Math.floor(width / 3)));
  const step = peaks.length / barCount;
  const barWidth = Math.max(1.2, (width / barCount) - 0.8);
  const midY = height / 2;

  const rects = [];
  for (let i = 0; i < barCount; i++) {
    const dataIdx = Math.min(peaks.length - 1, Math.floor(i * step));
    const peak = Math.max(0.08, Math.min(1.0, peaks[dataIdx] ?? 0.2));
    const barHeight = Math.max(2, peak * (height - 4) * 0.88);
    const x = i * (width / barCount);
    const y = midY - (barHeight / 2);

    rects.push(
      <rect
        key={i}
        x={x}
        y={y}
        width={barWidth}
        height={barHeight}
        fill={color}
        rx={0.6}
      />
    );
  }

  return (
    <svg
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none select-none z-0"
      style={{ overflow: 'hidden' }}
    >
      <line
        x1={0}
        y1={midY}
        x2={width}
        y2={midY}
        stroke="rgba(255, 255, 255, 0.08)"
        strokeWidth={1}
      />
      {rects}
    </svg>
  );
});

WaveformBar.displayName = 'WaveformBar';
