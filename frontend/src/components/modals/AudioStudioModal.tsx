import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Sliders,
  X,
  Music,
  Mic,
  Film,
  Sparkles,
  Layers,
  Activity,
  Check,
  RotateCcw,
  Zap,
  Play,
  Pause,
  Square,
} from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { Track } from '../../types';
import { audioPreviewEngine } from '../../services/audioPreviewEngine';

function formatTimecode(ms: number, fps = 30): string {
  const totalFrames = Math.floor((ms / 1000) * fps);
  const frames = totalFrames % fps;
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  return hr > 0
    ? `${hr}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
    : `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

interface AudioStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  dialogue: '#16a34a',
  voiceover: '#059669',
  music: '#d97706',
  sfx: '#7c3aed',
  ambience: '#0891b2',
  custom: '#64748b',
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  dialogue: <Mic className="w-3.5 h-3.5" />,
  voiceover: <Mic className="w-3.5 h-3.5" />,
  music: <Music className="w-3.5 h-3.5" />,
  sfx: <Zap className="w-3.5 h-3.5" />,
  ambience: <Activity className="w-3.5 h-3.5" />,
  custom: <Sliders className="w-3.5 h-3.5" />,
};

const EQ_PRESETS: Record<string, { low_80: number; low_mid_250: number; mid_1000: number; high_mid_4000: number; high_12000: number }> = {
  'Flat': { low_80: 0, low_mid_250: 0, mid_1000: 0, high_mid_4000: 0, high_12000: 0 },
  'Voice Clarity': { low_80: -3, low_mid_250: -2, mid_1000: 2, high_mid_4000: 4, high_12000: 2 },
  'Tamil Dialogue': { low_80: -4, low_mid_250: 0, mid_1000: 3, high_mid_4000: 4, high_12000: 1 },
  'Cinema BGM': { low_80: 3, low_mid_250: 1, mid_1000: -2, high_mid_4000: 2, high_12000: 3 },
  'Bass Punch': { low_80: 5, low_mid_250: 3, mid_1000: -1, high_mid_4000: 1, high_12000: 0 },
};

export const AudioStudioModal: React.FC<AudioStudioModalProps> = ({ isOpen, onClose }) => {
  const {
    timeline,
    setTrackVolume,
    setTrackPan,
    toggleTrackMute,
    toggleTrackSolo,
    applyAudioDucking,
    addTrack,
    updateClip,
    pushHistory,
    isPlaying,
    playheadMs,
    togglePlay,
    stop,
  } = useTimelineStore();

  const { activeProject } = useProjectStore();
  const { showNotification } = useUIStore();

  const [masterVolumeDb, setMasterVolumeDb] = useState(0.0);
  const [isMasterMuted, setIsMasterMuted] = useState(false);
  const [isMasterClipped, setIsMasterClipped] = useState(false);
  const [masterPeakDb, setMasterPeakDb] = useState(-60);
  const [selectedEqPreset, setSelectedEqPreset] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'mixer' | 'stems' | 'presets'>('mixer');

  // Animation frame for simulated responsive audio meters
  const [meterLevels, setMeterLevels] = useState<Record<string, { left: number; right: number }>>({});
  const animationFrameRef = useRef<number | null>(null);

  // Esc key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Audio tracks selection
  const audioTracks = useMemo(() => {
    if (!timeline?.tracks) return [];
    return timeline.tracks.filter(
      (t) =>
        t.track_type === 'audio' ||
        ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(t.track_role)
    );
  }, [timeline?.tracks]);

  // Check if any audio track is soloed
  const hasSoloTrack = useMemo(() => {
    return audioTracks.some((t) => t.is_solo);
  }, [audioTracks]);

  // Responsive audio meter animation
  useEffect(() => {
    if (!isOpen) return;

    const animateMeters = () => {
      const state = useTimelineStore.getState();
      const playhead = state.playheadMs;
      const isPlay = state.isPlaying;

      const activeTracksForEngine: Array<{
        trackId: string;
        clip: any;
        trackVolumeDb: number;
        pan: number;
      }> = [];

      for (const track of audioTracks) {
        const isAudible = hasSoloTrack ? track.is_solo && !track.is_muted : !track.is_muted;
        if (!isAudible) continue;

        const clip = track.clips.find(
          (c) => c.start_time_ms <= playhead && playhead < c.start_time_ms + c.duration_ms
        );
        if (clip) {
          activeTracksForEngine.push({
            trackId: track.id,
            clip,
            trackVolumeDb: track.volume_db ?? 0,
            pan: track.pan ?? 0,
          });
        }
      }

      const levels = audioPreviewEngine.getMeterLevels(
        activeTracksForEngine,
        playhead,
        masterVolumeDb,
        isMasterMuted
      );

      const computedTrackLevels: Record<string, { left: number; right: number }> = {};
      audioTracks.forEach((t) => {
        const isAudible = hasSoloTrack ? t.is_solo && !t.is_muted : !t.is_muted;
        if (!isAudible) {
          computedTrackLevels[t.id] = { left: -60, right: -60 };
        } else if (levels.trackLevels[t.id]) {
          computedTrackLevels[t.id] = levels.trackLevels[t.id];
        } else {
          computedTrackLevels[t.id] = isPlay
            ? { left: Math.max(-60, (t.volume_db || 0) - 35), right: Math.max(-60, (t.volume_db || 0) - 35) }
            : { left: -60, right: -60 };
        }
      });

      computedTrackLevels['master'] = { left: levels.left, right: levels.right };
      setMeterLevels(computedTrackLevels);
      if (levels.peakDb > -60) {
        setMasterPeakDb(levels.peakDb);
      }
      if (levels.isClipped) {
        setIsMasterClipped(true);
      }

      animationFrameRef.current = requestAnimationFrame(animateMeters);
    };

    animationFrameRef.current = requestAnimationFrame(animateMeters);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isOpen, audioTracks, hasSoloTrack, masterVolumeDb, isMasterMuted]);

  if (!isOpen) return null;

  // Handler for Ducking
  const handleAutoDuck = () => {
    const diagTrack = audioTracks.find((t) => t.track_role === 'dialogue' || t.name.toLowerCase().includes('dialogue'));
    const musicTrack = audioTracks.find((t) => t.track_role === 'music' || t.name.toLowerCase().includes('music') || t.name.toLowerCase().includes('bgm'));

    if (!diagTrack) {
      showNotification('Dialogue track (A1) not found.', 'warning');
      return;
    }
    if (!musicTrack) {
      showNotification('Music track (A3) not found.', 'warning');
      return;
    }

    applyAudioDucking(diagTrack.id, musicTrack.id, -9.0);
    showNotification('Applied smart audio ducking (-9dB) to background music under dialogue!', 'success');
  };

  // Handler for applying EQ preset to all clips on a track
  const handleApplyEqPreset = (trackId: string, presetName: string) => {
    const preset = EQ_PRESETS[presetName];
    if (!preset) return;

    setSelectedEqPreset((prev) => ({ ...prev, [trackId]: presetName }));

    const track = audioTracks.find((t) => t.id === trackId);
    if (!track) return;

    track.clips.forEach((clip) => {
      updateClip(
        clip.id,
        (c) => {
          if (!c.metadata_info) c.metadata_info = {};
          c.metadata_info.equalizer = { ...preset };
        },
        true
      );
    });

    pushHistory();
    showNotification(`Applied ${presetName} EQ to track "${track.name}"`, 'info');
  };

  // Meter color helper
  const getMeterColor = (db: number) => {
    if (db >= -0.5) return 'bg-red-500 shadow-sm shadow-red-500/50';
    if (db >= -6) return 'bg-yellow-400';
    if (db >= -18) return 'bg-emerald-400';
    return 'bg-emerald-600/70';
  };

  // Convert dB to height percentage for meter
  const dbToPercent = (db: number) => {
    if (db <= -60) return 0;
    if (db >= 6) return 100;
    return Math.round(((db + 60) / 66) * 100);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div
        data-testid="audio-studio-modal"
        className="w-full max-w-5xl h-[88vh] max-h-[820px] bg-cinema-950 border border-cinema-border/90 rounded-xl shadow-2xl flex flex-col overflow-hidden text-cinema-text select-none animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-studio-title"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-900/90 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 shadow-sm">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="audio-studio-title" className="text-sm font-bold text-white tracking-wide">
                  TAMIL AI FORGE — Audio & Music Studio
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                  DAW Multi-Track Console
                </span>
              </div>
              <p className="text-[11px] text-cinema-textDim">
                {activeProject ? `Project: ${activeProject.title}` : 'Timeline Master Audio Surface'} • 48kHz Stereo Post-Production
              </p>
            </div>
          </div>

          {/* Right Header Controls: Transport & Audition */}
          <div className="flex items-center gap-2.5">
            {/* Timeline Transport Audition Controls */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-cinema-950 border border-cinema-border/80 rounded-lg">
              <button
                type="button"
                data-testid="studio-play-btn"
                onClick={() => {
                  audioPreviewEngine.ensureContextRunning().catch(() => {});
                  togglePlay();
                }}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                className="p-1 rounded bg-cinema-red hover:bg-cinema-redHover text-white transition-colors"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <button
                type="button"
                data-testid="studio-stop-btn"
                onClick={stop}
                title="Stop"
                className="p-1 rounded hover:bg-cinema-800 text-cinema-textDim hover:text-white transition-colors"
              >
                <Square className="w-3 h-3" />
              </button>
              <span
                data-testid="studio-timecode-display"
                className="font-mono text-xs font-bold text-amber-300 px-1"
                title="Current Timeline Playhead"
              >
                {formatTimecode(playheadMs)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleAutoDuck}
              title="Automatically attenuate background music when dialogue occurs"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-600/50 rounded text-xs text-emerald-300 font-medium transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Smart Ducking</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-cinema-800 text-cinema-textDim hover:text-white transition-colors"
              title="Close Audio Studio (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mixer Body */}
        <div className="flex-1 flex overflow-hidden bg-cinema-950">
          {audioTracks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Volume2 className="w-12 h-12 text-cinema-textDim opacity-40" />
              <h3 className="text-sm font-semibold text-white">No Audio Tracks on Timeline</h3>
              <p className="text-xs text-cinema-textDim max-w-sm">
                Add an audio track or import Tamil background music or voiceovers to begin multi-track mixing.
              </p>
              <button
                type="button"
                onClick={() => addTrack('audio', 'dialogue', 'A1 Dialogue')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-md transition-colors"
              >
                Create Audio Track (A1)
              </button>
            </div>
          ) : (
            <div className="flex-1 flex overflow-x-auto overflow-y-hidden p-3 gap-2.5">
              {/* Channel Strips */}
              {audioTracks.map((track) => {
                const roleColor = ROLE_COLORS[track.track_role] || '#64748b';
                const roleIcon = ROLE_ICONS[track.track_role] || <Sliders className="w-3.5 h-3.5" />;
                const trackMeter = meterLevels[track.id] || { left: -60, right: -60 };
                const isAudible = hasSoloTrack ? track.is_solo && !track.is_muted : !track.is_muted;
                const totalClips = track.clips.length;

                return (
                  <div
                    key={track.id}
                    data-testid={`channel-strip-${track.id}`}
                    className={`w-36 flex-shrink-0 flex flex-col rounded-lg border transition-all ${
                      track.is_solo
                        ? 'bg-cinema-900 border-amber-500/60 shadow-lg shadow-amber-950/20'
                        : track.is_muted
                        ? 'bg-cinema-900/50 border-cinema-border/40 opacity-70'
                        : 'bg-cinema-900/90 border-cinema-border hover:border-cinema-borderLight'
                    }`}
                  >
                    {/* Track Header / Name */}
                    <div className="p-2 border-b border-cinema-border/70 flex flex-col gap-1 bg-cinema-850/60 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <span
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: roleColor }}
                        >
                          {roleIcon}
                          <span>{track.track_role}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          {track.clips.some((c) => (c.keyframes || []).some((k) => k.property_path === 'volume_db')) && (
                            <span
                              data-testid={`track-auto-badge-${track.id}`}
                              className="text-[7.5px] font-mono font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              title="Volume automation active"
                            >
                              AUTO
                            </span>
                          )}
                          <span className="text-[9px] text-cinema-textDim font-mono">
                            {totalClips} clip{totalClips === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-white truncate" title={track.name}>
                        {track.name}
                      </span>
                    </div>

                    {/* Mute & Solo Buttons */}
                    <div className="grid grid-cols-2 gap-1.5 p-2 border-b border-cinema-border/60 bg-cinema-900">
                      <button
                        type="button"
                        data-testid={`mixer-mute-${track.id}`}
                        onClick={() => toggleTrackMute(track.id)}
                        className={`py-1 rounded text-[10px] font-bold transition-all shadow-sm ${
                          track.is_muted
                            ? 'bg-red-600 text-white ring-1 ring-red-400'
                            : 'bg-cinema-800 text-cinema-textDim hover:text-red-400 hover:bg-cinema-750'
                        }`}
                        title={track.is_muted ? 'Unmute Track' : 'Mute Track'}
                      >
                        MUTE
                      </button>

                      <button
                        type="button"
                        data-testid={`mixer-solo-${track.id}`}
                        onClick={() => toggleTrackSolo(track.id)}
                        className={`py-1 rounded text-[10px] font-bold transition-all shadow-sm ${
                          track.is_solo
                            ? 'bg-amber-500 text-black font-extrabold ring-1 ring-amber-300'
                            : 'bg-cinema-800 text-cinema-textDim hover:text-amber-400 hover:bg-cinema-750'
                        }`}
                        title={track.is_solo ? 'Disable Solo' : 'Solo Track'}
                      >
                        SOLO
                      </button>
                    </div>

                    {/* Pan Dial / Slider */}
                    <div className="px-2 py-1.5 border-b border-cinema-border/40 bg-cinema-900/60 flex flex-col gap-0.5">
                      <div className="flex justify-between text-[8px] font-mono text-cinema-textDim">
                        <span>L</span>
                        <span className="text-cinema-text font-bold">
                          {(track.pan ?? 0) === 0 ? 'C' : (track.pan ?? 0) > 0 ? `R${Math.round((track.pan ?? 0) * 100)}` : `L${Math.round(Math.abs(track.pan ?? 0) * 100)}`}
                        </span>
                        <span>R</span>
                      </div>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.05}
                        value={track.pan ?? 0}
                        onChange={(e) => setTrackPan(track.id, parseFloat(e.target.value), true)}
                        onPointerUp={() => pushHistory()}
                        className="w-full accent-cyan-400 h-1 bg-cinema-800 rounded appearance-none cursor-pointer"
                        title="Stereo Pan"
                      />
                    </div>

                    {/* Main Fader & Stereo Level Meter */}
                    <div className="flex-1 flex items-center justify-center p-2.5 gap-3 bg-cinema-950/40">
                      {/* Vertical Volume Fader */}
                      <div className="flex flex-col items-center h-full justify-between py-1">
                        <span className="text-[9px] font-mono text-cinema-textDim">+12</span>
                        <div className="relative flex-1 flex items-center justify-center py-2">
                          <input
                            type="range"
                            min={-60}
                            max={12}
                            step={0.5}
                            value={track.volume_db ?? 0}
                            onChange={(e) => setTrackVolume(track.id, parseFloat(e.target.value), true)}
                            onPointerUp={() => pushHistory()}
                            className="h-44 w-1.5 bg-cinema-800 accent-emerald-400 rounded appearance-none cursor-pointer [writing-mode:bt-lr] [-webkit-appearance:slider-vertical]"
                            title={`Volume: ${track.volume_db ?? 0} dB`}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-cinema-textDim">-60</span>
                      </div>

                      {/* Dual Stereo VU Meters */}
                      <div className="flex gap-1 h-44 bg-cinema-900/90 p-1 rounded border border-cinema-border/80">
                        {/* Left Channel */}
                        <div className="w-2.5 h-full bg-cinema-950 rounded-sm overflow-hidden flex flex-col justify-end">
                          <div
                            className={`w-full transition-all duration-75 rounded-sm ${getMeterColor(trackMeter.left)}`}
                            style={{ height: `${dbToPercent(trackMeter.left)}%` }}
                          />
                        </div>

                        {/* Right Channel */}
                        <div className="w-2.5 h-full bg-cinema-950 rounded-sm overflow-hidden flex flex-col justify-end">
                          <div
                            className={`w-full transition-all duration-75 rounded-sm ${getMeterColor(trackMeter.right)}`}
                            style={{ height: `${dbToPercent(trackMeter.right)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Fader Readout & Quick Reset */}
                    <div className="p-2 border-t border-cinema-border/60 bg-cinema-900 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono font-bold text-white">
                          {(track.volume_db ?? 0) > 0 ? `+${(track.volume_db ?? 0).toFixed(1)}` : (track.volume_db ?? 0).toFixed(1)} dB
                        </span>
                        {track.clips.some((c) => (c.keyframes || []).some((k) => k.property_path === 'volume_db')) && (
                          <span
                            data-testid={`fader-auto-indicator-${track.id}`}
                            className="text-[7px] font-mono px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30"
                            title="Volume automation active on clip(s)"
                          >
                            AUTO
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setTrackVolume(track.id, 0.0); setTrackPan(track.id, 0.0); pushHistory(); }}
                        title="Reset Volume to 0dB and Pan to Center"
                        className="text-[9px] text-cinema-textDim hover:text-white p-0.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>

                    {/* EQ Preset Selector */}
                    <div className="px-2 py-1.5 border-t border-cinema-border/50 bg-cinema-950">
                      <select
                        value={selectedEqPreset[track.id] || 'Flat'}
                        onChange={(e) => handleApplyEqPreset(track.id, e.target.value)}
                        className="w-full bg-cinema-850 text-cinema-text border border-cinema-border rounded text-[10px] px-1.5 py-0.5 outline-none"
                      >
                        {Object.keys(EQ_PRESETS).map((pName) => (
                          <option key={pName} value={pName}>
                            EQ: {pName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}

              {/* Master Output Bus Strip */}
              <div
                data-testid="master-channel-strip"
                className="w-40 flex-shrink-0 flex flex-col rounded-lg border border-cinema-ai/40 bg-cinema-900 shadow-xl shadow-cyan-950/20 ml-auto"
              >
                {/* Master Header */}
                <div className="p-2 border-b border-cinema-border bg-cinema-800 rounded-t-lg text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cinema-ai flex items-center justify-center gap-1">
                    <Activity className="w-3.5 h-3.5" />
                    <span>MASTER OUT</span>
                  </span>
                  <span className="text-xs font-bold text-white block mt-0.5">Stereo Mix Bus</span>
                </div>

                {/* Master Mute */}
                <div className="p-2 border-b border-cinema-border/60 bg-cinema-900">
                  <button
                    type="button"
                    onClick={() => setIsMasterMuted(!isMasterMuted)}
                    className={`w-full py-1 rounded text-[10px] font-bold transition-all shadow-sm ${
                      isMasterMuted
                        ? 'bg-red-600 text-white ring-1 ring-red-400'
                        : 'bg-cinema-800 text-cinema-textDim hover:text-red-400 hover:bg-cinema-750'
                    }`}
                  >
                    {isMasterMuted ? 'MUTED' : 'MUTE MASTER'}
                  </button>
                </div>

                {/* Master Fader & Meter */}
                <div className="flex-1 flex items-center justify-center p-2.5 gap-3 bg-cinema-950/40">
                  {/* Master Fader */}
                  <div className="flex flex-col items-center h-full justify-between py-1">
                    <span className="text-[9px] font-mono text-cinema-textDim">+6</span>
                    <div className="relative flex-1 flex items-center justify-center py-2">
                      <input
                        type="range"
                        min={-60}
                        max={6}
                        step={0.5}
                        value={masterVolumeDb}
                        onChange={(e) => setMasterVolumeDb(parseFloat(e.target.value))}
                        className="h-44 w-2 bg-cinema-800 accent-cinema-ai rounded appearance-none cursor-pointer [writing-mode:bt-lr] [-webkit-appearance:slider-vertical]"
                        title={`Master: ${masterVolumeDb} dB`}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-cinema-textDim">-60</span>
                  </div>

                  {/* Master Dual VU Meters & Clip Indicator */}
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      data-testid="master-clip-indicator"
                      onClick={() => {
                        setIsMasterClipped(false);
                        audioPreviewEngine.resetClipping();
                      }}
                      className={`w-7 h-3 rounded-xs text-[7px] font-bold flex items-center justify-center cursor-pointer transition-colors ${
                        isMasterClipped ? 'bg-red-500 text-white animate-pulse' : 'bg-cinema-800 text-cinema-textDim/50 hover:bg-cinema-750'
                      }`}
                      title={isMasterClipped ? 'Clipping detected! Click to reset' : 'No clipping'}
                    >
                      CLIP
                    </button>
                    <div className="flex gap-1 h-40 bg-cinema-900/90 p-1 rounded border border-cinema-ai/30 shadow-inner">
                      <div className="w-3 h-full bg-cinema-950 rounded-sm overflow-hidden flex flex-col justify-end">
                        <div
                          className={`w-full transition-all duration-75 rounded-sm ${getMeterColor(meterLevels['master']?.left ?? -60)}`}
                          style={{ height: `${dbToPercent(meterLevels['master']?.left ?? -60)}%` }}
                        />
                      </div>
                      <div className="w-3 h-full bg-cinema-950 rounded-sm overflow-hidden flex flex-col justify-end">
                        <div
                          className={`w-full transition-all duration-75 rounded-sm ${getMeterColor(meterLevels['master']?.right ?? -60)}`}
                          style={{ height: `${dbToPercent(meterLevels['master']?.right ?? -60)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Master Readout */}
                <div className="p-2 border-t border-cinema-border/60 bg-cinema-900 text-center space-y-1">
                  <div className="text-xs font-mono font-bold text-cinema-ai">
                    {masterVolumeDb > 0 ? `+${masterVolumeDb.toFixed(1)}` : masterVolumeDb.toFixed(1)} dB
                  </div>
                  <div
                    data-testid="master-peak-readout"
                    className="text-[9px] font-mono text-cinema-textDim"
                  >
                    Peak: <span className={masterPeakDb >= 0 ? 'text-red-400 font-bold' : masterPeakDb > -12 ? 'text-amber-400' : 'text-cinema-textDim'}>
                      {masterPeakDb <= -60 ? '-∞' : `${masterPeakDb.toFixed(1)} dB`}
                    </span>
                  </div>
                </div>

                {/* Master Specs */}
                <div className="p-2 border-t border-cinema-border/40 bg-cinema-950 text-[9px] text-cinema-textDim text-center space-y-0.5">
                  <div className="text-emerald-400 font-semibold">48,000 Hz • 16-Bit</div>
                  <div>Broadcast Ready</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-4 py-2 border-t border-cinema-border bg-cinema-900 flex items-center justify-between text-[11px] text-cinema-textDim flex-shrink-0">
          <div className="flex items-center gap-3">
            <span>Audio Tracks: <strong className="text-white">{audioTracks.length}</strong></span>
            <span>Solo Isolation: <strong className={hasSoloTrack ? 'text-amber-400' : 'text-cinema-textDim'}>{hasSoloTrack ? 'Active' : 'Off'}</strong></span>
            <span className="hidden sm:inline">Use <kbd className="px-1 py-0.5 bg-cinema-800 border border-cinema-border rounded text-[9px] font-mono">Ctrl+Z</kbd> to undo fader moves</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-cinema-800 hover:bg-cinema-700 text-white rounded text-xs font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
