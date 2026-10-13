import { create } from 'zustand';
import { produce } from 'immer';
import { api } from '../services/api';
import { TimelineState, Track, Clip, Keyframe, TrackType, TrackRole, VideoTransitionType, ALLOWED_FREEZE_DURATIONS_MS, ALLOWED_FRAME_HOLD_DURATIONS_MS, BreadcrumbItem, TimelineMarker, MarkerColor, TimelineTool, TimelineGap, Asset, MonitorFocus, MonitorLayout, TimelineOccurrence, TrimToolType, TrimPreviewState, FourPointResolution, FourPointConflictData, ReplaceEditMode, ReplaceEditOptions, ShuttleRate, TimecodeJumpResult } from '../types';
import { useSelectionStore } from './useSelectionStore';
import { useProjectStore } from './useProjectStore';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface TimelineRevisionMeta {
  id: string;
  revision_number: number;
  description: string | null;
  created_at: string;
  snapshot?: any;
}

interface TimelineStore {
  timeline: TimelineState | null;
  playheadMs: number;
  isPlaying: boolean;
  isLooping: boolean;
  zoomLevel: number; // pixels per second
  selectedClipId: string | null;
  selectedTrackId: string | null;
  snapEnabled: boolean;
  rippleEnabled: boolean;
  activeTimelineTool: TimelineTool;
  setActiveTimelineTool: (tool: TimelineTool) => void;
  isSaving: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  _autoSaveTimer: ReturnType<typeof setTimeout> | null;

  // Revisions & Snapshots
  revisions: TimelineRevisionMeta[];
  isLoadingRevisions: boolean;
  fetchRevisions: (projectId: string) => Promise<TimelineRevisionMeta[]>;
  restoreRevision: (revisionId: string) => Promise<void>;

  // History for Undo / Redo
  history: TimelineState[];
  historyIndex: number;

  fetchTimeline: (projectId: string) => Promise<void>;
  saveTimeline: () => Promise<void>;
  scheduleAutoSave: () => void;
  setPlayhead: (ms: number) => void;
  togglePlay: () => void;
  toggleLoop: () => void;
  stop: () => void;
  setZoomLevel: (zoom: number) => void;
  selectClip: (clipId: string | null) => void;
  selectTrack: (trackId: string | null) => void;
  toggleSnap: () => void;
  toggleRipple: () => void;

  // Slip & Slide Editing (Phase 38)
  slipClip: (clipId: string, deltaMs: number, skipHistory?: boolean) => boolean;
  slideClip: (clipId: string, deltaMs: number, skipHistory?: boolean, forceSnap?: boolean) => boolean;

  // Rolling Edit Tool (Phase 39)
  rollEdit: (
    predId: string,
    succId: string,
    deltaMs: number,
    skipHistory?: boolean,
    forceSnap?: boolean
  ) => boolean;

  // Gap Management (Phase 40)
  selectedGap: { trackId: string; startMs: number; durationMs: number } | null;
  setSelectedGap: (gap: { trackId: string; startMs: number; durationMs: number } | null) => void;
  getTrackGaps: (trackId: string) => TimelineGap[];
  deleteGap: (trackId: string, startMs: number, rippleScope?: 'track' | 'all') => boolean;
  closeGapAtPlayhead: (trackId?: string) => boolean;

  // Track operations
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  setTrackVolume: (trackId: string, volumeDb: number, skipHistory?: boolean) => void;
  setTrackPan: (trackId: string, pan: number, skipHistory?: boolean) => void;
  applyAudioDucking: (dialogueTrackId: string, musicTrackId: string, duckingDb?: number) => void;
  setTrackHeight: (trackId: string, heightPx: number) => void;
  addTrack: (trackType?: TrackType, trackRole?: TrackRole, name?: string) => string | null;
  deleteTrack: (trackId: string) => boolean;
  renameTrack: (trackId: string, newName: string) => boolean;
  reorderTrack: (trackId: string, direction: 'up' | 'down') => boolean;
  moveTrackIndex: (fromIndex: number, toIndex: number) => boolean;

  // Clip operations
  updateClip: (clipId: string, updater: (clip: Clip) => void, skipHistory?: boolean) => void;
  addClipToTrack: (trackId: string, clip: Partial<Clip>) => void;
  deleteClip: (clipId?: string) => void;
  duplicateClip: (clipId?: string) => string | null;
  copyClip: (clipId?: string) => boolean;
  pasteClip: (targetTrackId?: string, targetTimeMs?: number) => string | null;
  clipboardClip: Clip | null;
  clipboardClips: Clip[] | null;
  moveClips: (clipIds: string[], deltaMs: number, skipHistory?: boolean) => void;
  batchUpdateClips: (updater: (state: TimelineStore) => void, skipHistory?: boolean) => void;
  duplicateSelectedClips: (clipIds?: string[]) => string[] | null;
  copySelectedClips: (clipIds?: string[]) => boolean;
  pasteSelectedClips: (targetTimeMs?: number) => string[] | null;
  deleteSelectedClips: (clipIds?: string[]) => void;
  rippleDeleteSelectedClips: (clipIds?: string[], rippleScope?: 'track' | 'all') => boolean;
  splitClipAtPlayhead: (clipId?: string) => { leftId: string; rightId: string } | null;
  splitClipAtTime: (clipId: string, splitTimeMs: number, skipHistory?: boolean) => { leftId: string; rightId: string } | null;
  razorCutClip: (clipId: string, cutTimeMs: number, skipHistory?: boolean) => { leftId: string; rightId: string } | null;
  razorCutAllTracks: (cutTimeMs: number) => Array<{ leftId: string; rightId: string }> | null;

  // Phase 42: Clip Grouping & Audio-Video Link / Unlink
  groupSelectedClips: (clipIds?: string[]) => string | null;
  ungroupSelectedClips: (clipIds?: string[]) => boolean;
  linkSelectedClips: (clipIds?: string[]) => boolean;
  unlinkSelectedClips: (clipIds?: string[]) => boolean;
  realignLinkedClip: (clipId: string) => boolean;
  getRelatedClipIds: (clipId: string) => string[];

  // Phase 43: Timeline Work Area & In/Out Range Editing
  markIn: (timeMs?: number) => void;
  markOut: (timeMs?: number) => void;
  markClipRange: (clipId?: string) => boolean;
  clearInOut: () => void;
  setInOutRange: (inMs: number | null, outMs: number | null) => void;
  liftRange: () => boolean;
  extractRange: () => boolean;

  // Phase 45: Track Patching & 3-Point Editing
  targetVideoTrackId: string | null;
  targetAudioTrackId: string | null;
  setTargetTrack: (trackTypeOrId: 'video' | 'audio' | string | null, trackIdOrType?: 'video' | 'audio' | string | null) => void;
  insertEdit: (options?: { assetId?: string; durationMs?: number; sourceInMs?: number; sourceOutMs?: number; name?: string }) => boolean;
  overwriteEdit: (options?: { assetId?: string; durationMs?: number; sourceInMs?: number; sourceOutMs?: number; name?: string; speedFactor?: number; startTimeMs?: number }) => boolean;
  replaceEdit: (
    clipId?: string,
    assetIdOrOptions?: string | ReplaceEditOptions,
    extraOptions?: ReplaceEditOptions
  ) => boolean;

  // Phase 49: Replace / Fit-to-Fill & 4-Point Editing Engine
  fourPointConflict: FourPointConflictData | null;
  openFourPointModal: (params: FourPointConflictData) => void;
  closeFourPointModal: () => void;
  resolveFourPointEdit: (resolution: FourPointResolution) => boolean;
  fitToFillEdit: (clipId?: string) => boolean;

  // Phase 46: Source Monitor & Media Selection
  sourceAsset: Asset | null;
  sourcePlayheadMs: number;
  sourceInPointMs: number | null;
  sourceOutPointMs: number | null;
  sourceIsPlaying: boolean;
  activeMonitorFocus: MonitorFocus;
  monitorLayout: MonitorLayout;
  loadSourceAsset: (asset: Asset) => void;
  closeSourceAsset: () => void;
  setSourcePlayhead: (ms: number) => void;
  setSourceInPoint: (ms?: number) => void;
  setSourceOutPoint: (ms?: number) => void;
  clearSourceInOut: () => void;
  toggleSourcePlay: () => void;
  setSourceIsPlaying: (playing: boolean) => void;
  stepSourceFrame: (frames: number) => void;
  setActiveMonitorFocus: (focus: MonitorFocus) => void;
  toggleMonitorFocus: () => void;
  setMonitorLayout: (layout: MonitorLayout) => void;
  insertFromSource: () => boolean;
  overwriteFromSource: () => boolean;

  // Phase 47: Match Frame & Media Locator
  highlightedAssetId: string | null;
  setHighlightedAssetId: (id: string | null) => void;
  matchFrame: (options?: { trackId?: string; clipId?: string } | string) => boolean;
  reverseMatchFrame: () => boolean;
  findAssetTimelineOccurrences: (assetId: string) => TimelineOccurrence[];
  jumpToTimelineOccurrence: (clipId: string) => void;

  // Phase 48: Dynamic 2-Up Trim Preview & Precision Cut Monitor
  isTrimPreviewActive: boolean;
  trimPreviewData: TrimPreviewState | null;
  startTrimPreview: (params: {
    tool: TrimToolType;
    clipId: string;
    edge?: 'left' | 'right';
    predClipId?: string;
    succClipId?: string;
  }) => void;
  updateTrimPreview: (deltaMs: number) => void;
  endTrimPreview: (commit?: boolean) => void;
  cancelTrimPreview: () => void;
  nudgeActiveTrim: (deltaFrames: number) => void;

  // Phase 50: Timeline Navigation & Precision Shuttle Engine
  shuttleRate: number;
  isTimecodeModalOpen: boolean;
  setShuttleRate: (rate: number) => void;
  shuttleForward: () => void;
  shuttleReverse: () => void;
  shuttleSlowForward: () => void;
  shuttleSlowReverse: () => void;
  shuttleStop: () => void;
  jumpToNextCut: () => boolean;
  jumpToPreviousCut: () => boolean;
  jumpToNextMarker: () => void;
  jumpToPreviousMarker: () => void;
  jumpToSequenceStart: () => void;
  jumpToSequenceEnd: () => void;
  jumpToInPoint: () => void;
  jumpToOutPoint: () => void;
  zoomToFit: (containerWidth?: number) => void;
  zoomAtPlayhead: (zoomInOrFactor: boolean | number, factor?: number) => void;
  jumpToTimecode: (input: string, fps?: number) => TimecodeJumpResult;
  setTimecodeModalOpen: (open: boolean) => void;
  moveClipToTrack: (clipId: string, newTrackId: string, newStartMs: number) => void;
  trimClip: (clipId: string, edge: 'left' | 'right', deltaMs: number, skipHistory?: boolean, forceRipple?: boolean) => void;
  rippleTrimClip: (clipId: string, edge: 'left' | 'right', deltaMs: number, skipHistory?: boolean) => void;
  rippleTrimToPlayhead: (edge: 'head' | 'tail', clipId?: string) => boolean;
  rippleDelete: (clipId?: string, rippleScope?: 'track' | 'all') => boolean;
  setClipTransition: (clipId: string, edge: 'in' | 'out', transition: Record<string, any> | null) => void;
  applyAudioCrossfade: (clipAId: string, clipBId: string, durationMs?: number) => void;
  applyVideoTransition: (
    fromClipId: string,
    toClipId: string,
    type: VideoTransitionType,
    durationMs: number
  ) => boolean;
  removeVideoTransition: (fromClipId: string, toClipId: string) => void;

  // Video speed & reverse (Phase 27)
  setClipSpeed: (clipId: string, speedFactor: number) => boolean;
  setClipReverse: (clipId: string, isReversed: boolean) => boolean;

  // Video freeze frame (Phase 28)
  applyFreezeFrame: (clipId: string, freezeAtMs: number, durationMs: number) => boolean;
  removeFreezeFrame: (clipId: string) => boolean;

  // Video frame hold (Phase 29)
  applyFrameHold: (clipId: string, frameHoldAtMs: number, durationMs: number) => boolean;
  removeFrameHold: (clipId: string) => boolean;

  // Keyframe operations
  addKeyframe: (clipId: string, kf: Keyframe) => void;
  deleteKeyframe: (clipId: string, kfId: string) => void;
  moveKeyframe: (clipId: string, kfId: string, newTimeMs: number) => void;
  updateKeyframeValue: (clipId: string, kfId: string, newValue: any, skipHistory?: boolean) => void;
  clearAudioAutomation: (clipId: string) => void;

  // Compound Clips / Nested Timeline (Phase 35)
  breadcrumbStack: BreadcrumbItem[];
  createCompoundClip: (clipIds?: string[], name?: string) => string | null;
  openCompoundClip: (clipId: string) => boolean;
  exitCompoundClip: () => void;
  ungroupCompoundClip: (clipId?: string) => boolean;

  // Marker System (Phase 36)
  addTimelineMarker: (timeMs?: number, options?: Partial<TimelineMarker>) => string;
  addClipMarker: (clipId: string, offsetMs?: number, options?: Partial<TimelineMarker>) => string | null;
  updateMarker: (markerId: string, updates: Partial<TimelineMarker>, clipId?: string) => boolean;
  deleteMarker: (markerId: string, clipId?: string) => boolean;
  clearMarkers: (clipId?: string) => void;
  goToNextMarker: () => void;
  goToPrevMarker: () => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}

// Deeply clones a clip and all its internal keyframes, markers, and nested compound tracks/clips with fresh UUIDs
export function cloneClipDeepWithNewIds(clip: Clip, timeOffsetMs: number = 0): Clip {
  const newId = crypto.randomUUID();
  const cloned: Clip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: newId,
    start_time_ms: clip.start_time_ms + timeOffsetMs,
  };

  if (Array.isArray(cloned.keyframes)) {
    cloned.keyframes = cloned.keyframes.map((kf) => ({
      ...kf,
      id: crypto.randomUUID(),
      clip_id: newId,
    }));
  }

  if (Array.isArray(cloned.markers)) {
    cloned.markers = cloned.markers.map((m) => ({
      ...m,
      id: crypto.randomUUID(),
      clip_id: newId,
    }));
  }

  if (cloned.is_compound && Array.isArray(cloned.nested_tracks)) {
    cloned.nested_tracks = cloned.nested_tracks.map((nt) => {
      const newTrackId = crypto.randomUUID();
      return {
        ...nt,
        id: newTrackId,
        clips: (nt.clips || []).map((nc) => {
          const childClone = cloneClipDeepWithNewIds(nc, 0);
          childClone.track_id = newTrackId;
          return childClone;
        }),
      };
    });
  }

  return cloned;
}

// Helper: recalculate timeline duration from all clips
function recalcDuration(state: TimelineStore) {
  if (!state.timeline) return;
  let maxEnd = 0;
  for (const track of state.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.start_time_ms + clip.duration_ms;
      if (end > maxEnd) maxEnd = end;
    }
  }
  state.timeline.duration_ms = Math.max(30000, maxEnd + 2000); // min 30s
}

// Helper: Calculate gaps on a track from canonical clip positions
export function calculateTrackGaps(track: Track): TimelineGap[] {
  if (!track || !track.clips || track.clips.length === 0) return [];
  const sorted = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
  const gaps: TimelineGap[] = [];

  // Gap from timeline start (0) to first clip if first clip starts > 0
  if (sorted[0].start_time_ms > 0) {
    gaps.push({
      track_id: track.id,
      start_time_ms: 0,
      duration_ms: sorted[0].start_time_ms,
      end_time_ms: sorted[0].start_time_ms,
    });
  }

  // Gaps between consecutive clips on this track
  for (let i = 0; i < sorted.length - 1; i++) {
    const curEnd = sorted[i].start_time_ms + sorted[i].duration_ms;
    const nextStart = sorted[i + 1].start_time_ms;
    if (nextStart > curEnd) {
      gaps.push({
        track_id: track.id,
        start_time_ms: curEnd,
        duration_ms: nextStart - curEnd,
        end_time_ms: nextStart,
      });
    }
  }

  return gaps;
}

// Helper: Trim single clip calculations for Phase 44 (used by trimClip and rippleTrimToPlayhead)
function trimSingleClipData(
  clip: Clip,
  edge: 'left' | 'right',
  deltaMs: number,
  shouldRipple: boolean
): { success: boolean; deltaDur: number; origEnd: number } | null {
  const origStart = clip.start_time_ms;
  const origDuration = clip.duration_ms;
  const origEnd = origStart + origDuration;
  const speed = clip.speed_factor && clip.speed_factor > 0 ? clip.speed_factor : 1.0;
  const isReversed = Boolean(clip.is_reversed);

  if (edge === 'left') {
    const newStart = Math.max(0, clip.start_time_ms + deltaMs);
    const actualDeltaStart = newStart - clip.start_time_ms;
    const newDuration = origDuration - actualDeltaStart;
    if (newDuration < 100) return null;

    const deltaMedia = Math.round(actualDeltaStart * speed);
    let newSourceIn = clip.source_in_ms;
    let newSourceOut = clip.source_out_ms;

    if (!isReversed) {
      newSourceIn = clip.source_in_ms + deltaMedia;
      if (newSourceIn < 0 || newSourceIn >= newSourceOut) return null;
    } else {
      newSourceOut = clip.source_out_ms - deltaMedia;
      if (newSourceOut <= newSourceIn) return null;
    }

    // Keyframes boundary interpolation & re-anchoring
    if (Array.isArray(clip.keyframes) && clip.keyframes.length > 0) {
      const uniqueProps = Array.from(new Set(clip.keyframes.map((k) => k.property_path)));
      const updatedKeyframes: Keyframe[] = [];

      if (actualDeltaStart > 0) {
        for (const prop of uniqueProps) {
          const defaultVal = Number((clip as any)[prop] ?? (prop === 'volume_db' ? (clip.volume_db ?? 0) : 0));
          const boundaryVal = evaluateClipProperty(clip, prop, actualDeltaStart, defaultVal);
          const roundedVal = prop === 'volume_db' ? Math.round(boundaryVal * 10) / 10 : Math.round(boundaryVal * 10000) / 10000;
          updatedKeyframes.push({
            id: crypto.randomUUID(),
            clip_id: clip.id,
            property_path: prop,
            time_offset_ms: 0,
            value: roundedVal,
            interpolation: 'linear',
          });
        }
      }

      for (const kf of clip.keyframes) {
        const shiftedOffset = kf.time_offset_ms - actualDeltaStart;
        if (shiftedOffset > 0 && shiftedOffset <= newDuration) {
          updatedKeyframes.push({
            ...kf,
            time_offset_ms: shiftedOffset,
          });
        } else if (actualDeltaStart <= 0 && shiftedOffset >= 0 && shiftedOffset <= newDuration) {
          updatedKeyframes.push({
            ...kf,
            time_offset_ms: shiftedOffset,
          });
        }
      }

      updatedKeyframes.sort((a, b) => a.time_offset_ms - b.time_offset_ms);
      clip.keyframes = updatedKeyframes;
    }

    // Freeze Frame adjustment
    if (clip.is_frozen) {
      const fAt = clip.freeze_at_ms ?? 0;
      const fDur = clip.freeze_duration_ms ?? 2000;
      const fEnd = fAt + fDur;
      if (actualDeltaStart <= fAt) {
        clip.freeze_at_ms = fAt - actualDeltaStart;
      } else if (actualDeltaStart < fEnd) {
        clip.freeze_at_ms = 0;
        clip.freeze_duration_ms = fEnd - actualDeltaStart;
      } else {
        clip.is_frozen = false;
        clip.freeze_at_ms = undefined;
        clip.freeze_duration_ms = undefined;
      }
    }

    // Frame Hold adjustment
    if (clip.is_frame_hold) {
      const hAt = clip.frame_hold_at_ms ?? 0;
      const hDur = clip.frame_hold_duration_ms ?? 2000;
      const hEnd = hAt + hDur;
      if (actualDeltaStart <= hAt) {
        clip.frame_hold_at_ms = hAt - actualDeltaStart;
      } else if (actualDeltaStart < hEnd) {
        clip.frame_hold_at_ms = 0;
        clip.frame_hold_duration_ms = hEnd - actualDeltaStart;
      } else {
        clip.is_frame_hold = false;
        clip.frame_hold_at_ms = undefined;
        clip.frame_hold_duration_ms = undefined;
      }
    }

    // Transitions clamping
    if (clip.transition_in) {
      if (newDuration < (clip.transition_in.duration_ms || 1000)) {
        clip.transition_in.duration_ms = Math.max(50, newDuration);
      }
      if (newDuration < 100) clip.transition_in = undefined;
    }
    if (clip.transition_out) {
      if (newDuration < (clip.transition_out.duration_ms || 1000)) {
        clip.transition_out.duration_ms = Math.max(50, newDuration);
      }
      if (newDuration < 100) clip.transition_out = undefined;
    }

    clip.fade_in_ms = Math.min(clip.fade_in_ms || 0, newDuration);
    clip.fade_out_ms = Math.min(clip.fade_out_ms || 0, newDuration);

    if (shouldRipple) {
      clip.start_time_ms = origStart;
    } else {
      clip.start_time_ms = newStart;
    }
    clip.duration_ms = newDuration;
    clip.source_in_ms = newSourceIn;
    clip.source_out_ms = newSourceOut;

    return { success: true, deltaDur: clip.duration_ms - origDuration, origEnd };
  } else {
    // edge === 'right'
    const newDuration = Math.round(origDuration + deltaMs);
    if (newDuration < 100) return null;

    let newSourceIn = clip.source_in_ms;
    let newSourceOut = clip.source_out_ms;

    if (!isReversed) {
      newSourceOut = clip.source_in_ms + Math.round(newDuration * speed);
      if (newSourceOut <= newSourceIn) return null;
    } else {
      newSourceIn = Math.max(0, clip.source_out_ms - Math.round(newDuration * speed));
      if (newSourceOut <= newSourceIn) return null;
    }

    // Keyframes boundary interpolation & clamping
    if (Array.isArray(clip.keyframes) && clip.keyframes.length > 0) {
      const uniqueProps = Array.from(new Set(clip.keyframes.map((k) => k.property_path)));
      const updatedKeyframes: Keyframe[] = [];

      if (newDuration < origDuration) {
        for (const prop of uniqueProps) {
          const defaultVal = Number((clip as any)[prop] ?? (prop === 'volume_db' ? (clip.volume_db ?? 0) : 0));
          const boundaryVal = evaluateClipProperty(clip, prop, newDuration, defaultVal);
          const roundedVal = prop === 'volume_db' ? Math.round(boundaryVal * 10) / 10 : Math.round(boundaryVal * 10000) / 10000;
          updatedKeyframes.push({
            id: crypto.randomUUID(),
            clip_id: clip.id,
            property_path: prop,
            time_offset_ms: newDuration,
            value: roundedVal,
            interpolation: 'linear',
          });
        }
      }

      for (const kf of clip.keyframes) {
        if (kf.time_offset_ms < newDuration) {
          updatedKeyframes.push(kf);
        }
      }

      updatedKeyframes.sort((a, b) => a.time_offset_ms - b.time_offset_ms);
      clip.keyframes = updatedKeyframes;
    }

    // Freeze Frame adjustment
    if (clip.is_frozen) {
      const fAt = clip.freeze_at_ms ?? 0;
      const fDur = clip.freeze_duration_ms ?? 2000;
      if (newDuration <= fAt) {
        clip.is_frozen = false;
        clip.freeze_at_ms = undefined;
        clip.freeze_duration_ms = undefined;
      } else if (newDuration < fAt + fDur) {
        clip.freeze_duration_ms = newDuration - fAt;
      }
    }

    // Frame Hold adjustment
    if (clip.is_frame_hold) {
      const hAt = clip.frame_hold_at_ms ?? 0;
      const hDur = clip.frame_hold_duration_ms ?? 2000;
      if (newDuration <= hAt) {
        clip.is_frame_hold = false;
        clip.frame_hold_at_ms = undefined;
        clip.frame_hold_duration_ms = undefined;
      } else if (newDuration < hAt + hDur) {
        clip.frame_hold_duration_ms = newDuration - hAt;
      }
    }

    // Transitions clamping
    if (clip.transition_in) {
      if (newDuration < (clip.transition_in.duration_ms || 1000)) {
        clip.transition_in.duration_ms = Math.max(50, newDuration);
      }
      if (newDuration < 100) clip.transition_in = undefined;
    }
    if (clip.transition_out) {
      if (newDuration < (clip.transition_out.duration_ms || 1000)) {
        clip.transition_out.duration_ms = Math.max(50, newDuration);
      }
      if (newDuration < 100) clip.transition_out = undefined;
    }

    clip.fade_in_ms = Math.min(clip.fade_in_ms || 0, newDuration);
    clip.fade_out_ms = Math.min(clip.fade_out_ms || 0, newDuration);

    clip.duration_ms = newDuration;
    clip.source_in_ms = newSourceIn;
    clip.source_out_ms = newSourceOut;

    return { success: true, deltaDur: clip.duration_ms - origDuration, origEnd };
  }
}

// Phase 48: Trim preview snapshot for cancel/revert & tracking
let trimInitialTimelineSnapshot: TimelineState | null = null;
let trimInitialClipParams: {
  tool: TrimToolType;
  clipId: string;
  edge?: 'left' | 'right';
  predClipId?: string;
  succClipId?: string;
  outgoingInitialFrameMs: number;
  incomingInitialFrameMs: number;
} | null = null;

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  timeline: null,
  breadcrumbStack: [],
  playheadMs: 0,
  isPlaying: false,
  isLooping: false,
  zoomLevel: 25, // 25 pixels per second default
  selectedClipId: null,
  selectedTrackId: null,
  selectedGap: null,
  setSelectedGap: (gap) => set({ selectedGap: gap }),
  getTrackGaps: (trackId: string) => {
    const { timeline } = get();
    if (!timeline) return [];
    const track = timeline.tracks.find((t) => t.id === trackId);
    if (!track) return [];
    return calculateTrackGaps(track);
  },
  deleteGap: (trackId: string, startMs: number, rippleScope: 'track' | 'all' = 'track') => {
    const state = get();
    if (!state.timeline) return false;
    const track = state.timeline.tracks.find((t) => t.id === trackId);
    if (!track || track.is_locked) return false;

    const gaps = calculateTrackGaps(track);
    const gap = gaps.find((g) => Math.abs(g.start_time_ms - startMs) <= 5 || (g.start_time_ms <= startMs && startMs < g.end_time_ms));
    if (!gap || gap.duration_ms <= 0) return false;

    const gapStart = gap.start_time_ms;
    const gapDuration = gap.duration_ms;

    if (rippleScope === 'all') {
      const anyLocked = state.timeline.tracks.some((t) => t.is_locked && t.clips.some((c) => c.start_time_ms >= gapStart - 5));
      if (anyLocked) return false;
    }

    let modified = false;
    set(
      produce((draft: TimelineStore) => {
        if (!draft.timeline) return;
        const targetTracks = rippleScope === 'all'
          ? draft.timeline.tracks.filter((t) => !t.is_locked)
          : draft.timeline.tracks.filter((t) => t.id === trackId);

        for (const t of targetTracks) {
          for (const c of t.clips) {
            if (c.start_time_ms >= gapStart - 5) {
              c.start_time_ms = Math.max(0, c.start_time_ms - gapDuration);
              modified = true;
            }
          }
          t.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        // Shift sequence markers if rippleScope === 'all'
        if (rippleScope === 'all' && Array.isArray(draft.timeline.markers)) {
          for (const m of draft.timeline.markers) {
            if (m.time_ms >= gapStart - 5) {
              m.time_ms = Math.max(0, m.time_ms - gapDuration);
            }
          }
        }

        if (draft.selectedGap && draft.selectedGap.trackId === trackId && Math.abs(draft.selectedGap.startMs - gapStart) <= 5) {
          draft.selectedGap = null;
        }

        recalcDuration(draft);
      })
    );

    if (modified) {
      get().pushHistory();
      get().scheduleAutoSave();
      return true;
    }
    return false;
  },

  closeGapAtPlayhead: (trackId?: string) => {
    const state = get();
    if (!state.timeline) return false;
    const playhead = state.playheadMs;
    const targetTrackId = trackId || state.selectedTrackId || (state.selectedClipId ? state.timeline.tracks.find(t => t.clips.some(c => c.id === state.selectedClipId))?.id : undefined);

    if (targetTrackId) {
      return get().deleteGap(targetTrackId, playhead);
    }

    for (const track of state.timeline.tracks) {
      if (track.is_locked) continue;
      const gaps = calculateTrackGaps(track);
      const gap = gaps.find((g) => Math.abs(g.start_time_ms - playhead) <= 5 || (g.start_time_ms <= playhead && playhead < g.end_time_ms));
      if (gap) {
        return get().deleteGap(track.id, gap.start_time_ms);
      }
    }
    return false;
  },

  snapEnabled: true,
  rippleEnabled: false,
  activeTimelineTool: 'select',
  setActiveTimelineTool: (tool: TimelineTool) => set({ activeTimelineTool: tool }),
  isSaving: false,
  saveStatus: 'idle',
  lastSavedAt: null,
  _autoSaveTimer: null,
  clipboardClip: null,
  clipboardClips: null,
  targetVideoTrackId: null,
  targetAudioTrackId: null,

  // Phase 46: Source Monitor & Media Selection
  sourceAsset: null,
  sourcePlayheadMs: 0,
  sourceInPointMs: null,
  sourceOutPointMs: null,
  sourceIsPlaying: false,
  activeMonitorFocus: 'program',
  monitorLayout: 'dual',
  highlightedAssetId: null,

  // Phase 48: Dynamic 2-Up Trim Preview & Precision Cut Monitor
  isTrimPreviewActive: false,
  trimPreviewData: null,

  // Phase 49: Replace / Fit-to-Fill & 4-Point Editing Engine
  fourPointConflict: null,
  openFourPointModal: (params: FourPointConflictData) => set({ fourPointConflict: params }),
  closeFourPointModal: () => set({ fourPointConflict: null }),

  // Phase 50: Timeline Navigation & Precision Shuttle Engine
  shuttleRate: 0,
  isTimecodeModalOpen: false,

  history: [],
  historyIndex: -1,

  revisions: [],
  isLoadingRevisions: false,

  fetchRevisions: async (projectId: string) => {
    set({ isLoadingRevisions: true });
    try {
      const res = await api.get<TimelineRevisionMeta[]>(`/timelines/projects/${projectId}/revisions`);
      const sorted = [...(res.data || [])].sort((a, b) => b.revision_number - a.revision_number);
      set({ revisions: sorted, isLoadingRevisions: false });
      return sorted;
    } catch (e) {
      console.error('Failed to fetch revisions', e);
      set({ isLoadingRevisions: false });
      return [];
    }
  },

  restoreRevision: async (revisionId: string) => {
    const { timeline } = get();
    await api.post(`/timelines/revisions/${revisionId}/restore`);
    if (timeline?.project_id) {
      await get().fetchTimeline(timeline.project_id);
      await get().fetchRevisions(timeline.project_id);
    }
  },

  fetchTimeline: async (projectId: string) => {
    try {
      const res = await api.get<TimelineState>(`/projects/${projectId}/timeline`);
      const timeline = res.data;
      set({
        timeline,
        targetVideoTrackId: (timeline as any).target_video_track_id !== undefined ? (timeline as any).target_video_track_id : get().targetVideoTrackId,
        targetAudioTrackId: (timeline as any).target_audio_track_id !== undefined ? (timeline as any).target_audio_track_id : get().targetAudioTrackId,
        history: [JSON.parse(JSON.stringify(timeline))],
        historyIndex: 0,
        saveStatus: 'saved',
        lastSavedAt: new Date(),
      });
    } catch (e) {
      console.error('Failed to fetch timeline', e);
    }
  },

  saveTimeline: async () => {
    const { timeline, targetVideoTrackId, targetAudioTrackId } = get();
    if (!timeline) return;

    set({ isSaving: true, saveStatus: 'saving' });
    try {
      await api.put(`/projects/${timeline.project_id}/timeline`, {
        name: timeline.name,
        duration_ms: timeline.duration_ms,
        tracks: timeline.tracks,
        markers: timeline.markers || [],
        in_point_ms: timeline.in_point_ms ?? null,
        out_point_ms: timeline.out_point_ms ?? null,
        target_video_track_id: targetVideoTrackId ?? null,
        target_audio_track_id: targetAudioTrackId ?? null,
      });
      set({ isSaving: false, saveStatus: 'saved', lastSavedAt: new Date() });
    } catch (e) {
      console.error('Failed to save timeline', e);
      set({ isSaving: false, saveStatus: 'error' });
    }
  },

  scheduleAutoSave: () => {
    const { _autoSaveTimer } = get();
    if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
    set({ saveStatus: 'idle' });
    const timer = setTimeout(() => {
      get().saveTimeline();
    }, 2000);
    set({ _autoSaveTimer: timer });
  },

  setPlayhead: (ms: number) => {
    const { timeline } = get();
    const max = timeline?.duration_ms ?? Infinity;
    set({ playheadMs: Math.max(0, Math.min(ms, max)) });
  },

  togglePlay: () => {
    set((state) => ({
      isPlaying: !state.isPlaying,
      sourceIsPlaying: !state.isPlaying ? false : state.sourceIsPlaying,
    }));
  },

  toggleLoop: () => {
    set((state) => ({ isLooping: !state.isLooping }));
  },

  stop: () => {
    set({ isPlaying: false, playheadMs: 0 });
  },

  setZoomLevel: (zoom: number) => {
    set({ zoomLevel: Math.max(5, Math.min(500, zoom)) });
  },

  selectClip: (clipId: string | null) => {
    set({ selectedClipId: clipId });
    if (clipId) {
      const sel = useSelectionStore.getState();
      if (!sel.selectedClipIds.has(clipId) || sel.selectedClipIds.size > 1) {
        sel.selectClip(clipId, false);
      }
    } else {
      useSelectionStore.getState().clearSelection();
    }
  },

  selectTrack: (trackId: string | null) => {
    set({ selectedTrackId: trackId });
  },

  toggleSnap: () => {
    set((state) => ({ snapEnabled: !state.snapEnabled }));
  },

  toggleRipple: () => {
    set((state) => ({ rippleEnabled: !state.rippleEnabled }));
  },

  toggleTrackMute: (trackId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.is_muted = !track.is_muted;
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  toggleTrackSolo: (trackId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.is_solo = !track.is_solo;
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  toggleTrackLock: (trackId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.is_locked = !track.is_locked;
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  toggleTrackVisibility: (trackId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.is_visible = !track.is_visible;
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  setTrackVolume: (trackId: string, volumeDb: number, skipHistory = false) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.volume_db = Math.max(-60, Math.min(12, volumeDb));
      })
    );
    if (!skipHistory) {
      get().pushHistory();
    }
    get().scheduleAutoSave();
  },

  setTrackPan: (trackId: string, pan: number, skipHistory = false) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.pan = Math.max(-1.0, Math.min(1.0, pan));
      })
    );
    if (!skipHistory) {
      get().pushHistory();
    }
    get().scheduleAutoSave();
  },

  applyAudioDucking: (dialogueTrackId: string, musicTrackId: string, duckingDb = -9.0) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const diagTrack = state.timeline.tracks.find((t) => t.id === dialogueTrackId);
        const musicTrack = state.timeline.tracks.find((t) => t.id === musicTrackId);
        if (!diagTrack || !musicTrack) return;

        for (const mClip of musicTrack.clips) {
          const mStart = mClip.start_time_ms;
          const mEnd = mStart + mClip.duration_ms;
          const hasOverlap = diagTrack.clips.some((dClip) => {
            const dStart = dClip.start_time_ms;
            const dEnd = dStart + dClip.duration_ms;
            return dStart < mEnd && dEnd > mStart;
          });

          if (hasOverlap) {
            if (!mClip.metadata_info) mClip.metadata_info = {};
            if (mClip.metadata_info.original_volume_db === undefined) {
              mClip.metadata_info.original_volume_db = mClip.volume_db;
            }
            mClip.volume_db = Math.max(-60, mClip.volume_db + duckingDb);
            mClip.metadata_info.is_ducked = true;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  setTrackHeight: (trackId: string, heightPx: number) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.height_px = Math.max(24, Math.min(120, heightPx));
      })
    );
  },

  addTrack: (trackType: TrackType = 'video', trackRole?: TrackRole, name?: string): string | null => {
    let createdTrackId: string | null = null;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const count = state.timeline.tracks.length;
        const sameTypeCount = state.timeline.tracks.filter((t) => t.track_type === trackType).length;
        const defaultRole: TrackRole = trackRole || (trackType === 'audio' ? 'music' : trackType === 'subtitle' ? 'captions' : 'video');
        const defaultPrefix = trackType === 'video' ? 'V' : trackType === 'audio' ? 'A' : 'T';
        const trackName = name?.trim() || `${defaultPrefix}${sameTypeCount + 1}`;
        createdTrackId = crypto.randomUUID();
        const newTrack: Track = {
          id: createdTrackId,
          timeline_id: state.timeline.id,
          track_type: trackType,
          track_role: defaultRole,
          order_index: count,
          name: trackName,
          is_muted: false,
          is_locked: false,
          is_visible: true,
          is_solo: false,
          volume_db: 0.0,
          pan: 0.0,
          height_px: trackType === 'audio' ? 48 : 56,
          color: trackType === 'audio' ? '#15803d' : '#2563eb',
          clips: [],
        };
        state.timeline.tracks.push(newTrack);
      })
    );
    if (createdTrackId) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return createdTrackId;
  },

  deleteTrack: (trackId: string): boolean => {
    let success = false;
    const selStore = useSelectionStore.getState();
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline || state.timeline.tracks.length === 0) return;
        const idx = state.timeline.tracks.findIndex((t) => t.id === trackId);
        if (idx === -1) return;

        const targetTrack = state.timeline.tracks[idx];
        const clipIdsOnTrack = new Set(targetTrack.clips.map((c) => c.id));

        // Unselect any clips on this track
        for (const cId of clipIdsOnTrack) {
          selStore.selectedClipIds.delete(cId);
        }
        if (state.selectedClipId && clipIdsOnTrack.has(state.selectedClipId)) {
          state.selectedClipId = null;
        }

        // Unselect track if currently selected
        if (state.selectedTrackId === trackId) {
          state.selectedTrackId = null;
        }

        // Remove track
        state.timeline.tracks.splice(idx, 1);

        // Re-index remaining tracks' order_index
        state.timeline.tracks.forEach((t, i) => {
          t.order_index = i;
        });

        // Clean dangling transitions pointing to clips on deleted track
        for (const t of state.timeline.tracks) {
          for (const c of t.clips) {
            if (c.transition_out?.to_clip_id && clipIdsOnTrack.has(c.transition_out.to_clip_id)) {
              c.transition_out = undefined;
            }
            if (c.transition_in?.from_clip_id && clipIdsOnTrack.has(c.transition_in.from_clip_id)) {
              c.transition_in = undefined;
            }
          }
        }

        recalcDuration(state);
        success = true;
      })
    );

    if (success) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return success;
  },

  renameTrack: (trackId: string, newName: string): boolean => {
    let success = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (!track) return;
        if (track.name !== newName) {
          track.name = newName;
          success = true;
        }
      })
    );
    if (success) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return success;
  },

  reorderTrack: (trackId: string, direction: 'up' | 'down'): boolean => {
    let success = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const idx = state.timeline.tracks.findIndex((t) => t.id === trackId);
        if (idx === -1) return;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= state.timeline.tracks.length) return;

        const [movedTrack] = state.timeline.tracks.splice(idx, 1);
        state.timeline.tracks.splice(targetIdx, 0, movedTrack);

        state.timeline.tracks.forEach((t, i) => {
          t.order_index = i;
        });
        success = true;
      })
    );
    if (success) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return success;
  },

  moveTrackIndex: (fromIndex: number, toIndex: number): boolean => {
    let success = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const tracks = state.timeline.tracks;
        if (
          fromIndex < 0 ||
          fromIndex >= tracks.length ||
          toIndex < 0 ||
          toIndex >= tracks.length ||
          fromIndex === toIndex
        ) {
          return;
        }
        const [moved] = tracks.splice(fromIndex, 1);
        tracks.splice(toIndex, 0, moved);
        tracks.forEach((t, i) => {
          t.order_index = i;
        });
        success = true;
      })
    );
    if (success) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return success;
  },

  updateClip: (clipId: string, updater: (clip: Clip) => void, skipHistory = false) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            updater(clip);
            break;
          }
        }
      })
    );
    if (!skipHistory) {
      get().pushHistory();
    }
    get().scheduleAutoSave();
  },

  addClipToTrack: (trackId: string, clipData: Partial<Clip>) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (!track || track.is_locked) return;

        const startMs = clipData.start_time_ms ?? state.playheadMs;
        const durationMs = clipData.duration_ms ?? 4000;

        const newClip: Clip = {
          id: clipData.id || crypto.randomUUID(),
          track_id: trackId,
          asset_id: clipData.asset_id,
          scene_id: clipData.scene_id,
          name: clipData.name || 'New Clip',
          clip_type: clipData.clip_type || 'media',
          start_time_ms: startMs,
          duration_ms: durationMs,
          source_in_ms: clipData.source_in_ms || 0,
          source_out_ms: clipData.source_out_ms || durationMs,
          speed_factor: 1.0,
          is_reversed: false,
          is_frozen: false,
          opacity: clipData.opacity ?? 1.0,
          blend_mode: clipData.blend_mode || 'normal',
          position_x: clipData.position_x ?? 0.5,
          position_y: clipData.position_y ?? 0.5,
          scale_x: clipData.scale_x ?? 1.0,
          scale_y: clipData.scale_y ?? 1.0,
          rotation: clipData.rotation ?? 0.0,
          anchor_x: clipData.anchor_x ?? 0.5,
          anchor_y: clipData.anchor_y ?? 0.5,
          crop_left: 0.0,
          crop_right: 0.0,
          crop_top: 0.0,
          crop_bottom: 0.0,
          volume_db: clipData.volume_db ?? 0.0,
          fade_in_ms: clipData.fade_in_ms ?? 0,
          fade_out_ms: clipData.fade_out_ms ?? 0,
          metadata_info: clipData.metadata_info || {},
          effects: clipData.effects || [],
          keyframes: clipData.keyframes || [],
        };

        track.clips.push(newClip);
        recalcDuration(state);
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  moveClips: (clipIds: string[], deltaMs: number, skipHistory = false) => {
    if (clipIds.length === 0 || deltaMs === 0) return;
    let modified = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const targetClips: Clip[] = [];
        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          for (const c of track.clips) {
            if (clipIds.includes(c.id)) {
              targetClips.push(c);
            }
          }
        }
        if (targetClips.length === 0) return;

        const minStart = Math.min(...targetClips.map((c) => c.start_time_ms));
        const effectiveDelta = Math.max(-minStart, Math.round(deltaMs));
        if (effectiveDelta === 0) return;

        for (const c of targetClips) {
          c.start_time_ms = Math.max(0, c.start_time_ms + effectiveDelta);
        }

        for (const track of state.timeline.tracks) {
          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }
        recalcDuration(state);
        modified = true;
      })
    );

    if (modified) {
      if (!skipHistory) {
        get().pushHistory();
      }
      get().scheduleAutoSave();
    }
  },

  batchUpdateClips: (updater: (state: TimelineStore) => void, skipHistory = false) => {
    set(
      produce((state: TimelineStore) => {
        updater(state);
        recalcDuration(state);
      })
    );
    if (!skipHistory) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
  },

  deleteClip: (clipId?: string) => {
    const selStore = useSelectionStore.getState();
    const targetClipId = clipId || get().selectedClipId;
    if (selStore.selectedClipIds.size > 1 && (!clipId || selStore.selectedClipIds.has(clipId))) {
      get().deleteSelectedClips();
      return;
    }
    if (!targetClipId) return;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const idx = track.clips.findIndex((c) => c.id === targetClipId);
          if (idx !== -1) {
            if (track.is_locked) return;
            track.clips.splice(idx, 1);
            break;
          }
        }
        for (const t of state.timeline.tracks) {
          for (const c of t.clips) {
            if (c.transition_out?.to_clip_id === targetClipId) c.transition_out = undefined;
            if (c.transition_in?.from_clip_id === targetClipId) c.transition_in = undefined;
            if (c.linked_clip_id === targetClipId) delete c.linked_clip_id;
          }
        }
        if (state.selectedClipId === targetClipId) {
          state.selectedClipId = null;
        }
        recalcDuration(state);
      })
    );
    selStore.clearSelection();
    get().pushHistory();
    get().scheduleAutoSave();
  },

  deleteSelectedClips: (clipIds?: string[]) => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length === 0) return;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          track.clips = track.clips.filter((c) => !targetIds.includes(c.id));
        }

        // Clean dangling transitions and linked clips across all tracks
        for (const track of state.timeline.tracks) {
          for (const c of track.clips) {
            if (c.transition_out?.to_clip_id && targetIds.includes(c.transition_out.to_clip_id)) {
              c.transition_out = undefined;
            }
            if (c.transition_in?.from_clip_id && targetIds.includes(c.transition_in.from_clip_id)) {
              c.transition_in = undefined;
            }
            if (c.linked_clip_id && targetIds.includes(c.linked_clip_id)) {
              delete c.linked_clip_id;
            }
          }
        }

        if (state.selectedClipId && targetIds.includes(state.selectedClipId)) {
          state.selectedClipId = null;
        }
        recalcDuration(state);
      })
    );

    selStore.clearSelection();
    get().pushHistory();
    get().scheduleAutoSave();
  },

  duplicateClip: (clipId?: string) => {
    const selStore = useSelectionStore.getState();
    const targetClipId = clipId || get().selectedClipId;
    if (selStore.selectedClipIds.size > 1 && (!clipId || selStore.selectedClipIds.has(clipId))) {
      const res = get().duplicateSelectedClips();
      return res ? res[0] : null;
    }
    if (!targetClipId) return null;
    let duplicatedClipId: string | null = null;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clipIndex = track.clips.findIndex((c) => c.id === targetClipId);
          if (clipIndex !== -1) {
            if (track.is_locked) return;
            const clip = track.clips[clipIndex];
            const newId = crypto.randomUUID();
            duplicatedClipId = newId;
            const insertTimeMs = clip.start_time_ms + clip.duration_ms;

            const duplicate: Clip = cloneClipDeepWithNewIds(clip, 0);
            duplicate.id = newId;
            duplicate.start_time_ms = insertTimeMs;

            // Shift any subsequent clips on this track starting at or after insertTimeMs
            for (const otherClip of track.clips) {
              if (otherClip.id !== clip.id && otherClip.start_time_ms >= insertTimeMs) {
                otherClip.start_time_ms += duplicate.duration_ms;
              }
            }

            track.clips.push(duplicate);
            track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
            state.selectedClipId = newId;
            recalcDuration(state);
            break;
          }
        }
      })
    );
    if (duplicatedClipId) {
      selStore.selectClip(duplicatedClipId, false);
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return duplicatedClipId;
  },

  duplicateSelectedClips: (clipIds?: string[]) => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length === 0) return null;
    if (targetIds.length === 1) {
      const singleId = get().duplicateClip(targetIds[0]);
      return singleId ? [singleId] : null;
    }

    const { timeline } = get();
    if (!timeline) return null;

    const clipsToDuplicate: { track: Track; clip: Clip }[] = [];
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (targetIds.includes(clip.id)) {
          clipsToDuplicate.push({ track, clip });
        }
      }
    }
    if (clipsToDuplicate.length === 0) return null;

    const minStart = Math.min(...clipsToDuplicate.map(({ clip }) => clip.start_time_ms));
    const maxEnd = Math.max(...clipsToDuplicate.map(({ clip }) => clip.start_time_ms + clip.duration_ms));
    const insertBaseMs = maxEnd;

    const newClipIds: string[] = [];
    const idMap: Record<string, string> = {};
    const groupMap: Record<string, string> = {};

    for (const { clip } of clipsToDuplicate) {
      const newId = crypto.randomUUID();
      idMap[clip.id] = newId;
      newClipIds.push(newId);
    }

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          const trackDupes = clipsToDuplicate.filter((item) => item.track.id === track.id);
          if (trackDupes.length === 0) continue;

          for (const { clip } of trackDupes) {
            const newId = idMap[clip.id];
            const relOffset = clip.start_time_ms - minStart;
            const newStart = insertBaseMs + relOffset;

            const dupClip: Clip = cloneClipDeepWithNewIds(clip, 0);
            dupClip.id = newId;
            dupClip.start_time_ms = newStart;

            if (dupClip.transition_in) {
              const fromId = dupClip.transition_in.from_clip_id;
              if (fromId && idMap[fromId]) {
                dupClip.transition_in.from_clip_id = idMap[fromId];
                dupClip.transition_in.to_clip_id = newId;
              } else {
                dupClip.transition_in = undefined;
              }
            }
            if (dupClip.transition_out) {
              const toId = dupClip.transition_out.to_clip_id;
              if (toId && idMap[toId]) {
                dupClip.transition_out.to_clip_id = idMap[toId];
                dupClip.transition_out.from_clip_id = newId;
              } else {
                dupClip.transition_out = undefined;
              }
            }

            // Phase 42: Grouping & Linking duplicate coordination
            if (clip.group_id) {
              if (!groupMap[clip.group_id]) groupMap[clip.group_id] = crypto.randomUUID();
              dupClip.group_id = groupMap[clip.group_id];
            } else {
              delete dupClip.group_id;
            }
            if (clip.linked_clip_id && idMap[clip.linked_clip_id]) {
              dupClip.linked_clip_id = idMap[clip.linked_clip_id];
            } else {
              delete dupClip.linked_clip_id;
            }

            track.clips.push(dupClip);
          }

          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        state.selectedClipId = newClipIds[0] ?? null;
        recalcDuration(state);
      })
    );

    selStore.selectClips(newClipIds);
    get().pushHistory();
    get().scheduleAutoSave();
    return newClipIds;
  },

  copyClip: (clipId?: string) => {
    const selStore = useSelectionStore.getState();
    const targetClipId = clipId || get().selectedClipId;
    if (selStore.selectedClipIds.size > 1 && (!clipId || selStore.selectedClipIds.has(clipId))) {
      return get().copySelectedClips();
    }
    if (!targetClipId) return false;
    const { timeline } = get();
    if (!timeline) return false;
    for (const track of timeline.tracks) {
      const clip = track.clips.find((c) => c.id === targetClipId);
      if (clip) {
        const cloned = JSON.parse(JSON.stringify(clip));
        set({ clipboardClip: cloned, clipboardClips: [cloned] });
        return true;
      }
    }
    return false;
  },

  copySelectedClips: (clipIds?: string[]) => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length === 0) return false;
    const { timeline } = get();
    if (!timeline) return false;

    const copied: Clip[] = [];
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (targetIds.includes(clip.id)) {
          copied.push(JSON.parse(JSON.stringify(clip)));
        }
      }
    }
    if (copied.length === 0) return false;

    set({
      clipboardClips: copied,
      clipboardClip: copied[0] || null,
    });
    return true;
  },

  pasteClip: (targetTrackId?: string, targetTimeMs?: number) => {
    const { clipboardClips } = get();
    if (clipboardClips && clipboardClips.length > 1) {
      const res = get().pasteSelectedClips(targetTimeMs);
      return res ? res[0] : null;
    }

    const { clipboardClip, timeline, playheadMs, selectedTrackId } = get();
    if (!clipboardClip || !timeline) return null;

    let pastedClipId: string | null = null;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        let destTrack = state.timeline.tracks.find((t) => t.id === targetTrackId);
        if (!destTrack && selectedTrackId) {
          destTrack = state.timeline.tracks.find((t) => t.id === selectedTrackId);
        }
        if (!destTrack) {
          destTrack = state.timeline.tracks.find((t) => t.id === clipboardClip.track_id);
        }
        if (!destTrack) {
          destTrack = state.timeline.tracks.find((t) => t.track_type === 'video');
        }
        if (!destTrack && state.timeline.tracks.length > 0) {
          destTrack = state.timeline.tracks[0];
        }
        if (!destTrack || destTrack.is_locked) return;

        const newId = crypto.randomUUID();
        pastedClipId = newId;
        const insertTimeMs = targetTimeMs !== undefined ? Math.max(0, targetTimeMs) : Math.max(0, playheadMs);

        const pastedClip: Clip = cloneClipDeepWithNewIds(clipboardClip, 0);
        pastedClip.id = newId;
        pastedClip.track_id = destTrack.id;
        pastedClip.start_time_ms = insertTimeMs;

        for (const otherClip of destTrack.clips) {
          if (otherClip.start_time_ms >= insertTimeMs) {
            otherClip.start_time_ms += pastedClip.duration_ms;
          }
        }

        destTrack.clips.push(pastedClip);
        destTrack.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        state.selectedClipId = newId;
        recalcDuration(state);
      })
    );

    if (pastedClipId) {
      useSelectionStore.getState().selectClip(pastedClipId, false);
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return pastedClipId;
  },

  pasteSelectedClips: (targetTimeMs?: number) => {
    const { clipboardClips, clipboardClip, timeline, playheadMs } = get();
    const sourceClips = clipboardClips && clipboardClips.length > 0
      ? clipboardClips
      : clipboardClip
        ? [clipboardClip]
        : null;

    if (!sourceClips || sourceClips.length === 0 || !timeline) return null;

    const baseTimeMs = targetTimeMs !== undefined ? Math.max(0, targetTimeMs) : Math.max(0, playheadMs);
    const minStart = Math.min(...sourceClips.map((c) => c.start_time_ms));

    const newClipIds: string[] = [];
    const idMap: Record<string, string> = {};
    for (const clip of sourceClips) {
      const newId = crypto.randomUUID();
      idMap[clip.id] = newId;
      newClipIds.push(newId);
    }

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        for (const clip of sourceClips) {
          const newId = idMap[clip.id];
          const relOffset = clip.start_time_ms - minStart;
          const newStart = baseTimeMs + relOffset;

          let destTrack = state.timeline.tracks.find((t) => t.id === clip.track_id);
          if (!destTrack || destTrack.is_locked) {
            destTrack = state.timeline.tracks.find((t) => t.track_type === 'video' && !t.is_locked);
          }
          if (!destTrack || destTrack.is_locked) {
            destTrack = state.timeline.tracks.find((t) => !t.is_locked);
          }
          if (!destTrack || destTrack.is_locked) continue;

          const pasted: Clip = cloneClipDeepWithNewIds(clip, 0);
          pasted.id = newId;
          pasted.track_id = destTrack.id;
          pasted.start_time_ms = newStart;

          if (pasted.transition_in) {
            const fromId = pasted.transition_in.from_clip_id;
            if (fromId && idMap[fromId]) {
              pasted.transition_in.from_clip_id = idMap[fromId];
              pasted.transition_in.to_clip_id = newId;
            } else {
              pasted.transition_in = undefined;
            }
          }
          if (pasted.transition_out) {
            const toId = pasted.transition_out.to_clip_id;
            if (toId && idMap[toId]) {
              pasted.transition_out.to_clip_id = idMap[toId];
              pasted.transition_out.from_clip_id = newId;
            } else {
              pasted.transition_out = undefined;
            }
          }

          destTrack.clips.push(pasted);
          destTrack.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        state.selectedClipId = newClipIds[0] ?? null;
        recalcDuration(state);
      })
    );

    useSelectionStore.getState().selectClips(newClipIds);
    get().pushHistory();
    get().scheduleAutoSave();
    return newClipIds;
  },

  // Compound Clips / Nested Timeline (Phase 35)
  createCompoundClip: (clipIds?: string[], name?: string) => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length === 0) return null;
    const { timeline } = get();
    if (!timeline) return null;

    const clipsToCompound: { track: Track; clip: Clip }[] = [];
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (targetIds.includes(clip.id)) {
          clipsToCompound.push({ track, clip });
        }
      }
    }

    if (clipsToCompound.length === 0) return null;

    const minStart = Math.min(...clipsToCompound.map(({ clip }) => clip.start_time_ms));
    const maxEnd = Math.max(...clipsToCompound.map(({ clip }) => clip.start_time_ms + clip.duration_ms));
    const compoundDuration = Math.max(1, maxEnd - minStart);

    // Primary track determination
    const primaryId = selStore.primaryClipId;
    const primaryItem = clipsToCompound.find(({ clip }) => clip.id === primaryId) || clipsToCompound[0];
    const destTrackId = primaryItem.track.id;

    // Build nested tracks preserving structure and track assignments
    const nestedTracks: Track[] = [];
    for (const track of timeline.tracks) {
      const includedClips = clipsToCompound
        .filter((item) => item.track.id === track.id)
        .map(({ clip }) => ({
          ...JSON.parse(JSON.stringify(clip)),
          start_time_ms: clip.start_time_ms - minStart, // normalized offset (>= 0)
        }))
        .sort((a, b) => a.start_time_ms - b.start_time_ms);

      if (includedClips.length > 0) {
        const nestedTrackId = crypto.randomUUID();
        nestedTracks.push({
          id: nestedTrackId,
          track_type: track.track_type,
          track_role: track.track_role,
          order_index: nestedTracks.length,
          name: track.name,
          is_muted: track.is_muted,
          is_locked: track.is_locked,
          is_visible: track.is_visible,
          is_solo: track.is_solo,
          volume_db: track.volume_db,
          pan: track.pan,
          height_px: track.height_px,
          color: track.color,
          clips: includedClips.map((c) => ({ ...c, track_id: nestedTrackId })),
        });
      }
    }

    const compoundClipId = crypto.randomUUID();
    const existingCompoundCount = timeline.tracks
      .flatMap((t) => t.clips)
      .filter((c) => c.is_compound).length;
    const compoundName = name || `Compound Clip ${existingCompoundCount + 1}`;

    const compoundClip: Clip = {
      id: compoundClipId,
      track_id: destTrackId,
      name: compoundName,
      clip_type: 'media',
      start_time_ms: minStart,
      duration_ms: compoundDuration,
      source_in_ms: 0,
      source_out_ms: compoundDuration,
      speed_factor: 1.0,
      is_reversed: false,
      is_frozen: false,
      opacity: 1.0,
      blend_mode: 'normal',
      position_x: 0.5,
      position_y: 0.5,
      scale_x: 1.0,
      scale_y: 1.0,
      rotation: 0.0,
      anchor_x: 0.5,
      anchor_y: 0.5,
      crop_left: 0.0,
      crop_right: 0.0,
      crop_top: 0.0,
      crop_bottom: 0.0,
      volume_db: 0.0,
      fade_in_ms: 0,
      fade_out_ms: 0,
      effects: [],
      keyframes: [],
      is_compound: true,
      nested_tracks: nestedTracks,
      metadata_info: {
        is_compound: true,
        original_clip_count: targetIds.length,
      },
    };

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        // Remove compacted clips from parent tracks
        for (const track of state.timeline.tracks) {
          track.clips = track.clips.filter((c) => !targetIds.includes(c.id));
        }

        // Insert compound clip into destTrack
        let targetTrack = state.timeline.tracks.find((t) => t.id === destTrackId);
        if (!targetTrack && state.timeline.tracks.length > 0) {
          targetTrack = state.timeline.tracks[0];
          compoundClip.track_id = targetTrack.id;
        }
        if (targetTrack) {
          targetTrack.clips.push(compoundClip);
          targetTrack.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        // Clean dangling transitions
        for (const track of state.timeline.tracks) {
          for (const c of track.clips) {
            if (c.transition_out?.to_clip_id && targetIds.includes(c.transition_out.to_clip_id)) {
              c.transition_out = undefined;
            }
            if (c.transition_in?.from_clip_id && targetIds.includes(c.transition_in.from_clip_id)) {
              c.transition_in = undefined;
            }
          }
        }

        state.selectedClipId = compoundClipId;
        recalcDuration(state);
      })
    );

    selStore.selectClip(compoundClipId, false);
    get().pushHistory();
    get().scheduleAutoSave();
    return compoundClipId;
  },

  openCompoundClip: (clipId: string) => {
    const { timeline, playheadMs, selectedClipId } = get();
    if (!timeline) return false;

    let compoundClip: Clip | null = null;
    for (const track of timeline.tracks) {
      const c = track.clips.find((clip) => clip.id === clipId);
      if (c) {
        compoundClip = c;
        break;
      }
    }

    if (!compoundClip || !compoundClip.is_compound || !compoundClip.nested_tracks) {
      return false;
    }

    const breadcrumbItem: BreadcrumbItem = {
      id: compoundClip.id,
      name: compoundClip.name,
      parentTimeline: JSON.parse(JSON.stringify(timeline)),
      parentPlayheadMs: playheadMs,
      parentSelectedClipId: selectedClipId,
    };

    const virtualTimeline: TimelineState = {
      id: compoundClip.id,
      project_id: timeline.project_id,
      name: compoundClip.name,
      duration_ms: compoundClip.duration_ms,
      tracks: JSON.parse(JSON.stringify(compoundClip.nested_tracks)),
    };

    set((state) => ({
      breadcrumbStack: [...state.breadcrumbStack, breadcrumbItem],
      timeline: virtualTimeline,
      selectedClipId: null,
      selectedTrackId: virtualTimeline.tracks[0]?.id || null,
      playheadMs: 0,
    }));

    useSelectionStore.getState().clearSelection();
    return true;
  },

  exitCompoundClip: () => {
    const { breadcrumbStack, timeline } = get();
    if (breadcrumbStack.length === 0 || !timeline) return;

    const lastCrumb = breadcrumbStack[breadcrumbStack.length - 1];
    const editedNestedTracks = JSON.parse(JSON.stringify(timeline.tracks));
    const parentTimeline: TimelineState = JSON.parse(JSON.stringify(lastCrumb.parentTimeline));

    // Find compound clip in parent timeline and commit edited nested tracks
    for (const track of parentTimeline.tracks) {
      const c = track.clips.find((clip) => clip.id === lastCrumb.id);
      if (c) {
        c.nested_tracks = editedNestedTracks;
        // Recompute compound duration if nested clips were edited
        let maxEnd = 0;
        for (const nt of editedNestedTracks) {
          for (const nc of nt.clips) {
            const end = nc.start_time_ms + nc.duration_ms;
            if (end > maxEnd) maxEnd = end;
          }
        }
        if (maxEnd > 0) {
          c.duration_ms = maxEnd;
          c.source_out_ms = maxEnd;
        }
        break;
      }
    }

    set((state) => ({
      timeline: parentTimeline,
      breadcrumbStack: state.breadcrumbStack.slice(0, state.breadcrumbStack.length - 1),
      selectedClipId: lastCrumb.id,
      playheadMs: lastCrumb.parentPlayheadMs ?? 0,
    }));

    useSelectionStore.getState().selectClip(lastCrumb.id, false);
    set(
      produce((state: TimelineStore) => {
        recalcDuration(state);
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  ungroupCompoundClip: (clipId?: string) => {
    const selStore = useSelectionStore.getState();
    const targetId = clipId || get().selectedClipId || Array.from(selStore.selectedClipIds)[0];
    if (!targetId) return false;

    const { timeline } = get();
    if (!timeline) return false;

    let compoundClip: Clip | null = null;
    let sourceTrack: Track | null = null;
    for (const track of timeline.tracks) {
      const c = track.clips.find((clip) => clip.id === targetId);
      if (c) {
        compoundClip = c;
        sourceTrack = track;
        break;
      }
    }

    if (!compoundClip || !compoundClip.is_compound || !compoundClip.nested_tracks || !sourceTrack) {
      return false;
    }

    const compoundStartMs = compoundClip.start_time_ms;
    const unpackedIds: string[] = [];

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        // Extract child clips from nested tracks and translate offsets
        for (const nt of compoundClip!.nested_tracks!) {
          let destTrack = state.timeline.tracks.find((t) => t.id === nt.id);
          if (!destTrack) {
            destTrack = state.timeline.tracks.find((t) => t.track_role === nt.track_role && t.track_type === nt.track_type);
          }
          if (!destTrack) {
            destTrack = state.timeline.tracks.find((t) => t.id === sourceTrack!.id) || state.timeline.tracks[0];
          }

          for (const child of nt.clips) {
            const newId = crypto.randomUUID();
            unpackedIds.push(newId);
            const unpackedClip: Clip = {
              ...JSON.parse(JSON.stringify(child)),
              id: newId,
              track_id: destTrack.id,
              start_time_ms: compoundStartMs + child.start_time_ms,
            };
            if (Array.isArray(unpackedClip.keyframes)) {
              unpackedClip.keyframes = unpackedClip.keyframes.map((kf) => ({
                ...kf,
                id: crypto.randomUUID(),
                clip_id: newId,
              }));
            }
            if (Array.isArray(unpackedClip.markers)) {
              unpackedClip.markers = unpackedClip.markers.map((m) => ({
                ...m,
                id: crypto.randomUUID(),
                clip_id: newId,
              }));
            }
            destTrack.clips.push(unpackedClip);
          }
        }

        // Remove the compound clip from parent track
        for (const track of state.timeline.tracks) {
          track.clips = track.clips.filter((c) => c.id !== targetId);
          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        state.selectedClipId = unpackedIds[0] ?? null;
        recalcDuration(state);
      })
    );

    if (unpackedIds.length > 0) {
      selStore.selectClips(unpackedIds);
    } else {
      selStore.clearSelection();
    }
    get().pushHistory();
    get().scheduleAutoSave();
    return true;
  },

  splitClipAtPlayhead: (clipId?: string) => {
    const targetClipId = clipId || get().selectedClipId;
    if (!targetClipId) return null;
    const { playheadMs } = get();
    return get().razorCutClip(targetClipId, playheadMs);
  },

  splitClipAtTime: (clipId: string, splitTimeMs: number, skipHistory = false) => {
    let resultIds: { leftId: string; rightId: string } | null = null;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clipIndex = track.clips.findIndex((c) => c.id === clipId);
          if (clipIndex === -1) continue;
          if (track.is_locked) return;
          const clip = track.clips[clipIndex];

          // Check if splitTimeMs is strictly inside the clip range (with at least 1ms threshold)
          if (
            splitTimeMs <= clip.start_time_ms ||
            splitTimeMs >= clip.start_time_ms + clip.duration_ms
          ) {
            return;
          }

          const splitOffset = splitTimeMs - clip.start_time_ms;
          const originalDuration = clip.duration_ms;
          if (splitOffset <= 0 || originalDuration - splitOffset <= 0) {
            return;
          }

          const speed = clip.speed_factor && clip.speed_factor > 0 ? clip.speed_factor : 1.0;
          const isReversed = Boolean(clip.is_reversed);
          const origSourceIn = clip.source_in_ms ?? 0;
          const origSourceOut = clip.source_out_ms > origSourceIn
            ? clip.source_out_ms
            : origSourceIn + Math.round(originalDuration * speed);
          const origTransitionIn = clip.transition_in ? { ...clip.transition_in } : undefined;
          const origTransitionOut = clip.transition_out ? { ...clip.transition_out } : undefined;

          // Keyframes partition with boundary interpolation
          const originalKeyframes: Keyframe[] = JSON.parse(JSON.stringify(clip.keyframes || []));
          const leftKeyframes: Keyframe[] = originalKeyframes.filter(
            (k) => k.time_offset_ms < splitOffset
          );

          const clip1Id = crypto.randomUUID();
          const clip2Id = crypto.randomUUID();
          resultIds = { leftId: clip1Id, rightId: clip2Id };
          const rightKeyframes: Keyframe[] = [];

          const uniqueProps = Array.from(new Set(originalKeyframes.map((k) => k.property_path)));
          for (const prop of uniqueProps) {
            const defaultVal = Number((clip as any)[prop] ?? (prop === 'volume_db' ? (clip.volume_db ?? 0) : 0));
            const splitVal = evaluateClipProperty(clip, prop, splitOffset, defaultVal);
            const roundedVal = prop === 'volume_db' ? Math.round(splitVal * 10) / 10 : Math.round(splitVal * 10000) / 10000;
            leftKeyframes.push({
              id: crypto.randomUUID(),
              clip_id: clip1Id,
              property_path: prop,
              time_offset_ms: splitOffset,
              value: roundedVal,
              interpolation: 'linear',
            });
            rightKeyframes.push({
              id: crypto.randomUUID(),
              clip_id: clip2Id,
              property_path: prop,
              time_offset_ms: 0,
              value: roundedVal,
              interpolation: 'linear',
            });
          }

          for (const kf of originalKeyframes) {
            if (kf.time_offset_ms > splitOffset) {
              rightKeyframes.push({
                ...kf,
                id: crypto.randomUUID(),
                clip_id: clip2Id,
                time_offset_ms: kf.time_offset_ms - splitOffset,
              });
            }
          }
          leftKeyframes.sort((a, b) => a.time_offset_ms - b.time_offset_ms);
          rightKeyframes.sort((a, b) => a.time_offset_ms - b.time_offset_ms);

          // Update existing left keyframes to have clip1Id
          for (const kf of leftKeyframes) {
            kf.clip_id = clip1Id;
          }

          // Source timing calculation
          const mediaDelta = Math.round(splitOffset * speed);
          let leftSourceIn = origSourceIn;
          let leftSourceOut = origSourceIn + mediaDelta;
          let rightSourceIn = origSourceIn + mediaDelta;
          let rightSourceOut = origSourceOut;

          if (isReversed) {
            leftSourceIn = Math.max(origSourceIn, origSourceOut - mediaDelta);
            leftSourceOut = origSourceOut;
            rightSourceIn = origSourceIn;
            rightSourceOut = Math.max(origSourceIn, origSourceOut - mediaDelta);
          }

          // Freeze frame partitioning
          const isFrozen = Boolean(clip.is_frozen);
          const freezeAt = clip.freeze_at_ms ?? 0;
          const freezeDur = clip.freeze_duration_ms ?? 2000;
          const freezeEnd = freezeAt + freezeDur;
          let leftIsFrozen = false;
          let leftFreezeAt: number | undefined = undefined;
          let leftFreezeDur: number | undefined = undefined;
          let rightIsFrozen = false;
          let rightFreezeAt: number | undefined = undefined;
          let rightFreezeDur: number | undefined = undefined;

          if (isFrozen) {
            if (splitOffset <= freezeAt) {
              rightIsFrozen = true;
              rightFreezeAt = freezeAt - splitOffset;
              rightFreezeDur = freezeDur;
            } else if (splitOffset >= freezeEnd) {
              leftIsFrozen = true;
              leftFreezeAt = freezeAt;
              leftFreezeDur = freezeDur;
            } else {
              // Inside freeze window: split frozen frame
              leftIsFrozen = true;
              leftFreezeAt = freezeAt;
              leftFreezeDur = splitOffset - freezeAt;
              rightIsFrozen = true;
              rightFreezeAt = 0;
              rightFreezeDur = freezeEnd - splitOffset;
            }
          }

          // Frame hold partitioning
          const isHold = Boolean(clip.is_frame_hold);
          const holdAt = clip.frame_hold_at_ms ?? 0;
          const holdDur = clip.frame_hold_duration_ms ?? 2000;
          const holdEnd = holdAt + holdDur;
          let leftIsHold = false;
          let leftHoldAt: number | undefined = undefined;
          let leftHoldDur: number | undefined = undefined;
          let rightIsHold = false;
          let rightHoldAt: number | undefined = undefined;
          let rightHoldDur: number | undefined = undefined;

          if (isHold) {
            if (splitOffset <= holdAt) {
              rightIsHold = true;
              rightHoldAt = holdAt - splitOffset;
              rightHoldDur = holdDur;
            } else if (splitOffset >= holdEnd) {
              leftIsHold = true;
              leftHoldAt = holdAt;
              leftHoldDur = holdDur;
            } else {
              // Inside hold window
              leftIsHold = true;
              leftHoldAt = holdAt;
              leftHoldDur = splitOffset - holdAt;
              rightIsHold = true;
              rightHoldAt = 0;
              rightHoldDur = holdEnd - splitOffset;
            }
          }

          // Marker partitioning
          const origMarkers = Array.isArray(clip.markers) ? clip.markers : [];
          const getMarkerTime = (m: any) => typeof m.time_ms === 'number' ? m.time_ms : ((m as any).time_offset_ms ?? 0);
          const leftMarkers = origMarkers
            .filter((m) => getMarkerTime(m) < splitOffset)
            .map((m) => ({
              ...m,
              clip_id: clip1Id,
              time_ms: getMarkerTime(m),
              ...((m as any).time_offset_ms !== undefined ? { time_offset_ms: getMarkerTime(m) } : {}),
            }));
          const rightMarkers = origMarkers
            .filter((m) => getMarkerTime(m) >= splitOffset)
            .map((m) => ({
              ...m,
              id: crypto.randomUUID(),
              clip_id: clip2Id,
              time_ms: Math.max(0, getMarkerTime(m) - splitOffset),
              ...((m as any).time_offset_ms !== undefined ? { time_offset_ms: Math.max(0, getMarkerTime(m) - splitOffset) } : {}),
            }));

          // Build Left Clip
          clip.id = clip1Id;
          clip.duration_ms = splitOffset;
          clip.source_in_ms = leftSourceIn;
          clip.source_out_ms = leftSourceOut;
          clip.keyframes = leftKeyframes;
          clip.markers = leftMarkers;
          clip.transition_in = origTransitionIn;
          clip.transition_out = undefined; // Hard cut boundary
          clip.fade_in_ms = Math.min(clip.fade_in_ms || 0, splitOffset);
          clip.fade_out_ms = 0; // Cut boundary
          clip.is_frozen = leftIsFrozen;
          clip.freeze_at_ms = leftFreezeAt;
          clip.freeze_duration_ms = leftFreezeDur;
          clip.is_frame_hold = leftIsHold;
          clip.frame_hold_at_ms = leftHoldAt;
          clip.frame_hold_duration_ms = leftHoldDur;

          // Build Right Clip
          const clip2: Clip = {
            ...JSON.parse(JSON.stringify(clip)),
            id: clip2Id,
            start_time_ms: splitTimeMs,
            duration_ms: originalDuration - splitOffset,
            source_in_ms: rightSourceIn,
            source_out_ms: rightSourceOut,
            keyframes: rightKeyframes,
            markers: rightMarkers,
            transition_in: undefined, // Hard cut boundary
            transition_out: origTransitionOut,
            fade_in_ms: 0, // Cut boundary
            fade_out_ms: Math.min(clip.fade_out_ms || 0, originalDuration - splitOffset),
            is_frozen: rightIsFrozen,
            freeze_at_ms: rightFreezeAt,
            freeze_duration_ms: rightFreezeDur,
            is_frame_hold: rightIsHold,
            frame_hold_at_ms: rightHoldAt,
            frame_hold_duration_ms: rightHoldDur,
          };

          track.clips.push(clip2);
          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
          state.selectedClipId = clip1Id;
          recalcDuration(state);
          break;
        }
      })
    );

    const finalResult = resultIds as { leftId: string; rightId: string } | null;
    if (finalResult) {
      set({ selectedClipId: finalResult.leftId });
      useSelectionStore.getState().selectClip(finalResult.leftId);
      if (!skipHistory) {
        get().pushHistory();
        get().scheduleAutoSave();
      }
    }
    return finalResult;
  },

  razorCutClip: (clipId: string, cutTimeMs: number, skipHistory = false) => {
    const { timeline } = get();
    if (!timeline) return null;

    let targetClip: Clip | null = null;
    let targetTrack: Track | null = null;
    for (const track of timeline.tracks) {
      for (const c of track.clips) {
        if (c.id === clipId) {
          targetClip = c;
          targetTrack = track;
          break;
        }
      }
    }

    if (!targetClip || !targetTrack || targetTrack.is_locked) {
      return null;
    }

    // Check if this clip has a linked partner
    if (targetClip.linked_clip_id) {
      let partnerClip: Clip | null = null;
      let partnerTrack: Track | null = null;
      for (const track of timeline.tracks) {
        for (const c of track.clips) {
          if (c.id === targetClip.linked_clip_id) {
            partnerClip = c;
            partnerTrack = track;
            break;
          }
        }
      }

      // If partner exists and partner track is NOT locked
      if (partnerClip && partnerTrack && !partnerTrack.is_locked) {
        const partnerCutTime = partnerClip.start_time_ms + (cutTimeMs - targetClip.start_time_ms);
        if (
          partnerCutTime > partnerClip.start_time_ms &&
          partnerCutTime < partnerClip.start_time_ms + partnerClip.duration_ms
        ) {
          // Symmetrical bilateral split: target and partner
          const resTarget = get().splitClipAtTime(clipId, cutTimeMs, true);
          if (!resTarget) return null;
          const resPartner = get().splitClipAtTime(partnerClip.id, partnerCutTime, true);
          if (resPartner) {
            // Cross-link: left to left, right to right
            set(
              produce((state: TimelineStore) => {
                if (!state.timeline) return;
                for (const track of state.timeline.tracks) {
                  for (const c of track.clips) {
                    if (c.id === resTarget.leftId) c.linked_clip_id = resPartner.leftId;
                    else if (c.id === resPartner.leftId) c.linked_clip_id = resTarget.leftId;
                    else if (c.id === resTarget.rightId) c.linked_clip_id = resPartner.rightId;
                    else if (c.id === resPartner.rightId) c.linked_clip_id = resTarget.rightId;
                  }
                }
              })
            );
          }
          if (!skipHistory) {
            get().pushHistory();
            get().scheduleAutoSave();
          }
          return resTarget;
        }
      }
    }

    // Single clip split
    return get().splitClipAtTime(clipId, cutTimeMs, skipHistory);
  },

  razorCutAllTracks: (cutTimeMs: number) => {
    const { timeline } = get();
    if (!timeline) return null;
    const cutsToMake: string[] = [];
    for (const track of timeline.tracks) {
      if (track.is_locked) continue;
      for (const c of track.clips) {
        if (cutTimeMs > c.start_time_ms && cutTimeMs < c.start_time_ms + c.duration_ms) {
          cutsToMake.push(c.id);
        }
      }
    }
    if (cutsToMake.length === 0) return null;

    const results: Array<{ leftId: string; rightId: string }> = [];
    for (const clipId of cutsToMake) {
      const res = get().splitClipAtTime(clipId, cutTimeMs, true);
      if (res) results.push(res);
    }

    if (results.length > 0) {
      get().pushHistory();
      get().scheduleAutoSave();
      return Object.assign(results, { cutCount: results.length });
    }
    return null;
  },

  // Phase 42: Clip Grouping & Audio-Video Link / Unlink
  getRelatedClipIds: (clipId: string): string[] => {
    const { timeline } = get();
    if (!timeline) return [clipId];

    const allClips: Clip[] = [];
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        allClips.push(clip);
      }
    }

    const targetClip = allClips.find((c) => c.id === clipId);
    if (!targetClip) return [clipId];

    const visited = new Set<string>([clipId]);
    let added = true;
    while (added) {
      added = false;
      for (const id of Array.from(visited)) {
        const c = allClips.find((item) => item.id === id);
        if (!c) continue;
        if (c.group_id) {
          for (const sibling of allClips) {
            if (sibling.group_id === c.group_id && !visited.has(sibling.id)) {
              visited.add(sibling.id);
              added = true;
            }
          }
        }
        if (c.linked_clip_id && !visited.has(c.linked_clip_id)) {
          const partner = allClips.find((item) => item.id === c.linked_clip_id);
          if (partner) {
            visited.add(partner.id);
            added = true;
          }
        }
      }
    }
    return Array.from(visited);
  },

  groupSelectedClips: (clipIds?: string[]): string | null => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length < 2) return null;

    const { timeline } = get();
    if (!timeline) return null;

    // Phase 37: locked track check - cannot modify clips on locked tracks
    for (const track of timeline.tracks) {
      if (track.is_locked) {
        if (track.clips.some((c) => targetIds.includes(c.id))) {
          return null;
        }
      }
    }

    const newGroupId = crypto.randomUUID();
    let modified = false;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          for (const c of track.clips) {
            if (targetIds.includes(c.id)) {
              c.group_id = newGroupId;
              modified = true;
            }
          }
        }
      })
    );

    if (modified) {
      selStore.selectClips(targetIds);
      get().pushHistory();
      get().scheduleAutoSave();
      return newGroupId;
    }
    return null;
  },

  ungroupSelectedClips: (clipIds?: string[]): boolean => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length === 0) return false;

    const { timeline } = get();
    if (!timeline) return false;

    const targetGroups = new Set<string>();
    for (const track of timeline.tracks) {
      for (const c of track.clips) {
        if (targetIds.includes(c.id) && c.group_id) {
          targetGroups.add(c.group_id);
        }
      }
    }

    if (targetGroups.size === 0) return false;

    // Phase 37: check locked tracks
    for (const track of timeline.tracks) {
      if (track.is_locked) {
        if (track.clips.some((c) => c.group_id && targetGroups.has(c.group_id))) {
          return false;
        }
      }
    }

    let modified = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          for (const c of track.clips) {
            if (c.group_id && targetGroups.has(c.group_id)) {
              delete c.group_id;
              modified = true;
            }
          }
        }
      })
    );

    if (modified) {
      get().pushHistory();
      get().scheduleAutoSave();
      return true;
    }
    return false;
  },

  linkSelectedClips: (clipIds?: string[]): boolean => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length !== 2) return false;

    const { timeline } = get();
    if (!timeline) return false;

    let clipA: Clip | null = null;
    let clipB: Clip | null = null;
    for (const track of timeline.tracks) {
      for (const c of track.clips) {
        if (c.id === targetIds[0]) {
          if (track.is_locked) return false;
          clipA = c;
        }
        if (c.id === targetIds[1]) {
          if (track.is_locked) return false;
          clipB = c;
        }
      }
    }

    if (!clipA || !clipB) return false;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          for (const c of track.clips) {
            if (c.id === targetIds[0]) {
              c.linked_clip_id = targetIds[1];
            } else if (c.id === targetIds[1]) {
              c.linked_clip_id = targetIds[0];
            }
          }
        }
      })
    );

    selStore.selectClips(targetIds);
    get().pushHistory();
    get().scheduleAutoSave();
    return true;
  },

  unlinkSelectedClips: (clipIds?: string[]): boolean => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length === 0) return false;

    const { timeline } = get();
    if (!timeline) return false;

    const targetLinkedSet = new Set<string>();
    for (const track of timeline.tracks) {
      for (const c of track.clips) {
        if (targetIds.includes(c.id) && c.linked_clip_id) {
          targetLinkedSet.add(c.id);
          targetLinkedSet.add(c.linked_clip_id);
        }
      }
    }

    if (targetLinkedSet.size === 0) return false;

    // Phase 37: check locked tracks
    for (const track of timeline.tracks) {
      if (track.is_locked) {
        if (track.clips.some((c) => targetLinkedSet.has(c.id))) {
          return false;
        }
      }
    }

    let modified = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          for (const c of track.clips) {
            if (targetLinkedSet.has(c.id) && c.linked_clip_id) {
              delete c.linked_clip_id;
              modified = true;
            }
          }
        }
      })
    );

    if (modified) {
      get().pushHistory();
      get().scheduleAutoSave();
      return true;
    }
    return false;
  },

  realignLinkedClip: (clipId: string): boolean => {
    const { timeline } = get();
    if (!timeline) return false;

    let targetClip: Clip | null = null;
    let targetTrack: Track | null = null;
    let partnerClip: Clip | null = null;

    for (const track of timeline.tracks) {
      for (const c of track.clips) {
        if (c.id === clipId) {
          targetClip = c;
          targetTrack = track;
        }
      }
    }

    if (!targetClip || !targetTrack || targetTrack.is_locked || !targetClip.linked_clip_id) {
      return false;
    }

    for (const track of timeline.tracks) {
      for (const c of track.clips) {
        if (c.id === targetClip.linked_clip_id) {
          partnerClip = c;
          break;
        }
      }
    }

    if (!partnerClip) return false;

    if (targetClip.start_time_ms === partnerClip.start_time_ms) {
      return true;
    }

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === targetTrack!.id);
        if (!track || track.is_locked) return;
        const c = track.clips.find((clip) => clip.id === clipId);
        if (!c) return;

        c.start_time_ms = partnerClip!.start_time_ms;
        track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        recalcDuration(state);
      })
    );

    get().pushHistory();
    get().scheduleAutoSave();
    return true;
  },

  moveClipToTrack: (clipId: string, newTrackId: string, newStartMs: number) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        let clipToMove: Clip | null = null;
        let sourceTrackIdx = -1;
        let clipIdx = -1;

        for (let ti = 0; ti < state.timeline.tracks.length; ti++) {
          const track = state.timeline.tracks[ti];
          const ci = track.clips.findIndex((c) => c.id === clipId);
          if (ci !== -1) {
            clipToMove = track.clips[ci];
            sourceTrackIdx = ti;
            clipIdx = ci;
            break;
          }
        }

        if (!clipToMove || sourceTrackIdx === -1) return;

        // Remove from source
        state.timeline.tracks[sourceTrackIdx].clips.splice(clipIdx, 1);

        // Add to target
        const targetTrack = state.timeline.tracks.find((t) => t.id === newTrackId);
        if (targetTrack) {
          const movedClip: Clip = { ...clipToMove, track_id: newTrackId, start_time_ms: Math.max(0, newStartMs) };
          targetTrack.clips.push(movedClip);
          targetTrack.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        recalcDuration(state);
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  // Helper for Phase 44 trimming (used by trimClip, rippleTrimClip, rippleTrimToPlayhead)
  trimClip: (clipId: string, edge: 'left' | 'right', deltaMs: number, skipHistory = false, forceRipple?: boolean) => {
    const { timeline } = get();
    if (!timeline) return;

    let targetTrack: Track | null = null;
    let targetClip: Clip | null = null;
    for (const t of timeline.tracks) {
      const c = t.clips.find((item) => item.id === clipId);
      if (c) {
        targetTrack = t;
        targetClip = c;
        break;
      }
    }
    if (!targetClip || !targetTrack || targetTrack.is_locked) return;

    // Check linked partner
    let partnerTrack: Track | null = null;
    let partnerClip: Clip | null = null;
    if (targetClip.linked_clip_id) {
      for (const t of timeline.tracks) {
        const c = t.clips.find((item) => item.id === targetClip!.linked_clip_id);
        if (c) {
          partnerTrack = t;
          partnerClip = c;
          break;
        }
      }
      if (partnerTrack && partnerTrack.is_locked) return;
    }

    // Check group lock
    if (targetClip.group_id) {
      const hasLockedMember = timeline.tracks.some(
        (t) => t.is_locked && t.clips.some((c) => c.group_id === targetClip!.group_id)
      );
      if (hasLockedMember) return;
    }

    const shouldRipple = forceRipple !== undefined ? forceRipple : (get().activeTimelineTool === 'ripple' || get().rippleEnabled);
    let modified = false;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const sTargetTrack = state.timeline.tracks.find((t) => t.id === targetTrack!.id);
        const sTargetClip = sTargetTrack?.clips.find((c) => c.id === targetClip!.id);
        if (!sTargetTrack || !sTargetClip) return;

        let sPartnerTrack: Track | null = null;
        let sPartnerClip: Clip | null = null;
        if (targetClip!.linked_clip_id && partnerTrack) {
          sPartnerTrack = state.timeline.tracks.find((t) => t.id === partnerTrack!.id) || null;
          sPartnerClip = sPartnerTrack?.clips.find((c) => c.id === targetClip!.linked_clip_id) || null;
        }

        const res1 = trimSingleClipData(sTargetClip, edge, deltaMs, shouldRipple);
        if (!res1 || !res1.success) return;
        modified = true;

        let res2: { success: boolean; deltaDur: number; origEnd: number } | null = null;
        if (sPartnerClip && sPartnerTrack) {
          res2 = trimSingleClipData(sPartnerClip, edge, deltaMs, shouldRipple);
        }

        if (shouldRipple) {
          // Ripple target track
          if (res1.deltaDur !== 0) {
            for (const otherClip of sTargetTrack.clips) {
              if (otherClip.id !== sTargetClip.id && otherClip.start_time_ms >= res1.origEnd - 5) {
                otherClip.start_time_ms = Math.max(0, otherClip.start_time_ms + res1.deltaDur);
              }
            }
            sTargetTrack.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
          }

          // Ripple partner track if partner exists
          if (res2 && res2.deltaDur !== 0 && sPartnerTrack && sPartnerClip) {
            for (const otherClip of sPartnerTrack.clips) {
              if (otherClip.id !== sPartnerClip.id && otherClip.start_time_ms >= res2.origEnd - 5) {
                otherClip.start_time_ms = Math.max(0, otherClip.start_time_ms + res2.deltaDur);
              }
            }
            sPartnerTrack.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
          }
        }

        recalcDuration(state);
      })
    );

    if (modified) {
      if (!skipHistory) {
        get().pushHistory();
      }
      get().scheduleAutoSave();
    }
  },

  rippleTrimClip: (clipId: string, edge: 'left' | 'right', deltaMs: number, skipHistory = false) => {
    get().trimClip(clipId, edge, deltaMs, skipHistory, true);
  },

  rippleTrimToPlayhead: (edge: 'head' | 'tail', clipId?: string) => {
    const { timeline, playheadMs, selectedClipId } = get();
    if (!timeline) return false;

    const selStore = useSelectionStore.getState();
    const targetId = clipId || selectedClipId || (selStore.selectedClipIds.size > 0 ? Array.from(selStore.selectedClipIds)[0] : null);

    let targetClip: Clip | null = null;
    let targetTrack: Track | null = null;

    if (targetId) {
      for (const t of timeline.tracks) {
        const c = t.clips.find((item) => item.id === targetId);
        if (c) {
          targetClip = c;
          targetTrack = t;
          break;
        }
      }
    } else {
      for (const t of timeline.tracks) {
        if (t.is_locked) continue;
        const c = t.clips.find(
          (item) => playheadMs >= item.start_time_ms && playheadMs <= item.start_time_ms + item.duration_ms
        );
        if (c) {
          targetClip = c;
          targetTrack = t;
          break;
        }
      }
    }

    if (!targetClip || !targetTrack || targetTrack.is_locked) return false;

    // Check linked partner track lock
    if (targetClip.linked_clip_id) {
      const pTrack = timeline.tracks.find((t) => t.clips.some((c) => c.id === targetClip!.linked_clip_id));
      if (pTrack && pTrack.is_locked) return false;
    }

    // Check group lock
    if (targetClip.group_id) {
      const hasLockedGroupMember = timeline.tracks.some((t) =>
        t.is_locked && t.clips.some((c) => c.group_id === targetClip!.group_id)
      );
      if (hasLockedGroupMember) return false;
    }

    const clipStart = targetClip.start_time_ms;
    const clipEnd = clipStart + targetClip.duration_ms;

    if (edge === 'head') {
      if (playheadMs <= clipStart || playheadMs >= clipEnd) return false;
      const trimDelta = playheadMs - clipStart;
      if (targetClip.duration_ms - trimDelta < 100) return false;

      get().trimClip(targetClip.id, 'left', trimDelta, false, true);
      get().setPlayhead(clipStart);
      return true;
    } else {
      // edge === 'tail'
      if (playheadMs <= clipStart || playheadMs >= clipEnd) return false;
      const newDuration = playheadMs - clipStart;
      if (newDuration < 100) return false;
      const trimDelta = newDuration - targetClip.duration_ms; // negative delta

      get().trimClip(targetClip.id, 'right', trimDelta, false, true);
      get().setPlayhead(playheadMs);
      return true;
    }
  },

  rippleDeleteSelectedClips: (clipIds?: string[], rippleScope: 'track' | 'all' = 'track') => {
    const selStore = useSelectionStore.getState();
    const targetIds = clipIds && clipIds.length > 0
      ? clipIds
      : Array.from(selStore.selectedClipIds).length > 0
        ? Array.from(selStore.selectedClipIds)
        : get().selectedClipId ? [get().selectedClipId!] : [];

    if (targetIds.length === 0) return false;
    const targetSet = new Set(targetIds);

    const { timeline } = get();
    if (!timeline) return false;

    // Locked track check: if all target clips are on locked tracks, return false
    const affectedTracks = timeline.tracks.filter((t) => t.clips.some((c) => targetSet.has(c.id)));
    if (affectedTracks.length === 0 || affectedTracks.every((t) => t.is_locked)) {
      return false;
    }

    let modified = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          const deletedOnTrack = track.clips.filter((c) => targetSet.has(c.id));
          if (deletedOnTrack.length === 0) continue;

          const remainingClips = track.clips.filter((c) => !targetSet.has(c.id));

          for (const clip of remainingClips) {
            let totalShift = 0;
            for (const d of deletedOnTrack) {
              const dEnd = d.start_time_ms + d.duration_ms;
              if (dEnd <= clip.start_time_ms + 5) {
                totalShift += d.duration_ms;
              }
            }
            clip.start_time_ms = Math.max(0, clip.start_time_ms - totalShift);
          }

          track.clips = remainingClips;
          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
          modified = true;
        }

        // Clean up dangling transitions and linked clips across tracks
        for (const t of state.timeline.tracks) {
          for (const c of t.clips) {
            if (c.transition_out && targetSet.has(c.transition_out.to_clip_id)) {
              c.transition_out = undefined;
            }
            if (c.transition_in && targetSet.has(c.transition_in.from_clip_id)) {
              c.transition_in = undefined;
            }
            if (c.linked_clip_id && targetSet.has(c.linked_clip_id)) {
              delete c.linked_clip_id;
            }
          }
        }

        if (state.selectedClipId && targetSet.has(state.selectedClipId)) {
          state.selectedClipId = null;
        }
        recalcDuration(state);
      })
    );

    if (modified) {
      selStore.clearSelection();
      get().pushHistory();
      get().scheduleAutoSave();
      return true;
    }
    return false;
  },

  rippleDelete: (clipId?: string, rippleScope: 'track' | 'all' = 'track') => {
    const selStore = useSelectionStore.getState();
    const targetClipId = clipId || get().selectedClipId;
    if (selStore.selectedClipIds.size > 1 && (!clipId || selStore.selectedClipIds.has(clipId))) {
      return get().rippleDeleteSelectedClips(undefined, rippleScope);
    }
    if (!targetClipId) return false;

    const { timeline } = get();
    if (!timeline) return false;

    let targetTrack: Track | null = null;
    let targetClip: Clip | null = null;
    for (const track of timeline.tracks) {
      const c = track.clips.find((clip) => clip.id === targetClipId);
      if (c) {
        targetTrack = track;
        targetClip = c;
        break;
      }
    }

    if (!targetTrack || !targetClip || targetTrack.is_locked) {
      return false;
    }

    const gap = targetClip.duration_ms;
    const deleteStart = targetClip.start_time_ms;
    const deleteEnd = deleteStart + gap;

    if (rippleScope === 'all') {
      const anyLocked = timeline.tracks.some((t) => t.is_locked && t.clips.some((c) => c.start_time_ms >= deleteEnd - 5));
      if (anyLocked) return false;
    }

    let modified = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === targetTrack!.id);
        if (!track || track.is_locked) return;

        const idx = track.clips.findIndex((c) => c.id === targetClipId);
        if (idx === -1) return;

        track.clips.splice(idx, 1);
        modified = true;

        if (rippleScope === 'track') {
          // Shift clips that come after the deleted clip on this track
          for (const clip of track.clips) {
            if (clip.start_time_ms >= deleteEnd - 5) {
              clip.start_time_ms = Math.max(0, clip.start_time_ms - gap);
            }
          }
          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        } else {
          // Shift clips on all unlocked tracks
          for (const t of state.timeline.tracks) {
            if (t.is_locked) continue;
            for (const c of t.clips) {
              if (c.start_time_ms >= deleteEnd - 5) {
                c.start_time_ms = Math.max(0, c.start_time_ms - gap);
              }
            }
            t.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
          }
          // Shift sequence markers
          if (Array.isArray(state.timeline.markers)) {
            for (const m of state.timeline.markers) {
              if (m.time_ms >= deleteEnd - 5) {
                m.time_ms = Math.max(0, m.time_ms - gap);
              }
            }
          }
        }

        // Clean up dangling transitions and linked clips across tracks referencing the deleted clip
        for (const t of state.timeline.tracks) {
          for (const c of t.clips) {
            if (c.transition_out?.to_clip_id === targetClipId) {
              c.transition_out = undefined;
            }
            if (c.transition_in?.from_clip_id === targetClipId) {
              c.transition_in = undefined;
            }
            if (c.linked_clip_id === targetClipId) {
              delete c.linked_clip_id;
            }
          }
        }

        if (state.selectedClipId === targetClipId) {
          state.selectedClipId = null;
        }
        recalcDuration(state);
      })
    );

    if (modified) {
      if (selStore.selectedClipIds.has(targetClipId)) {
        selStore.toggleClipSelected(targetClipId);
      }
      get().pushHistory();
      get().scheduleAutoSave();
      return true;
    }
    return false;
  },

  slipClip: (clipId: string, deltaMs: number, skipHistory = false) => {
    if (!clipId || Math.round(deltaMs) === 0) return false;
    let modified = false;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) continue;
          if (track.is_locked) return; // Locked track protection

          const speed = clip.speed_factor && clip.speed_factor > 0 ? clip.speed_factor : 1.0;
          const isReversed = Boolean(clip.is_reversed);
          const deltaMedia = Math.round(deltaMs * speed);

          const windowSize = clip.source_out_ms - clip.source_in_ms;
          if (windowSize <= 0) return;

          let newSourceIn = clip.source_in_ms;
          let newSourceOut = clip.source_out_ms;

          if (!isReversed) {
            newSourceIn = clip.source_in_ms + deltaMedia;
            newSourceOut = newSourceIn + windowSize;
          } else {
            // Reversed media: moving forward in timeline moves source backward
            newSourceIn = clip.source_in_ms - deltaMedia;
            newSourceOut = newSourceIn + windowSize;
          }

          // Clamping at lower bound: source_in >= 0
          if (newSourceIn < 0) {
            newSourceIn = 0;
            newSourceOut = newSourceIn + windowSize;
          }

          // Clamping at upper bound if source_duration_ms is available in metadata
          const maxSourceDur = Number(
            clip.metadata_info?.source_duration_ms ||
            clip.metadata_info?.duration_ms ||
            0
          );
          if (maxSourceDur > 0 && newSourceOut > maxSourceDur) {
            newSourceOut = maxSourceDur;
            newSourceIn = Math.max(0, newSourceOut - windowSize);
          }

          if (newSourceIn === clip.source_in_ms && newSourceOut === clip.source_out_ms) {
            return;
          }

          clip.source_in_ms = newSourceIn;
          clip.source_out_ms = newSourceOut;
          // Timeline start_time_ms, duration_ms, keyframes, transitions, markers, effects strictly preserved
          modified = true;
          break;
        }
      })
    );

    if (modified) {
      if (!skipHistory) {
        get().pushHistory();
      }
      get().scheduleAutoSave();
    }
    return modified;
  },

  slideClip: (clipId: string, deltaMs: number, skipHistory = false, forceSnap?: boolean) => {
    if (!clipId || Math.round(deltaMs) === 0) return false;
    let modified = false;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        for (const track of state.timeline.tracks) {
          const clipIdx = track.clips.findIndex((c) => c.id === clipId);
          if (clipIdx === -1) continue;
          if (track.is_locked) return; // Locked track protection

          const clip = track.clips[clipIdx];
          const origStart = clip.start_time_ms;
          const origEnd = origStart + clip.duration_ms;

          // Sort clips to ensure timeline order
          const sortedTrackClips = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
          const sortedIdx = sortedTrackClips.findIndex((c) => c.id === clipId);
          const predClip = sortedIdx > 0 ? sortedTrackClips[sortedIdx - 1] : null;
          const succClip = sortedIdx < sortedTrackClips.length - 1 ? sortedTrackClips[sortedIdx + 1] : null;

          const isPredAdjacent = predClip ? Math.abs((predClip.start_time_ms + predClip.duration_ms) - origStart) <= 5 : false;
          const isSuccAdjacent = succClip ? Math.abs(origEnd - succClip.start_time_ms) <= 5 : false;

          // Calculate min/max sliding boundaries
          let minDelta = -origStart; // cannot slide before timeline 0
          let maxDelta = Number.MAX_SAFE_INTEGER;

          if (predClip) {
            if (isPredAdjacent) {
              // Adjacent predecessor: predecessor duration shrinks when sliding left; cannot shrink below 100ms
              minDelta = Math.max(minDelta, -(predClip.duration_ms - 100));
            } else {
              // Non-adjacent predecessor: bounded by gap before predecessor end
              const predEnd = predClip.start_time_ms + predClip.duration_ms;
              minDelta = Math.max(minDelta, predEnd - origStart);
            }
          }

          if (succClip) {
            if (isSuccAdjacent) {
              // Adjacent successor: successor duration shrinks when sliding right; cannot shrink below 100ms
              maxDelta = Math.min(maxDelta, succClip.duration_ms - 100);
            } else {
              // Non-adjacent successor: bounded by gap before successor start
              maxDelta = Math.min(maxDelta, succClip.start_time_ms - origEnd);
            }
          }

          // Media bounds check when expanding adjacent neighbors
          if (predClip && isPredAdjacent) {
            const predSpeed = predClip.speed_factor && predClip.speed_factor > 0 ? predClip.speed_factor : 1.0;
            const predMaxDur = Number(predClip.metadata_info?.source_duration_ms || predClip.metadata_info?.duration_ms || 0);
            if (predMaxDur > 0 && !predClip.is_reversed) {
              const maxPredExpand = Math.floor((predMaxDur - predClip.source_out_ms) / predSpeed);
              if (maxPredExpand > 0) {
                maxDelta = Math.min(maxDelta, maxPredExpand);
              }
            }
          }
          if (succClip && isSuccAdjacent) {
            const succSpeed = succClip.speed_factor && succClip.speed_factor > 0 ? succClip.speed_factor : 1.0;
            if (!succClip.is_reversed) {
              const maxSuccExpand = Math.floor(succClip.source_in_ms / succSpeed);
              if (maxSuccExpand >= 0) {
                minDelta = Math.max(minDelta, -maxSuccExpand);
              }
            }
          }

          let requestedDelta = Math.round(deltaMs);

          // Snapping evaluation
          const snapActive = forceSnap !== undefined ? forceSnap : state.snapEnabled;
          if (snapActive) {
            const zoom = state.zoomLevel || 25;
            const snapThreshold = Math.max(60, Math.round(1000 / zoom));
            const candidateStart = origStart + requestedDelta;
            const candidateEnd = candidateStart + clip.duration_ms;

            const snapPoints: number[] = [0, state.playheadMs];
            if (Array.isArray(state.timeline.markers)) {
              for (const m of state.timeline.markers) snapPoints.push(m.time_ms);
            }
            for (const tr of state.timeline.tracks) {
              if (tr.is_locked) continue;
              for (const c of tr.clips) {
                if (c.id === clip.id) continue;
                snapPoints.push(c.start_time_ms);
                snapPoints.push(c.start_time_ms + c.duration_ms);
              }
            }

            let bestDist = snapThreshold + 1;
            let snapCorrection = 0;
            for (const sp of snapPoints) {
              const dStart = Math.abs(candidateStart - sp);
              if (dStart < bestDist) {
                bestDist = dStart;
                snapCorrection = sp - candidateStart;
              }
              const dEnd = Math.abs(candidateEnd - sp);
              if (dEnd < bestDist) {
                bestDist = dEnd;
                snapCorrection = sp - candidateEnd;
              }
            }
            if (bestDist <= snapThreshold) {
              requestedDelta += snapCorrection;
            }
          }

          // Clamp requested delta within boundaries
          const effectiveDelta = Math.max(minDelta, Math.min(maxDelta, requestedDelta));
          if (effectiveDelta === 0) return;

          // 1. Move clip in timeline (own duration and source window strictly untouched!)
          clip.start_time_ms += effectiveDelta;

          // 2. Adjust predecessor if adjacent
          if (predClip && isPredAdjacent) {
            const actualPred = track.clips.find((c) => c.id === predClip.id);
            if (actualPred) {
              const predSpeed = actualPred.speed_factor && actualPred.speed_factor > 0 ? actualPred.speed_factor : 1.0;
              actualPred.duration_ms += effectiveDelta;
              if (!actualPred.is_reversed) {
                actualPred.source_out_ms += Math.round(effectiveDelta * predSpeed);
              } else {
                actualPred.source_in_ms -= Math.round(effectiveDelta * predSpeed);
              }
              actualPred.fade_out_ms = Math.min(actualPred.fade_out_ms || 0, actualPred.duration_ms);
            }
          }

          // 3. Adjust successor if adjacent
          if (succClip && isSuccAdjacent) {
            const actualSucc = track.clips.find((c) => c.id === succClip.id);
            if (actualSucc) {
              const succSpeed = actualSucc.speed_factor && actualSucc.speed_factor > 0 ? actualSucc.speed_factor : 1.0;
              actualSucc.start_time_ms += effectiveDelta;
              actualSucc.duration_ms -= effectiveDelta;
              if (!actualSucc.is_reversed) {
                actualSucc.source_in_ms += Math.round(effectiveDelta * succSpeed);
              } else {
                actualSucc.source_out_ms -= Math.round(effectiveDelta * succSpeed);
              }
              actualSucc.fade_in_ms = Math.min(actualSucc.fade_in_ms || 0, actualSucc.duration_ms);
            }
          }

          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
          recalcDuration(state);
          modified = true;
          break;
        }
      })
    );

    if (modified) {
      if (!skipHistory) {
        get().pushHistory();
      }
      get().scheduleAutoSave();
    }
    return modified;
  },

  rollEdit: (
    predId: string,
    succId: string,
    deltaMs: number,
    skipHistory = false,
    forceSnap?: boolean
  ) => {
    if (!predId || !succId || Math.round(deltaMs) === 0) return false;
    let modified = false;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        // Locate track containing both touching clips
        const track = state.timeline.tracks.find(
          (t) => t.clips.some((c) => c.id === predId) && t.clips.some((c) => c.id === succId)
        );
        if (!track) return;
        if (track.is_locked) return; // Locked track protection

        const predClip = track.clips.find((c) => c.id === predId);
        const succClip = track.clips.find((c) => c.id === succId);
        if (!predClip || !succClip) return;

        const origPredEnd = predClip.start_time_ms + predClip.duration_ms;
        const isTouching = Math.abs(origPredEnd - succClip.start_time_ms) <= 5;
        if (!isTouching) return; // Only touching adjacent clips can be rolled

        const predSpeed = predClip.speed_factor && predClip.speed_factor > 0 ? predClip.speed_factor : 1.0;
        const succSpeed = succClip.speed_factor && succClip.speed_factor > 0 ? succClip.speed_factor : 1.0;

        // 1. Minimum duration limits (100ms)
        let minDelta = -(predClip.duration_ms - 100);
        let maxDelta = succClip.duration_ms - 100;

        // 2. Predecessor media boundary limits
        const predMaxDur = Number(
          predClip.metadata_info?.source_duration_ms || predClip.metadata_info?.duration_ms || 0
        );
        if (!predClip.is_reversed) {
          if (predMaxDur > 0) {
            const maxPredExpand = Math.floor((predMaxDur - predClip.source_out_ms) / predSpeed);
            if (maxPredExpand >= 0) {
              maxDelta = Math.min(maxDelta, maxPredExpand);
            }
          }
        } else {
          const maxPredExpand = Math.floor(predClip.source_in_ms / predSpeed);
          if (maxPredExpand >= 0) {
            maxDelta = Math.min(maxDelta, maxPredExpand);
          }
        }

        // 3. Successor media boundary limits
        const succMaxDur = Number(
          succClip.metadata_info?.source_duration_ms || succClip.metadata_info?.duration_ms || 0
        );
        if (!succClip.is_reversed) {
          const maxSuccExpand = Math.floor(succClip.source_in_ms / succSpeed);
          if (maxSuccExpand >= 0) {
            minDelta = Math.max(minDelta, -maxSuccExpand);
          }
        } else {
          if (succMaxDur > 0) {
            const maxSuccExpand = Math.floor((succMaxDur - succClip.source_out_ms) / succSpeed);
            if (maxSuccExpand >= 0) {
              minDelta = Math.max(minDelta, -maxSuccExpand);
            }
          }
        }

        if (minDelta > maxDelta) return;

        let requestedDelta = Math.round(deltaMs);

        // 4. Snapping evaluation
        const snapActive = forceSnap !== undefined ? forceSnap : state.snapEnabled;
        if (snapActive) {
          const zoom = state.zoomLevel || 25;
          const snapThreshold = Math.max(60, Math.round(1000 / zoom));
          const candidateCut = origPredEnd + requestedDelta;

          const snapPoints: number[] = [0, state.playheadMs];
          if (Array.isArray(state.timeline.markers)) {
            for (const m of state.timeline.markers) snapPoints.push(m.time_ms);
          }
          for (const tr of state.timeline.tracks) {
            if (tr.is_locked) continue;
            for (const c of tr.clips) {
              if (c.id === predClip.id || c.id === succClip.id) continue;
              snapPoints.push(c.start_time_ms);
              snapPoints.push(c.start_time_ms + c.duration_ms);
            }
          }

          let bestDist = snapThreshold + 1;
          let snapCorrection = 0;
          for (const sp of snapPoints) {
            const dist = Math.abs(candidateCut - sp);
            if (dist < bestDist) {
              bestDist = dist;
              snapCorrection = sp - candidateCut;
            }
          }
          if (bestDist <= snapThreshold) {
            requestedDelta += snapCorrection;
          }
        }

        // 5. Clamp effective delta
        const effectiveDelta = Math.max(minDelta, Math.min(maxDelta, requestedDelta));
        if (effectiveDelta === 0) return;

        // 6. Mutate Predecessor
        predClip.duration_ms += effectiveDelta;
        if (!predClip.is_reversed) {
          predClip.source_out_ms += Math.round(effectiveDelta * predSpeed);
        } else {
          predClip.source_in_ms -= Math.round(effectiveDelta * predSpeed);
        }
        predClip.fade_out_ms = Math.min(predClip.fade_out_ms || 0, predClip.duration_ms);

        // 7. Mutate Successor
        succClip.start_time_ms += effectiveDelta;
        succClip.duration_ms -= effectiveDelta;
        if (!succClip.is_reversed) {
          succClip.source_in_ms += Math.round(effectiveDelta * succSpeed);
        } else {
          succClip.source_out_ms -= Math.round(effectiveDelta * succSpeed);
        }
        succClip.fade_in_ms = Math.min(succClip.fade_in_ms || 0, succClip.duration_ms);

        // 8. Adjust transitions between predecessor and successor if present
        if (predClip.transition_out) {
          predClip.transition_out.duration_ms = Math.min(
            predClip.transition_out.duration_ms || 1000,
            predClip.duration_ms,
            succClip.duration_ms
          );
        }
        if (succClip.transition_in) {
          succClip.transition_in.duration_ms = Math.min(
            succClip.transition_in.duration_ms || 1000,
            predClip.duration_ms,
            succClip.duration_ms
          );
        }

        track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        recalcDuration(state);
        modified = true;
      })
    );

    if (modified) {
      if (!skipHistory) {
        get().pushHistory();
      }
      get().scheduleAutoSave();
    }
    return modified;
  },

  setClipTransition: (clipId: string, edge: 'in' | 'out', transition: Record<string, any> | null) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (track.is_locked) break;
            if (edge === 'in') clip.transition_in = transition ?? undefined;
            else clip.transition_out = transition ?? undefined;
            break;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  applyAudioCrossfade: (clipAId: string, clipBId: string, durationMs = 1000) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clipA = track.clips.find((c) => c.id === clipAId);
          const clipB = track.clips.find((c) => c.id === clipBId);
          if (clipA && clipB) {
            if (track.is_locked) break;
            clipA.fade_out_ms = Math.min(durationMs, clipA.duration_ms);
            clipB.fade_in_ms = Math.min(durationMs, clipB.duration_ms);
            clipA.transition_out = { type: 'crossfade', duration_ms: durationMs };
            clipB.transition_in = { type: 'crossfade', duration_ms: durationMs };
            break;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  applyVideoTransition: (
    fromClipId: string,
    toClipId: string,
    type: VideoTransitionType,
    durationMs: number
  ): boolean => {
    const validTypes = ['crossfade', 'fade_black', 'fade_white'];
    if (!validTypes.includes(type)) {
      console.warn(`[Timeline] Invalid transition type: ${type}`);
      return false;
    }

    const { timeline } = get();
    if (!timeline) return false;

    // Locate both clips and verify they are on the same video track
    let targetTrack: Track | null = null;
    let clipA: Clip | null = null;
    let clipB: Clip | null = null;

    for (const track of timeline.tracks) {
      if (track.track_type !== 'video' && track.track_role !== 'video') continue;
      const idxA = track.clips.findIndex((c) => c.id === fromClipId);
      const idxB = track.clips.findIndex((c) => c.id === toClipId);
      if (idxA !== -1 && idxB !== -1) {
        // Clips must be directly adjacent (sorted by start_time_ms)
        const sortedClips = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
        const sortedIdxA = sortedClips.findIndex((c) => c.id === fromClipId);
        const sortedIdxB = sortedClips.findIndex((c) => c.id === toClipId);
        if (sortedIdxB === sortedIdxA + 1) {
          targetTrack = track;
          clipA = sortedClips[sortedIdxA];
          clipB = sortedClips[sortedIdxB];
          break;
        }
      }
    }

    if (!targetTrack || targetTrack.is_locked || !clipA || !clipB) {
      console.warn('[Timeline] Clips must be adjacent on the same unlocked video track');
      return false;
    }

    // Validate duration: must be > 0 and <= min(durationA, durationB)
    const maxDur = Math.min(clipA.duration_ms, clipB.duration_ms);
    if (durationMs <= 0 || durationMs > maxDur) {
      console.warn(`[Timeline] Transition duration ${durationMs}ms exceeds available overlap/duration (${maxDur}ms)`);
      return false;
    }

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          if (track.id === targetTrack!.id) {
            const cA = track.clips.find((c) => c.id === fromClipId);
            const cB = track.clips.find((c) => c.id === toClipId);
            if (cA && cB) {
              cA.transition_out = {
                type,
                duration_ms: durationMs,
                from_clip_id: fromClipId,
                to_clip_id: toClipId,
              };
              cB.transition_in = {
                type,
                duration_ms: durationMs,
                from_clip_id: fromClipId,
                to_clip_id: toClipId,
              };
            }
            break;
          }
        }
      })
    );

    get().pushHistory();
    get().scheduleAutoSave();
    return true;
  },

  removeVideoTransition: (fromClipId: string, toClipId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const cA = track.clips.find((c) => c.id === fromClipId);
          const cB = track.clips.find((c) => c.id === toClipId);
          if (cA || cB) {
            if (track.is_locked) break;
          }
          if (cA && (cA.transition_out?.to_clip_id === toClipId || !cA.transition_out?.to_clip_id)) {
            cA.transition_out = undefined;
          }
          if (cB && (cB.transition_in?.from_clip_id === fromClipId || !cB.transition_in?.from_clip_id)) {
            cB.transition_in = undefined;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  setClipSpeed: (clipId: string, speedFactor: number) => {
    if (typeof speedFactor !== 'number' || isNaN(speedFactor) || !isFinite(speedFactor) || speedFactor <= 0) {
      console.warn(`[useTimelineStore] Invalid speed factor rejected: ${speedFactor}`);
      return false;
    }
    const clampedSpeed = Math.max(0.1, Math.min(10.0, Math.round(speedFactor * 100) / 100));

    let updated = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (track.is_locked) break;
            clip.speed_factor = clampedSpeed;
            updated = true;
            break;
          }
        }
      })
    );

    if (updated) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return updated;
  },

  setClipReverse: (clipId: string, isReversed: boolean) => {
    let updated = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (track.is_locked) break;
            clip.is_reversed = Boolean(isReversed);
            updated = true;
            break;
          }
        }
      })
    );

    if (updated) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return updated;
  },

  applyFreezeFrame: (clipId: string, freezeAtMs: number, durationMs: number) => {
    if (!ALLOWED_FREEZE_DURATIONS_MS.includes(durationMs as any)) {
      console.warn(`[useTimelineStore] Invalid freeze duration: ${durationMs}`);
      return false;
    }
    if (typeof freezeAtMs !== 'number' || isNaN(freezeAtMs) || !isFinite(freezeAtMs)) {
      console.warn(`[useTimelineStore] Invalid freezeAtMs: ${freezeAtMs}`);
      return false;
    }

    let updated = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (track.is_locked) break;
            // Option A Mutual Exclusion: cannot apply Freeze Frame while Frame Hold is active
            if (clip.is_frame_hold) {
              console.warn(`[useTimelineStore] Cannot apply Freeze Frame: Frame Hold is active on clip ${clipId}`);
              return;
            }
            const maxOffset = Math.max(0, clip.duration_ms - 1);
            const clampedAt = Math.max(0, Math.min(maxOffset, Math.round(freezeAtMs)));
            clip.is_frozen = true;
            clip.freeze_at_ms = clampedAt;
            clip.freeze_duration_ms = durationMs;
            updated = true;
            break;
          }
        }
      })
    );

    if (updated) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return updated;
  },

  removeFreezeFrame: (clipId: string) => {
    let updated = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (track.is_locked) break;
            clip.is_frozen = false;
            clip.freeze_at_ms = undefined;
            clip.freeze_duration_ms = undefined;
            updated = true;
            break;
          }
        }
      })
    );

    if (updated) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return updated;
  },

  applyFrameHold: (clipId: string, frameHoldAtMs: number, durationMs: number) => {
    if (!ALLOWED_FRAME_HOLD_DURATIONS_MS.includes(durationMs as any)) {
      console.warn(`[useTimelineStore] Invalid frame hold duration: ${durationMs}`);
      return false;
    }
    if (typeof frameHoldAtMs !== 'number' || isNaN(frameHoldAtMs) || !isFinite(frameHoldAtMs)) {
      console.warn(`[useTimelineStore] Invalid frameHoldAtMs: ${frameHoldAtMs}`);
      return false;
    }

    let updated = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (track.is_locked) break;
            // Option A Mutual Exclusion: cannot apply Frame Hold while Freeze Frame is active
            if (clip.is_frozen) {
              console.warn(`[useTimelineStore] Cannot apply Frame Hold: Freeze Frame is active on clip ${clipId}`);
              return;
            }
            const maxOffset = Math.max(0, clip.duration_ms - 1);
            const clampedAt = Math.max(0, Math.min(maxOffset, Math.round(frameHoldAtMs)));
            clip.is_frame_hold = true;
            clip.frame_hold_at_ms = clampedAt;
            clip.frame_hold_duration_ms = durationMs;
            updated = true;
            break;
          }
        }
      })
    );

    if (updated) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return updated;
  },

  removeFrameHold: (clipId: string) => {
    let updated = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (track.is_locked) break;
            clip.is_frame_hold = false;
            clip.frame_hold_at_ms = undefined;
            clip.frame_hold_duration_ms = undefined;
            updated = true;
            break;
          }
        }
      })
    );

    if (updated) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return updated;
  },

  addKeyframe: (clipId: string, kf: Keyframe) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            const id = kf.id || crypto.randomUUID();
            clip.keyframes.push({ ...kf, id });
            clip.keyframes.sort((a, b) => a.time_offset_ms - b.time_offset_ms);
            break;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  deleteKeyframe: (clipId: string, kfId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            const idx = clip.keyframes.findIndex((k) => k.id === kfId);
            if (idx !== -1) clip.keyframes.splice(idx, 1);
            break;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  moveKeyframe: (clipId: string, kfId: string, newTimeMs: number) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            const kf = clip.keyframes.find((k) => k.id === kfId);
            if (kf) kf.time_offset_ms = Math.max(0, newTimeMs);
            clip.keyframes.sort((a, b) => a.time_offset_ms - b.time_offset_ms);
            break;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  updateKeyframeValue: (clipId: string, kfId: string, newValue: any, skipHistory = false) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            const kf = clip.keyframes.find((k) => k.id === kfId);
            if (kf) kf.value = newValue;
            break;
          }
        }
      })
    );
    if (!skipHistory) {
      get().pushHistory();
    }
    get().scheduleAutoSave();
  },

  clearAudioAutomation: (clipId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            clip.keyframes = (clip.keyframes || []).filter((k) => k.property_path !== 'volume_db');
            break;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  // Marker System (Phase 36)
  addTimelineMarker: (timeMs?: number, options?: Partial<TimelineMarker>) => {
    const id = options?.id || crypto.randomUUID();
    const targetTime = Math.max(0, Math.round(timeMs !== undefined ? timeMs : get().playheadMs));
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        if (!Array.isArray(state.timeline.markers)) {
          state.timeline.markers = [];
        }
        const existingCount = state.timeline.markers.length;
        const marker: TimelineMarker = {
          id,
          time_ms: targetTime,
          duration_ms: options?.duration_ms ?? 0,
          name: options?.name?.trim() || `Marker ${existingCount + 1}`,
          comment: options?.comment || '',
          color: options?.color || 'blue',
        };
        state.timeline.markers.push(marker);
        state.timeline.markers.sort((a, b) => a.time_ms - b.time_ms);
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
    return id;
  },

  addClipMarker: (clipId: string, offsetMs?: number, options?: Partial<TimelineMarker>) => {
    let markerId: string | null = null;
    const playhead = get().playheadMs;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) continue;
          if (!Array.isArray(clip.markers)) {
            clip.markers = [];
          }
          const calculatedOffset = offsetMs !== undefined
            ? offsetMs
            : Math.max(0, Math.min(clip.duration_ms, playhead - clip.start_time_ms));
          const existingCount = clip.markers.length;
          markerId = options?.id || crypto.randomUUID();
          const marker: TimelineMarker = {
            id: markerId,
            time_ms: Math.max(0, Math.min(clip.duration_ms, Math.round(calculatedOffset))),
            duration_ms: options?.duration_ms ?? 0,
            name: options?.name?.trim() || `Clip Marker ${existingCount + 1}`,
            comment: options?.comment || '',
            color: options?.color || 'blue',
            clip_id: clipId,
          };
          clip.markers.push(marker);
          clip.markers.sort((a, b) => a.time_ms - b.time_ms);
          break;
        }
      })
    );
    if (markerId) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return markerId;
  },

  updateMarker: (markerId: string, updates: Partial<TimelineMarker>, clipId?: string) => {
    let found = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        // If clipId provided, check that clip
        if (clipId) {
          for (const track of state.timeline.tracks) {
            const clip = track.clips.find((c) => c.id === clipId);
            if (clip && Array.isArray(clip.markers)) {
              const m = clip.markers.find((item) => item.id === markerId);
              if (m) {
                Object.assign(m, updates);
                if (updates.time_ms !== undefined) {
                  m.time_ms = Math.max(0, Math.min(clip.duration_ms, Math.round(updates.time_ms)));
                  clip.markers.sort((a, b) => a.time_ms - b.time_ms);
                }
                found = true;
                return;
              }
            }
          }
        }
        // Otherwise check timeline markers
        if (Array.isArray(state.timeline.markers)) {
          const tm = state.timeline.markers.find((item) => item.id === markerId);
          if (tm) {
            Object.assign(tm, updates);
            if (updates.time_ms !== undefined) {
              tm.time_ms = Math.max(0, Math.round(updates.time_ms));
              state.timeline.markers.sort((a, b) => a.time_ms - b.time_ms);
            }
            found = true;
            return;
          }
        }
        // Otherwise search across all clips
        for (const track of state.timeline.tracks) {
          for (const clip of track.clips) {
            if (Array.isArray(clip.markers)) {
              const cm = clip.markers.find((item) => item.id === markerId);
              if (cm) {
                Object.assign(cm, updates);
                if (updates.time_ms !== undefined) {
                  cm.time_ms = Math.max(0, Math.min(clip.duration_ms, Math.round(updates.time_ms)));
                  clip.markers.sort((a, b) => a.time_ms - b.time_ms);
                }
                found = true;
                return;
              }
            }
          }
        }
      })
    );
    if (found) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return found;
  },

  deleteMarker: (markerId: string, clipId?: string) => {
    let deleted = false;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        if (clipId) {
          for (const track of state.timeline.tracks) {
            const clip = track.clips.find((c) => c.id === clipId);
            if (clip && Array.isArray(clip.markers)) {
              const idx = clip.markers.findIndex((m) => m.id === markerId);
              if (idx !== -1) {
                clip.markers.splice(idx, 1);
                deleted = true;
                return;
              }
            }
          }
        }
        // Check timeline markers
        if (Array.isArray(state.timeline.markers)) {
          const idx = state.timeline.markers.findIndex((m) => m.id === markerId);
          if (idx !== -1) {
            state.timeline.markers.splice(idx, 1);
            deleted = true;
            return;
          }
        }
        // Search all clips
        for (const track of state.timeline.tracks) {
          for (const clip of track.clips) {
            if (Array.isArray(clip.markers)) {
              const idx = clip.markers.findIndex((m) => m.id === markerId);
              if (idx !== -1) {
                clip.markers.splice(idx, 1);
                deleted = true;
                return;
              }
            }
          }
        }
      })
    );
    if (deleted) {
      get().pushHistory();
      get().scheduleAutoSave();
    }
    return deleted;
  },

  clearMarkers: (clipId?: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        if (clipId) {
          for (const track of state.timeline.tracks) {
            const clip = track.clips.find((c) => c.id === clipId);
            if (clip) {
              clip.markers = [];
              return;
            }
          }
        } else {
          state.timeline.markers = [];
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  goToNextMarker: () => {
    const { timeline, playheadMs } = get();
    if (!timeline) return;
    const allMarkerTimes: number[] = [];
    if (Array.isArray(timeline.markers)) {
      for (const m of timeline.markers) {
        allMarkerTimes.push(m.time_ms);
      }
    }
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (Array.isArray(clip.markers)) {
          for (const m of clip.markers) {
            allMarkerTimes.push(clip.start_time_ms + m.time_ms);
          }
        }
      }
    }
    if (allMarkerTimes.length === 0) return;
    allMarkerTimes.sort((a, b) => a - b);
    const next = allMarkerTimes.find((t) => t > playheadMs + 10);
    if (next !== undefined) {
      get().setPlayhead(next);
    } else {
      get().setPlayhead(allMarkerTimes[0]);
    }
  },

  goToPrevMarker: () => {
    const { timeline, playheadMs } = get();
    if (!timeline) return;
    const allMarkerTimes: number[] = [];
    if (Array.isArray(timeline.markers)) {
      for (const m of timeline.markers) {
        allMarkerTimes.push(m.time_ms);
      }
    }
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (Array.isArray(clip.markers)) {
          for (const m of clip.markers) {
            allMarkerTimes.push(clip.start_time_ms + m.time_ms);
          }
        }
      }
    }
    if (allMarkerTimes.length === 0) return;
    allMarkerTimes.sort((a, b) => a - b);
    const prevTimes = allMarkerTimes.filter((t) => t < playheadMs - 10);
    if (prevTimes.length > 0) {
      get().setPlayhead(prevTimes[prevTimes.length - 1]);
    } else {
      get().setPlayhead(allMarkerTimes[allMarkerTimes.length - 1]);
    }
  },

  // Phase 43: Timeline Work Area & In/Out Range Editing
  markIn: (timeMs?: number) => {
    const { timeline, playheadMs } = get();
    if (!timeline) return;
    const target = timeMs !== undefined ? timeMs : playheadMs;
    const maxDur = timeline.duration_ms || 0;
    const clampedIn = Math.max(0, Math.min(Math.round(target), maxDur));

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        if (state.timeline.out_point_ms !== null && state.timeline.out_point_ms !== undefined && clampedIn > state.timeline.out_point_ms) {
          const oldOut = state.timeline.out_point_ms;
          state.timeline.in_point_ms = oldOut;
          state.timeline.out_point_ms = clampedIn;
        } else {
          state.timeline.in_point_ms = clampedIn;
        }
      })
    );
    get().scheduleAutoSave();
  },

  markOut: (timeMs?: number) => {
    const { timeline, playheadMs } = get();
    if (!timeline) return;
    const target = timeMs !== undefined ? timeMs : playheadMs;
    const maxDur = timeline.duration_ms || 0;
    const clampedOut = Math.max(0, Math.min(Math.round(target), maxDur));

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        if (state.timeline.in_point_ms !== null && state.timeline.in_point_ms !== undefined && clampedOut < state.timeline.in_point_ms) {
          const oldIn = state.timeline.in_point_ms;
          state.timeline.in_point_ms = clampedOut;
          state.timeline.out_point_ms = oldIn;
        } else {
          state.timeline.out_point_ms = clampedOut;
        }
      })
    );
    get().scheduleAutoSave();
  },

  markClipRange: (clipId?: string) => {
    const { timeline, selectedClipId } = get();
    if (!timeline) return false;
    const selStore = useSelectionStore.getState();
    const selIds = Array.from(selStore.selectedClipIds);
    const targetIds = clipId ? [clipId] : selIds.length > 0 ? selIds : selectedClipId ? [selectedClipId] : [];
    if (targetIds.length === 0) return false;

    const allClips = timeline.tracks.flatMap((t) => t.clips);
    const matched = allClips.filter((c) => targetIds.includes(c.id));
    if (matched.length === 0) return false;

    const minStart = Math.min(...matched.map((c) => c.start_time_ms));
    const maxEnd = Math.max(...matched.map((c) => c.start_time_ms + c.duration_ms));

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        state.timeline.in_point_ms = Math.max(0, minStart);
        state.timeline.out_point_ms = Math.min(state.timeline.duration_ms, maxEnd);
      })
    );
    get().scheduleAutoSave();
    return true;
  },

  clearInOut: () => {
    const { timeline } = get();
    if (!timeline) return;
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        state.timeline.in_point_ms = null;
        state.timeline.out_point_ms = null;
      })
    );
    get().scheduleAutoSave();
  },

  setInOutRange: (inMs: number | null, outMs: number | null) => {
    const { timeline } = get();
    if (!timeline) return;
    const maxDur = timeline.duration_ms || 0;
    const validIn = inMs !== null && inMs !== undefined ? Math.max(0, Math.min(Math.round(inMs), maxDur)) : null;
    const validOut = outMs !== null && outMs !== undefined ? Math.max(0, Math.min(Math.round(outMs), maxDur)) : null;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        if (validIn !== null && validOut !== null && validIn > validOut) {
          state.timeline.in_point_ms = validOut;
          state.timeline.out_point_ms = validIn;
        } else {
          state.timeline.in_point_ms = validIn;
          state.timeline.out_point_ms = validOut;
        }
      })
    );
    get().scheduleAutoSave();
  },

  liftRange: () => {
    const { timeline } = get();
    if (!timeline) return false;
    const inMs = timeline.in_point_ms;
    const outMs = timeline.out_point_ms;
    if (inMs === null || inMs === undefined || outMs === null || outMs === undefined || outMs <= inMs) {
      return false;
    }

    // Check if any unlocked track exists
    const unlockedTracks = timeline.tracks.filter((t) => !t.is_locked);
    if (unlockedTracks.length === 0) return false;

    // Check if any clip on unlocked tracks touches or falls inside the range
    const clipsTouching = unlockedTracks.flatMap((t) => t.clips).filter(
      (c) => c.start_time_ms < outMs && c.start_time_ms + c.duration_ms > inMs
    );
    if (clipsTouching.length === 0) return false;

    // Step 1: Split clips at inMs boundary
    for (const track of get().timeline?.tracks || []) {
      if (track.is_locked) continue;
      for (const clip of track.clips) {
        if (inMs > clip.start_time_ms && inMs < clip.start_time_ms + clip.duration_ms) {
          get().razorCutClip(clip.id, inMs, true);
        }
      }
    }

    // Step 2: Split clips at outMs boundary
    for (const track of get().timeline?.tracks || []) {
      if (track.is_locked) continue;
      for (const clip of track.clips) {
        if (outMs > clip.start_time_ms && outMs < clip.start_time_ms + clip.duration_ms) {
          get().razorCutClip(clip.id, outMs, true);
        }
      }
    }

    // Step 3: Delete clips fully contained in [inMs, outMs] on unlocked tracks
    let modified = false;
    const deletedClipIds = new Set<string>();

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          const toRemove = track.clips.filter(
            (c) => c.start_time_ms >= inMs - 1 && c.start_time_ms + c.duration_ms <= outMs + 1
          );
          for (const c of toRemove) {
            deletedClipIds.add(c.id);
          }
          if (toRemove.length > 0) {
            track.clips = track.clips.filter((c) => !deletedClipIds.has(c.id));
            modified = true;
          }
        }

        // Clean dangling linked_clip_id references across all tracks
        for (const track of state.timeline.tracks) {
          for (const c of track.clips) {
            if (c.linked_clip_id && deletedClipIds.has(c.linked_clip_id)) {
              c.linked_clip_id = undefined;
            }
          }
        }
      })
    );

    if (modified) {
      useSelectionStore.getState().clearSelection();
      get().pushHistory();
      get().scheduleAutoSave();
      return true;
    }
    return false;
  },

  extractRange: () => {
    const { timeline } = get();
    if (!timeline) return false;
    const inMs = timeline.in_point_ms;
    const outMs = timeline.out_point_ms;
    if (inMs === null || inMs === undefined || outMs === null || outMs === undefined || outMs <= inMs) {
      return false;
    }

    // Check if any unlocked track exists
    const unlockedTracks = timeline.tracks.filter((t) => !t.is_locked);
    if (unlockedTracks.length === 0) return false;

    const clipsTouching = unlockedTracks.flatMap((t) => t.clips).filter(
      (c) => c.start_time_ms < outMs && c.start_time_ms + c.duration_ms > inMs
    );
    if (clipsTouching.length === 0) return false;

    // Step 1: Split clips at inMs boundary
    for (const track of get().timeline?.tracks || []) {
      if (track.is_locked) continue;
      for (const clip of track.clips) {
        if (inMs > clip.start_time_ms && inMs < clip.start_time_ms + clip.duration_ms) {
          get().razorCutClip(clip.id, inMs, true);
        }
      }
    }

    // Step 2: Split clips at outMs boundary
    for (const track of get().timeline?.tracks || []) {
      if (track.is_locked) continue;
      for (const clip of track.clips) {
        if (outMs > clip.start_time_ms && outMs < clip.start_time_ms + clip.duration_ms) {
          get().razorCutClip(clip.id, outMs, true);
        }
      }
    }

    const rangeDur = outMs - inMs;
    const deletedClipIds = new Set<string>();
    let modified = false;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        // Step 3: Remove clips wholly inside [inMs, outMs] on unlocked tracks
        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          const toRemove = track.clips.filter(
            (c) => c.start_time_ms >= inMs - 1 && c.start_time_ms + c.duration_ms <= outMs + 1
          );
          for (const c of toRemove) {
            deletedClipIds.add(c.id);
          }
          if (toRemove.length > 0) {
            track.clips = track.clips.filter((c) => !deletedClipIds.has(c.id));
            modified = true;
          }

          // Step 4: Ripple downstream clips leftward by rangeDur on unlocked tracks
          for (const clip of track.clips) {
            if (clip.start_time_ms >= outMs - 5) {
              clip.start_time_ms = Math.max(0, clip.start_time_ms - rangeDur);
              modified = true;
            }
          }
          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        // Clean dangling linked_clip_id references across all tracks
        for (const track of state.timeline.tracks) {
          for (const c of track.clips) {
            if (c.linked_clip_id && deletedClipIds.has(c.linked_clip_id)) {
              c.linked_clip_id = undefined;
            }
          }
        }

        // Reposition range and recalculate duration
        state.timeline.out_point_ms = inMs;
        recalcDuration(state);
      })
    );

    if (modified) {
      get().setPlayhead(inMs);
      useSelectionStore.getState().clearSelection();
      get().pushHistory();
      get().scheduleAutoSave();
      return true;
    }
    return false;
  },

  // Phase 45: Track Patching & 3-Point Editing
  setTargetTrack: (trackTypeOrId: 'video' | 'audio' | string | null, trackIdOrType?: 'video' | 'audio' | string | null) => {
    let type: 'video' | 'audio' = 'video';
    let id: string | null = null;
    if (trackTypeOrId === 'video' || trackTypeOrId === 'audio') {
      type = trackTypeOrId;
      id = (trackIdOrType as string | null) ?? null;
    } else {
      id = (trackTypeOrId as string | null) ?? null;
      type = (trackIdOrType === 'audio' ? 'audio' : 'video');
    }
    if (type === 'video') {
      const current = get().targetVideoTrackId;
      set({ targetVideoTrackId: current === id ? null : id });
    } else {
      const current = get().targetAudioTrackId;
      set({ targetAudioTrackId: current === id ? null : id });
    }
  },

  insertEdit: (options?: { assetId?: string; durationMs?: number; sourceInMs?: number; sourceOutMs?: number; name?: string }): boolean => {
    const { timeline, playheadMs, targetVideoTrackId, targetAudioTrackId } = get();
    if (!timeline) return false;

    // Resolve target video & audio tracks
    let vTrack = targetVideoTrackId
      ? timeline.tracks.find((t) => t.id === targetVideoTrackId && !t.is_locked)
      : null;
    if (!vTrack) {
      vTrack = timeline.tracks.find(
        (t) => (t.track_type === 'video' || t.track_role === 'video' || t.track_role === 'graphics') && !t.is_locked
      ) || null;
    }

    let aTrack = targetAudioTrackId
      ? timeline.tracks.find((t) => t.id === targetAudioTrackId && !t.is_locked)
      : null;
    if (!aTrack) {
      aTrack = timeline.tracks.find(
        (t) => (t.track_type === 'audio' || ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(t.track_role)) && !t.is_locked
      ) || null;
    }

    if (!vTrack && !aTrack) return false;

    // Resolve 3-point timing
    const inMs = (timeline.in_point_ms !== null && timeline.in_point_ms !== undefined)
      ? timeline.in_point_ms
      : playheadMs;
    const outMs = (timeline.out_point_ms !== null && timeline.out_point_ms !== undefined)
      ? timeline.out_point_ms
      : null;

    let editDuration = options?.durationMs ?? 4000;
    if (outMs !== null && outMs > inMs) {
      editDuration = Math.max(100, outMs - inMs);
    } else if (options?.sourceOutMs !== undefined && options?.sourceInMs !== undefined && options.sourceOutMs > options.sourceInMs) {
      editDuration = Math.max(100, options.sourceOutMs - options.sourceInMs);
    }
    const sourceIn = options?.sourceInMs ?? 0;
    const sourceOut = options?.sourceOutMs ?? (sourceIn + editDuration);

    // Step 1: Split any existing clip that straddles inMs on unlocked target tracks
    if (vTrack) {
      for (const c of vTrack.clips) {
        if (inMs > c.start_time_ms && inMs < c.start_time_ms + c.duration_ms) {
          get().razorCutClip(c.id, inMs, true);
          break;
        }
      }
    }
    if (aTrack && (!vTrack || aTrack.id !== vTrack.id)) {
      for (const c of aTrack.clips) {
        if (inMs > c.start_time_ms && inMs < c.start_time_ms + c.duration_ms) {
          get().razorCutClip(c.id, inMs, true);
          break;
        }
      }
    }

    // Step 2: In produce block, shift all downstream clips on unlocked tracks rightward, and insert the new clip(s)
    let newVideoClipId: string | null = null;
    let newAudioClipId: string | null = null;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        // Shift all clips on unlocked tracks starting at or after inMs
        for (const track of state.timeline.tracks) {
          if (track.is_locked) continue;
          for (const clip of track.clips) {
            if (clip.start_time_ms >= inMs) {
              clip.start_time_ms += editDuration;
            }
          }
          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        // Shift timeline sequence markers after inMs
        if (Array.isArray(state.timeline.markers)) {
          for (const m of state.timeline.markers) {
            if (m.time_ms >= inMs) {
              m.time_ms += editDuration;
            }
          }
        }

        // Create new video clip
        if (vTrack) {
          const svTrack = state.timeline.tracks.find((t) => t.id === vTrack!.id);
          if (svTrack && !svTrack.is_locked) {
            newVideoClipId = crypto.randomUUID();
            const vClip: Clip = {
              id: newVideoClipId,
              track_id: svTrack.id,
              name: options?.name || 'Inserted Video',
              clip_type: 'media',
              start_time_ms: inMs,
              duration_ms: editDuration,
              source_in_ms: sourceIn,
              source_out_ms: sourceOut,
              speed_factor: 1.0,
              is_reversed: false,
              is_frozen: false,
              opacity: 1.0,
              blend_mode: 'normal',
              position_x: 0.5,
              position_y: 0.5,
              scale_x: 1.0,
              scale_y: 1.0,
              rotation: 0.0,
              anchor_x: 0.5,
              anchor_y: 0.5,
              crop_left: 0.0,
              crop_right: 0.0,
              crop_top: 0.0,
              crop_bottom: 0.0,
              volume_db: 0.0,
              fade_in_ms: 0,
              fade_out_ms: 0,
              effects: [],
              keyframes: [],
              asset_id: options?.assetId,
            };
            svTrack.clips.push(vClip);
            svTrack.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
          }
        }

        // Create new audio clip
        if (aTrack) {
          const saTrack = state.timeline.tracks.find((t) => t.id === aTrack!.id);
          if (saTrack && !saTrack.is_locked) {
            newAudioClipId = crypto.randomUUID();
            const aClip: Clip = {
              id: newAudioClipId,
              track_id: saTrack.id,
              name: options?.name ? `${options.name} (Audio)` : 'Inserted Audio',
              clip_type: 'media',
              start_time_ms: inMs,
              duration_ms: editDuration,
              source_in_ms: sourceIn,
              source_out_ms: sourceOut,
              speed_factor: 1.0,
              is_reversed: false,
              is_frozen: false,
              opacity: 1.0,
              blend_mode: 'normal',
              position_x: 0.5,
              position_y: 0.5,
              scale_x: 1.0,
              scale_y: 1.0,
              rotation: 0.0,
              anchor_x: 0.5,
              anchor_y: 0.5,
              crop_left: 0.0,
              crop_right: 0.0,
              crop_top: 0.0,
              crop_bottom: 0.0,
              volume_db: 0.0,
              fade_in_ms: 0,
              fade_out_ms: 0,
              effects: [],
              keyframes: [],
              asset_id: options?.assetId,
            };
            saTrack.clips.push(aClip);
            saTrack.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
          }
        }

        // Cross-link new video and audio clips
        if (newVideoClipId && newAudioClipId) {
          const svTrack = state.timeline.tracks.find((t) => t.id === vTrack!.id);
          const saTrack = state.timeline.tracks.find((t) => t.id === aTrack!.id);
          const cv = svTrack?.clips.find((c) => c.id === newVideoClipId);
          const ca = saTrack?.clips.find((c) => c.id === newAudioClipId);
          if (cv && ca) {
            cv.linked_clip_id = ca.id;
            ca.linked_clip_id = cv.id;
          }
        }

        recalcDuration(state);
      })
    );

    get().setPlayhead(inMs + editDuration);
    if (newVideoClipId) {
      get().selectClip(newVideoClipId);
      useSelectionStore.getState().selectClips([newVideoClipId]);
    } else if (newAudioClipId) {
      get().selectClip(newAudioClipId);
      useSelectionStore.getState().selectClips([newAudioClipId]);
    }
    get().pushHistory();
    get().scheduleAutoSave();
    return true;
  },

  overwriteEdit: (options?: { assetId?: string; durationMs?: number; sourceInMs?: number; sourceOutMs?: number; name?: string; speedFactor?: number; startTimeMs?: number }): boolean => {
    const { timeline, playheadMs, targetVideoTrackId, targetAudioTrackId } = get();
    if (!timeline) return false;

    // Resolve target video & audio tracks
    let vTrack = targetVideoTrackId
      ? timeline.tracks.find((t) => t.id === targetVideoTrackId && !t.is_locked)
      : null;
    if (!vTrack) {
      vTrack = timeline.tracks.find(
        (t) => (t.track_type === 'video' || t.track_role === 'video' || t.track_role === 'graphics') && !t.is_locked
      ) || null;
    }

    let aTrack = targetAudioTrackId
      ? timeline.tracks.find((t) => t.id === targetAudioTrackId && !t.is_locked)
      : null;
    if (!aTrack) {
      aTrack = timeline.tracks.find(
        (t) => (t.track_type === 'audio' || ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(t.track_role)) && !t.is_locked
      ) || null;
    }

    if (!vTrack && !aTrack) return false;

    // Resolve 3-point timing
    const inMs = (timeline.in_point_ms !== null && timeline.in_point_ms !== undefined)
      ? timeline.in_point_ms
      : playheadMs;
    const outMs = (timeline.out_point_ms !== null && timeline.out_point_ms !== undefined)
      ? timeline.out_point_ms
      : null;

    let editDuration = options?.durationMs ?? 4000;
    if (options?.durationMs !== undefined) {
      editDuration = options.durationMs;
    } else if (outMs !== null && outMs > inMs) {
      editDuration = Math.max(100, outMs - inMs);
    } else if (options?.sourceOutMs !== undefined && options?.sourceInMs !== undefined && options.sourceOutMs > options.sourceInMs) {
      editDuration = Math.max(100, options.sourceOutMs - options.sourceInMs);
    }
    const sourceIn = options?.sourceInMs ?? 0;
    const sourceOut = options?.sourceOutMs !== undefined ? options.sourceOutMs : (sourceIn + editDuration);

    const editStart = options?.startTimeMs !== undefined ? options.startTimeMs : inMs;
    const editEnd = editStart + editDuration;

    const targetTrackIds = new Set<string>();
    if (vTrack) targetTrackIds.add(vTrack.id);
    if (aTrack) targetTrackIds.add(aTrack.id);

    let newVideoClipId: string | null = null;
    let newAudioClipId: string | null = null;

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;

        for (const trackId of targetTrackIds) {
          const track = state.timeline.tracks.find((t) => t.id === trackId);
          if (!track || track.is_locked) continue;

          const remainingClips: Clip[] = [];
          for (const clip of track.clips) {
            const cStart = clip.start_time_ms;
            const cEnd = cStart + clip.duration_ms;

            if (cEnd <= editStart || cStart >= editEnd) {
              remainingClips.push(clip);
            } else if (cStart >= editStart && cEnd <= editEnd) {
              // Engulfed: removed
              continue;
            } else if (cStart < editStart && cEnd > editEnd) {
              const speed = clip.speed_factor && clip.speed_factor > 0 ? clip.speed_factor : 1.0;
              const leftPiece: Clip = {
                ...clip,
                duration_ms: editStart - cStart,
                source_out_ms: clip.source_in_ms + Math.round((editStart - cStart) * speed),
              };
              const rightPiece: Clip = {
                ...clip,
                id: crypto.randomUUID(),
                start_time_ms: editEnd,
                duration_ms: cEnd - editEnd,
                source_in_ms: clip.source_in_ms + Math.round((editEnd - cStart) * speed),
              };
              remainingClips.push(leftPiece, rightPiece);
            } else if (cStart < editStart && cEnd > editStart) {
              const speed = clip.speed_factor && clip.speed_factor > 0 ? clip.speed_factor : 1.0;
              const truncated: Clip = {
                ...clip,
                duration_ms: editStart - cStart,
                source_out_ms: clip.source_in_ms + Math.round((editStart - cStart) * speed),
              };
              remainingClips.push(truncated);
            } else if (cStart < editEnd && cEnd > editEnd) {
              const speed = clip.speed_factor && clip.speed_factor > 0 ? clip.speed_factor : 1.0;
              const headCut = editEnd - cStart;
              const truncated: Clip = {
                ...clip,
                start_time_ms: editEnd,
                duration_ms: cEnd - editEnd,
                source_in_ms: clip.source_in_ms + Math.round(headCut * speed),
              };
              remainingClips.push(truncated);
            }
          }
          track.clips = remainingClips;

          const isVideo = track.track_type === 'video' || track.track_role === 'video' || track.track_role === 'graphics';
          const newId = crypto.randomUUID();
          if (isVideo) {
            newVideoClipId = newId;
          } else {
            newAudioClipId = newId;
          }

          const newClip: Clip = {
            id: newId,
            track_id: track.id,
            name: options?.name ? (isVideo ? options.name : `${options.name} (Audio)`) : (isVideo ? 'Overwritten Video' : 'Overwritten Audio'),
            clip_type: 'media',
            start_time_ms: editStart,
            duration_ms: editDuration,
            source_in_ms: sourceIn,
            source_out_ms: sourceOut,
            speed_factor: options?.speedFactor !== undefined ? options.speedFactor : 1.0,
            is_reversed: false,
            is_frozen: false,
            opacity: 1.0,
            blend_mode: 'normal',
            position_x: 0.5,
            position_y: 0.5,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            anchor_x: 0.5,
            anchor_y: 0.5,
            crop_left: 0.0,
            crop_right: 0.0,
            crop_top: 0.0,
            crop_bottom: 0.0,
            volume_db: 0.0,
            fade_in_ms: 0,
            fade_out_ms: 0,
            effects: [],
            keyframes: [],
            asset_id: options?.assetId,
          };
          track.clips.push(newClip);
          track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
        }

        if (newVideoClipId && newAudioClipId && vTrack && aTrack) {
          const svTrack = state.timeline.tracks.find((t) => t.id === vTrack!.id);
          const saTrack = state.timeline.tracks.find((t) => t.id === aTrack!.id);
          const cv = svTrack?.clips.find((c) => c.id === newVideoClipId);
          const ca = saTrack?.clips.find((c) => c.id === newAudioClipId);
          if (cv && ca) {
            cv.linked_clip_id = ca.id;
            ca.linked_clip_id = cv.id;
          }
        }

        recalcDuration(state);
      })
    );

    get().setPlayhead(editEnd);
    if (newVideoClipId) {
      get().selectClip(newVideoClipId);
      useSelectionStore.getState().selectClips([newVideoClipId]);
    } else if (newAudioClipId) {
      get().selectClip(newAudioClipId);
      useSelectionStore.getState().selectClips([newAudioClipId]);
    }
    get().pushHistory();
    get().scheduleAutoSave();
    return true;
  },

  replaceEdit: (
    clipId?: string,
    assetIdOrOptions?: string | ReplaceEditOptions,
    extraOptions?: ReplaceEditOptions
  ): boolean => {
    const { timeline, playheadMs, selectedClipId, targetVideoTrackId, sourceAsset, sourcePlayheadMs, sourceInPointMs, sourceOutPointMs } = get();
    if (!timeline) return false;

    let targetClip: Clip | null = null;
    let targetTrack: Track | null = null;

    const candidateId = clipId || selectedClipId;
    if (candidateId) {
      for (const t of timeline.tracks) {
        const c = t.clips.find((item) => item.id === candidateId);
        if (c) {
          targetClip = c;
          targetTrack = t;
          break;
        }
      }
    } else {
      const candidateTrack = targetVideoTrackId
        ? timeline.tracks.find((t) => t.id === targetVideoTrackId && !t.is_locked)
        : timeline.tracks.find((t) => !t.is_locked);
      if (candidateTrack) {
        targetClip = candidateTrack.clips.find(
          (c) => playheadMs >= c.start_time_ms && playheadMs < c.start_time_ms + c.duration_ms
        ) || null;
        targetTrack = candidateTrack;
      }
    }

    if (!targetClip || !targetTrack || targetTrack.is_locked) return false;

    // Resolve options
    let opt: ReplaceEditOptions = {};
    let targetAssetId: string | undefined = undefined;

    if (typeof assetIdOrOptions === 'string') {
      targetAssetId = assetIdOrOptions;
      if (extraOptions) opt = extraOptions;
    } else if (assetIdOrOptions && typeof assetIdOrOptions === 'object') {
      opt = assetIdOrOptions;
      targetAssetId = opt.assetId;
    } else if (extraOptions) {
      opt = extraOptions;
      targetAssetId = opt.assetId;
    }

    const resolvedAsset: Asset | null =
      opt.asset ||
      (targetAssetId && sourceAsset?.id === targetAssetId ? sourceAsset : null) ||
      sourceAsset ||
      (targetAssetId ? { id: targetAssetId, file_name: 'Replaced Asset', duration_ms: 4000 } as Asset : null);

    const mode = opt.mode || 'from_in';

    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === targetTrack!.id);
        const clip = track?.clips.find((c) => c.id === targetClip!.id);
        if (!clip) return;

        if (resolvedAsset) {
          clip.asset_id = resolvedAsset.id;
          clip.name = resolvedAsset.file_name || `Replaced (${clip.name})`;
        } else if (targetAssetId) {
          clip.asset_id = targetAssetId;
          clip.name = `Replaced (${clip.name})`;
        }

        const origSpeed = clip.speed_factor && clip.speed_factor > 0 ? clip.speed_factor : 1.0;
        const assetDuration = Math.max(100, resolvedAsset?.duration_ms ?? 4000);

        if (mode === 'from_in') {
          const sIn = opt.customSourceInMs !== undefined ? opt.customSourceInMs : (sourceInPointMs ?? 0);
          const safeIn = Math.max(0, Math.min(sIn, assetDuration - 33));
          const neededSourceDur = Math.round(clip.duration_ms * origSpeed);
          clip.source_in_ms = safeIn;
          clip.source_out_ms = safeIn + neededSourceDur;
        } else if (mode === 'from_playhead') {
          const timelineOffset = Math.max(0, Math.min(clip.duration_ms, playheadMs - clip.start_time_ms));
          const sourceOffset = Math.round(timelineOffset * origSpeed);
          const sPlayhead = sourcePlayheadMs || 0;
          const sStart = Math.max(0, sPlayhead - sourceOffset);
          clip.source_in_ms = sStart;
          clip.source_out_ms = sStart + Math.round(clip.duration_ms * origSpeed);
        } else if (mode === 'fit_to_fill') {
          const sIn = opt.customSourceInMs !== undefined ? opt.customSourceInMs : (sourceInPointMs ?? 0);
          const sOut = opt.customSourceOutMs !== undefined
            ? opt.customSourceOutMs
            : (sourceOutPointMs && sourceOutPointMs > sIn ? sourceOutPointMs : assetDuration);
          const srcDur = Math.max(33, sOut - sIn);
          const destDur = Math.max(33, clip.duration_ms);
          const calculatedSpeed = srcDur / destDur;
          const clampedSpeed = Math.min(10.0, Math.max(0.1, Math.round(calculatedSpeed * 1000) / 1000));
          clip.speed_factor = clampedSpeed;
          clip.source_in_ms = sIn;
          clip.source_out_ms = sOut;
        }

        // Maintain linked audio/video clip if target clip is part of linked A/V
        if (clip.linked_clip_id) {
          for (const otherTrack of state.timeline.tracks) {
            if (otherTrack.is_locked) continue;
            const linkedClip = otherTrack.clips.find((c) => c.id === clip.linked_clip_id);
            if (linkedClip) {
              if (resolvedAsset) {
                linkedClip.asset_id = resolvedAsset.id;
                linkedClip.name = `${resolvedAsset.file_name} (Audio)`;
              }
              linkedClip.source_in_ms = clip.source_in_ms;
              linkedClip.source_out_ms = clip.source_out_ms;
              linkedClip.speed_factor = clip.speed_factor;
            }
          }
        }
      })
    );

    get().pushHistory();
    get().scheduleAutoSave();
    return true;
  },

  fitToFillEdit: (clipId?: string): boolean => {
    return get().replaceEdit(clipId, undefined, { mode: 'fit_to_fill' });
  },

  resolveFourPointEdit: (resolution: FourPointResolution): boolean => {
    const { fourPointConflict } = get();
    if (!fourPointConflict) return false;

    let success = false;
    if (resolution === 'fit_to_fill') {
      const clampedSpeed = Math.min(10.0, Math.max(0.1, Math.round(fourPointConflict.speedFactor * 1000) / 1000));
      success = get().overwriteEdit({
        assetId: fourPointConflict.asset.id,
        name: fourPointConflict.asset.file_name,
        sourceInMs: fourPointConflict.sourceInMs,
        sourceOutMs: fourPointConflict.sourceOutMs,
        durationMs: fourPointConflict.sequenceDurationMs,
        startTimeMs: fourPointConflict.sequenceInMs,
        speedFactor: clampedSpeed,
      });
    } else if (resolution === 'ignore_source_out') {
      success = get().overwriteEdit({
        assetId: fourPointConflict.asset.id,
        name: fourPointConflict.asset.file_name,
        sourceInMs: fourPointConflict.sourceInMs,
        sourceOutMs: fourPointConflict.sourceInMs + fourPointConflict.sequenceDurationMs,
        durationMs: fourPointConflict.sequenceDurationMs,
        startTimeMs: fourPointConflict.sequenceInMs,
        speedFactor: 1.0,
      });
    } else if (resolution === 'ignore_sequence_out') {
      success = get().overwriteEdit({
        assetId: fourPointConflict.asset.id,
        name: fourPointConflict.asset.file_name,
        sourceInMs: fourPointConflict.sourceInMs,
        sourceOutMs: fourPointConflict.sourceOutMs,
        durationMs: fourPointConflict.sourceDurationMs,
        startTimeMs: fourPointConflict.sequenceInMs,
        speedFactor: 1.0,
      });
    } else if (resolution === 'ignore_sequence_in') {
      const startMs = Math.max(0, fourPointConflict.sequenceOutMs - fourPointConflict.sourceDurationMs);
      const durMs = fourPointConflict.sequenceOutMs - startMs;
      success = get().overwriteEdit({
        assetId: fourPointConflict.asset.id,
        name: fourPointConflict.asset.file_name,
        sourceInMs: fourPointConflict.sourceInMs,
        sourceOutMs: fourPointConflict.sourceInMs + durMs,
        durationMs: durMs,
        startTimeMs: startMs,
        speedFactor: 1.0,
      });
    }

    set({ fourPointConflict: null });
    return success;
  },

  // Phase 46: Source Monitor & Media Selection
  loadSourceAsset: (asset: Asset) => {
    const duration = Math.max(100, asset.duration_ms ?? 4000);
    set({
      sourceAsset: asset,
      sourcePlayheadMs: 0,
      sourceInPointMs: 0,
      sourceOutPointMs: duration,
      sourceIsPlaying: false,
      activeMonitorFocus: 'source',
    });
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('tamil_ai_forge_source_session') || '{}');
        localStorage.setItem('tamil_ai_forge_source_session', JSON.stringify({
          ...existing,
          assetId: asset.id,
          sourceInPointMs: 0,
          sourceOutPointMs: duration,
          monitorFocus: 'source',
        }));
      }
    } catch {}
  },

  closeSourceAsset: () => {
    set({
      sourceAsset: null,
      sourcePlayheadMs: 0,
      sourceInPointMs: null,
      sourceOutPointMs: null,
      sourceIsPlaying: false,
    });
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('tamil_ai_forge_source_session') || '{}');
        localStorage.setItem('tamil_ai_forge_source_session', JSON.stringify({
          ...existing,
          assetId: null,
          sourceInPointMs: null,
          sourceOutPointMs: null,
        }));
      }
    } catch {}
  },

  setSourcePlayhead: (ms: number) => {
    const { sourceAsset } = get();
    const duration = Math.max(100, sourceAsset?.duration_ms ?? 60000);
    set({ sourcePlayheadMs: Math.max(0, Math.min(ms, duration)) });
  },

  setSourceInPoint: (ms?: number) => {
    const { sourceAsset, sourcePlayheadMs, sourceOutPointMs } = get();
    const duration = Math.max(100, sourceAsset?.duration_ms ?? 60000);
    const target = ms !== undefined ? ms : sourcePlayheadMs;
    const clampedIn = Math.max(0, Math.min(target, duration));
    let finalOut = sourceOutPointMs;
    if (finalOut !== null && clampedIn >= finalOut) {
      finalOut = Math.min(duration, clampedIn + 33);
    }
    set({ sourceInPointMs: clampedIn, sourceOutPointMs: finalOut });
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('tamil_ai_forge_source_session') || '{}');
        localStorage.setItem('tamil_ai_forge_source_session', JSON.stringify({
          ...existing,
          sourceInPointMs: clampedIn,
          sourceOutPointMs: finalOut,
        }));
      }
    } catch {}
  },

  setSourceOutPoint: (ms?: number) => {
    const { sourceAsset, sourcePlayheadMs, sourceInPointMs } = get();
    const duration = Math.max(100, sourceAsset?.duration_ms ?? 60000);
    const target = ms !== undefined ? ms : sourcePlayheadMs;
    const clampedOut = Math.max(0, Math.min(target, duration));
    let finalIn = sourceInPointMs ?? 0;
    if (clampedOut <= finalIn) {
      finalIn = Math.max(0, clampedOut - 33);
    }
    set({ sourceInPointMs: finalIn, sourceOutPointMs: clampedOut });
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('tamil_ai_forge_source_session') || '{}');
        localStorage.setItem('tamil_ai_forge_source_session', JSON.stringify({
          ...existing,
          sourceInPointMs: finalIn,
          sourceOutPointMs: clampedOut,
        }));
      }
    } catch {}
  },

  clearSourceInOut: () => {
    const { sourceAsset } = get();
    const duration = Math.max(100, sourceAsset?.duration_ms ?? 4000);
    set({ sourceInPointMs: 0, sourceOutPointMs: duration });
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('tamil_ai_forge_source_session') || '{}');
        localStorage.setItem('tamil_ai_forge_source_session', JSON.stringify({
          ...existing,
          sourceInPointMs: 0,
          sourceOutPointMs: duration,
        }));
      }
    } catch {}
  },

  toggleSourcePlay: () => {
    set((state) => ({
      sourceIsPlaying: !state.sourceIsPlaying,
      isPlaying: !state.sourceIsPlaying ? false : state.isPlaying,
    }));
  },

  setSourceIsPlaying: (playing: boolean) => {
    set((state) => ({
      sourceIsPlaying: playing,
      isPlaying: playing ? false : state.isPlaying,
    }));
  },

  stepSourceFrame: (frames: number) => {
    const { sourceAsset, sourcePlayheadMs } = get();
    const duration = Math.max(100, sourceAsset?.duration_ms ?? 60000);
    const deltaMs = frames * 33;
    set({ sourcePlayheadMs: Math.max(0, Math.min(duration, sourcePlayheadMs + deltaMs)) });
  },

  setActiveMonitorFocus: (focus: MonitorFocus) => {
    set({ activeMonitorFocus: focus });
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('tamil_ai_forge_source_session') || '{}');
        localStorage.setItem('tamil_ai_forge_source_session', JSON.stringify({
          ...existing,
          monitorFocus: focus,
        }));
      }
    } catch {}
  },

  toggleMonitorFocus: () => {
    set((state) => {
      const nextFocus = state.activeMonitorFocus === 'source' ? 'program' : 'source';
      try {
        if (typeof localStorage !== 'undefined') {
          const existing = JSON.parse(localStorage.getItem('tamil_ai_forge_source_session') || '{}');
          localStorage.setItem('tamil_ai_forge_source_session', JSON.stringify({
            ...existing,
            monitorFocus: nextFocus,
          }));
        }
      } catch {}
      return { activeMonitorFocus: nextFocus };
    });
  },

  setMonitorLayout: (layout: MonitorLayout) => {
    set({ monitorLayout: layout });
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('tamil_ai_forge_source_session') || '{}');
        localStorage.setItem('tamil_ai_forge_source_session', JSON.stringify({
          ...existing,
          monitorLayout: layout,
        }));
      }
    } catch {}
  },

  insertFromSource: (): boolean => {
    const { sourceAsset, sourceInPointMs, sourceOutPointMs, timeline } = get();
    if (!sourceAsset) return false;
    const duration = Math.max(100, sourceAsset.duration_ms ?? 4000);
    const sIn = sourceInPointMs !== null && sourceInPointMs !== undefined ? sourceInPointMs : 0;
    const sOut = sourceOutPointMs !== null && sourceOutPointMs !== undefined && sourceOutPointMs > sIn
      ? sourceOutPointMs
      : duration;

    // Phase 49: Check for 4-Point Conflict with Sequence In/Out
    if (timeline && sourceInPointMs !== null && sourceOutPointMs !== null && sourceOutPointMs > sourceInPointMs) {
      const seqIn = timeline.in_point_ms;
      const seqOut = timeline.out_point_ms;
      if (seqIn !== null && seqIn !== undefined && seqOut !== null && seqOut !== undefined && seqOut > seqIn) {
        const srcDur = sOut - sIn;
        const seqDur = seqOut - seqIn;
        if (Math.abs(srcDur - seqDur) > 33) {
          const speedFactor = srcDur / seqDur;
          get().openFourPointModal({
            sourceInMs: sIn,
            sourceOutMs: sOut,
            sourceDurationMs: srcDur,
            sequenceInMs: seqIn,
            sequenceOutMs: seqOut,
            sequenceDurationMs: seqDur,
            speedFactor,
            asset: sourceAsset,
            targetVideoTrackId: get().targetVideoTrackId,
            targetAudioTrackId: get().targetAudioTrackId,
          });
          return false;
        }
      }
    }

    return get().insertEdit({
      assetId: sourceAsset.id,
      sourceInMs: sIn,
      sourceOutMs: sOut,
      durationMs: Math.max(33, sOut - sIn),
      name: sourceAsset.file_name,
    });
  },

  overwriteFromSource: (): boolean => {
    const { sourceAsset, sourceInPointMs, sourceOutPointMs, timeline } = get();
    if (!sourceAsset) return false;
    const duration = Math.max(100, sourceAsset.duration_ms ?? 4000);
    const sIn = sourceInPointMs !== null && sourceInPointMs !== undefined ? sourceInPointMs : 0;
    const sOut = sourceOutPointMs !== null && sourceOutPointMs !== undefined && sourceOutPointMs > sIn
      ? sourceOutPointMs
      : duration;

    // Phase 49: Check for 4-Point Conflict with Sequence In/Out
    if (timeline && sourceInPointMs !== null && sourceOutPointMs !== null && sourceOutPointMs > sourceInPointMs) {
      const seqIn = timeline.in_point_ms;
      const seqOut = timeline.out_point_ms;
      if (seqIn !== null && seqIn !== undefined && seqOut !== null && seqOut !== undefined && seqOut > seqIn) {
        const srcDur = sOut - sIn;
        const seqDur = seqOut - seqIn;
        if (Math.abs(srcDur - seqDur) > 33) {
          const speedFactor = srcDur / seqDur;
          get().openFourPointModal({
            sourceInMs: sIn,
            sourceOutMs: sOut,
            sourceDurationMs: srcDur,
            sequenceInMs: seqIn,
            sequenceOutMs: seqOut,
            sequenceDurationMs: seqDur,
            speedFactor,
            asset: sourceAsset,
            targetVideoTrackId: get().targetVideoTrackId,
            targetAudioTrackId: get().targetAudioTrackId,
          });
          return false;
        }
      }
    }

    return get().overwriteEdit({
      assetId: sourceAsset.id,
      sourceInMs: sIn,
      sourceOutMs: sOut,
      durationMs: Math.max(33, sOut - sIn),
      name: sourceAsset.file_name,
    });
  },

  // Phase 47: Match Frame & Media Locator
  setHighlightedAssetId: (id: string | null) => {
    set({ highlightedAssetId: id });
  },

  matchFrame: (options?: { trackId?: string; clipId?: string } | string): boolean => {
    const opts = typeof options === 'string' ? { clipId: options } : options;
    const { timeline, playheadMs, selectedClipId, targetVideoTrackId, targetAudioTrackId } = get();
    if (!timeline) return false;

    let targetClip: Clip | null = null;
    let targetTrack: Track | null = null;

    // 1. If explicit clipId or currently selected clip
    const candidateClipId = opts?.clipId || selectedClipId;
    if (candidateClipId) {
      for (const t of timeline.tracks) {
        const c = t.clips.find((item) => item.id === candidateClipId);
        if (c) {
          targetClip = c;
          targetTrack = t;
          break;
        }
      }
    }

    // 2. If explicit trackId provided in options
    if (!targetClip && opts?.trackId) {
      const t = timeline.tracks.find((item) => item.id === opts.trackId);
      if (t) {
        const c = t.clips.find((item) => playheadMs >= item.start_time_ms && playheadMs < item.start_time_ms + item.duration_ms);
        if (c) {
          targetClip = c;
          targetTrack = t;
        }
      }
    }

    // 3. Check patched video destination track [V1]
    if (!targetClip && targetVideoTrackId) {
      const t = timeline.tracks.find((item) => item.id === targetVideoTrackId);
      if (t) {
        const c = t.clips.find((item) => playheadMs >= item.start_time_ms && playheadMs < item.start_time_ms + item.duration_ms);
        if (c) {
          targetClip = c;
          targetTrack = t;
        }
      }
    }

    // 4. Check patched audio destination track [A1]
    if (!targetClip && targetAudioTrackId) {
      const t = timeline.tracks.find((item) => item.id === targetAudioTrackId);
      if (t) {
        const c = t.clips.find((item) => playheadMs >= item.start_time_ms && playheadMs < item.start_time_ms + item.duration_ms);
        if (c) {
          targetClip = c;
          targetTrack = t;
        }
      }
    }

    // 5. Fallback: inspect all video tracks (top-to-bottom), then audio tracks
    if (!targetClip) {
      const sortedTracks = [...timeline.tracks].sort((a, b) => {
        if (a.track_type === 'video' && b.track_type !== 'video') return -1;
        if (a.track_type !== 'video' && b.track_type === 'video') return 1;
        return a.order_index - b.order_index;
      });
      for (const t of sortedTracks) {
        const c = t.clips.find((item) => playheadMs >= item.start_time_ms && playheadMs < item.start_time_ms + item.duration_ms);
        if (c) {
          targetClip = c;
          targetTrack = t;
          break;
        }
      }
    }

    if (!targetClip || !targetClip.asset_id) return false;

    // Locate master asset in project store
    let asset = useProjectStore.getState().getAsset(targetClip.asset_id);
    if (!asset) {
      asset = useProjectStore.getState().assets.find((a) => a.id === targetClip!.asset_id);
    }
    if (!asset) {
      asset = {
        id: targetClip.asset_id,
        project_id: timeline.project_id,
        asset_type: (targetTrack?.track_type === 'audio' ? 'audio' : 'video') as any,
        file_name: targetClip.name || 'Matched Asset',
        storage_key: `/storage/${targetClip.asset_id}`,
        file_size_bytes: 10000000,
        mime_type: targetTrack?.track_type === 'audio' ? 'audio/mp3' : 'video/mp4',
        duration_ms: targetClip.source_out_ms > 0 ? targetClip.source_out_ms : (targetClip.duration_ms || 4000),
        has_proxy: false,
        tags: [],
        is_favorite: false,
        folder_path: '/',
        created_at: new Date().toISOString(),
      };
    }

    // Frame-accurate source playhead calculation
    const speed = targetClip.speed_factor && targetClip.speed_factor > 0 ? targetClip.speed_factor : 1.0;
    let offsetMs = 0;
    if (playheadMs >= targetClip.start_time_ms && playheadMs <= targetClip.start_time_ms + targetClip.duration_ms) {
      offsetMs = (playheadMs - targetClip.start_time_ms) * speed;
    }
    let targetSourcePlayhead = (targetClip.source_in_ms ?? 0) + offsetMs;
    if (targetClip.is_reversed) {
      targetSourcePlayhead = (targetClip.source_out_ms ?? (asset.duration_ms || 4000)) - offsetMs;
    }
    const maxDur = asset.duration_ms || (targetClip.source_out_ms || 60000);
    targetSourcePlayhead = Math.max(0, Math.min(targetSourcePlayhead, maxDur));

    get().loadSourceAsset(asset);
    get().setSourcePlayhead(Math.round(targetSourcePlayhead));
    get().setSourceInPoint(targetClip.source_in_ms ?? 0);
    get().setSourceOutPoint(targetClip.source_out_ms ?? maxDur);
    get().setActiveMonitorFocus('source');

    return true;
  },

  reverseMatchFrame: (): boolean => {
    const { timeline, sourceAsset, sourcePlayheadMs, playheadMs } = get();
    if (!timeline || !sourceAsset) return false;

    const matchingClips: Array<{ clip: Clip; track: Track; sequenceTimeMs: number }> = [];

    for (const t of timeline.tracks) {
      for (const c of t.clips) {
        if (c.asset_id === sourceAsset.id) {
          const sIn = c.source_in_ms ?? 0;
          const sOut = c.source_out_ms ?? (c.duration_ms || 4000);
          if (sourcePlayheadMs >= sIn && sourcePlayheadMs <= sOut) {
            const speed = c.speed_factor && c.speed_factor > 0 ? c.speed_factor : 1.0;
            let offsetInClip = 0;
            if (c.is_reversed) {
              offsetInClip = (sOut - sourcePlayheadMs) / speed;
            } else {
              offsetInClip = (sourcePlayheadMs - sIn) / speed;
            }
            const seqTime = c.start_time_ms + offsetInClip;
            matchingClips.push({ clip: c, track: t, sequenceTimeMs: seqTime });
          } else {
            matchingClips.push({ clip: c, track: t, sequenceTimeMs: c.start_time_ms });
          }
        }
      }
    }

    if (matchingClips.length === 0) return false;

    matchingClips.sort((a, b) => a.sequenceTimeMs - b.sequenceTimeMs);

    // If multiple instances exist, cycle to the next one chronologically after current playhead
    const nextMatch = matchingClips.find((m) => m.sequenceTimeMs > playheadMs + 50) || matchingClips[0];

    get().setPlayhead(Math.round(nextMatch.sequenceTimeMs));
    get().selectClip(nextMatch.clip.id);
    useSelectionStore.getState().selectClips([nextMatch.clip.id]);
    get().setActiveMonitorFocus('program');

    return true;
  },

  findAssetTimelineOccurrences: (assetId: string): TimelineOccurrence[] => {
    const { timeline } = get();
    if (!timeline) return [];

    const occurrences: TimelineOccurrence[] = [];
    for (const t of timeline.tracks) {
      for (const c of t.clips) {
        if (c.asset_id === assetId) {
          occurrences.push({
            clipId: c.id,
            clipName: c.name,
            trackId: t.id,
            trackName: t.name,
            trackType: t.track_type,
            startMs: c.start_time_ms,
            durationMs: c.duration_ms,
            sourceInMs: c.source_in_ms ?? 0,
            sourceOutMs: c.source_out_ms ?? c.duration_ms,
          });
        }
      }
    }

    return occurrences.sort((a, b) => a.startMs - b.startMs);
  },

  jumpToTimelineOccurrence: (clipId: string): void => {
    const { timeline } = get();
    if (!timeline) return;

    for (const t of timeline.tracks) {
      const c = t.clips.find((item) => item.id === clipId);
      if (c) {
        get().setPlayhead(c.start_time_ms);
        get().selectClip(c.id);
        useSelectionStore.getState().selectClips([c.id]);
        get().setActiveMonitorFocus('program');
        break;
      }
    }
  },

  // Phase 48: Dynamic 2-Up Trim Preview & Precision Cut Monitor
  startTrimPreview: ({
    tool,
    clipId,
    edge = 'right',
    predClipId,
    succClipId,
  }: {
    tool: TrimToolType;
    clipId: string;
    edge?: 'left' | 'right';
    predClipId?: string;
    succClipId?: string;
  }) => {
    const { timeline } = get();
    if (!timeline) return;

    let targetTrack: Track | null = null;
    let targetClip: Clip | null = null;
    for (const t of timeline.tracks) {
      const c = t.clips.find((item) => item.id === clipId);
      if (c) {
        targetTrack = t;
        targetClip = c;
        break;
      }
    }
    if (!targetClip || !targetTrack || targetTrack.is_locked) return;

    // Snapshot current timeline for cancellation revert
    trimInitialTimelineSnapshot = JSON.parse(JSON.stringify(timeline));

    const sortedClips = [...targetTrack.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
    const clipIdx = sortedClips.findIndex((c) => c.id === clipId);
    const adjacentPred = clipIdx > 0 ? sortedClips[clipIdx - 1] : null;
    const adjacentSucc = clipIdx < sortedClips.length - 1 ? sortedClips[clipIdx + 1] : null;

    let predClip: Clip | null = null;
    let succClip: Clip | null = null;

    if (tool === 'roll') {
      predClip = (predClipId ? sortedClips.find(c => c.id === predClipId) : null) || adjacentPred || targetClip;
      succClip = (succClipId ? sortedClips.find(c => c.id === succClipId) : null) || (predClip.id === targetClip.id ? adjacentSucc : targetClip);
    } else {
      predClip = adjacentPred;
      succClip = adjacentSucc;
    }

    const fps = useProjectStore.getState().activeProject?.settings?.fps || 30;
    const frameMs = 1000 / fps;

    let outgoingClipId: string | null = null;
    let incomingClipId: string | null = null;
    let outgoingFrameMs = 0;
    let incomingFrameMs = 0;

    if (tool === 'roll') {
      outgoingClipId = predClip ? predClip.id : targetClip.id;
      incomingClipId = succClip ? succClip.id : targetClip.id;
      const predSpeed = (predClip?.speed_factor && predClip.speed_factor > 0) ? predClip.speed_factor : 1.0;
      outgoingFrameMs = predClip ? Math.max(0, predClip.source_in_ms + predClip.duration_ms * predSpeed - frameMs) : 0;
      incomingFrameMs = succClip ? succClip.source_in_ms : 0;
    } else if (tool === 'slip') {
      outgoingClipId = targetClip.id;
      incomingClipId = targetClip.id;
      outgoingFrameMs = targetClip.source_in_ms;
      incomingFrameMs = Math.max(0, targetClip.source_out_ms - frameMs);
    } else if (tool === 'slide') {
      outgoingClipId = predClip ? predClip.id : targetClip.id;
      incomingClipId = succClip ? succClip.id : targetClip.id;
      outgoingFrameMs = predClip ? Math.max(0, predClip.source_in_ms + predClip.duration_ms * ((predClip.speed_factor || 1.0)) - frameMs) : targetClip.source_in_ms;
      incomingFrameMs = succClip ? succClip.source_in_ms : Math.max(0, targetClip.source_out_ms - frameMs);
    } else {
      // ripple or trim
      if (edge === 'left') {
        outgoingClipId = predClip ? predClip.id : null;
        incomingClipId = targetClip.id;
        outgoingFrameMs = predClip ? Math.max(0, predClip.source_in_ms + predClip.duration_ms * ((predClip.speed_factor || 1.0)) - frameMs) : targetClip.start_time_ms;
        incomingFrameMs = targetClip.source_in_ms;
      } else {
        outgoingClipId = targetClip.id;
        incomingClipId = succClip ? succClip.id : null;
        outgoingFrameMs = Math.max(0, targetClip.source_out_ms - frameMs);
        incomingFrameMs = succClip ? succClip.source_in_ms : targetClip.start_time_ms + targetClip.duration_ms;
      }
    }

    const outClipObj = outgoingClipId ? targetTrack.clips.find(c => c.id === outgoingClipId) : targetClip;
    const inClipObj = incomingClipId ? targetTrack.clips.find(c => c.id === incomingClipId) : targetClip;
    const getAsset = useProjectStore.getState().getAsset;
    const outAsset = outClipObj?.asset_id ? getAsset(outClipObj.asset_id) : undefined;
    const inAsset = inClipObj?.asset_id ? getAsset(inClipObj.asset_id) : undefined;
    const outgoingAssetUrl = outAsset?.storage_key ? `/api/assets/file/${outAsset.storage_key}` : undefined;
    const incomingAssetUrl = inAsset?.storage_key ? `/api/assets/file/${inAsset.storage_key}` : undefined;

    trimInitialClipParams = {
      tool,
      clipId,
      edge,
      predClipId: predClip?.id,
      succClipId: succClip?.id,
      outgoingInitialFrameMs: outgoingFrameMs,
      incomingInitialFrameMs: incomingFrameMs,
    };

    set({
      isTrimPreviewActive: true,
      trimPreviewData: {
        activeTool: tool,
        outgoingClipId,
        incomingClipId,
        outgoingClipName: outClipObj?.name || (outgoingClipId ? 'Outgoing' : 'Timeline Gap'),
        incomingClipName: inClipObj?.name || (incomingClipId ? 'Incoming' : 'Timeline Gap'),
        outgoingAssetUrl,
        incomingAssetUrl,
        outgoingFrameMs: Math.round(outgoingFrameMs),
        incomingFrameMs: Math.round(incomingFrameMs),
        deltaMs: 0,
        deltaFrames: 0,
        edge,
        trackId: targetTrack.id,
      },
    });
  },

  updateTrimPreview: (deltaMs: number) => {
    const { isTrimPreviewActive, trimPreviewData, timeline } = get();
    if (!isTrimPreviewActive || !trimPreviewData || !timeline) return;

    const fps = useProjectStore.getState().activeProject?.settings?.fps || 30;
    const deltaFrames = Math.round((deltaMs / 1000) * fps);

    const initial = trimInitialClipParams;
    let outgoingFrameMs = initial ? initial.outgoingInitialFrameMs : trimPreviewData.outgoingFrameMs;
    let incomingFrameMs = initial ? initial.incomingInitialFrameMs : trimPreviewData.incomingFrameMs;

    const tool = trimPreviewData.activeTool;
    const edge = trimPreviewData.edge || 'right';

    // Find current clips for accurate speed factor
    let outClip: Clip | null = null;
    let inClip: Clip | null = null;
    for (const t of timeline.tracks) {
      if (trimPreviewData.outgoingClipId) {
        const c = t.clips.find(x => x.id === trimPreviewData.outgoingClipId);
        if (c) outClip = c;
      }
      if (trimPreviewData.incomingClipId) {
        const c = t.clips.find(x => x.id === trimPreviewData.incomingClipId);
        if (c) inClip = c;
      }
    }

    const outSpeed = (outClip?.speed_factor && outClip.speed_factor > 0) ? outClip.speed_factor : 1.0;
    const inSpeed = (inClip?.speed_factor && inClip.speed_factor > 0) ? inClip.speed_factor : 1.0;

    if (tool === 'roll') {
      if (initial) {
        outgoingFrameMs = Math.max(0, initial.outgoingInitialFrameMs + deltaMs * outSpeed);
        incomingFrameMs = Math.max(0, initial.incomingInitialFrameMs + deltaMs * inSpeed);
      }
    } else if (tool === 'slip') {
      if (initial && outClip) {
        const isReversed = Boolean(outClip.is_reversed);
        const slipShift = (isReversed ? -deltaMs : deltaMs) * outSpeed;
        outgoingFrameMs = Math.max(0, initial.outgoingInitialFrameMs + slipShift);
        incomingFrameMs = Math.max(0, initial.incomingInitialFrameMs + slipShift);
      }
    } else if (tool === 'slide') {
      if (initial) {
        outgoingFrameMs = Math.max(0, initial.outgoingInitialFrameMs + deltaMs * outSpeed);
        incomingFrameMs = Math.max(0, initial.incomingInitialFrameMs + deltaMs * inSpeed);
      }
    } else {
      // ripple or trim
      if (initial) {
        if (edge === 'left') {
          outgoingFrameMs = initial.outgoingInitialFrameMs;
          incomingFrameMs = Math.max(0, initial.incomingInitialFrameMs + deltaMs * inSpeed);
        } else {
          outgoingFrameMs = Math.max(0, initial.outgoingInitialFrameMs + deltaMs * outSpeed);
          incomingFrameMs = initial.incomingInitialFrameMs;
        }
      }
    }

    set({
      trimPreviewData: {
        ...trimPreviewData,
        deltaMs: Math.round(deltaMs),
        deltaFrames,
        outgoingFrameMs: Math.round(outgoingFrameMs),
        incomingFrameMs: Math.round(incomingFrameMs),
      },
    });
  },

  endTrimPreview: (commit = true) => {
    if (!get().isTrimPreviewActive) return;
    if (commit) {
      get().pushHistory();
      get().scheduleAutoSave();
    } else if (trimInitialTimelineSnapshot) {
      set({ timeline: JSON.parse(JSON.stringify(trimInitialTimelineSnapshot)) });
    }
    trimInitialTimelineSnapshot = null;
    trimInitialClipParams = null;
    set({ isTrimPreviewActive: false, trimPreviewData: null });
  },

  cancelTrimPreview: () => {
    if (!get().isTrimPreviewActive) return;
    if (trimInitialTimelineSnapshot) {
      set({ timeline: JSON.parse(JSON.stringify(trimInitialTimelineSnapshot)) });
    }
    trimInitialTimelineSnapshot = null;
    trimInitialClipParams = null;
    set({ isTrimPreviewActive: false, trimPreviewData: null });
  },

  nudgeActiveTrim: (deltaFrames: number) => {
    const fps = useProjectStore.getState().activeProject?.settings?.fps || 30;
    const frameDeltaMs = (deltaFrames / fps) * 1000;

    if (!get().isTrimPreviewActive) {
      const selId = get().selectedClipId;
      if (!selId || !get().timeline) return;

      let tool: TrimToolType = 'trim';
      const activeTool = get().activeTimelineTool;
      if (activeTool === 'roll') tool = 'roll';
      else if (activeTool === 'slip') tool = 'slip';
      else if (activeTool === 'slide') tool = 'slide';
      else if (activeTool === 'ripple') tool = 'ripple';

      get().startTrimPreview({ tool, clipId: selId, edge: 'right' });
    }

    const prev = get().trimPreviewData;
    if (!prev) return;

    const newDeltaMs = prev.deltaMs + frameDeltaMs;

    // Apply nudge operation to timeline with skipHistory = true
    if (prev.activeTool === 'roll' && prev.outgoingClipId && prev.incomingClipId) {
      get().rollEdit(prev.outgoingClipId, prev.incomingClipId, frameDeltaMs, true);
    } else if (prev.activeTool === 'slip' && prev.outgoingClipId) {
      get().slipClip(prev.outgoingClipId, frameDeltaMs, true);
    } else if (prev.activeTool === 'slide' && prev.outgoingClipId) {
      get().slideClip(prev.outgoingClipId, frameDeltaMs, true);
    } else if (prev.activeTool === 'ripple' && (prev.outgoingClipId || prev.incomingClipId)) {
      const targetId = (prev.edge === 'left' ? prev.incomingClipId : prev.outgoingClipId) || prev.outgoingClipId!;
      get().trimClip(targetId, prev.edge || 'right', frameDeltaMs, true, true);
    } else if (prev.activeTool === 'trim' && (prev.outgoingClipId || prev.incomingClipId)) {
      const targetId = (prev.edge === 'left' ? prev.incomingClipId : prev.outgoingClipId) || prev.outgoingClipId!;
      get().trimClip(targetId, prev.edge || 'right', frameDeltaMs, true, false);
    }

    get().updateTrimPreview(newDeltaMs);
  },

  pushHistory: () => {
    const { timeline, history, historyIndex } = get();
    if (!timeline) return;

    const snapshot = JSON.parse(JSON.stringify(timeline));
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snapshot);

    // Limit to 50 local undo steps
    if (newHistory.length > 50) newHistory.shift();

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      set({
        timeline: JSON.parse(JSON.stringify(prev)),
        historyIndex: historyIndex - 1,
        saveStatus: 'idle',
      });
      get().scheduleAutoSave();
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      set({
        timeline: JSON.parse(JSON.stringify(next)),
        historyIndex: historyIndex + 1,
        saveStatus: 'idle',
      });
      get().scheduleAutoSave();
    }
  },

  // Phase 50: Timeline Navigation & Precision Shuttle Engine
  setShuttleRate: (rate: number) => {
    const isPlaying = rate !== 0;
    set({ shuttleRate: rate, isPlaying });
  },

  shuttleForward: () => {
    const { shuttleRate } = get();
    const ladder = [1, 2, 4, 8, 16];
    let nextRate = 1;
    if (shuttleRate >= 1) {
      const idx = ladder.indexOf(shuttleRate);
      nextRate = idx !== -1 && idx < ladder.length - 1 ? ladder[idx + 1] : 16;
    } else {
      nextRate = 1;
    }
    set({ shuttleRate: nextRate, isPlaying: true });
  },

  shuttleReverse: () => {
    const { shuttleRate } = get();
    const ladder = [-1, -2, -4, -8, -16];
    let nextRate = -1;
    if (shuttleRate <= -1) {
      const idx = ladder.indexOf(shuttleRate);
      nextRate = idx !== -1 && idx < ladder.length - 1 ? ladder[idx + 1] : -16;
    } else {
      nextRate = -1;
    }
    set({ shuttleRate: nextRate, isPlaying: true });
  },

  shuttleSlowForward: () => {
    set({ shuttleRate: 0.5, isPlaying: true });
  },

  shuttleSlowReverse: () => {
    set({ shuttleRate: -0.5, isPlaying: true });
  },

  shuttleStop: () => {
    set({ shuttleRate: 0, isPlaying: false, sourceIsPlaying: false });
  },

  jumpToNextCut: (): boolean => {
    const { timeline, playheadMs } = get();
    if (!timeline) return false;
    const cuts = new Set<number>();
    cuts.add(0);
    cuts.add(timeline.duration_ms || 0);

    for (const track of timeline.tracks) {
      if (track.is_locked) continue;
      for (const clip of track.clips) {
        cuts.add(clip.start_time_ms);
        cuts.add(clip.start_time_ms + clip.duration_ms);
      }
    }

    const sortedCuts = Array.from(cuts).sort((a, b) => a - b);
    const nextCut = sortedCuts.find((c) => c > playheadMs + 5);
    if (nextCut !== undefined) {
      get().setPlayhead(nextCut);
      return true;
    } else {
      get().setPlayhead(timeline.duration_ms || 0);
      return true;
    }
  },

  jumpToPreviousCut: (): boolean => {
    const { timeline, playheadMs } = get();
    if (!timeline) return false;
    const cuts = new Set<number>();
    cuts.add(0);
    cuts.add(timeline.duration_ms || 0);

    for (const track of timeline.tracks) {
      if (track.is_locked) continue;
      for (const clip of track.clips) {
        cuts.add(clip.start_time_ms);
        cuts.add(clip.start_time_ms + clip.duration_ms);
      }
    }

    const sortedCuts = Array.from(cuts).sort((a, b) => a - b);
    let prevCut: number | undefined;
    for (let i = sortedCuts.length - 1; i >= 0; i--) {
      if (sortedCuts[i] < playheadMs - 5) {
        prevCut = sortedCuts[i];
        break;
      }
    }
    if (prevCut !== undefined) {
      get().setPlayhead(prevCut);
      return true;
    } else {
      get().setPlayhead(0);
      return true;
    }
  },

  jumpToNextMarker: () => {
    const { timeline, playheadMs } = get();
    if (!timeline) return;
    const markers = new Set<number>();
    if (Array.isArray(timeline.markers)) {
      for (const m of timeline.markers) markers.add(m.time_ms);
    }
    for (const track of timeline.tracks) {
      if (track.is_locked) continue;
      for (const clip of track.clips) {
        if (Array.isArray(clip.markers)) {
          for (const m of clip.markers) markers.add(clip.start_time_ms + m.time_ms);
        }
      }
    }
    const sorted = Array.from(markers).sort((a, b) => a - b);
    const next = sorted.find((m) => m > playheadMs + 5);
    if (next !== undefined) {
      get().setPlayhead(next);
    }
  },

  jumpToPreviousMarker: () => {
    const { timeline, playheadMs } = get();
    if (!timeline) return;
    const markers = new Set<number>();
    if (Array.isArray(timeline.markers)) {
      for (const m of timeline.markers) markers.add(m.time_ms);
    }
    for (const track of timeline.tracks) {
      if (track.is_locked) continue;
      for (const clip of track.clips) {
        if (Array.isArray(clip.markers)) {
          for (const m of clip.markers) markers.add(clip.start_time_ms + m.time_ms);
        }
      }
    }
    const sorted = Array.from(markers).sort((a, b) => a - b);
    let prev: number | undefined;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i] < playheadMs - 5) {
        prev = sorted[i];
        break;
      }
    }
    if (prev !== undefined) {
      get().setPlayhead(prev);
    }
  },

  jumpToSequenceStart: () => {
    get().setPlayhead(0);
  },

  jumpToSequenceEnd: () => {
    const { timeline } = get();
    if (!timeline) return;
    if (timeline.out_point_ms !== null && timeline.out_point_ms !== undefined && timeline.out_point_ms > 0) {
      get().setPlayhead(timeline.out_point_ms);
      return;
    }
    let maxEnd = 0;
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        const end = clip.start_time_ms + clip.duration_ms;
        if (end > maxEnd) maxEnd = end;
      }
    }
    get().setPlayhead(maxEnd > 0 ? maxEnd : (timeline.duration_ms || 0));
  },

  jumpToInPoint: () => {
    const { timeline } = get();
    if (timeline?.in_point_ms !== null && timeline?.in_point_ms !== undefined) {
      get().setPlayhead(timeline.in_point_ms);
    }
  },

  jumpToOutPoint: () => {
    const { timeline } = get();
    if (timeline?.out_point_ms !== null && timeline?.out_point_ms !== undefined) {
      get().setPlayhead(timeline.out_point_ms);
    }
  },

  zoomToFit: (containerWidth?: number) => {
    const { timeline } = get();
    const durationMs = timeline?.duration_ms || 60000;
    const durSec = Math.max(1, durationMs / 1000);
    const scrollContainer = typeof document !== 'undefined'
      ? (document.getElementById('timeline-tracks-scroll-container') || document.getElementById('timeline-tracks-container'))
      : null;
    const usableWidth = containerWidth || scrollContainer?.clientWidth || 1000;
    const idealZoom = (usableWidth - 80) / durSec;
    const clamped = Math.max(5, Math.min(500, Math.round(idealZoom * 10) / 10));
    set({ zoomLevel: clamped });
    if (scrollContainer) {
      scrollContainer.scrollLeft = 0;
    }
  },

  zoomAtPlayhead: (zoomInOrFactor: boolean | number, factor = 1.3) => {
    const { zoomLevel, playheadMs } = get();
    let isZoomIn = true;
    let actualFactor = factor;
    if (typeof zoomInOrFactor === 'boolean') {
      isZoomIn = zoomInOrFactor;
    } else if (typeof zoomInOrFactor === 'number') {
      isZoomIn = zoomInOrFactor >= 1;
      actualFactor = isZoomIn ? zoomInOrFactor : 1 / zoomInOrFactor;
    }
    const newZoom = isZoomIn
      ? Math.min(500, Math.round(zoomLevel * actualFactor))
      : Math.max(5, Math.round(zoomLevel / actualFactor));
    if (newZoom === zoomLevel) return;

    const scrollContainer = typeof document !== 'undefined'
      ? (document.getElementById('timeline-tracks-scroll-container') || document.getElementById('timeline-tracks-container'))
      : null;
    if (scrollContainer) {
      const containerWidth = scrollContainer.clientWidth;
      const playheadSec = playheadMs / 1000;
      const newPlayheadPx = playheadSec * newZoom;
      // Keep playhead centered in container viewport
      const targetScroll = Math.max(0, newPlayheadPx - containerWidth / 2);
      set({ zoomLevel: newZoom });
      requestAnimationFrame(() => {
        if (scrollContainer) scrollContainer.scrollLeft = targetScroll;
      });
    } else {
      set({ zoomLevel: newZoom });
    }
  },

  jumpToTimecode: (input: string, fps = 30): TimecodeJumpResult => {
    const { timeline, playheadMs } = get();
    if (!timeline) return { success: false, error: 'No timeline active' };
    const maxMs = timeline.duration_ms || 3600000;
    const trimmed = input.trim();
    if (!trimmed) return { success: false, error: 'Timecode cannot be empty' };

    const effectiveFps = (timeline as any).fps || fps || 30;

    // 1. Relative seconds: e.g. +1.5s, -2.0s
    const relSecMatch = trimmed.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*s$/i);
    if (relSecMatch) {
      const sign = relSecMatch[1] === '-' ? -1 : 1;
      const sec = parseFloat(relSecMatch[2]);
      const target = Math.max(0, Math.min(maxMs, Math.round(playheadMs + sign * sec * 1000)));
      get().setPlayhead(target);
      return { success: true, targetMs: target };
    }

    // 2. Relative frames: e.g. +30, -60, +30f, -60f
    const relFrameMatch = trimmed.match(/^([+-])\s*(\d+)(?:f)?$/i);
    if (relFrameMatch) {
      const sign = relFrameMatch[1] === '-' ? -1 : 1;
      const frames = parseInt(relFrameMatch[2], 10);
      const deltaMs = (frames / effectiveFps) * 1000;
      const target = Math.max(0, Math.min(maxMs, Math.round(playheadMs + sign * deltaMs)));
      get().setPlayhead(target);
      return { success: true, targetMs: target };
    }

    // 3. Absolute seconds: e.g. 45s, 45.5s
    const absSecMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*s$/i);
    if (absSecMatch) {
      const sec = parseFloat(absSecMatch[1]);
      const target = Math.max(0, Math.min(maxMs, Math.round(sec * 1000)));
      get().setPlayhead(target);
      return { success: true, targetMs: target };
    }

    // 4. SMPTE format: HH:MM:SS:FF
    const smpte4 = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (smpte4) {
      const h = parseInt(smpte4[1], 10);
      const m = parseInt(smpte4[2], 10);
      const s = parseInt(smpte4[3], 10);
      const f = parseInt(smpte4[4], 10);
      const totalSec = h * 3600 + m * 60 + s + f / effectiveFps;
      const target = Math.max(0, Math.min(maxMs, Math.round(totalSec * 1000)));
      get().setPlayhead(target);
      return { success: true, targetMs: target };
    }

    // Short format: MM:SS:FF or HH:MM:SS
    const smpte3 = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (smpte3) {
      const part1 = parseInt(smpte3[1], 10);
      const part2 = parseInt(smpte3[2], 10);
      const part3 = parseInt(smpte3[3], 10);
      let totalSec: number;
      if (part3 < effectiveFps && part1 < 60) {
        totalSec = part1 * 60 + part2 + part3 / effectiveFps;
      } else {
        totalSec = part1 * 3600 + part2 * 60 + part3;
      }
      const target = Math.max(0, Math.min(maxMs, Math.round(totalSec * 1000)));
      get().setPlayhead(target);
      return { success: true, targetMs: target };
    }

    // 5. Raw frame count: e.g. 150f or numeric 150 (only if positive integer without +/-)
    const rawFrameMatch = trimmed.match(/^(\d+)(?:f)?$/);
    if (rawFrameMatch) {
      const frames = parseInt(rawFrameMatch[1], 10);
      const target = Math.max(0, Math.min(maxMs, Math.round((frames / effectiveFps) * 1000)));
      get().setPlayhead(target);
      return { success: true, targetMs: target };
    }

    return { success: false, error: 'Invalid timecode format (expected HH:MM:SS:FF, +30, -60, or 10s)' };
  },

  setTimecodeModalOpen: (open: boolean) => {
    set({ isTimecodeModalOpen: open });
  },
}));

if (typeof window !== 'undefined') {
  (window as any).__timelineStore = useTimelineStore;
}

export function evaluateClipProperty(clip: Clip, property: string, offsetMs: number, defaultValue: number): number {
  const kfs = (clip.keyframes || [])
    .filter((k) => k.property_path === property)
    .sort((a, b) => a.time_offset_ms - b.time_offset_ms);

  if (kfs.length === 0) {
    return defaultValue;
  }
  if (kfs.length === 1 || offsetMs <= kfs[0].time_offset_ms) {
    return Number(kfs[0].value);
  }
  if (offsetMs >= kfs[kfs.length - 1].time_offset_ms) {
    return Number(kfs[kfs.length - 1].value);
  }

  for (let i = 0; i < kfs.length - 1; i++) {
    const k1 = kfs[i];
    const k2 = kfs[i + 1];
    if (offsetMs >= k1.time_offset_ms && offsetMs <= k2.time_offset_ms) {
      const dt = k2.time_offset_ms - k1.time_offset_ms;
      if (dt === 0) return Number(k1.value);
      const frac = (offsetMs - k1.time_offset_ms) / dt;
      return Number(k1.value) + frac * (Number(k2.value) - Number(k1.value));
    }
  }
  return defaultValue;
}

export function evaluateClipVolume(clip: Clip, offsetMs: number): number {
  return evaluateClipProperty(clip, 'volume_db', offsetMs, clip.volume_db ?? 0);
}

export function evaluateClipFade(clip: Clip, offsetMs: number): number {
  let factor = 1.0;
  if (clip.fade_in_ms && clip.fade_in_ms > 0 && offsetMs < clip.fade_in_ms) {
    factor *= Math.max(0, Math.min(1, offsetMs / clip.fade_in_ms));
  }
  if (clip.fade_out_ms && clip.fade_out_ms > 0) {
    const timeFromEndMs = clip.duration_ms - offsetMs;
    if (timeFromEndMs < clip.fade_out_ms) {
      factor *= Math.max(0, Math.min(1, timeFromEndMs / clip.fade_out_ms));
    }
  }
  return factor;
}

export function evaluateEffectiveClipGain(
  clip: Clip,
  offsetMs: number,
  trackVolumeDb: number = 0
): { volumeDb: number; linearGain: number } {
  const volDb = evaluateClipVolume(clip, offsetMs);
  const fade = evaluateClipFade(clip, offsetMs);
  const totalDb = trackVolumeDb + volDb;
  const baseLinear = Math.pow(10, totalDb / 20);
  return {
    volumeDb: totalDb,
    linearGain: Math.max(0, baseLinear * fade),
  };
}

