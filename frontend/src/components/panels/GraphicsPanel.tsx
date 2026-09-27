import React, { useState } from 'react';
import { Type, Sparkles, Plus, Play, Layers, Clock, Palette, AlignCenter, AlignLeft, AlignJustify } from 'lucide-react';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';

export interface GraphicsPreset {
  id: string;
  name: string;
  category: string;
  title: string;
  subtitle: string;
  tamil_text: string;
  font_family: string;
  font_size: number;
  font_color: string;
  box_color: string;
  box_opacity: number;
  alignment: 'center' | 'lower_third' | 'top_left' | 'bottom';
  position_x: number;
  position_y: number;
  fade_in_ms: number;
  fade_out_ms: number;
  style_variant: string;
  description: string;
}

export const CINEMATIC_PRESETS: GraphicsPreset[] = [
  {
    id: 'cinema_title',
    name: 'Cinema Title',
    category: 'Cinematic',
    title: 'TAMIL AI FORGE',
    subtitle: 'EPIC FEATURE PRESENTATION',
    tamil_text: 'தமிழ் திரைப்படம்',
    font_family: 'Noto Sans Tamil',
    font_size: 48,
    font_color: '#ffffff',
    box_color: '#000000',
    box_opacity: 0.65,
    alignment: 'center',
    position_x: 0.5,
    position_y: 0.5,
    fade_in_ms: 600,
    fade_out_ms: 600,
    style_variant: 'epic_title',
    description: 'Hero cinematic main sequence title with wide tracking and gold accents.',
  },
  {
    id: 'lower_third',
    name: 'Character Lower Third',
    category: 'Broadcast',
    title: 'AADHIRAN',
    subtitle: 'Cyberpunk Architect • Sector 7',
    tamil_text: 'ஆதிரன்',
    font_family: 'Inter',
    font_size: 34,
    font_color: '#ffffff',
    box_color: '#000000',
    box_opacity: 0.8,
    alignment: 'lower_third',
    position_x: 0.08,
    position_y: 0.80,
    fade_in_ms: 400,
    fade_out_ms: 400,
    style_variant: 'accent_badge',
    description: 'Broadcast name card for character dialogue and speaker identification.',
  },
  {
    id: 'tamil_card',
    name: 'Tamil Typography Card',
    category: 'Heritage',
    title: 'வீரம் விளைந்த பூமி',
    subtitle: 'வரலாற்றுப் பின்னணி',
    tamil_text: 'வீரம் விளைந்த பூமி',
    font_family: 'Noto Sans Tamil',
    font_size: 44,
    font_color: '#fbbf24',
    box_color: '#050505',
    box_opacity: 0.85,
    alignment: 'center',
    position_x: 0.5,
    position_y: 0.5,
    fade_in_ms: 500,
    fade_out_ms: 500,
    style_variant: 'tamil_gold',
    description: 'Authentic Tamil typography card with royal amber and gold palette.',
  },
  {
    id: 'timestamp',
    name: 'Location / Timestamp',
    category: 'Narrative',
    title: 'CHENNAI HARBOR • 04:42 IST',
    subtitle: 'COORDINATES: 13.0827° N, 80.2707° E',
    tamil_text: 'சென்னை துறைமுகம்',
    font_family: 'Consolas',
    font_size: 24,
    font_color: '#10b981',
    box_color: '#000000',
    box_opacity: 0.7,
    alignment: 'top_left',
    position_x: 0.06,
    position_y: 0.12,
    fade_in_ms: 300,
    fade_out_ms: 300,
    style_variant: 'terminal',
    description: 'Tactical location stamp and timecode for scene setting.',
  },
  {
    id: 'chapter_heading',
    name: 'Chapter Heading',
    category: 'Structure',
    title: 'CHAPTER I: THE AWAKENING',
    subtitle: 'ஒரு புதிய விடியல்',
    tamil_text: 'அத்தியாயம் ஒன்று',
    font_family: 'Noto Sans Tamil',
    font_size: 38,
    font_color: '#f8fafc',
    box_color: '#000000',
    box_opacity: 0.55,
    alignment: 'center',
    position_x: 0.5,
    position_y: 0.48,
    fade_in_ms: 500,
    fade_out_ms: 500,
    style_variant: 'chapter_divider',
    description: 'Formal narrative chapter break with subtle flanking dividers.',
  },
  {
    id: 'credit_roll',
    name: 'Closing Credit Roll',
    category: 'Credits',
    title: 'WRITTEN & DIRECTED BY',
    subtitle: 'TAMIL AI FORGE CINEMA ENGINE',
    tamil_text: 'இயக்கம் மற்றும் உருவாக்கம்',
    font_family: 'Inter',
    font_size: 28,
    font_color: '#cbd5e1',
    box_color: '#000000',
    box_opacity: 0.75,
    alignment: 'bottom',
    position_x: 0.5,
    position_y: 0.76,
    fade_in_ms: 400,
    fade_out_ms: 400,
    style_variant: 'credit_block',
    description: 'Classic production roll card for opening titles and closing credits.',
  },
];

const TAMIL_QUICK_PHRASES = [
  'தமிழ் திரைப்படம்',
  'வீரம் விளைந்த பூமி',
  'இயக்கம் மற்றும் கதை',
  'சென்னை • தமிழ்நாடு',
  'அத்தியாயம் ஒன்று',
];

export const GraphicsPanel: React.FC = () => {
  const { timeline, playheadMs, addTrack, addClipToTrack, selectClip } = useTimelineStore();
  const { showNotification } = useUIStore();

  const [selectedPreset, setSelectedPreset] = useState<GraphicsPreset>(CINEMATIC_PRESETS[0]);
  const [customTitle, setCustomTitle] = useState(CINEMATIC_PRESETS[0].title);
  const [customSubtitle, setCustomSubtitle] = useState(CINEMATIC_PRESETS[0].subtitle);
  const [durationSec, setDurationSec] = useState(4);
  const [fontFamily, setFontFamily] = useState(CINEMATIC_PRESETS[0].font_family);
  const [fontColor, setFontColor] = useState(CINEMATIC_PRESETS[0].font_color);
  const [boxOpacity, setBoxOpacity] = useState(CINEMATIC_PRESETS[0].box_opacity);
  const [alignment, setAlignment] = useState<'center' | 'lower_third' | 'top_left' | 'bottom'>(CINEMATIC_PRESETS[0].alignment);

  const handleSelectPreset = (preset: GraphicsPreset) => {
    setSelectedPreset(preset);
    setCustomTitle(preset.title);
    setCustomSubtitle(preset.subtitle);
    setFontFamily(preset.font_family);
    setFontColor(preset.font_color);
    setBoxOpacity(preset.box_opacity);
    setAlignment(preset.alignment);
  };

  const handleInsertClip = (presetToInsert = selectedPreset, overrideTitle = customTitle, overrideSub = customSubtitle) => {
    if (!timeline) {
      showNotification('No active timeline sequence found.', 'error');
      return;
    }

    // 1. Find or create graphics track
    let graphicsTrack = timeline.tracks.find(
      (t) => t.track_role === 'graphics' || t.name.toLowerCase() === 'graphics'
    );

    if (!graphicsTrack) {
      addTrack('video', 'graphics', 'Graphics');
      // Re-query newly created track
      const updatedTl = useTimelineStore.getState().timeline;
      graphicsTrack = updatedTl?.tracks.find(
        (t) => t.track_role === 'graphics' || t.name.toLowerCase() === 'graphics'
      );
    }

    if (!graphicsTrack) {
      showNotification('Could not resolve or create Graphics track.', 'error');
      return;
    }

    const startMs = playheadMs || 0;
    const durMs = durationSec * 1000;
    const newClipId = crypto.randomUUID();

    let posX = presetToInsert.position_x;
    let posY = presetToInsert.position_y;
    if (alignment === 'lower_third') {
      posX = 0.08;
      posY = 0.80;
    } else if (alignment === 'top_left') {
      posX = 0.06;
      posY = 0.12;
    } else if (alignment === 'bottom') {
      posX = 0.5;
      posY = 0.82;
    } else {
      posX = 0.5;
      posY = 0.5;
    }

    const clipPayload = {
      id: newClipId,
      name: `Title: ${overrideTitle || presetToInsert.title}`,
      clip_type: 'title' as const,
      start_time_ms: startMs,
      duration_ms: durMs,
      source_in_ms: 0,
      source_out_ms: durMs,
      opacity: 1.0,
      position_x: posX,
      position_y: posY,
      fade_in_ms: presetToInsert.fade_in_ms,
      fade_out_ms: presetToInsert.fade_out_ms,
      metadata_info: {
        graphics: {
          preset_id: presetToInsert.id,
          title: overrideTitle || presetToInsert.title,
          subtitle: overrideSub || presetToInsert.subtitle,
          tamil_text: presetToInsert.tamil_text,
          font_family: fontFamily,
          font_size: presetToInsert.font_size,
          font_color: fontColor,
          box_color: presetToInsert.box_color,
          box_opacity: boxOpacity,
          alignment,
          style_variant: presetToInsert.style_variant,
        },
        text: {
          content: overrideTitle || presetToInsert.title,
          font_size: presetToInsert.font_size,
          font_color: fontColor,
          bg_color: presetToInsert.box_color,
          font_family: fontFamily,
          alignment,
        },
      },
    };

    addClipToTrack(graphicsTrack.id, clipPayload);
    selectClip(newClipId);
    showNotification(`Added "${overrideTitle || presetToInsert.title}" to Graphics track at ${Math.round(startMs / 1000)}s`, 'success');
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 overflow-y-auto p-3.5 space-y-4 text-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-cinema-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-orange-950/60 border border-orange-600/40 rounded-lg">
            <Type className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">Cinematic Titles & Graphics</h2>
            <p className="text-[10px] text-cinema-textDim">Overlay professional Tamil motion graphics & title presets</p>
          </div>
        </div>
        <span className="px-2 py-0.5 bg-orange-950/40 border border-orange-700/40 rounded text-[10px] font-mono text-orange-400">
          Phase 18
        </span>
      </div>

      {/* Preset Gallery */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold text-cinema-text uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-orange-400" />
            <span>Title Presets (6)</span>
          </h3>
          <span className="text-[10px] text-cinema-textDim">Click to customize</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {CINEMATIC_PRESETS.map((preset) => {
            const isSelected = selectedPreset.id === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`relative p-2.5 rounded-lg border transition-all cursor-pointer text-left flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-orange-950/30 border-orange-500/80 shadow-md ring-1 ring-orange-500/40'
                    : 'bg-cinema-850/90 border-cinema-border hover:border-orange-500/40 hover:bg-cinema-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-cinema-900 border border-cinema-border text-cinema-textDim">
                      {preset.category}
                    </span>
                    <button
                      type="button"
                      title="Quick insert at playhead"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPreset(preset);
                        handleInsertClip(preset, preset.title, preset.subtitle);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-orange-600/30 hover:bg-orange-600 text-orange-300 hover:text-white"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <h4 className="font-semibold text-cinema-text text-[11px] truncate">{preset.name}</h4>
                  <p className="text-[10px] text-orange-300/80 font-serif truncate mt-0.5">{preset.tamil_text}</p>
                </div>
                <div className="mt-2 pt-1.5 border-t border-cinema-border/50 flex items-center justify-between text-[9px] text-cinema-textDim">
                  <span>{preset.alignment}</span>
                  <span className="font-mono">{preset.font_size}px</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preset Customizer */}
      <div className="space-y-3 bg-cinema-850/80 border border-cinema-border rounded-lg p-3">
        <div className="flex items-center justify-between pb-1 border-b border-cinema-border/60">
          <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-cinema-ai" />
            <span>Customize: {selectedPreset.name}</span>
          </span>
          <span className="text-[10px] text-cinema-textMuted font-mono">{(playheadMs / 1000).toFixed(1)}s</span>
        </div>

        {/* Primary Title */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-cinema-textDim block">Primary Title</label>
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Enter title text..."
            className="w-full bg-cinema-900 border border-cinema-border rounded px-2.5 py-1.5 text-cinema-text text-[11px] outline-none focus:border-orange-500"
          />
        </div>

        {/* Quick Tamil Phrases */}
        <div className="space-y-1">
          <label className="text-[9px] text-cinema-textMuted block">Quick Tamil Phrases</label>
          <div className="flex flex-wrap gap-1">
            {TAMIL_QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => setCustomTitle(phrase)}
                className="px-2 py-0.5 bg-cinema-900 hover:bg-orange-950/40 border border-cinema-border hover:border-orange-500/50 rounded text-[9px] text-cinema-textDim hover:text-orange-300 transition-colors"
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>

        {/* Subtitle */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-cinema-textDim block">Subtitle / Secondary Text</label>
          <input
            type="text"
            value={customSubtitle}
            onChange={(e) => setCustomSubtitle(e.target.value)}
            placeholder="Enter subtitle or role..."
            className="w-full bg-cinema-900 border border-cinema-border rounded px-2.5 py-1.5 text-cinema-text text-[11px] outline-none focus:border-orange-500"
          />
        </div>

        {/* Font & Color Row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-cinema-textDim block mb-1">Font Family</label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 text-cinema-text text-[10px] outline-none"
            >
              <option value="Noto Sans Tamil">Noto Sans Tamil</option>
              <option value="Nirmala UI">Nirmala UI</option>
              <option value="Inter">Inter (Sans)</option>
              <option value="Consolas">Consolas (Mono)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-cinema-textDim block mb-1">Text Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={fontColor}
                onChange={(e) => setFontColor(e.target.value)}
                className="w-8 h-7 bg-cinema-900 border border-cinema-border rounded cursor-pointer"
              />
              <span className="text-[10px] font-mono text-cinema-textDim uppercase">{fontColor}</span>
            </div>
          </div>
        </div>

        {/* Alignment & Duration Row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-cinema-textDim block mb-1">Alignment</label>
            <select
              value={alignment}
              onChange={(e: any) => setAlignment(e.target.value)}
              className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 text-cinema-text text-[10px] outline-none capitalize"
            >
              <option value="center">Center</option>
              <option value="lower_third">Lower Third</option>
              <option value="top_left">Top Left</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-cinema-textDim block mb-1">Duration</label>
            <div className="flex gap-1">
              {[2, 3, 4, 6].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setDurationSec(sec)}
                  className={`flex-1 py-1 rounded text-[10px] border transition-colors ${
                    durationSec === sec
                      ? 'bg-orange-600 border-orange-500 text-white font-bold'
                      : 'bg-cinema-900 border-cinema-border text-cinema-textDim hover:text-white'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Box Opacity Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-cinema-textDim">Backdrop Box Opacity</span>
            <span className="text-cinema-text font-mono">{Math.round(boxOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={boxOpacity}
            onChange={(e) => setBoxOpacity(parseFloat(e.target.value))}
            className="w-full accent-orange-500 bg-cinema-900 h-1.5 rounded cursor-pointer"
          />
        </div>

        {/* Main Action Button */}
        <button
          id="add-graphics-to-timeline-btn"
          type="button"
          onClick={() => handleInsertClip()}
          className="w-full mt-2 py-2 px-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Add to Timeline at {(playheadMs / 1000).toFixed(1)}s</span>
        </button>
      </div>

      {/* Guide Note */}
      <div className="p-2.5 rounded bg-cinema-850/60 border border-cinema-border/50 text-[10px] text-cinema-textDim space-y-1">
        <p className="font-semibold text-cinema-text flex items-center gap-1">
          <Layers className="w-3 h-3 text-orange-400" />
          <span>Graphics Track Workflow</span>
        </p>
        <p>
          Title clips are rendered procedurally on the <strong>Graphics track</strong>. They sync with the real-time preview monitor and export natively through local FFmpeg with Tamil font shaping.
        </p>
      </div>
    </div>
  );
};
