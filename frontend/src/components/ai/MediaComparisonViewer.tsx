import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, SplitSquareVertical,
  Columns, RotateCcw, Check, Sparkles, Layers, Sliders
} from 'lucide-react';
import { mediaUrl } from '../../services/api';

interface MediaComparisonViewerProps {
  mediaType: 'image' | 'video';
  sourceUrl: string;
  transformedUrl: string;
  sourceLabel?: string;
  transformedLabel?: string;
  metadata?: {
    duration_ms?: number;
    width?: number;
    height?: number;
    fps?: number;
    codec_video?: string;
    codec_audio?: string;
    is_mock?: boolean;
    offline_label?: string;
    style_preset?: string;
  };
}

export const MediaComparisonViewer: React.FC<MediaComparisonViewerProps> = ({
  mediaType,
  sourceUrl,
  transformedUrl,
  sourceLabel = 'Original Source',
  transformedLabel = 'Transformed Output',
  metadata,
}) => {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'slider'>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState<number>(50); // percentage 0-100
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Video Synchronized State
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const transformedVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [activeSingleTab, setActiveSingleTab] = useState<'source' | 'transformed'>('transformed');

  const resolvedSource = mediaUrl(sourceUrl);
  const resolvedTransformed = mediaUrl(transformedUrl);

  // --- Slider Mouse / Touch Dragging Handlers ---
  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPosition(percent);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    handleMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        handleMove(e.clientX);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMove]);

  // --- Video Sync Controls ---
  const handleTogglePlay = () => {
    const sVid = sourceVideoRef.current;
    const tVid = transformedVideoRef.current;
    if (!tVid) return;

    if (isPlaying) {
      tVid.pause();
      if (sVid) sVid.pause();
      setIsPlaying(false);
    } else {
      tVid.play().catch(() => {});
      if (sVid) sVid.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (transformedVideoRef.current) {
      const t = transformedVideoRef.current.currentTime;
      setCurrentTime(t);
      if (transformedVideoRef.current.duration) {
        setDuration(transformedVideoRef.current.duration);
      }
      // Keep source in sync within 0.15s threshold
      if (sourceVideoRef.current) {
        const diff = Math.abs(sourceVideoRef.current.currentTime - t);
        if (diff > 0.15) {
          sourceVideoRef.current.currentTime = t;
        }
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (transformedVideoRef.current) {
      transformedVideoRef.current.currentTime = newTime;
    }
    if (sourceVideoRef.current) {
      sourceVideoRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (transformedVideoRef.current) transformedVideoRef.current.volume = newVol;
    if (sourceVideoRef.current) sourceVideoRef.current.volume = newVol;
  };

  const handleToggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (transformedVideoRef.current) transformedVideoRef.current.muted = newMuted;
    if (sourceVideoRef.current) sourceVideoRef.current.muted = newMuted;
  };

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 border border-cinema-border rounded-lg overflow-hidden select-none" id="media-comparison-viewer">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-cinema-850 border-b border-cinema-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white">Before / After Comparison</span>
          {metadata?.offline_label && (
            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-bold rounded">
              {metadata.offline_label}
            </span>
          )}
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-cinema-950 p-0.5 rounded border border-cinema-border">
          <button
            onClick={() => setViewMode('side-by-side')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              viewMode === 'side-by-side' ? 'bg-cinema-750 text-white' : 'text-cinema-textDim hover:text-white'
            }`}
            title="Side-by-Side Comparison"
          >
            <Columns className="w-3 h-3" />
            <span className="hidden sm:inline">Side-by-Side</span>
          </button>
          <button
            onClick={() => setViewMode('slider')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              viewMode === 'slider' ? 'bg-cinema-750 text-white' : 'text-cinema-textDim hover:text-white'
            }`}
            title="Split-Screen Slider"
          >
            <SplitSquareVertical className="w-3 h-3" />
            <span className="hidden sm:inline">Split Slider</span>
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div ref={containerRef} className="relative flex-1 bg-cinema-950 flex items-center justify-center overflow-hidden min-h-[220px]">
        {viewMode === 'side-by-side' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 w-full h-full gap-1 p-2">
            {/* Left: Original */}
            <div className="relative flex flex-col items-center justify-center bg-cinema-900/60 rounded border border-cinema-border overflow-hidden">
              <span className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-black/70 backdrop-blur-sm text-cinema-textDim text-[10px] font-bold rounded border border-white/10">
                {sourceLabel}
              </span>
              {mediaType === 'video' ? (
                <video
                  ref={sourceVideoRef}
                  src={resolvedSource}
                  className="w-full h-full object-contain"
                  playsInline
                  muted={isMuted}
                />
              ) : (
                <img
                  src={resolvedSource}
                  alt={sourceLabel}
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            {/* Right: Transformed */}
            <div className="relative flex flex-col items-center justify-center bg-cinema-900/60 rounded border border-cinema-border overflow-hidden">
              <span className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-cinema-ai/80 backdrop-blur-sm text-white text-[10px] font-bold rounded shadow-lg border border-cinema-ai/40">
                {transformedLabel}
              </span>
              {mediaType === 'video' ? (
                <video
                  ref={transformedVideoRef}
                  src={resolvedTransformed}
                  className="w-full h-full object-contain"
                  playsInline
                  muted={isMuted}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                />
              ) : (
                <img
                  src={resolvedTransformed}
                  alt={transformedLabel}
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </div>
        ) : (
          /* Split-Screen Slider Mode */
          <div
            className="relative w-full h-full cursor-ew-resize select-none overflow-hidden flex items-center justify-center"
            onMouseDown={handleMouseDown}
            onTouchMove={handleTouchMove}
          >
            {/* Bottom Layer: Transformed */}
            <div className="absolute inset-0 flex items-center justify-center">
              {mediaType === 'video' ? (
                <video
                  ref={transformedVideoRef}
                  src={resolvedTransformed}
                  className="w-full h-full object-contain"
                  playsInline
                  muted={isMuted}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                />
              ) : (
                <img
                  src={resolvedTransformed}
                  alt={transformedLabel}
                  className="w-full h-full object-contain"
                />
              )}
              <span className="absolute bottom-3 right-3 px-2 py-0.5 bg-cinema-ai/80 backdrop-blur-sm text-white text-[10px] font-bold rounded shadow-lg">
                {transformedLabel}
              </span>
            </div>

            {/* Top Layer: Original (Clipped to sliderPosition) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPosition}%` }}
            >
              <div className="w-full h-full flex items-center justify-center relative" style={{ width: containerRef.current?.clientWidth || '100%' }}>
                {mediaType === 'video' ? (
                  <video
                    ref={sourceVideoRef}
                    src={resolvedSource}
                    className="w-full h-full object-contain"
                    playsInline
                    muted={isMuted}
                  />
                ) : (
                  <img
                    src={resolvedSource}
                    alt={sourceLabel}
                    className="w-full h-full object-contain"
                  />
                )}
                <span className="absolute bottom-3 left-3 px-2 py-0.5 bg-black/80 backdrop-blur-sm text-white text-[10px] font-bold rounded border border-white/20">
                  {sourceLabel}
                </span>
              </div>
            </div>

            {/* Draggable Divider Line */}
            <div
              className="absolute top-0 bottom-0 z-20 w-1 bg-white shadow-[0_0_10px_rgba(0,0,0,0.8)] cursor-ew-resize"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-cinema-800 border-2 border-white rounded-full flex items-center justify-center shadow-lg text-[10px] text-white font-bold">
                ↔
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Video Playback Synchronizer Controls */}
      {mediaType === 'video' && (
        <div className="p-2 bg-cinema-850 border-t border-cinema-border flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePlay}
              className="p-1.5 bg-cinema-ai hover:bg-cinema-ai/90 text-white rounded transition-colors"
              title={isPlaying ? 'Pause Both' : 'Play Both'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            <span className="text-[10px] font-mono text-cinema-textDim min-w-[70px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Seek Bar */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.05}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-cinema-700 rounded-lg appearance-none cursor-pointer accent-cinema-ai"
            />

            {/* Volume Control */}
            <button
              onClick={handleToggleMute}
              className="p-1 text-cinema-textDim hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1 bg-cinema-700 rounded-lg appearance-none cursor-pointer accent-cinema-ai hidden sm:inline-block"
            />

            <button
              onClick={handleFullscreen}
              className="p-1 text-cinema-textDim hover:text-white transition-colors"
              title="Fullscreen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Metadata Info Footer */}
      {metadata && (
        <div className="px-3 py-1.5 bg-cinema-900 border-t border-cinema-border flex flex-wrap items-center justify-between text-[10px] text-cinema-textDim">
          <div className="flex items-center gap-3">
            {metadata.width && metadata.height && (
              <span>Resolution: <strong className="text-cinema-text">{metadata.width}×{metadata.height}</strong></span>
            )}
            {metadata.duration_ms && metadata.duration_ms > 0 ? (
              <span>Duration: <strong className="text-cinema-text">{(metadata.duration_ms / 1000).toFixed(1)}s</strong></span>
            ) : null}
            {metadata.fps && (
              <span>FPS: <strong className="text-cinema-text">{metadata.fps}</strong></span>
            )}
            {metadata.codec_video && (
              <span>Codec: <strong className="text-cinema-text">{metadata.codec_video.toUpperCase()}</strong></span>
            )}
          </div>
          {metadata.style_preset && (
            <span className="capitalize">Style: <strong className="text-cinema-ai">{metadata.style_preset.replace('_', ' ')}</strong></span>
          )}
        </div>
      )}
    </div>
  );
};
