export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sample_rate: number;
  color_space: string;
  max_duration_sec: number;
}

export interface Project {
  id: string;
  title: string;
  description?: string;
  settings: ProjectSettings;
  story_data?: Record<string, any>;
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
}

export type TrackType = 'video' | 'audio' | 'subtitle' | 'adjustment';

export type TrackRole =
  | 'video'
  | 'dialogue'
  | 'voiceover'
  | 'music'
  | 'sfx'
  | 'ambience'
  | 'captions'
  | 'graphics'
  | 'adjustment'
  | 'custom';

export interface Keyframe {
  id?: string;
  clip_id?: string;
  property_path: string;
  time_offset_ms: number;
  value: any;
  interpolation: 'hold' | 'linear' | 'bezier' | 'ease_in' | 'ease_out';
  bezier_handles?: { cp1: [number, number]; cp2: [number, number] };
}

export interface Effect {
  id?: string;
  effect_type: string;
  effect_category: 'color' | 'transform' | 'vfx' | 'audio' | 'ai' | 'text';
  order_index: number;
  is_enabled: boolean;
  parameters: Record<string, any>;
}

export type VideoTransitionType = 'crossfade' | 'fade_black' | 'fade_white';

export interface VideoTransitionConfig {
  type: VideoTransitionType;
  duration_ms: number;
  from_clip_id: string;
  to_clip_id: string;
}

export interface Clip {
  id: string;
  track_id: string;
  asset_id?: string;
  scene_id?: string;
  name: string;
  clip_type: 'media' | 'title' | 'generator' | 'adjustment' | 'caption';
  start_time_ms: number;
  duration_ms: number;
  source_in_ms: number;
  source_out_ms: number;
  speed_factor: number;
  is_reversed: boolean;
  is_frozen: boolean;
  freeze_at_ms?: number;
  freeze_duration_ms?: number;
  is_frame_hold?: boolean;
  frame_hold_at_ms?: number;
  frame_hold_duration_ms?: number;
  opacity: number;
  blend_mode: string;
  position_x: number;
  position_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  anchor_x: number;
  anchor_y: number;
  crop_left: number;
  crop_right: number;
  crop_top: number;
  crop_bottom: number;
  volume_db: number;
  pan?: number;
  fade_in_ms: number;
  fade_out_ms: number;
  transition_in?: Record<string, any>;
  transition_out?: Record<string, any>;
  metadata_info?: Record<string, any>;
  effects: Effect[];
  keyframes: Keyframe[];
  is_compound?: boolean;
  nested_tracks?: Track[];
  markers?: TimelineMarker[];
  group_id?: string;
  linked_clip_id?: string;
}

export type MarkerColor = 'blue' | 'cyan' | 'green' | 'yellow' | 'red' | 'pink' | 'purple' | 'white';

export const MARKER_COLORS: MarkerColor[] = ['blue', 'cyan', 'green', 'yellow', 'red', 'pink', 'purple', 'white'];

export const MARKER_COLOR_MAP: Record<MarkerColor, { bg: string; text: string; border: string }> = {
  blue: { bg: '#3b82f6', text: '#ffffff', border: '#1d4ed8' },
  cyan: { bg: '#06b6d4', text: '#000000', border: '#0891b2' },
  green: { bg: '#22c55e', text: '#000000', border: '#16a34a' },
  yellow: { bg: '#eab308', text: '#000000', border: '#ca8a04' },
  red: { bg: '#ef4444', text: '#ffffff', border: '#dc2626' },
  pink: { bg: '#ec4899', text: '#ffffff', border: '#db2777' },
  purple: { bg: '#a855f7', text: '#ffffff', border: '#9333ea' },
  white: { bg: '#f8fafc', text: '#000000', border: '#cbd5e1' },
};

export interface TimelineMarker {
  id: string;
  time_ms: number;
  duration_ms?: number;
  name: string;
  comment?: string;
  color: MarkerColor;
  clip_id?: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
  parentTimeline: TimelineState;
  parentPlayheadMs?: number;
  parentSelectedClipId?: string | null;
}

export interface Track {
  id: string;
  timeline_id?: string;
  track_type: TrackType;
  track_role: TrackRole;
  order_index: number;
  name: string;
  is_muted: boolean;
  is_locked: boolean;
  is_visible: boolean;
  is_solo: boolean;
  volume_db: number;
  pan: number;
  height_px: number;
  color?: string;
  clips: Clip[];
}

export interface TimelineState {
  id: string;
  project_id: string;
  name: string;
  duration_ms: number;
  tracks: Track[];
  markers?: TimelineMarker[];
  in_point_ms?: number | null;
  out_point_ms?: number | null;
  target_video_track_id?: string | null;
  target_audio_track_id?: string | null;
}

export interface TimelineGap {
  track_id: string;
  start_time_ms: number;
  duration_ms: number;
  end_time_ms: number;
}

export interface Asset {
  id: string;
  project_id: string;
  asset_type: 'video' | 'audio' | 'image' | 'font' | 'lut' | 'subtitle' | 'ai_generated' | 'media';
  file_name: string;
  storage_key: string;
  file_size_bytes: number;
  mime_type: string;
  duration_ms?: number;
  has_proxy: boolean;
  proxy_storage_key?: string;
  thumbnail_url?: string;
  waveform_data?: number[];
  metadata_info?: Record<string, any>;
  tags: string[];
  is_favorite: boolean;
  folder_path: string;
  created_at: string;
}

export interface MusicFolder {
  id: string;
  parent_folder_id?: string;
  parent_id?: string; // alias
  name: string;
  slug: string;
  folder_path: string;
  icon?: string;
  order_index: number;
  items_count?: number;
  children?: MusicFolder[];
}

// MusicTrack is an alias for MusicItem (used in MusicLibraryPanel)
export type MusicTrack = MusicItem;

export interface MusicItem {
  id: string;
  folder_id: string;
  title: string;
  artist?: string;
  album?: string;
  genre?: string;
  mood?: string;
  bpm?: number;
  music_key?: string;
  duration_ms: number;
  file_size_bytes: number;
  storage_key: string;
  mime_type: string;
  waveform_data?: number[];
  thumbnail_url?: string;
  tags: string[];
  is_favorite: boolean;
  is_ai_generated: boolean;
  is_user_upload: boolean;
  created_at: string;
}

export interface Character {
  id: string;
  project_id: string;
  name: string;
  tamil_name?: string;
  description?: string;
  personality?: string;
  voice_profile?: Record<string, any>;
  visual_prompt?: string;
  reference_images?: string[];
  references?: Array<{
    id: string;
    reference_type: string;
    asset_id: string;
    is_primary: boolean;
  }>;
  created_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  title?: string;
  description?: string;
  dialogue?: string;
  visual_prompt?: string;
  audio_prompt?: string;
  duration_target_sec?: number;
  duration_sec?: number; // alias used by some panels
  location?: string;
  time_of_day?: string;
  mood?: string;
  status: string;
  storyboard_image_url?: string; // if a frame has been generated
  storyboard_frames?: Array<{
    id: string;
    frame_number: number;
    prompt?: string;
    description?: string;
    camera_angle?: string;
    duration_sec?: number;
  }>;
}

export interface RenderJob {
  id: string;
  project_id: string;
  timeline_id: string;
  job_type: string;
  export_preset: Record<string, any>;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress_percent: number;
  output_path?: string;
  error_message?: string;
  chunks_total?: number;
  chunks_completed?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface AICommandResponse {
  command: string;
  interpreted_intent: string;
  suggested_actions: Array<Record<string, any>>;
  explanation: string;
}

export type SidebarTab =
  | 'home'
  | 'media'
  | 'ai-generate'
  | 'media-transform'
  | 'production-studio'
  | 'story-script'
  | 'characters'
  | 'scenes'
  | 'storyboard'
  | 'edit'
  | 'color'
  | 'vfx'
  | 'voice-dubbing'
  | 'music-library'
  | 'sfx'
  | 'captions'
  | 'graphics'
  | 'assets'
  | 'templates'
  | 'my-projects'
  | 'render-queue'
  | 'settings';

// --- Phase 19: AI Editing Assistant / Prompt-to-Edit ---
export type EditOperationType =
  | 'trim'
  | 'split'
  | 'delete'
  | 'ripple_delete'
  | 'move'
  | 'transition'
  | 'volume'
  | 'mute'
  | 'title'
  | 'caption'
  | 'adjust_duration';

export interface EditOperation {
  operation_id: string;
  operation_type: EditOperationType;
  target_id?: string;
  target_name?: string;
  track_id?: string;
  description: string;
  parameters: Record<string, any>;
}

export type EditPlanStatus =
  | 'ready_for_review'
  | 'applied'
  | 'rejected'
  | 'ambiguous'
  | 'unsupported';

export interface EditPlan {
  plan_id: string;
  request: string;
  summary: string;
  confidence: number;
  status: EditPlanStatus;
  is_valid: boolean;
  validation_errors: string[];
  requires_confirmation: boolean;
  operations: EditOperation[];
  clarification_prompt?: string;
}

export interface EditPlanRequest {
  project_id: string;
  prompt: string;
  selected_clip_id?: string;
  selected_track_id?: string;
  playhead_ms?: number;
  timeline_context?: Record<string, any>;
}

export interface EditPlanResponse {
  success: boolean;
  plan: EditPlan;
}

// Phase 27: Video Speed & Reverse
export const ALLOWED_SPEED_PRESETS = [0.25, 0.5, 1.0, 1.5, 2.0, 4.0] as const;
export type SpeedPreset = typeof ALLOWED_SPEED_PRESETS[number];

export function isValidSpeedFactor(val: number): boolean {
  return typeof val === 'number' && !isNaN(val) && isFinite(val) && val > 0 && val >= 0.1 && val <= 10.0;
}

// Phase 28: Video Freeze Frame
export const ALLOWED_FREEZE_DURATIONS_MS = [1000, 2000, 3000, 5000] as const;
export type FreezeDurationMs = typeof ALLOWED_FREEZE_DURATIONS_MS[number];

export function isValidFreezeDuration(ms: number): ms is FreezeDurationMs {
  return (ALLOWED_FREEZE_DURATIONS_MS as readonly number[]).includes(ms);
}

// Phase 29: Video Frame Hold / Repeat
export const ALLOWED_FRAME_HOLD_DURATIONS_MS = [1000, 2000, 3000, 5000] as const;
export type FrameHoldDurationMs = typeof ALLOWED_FRAME_HOLD_DURATIONS_MS[number];

export function isValidFrameHoldDuration(ms: number): ms is FrameHoldDurationMs {
  return (ALLOWED_FRAME_HOLD_DURATIONS_MS as readonly number[]).includes(ms);
}

// Phase 38: Slip & Slide Editing | Phase 39: Rolling Edit Tool | Phase 41: Razor / Blade Tool
export type TimelineTool = 'select' | 'slip' | 'slide' | 'ripple' | 'roll' | 'razor';

// Phase 46: Source Monitor & Media Selection
export type MonitorFocus = 'source' | 'program';
export type MonitorLayout = 'dual' | 'tabbed';

// Phase 47: Match Frame & Media Locator
export interface TimelineOccurrence {
  clipId: string;
  clipName: string;
  trackId: string;
  trackName: string;
  trackType: TrackType;
  startMs: number;
  durationMs: number;
  sourceInMs: number;
  sourceOutMs: number;
}

// Phase 48: Dynamic 2-Up Trim Preview & Precision Cut Monitor
export type TrimToolType = 'trim' | 'ripple' | 'roll' | 'slip' | 'slide';

export interface TrimPreviewState {
  activeTool: TrimToolType;
  outgoingClipId: string | null;
  incomingClipId: string | null;
  outgoingClipName?: string;
  incomingClipName?: string;
  outgoingAssetUrl?: string;
  incomingAssetUrl?: string;
  outgoingFrameMs: number;
  incomingFrameMs: number;
  deltaMs: number;
  deltaFrames: number;
  edge?: 'left' | 'right';
  trackId?: string;
}

// Phase 49: Replace / Fit-to-Fill & 4-Point Editing Engine
export type FourPointResolution = 'fit_to_fill' | 'ignore_source_out' | 'ignore_sequence_out' | 'ignore_sequence_in';

export interface FourPointConflictData {
  sourceInMs: number;
  sourceOutMs: number;
  sourceDurationMs: number;
  sequenceInMs: number;
  sequenceOutMs: number;
  sequenceDurationMs: number;
  speedFactor: number;
  asset: Asset;
  targetVideoTrackId?: string | null;
  targetAudioTrackId?: string | null;
}

export type ReplaceEditMode = 'from_in' | 'from_playhead' | 'fit_to_fill';

export interface ReplaceEditOptions {
  mode?: ReplaceEditMode;
  asset?: Asset;
  assetId?: string;
  customSourceInMs?: number;
  customSourceOutMs?: number;
}

// Phase 50: Timeline Navigation & Precision Shuttle Engine
export type ShuttleRate = -16 | -8 | -4 | -2 | -1 | -0.5 | 0 | 0.5 | 1 | 2 | 4 | 8 | 16;

export interface TimecodeJumpResult {
  success: boolean;
  targetMs?: number;
  error?: string;
}
