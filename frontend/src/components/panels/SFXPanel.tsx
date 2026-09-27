import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  Search,
  Play,
  Pause,
  Plus,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';

export interface SFXItem {
  id: string;
  category: string;
  name: string;
  duration_ms: number;
  tags: string[];
}

export const SFX_CATEGORIES = [
  'All',
  'Whoosh',
  'Impact',
  'Hit',
  'Explosion',
  'Footsteps',
  'Door',
  'Vehicle',
  'Nature',
  'Rain',
  'Wind',
  'Water',
  'Crowd',
  'UI',
  'Cinematic',
  'Horror',
  'Comedy',
  'Foley',
] as const;

export const SFX_LIBRARY: SFXItem[] = [
  // Whoosh
  { id: 'sfx-w1', category: 'Whoosh', name: 'Cinematic Fast Whoosh Transition', duration_ms: 1200, tags: ['transition', 'fast', 'air'] },
  { id: 'sfx-w2', category: 'Whoosh', name: 'Deep Sub Whoosh Rise', duration_ms: 2200, tags: ['bass', 'sub', 'riser'] },
  { id: 'sfx-w3', category: 'Whoosh', name: 'Whip Swish Fast Pass', duration_ms: 850, tags: ['whip', 'passby'] },

  // Impact
  { id: 'sfx-i1', category: 'Impact', name: 'Cinematic Trailer Sub Hit', duration_ms: 2500, tags: ['trailer', 'sub', 'boom'] },
  { id: 'sfx-i2', category: 'Impact', name: 'Metal Door Slam Impact', duration_ms: 1800, tags: ['metal', 'slam'] },
  { id: 'sfx-i3', category: 'Impact', name: 'Mass Hero Punch Impact (Tamil Style)', duration_ms: 1400, tags: ['punch', 'fight', 'action'] },

  // Hit
  { id: 'sfx-h1', category: 'Hit', name: 'Martial Arts Body Hit', duration_ms: 600, tags: ['action', 'punch', 'combat'] },
  { id: 'sfx-h2', category: 'Hit', name: 'Sword Clash & Spark Ring', duration_ms: 1100, tags: ['sword', 'metal', 'historic'] },
  { id: 'sfx-h3', category: 'Hit', name: 'Wood Stick Crack Strike', duration_ms: 700, tags: ['wood', 'stick', 'fight'] },

  // Explosion
  { id: 'sfx-e1', category: 'Explosion', name: 'Huge Petrol Bomb Fire Blast', duration_ms: 3800, tags: ['fire', 'blast', 'action'] },
  { id: 'sfx-e2', category: 'Explosion', name: 'Distant Grenade Echo', duration_ms: 2900, tags: ['military', 'grenade'] },
  { id: 'sfx-e3', category: 'Explosion', name: 'Debris & Rubble Crumble', duration_ms: 2400, tags: ['debris', 'dust'] },

  // Footsteps
  { id: 'sfx-f1', category: 'Footsteps', name: 'Fast Running on Concrete', duration_ms: 3200, tags: ['run', 'chase', 'urban'] },
  { id: 'sfx-f2', category: 'Footsteps', name: 'Slow Creepy Wood Floor Steps', duration_ms: 4100, tags: ['wood', 'slow', 'creepy'] },
  { id: 'sfx-f3', category: 'Footsteps', name: 'Mud & Water Puddle Splash Steps', duration_ms: 2800, tags: ['mud', 'rain', 'wet'] },

  // Door
  { id: 'sfx-d1', category: 'Door', name: 'Creaky Old Temple Wooden Door', duration_ms: 2600, tags: ['creak', 'temple', 'wood'] },
  { id: 'sfx-d2', category: 'Door', name: 'Heavy Jail Gate Lock & Shut', duration_ms: 2100, tags: ['metal', 'jail', 'latch'] },

  // Vehicle
  { id: 'sfx-v1', category: 'Vehicle', name: 'Royal Enfield Bullet 350 Thump Idling', duration_ms: 4500, tags: ['bike', 'bullet', 'engine'] },
  { id: 'sfx-v2', category: 'Vehicle', name: 'Madurai Auto Rickshaw Acceleration', duration_ms: 3600, tags: ['auto', 'rickshaw', 'city'] },
  { id: 'sfx-v3', category: 'Vehicle', name: 'High Speed Car Tyre Screech', duration_ms: 2000, tags: ['car', 'skid', 'chase'] },

  // Nature
  { id: 'sfx-n1', category: 'Nature', name: 'Western Ghats Morning Jungle Birds', duration_ms: 6000, tags: ['birds', 'jungle', 'morning'] },
  { id: 'sfx-n2', category: 'Nature', name: 'Night Crickets & Cicadas in Village', duration_ms: 5500, tags: ['night', 'crickets', 'village'] },

  // Rain
  { id: 'sfx-r1', category: 'Rain', name: 'Heavy Monsoon Downpour on Tin Roof', duration_ms: 5200, tags: ['monsoon', 'roof', 'heavy'] },
  { id: 'sfx-r2', category: 'Rain', name: 'Drizzle with Distant Thunder Rumbles', duration_ms: 4800, tags: ['thunder', 'drizzle'] },

  // Wind
  { id: 'sfx-wnd1', category: 'Wind', name: 'Howling Cold Mountain Gale', duration_ms: 4500, tags: ['howl', 'mountain', 'cold'] },
  { id: 'sfx-wnd2', category: 'Wind', name: 'Gentle Coconut Tree Sea Breeze', duration_ms: 5000, tags: ['coastal', 'breeze', 'palm'] },

  // Water
  { id: 'sfx-wtr1', category: 'Water', name: 'Marina Beach Ocean Waves Shore Break', duration_ms: 5500, tags: ['beach', 'waves', 'ocean'] },
  { id: 'sfx-wtr2', category: 'Water', name: 'River Stream Gentle Flow & Gurgle', duration_ms: 4200, tags: ['river', 'stream'] },

  // Crowd
  { id: 'sfx-c1', category: 'Crowd', name: 'Cinema Hall FDFS Cheers & Whistles', duration_ms: 4200, tags: ['theatre', 'whistle', 'fdfs', 'mass'] },
  { id: 'sfx-c2', category: 'Crowd', name: 'Busy Chennai T. Nagar Market Ambience', duration_ms: 5000, tags: ['market', 'bazaar', 'street'] },

  // UI
  { id: 'sfx-u1', category: 'UI', name: 'Modern Camera Shutter Click', duration_ms: 400, tags: ['camera', 'click', 'snap'] },
  { id: 'sfx-u2', category: 'UI', name: 'High-Tech Digital Beep Confirm', duration_ms: 500, tags: ['digital', 'beep', 'sci-fi'] },

  // Cinematic
  { id: 'sfx-cin1', category: 'Cinematic', name: 'Deep Sub Bass Drone Tension', duration_ms: 4800, tags: ['drone', 'tension', 'bass'] },
  { id: 'sfx-cin2', category: 'Cinematic', name: 'Suspense Bowed Cymbal Shimmer', duration_ms: 3200, tags: ['bowed', 'cymbal', 'mystery'] },

  // Horror
  { id: 'sfx-hor1', category: 'Horror', name: 'Ghostly Whisper in Empty Hallway', duration_ms: 2700, tags: ['whisper', 'ghost', 'spooky'] },
  { id: 'sfx-hor2', category: 'Horror', name: 'Sudden Jumpscare Screech Stinger', duration_ms: 1200, tags: ['jumpscare', 'stinger', 'shriek'] },

  // Comedy
  { id: 'sfx-com1', category: 'Comedy', name: 'Goundamani / Vadivelu Boing Spring', duration_ms: 900, tags: ['boing', 'spring', 'fun'] },
  { id: 'sfx-com2', category: 'Comedy', name: 'Funny Slip & Banana Peel Slide', duration_ms: 800, tags: ['slip', 'whistle', 'slide'] },

  // Foley
  { id: 'sfx-fol1', category: 'Foley', name: 'Leather Jacket Rustle & Movement', duration_ms: 1400, tags: ['cloth', 'leather', 'movement'] },
  { id: 'sfx-fol2', category: 'Foley', name: 'Porcelain Coffee Cup Clink on Saucer', duration_ms: 600, tags: ['cup', 'ceramic', 'kitchen'] },
];

export const SFXPanel: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [playingSfxId, setPlayingSfxId] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const playTimerRef = useRef<number | null>(null);

  const { timeline, playheadMs, addClipToTrack } = useTimelineStore();
  const { showNotification } = useUIStore();

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const stopPreview = () => {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    setPlayingSfxId(null);
  };

  const togglePreview = (item: SFXItem) => {
    if (playingSfxId === item.id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPlayingSfxId(item.id);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Tune frequency based on category
        const isLow = ['Impact', 'Explosion', 'Cinematic'].includes(item.category);
        osc.frequency.setValueAtTime(isLow ? 90 : 440, ctx.currentTime);
        if (isLow) {
          osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + item.duration_ms / 1000);
        }

        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + Math.min(2.0, item.duration_ms / 1000));

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + Math.min(2.0, item.duration_ms / 1000));
      }
    } catch {}

    playTimerRef.current = window.setTimeout(() => {
      stopPreview();
    }, Math.min(2500, item.duration_ms));
  };

  const handleAddToTimeline = (item: SFXItem) => {
    if (!timeline?.tracks) {
      showNotification('No active timeline found.', 'warning');
      return;
    }

    // Find Track A4 - Sound Effects or any track with role sfx or audio
    let targetTrack = timeline.tracks.find((t) => t.track_role === 'sfx');
    if (!targetTrack) {
      targetTrack = timeline.tracks.find((t) => t.track_type === 'audio');
    }

    if (!targetTrack) {
      showNotification('No audio track available on timeline.', 'warning');
      return;
    }

    addClipToTrack(targetTrack.id, {
      name: item.name,
      clip_type: 'media',
      duration_ms: item.duration_ms,
      start_time_ms: playheadMs,
      volume_db: 0.0,
      fade_in_ms: 10,
      fade_out_ms: 150,
      metadata_info: {
        sfx_id: item.id,
        category: item.category,
        tags: item.tags,
      },
    });

    showNotification(`Added SFX "${item.name}" to ${targetTrack.name} at ${Math.round(playheadMs / 100) / 10}s`, 'success');
  };

  const filteredItems = SFX_LIBRARY.filter((item) => {
    if (activeCategory !== 'All' && item.category !== activeCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchCategory = item.category.toLowerCase().includes(q);
      const matchTags = item.tags.some((t) => t.toLowerCase().includes(q));
      return matchName || matchCategory || matchTags;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cinema-border bg-cinema-950 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-cinema-ai" />
          <h2 className="text-xs font-bold text-white tracking-wide">Sound Effects (17 Categories)</h2>
        </div>
        <span className="text-[9px] bg-cinema-800 text-cinema-textDim px-1.5 py-0.5 rounded font-mono">
          {SFX_LIBRARY.length} Sounds
        </span>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-cinema-border/80 bg-cinema-900 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-cinema-textDim pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SFX (e.g., whoosh, punch, bullet, rain)..."
            className="w-full bg-cinema-850 border border-cinema-border rounded pl-8 pr-3 py-1.5 text-[11px] text-cinema-text outline-none placeholder:text-cinema-textDim focus:border-cinema-ai/60"
          />
        </div>
      </div>

      {/* 17 Category Filter Chips */}
      <div className="px-2 py-1.5 border-b border-cinema-border/60 bg-cinema-950 flex items-center gap-1 overflow-x-auto scrollbar-none flex-shrink-0">
        {SFX_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap transition-colors border ${
                isActive
                  ? 'bg-cinema-ai/20 border-cinema-ai text-cinema-ai font-semibold'
                  : 'bg-cinema-850 border-cinema-border text-cinema-textDim hover:text-white hover:bg-cinema-800'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* SFX Items List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-cinema-900">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-cinema-textDim p-4 space-y-1">
            <Volume2 className="w-6 h-6 opacity-30 mx-auto" />
            <p className="text-xs font-semibold text-cinema-text">No SFX found</p>
            <p className="text-[10px]">Try searching with a different keyword or category.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isPlayingThis = playingSfxId === item.id;
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between p-2 rounded border transition-colors ${
                  isPlayingThis
                    ? 'bg-cinema-800 border-cinema-ai/60 shadow-sm'
                    : 'bg-cinema-850/80 border-cinema-border hover:bg-cinema-800 hover:border-cinema-border/90'
                }`}
              >
                {/* Play Preview Button */}
                <button
                  type="button"
                  onClick={() => togglePreview(item)}
                  title={isPlayingThis ? 'Stop preview' : 'Play SFX preview'}
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isPlayingThis
                      ? 'bg-cinema-ai text-black'
                      : 'bg-cinema-750 text-white hover:bg-cinema-ai hover:text-black'
                  }`}
                >
                  {isPlayingThis ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                </button>

                {/* Name & Category Tags */}
                <div className="flex-1 min-w-0 px-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-cinema-text font-medium truncate">{item.name}</span>
                    <span className="text-[8px] px-1 bg-cinema-750 text-cinema-textDim rounded border border-cinema-border/40">
                      {item.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {item.tags.map((tag) => (
                      <span key={tag} className="text-[8px] text-cinema-textDim">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Duration & Add to Timeline */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-mono text-cinema-textDim">
                    {(item.duration_ms / 1000).toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAddToTimeline(item)}
                    title="Add to Timeline track A4 (SFX) at playhead"
                    className="flex items-center gap-1 px-2 py-0.8 bg-cinema-800 hover:bg-cinema-700 border border-cinema-border text-cinema-text hover:text-white rounded text-[10px] transition-colors"
                  >
                    <Plus className="w-3 h-3 text-cinema-ai" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};