import React, { useState, useEffect, useRef } from 'react';
import {
  Music2,
  Folder,
  FolderOpen,
  Loader2,
  ChevronRight,
  ChevronDown,
  Play,
  Pause,
  Plus,
  Search,
  Heart,
  Volume2,
  Disc,
} from 'lucide-react';
import { api } from '../../services/api';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';
import { MusicFolder, MusicItem } from '../../types';

const DEFAULT_TAMIL_FOLDERS = [
  { id: 'f-tamil-songs', name: 'Tamil Songs', slug: 'tamil-songs' },
  { id: 'f-melody', name: 'Melody', slug: 'melody', parent_id: 'f-tamil-songs' },
  { id: 'f-love', name: 'Love', slug: 'love', parent_id: 'f-tamil-songs' },
  { id: 'f-sad', name: 'Sad', slug: 'sad', parent_id: 'f-tamil-songs' },
  { id: 'f-mass', name: 'Mass', slug: 'mass', parent_id: 'f-tamil-songs' },
  { id: 'f-folk', name: 'Folk', slug: 'folk', parent_id: 'f-tamil-songs' },
  { id: 'f-devotional', name: 'Devotional', slug: 'devotional', parent_id: 'f-tamil-songs' },
  { id: 'f-kids', name: 'Kids', slug: 'kids', parent_id: 'f-tamil-songs' },
  { id: 'f-instrumental', name: 'Instrumental', slug: 'instrumental', parent_id: 'f-tamil-songs' },
  { id: 'f-bgm', name: 'Background Music (BGM)', slug: 'background-music' },
  { id: 'f-cinematic', name: 'Cinematic Score', slug: 'cinematic' },
  { id: 'f-ambient', name: 'Ambient & Drone', slug: 'ambient' },
  { id: 'f-ai', name: 'AI Generated Music', slug: 'ai-generated' },
  { id: 'f-uploads', name: 'My Uploads', slug: 'my-uploads' },
];

const SAMPLE_TRACKS_BY_SLUG: Record<string, Array<Partial<MusicItem>>> = {
  melody: [
    { id: 'm-mel-1', title: 'Thenral Vanthu Theendum', artist: 'Ilaiyaraaja Style', genre: 'Melody', duration_ms: 245000, mood: 'Peaceful' },
    { id: 'm-mel-2', title: 'Poove Sempoove Flute', artist: 'Acoustic Solo', genre: 'Melody', duration_ms: 198000, mood: 'Romantic' },
    { id: 'm-mel-3', title: 'Kannalane Strings Theme', artist: 'Cinema Strings', genre: 'Melody', duration_ms: 212000, mood: 'Warm' },
  ],
  love: [
    { id: 'm-lov-1', title: 'Maruvaarthai Acoustic Guitars', artist: 'Love Theme', genre: 'Romance', duration_ms: 230000, mood: 'Romantic' },
    { id: 'm-lov-2', title: 'Kadhale Kadhale Solo Violin', artist: 'Violin Express', genre: 'Romance', duration_ms: 185000, mood: 'Nostalgic' },
    { id: 'm-lov-3', title: 'Enna Sona Tamil Reprise', artist: 'Acoustic Trio', genre: 'Romance', duration_ms: 220000, mood: 'Emotional' },
  ],
  sad: [
    { id: 'm-sad-1', title: 'Kanne Kalaimaane Piano', artist: 'Midnight Keys', genre: 'Sad', duration_ms: 190000, mood: 'Melancholic' },
    { id: 'm-sad-2', title: 'Poongatrile Cello Solitude', artist: 'Chamber Strings', genre: 'Sad', duration_ms: 240000, mood: 'Sorrow' },
    { id: 'm-sad-3', title: 'Uyire Tears Theme', artist: 'Solo Bansuri', genre: 'Sad', duration_ms: 175000, mood: 'Touching' },
  ],
  mass: [
    { id: 'm-mas-1', title: 'Anirudh Style Mass Beat Drop', artist: 'EDM Thaarai Thappattai', genre: 'Mass', duration_ms: 160000, mood: 'Energetic' },
    { id: 'm-mas-2', title: 'Thalapathy Intro Brass', artist: 'Brass Section', genre: 'Mass', duration_ms: 145000, mood: 'Powerful' },
    { id: 'm-mas-3', title: 'Superstar Hero Walk Theme', artist: 'Orchestral Rock', genre: 'Mass', duration_ms: 170000, mood: 'Triumphant' },
  ],
  folk: [
    { id: 'm-flk-1', title: 'Madurai Veeran Urumi Beat', artist: 'Folk Ensemble', genre: 'Tamil Folk', duration_ms: 210000, mood: 'Vibrant' },
    { id: 'm-flk-2', title: 'Gramathu Thappu Melam', artist: 'Village Percussion', genre: 'Tamil Folk', duration_ms: 180000, mood: 'Festive' },
    { id: 'm-flk-3', title: 'Karagattakaran Nadaswaram Jive', artist: 'Temple Artists', genre: 'Tamil Folk', duration_ms: 195000, mood: 'Celebratory' },
  ],
  devotional: [
    { id: 'm-dev-1', title: 'Kanda Sashti Kavasam Strings', artist: 'Divine Melodies', genre: 'Devotional', duration_ms: 320000, mood: 'Peaceful' },
    { id: 'm-dev-2', title: 'Thiruchendur Temple Bells & Conch', artist: 'Sacred Sounds', genre: 'Devotional', duration_ms: 240000, mood: 'Serene' },
  ],
  kids: [
    { id: 'm-kid-1', title: 'Chinnanchiru Kiliye Lullaby', artist: 'Music Box & Harp', genre: 'Kids', duration_ms: 150000, mood: 'Gentle' },
    { id: 'm-kid-2', title: 'Nila Nila Odi Vaa Playful Bells', artist: 'Playground Ensemble', genre: 'Kids', duration_ms: 135000, mood: 'Happy' },
  ],
  instrumental: [
    { id: 'm-ins-1', title: 'Carnatic Veena & Mridangam Fusion', artist: 'Classical Masters', genre: 'Carnatic Fusion', duration_ms: 260000, mood: 'Artistic' },
    { id: 'm-ins-2', title: 'Bansuri Bamboo Flute Dawn', artist: 'Meditation Acoustic', genre: 'Instrumental', duration_ms: 280000, mood: 'Calm' },
  ],
  'background-music': [
    { id: 'm-bgm-1', title: 'Kollywood Suspense Tension Cue', artist: 'Cinematic Pulses', genre: 'BGM', duration_ms: 130000, mood: 'Suspense' },
    { id: 'm-bgm-2', title: 'Emotional Climax Piano & Cellos', artist: 'Orchestra Suite', genre: 'BGM', duration_ms: 210000, mood: 'Epic' },
    { id: 'm-bgm-3', title: 'Comedy Scene Fast Pizzicato', artist: 'Fun Strings', genre: 'BGM', duration_ms: 95000, mood: 'Quirky' },
  ],
};

export const MusicLibraryPanel: React.FC = () => {
  const [folders, setFolders] = useState<MusicFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('f-melody');
  const [tracks, setTracks] = useState<MusicItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'f-tamil-songs': true });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavorite, setFilterFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const playTimerRef = useRef<number | null>(null);

  const { timeline, playheadMs, addClipToTrack } = useTimelineStore();
  const { showNotification } = useUIStore();

  useEffect(() => {
    api.get('/music/folders')
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setFolders(res.data);
          setActiveFolderId(res.data[0]?.id || 'f-melody');
        } else {
          setFolders(DEFAULT_TAMIL_FOLDERS as any);
        }
      })
      .catch(() => {
        setFolders(DEFAULT_TAMIL_FOLDERS as any);
      });
  }, []);

  useEffect(() => {
    if (!activeFolderId) return;
    setIsLoading(true);

    const activeFolder = folders.find((f) => f.id === activeFolderId);
    const slug = activeFolder?.slug || 'melody';

    api.get(`/music/folders/${activeFolderId}/items`)
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setTracks(res.data);
        } else {
          const samples = SAMPLE_TRACKS_BY_SLUG[slug] || SAMPLE_TRACKS_BY_SLUG.melody;
          setTracks(samples as MusicItem[]);
        }
      })
      .catch(() => {
        const samples = SAMPLE_TRACKS_BY_SLUG[slug] || SAMPLE_TRACKS_BY_SLUG.melody;
        setTracks(samples as MusicItem[]);
      })
      .finally(() => setIsLoading(false));
  }, [activeFolderId, folders]);

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const stopPreview = () => {
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    if (oscRef.current) {
      try { oscRef.current.stop(); } catch {}
      oscRef.current = null;
    }
    setPlayingTrackId(null);
    setPlayProgress(0);
  };

  const togglePreview = (track: MusicItem) => {
    if (playingTrackId === track.id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPlayingTrackId(track.id);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.0);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        oscRef.current = osc;
      }
    } catch {}

    let p = 0;
    playTimerRef.current = window.setInterval(() => {
      p += 2;
      if (p >= 100) {
        stopPreview();
      } else {
        setPlayProgress(p);
      }
    }, 100);
  };

  const handleAddToTimeline = (track: MusicItem) => {
    if (!timeline?.tracks) {
      showNotification('No active timeline found.', 'warning');
      return;
    }

    let targetTrack = timeline.tracks.find((t) => t.track_role === 'music');
    if (!targetTrack) {
      targetTrack = timeline.tracks.find((t) => t.track_type === 'audio');
    }

    if (!targetTrack) {
      showNotification('No audio track available on timeline.', 'warning');
      return;
    }

    addClipToTrack(targetTrack.id, {
      name: track.title || 'Tamil Music Track',
      clip_type: 'media',
      duration_ms: Math.min(track.duration_ms || 30000, 60000),
      start_time_ms: playheadMs,
      volume_db: 0.0,
      fade_in_ms: 500,
      fade_out_ms: 1000,
      metadata_info: {
        music_item_id: track.id,
        artist: track.artist,
        genre: track.genre,
        mood: track.mood,
      },
    });

    showNotification(`Added "${track.title}" to ${targetTrack.name} at ${Math.round(playheadMs / 1000)}s`, 'success');
  };

  const filteredTracks = tracks.filter((t) => {
    if (filterFavorite && !t.is_favorite) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchArtist = t.artist?.toLowerCase().includes(q);
      const matchGenre = t.genre?.toLowerCase().includes(q);
      const matchMood = t.mood?.toLowerCase().includes(q);
      return matchTitle || matchArtist || matchGenre || matchMood;
    }
    return true;
  });

  const formatDuration = (ms?: number) => {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const toggleExpand = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const topFolders = folders.filter((f) => !f.parent_id && !f.parent_folder_id);

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs">
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cinema-border bg-cinema-950 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Music2 className="w-3.5 h-3.5 text-amber-400" />
          <h2 className="text-xs font-bold text-white tracking-wide">Tamil Cinema Music Library</h2>
        </div>
        <span className="text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded font-bold">
          Post-Production Ready
        </span>
      </div>

      {/* Search & Favorites Bar */}
      <div className="p-2 border-b border-cinema-border/80 bg-cinema-900 flex items-center gap-1.5 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-cinema-textDim pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Tamil songs, melodies, artists..."
            className="w-full bg-cinema-850 border border-cinema-border rounded pl-7 pr-2 py-1 text-[11px] text-cinema-text placeholder:text-cinema-textDim outline-none focus:border-amber-400/50"
          />
        </div>
        <button
          type="button"
          onClick={() => setFilterFavorite(!filterFavorite)}
          title={filterFavorite ? 'Show all songs' : 'Show favorites only'}
          className={`p-1.5 rounded border transition-colors ${
            filterFavorite
              ? 'bg-red-950/60 border-red-800 text-red-400'
              : 'bg-cinema-850 border-cinema-border text-cinema-textDim hover:text-white'
          }`}
        >
          <Heart className="w-3.5 h-3.5 fill-current" />
        </button>
      </div>

      {/* Main Split Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Folder Hierarchy Tree */}
        <div className="w-44 flex-shrink-0 border-r border-cinema-border bg-cinema-950/70 overflow-y-auto p-1 space-y-0.5">
          <div className="px-2 py-1 text-[9px] font-bold text-cinema-textMuted uppercase tracking-wider">
            Categories
          </div>
          {topFolders.map((top) => {
            const children = folders.filter((f) => f.parent_id === top.id || f.parent_folder_id === top.id);
            const hasChildren = children.length > 0;
            const isExpanded = !!expandedFolders[top.id];
            const isTopActive = activeFolderId === top.id;

            return (
              <div key={top.id} className="space-y-0.5">
                <div
                  className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    isTopActive ? 'bg-cinema-800 text-white font-medium' : 'text-cinema-textDim hover:bg-cinema-850 hover:text-white'
                  }`}
                  onClick={() => {
                    setActiveFolderId(top.id);
                    if (hasChildren) toggleExpand(top.id);
                  }}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(top.id);
                      }}
                      className="p-0.5 text-cinema-textMuted hover:text-white"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />
                  )}
                  <span className="truncate text-[11px]">{top.name}</span>
                </div>

                {/* Subfolders */}
                {hasChildren && isExpanded && (
                  <div className="pl-4 space-y-0.5 border-l border-cinema-border/40 ml-2.5">
                    {children.map((child) => {
                      const isChildActive = activeFolderId === child.id;
                      return (
                        <div
                          key={child.id}
                          onClick={() => setActiveFolderId(child.id)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
                            isChildActive
                              ? 'bg-amber-950/40 text-amber-300 font-medium border-l-2 border-amber-400'
                              : 'text-cinema-textDim hover:bg-cinema-850 hover:text-white'
                          }`}
                        >
                          <Folder className="w-3 h-3 text-amber-400/50 flex-shrink-0" />
                          <span className="truncate text-[10px]">{child.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Songs List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-cinema-900">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-cinema-textDim">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span className="text-[11px]">Loading tracks...</span>
            </div>
          ) : filteredTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center text-cinema-textDim p-4 space-y-1">
              <Disc className="w-7 h-7 opacity-30 mx-auto text-amber-400" />
              <p className="text-xs text-cinema-text font-semibold">No tracks found</p>
              <p className="text-[10px]">Try adjusting your search query or select another folder.</p>
            </div>
          ) : (
            filteredTracks.map((track) => {
              const isPlayingThis = playingTrackId === track.id;
              return (
                <div
                  key={track.id}
                  className={`p-2 rounded border transition-all ${
                    isPlayingThis
                      ? 'bg-cinema-800 border-amber-500/50 shadow-md shadow-amber-950/20'
                      : 'bg-cinema-850/90 border-cinema-border hover:border-cinema-border/90 hover:bg-cinema-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Play Button */}
                    <button
                      type="button"
                      onClick={() => togglePreview(track)}
                      title={isPlayingThis ? 'Pause preview' : 'Play audio preview'}
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                        isPlayingThis
                          ? 'bg-amber-500 text-black shadow'
                          : 'bg-cinema-750 text-white hover:bg-amber-500 hover:text-black'
                      }`}
                    >
                      {isPlayingThis ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-white truncate">{track.title}</span>
                        {track.genre && (
                          <span className="text-[8px] px-1 py-0.2 bg-cinema-750 text-cinema-textDim rounded border border-cinema-border/50">
                            {track.genre}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-cinema-textDim">
                        <span>{track.artist || 'Traditional / Film'}</span>
                        {track.mood && <span>• {track.mood}</span>}
                      </div>
                    </div>

                    {/* Duration & Add to Timeline button */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] font-mono text-cinema-textDim">{formatDuration(track.duration_ms)}</span>
                      <button
                        type="button"
                        onClick={() => handleAddToTimeline(track)}
                        title="Add to Timeline track A3 (Music) at playhead"
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-900/60 hover:bg-emerald-800/80 border border-emerald-700/60 text-emerald-300 rounded text-[10px] font-medium transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>

                  {/* Progress bar if playing */}
                  {isPlayingThis && (
                    <div className="mt-2 pt-1.5 border-t border-cinema-border/50 flex items-center gap-2">
                      <Volume2 className="w-3 h-3 text-amber-400 animate-pulse" />
                      <div className="flex-1 h-1 bg-cinema-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 transition-all duration-100"
                          style={{ width: `${playProgress}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-mono text-amber-400">PREVIEW</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};