import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Volume2,
  VolumeX,
  Repeat,
  Tv,
  Sparkles,
  Loader2,
  Film,
  AlertCircle,
} from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { mediaUrl } from '../../services/api';
import { Clip, Track } from '../../types';
import { AudioMeter } from './AudioMeter';

export const VideoPreview: React.FC = () => {
  const {
    playheadMs,
    setPlayhead,
    isPlaying,
    isLooping,
    togglePlay,
    toggleLoop,
    stop,
    timeline,
  } = useTimelineStore();
  const { activeProject, getAsset } = useProjectStore();

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<'fit' | '100%' | '200%'>('fit');
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // RAF-based playback loop
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const playheadRef = useRef(playheadMs);

  useEffect(() => {
    playheadRef.current = playheadMs;
  }, [playheadMs]);

  // 1. Resolve active visual clip on topmost unlocked/visible video track
  const activeVisual = useMemo<{ clip: Clip; track: Track } | null>(() => {
    if (!timeline?.tracks) return null;
    const videoTracks = timeline.tracks
      .filter((t) => (t.track_type === 'video' || t.track_role === 'graphics') && !t.is_muted && t.is_visible)
      .sort((a, b) => b.order_index - a.order_index);

    for (const track of videoTracks) {
      const clip = track.clips.find(
        (c) => c.start_time_ms <= playheadMs && playheadMs < c.start_time_ms + c.duration_ms
      );
      if (clip) return { clip, track };
    }
    return null;
  }, [timeline, playheadMs]);

  // 2. Resolve active subtitle/captions clip
  const activeCaption = useMemo(() => {
    if (!timeline?.tracks) return null;
    const captionTrack = timeline.tracks.find((t) => t.track_role === 'captions' && t.is_visible);
    if (!captionTrack) return null;
    return captionTrack.clips.find(
      (c) => c.start_time_ms <= playheadMs && playheadMs < c.start_time_ms + c.duration_ms
    );
  }, [timeline, playheadMs]);

  // 3. Resolve media URL and media type for active visual clip
  const activeMedia = useMemo(() => {
    if (!activeVisual) return null;
    const { clip } = activeVisual;

    let url: string | null = null;
    let type: 'video' | 'image' | 'text' = 'text';

    if (clip.asset_id) {
      const asset = getAsset(clip.asset_id);
      if (asset?.storage_key) {
        url = mediaUrl(asset.storage_key);
        if (asset.asset_type === 'image' || asset.mime_type?.startsWith('image/')) {
          type = 'image';
        } else {
          type = 'video';
        }
      }
    } else if (clip.metadata_info?.url) {
      url = clip.metadata_info.url;
      type = clip.clip_type === 'title' ? 'text' : 'video';
    }

    return { url, type, clip };
  }, [activeVisual, getAsset]);

  // 3b. Resolve active audio clips across all audio tracks (A1 Dialogue, A2 Voiceover, A3 Music, A4 SFX)
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const activeAudioClips = useMemo(() => {
    if (!timeline?.tracks) return [];

    const isAnySolo = timeline.tracks.some(
      (t) =>
        (t.track_type === 'audio' ||
          ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(t.track_role)) &&
        t.is_solo
    );

    const eligibleTracks = timeline.tracks.filter((t) => {
      const isAudio =
        t.track_type === 'audio' ||
        ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(t.track_role);
      if (!isAudio) return false;
      if (isAnySolo) return t.is_solo && !t.is_muted;
      return !t.is_muted;
    });

    const activeList: Array<{
      trackId: string;
      trackRole: string;
      trackName: string;
      trackVolumeDb: number;
      clip: Clip;
      url: string;
    }> = [];

    for (const track of eligibleTracks) {
      const clip = track.clips.find(
        (c) => c.start_time_ms <= playheadMs && playheadMs < c.start_time_ms + c.duration_ms
      );
      if (!clip) continue;

      let url: string | null = null;
      if (clip.asset_id) {
        const asset = getAsset(clip.asset_id);
        if (asset?.storage_key) {
          url = mediaUrl(asset.storage_key);
        }
      } else if (clip.metadata_info?.url) {
        url = clip.metadata_info.url;
      } else if (clip.metadata_info?.audio_url) {
        url = clip.metadata_info.audio_url;
      }

      if (url) {
        activeList.push({
          trackId: track.id,
          trackRole: track.track_role,
          trackName: track.name,
          trackVolumeDb: track.volume_db ?? 0,
          clip,
          url,
        });
      }
    }

    return activeList;
  }, [timeline, playheadMs, getAsset]);

  // 3c. Resolve active graphics / cinematic title clip
  const activeGraphics = useMemo(() => {
    if (!timeline?.tracks) return null;

    // Search graphics tracks first
    const graphicsTracks = timeline.tracks.filter(
      (t) =>
        (t.track_role === 'graphics' || t.name.toLowerCase() === 'graphics') &&
        !t.is_muted &&
        t.is_visible
    );

    for (const track of graphicsTracks) {
      const clip = track.clips.find(
        (c) => c.start_time_ms <= playheadMs && playheadMs < c.start_time_ms + c.duration_ms
      );
      if (clip) return { track, clip };
    }

    // Also check for any title clip on any visible unmuted track
    for (const track of timeline.tracks) {
      if (track.is_muted || !track.is_visible) continue;
      const clip = track.clips.find(
        (c) => c.clip_type === 'title' && c.start_time_ms <= playheadMs && playheadMs < c.start_time_ms + c.duration_ms
      );
      if (clip) return { track, clip };
    }

    return null;
  }, [timeline, playheadMs]);

  // Synchronize multi-track audio playback with playhead, volume, and play/pause
  useEffect(() => {
    const pool = audioPoolRef.current;
    const activeTrackIds = new Set<string>();

    for (const item of activeAudioClips) {
      activeTrackIds.add(item.trackId);
      let audio = pool.get(item.trackId);

      if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        pool.set(item.trackId, audio);
      }

      // Check src match
      const currentSrc = audio.getAttribute('src') || audio.src;
      if (currentSrc !== item.url && !currentSrc.endsWith(item.url)) {
        audio.src = item.url;
      }

      // Compute volume with dB to linear conversion
      const totalDb = item.trackVolumeDb + (item.clip.volume_db ?? 0);
      const linearVol = Math.pow(10, totalDb / 20);
      const targetVolume = isMuted ? 0 : Math.max(0, Math.min(1, volume * linearVol));
      audio.volume = targetVolume;
      audio.muted = isMuted;

      // Sync playback position
      const speed = item.clip.speed_factor || 1.0;
      audio.playbackRate = speed;
      const clipOffsetMs = (playheadMs - item.clip.start_time_ms) * speed;
      const targetSec = Math.max(0, (item.clip.source_in_ms + clipOffsetMs) / 1000.0);

      if (Math.abs(audio.currentTime - targetSec) > 0.2) {
        audio.currentTime = targetSec;
      }

      // Sync play/pause
      if (isPlaying) {
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    }

    // Pause and quiet inactive audio tracks
    for (const [trackId, audio] of pool.entries()) {
      if (!activeTrackIds.has(trackId)) {
        if (!audio.paused) {
          audio.pause();
        }
      }
    }
  }, [activeAudioClips, playheadMs, isPlaying, volume, isMuted]);

  // Clean up audio pool on unmount
  useEffect(() => {
    return () => {
      const pool = audioPoolRef.current;
      for (const audio of pool.values()) {
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {}
      }
      pool.clear();
    };
  }, []);

  // 4. Seek HTML5 video when scrubbing / seeking
  useEffect(() => {
    if (!activeMedia || activeMedia.type !== 'video' || !videoRef.current) return;
    const clip = activeMedia.clip;
    const speed = clip.speed_factor || 1.0;
    const clipOffsetMs = (playheadMs - clip.start_time_ms) * speed;
    const targetSec = Math.max(0, (clip.source_in_ms + clipOffsetMs) / 1000.0);

    // Only seek if drift exceeds threshold to avoid stutter during playback
    if (Math.abs(videoRef.current.currentTime - targetSec) > 0.18) {
      videoRef.current.currentTime = targetSec;
    }
  }, [playheadMs, activeMedia]);

  // 5. Sync play / pause with HTML5 video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // 6. Sync volume and mute to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // 7. Playback loop via requestAnimationFrame
  const tick = useCallback(
    (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
      }
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const nextMs = playheadRef.current + delta;
      const endMs = timeline?.duration_ms ?? Infinity;

      if (nextMs >= endMs) {
        if (isLooping) {
          setPlayhead(0);
          playheadRef.current = 0;
        } else {
          setPlayhead(endMs);
          playheadRef.current = endMs;
          useTimelineStore.getState().togglePlay();
          return;
        }
      } else {
        setPlayhead(nextMs);
        playheadRef.current = nextMs;
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [isLooping, setPlayhead, timeline?.duration_ms]
  );

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimeRef.current = null;
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, tick]);

  // Format timecode HH:MM:SS:FF
  const formatTimecode = (ms: number, fps = 30) => {
    const totalSeconds = Math.floor(ms / 1000);
    const frames = Math.floor(((ms % 1000) / 1000) * fps);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  const fps = activeProject?.settings?.fps ?? 30;
  const frameMs = 1000 / fps;

  const handleStepFrame = (deltaFrames: number) => {
    setPlayhead(Math.max(0, playheadMs + deltaFrames * frameMs));
  };

  const handleSkipToStart = () => setPlayhead(0);
  const handleSkipToEnd = () => setPlayhead(timeline?.duration_ms ?? 0);

  const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const endMs = timeline?.duration_ms ?? 10000;
    setPlayhead(ratio * endMs);
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

  const endMs = timeline?.duration_ms ?? 0;
  const progress = endMs > 0 ? (playheadMs / endMs) * 100 : 0;
  const resolution = activeProject
    ? `${activeProject.settings.width}×${activeProject.settings.height} @ ${activeProject.settings.fps}fps`
    : '1920×1080 @ 30fps';

  // Compute CSS spatial transforms for active clip
  const clipTransformStyle = useMemo<React.CSSProperties>(() => {
    if (!activeVisual?.clip) return {};
    const c = activeVisual.clip;
    const posX = ((c.position_x ?? 0.5) - 0.5) * 100;
    const posY = ((c.position_y ?? 0.5) - 0.5) * 100;
    const scaleX = c.scale_x ?? 1.0;
    const scaleY = c.scale_y ?? 1.0;
    const rot = c.rotation ?? 0.0;
    const opacity = c.opacity ?? 1.0;
    const blendMode = (c.blend_mode as any) || 'normal';

    const cropTop = c.crop_top ?? 0;
    const cropRight = c.crop_right ?? 0;
    const cropBottom = c.crop_bottom ?? 0;
    const cropLeft = c.crop_left ?? 0;
    const hasCrop = cropTop > 0 || cropRight > 0 || cropBottom > 0 || cropLeft > 0;

    return {
      transform: `translate(${posX}%, ${posY}%) scale(${scaleX}, ${scaleY}) rotate(${rot}deg)`,
      opacity,
      mixBlendMode: blendMode,
      clipPath: hasCrop ? `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)` : undefined,
    };
  }, [activeVisual]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-cinema-void border-b border-cinema-border relative overflow-hidden select-none h-full"
    >
      {/* Top Preview Status Bar */}
      <div className="h-8 bg-cinema-900/90 border-b border-cinema-border/60 flex items-center justify-between px-3 text-[11px] text-cinema-textDim z-10 flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
          <span className="font-mono text-cinema-ai font-bold tracking-wider text-[10px] md:text-[11px] flex-shrink-0">
            {formatTimecode(playheadMs, fps)}
          </span>
          <span className="text-cinema-borderLight hidden sm:inline">|</span>
          <span className="text-cinema-textMuted hidden sm:inline truncate">
            {resolution}
          </span>
          {activeVisual && (
            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 rounded px-1.5 py-0.2 hidden md:inline truncate">
              {activeVisual.clip.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowSafeAreas(!showSafeAreas)}
            title="Toggle Safe Areas"
            className={`p-1 rounded hover:bg-cinema-800 transition-colors ${showSafeAreas ? 'text-cinema-ai' : 'text-cinema-textDim'}`}
          >
            <Tv className="w-3 h-3 md:w-3.5 md:h-3.5" />
          </button>
          <select
            value={zoomLevel}
            onChange={(e: any) => setZoomLevel(e.target.value)}
            className="bg-cinema-800 border border-cinema-border rounded px-1 py-0.5 text-[10px] text-cinema-text outline-none hidden md:block"
          >
            <option value="fit">Fit</option>
            <option value="100%">100%</option>
            <option value="200%">200%</option>
          </select>
          <button
            type="button"
            onClick={handleFullscreen}
            title="Fullscreen Preview"
            className="p-1 text-cinema-textDim hover:text-white transition-colors"
          >
            <Maximize2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Viewport Screen */}
      <div className="flex-1 flex items-center justify-center p-2 md:p-4 relative bg-[#040508] min-h-0">
        {/* Canvas Display Screen with 16:9 Aspect Ratio */}
        <div
          className={`w-full h-full max-w-[840px] aspect-video bg-cinema-void border border-cinema-border shadow-2xl relative flex items-center justify-center rounded overflow-hidden ${
            zoomLevel === '100%' ? 'scale-100' : zoomLevel === '200%' ? 'scale-125' : ''
          }`}
        >
          {/* Safe Area Guides */}
          {showSafeAreas && (
            <div className="absolute inset-0 pointer-events-none z-30">
              <div className="absolute inset-[5%] border border-dashed border-cyan-500/30" />
              <div className="absolute inset-[10%] border border-cyan-500/40" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4">
                <div className="absolute left-0 top-1/2 w-4 h-[1px] bg-cyan-500/50" />
                <div className="absolute left-1/2 top-0 w-[1px] h-4 bg-cyan-500/50" />
              </div>
            </div>
          )}

          {/* Real Media Preview: Video, Image, or Standby Slate */}
          {activeMedia?.url ? (
            activeMedia.type === 'image' ? (
              <img
                src={activeMedia.url}
                alt={activeMedia.clip.name}
                style={clipTransformStyle}
                className="w-full h-full object-contain pointer-events-none transition-transform duration-75"
              />
            ) : (
              <video
                ref={videoRef}
                src={activeMedia.url}
                style={clipTransformStyle}
                playsInline
                preload="auto"
                onWaiting={() => setMediaLoading(true)}
                onPlaying={() => setMediaLoading(false)}
                onError={() => {
                  setMediaLoading(false);
                  setMediaError('Failed to decode video stream');
                }}
                className="w-full h-full object-contain pointer-events-none"
              />
            )
          ) : (
            /* Standby Cinema State */
            <div className="text-center p-4 md:p-6 space-y-2 md:space-y-3 z-10 select-none">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cinema-800/80 border border-cinema-border rounded-full text-xs text-cinema-ai backdrop-blur-sm">
                <Film className="w-3.5 h-3.5 text-cinema-red" />
                <span className="hidden sm:inline">TAMIL AI FORGE Cinema Monitor</span>
                <span className="sm:hidden">Cinema Monitor</span>
              </div>
              <h3 className="text-base md:text-lg font-bold text-white tracking-wide">
                {activeProject ? activeProject.title : 'Ready for Timeline Assembly'}
              </h3>
              <p className="text-[10px] md:text-xs text-cinema-textDim max-w-md mx-auto hidden sm:block">
                Drag and drop assets from the Media Browser onto timeline tracks to preview and edit.
              </p>
            </div>
          )}

          {/* Media loading indicator */}
          {mediaLoading && (
            <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-2 py-1 bg-cinema-900/80 border border-cinema-border rounded text-[10px] text-cinema-ai">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Buffering…</span>
            </div>
          )}

          {/* Media error notice */}
          {mediaError && (
            <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2 py-1 bg-red-950/80 border border-red-800/80 rounded text-[10px] text-red-300">
              <AlertCircle className="w-3 h-3 text-red-400" />
              <span>{mediaError}</span>
            </div>
          )}

          {/* Cinematic Graphics & Titles Overlay */}
          {activeGraphics && (() => {
            const { clip } = activeGraphics;
            const meta = clip.metadata_info || {};
            const gMeta = meta.graphics || {};
            const tMeta = meta.text || {};

            const title = gMeta.title || tMeta.content || clip.name.replace(/^Title:\s*/, '');
            const subtitle = gMeta.subtitle || '';
            const presetId = gMeta.preset_id || 'cinema_title';
            const alignment = gMeta.alignment || tMeta.alignment || 'center';
            const fontFamily = gMeta.font_family || tMeta.font_family || 'Noto Sans Tamil';
            const fontColor = gMeta.font_color || tMeta.font_color || '#ffffff';
            const boxOpacity = gMeta.box_opacity ?? 0.65;

            // Fade In / Out calculation
            const elapsedMs = playheadMs - clip.start_time_ms;
            const remainingMs = (clip.start_time_ms + clip.duration_ms) - playheadMs;
            let currentOpacity = clip.opacity ?? 1.0;
            if (clip.fade_in_ms && elapsedMs < clip.fade_in_ms) {
              currentOpacity *= Math.max(0, Math.min(1, elapsedMs / clip.fade_in_ms));
            }
            if (clip.fade_out_ms && remainingMs < clip.fade_out_ms) {
              currentOpacity *= Math.max(0, Math.min(1, remainingMs / clip.fade_out_ms));
            }

            let containerClass = 'items-center justify-center text-center';
            if (alignment === 'lower_third') {
              containerClass = 'items-start justify-end text-left pl-6 pb-8 md:pl-10 md:pb-10';
            } else if (alignment === 'top_left') {
              containerClass = 'items-start justify-start text-left pl-6 pt-6 md:pl-8 md:pt-8';
            } else if (alignment === 'bottom') {
              containerClass = 'items-center justify-end text-center pb-6 md:pb-8';
            }

            return (
              <div
                id="video-preview-graphics-overlay"
                className={`absolute inset-0 pointer-events-none z-25 flex flex-col transition-opacity duration-75 ${containerClass}`}
                style={{ opacity: currentOpacity }}
              >
                {alignment === 'lower_third' ? (
                  <div
                    className="flex items-center gap-3 px-3.5 py-2 rounded-r-lg max-w-md shadow-2xl backdrop-blur-sm border-l-4 border-amber-500"
                    style={{ backgroundColor: `rgba(0, 0, 0, ${boxOpacity})` }}
                  >
                    <div>
                      <h4
                        className="font-bold text-sm md:text-base tracking-wide leading-tight"
                        style={{ color: fontColor, fontFamily }}
                      >
                        {title}
                      </h4>
                      {subtitle && (
                        <p className="text-[10px] md:text-xs text-sky-400 font-medium tracking-normal mt-0.5">
                          {subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                ) : alignment === 'top_left' ? (
                  <div
                    className="px-3 py-1.5 rounded border border-emerald-500/40 shadow-xl backdrop-blur-sm"
                    style={{ backgroundColor: `rgba(0, 0, 0, ${boxOpacity})` }}
                  >
                    <div
                      className="font-mono text-xs md:text-sm font-bold tracking-wider"
                      style={{ color: fontColor }}
                    >
                      {title}
                    </div>
                    {subtitle && (
                      <div className="font-mono text-[9px] md:text-[10px] text-slate-400 mt-0.5">
                        {subtitle}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="px-4 py-3 md:px-6 md:py-4 rounded-xl shadow-2xl backdrop-blur-sm max-w-xl mx-4 border border-white/10"
                    style={{ backgroundColor: `rgba(0, 0, 0, ${boxOpacity})` }}
                  >
                    {presetId === 'chapter_heading' && (
                      <div className="flex items-center justify-center gap-2 mb-1.5 opacity-60">
                        <div className="h-[1px] w-6 bg-white" />
                        <span className="text-[9px] uppercase tracking-widest text-amber-400">Section</span>
                        <div className="h-[1px] w-6 bg-white" />
                      </div>
                    )}
                    <h3
                      className="font-bold text-base md:text-xl lg:text-2xl tracking-widest uppercase leading-tight drop-shadow-lg"
                      style={{ color: fontColor, fontFamily }}
                    >
                      {title}
                    </h3>
                    {subtitle && (
                      <p className="text-[11px] md:text-xs text-amber-400 font-semibold tracking-wider mt-1 drop-shadow">
                        {subtitle}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Subtitle / Dialogue Overlay */}
          <div className="absolute bottom-4 md:bottom-6 inset-x-4 md:inset-x-8 text-center pointer-events-none z-20">
            {activeCaption ? (
              <span className="inline-block bg-black/85 px-3 py-1 rounded text-white text-xs md:text-sm font-semibold tracking-wide border border-white/20 shadow-xl max-w-xl">
                {activeCaption.name}
              </span>
            ) : (
              <span className="inline-block bg-black/60 px-2.5 py-0.5 rounded text-cinema-textDim text-[11px] font-medium tracking-wide border border-white/5">
                கற்பனையை திரையாக்கும் கலை • From Words to Cinema
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Seek Bar */}
      <div
        className="h-2 bg-cinema-800 cursor-pointer mx-0 relative group flex-shrink-0"
        onClick={handleSeekBarClick}
        title="Seek Timeline"
      >
        <div
          className="h-full bg-cinema-red transition-none"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>

      {/* Bottom Transport Controls Bar */}
      <div className="h-10 bg-cinema-900 border-t border-cinema-border flex items-center justify-between px-2 md:px-4 z-10 flex-shrink-0">
        <div className="flex items-center gap-0.5 md:gap-1">
          <button
            type="button"
            onClick={handleSkipToStart}
            title="Go to Start (Home)"
            className="p-1.5 hover:bg-cinema-800 text-cinema-textMuted hover:text-white rounded transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleStepFrame(-1)}
            title="Previous Frame (Left Arrow)"
            className="p-1.5 hover:bg-cinema-800 text-cinema-textMuted hover:text-white rounded transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="p-1.5 bg-cinema-red hover:bg-cinema-redHover text-white rounded transition-colors shadow-lg shadow-red-950/40"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={stop}
            title="Stop"
            className="p-1.5 hover:bg-cinema-800 text-cinema-textMuted hover:text-white rounded transition-colors"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => handleStepFrame(1)}
            title="Next Frame (Right Arrow)"
            className="p-1.5 hover:bg-cinema-800 text-cinema-textMuted hover:text-white rounded transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleSkipToEnd}
            title="Go to End (End)"
            className="p-1.5 hover:bg-cinema-800 text-cinema-textMuted hover:text-white rounded transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleLoop}
            title={isLooping ? 'Looping Enabled' : 'Enable Loop'}
            className={`p-1.5 rounded transition-colors ${
              isLooping ? 'text-cinema-ai bg-cyan-950/40' : 'text-cinema-textMuted hover:text-white hover:bg-cinema-800'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Active Multi-Track Audio Indicators */}
        {activeAudioClips.length > 0 && (
          <div
            id="active-audio-tracks-bar"
            data-testid="active-audio-tracks-bar"
            className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 bg-cinema-850 border border-cinema-border/70 rounded text-[9px] font-mono text-cinema-textDim"
          >
            <span className="text-emerald-400 font-bold">AUDIO:</span>
            {activeAudioClips.map((ac) => {
              const roleBadge =
                ac.trackRole === 'dialogue'
                  ? 'A1'
                  : ac.trackRole === 'voiceover'
                  ? 'A2'
                  : ac.trackRole === 'music'
                  ? 'A3'
                  : 'A4';
              return (
                <span
                  key={ac.trackId}
                  className="px-1.5 py-0.5 rounded bg-cinema-900 border border-cinema-border text-cinema-ai truncate max-w-[100px] flex items-center gap-1"
                  title={`${ac.trackName} (${ac.trackRole}): ${ac.clip.name}`}
                >
                  <span className="font-bold text-white">{roleBadge}</span>
                  <span className="truncate">{ac.trackRole}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Volume & Audio Controls */}
        <div className="flex items-center gap-1.5 md:gap-2">
          <AudioMeter compact />
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-1.5 hover:bg-cinema-800 text-cinema-textMuted hover:text-white rounded transition-colors"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="w-14 md:w-20 accent-cinema-red h-1 bg-cinema-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
