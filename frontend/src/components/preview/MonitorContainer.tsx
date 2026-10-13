import React, { useRef, useEffect } from 'react';
import { Columns, Square, Monitor, Eye, Film, Scissors, Check, X } from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { SourceMonitor } from './SourceMonitor';
import { VideoPreview } from './VideoPreview';
import { Allotment } from 'allotment';

function formatTimecode(ms: number, fps = 30): string {
  const totalFrames = Math.floor((Math.max(0, ms) / 1000) * fps);
  const frames = totalFrames % fps;
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

const TrimCutVideoScreen: React.FC<{
  id: string;
  testId: string;
  src?: string;
  frameMs: number;
  label: string;
  clipName?: string;
}> = ({ id, testId, src, frameMs, label, clipName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetSec = Math.max(0, frameMs / 1000);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let animId: number;
    const updateTime = () => {
      if (Math.abs(video.currentTime - targetSec) > 0.02) {
        video.currentTime = targetSec;
      }
    };
    animId = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animId);
  }, [src, targetSec]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {src ? (
        <video
          ref={videoRef}
          id={id}
          data-testid={testId}
          src={src}
          className="max-h-full max-w-full object-contain pointer-events-none"
          muted
          playsInline
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = targetSec;
          }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-cinema-textDim p-4 text-center select-none">
          <Film className="w-10 h-10 mb-2 opacity-40 text-cinema-textDim" />
          <span className="text-xs font-mono font-medium text-cinema-text">{clipName || label}</span>
          <span className="text-[11px] font-mono opacity-60 mt-1">{Math.round(frameMs)} ms</span>
        </div>
      )}
      {/* Precision reticle / crosshair watermark */}
      <div className="absolute inset-0 pointer-events-none border border-white/5 flex items-center justify-center">
        <div className="w-3 h-0.5 bg-white/20" />
        <div className="h-3 w-0.5 bg-white/20 absolute" />
      </div>
    </div>
  );
};

export const MonitorContainer: React.FC = () => {
  const {
    activeMonitorFocus,
    setActiveMonitorFocus,
    toggleMonitorFocus,
    monitorLayout,
    setMonitorLayout,
    sourceAsset,
    isTrimPreviewActive,
    trimPreviewData,
    cancelTrimPreview,
    endTrimPreview,
  } = useTimelineStore();
  const { activeProject } = useProjectStore();
  const fps = activeProject?.settings?.fps || 30;

  const isDual = monitorLayout === 'dual';

  // Dynamic 2-Up Trim Preview Mode (Phase 48)
  if (isTrimPreviewActive && trimPreviewData) {
    const toolBadgeConfig = {
      roll: { name: 'ROLL EDIT', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' },
      slip: { name: 'SLIP EDIT', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/50' },
      slide: { name: 'SLIDE EDIT', bg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' },
      ripple: { name: 'RIPPLE TRIM', bg: 'bg-orange-500/20 text-orange-400 border-orange-500/50' },
      trim: { name: 'EDGE TRIM', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
    }[trimPreviewData.activeTool] || { name: 'TRIM EDIT', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/50' };

    const deltaSign = trimPreviewData.deltaFrames > 0 ? '+' : '';
    const deltaMsSign = trimPreviewData.deltaMs > 0 ? '+' : '';

    return (
      <div id="monitor-container" data-testid="monitor-container" className="flex flex-col h-full w-full bg-cinema-950 overflow-hidden">
        {/* Phase 48: Trim Preview HUD */}
        <div
          id="trim-preview-hud"
          data-testid="trim-preview-hud"
          className="flex-shrink-0 h-9 bg-cinema-900 border-b border-cinema-border flex items-center justify-between px-3 text-xs select-none shadow-sm"
        >
          {/* Left: Tool Badge & Offset Counter */}
          <div className="flex items-center gap-2">
            <span
              id="trim-hud-tool"
              data-testid="trim-hud-tool"
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase border ${toolBadgeConfig.bg}`}
            >
              <Scissors className="w-3 h-3" />
              <span>{toolBadgeConfig.name}</span>
            </span>

            <div className="flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-black/40 border border-white/10">
              <span className="text-cinema-textDim">Offset:</span>
              <span
                id="trim-hud-delta-frames"
                data-testid="trim-hud-delta-frames"
                className={`font-bold ${
                  trimPreviewData.deltaFrames > 0
                    ? 'text-emerald-400'
                    : trimPreviewData.deltaFrames < 0
                    ? 'text-rose-400'
                    : 'text-cinema-text'
                }`}
              >
                {deltaSign}{trimPreviewData.deltaFrames} frames
              </span>
              <span id="trim-hud-delta-ms" data-testid="trim-hud-delta-ms" className="text-cinema-textDim text-[10px]">
                ({deltaMsSign}{trimPreviewData.deltaMs}ms)
              </span>
            </div>
          </div>

          {/* Center: Cut Frame Timecodes */}
          <div className="hidden sm:flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-amber-400 font-bold uppercase">OUT:</span>
              <span id="trim-hud-outgoing-tc" data-testid="trim-hud-outgoing-tc" className="text-amber-300 font-semibold">
                {formatTimecode(trimPreviewData.outgoingFrameMs, fps)}
              </span>
            </div>
            <span className="text-cinema-borderLight">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-cyan-400 font-bold uppercase">IN:</span>
              <span id="trim-hud-incoming-tc" data-testid="trim-hud-incoming-tc" className="text-cyan-300 font-semibold">
                {formatTimecode(trimPreviewData.incomingFrameMs, fps)}
              </span>
            </div>
          </div>

          {/* Right: Shortcuts Hint & Done/Cancel Buttons */}
          <div className="flex items-center gap-2">
            <span id="trim-hud-shortcuts" className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-cinema-textDim mr-1">
              <span>Nudge:</span>
              <kbd className="px-1 py-0.2 bg-black/50 border border-white/10 rounded">&lt;</kbd>
              <kbd className="px-1 py-0.2 bg-black/50 border border-white/10 rounded">&gt;</kbd>
              <span className="text-[9px]">(Shift ±5)</span>
            </span>

            <button
              id="trim-hud-cancel-btn"
              data-testid="trim-hud-cancel-btn"
              onClick={cancelTrimPreview}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-cinema-800 hover:bg-rose-950/60 text-cinema-textDim hover:text-rose-300 border border-cinema-border hover:border-rose-500/40 transition-colors"
              title="Cancel trim and restore original timeline positions (Esc)"
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
              <kbd className="text-[9px] px-1 py-0.2 bg-black/40 rounded border border-white/10">Esc</kbd>
            </button>

            <button
              id="trim-hud-commit-btn"
              data-testid="trim-hud-commit-btn"
              onClick={() => endTrimPreview(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-cinema-ai hover:bg-cyan-400 text-black transition-colors shadow-sm"
              title="Apply and commit trim changes to timeline (Enter)"
            >
              <Check className="w-3 h-3" />
              <span>Done</span>
              <kbd className="text-[9px] px-1 py-0.2 bg-black/20 rounded border border-black/20">↵</kbd>
            </button>
          </div>
        </div>

        {/* 2-Up Side-by-Side Precision Split Monitors */}
        <div id="trim-2up-split" data-testid="trim-2up-split" className="flex-1 min-h-0 overflow-hidden relative">
          <Allotment defaultSizes={[1, 1]} minSize={140}>
            {/* Outgoing (A-Side) Pane */}
            <Allotment.Pane minSize={120}>
              <div
                id="trim-outgoing-monitor"
                data-testid="trim-outgoing-monitor"
                className="h-full w-full flex flex-col border-r border-cinema-border overflow-hidden bg-cinema-950"
              >
                <div className="h-7 bg-cinema-900/90 border-b border-cinema-border flex items-center justify-between px-2.5 text-xs select-none flex-shrink-0">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span
                      id="trim-outgoing-label"
                      data-testid="trim-outgoing-label"
                      className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase"
                    >
                      OUTGOING (A-SIDE)
                    </span>
                    <span className="text-[11px] text-cinema-textDim truncate font-medium">
                      {trimPreviewData.outgoingClipName}
                    </span>
                  </div>
                  <span
                    id="trim-outgoing-timecode"
                    data-testid="trim-outgoing-timecode"
                    className="font-mono text-xs font-semibold text-amber-300"
                  >
                    {formatTimecode(trimPreviewData.outgoingFrameMs, fps)}
                  </span>
                </div>

                <div className="flex-1 min-h-0 relative">
                  <TrimCutVideoScreen
                    id="trim-outgoing-video"
                    testId="trim-outgoing-video"
                    src={trimPreviewData.outgoingAssetUrl}
                    frameMs={trimPreviewData.outgoingFrameMs}
                    label="Outgoing Cut Frame"
                    clipName={trimPreviewData.outgoingClipName}
                  />
                </div>
              </div>
            </Allotment.Pane>

            {/* Incoming (B-Side) Pane */}
            <Allotment.Pane minSize={120}>
              <div
                id="trim-incoming-monitor"
                data-testid="trim-incoming-monitor"
                className="h-full w-full flex flex-col overflow-hidden bg-cinema-950"
              >
                <div className="h-7 bg-cinema-900/90 border-b border-cinema-border flex items-center justify-between px-2.5 text-xs select-none flex-shrink-0">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span
                      id="trim-incoming-label"
                      data-testid="trim-incoming-label"
                      className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase"
                    >
                      INCOMING (B-SIDE)
                    </span>
                    <span className="text-[11px] text-cinema-textDim truncate font-medium">
                      {trimPreviewData.incomingClipName}
                    </span>
                  </div>
                  <span
                    id="trim-incoming-timecode"
                    data-testid="trim-incoming-timecode"
                    className="font-mono text-xs font-semibold text-cyan-300"
                  >
                    {formatTimecode(trimPreviewData.incomingFrameMs, fps)}
                  </span>
                </div>

                <div className="flex-1 min-h-0 relative">
                  <TrimCutVideoScreen
                    id="trim-incoming-video"
                    testId="trim-incoming-video"
                    src={trimPreviewData.incomingAssetUrl}
                    frameMs={trimPreviewData.incomingFrameMs}
                    label="Incoming Cut Frame"
                    clipName={trimPreviewData.incomingClipName}
                  />
                </div>
              </div>
            </Allotment.Pane>
          </Allotment>
        </div>
      </div>
    );
  }

  return (
    <div id="monitor-container" className="flex flex-col h-full w-full bg-cinema-950 overflow-hidden">
      {/* Top Monitor Navigation & Layout Bar */}
      <div className="flex-shrink-0 h-8 bg-cinema-900 border-b border-cinema-border flex items-center justify-between px-3 text-xs select-none">
        {/* Left: Monitor Tabs */}
        <div className="flex items-center gap-1">
          <button
            id="tab-source-monitor"
            onClick={() => setActiveMonitorFocus('source')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              activeMonitorFocus === 'source'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-sm'
                : 'text-cinema-textDim hover:text-white hover:bg-cinema-800'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeMonitorFocus === 'source' ? 'bg-amber-400 animate-pulse' : 'bg-cinema-borderLight'}`} />
            <span>Source {sourceAsset ? `(${sourceAsset.file_name.slice(0, 14)}…)` : ''}</span>
          </button>

          <button
            id="tab-program-monitor"
            onClick={() => setActiveMonitorFocus('program')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              activeMonitorFocus === 'program'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-sm'
                : 'text-cinema-textDim hover:text-white hover:bg-cinema-800'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeMonitorFocus === 'program' ? 'bg-cyan-400 animate-pulse' : 'bg-cinema-borderLight'}`} />
            <span>Program (Timeline)</span>
          </button>
        </div>

        {/* Center: Active Monitor Focus Badge & Shortcut Hint */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            id="active-monitor-focus-badge"
            onClick={toggleMonitorFocus}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium transition-colors ${
              activeMonitorFocus === 'source'
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:border-amber-400'
                : 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300 hover:border-cyan-400'
            }`}
            title="Click or press 'Q' to toggle active monitor focus"
          >
            <span className="text-[10px] uppercase font-bold text-cinema-textDim">Focus:</span>
            <span className="font-bold">{activeMonitorFocus === 'source' ? 'SOURCE' : 'PROGRAM'}</span>
            <kbd className="text-[9px] px-1 py-0.2 bg-black/40 rounded border border-white/10 text-cinema-textDim">Q</kbd>
          </button>
        </div>

        {/* Right: Layout Toggle Button */}
        <div className="flex items-center gap-1">
          <button
            id="toggle-monitor-layout-btn"
            onClick={() => setMonitorLayout(isDual ? 'tabbed' : 'dual')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              isDual
                ? 'bg-cinema-800 border-cinema-ai/60 text-cinema-ai'
                : 'bg-cinema-850 border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight'
            }`}
            title={isDual ? 'Switch to Tabbed Single View' : 'Switch to Dual Monitor Side-by-Side View'}
          >
            {isDual ? <Columns className="w-3.5 h-3.5 text-cinema-ai" /> : <Square className="w-3.5 h-3.5" />}
            <span>{isDual ? 'Dual View' : 'Single View'}</span>
          </button>
        </div>
      </div>

      {/* Main Monitor Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {isDual ? (
          <div className="h-full w-full">
            <Allotment defaultSizes={[1, 1]} minSize={140}>
              <Allotment.Pane minSize={120}>
                <div className="h-full w-full overflow-hidden">
                  <SourceMonitor isDualView={true} />
                </div>
              </Allotment.Pane>
              <Allotment.Pane minSize={120}>
                <div className="h-full w-full overflow-hidden">
                  <VideoPreview />
                </div>
              </Allotment.Pane>
            </Allotment>
          </div>
        ) : (
          <div className="h-full w-full relative">
            <div className={`h-full w-full ${activeMonitorFocus === 'source' ? 'block' : 'hidden'}`}>
              <SourceMonitor isDualView={false} />
            </div>
            <div className={`h-full w-full ${activeMonitorFocus === 'program' ? 'block' : 'hidden'}`}>
              <VideoPreview />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
