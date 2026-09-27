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
