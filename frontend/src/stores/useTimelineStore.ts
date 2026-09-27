import { create } from 'zustand';
import { produce } from 'immer';
import { api } from '../services/api';
import { TimelineState, Track, Clip, Keyframe, TrackType, TrackRole } from '../types';

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

  // Track operations
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  setTrackVolume: (trackId: string, volumeDb: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackHeight: (trackId: string, heightPx: number) => void;
  addTrack: (trackType: TrackType, trackRole?: TrackRole, name?: string) => void;
  deleteTrack: (trackId: string) => void;
  renameTrack: (trackId: string, newName: string) => void;

  // Clip operations
  updateClip: (clipId: string, updater: (clip: Clip) => void, skipHistory?: boolean) => void;
  addClipToTrack: (trackId: string, clip: Partial<Clip>) => void;
  deleteClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  splitClipAtPlayhead: (clipId: string) => void;
  moveClipToTrack: (clipId: string, newTrackId: string, newStartMs: number) => void;
  trimClip: (clipId: string, edge: 'left' | 'right', deltaMs: number) => void;
  rippleDelete: (clipId: string) => void;
  setClipTransition: (clipId: string, edge: 'in' | 'out', transition: Record<string, any> | null) => void;

  // Keyframe operations
  addKeyframe: (clipId: string, kf: Keyframe) => void;
  deleteKeyframe: (clipId: string, kfId: string) => void;
  moveKeyframe: (clipId: string, kfId: string, newTimeMs: number) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
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

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  timeline: null,
  playheadMs: 0,
  isPlaying: false,
  isLooping: false,
  zoomLevel: 25, // 25 pixels per second default
  selectedClipId: null,
  selectedTrackId: null,
  snapEnabled: true,
  isSaving: false,
  saveStatus: 'idle',
  lastSavedAt: null,
  _autoSaveTimer: null,

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
    const { timeline } = get();
    if (!timeline) return;

    set({ isSaving: true, saveStatus: 'saving' });
    try {
      await api.put(`/projects/${timeline.project_id}/timeline`, {
        name: timeline.name,
        duration_ms: timeline.duration_ms,
        tracks: timeline.tracks,
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
    set((state) => ({ isPlaying: !state.isPlaying }));
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
  },

  selectTrack: (trackId: string | null) => {
    set({ selectedTrackId: trackId });
  },

  toggleSnap: () => {
    set((state) => ({ snapEnabled: !state.snapEnabled }));
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

  setTrackVolume: (trackId: string, volumeDb: number) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.volume_db = volumeDb;
      })
    );
    get().scheduleAutoSave();
  },

  setTrackPan: (trackId: string, pan: number) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.pan = Math.max(-1.0, Math.min(1.0, pan));
      })
    );
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

  addTrack: (trackType: TrackType, trackRole: TrackRole = 'custom', name?: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const count = state.timeline.tracks.length;
        const trackName = name || `${trackType.toUpperCase()}${count + 1}`;
        const newTrack: Track = {
          id: crypto.randomUUID(),
          timeline_id: state.timeline.id,
          track_type: trackType,
          track_role: trackRole,
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
    get().pushHistory();
    get().scheduleAutoSave();
  },

  deleteTrack: (trackId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const idx = state.timeline.tracks.findIndex((t) => t.id === trackId);
        if (idx !== -1) {
          state.timeline.tracks.splice(idx, 1);
          // re-index order
          state.timeline.tracks.forEach((t, i) => {
            t.order_index = i;
          });
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  renameTrack: (trackId: string, newName: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (track) track.name = newName;
      })
    );
    get().scheduleAutoSave();
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
        if (!track) return;

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

  deleteClip: (clipId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const idx = track.clips.findIndex((c) => c.id === clipId);
          if (idx !== -1) {
            track.clips.splice(idx, 1);
            break;
          }
        }
        if (state.selectedClipId === clipId) {
          state.selectedClipId = null;
        }
        recalcDuration(state);
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  duplicateClip: (clipId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            const duplicate: Clip = {
              ...JSON.parse(JSON.stringify(clip)),
              id: crypto.randomUUID(),
              start_time_ms: clip.start_time_ms + clip.duration_ms,
            };
            track.clips.push(duplicate);
            track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
            recalcDuration(state);
            break;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  splitClipAtPlayhead: (clipId: string) => {
    const { playheadMs } = get();
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (
            clip &&
            playheadMs > clip.start_time_ms &&
            playheadMs < clip.start_time_ms + clip.duration_ms
          ) {
            const splitOffset = playheadMs - clip.start_time_ms;
            const originalDuration = clip.duration_ms;

            // Clip 1 ends at playhead
            clip.duration_ms = splitOffset;
            clip.source_out_ms = clip.source_in_ms + splitOffset;

            // Clip 2 starts at playhead
            const clip2: Clip = {
              ...JSON.parse(JSON.stringify(clip)),
              id: crypto.randomUUID(),
              start_time_ms: playheadMs,
              duration_ms: originalDuration - splitOffset,
              source_in_ms: clip.source_in_ms + splitOffset,
              source_out_ms: clip.source_in_ms + originalDuration,
            };

            track.clips.push(clip2);
            track.clips.sort((a, b) => a.start_time_ms - b.start_time_ms);
            break;
          }
        }
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
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

  trimClip: (clipId: string, edge: 'left' | 'right', deltaMs: number) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (edge === 'left') {
              const newStart = clip.start_time_ms + deltaMs;
              const newDuration = clip.duration_ms - deltaMs;
              if (newDuration >= 100 && newStart >= 0) {
                clip.start_time_ms = newStart;
                clip.duration_ms = newDuration;
                clip.source_in_ms = Math.max(0, clip.source_in_ms + deltaMs);
              }
            } else {
              const newDuration = clip.duration_ms + deltaMs;
              if (newDuration >= 100) {
                clip.duration_ms = newDuration;
                clip.source_out_ms = clip.source_in_ms + newDuration;
              }
            }
            break;
          }
        }
        recalcDuration(state);
      })
    );
    get().scheduleAutoSave();
  },

  rippleDelete: (clipId: string) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const idx = track.clips.findIndex((c) => c.id === clipId);
          if (idx !== -1) {
            const deletedClip = track.clips[idx];
            const gap = deletedClip.duration_ms;
            const deleteEnd = deletedClip.start_time_ms + gap;

            track.clips.splice(idx, 1);

            // Shift clips that come after the deleted clip
            for (const clip of track.clips) {
              if (clip.start_time_ms >= deleteEnd) {
                clip.start_time_ms -= gap;
              }
            }

            if (state.selectedClipId === clipId) {
              state.selectedClipId = null;
            }
            break;
          }
        }
        recalcDuration(state);
      })
    );
    get().pushHistory();
    get().scheduleAutoSave();
  },

  setClipTransition: (clipId: string, edge: 'in' | 'out', transition: Record<string, any> | null) => {
    set(
      produce((state: TimelineStore) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
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
}));

if (typeof window !== 'undefined') {
  (window as any).__timelineStore = useTimelineStore;
}

