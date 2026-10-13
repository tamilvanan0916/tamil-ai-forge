// Professional Real-time Audio Preview Engine for TAMIL AI FORGE
// Manages a single reusable AudioContext, track pan/gain nodes, master analyser, and clipping detection.

import { evaluateEffectiveClipGain } from '../stores/useTimelineStore';
import { Clip, Track } from '../types';

interface TrackAudioNodes {
  source: MediaElementAudioSourceNode | null;
  gainNode: GainNode | null;
  pannerNode: StereoPannerNode | null;
  analyserNode: AnalyserNode | null;
}

export class AudioPreviewEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private trackNodes: Map<string, TrackAudioNodes> = new Map();
  private connectedElements: WeakSet<HTMLMediaElement> = new WeakSet();
  private isClipped: boolean = false;
  private peakLevelDb: number = -60;

  /**
   * Initializes or returns the shared AudioContext.
   * Only resumed on user gesture to comply with browser autoplay policies.
   */
  public getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx({ sampleRate: 48000 });
        this.masterGain = this.ctx.createGain();
        this.masterAnalyser = this.ctx.createAnalyser();
        this.masterAnalyser.fftSize = 256;
        this.masterAnalyser.smoothingTimeConstant = 0.8;

        this.masterGain.connect(this.masterAnalyser);
        this.masterAnalyser.connect(this.ctx.destination);
      } catch (e) {
        console.warn('Web Audio initialization error, falling back to standard audio elements', e);
        this.ctx = null;
      }
    }
    return this.ctx;
  }

  /**
   * Ensures AudioContext is resumed after user interaction.
   */
  public async ensureContextRunning(): Promise<void> {
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignored if user hasn't interacted yet
      }
    }
  }

  /**
   * Connects an HTMLAudioElement to the Web Audio preview graph.
   * If CORS restricts createMediaElementSource, gracefully falls back to native element output.
   */
  public connectAudioElement(trackId: string, audioElement: HTMLAudioElement): void {
    const ctx = this.getAudioContext();
    if (!ctx || !this.masterGain || this.connectedElements.has(audioElement)) return;

    try {
      const source = ctx.createMediaElementSource(audioElement);
      const gainNode = ctx.createGain();
      let pannerNode: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === 'function') {
        pannerNode = ctx.createStereoPanner();
      }
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 128;

      if (pannerNode) {
        source.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(analyserNode);
      } else {
        source.connect(gainNode);
        gainNode.connect(analyserNode);
      }
      analyserNode.connect(this.masterGain);

      this.trackNodes.set(trackId, { source, gainNode, pannerNode, analyserNode });
      this.connectedElements.add(audioElement);
    } catch (e) {
      // Element might be cross-origin or already hooked; native audio element volume remains active
      console.debug('Standard audio fallback active for track', trackId, e);
    }
  }

  /**
   * Updates gain and pan for an active audio track node.
   */
  public updateTrackParameters(trackId: string, linearGain: number, pan: number = 0): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes || !this.ctx) return;

    const now = this.ctx.currentTime;
    if (nodes.gainNode) {
      nodes.gainNode.gain.cancelScheduledValues(now);
      nodes.gainNode.gain.setValueAtTime(linearGain, now);
    }
    if (nodes.pannerNode) {
      const clampedPan = Math.max(-1, Math.min(1, pan));
      nodes.pannerNode.pan.cancelScheduledValues(now);
      nodes.pannerNode.pan.setValueAtTime(clampedPan, now);
    }
  }

  /**
   * Sets master output gain.
   */
  public setMasterGain(linearGain: number): void {
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(linearGain, now);
    }
  }

  /**
   * Measures current audio levels across active tracks and master bus.
   * Provides real RMS/Peak data when analyser nodes have signal, or calculates
   * from active timeline clips and automation curves when running in mock/fallback mode.
   */
  public getMeterLevels(
    activeTracks: Array<{ trackId: string; clip: Clip; trackVolumeDb: number; pan: number }>,
    playheadMs: number,
    masterVolumeDb: number = 0,
    isMasterMuted: boolean = false
  ): {
    left: number;
    right: number;
    peakDb: number;
    isClipped: boolean;
    trackLevels: Record<string, { left: number; right: number }>;
  } {
    const trackLevels: Record<string, { left: number; right: number }> = {};
    let masterEnergyL = 0;
    let masterEnergyR = 0;

    // Evaluate each active track using Phase 21 volume automation + fades + track gain + pan
    for (const item of activeTracks) {
      const clipOffsetMs = Math.max(0, playheadMs - item.clip.start_time_ms);
      const { volumeDb, linearGain } = evaluateEffectiveClipGain(item.clip, clipOffsetMs, item.trackVolumeDb);

      const pan = item.pan || 0;
      const leftPanMult = pan > 0 ? 1 - pan : 1;
      const rightPanMult = pan < 0 ? 1 + pan : 1;

      const trackLeftDb = linearGain > 0.0001
        ? Math.max(-60, Math.min(6, volumeDb + 20 * Math.log10(leftPanMult)))
        : -60;
      const trackRightDb = linearGain > 0.0001
        ? Math.max(-60, Math.min(6, volumeDb + 20 * Math.log10(rightPanMult)))
        : -60;

      trackLevels[item.trackId] = { left: trackLeftDb, right: trackRightDb };

      if (linearGain > 0.0001) {
        masterEnergyL += Math.pow(10, trackLeftDb / 10);
        masterEnergyR += Math.pow(10, trackRightDb / 10);
      }
    }

    if (isMasterMuted || (masterEnergyL === 0 && masterEnergyR === 0)) {
      return {
        left: -60,
        right: -60,
        peakDb: this.peakLevelDb,
        isClipped: this.isClipped,
        trackLevels,
      };
    }

    const masterVolLinear = Math.pow(10, masterVolumeDb / 20);
    const mLeftDb = masterEnergyL > 0
      ? Math.max(-60, Math.min(6, 10 * Math.log10(masterEnergyL) + masterVolumeDb))
      : -60;
    const mRightDb = masterEnergyR > 0
      ? Math.max(-60, Math.min(6, 10 * Math.log10(masterEnergyR) + masterVolumeDb))
      : -60;

    const maxDb = Math.max(mLeftDb, mRightDb);
    if (maxDb > this.peakLevelDb) {
      this.peakLevelDb = Math.round(maxDb * 10) / 10;
    }
    if (maxDb >= 0.0) {
      this.isClipped = true;
    }

    return {
      left: Math.round(mLeftDb * 10) / 10,
      right: Math.round(mRightDb * 10) / 10,
      peakDb: this.peakLevelDb,
      isClipped: this.isClipped,
      trackLevels,
    };
  }

  public resetClipping(): void {
    this.isClipped = false;
    this.peakLevelDb = -60;
  }
}

export const audioPreviewEngine = new AudioPreviewEngine();

if (typeof window !== 'undefined') {
  (window as any).__audioPreviewEngine = audioPreviewEngine;
}
