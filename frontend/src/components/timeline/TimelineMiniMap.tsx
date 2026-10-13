import React, { useRef, useCallback, useEffect } from 'react';
import { useTimelineStore } from '../../stores/useTimelineStore';

interface TimelineMiniMapProps {
  scrollContainerRef: React.RefObject<any>;
  scrollLeft: number;
}

export const TimelineMiniMap: React.FC<TimelineMiniMapProps> = ({
  scrollContainerRef,
  scrollLeft,
}) => {
  const { timeline, playheadMs, zoomLevel, setPlayhead } = useTimelineStore();
  const miniMapRef = useRef<HTMLDivElement>(null);
  const isDraggingViewportRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);

  const durationMs = Math.max(1000, timeline?.duration_ms || 60000);
  const totalTimelinePx = Math.max(1, (durationMs / 1000) * zoomLevel);
  const containerWidth = scrollContainerRef.current?.clientWidth || 800;

  // Viewport calculation
  const viewportLeftPct = Math.max(0, Math.min(100, (scrollLeft / totalTimelinePx) * 100));
  const viewportWidthPct = Math.max(2, Math.min(100 - viewportLeftPct, (containerWidth / totalTimelinePx) * 100));
  const playheadPct = Math.max(0, Math.min(100, (playheadMs / durationMs) * 100));

  // Handle clicking / scrubbing on the minimap
  const handlePointerDownContainer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // If target is the viewport handle, let handlePointerDownViewport handle dragging
    if ((e.target as HTMLElement)?.id === 'timeline-minimap-viewport') return;

    if (!miniMapRef.current) return;
    const rect = miniMapRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = clickX / rect.width;
    const targetMs = Math.round(ratio * durationMs);

    setPlayhead(targetMs);

    // Also pan timeline scroll to center around clicked point
    if (scrollContainerRef.current) {
      const targetPx = (targetMs / 1000) * zoomLevel;
      scrollContainerRef.current.scrollLeft = Math.max(0, targetPx - containerWidth / 2);
    }
  }, [durationMs, zoomLevel, containerWidth, setPlayhead, scrollContainerRef]);

  // Handle dragging the viewport rectangle
  const handlePointerDownViewport = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isDraggingViewportRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartScrollRef.current = scrollContainerRef.current?.scrollLeft || 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scrollContainerRef]);

  const handlePointerMoveViewport = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingViewportRef.current || !miniMapRef.current || !scrollContainerRef.current) return;
    const miniMapWidth = miniMapRef.current.clientWidth || 1;
    const deltaX = e.clientX - dragStartXRef.current;
    // Ratio of movement on minimap -> movement on actual timeline
    const scaleRatio = totalTimelinePx / miniMapWidth;
    const targetScroll = Math.max(0, dragStartScrollRef.current + deltaX * scaleRatio);
    scrollContainerRef.current.scrollLeft = targetScroll;
  }, [totalTimelinePx, scrollContainerRef]);

  const handlePointerUpViewport = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingViewportRef.current) {
      isDraggingViewportRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  }, []);

  if (!timeline) return null;

  return (
    <div
      id="timeline-minimap-container"
      ref={miniMapRef}
      onPointerDown={handlePointerDownContainer}
      className="relative w-full h-5 md:h-6 bg-cinema-950/90 border-b border-cinema-border/50 overflow-hidden select-none cursor-pointer group"
      title="Timeline Overview Mini-Map (Click or drag to navigate)"
    >
      {/* Mini clip blocks */}
      <div className="absolute inset-0 flex flex-col justify-around py-0.5 px-0 pointer-events-none opacity-70">
        {timeline.tracks.map((track) => (
          <div key={track.id} className="relative w-full h-1 my-0.5">
            {track.clips.map((clip) => {
              const leftPct = (clip.start_time_ms / durationMs) * 100;
              const widthPct = Math.max(0.4, (clip.duration_ms / durationMs) * 100);
              const isAudio = track.track_type === 'audio' || ['dialogue', 'voiceover', 'music', 'sfx'].includes(track.track_role);
              const isGraphics = track.track_role === 'graphics' || clip.clip_type === 'title';
              const colorClass = isAudio
                ? 'bg-emerald-500/80'
                : isGraphics
                ? 'bg-amber-500/80'
                : 'bg-indigo-500/80';

              return (
                <div
                  key={clip.id}
                  className={`absolute top-0 bottom-0 rounded-xs ${colorClass}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Markers in minimap */}
      {Array.isArray(timeline.markers) && timeline.markers.map((m) => {
        const mPct = (m.time_ms / durationMs) * 100;
        return (
          <div
            key={m.id}
            className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-10 pointer-events-none"
            style={{ left: `${mPct}%` }}
          />
        );
      })}

      {/* Visible Viewport Window (draggable indicator) */}
      <div
        id="timeline-minimap-viewport"
        onPointerDown={handlePointerDownViewport}
        onPointerMove={handlePointerMoveViewport}
        onPointerUp={handlePointerUpViewport}
        onPointerCancel={handlePointerUpViewport}
        className="absolute top-0.5 bottom-0.5 bg-cinema-ai/20 border border-cinema-ai/80 rounded-xs cursor-grab active:cursor-grabbing z-20 shadow-xs"
        style={{
          left: `${viewportLeftPct}%`,
          width: `${viewportWidthPct}%`,
        }}
      />

      {/* Playhead needle in minimap */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none shadow-xs"
        style={{ left: `${playheadPct}%` }}
      />
    </div>
  );
};
