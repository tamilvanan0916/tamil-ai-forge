import React, { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { audioPreviewEngine } from '../../services/audioPreviewEngine';

interface AudioMeterProps {
  compact?: boolean;
  className?: string;
}

export const AudioMeter: React.FC<AudioMeterProps> = ({ compact = false, className = '' }) => {
  const { isPlaying, playheadMs, timeline } = useTimelineStore();
  const [leftDb, setLeftDb] = useState(-60);
  const [rightDb, setRightDb] = useState(-60);
  const [leftPeakHold, setLeftPeakHold] = useState(-60);
  const [rightPeakHold, setRightPeakHold] = useState(-60);
  const [isClipped, setIsClipped] = useState(false);

  const rafRef = useRef<number | null>(null);
  const peakHoldTimerRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });

  useEffect(() => {
    let currentLeft = -60;
    let currentRight = -60;
    let peakLeft = -60;
    let peakRight = -60;

    const animate = (timestamp: number) => {
      const state = useTimelineStore.getState();
      const isPlay = state.isPlaying;
      const playhead = state.playheadMs;
      const tl = state.timeline;

      let targetLeft = -60;
      let targetRight = -60;

      if (isPlay && tl?.tracks) {
        // Collect active eligible audio clips
        const isAnySolo = tl.tracks.some(
          (t) =>
            (t.track_type === 'audio' ||
              ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(t.track_role)) &&
            t.is_solo
        );

        const activeTracks = [];
        for (const track of tl.tracks) {
          const isAudio =
            track.track_type === 'audio' ||
            ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(track.track_role);
          if (!isAudio) continue;
          if (isAnySolo && !track.is_solo) continue;
          if (track.is_muted) continue;

          const clip = track.clips.find(
            (c) => c.start_time_ms <= playhead && playhead < c.start_time_ms + c.duration_ms
          );
          if (clip) {
            activeTracks.push({
              trackId: track.id,
              clip,
              trackVolumeDb: track.volume_db ?? 0,
              pan: track.pan ?? 0,
            });
          }
        }

        const levels = audioPreviewEngine.getMeterLevels(activeTracks, playhead);
        targetLeft = levels.left;
        targetRight = levels.right;
        if (levels.isClipped) {
          setIsClipped(true);
        }
      }

      currentLeft = targetLeft > currentLeft ? targetLeft : currentLeft - 0.8;
      currentRight = targetRight > currentRight ? targetRight : currentRight - 0.8;

      if (currentLeft > peakLeft) {
        peakLeft = currentLeft;
        peakHoldTimerRef.current.left = timestamp + 1200;
      } else if (timestamp > peakHoldTimerRef.current.left) {
        peakLeft = Math.max(-60, peakLeft - 1.2);
      }

      if (currentRight > peakRight) {
        peakRight = currentRight;
        peakHoldTimerRef.current.right = timestamp + 1200;
      } else if (timestamp > peakHoldTimerRef.current.right) {
        peakRight = Math.max(-60, peakRight - 1.2);
      }

      if (currentLeft >= 0 || currentRight >= 0) {
        setIsClipped(true);
      }

      setLeftDb(Math.round(currentLeft * 10) / 10);
      setRightDb(Math.round(currentRight * 10) / 10);
      setLeftPeakHold(Math.round(peakLeft * 10) / 10);
      setRightPeakHold(Math.round(peakRight * 10) / 10);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  const dbToPercent = (db: number) => {
    const clamped = Math.max(-60, Math.min(6, db));
    return ((clamped + 60) / 66) * 100;
  };

  const leftPct = dbToPercent(leftDb);
  const rightPct = dbToPercent(rightDb);
  const leftPeakPct = dbToPercent(leftPeakHold);
  const rightPeakPct = dbToPercent(rightPeakHold);

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1 px-1.5 py-0.5 bg-cinema-950 border border-cinema-border/80 rounded select-none ${className}`}
        title={`Stereo Master Out: L ${leftDb} dB, R ${rightDb} dB`}
      >
        <span className="text-[9px] font-mono text-cinema-textDim/70">M</span>
        <div className="flex flex-col gap-0.5 w-16 md:w-20">
          <div className="relative h-1.5 w-full bg-cinema-850 rounded-sm overflow-hidden">
            <div
              className="h-full transition-all duration-75"
              style={{
                width: `${leftPct}%`,
                background: 'linear-gradient(to right, #10b981 0%, #10b981 65%, #f59e0b 85%, #ef4444 100%)',
              }}
            />
            {leftPeakPct > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-sm"
                style={{ left: `${Math.min(99, leftPeakPct)}%` }}
              />
            )}
          </div>
          <div className="relative h-1.5 w-full bg-cinema-850 rounded-sm overflow-hidden">
            <div
              className="h-full transition-all duration-75"
              style={{
                width: `${rightPct}%`,
                background: 'linear-gradient(to right, #10b981 0%, #10b981 65%, #f59e0b 85%, #ef4444 100%)',
              }}
            />
            {rightPeakPct > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-sm"
                style={{ left: `${Math.min(99, rightPeakPct)}%` }}
              />
            )}
          </div>
        </div>
        <button
          type="button"
          data-testid="audio-meter-compact-clip"
          onClick={() => {
            setIsClipped(false);
            audioPreviewEngine.resetClipping();
          }}
          title={isClipped ? 'Audio Clipped (>0dB). Click to reset.' : 'Peak Normal'}
          className={`w-1.5 h-3 rounded-xs transition-colors ${
            isClipped ? 'bg-red-500 animate-pulse' : 'bg-cinema-border/50'
          }`}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 p-2 bg-cinema-900 border border-cinema-border rounded select-none ${className}`}>
      <div className="flex items-center justify-between text-[10px] font-mono text-cinema-textDim">
        <span className="font-semibold text-cinema-text">MASTER BUS (L/R)</span>
        <button
          type="button"
          data-testid="audio-meter-clip-indicator"
          onClick={() => {
            setIsClipped(false);
            audioPreviewEngine.resetClipping();
          }}
          className={`px-1 rounded text-[9px] font-bold ${
            isClipped ? 'bg-red-950 text-red-400 border border-red-800' : 'text-cinema-textMuted'
          }`}
        >
          {isClipped ? 'CLIP' : '0 dB'}
        </button>
      </div>

      <div className="flex gap-2 items-center">
        <div className="flex flex-col justify-between h-28 text-[8px] font-mono text-cinema-textDim text-right pr-0.5">
          <span>+6</span>
          <span>0</span>
          <span>-6</span>
          <span>-12</span>
          <span>-24</span>
          <span>-36</span>
          <span>-60</span>
        </div>

        <div className="flex gap-1.5 h-28 items-end">
          <div className="relative w-3 h-full bg-cinema-950 rounded border border-cinema-border/60 overflow-hidden flex flex-col justify-end">
            <div
              className="w-full transition-all duration-75"
              style={{
                height: `${leftPct}%`,
                background: 'linear-gradient(to top, #10b981 0%, #10b981 65%, #f59e0b 85%, #ef4444 100%)',
              }}
            />
            {leftPeakPct > 0 && (
              <div
                className="absolute left-0 right-0 h-0.5 bg-white shadow-sm"
                style={{ bottom: `${Math.min(99, leftPeakPct)}%` }}
              />
            )}
          </div>

          <div className="relative w-3 h-full bg-cinema-950 rounded border border-cinema-border/60 overflow-hidden flex flex-col justify-end">
            <div
              className="w-full transition-all duration-75"
              style={{
                height: `${rightPct}%`,
                background: 'linear-gradient(to top, #10b981 0%, #10b981 65%, #f59e0b 85%, #ef4444 100%)',
              }}
            />
            {rightPeakPct > 0 && (
              <div 
                className="absolute left-0 right-0 h-0.5 bg-white shadow-sm"
                style={{ bottom: `${Math.min(99, rightPeakPct)}%` }}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col justify-around h-28 text-[9px] font-mono text-cinema-textDim">
          <div>
            <span className="text-[8px] text-cinema-textMuted block">L</span>
            <span className={leftDb > -2 ? 'text-amber-400' : 'text-cinema-text'}>{leftDb} dB</span>
          </div>
          <div>
            <span className="text-[8px] text-cinema-textMuted block">R</span>
            <span className={rightDb > -2 ? 'text-amber-400' : 'text-cinema-text'}>{rightDb} dB</span>
          </div>
        </div>
      </div>
    </div>
  );
};
