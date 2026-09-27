import React, { useEffect, useState, useCallback } from 'react';
import {
  Move, Crop, Video, Wand2, Palette, Volume2, Type, Sparkles,
  RotateCw, Sliders, Disc, Plus, Eye, EyeOff, ChevronUp, ChevronDown,
  Loader2, AlertCircle, Activity, Crosshair, ScanLine,
} from 'lucide-react';
import { useUIStore, InspectorTab } from '../../stores/useUIStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore as useUI } from '../../stores/useUIStore';
import { Clip } from '../../types';
import { api } from '../../services/api';

const TABS: Array<{ id: InspectorTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'transform', label: 'Transform', icon: Move },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'ai', label: 'AI', icon: Sparkles },
];

// Helper slider row
const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accentClass?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 0.01, unit = '', accentClass = 'accent-cinema-red', onChange }) => (
  <div>
    <div className="flex justify-between text-[11px] text-cinema-text mb-1">
      <span>{label}</span>
      <span className="font-mono text-cinema-ai">{typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(2) : value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`w-full ${accentClass}`}
    />
  </div>
);

// Helper number row
const NumberRow: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, unit = '', onChange }) => (
  <div className="bg-cinema-900 border border-cinema-border rounded px-2 py-1.5 flex items-center justify-between">
    <span className="text-cinema-textDim text-[11px]">{label}</span>
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-16 bg-transparent text-right outline-none font-mono text-cinema-text text-[11px]"
      />
      {unit && <span className="text-cinema-textDim text-[10px]">{unit}</span>}
    </div>
  </div>
);

export const DynamicInspector: React.FC = () => {
  const { activeInspectorTab, setActiveInspectorTab } = useUIStore();
  const { selectedClipId, timeline, updateClip, playheadMs, addKeyframe, deleteKeyframe } = useTimelineStore();
  const { showNotification } = useUI();

  // Find selected clip
  let selectedClip: Clip | null = null;
  let trackRole = '';
  if (selectedClipId && timeline) {
    for (const track of timeline.tracks) {
      const c = track.clips.find((clip) => clip.id === selectedClipId);
      if (c) {
        selectedClip = c;
        trackRole = track.track_role;
        break;
      }
    }
  }

  // Auto-switch tab when a clip is selected
  useEffect(() => {
    if (!selectedClip) return;
    if (['dialogue', 'voiceover', 'music', 'sfx', 'ambience'].includes(trackRole)) {
      setActiveInspectorTab('audio');
    } else if (selectedClip.clip_type === 'caption' || selectedClip.clip_type === 'title' || trackRole === 'graphics') {
      setActiveInspectorTab('text');
    } else if (activeInspectorTab === 'audio' || activeInspectorTab === 'text') {
      setActiveInspectorTab('transform');
    }
  }, [selectedClipId]); // eslint-disable-line

  const update = (updater: (clip: Clip) => void) => {
    if (selectedClip) updateClip(selectedClip.id, updater);
  };

  const handleAIStub = (action: string) => {
    showNotification(`AI provider not configured: ${action}. Configure a provider in Settings.`, 'warning');
  };

  return (
    <div className="flex flex-col h-full bg-cinema-850 border-l border-cinema-border select-none text-xs">
      {/* Inspector Header */}
      <div className="h-10 border-b border-cinema-border flex items-center justify-between px-3 flex-shrink-0">
        <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cinema-red" />
          Inspector
        </span>
        {selectedClip ? (
          <span className="text-[10px] text-cinema-ai truncate max-w-[130px] font-mono">
            {selectedClip.name}
          </span>
        ) : (
          <span className="text-[10px] text-cinema-textDim">No clip selected</span>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center border-b border-cinema-border overflow-x-auto bg-cinema-900 scrollbar-none flex-shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeInspectorTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveInspectorTab(tab.id)}
              title={tab.label}
              className={`flex-1 py-1.5 md:py-2 px-1 flex flex-col items-center gap-0.5 md:gap-1 border-b-2 transition-colors min-w-[36px] ${
                isActive
                  ? 'border-cinema-red text-white bg-cinema-800'
                  : 'border-transparent text-cinema-textDim hover:text-cinema-text hover:bg-cinema-850'
              }`}
            >
              <Icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${isActive ? 'text-cinema-red' : ''}`} />
              <span className="text-[8px] md:text-[9px] font-medium truncate hidden sm:block">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Inspector Content Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4">

        {/* ─── No clip selected fallback ─── */}
        {!selectedClip && (
          <div className="text-center py-8 text-cinema-textDim space-y-2">
            <Sliders className="w-8 h-8 mx-auto opacity-20" />
            <p className="font-semibold text-white text-xs">No Clip Selected</p>
            <p className="text-[11px]">Select a clip in the timeline to edit its properties.</p>
          </div>
        )}

        {/* ─── TAB: TRANSFORM ─── */}
        {activeInspectorTab === 'transform' && selectedClip && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-cinema-text block mb-2">Position</label>
              <div className="grid grid-cols-2 gap-2">
                <NumberRow label="X" value={selectedClip.position_x} step={0.01} min={-2} max={2} onChange={(v) => update((c) => { c.position_x = v; })} />
                <NumberRow label="Y" value={selectedClip.position_y} step={0.01} min={-2} max={2} onChange={(v) => update((c) => { c.position_y = v; })} />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-cinema-text block mb-2">Scale</label>
              <div className="grid grid-cols-2 gap-2">
                <NumberRow label="X" value={selectedClip.scale_x} step={0.01} min={0.01} max={10} onChange={(v) => update((c) => { c.scale_x = v; })} />
                <NumberRow label="Y" value={selectedClip.scale_y} step={0.01} min={0.01} max={10} onChange={(v) => update((c) => { c.scale_y = v; })} />
              </div>
            </div>

            <NumberRow label="Rotation" value={selectedClip.rotation} step={0.5} min={-360} max={360} unit="°" onChange={(v) => update((c) => { c.rotation = v; })} />

            <div>
              <label className="text-[11px] font-semibold text-cinema-text block mb-2">Anchor Point</label>
              <div className="grid grid-cols-2 gap-2">
                <NumberRow label="X" value={selectedClip.anchor_x} step={0.01} min={0} max={1} onChange={(v) => update((c) => { c.anchor_x = v; })} />
                <NumberRow label="Y" value={selectedClip.anchor_y} step={0.01} min={0} max={1} onChange={(v) => update((c) => { c.anchor_y = v; })} />
              </div>
            </div>

            <SliderRow
              label="Opacity"
              value={selectedClip.opacity}
              min={0}
              max={1}
              step={0.01}
              unit={` ${Math.round(selectedClip.opacity * 100)}%`}
              onChange={(v) => update((c) => { c.opacity = v; })}
            />

            <div>
              <label className="text-[11px] font-semibold text-cinema-text block mb-1">Blend Mode</label>
              <select
                value={selectedClip.blend_mode}
                onChange={(e) => update((c) => { c.blend_mode = e.target.value; })}
                className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1.5 text-cinema-text outline-none text-[11px]"
              >
                {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'].map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1).replace('-', ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ─── TAB: CROP ─── */}
        {activeInspectorTab === 'crop' && selectedClip && (
          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold text-cinema-text">Edge Crop (0.0–0.5)</h4>
            {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
              <div key={side} className="flex items-center justify-between bg-cinema-900 p-2 rounded border border-cinema-border">
                <span className="capitalize text-cinema-textDim text-[11px]">{side}</span>
                <input
                  type="number"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={selectedClip[`crop_${side}` as keyof Clip] as number}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    update((c) => { (c as any)[`crop_${side}`] = Math.max(0, Math.min(0.5, val)); });
                  }}
                  className="w-16 bg-transparent text-right outline-none font-mono text-cinema-text text-[11px]"
                />
              </div>
            ))}
          </div>
        )}

        {/* ─── TAB: VIDEO ─── */}
        {activeInspectorTab === 'video' && selectedClip && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-cinema-text block mb-2">Speed Factor</label>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {[0.25, 0.5, 1.0, 1.5, 2.0].map((s) => (
                  <button
                    key={s}
                    onClick={() => update((c) => { c.speed_factor = s; })}
                    className={`py-1 rounded border text-[10px] font-mono transition-colors ${
                      selectedClip.speed_factor === s
                        ? 'bg-cinema-red border-cinema-red text-white'
                        : 'bg-cinema-900 border-cinema-border text-cinema-textDim hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={0.05}
                max={10}
                step={0.05}
                value={selectedClip.speed_factor}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v > 0) update((c) => { c.speed_factor = v; });
                }}
                className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1.5 font-mono text-cinema-text outline-none text-[11px]"
                placeholder="Custom speed..."
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-cinema-border">
              {([
                ['is_reversed', 'Reverse Playback'],
                ['is_frozen', 'Freeze Frame Hold'],
              ] as const).map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!(selectedClip as any)[field]}
                    onChange={(e) => update((c) => { (c as any)[field] = e.target.checked; })}
                    className="rounded border-cinema-border accent-cinema-red"
                  />
                  <span className="text-cinema-text text-[11px]">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB: EFFECTS ─── */}
        {activeInspectorTab === 'effects' && selectedClip && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold text-cinema-text">Applied Effects</h4>
              <button
                onClick={() => showNotification('Effect library coming in Phase 3.', 'info')}
                className="flex items-center gap-1 text-[10px] text-cinema-ai hover:text-white transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Effect
              </button>
            </div>

            {selectedClip.effects.length === 0 ? (
              <div className="text-center py-6 text-cinema-textDim border border-dashed border-cinema-border rounded">
                <Wand2 className="w-5 h-5 mx-auto mb-2 opacity-30" />
                <p className="text-[11px]">No effects applied</p>
                <p className="text-[10px] mt-1">Effects library arrives in Phase 3</p>
              </div>
            ) : (
              selectedClip.effects.map((effect, idx) => (
                <div key={effect.id || idx} className="flex items-center justify-between bg-cinema-900 p-2 rounded border border-cinema-border">
                  <span className="text-cinema-text text-[11px]">{effect.effect_type}</span>
                  <button
                    onClick={() => update((c) => {
                      const e = c.effects[idx];
                      if (e) e.is_enabled = !e.is_enabled;
                    })}
                    className={effect.is_enabled ? 'text-cinema-text' : 'text-cinema-textDim'}
                  >
                    {effect.is_enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── TAB: COLOR ─── */}
        {activeInspectorTab === 'color' && selectedClip && (
          <ColorInspectorContent
            selectedClip={selectedClip}
            update={update}
            showNotification={showNotification}
          />
        )}

        {/* ─── TAB: AUDIO ─── */}
        {activeInspectorTab === 'audio' && selectedClip && (
          <div className="space-y-3.5">
            {/* 1. BASIC GAIN & PAN */}
            <div className="space-y-2.5 p-2.5 bg-cinema-900/80 rounded border border-cinema-border">
              <div className="flex items-center justify-between text-[11px] font-semibold text-cinema-text">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  Basic Audio
                </span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
                  <input
                    type="checkbox"
                    checked={selectedClip.volume_db <= -60}
                    onChange={(e) => update((c) => { c.volume_db = e.target.checked ? -60 : 0; })}
                    className="rounded accent-cinema-red"
                  />
                  <span>Mute</span>
                </label>
              </div>

              <SliderRow
                label="Volume Gain"
                value={selectedClip.volume_db}
                min={-60}
                max={12}
                step={0.5}
                unit=" dB"
                accentClass="accent-emerald-500"
                onChange={(v) => update((c) => { c.volume_db = v; })}
              />

              <SliderRow
                label="Pan / Balance"
                value={selectedClip.pan ?? 0.0}
                min={-1.0}
                max={1.0}
                step={0.05}
                unit=""
                accentClass="accent-cyan-500"
                onChange={(v) => update((c) => { c.pan = v; })}
              />
              <div className="flex justify-between text-[8px] font-mono text-cinema-textDim px-0.5">
                <span>L 100%</span>
                <span>CENTER</span>
                <span>R 100%</span>
              </div>
            </div>

            {/* 2. FADES */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <span className="text-[11px] font-semibold text-cinema-text block">Fades</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-cinema-textDim block mb-1">Fade In (ms)</label>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={selectedClip.fade_in_ms}
                    onChange={(e) => update((c) => { c.fade_in_ms = parseInt(e.target.value) || 0; })}
                    className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-cinema-textDim block mb-1">Fade Out (ms)</label>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={selectedClip.fade_out_ms}
                    onChange={(e) => update((c) => { c.fade_out_ms = parseInt(e.target.value) || 0; })}
                    className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                  />
                </div>
              </div>
            </div>

            {/* 3. 5-BAND EQUALIZER */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  5-Band Cinema EQ
                </span>
                <button
                  type="button"
                  onClick={() => update((c) => {
                    if (!c.metadata_info) c.metadata_info = {};
                    c.metadata_info.equalizer = { low_80: 0, low_mid_250: 0, mid_1000: 0, high_mid_4000: 0, high_12000: 0 };
                  })}
                  className="text-[9px] text-cinema-textDim hover:text-white"
                >
                  Reset Flat
                </button>
              </div>

              {/* EQ Presets */}
              <div className="flex flex-wrap gap-1">
                {[
                  { name: 'Voice Clarity', eq: { low_80: -3, low_mid_250: -2, mid_1000: 1, high_mid_4000: 3, high_12000: 2 } },
                  { name: 'Dialogue (Tamil)', eq: { low_80: -4, low_mid_250: 0, mid_1000: 2.5, high_mid_4000: 3.5, high_12000: 1 } },
                  { name: 'Music Warmth', eq: { low_80: 2.5, low_mid_250: 1.5, mid_1000: -1, high_mid_4000: 1, high_12000: 2 } },
                  { name: 'Bass Boost', eq: { low_80: 6, low_mid_250: 3, mid_1000: 0, high_mid_4000: 0, high_12000: -1 } },
                  { name: 'Bright / Air', eq: { low_80: -2, low_mid_250: 0, mid_1000: 1, high_mid_4000: 4, high_12000: 5 } },
                  { name: 'Cinema Punch', eq: { low_80: 4, low_mid_250: -2, mid_1000: 1, high_mid_4000: 3, high_12000: 3 } },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      c.metadata_info.equalizer = { ...preset.eq };
                    })}
                    className="px-1.5 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text rounded text-[9px] border border-cinema-border/60 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              {/* 5 Sliders: 80Hz, 250Hz, 1kHz, 4kHz, 12kHz */}
              <div className="space-y-1.5 pt-1">
                {[
                  { band: 'low_80', label: 'Low (80 Hz)' },
                  { band: 'low_mid_250', label: 'Low-Mid (250 Hz)' },
                  { band: 'mid_1000', label: 'Mid (1 kHz)' },
                  { band: 'high_mid_4000', label: 'High-Mid (4 kHz)' },
                  { band: 'high_12000', label: 'High (12 kHz)' },
                ].map(({ band, label }) => {
                  const eqState = selectedClip.metadata_info?.equalizer || {};
                  const val = eqState[band] ?? 0.0;
                  return (
                    <SliderRow
                      key={band}
                      label={label}
                      value={val}
                      min={-15}
                      max={15}
                      step={0.5}
                      unit=" dB"
                      accentClass="accent-cyan-400"
                      onChange={(v) => update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.equalizer) c.metadata_info.equalizer = {};
                        c.metadata_info.equalizer[band] = v;
                      })}
                    />
                  );
                })}
              </div>
            </div>

            {/* 4. DYNAMICS / COMPRESSOR */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text">Dynamics (Compressor)</span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
                  <input
                    type="checkbox"
                    checked={!!selectedClip.metadata_info?.compressor?.enabled}
                    onChange={(e) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.compressor) c.metadata_info.compressor = {
                        enabled: true, threshold_db: -18, ratio: 3.5, attack_ms: 20, release_ms: 120, makeup_gain_db: 3.0
                      };
                      c.metadata_info.compressor.enabled = e.target.checked;
                    })}
                    className="rounded accent-cinema-ai"
                  />
                  <span>Enable</span>
                </label>
              </div>

              {/* Compressor Presets */}
              <div className="flex gap-1">
                {[
                  { name: 'Dialogue', cfg: { threshold_db: -18, ratio: 3.5, attack_ms: 20, release_ms: 120, makeup_gain_db: 3.0 } },
                  { name: 'Voice Over', cfg: { threshold_db: -20, ratio: 4.0, attack_ms: 15, release_ms: 100, makeup_gain_db: 4.0 } },
                  { name: 'Music Bus', cfg: { threshold_db: -12, ratio: 2.0, attack_ms: 40, release_ms: 250, makeup_gain_db: 1.5 } },
                  { name: 'Master', cfg: { threshold_db: -3, ratio: 8.0, attack_ms: 5, release_ms: 60, makeup_gain_db: 0.0 } },
                ].map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      c.metadata_info.compressor = { enabled: true, ...p.cfg };
                    })}
                    className="px-1.5 py-0.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text rounded text-[9px] border border-cinema-border/60 transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              {selectedClip.metadata_info?.compressor?.enabled && (
                <div className="space-y-2 pt-1 border-t border-cinema-border/50">
                  <SliderRow
                    label="Threshold"
                    value={selectedClip.metadata_info?.compressor?.threshold_db ?? -18}
                    min={-40}
                    max={0}
                    step={1}
                    unit=" dB"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                      c.metadata_info.compressor.threshold_db = v;
                    })}
                  />
                  <SliderRow
                    label="Ratio"
                    value={selectedClip.metadata_info?.compressor?.ratio ?? 3.5}
                    min={1}
                    max={20}
                    step={0.5}
                    unit=":1"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                      c.metadata_info.compressor.ratio = v;
                    })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <NumberRow
                      label="Attack (ms)"
                      value={selectedClip.metadata_info?.compressor?.attack_ms ?? 20}
                      min={1}
                      max={200}
                      onChange={(v) => update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                        c.metadata_info.compressor.attack_ms = v;
                      })}
                    />
                    <NumberRow
                      label="Release (ms)"
                      value={selectedClip.metadata_info?.compressor?.release_ms ?? 120}
                      min={10}
                      max={1000}
                      onChange={(v) => update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                        c.metadata_info.compressor.release_ms = v;
                      })}
                    />
                  </div>
                  <SliderRow
                    label="Makeup Gain"
                    value={selectedClip.metadata_info?.compressor?.makeup_gain_db ?? 3}
                    min={0}
                    max={24}
                    step={0.5}
                    unit=" dB"
                    accentClass="accent-emerald-500"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.compressor) c.metadata_info.compressor = {};
                      c.metadata_info.compressor.makeup_gain_db = v;
                    })}
                  />
                </div>
              )}
            </div>

            {/* 5. NOISE REDUCTION */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text">Noise Reduction</span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
                  <input
                    type="checkbox"
                    checked={!!selectedClip.metadata_info?.noise_reduction?.enabled}
                    onChange={(e) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.noise_reduction) c.metadata_info.noise_reduction = { enabled: true, mode: 'medium', amount_db: -12 };
                      c.metadata_info.noise_reduction.enabled = e.target.checked;
                    })}
                    className="rounded accent-cinema-ai"
                  />
                  <span>Enable</span>
                </label>
              </div>

              {selectedClip.metadata_info?.noise_reduction?.enabled && (
                <div className="space-y-2 pt-1 border-t border-cinema-border/50">
                  <div className="flex gap-1">
                    {[
                      { mode: 'light', label: 'Light (-6dB)', db: -6 },
                      { mode: 'medium', label: 'Medium (-12dB)', db: -12 },
                      { mode: 'strong', label: 'Strong (-18dB)', db: -18 },
                    ].map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        onClick={() => update((c) => {
                          if (!c.metadata_info) c.metadata_info = {};
                          if (!c.metadata_info.noise_reduction) c.metadata_info.noise_reduction = {};
                          c.metadata_info.noise_reduction.mode = m.mode;
                          c.metadata_info.noise_reduction.amount_db = m.db;
                        })}
                        className={`flex-1 py-1 rounded text-[10px] border transition-colors ${
                          selectedClip.metadata_info?.noise_reduction?.mode === m.mode
                            ? 'bg-cinema-ai/20 border-cinema-ai text-cinema-ai font-semibold'
                            : 'bg-cinema-850 border-cinema-border text-cinema-textDim hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <SliderRow
                    label="Suppression Amount"
                    value={selectedClip.metadata_info?.noise_reduction?.amount_db ?? -12}
                    min={-24}
                    max={0}
                    step={1}
                    unit=" dB"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.noise_reduction) c.metadata_info.noise_reduction = {};
                      c.metadata_info.noise_reduction.amount_db = v;
                      c.metadata_info.noise_reduction.mode = 'custom';
                    })}
                  />
                </div>
              )}
            </div>

            {/* 6. AUDIO DUCKING */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text">Audio Ducking</span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
                  <input
                    type="checkbox"
                    checked={!!selectedClip.metadata_info?.ducking?.enabled}
                    onChange={(e) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.ducking) c.metadata_info.ducking = {
                        enabled: true, source_role: 'dialogue', duck_amount_db: -12, attack_ms: 200, release_ms: 500
                      };
                      c.metadata_info.ducking.enabled = e.target.checked;
                    })}
                    className="rounded accent-cinema-ai"
                  />
                  <span>Enable</span>
                </label>
              </div>

              {selectedClip.metadata_info?.ducking?.enabled && (
                <div className="space-y-2 pt-1 border-t border-cinema-border/50">
                  <div className="flex items-center justify-between text-[10px] text-cinema-textDim">
                    <span>Duck Against:</span>
                    <select
                      value={selectedClip.metadata_info?.ducking?.source_role || 'dialogue'}
                      onChange={(e) => update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.ducking) c.metadata_info.ducking = {};
                        c.metadata_info.ducking.source_role = e.target.value;
                      })}
                      className="bg-cinema-850 border border-cinema-border rounded px-2 py-0.5 text-cinema-text text-[10px]"
                    >
                      <option value="dialogue">A1 Dialogue (Tamil)</option>
                      <option value="voiceover">A2 Voice Over</option>
                    </select>
                  </div>
                  <SliderRow
                    label="Ducking Reduction"
                    value={selectedClip.metadata_info?.ducking?.duck_amount_db ?? -12}
                    min={-30}
                    max={-6}
                    step={1}
                    unit=" dB"
                    onChange={(v) => update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.ducking) c.metadata_info.ducking = {};
                      c.metadata_info.ducking.duck_amount_db = v;
                    })}
                  />
                </div>
              )}
            </div>

            {/* 7. AUTOMATION & KEYFRAMES */}
            <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cinema-text">Automation Keyframes</span>
                <span className="text-[9px] font-mono text-cinema-ai">
                  {selectedClip.keyframes?.filter((k) => k.property_path.startsWith('volume') || k.property_path === 'pan').length || 0} pts
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const timeOffsetMs = Math.max(0, playheadMs - selectedClip.start_time_ms);
                    addKeyframe(selectedClip.id, {
                      id: crypto.randomUUID(),
                      property_path: 'volume_db',
                      time_offset_ms: timeOffsetMs,
                      value: selectedClip.volume_db,
                      interpolation: 'linear',
                    });
                    showNotification(`Added Volume Keyframe at ${Math.round(timeOffsetMs / 1000)}s`, 'info');
                  }}
                  className="flex-1 py-1.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text rounded text-[10px] font-medium border border-cinema-border transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3 text-emerald-400" />
                  + Vol Keyframe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const timeOffsetMs = Math.max(0, playheadMs - selectedClip.start_time_ms);
                    addKeyframe(selectedClip.id, {
                      id: crypto.randomUUID(),
                      property_path: 'pan',
                      time_offset_ms: timeOffsetMs,
                      value: selectedClip.pan ?? 0.0,
                      interpolation: 'linear',
                    });
                    showNotification(`Added Pan Keyframe at ${Math.round(timeOffsetMs / 1000)}s`, 'info');
                  }}
                  className="flex-1 py-1.5 bg-cinema-800 hover:bg-cinema-750 text-cinema-text rounded text-[10px] font-medium border border-cinema-border transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3 text-cyan-400" />
                  + Pan Keyframe
                </button>
              </div>

              {/* Keyframe list */}
              {(selectedClip.keyframes?.filter((k) => k.property_path.startsWith('volume') || k.property_path === 'pan').length || 0) > 0 && (
                <div className="space-y-1 pt-1 max-h-24 overflow-y-auto">
                  {selectedClip.keyframes
                    .filter((k) => k.property_path.startsWith('volume') || k.property_path === 'pan')
                    .map((kf, i) => (
                      <div key={kf.id || i} className="flex items-center justify-between px-2 py-1 bg-cinema-850 rounded text-[9px] font-mono">
                        <span className={kf.property_path === 'pan' ? 'text-cyan-400' : 'text-emerald-400'}>
                          {kf.property_path === 'pan' ? 'PAN' : 'VOL'}: {typeof kf.value === 'number' ? kf.value.toFixed(1) : kf.value}
                        </span>
                        <span className="text-cinema-textDim">+{Math.round(kf.time_offset_ms / 100) / 10}s</span>
                        {kf.id && (
                          <button
                            type="button"
                            onClick={() => deleteKeyframe(selectedClip.id, kf.id!)}
                            className="text-red-400 hover:text-red-300 ml-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 8. AI AUDIO CLEANUP */}
            <div className="p-2.5 bg-gradient-to-br from-cinema-900 to-cinema-850 rounded border border-cinema-ai/30 space-y-2">
              <div className="flex items-center gap-1.5 text-cinema-ai font-semibold text-xs">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>AI Audio Processing</span>
              </div>
              <div className="space-y-1.5">
                {[
                  'AI Dialog Isolation (Tamil)',
                  'AI De-Reverb (Studio Dry)',
                  'AI Electrical De-Hum (50/60Hz)',
                ].map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleAIStub(action)}
                    className="w-full py-1.5 px-2.5 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-left flex items-center justify-between text-cinema-text text-[10px] transition-colors"
                  >
                    <span>{action}</span>
                    <Sparkles className="w-3 h-3 text-cinema-ai" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: TEXT ─── */}
        {activeInspectorTab === 'text' && selectedClip && (
          <div className="space-y-3">
            {/* Graphics Preset Banner if clip has graphics metadata */}
            {selectedClip.metadata_info?.graphics && (
              <div className="p-2.5 rounded-lg bg-orange-950/40 border border-orange-600/40 flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-orange-400 font-bold block">
                    Cinematic Graphics Preset
                  </span>
                  <span className="text-[11px] font-semibold text-white">
                    {(selectedClip.metadata_info.graphics.preset_id as string) || 'Custom Title'}
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-orange-900/60 border border-orange-700/50 text-[10px] text-orange-200 font-mono">
                  {selectedClip.metadata_info.graphics.alignment || 'center'}
                </span>
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-cinema-text block mb-1">
                {selectedClip.metadata_info?.graphics ? 'Primary Title Text' : 'Text Content'}
              </label>
              <textarea
                value={
                  (selectedClip.metadata_info?.graphics?.title as string) ??
                  (selectedClip.metadata_info?.text?.content as string) ??
                  selectedClip.name.replace(/^Title:\s*/, '')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  update((c) => {
                    if (!c.metadata_info) c.metadata_info = {};
                    if (!c.metadata_info.text) c.metadata_info.text = {};
                    c.metadata_info.text.content = val;
                    if (c.metadata_info.graphics) {
                      c.metadata_info.graphics.title = val;
                    }
                    if (c.clip_type === 'title') {
                      c.name = `Title: ${val}`;
                    }
                  });
                }}
                rows={2}
                placeholder="Enter title text..."
                className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1.5 text-cinema-text text-[11px] outline-none focus:border-cinema-ai resize-none"
              />
            </div>

            {/* Subtitle / Secondary text for Graphics clips */}
            {selectedClip.metadata_info?.graphics && (
              <div>
                <label className="text-[10px] font-semibold text-cinema-textDim block mb-1">
                  Subtitle / Secondary Line
                </label>
                <input
                  type="text"
                  value={(selectedClip.metadata_info.graphics.subtitle as string) ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.graphics) c.metadata_info.graphics = {};
                      c.metadata_info.graphics.subtitle = val;
                    });
                  }}
                  placeholder="Enter secondary line..."
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 text-cinema-text text-[11px] outline-none focus:border-cinema-ai"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Font Family</label>
                <select
                  value={
                    (selectedClip.metadata_info?.graphics?.font_family as string) ??
                    (selectedClip.metadata_info?.text?.font_family as string) ??
                    'Noto Sans Tamil'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.text) c.metadata_info.text = {};
                      c.metadata_info.text.font_family = val;
                      if (c.metadata_info.graphics) c.metadata_info.graphics.font_family = val;
                    });
                  }}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 text-cinema-text text-[10px] outline-none"
                >
                  <option value="Noto Sans Tamil">Tamil (Noto Sans)</option>
                  <option value="Nirmala UI">Nirmala UI</option>
                  <option value="Inter">Inter (Sans)</option>
                  <option value="Consolas">Consolas (Mono)</option>
                  <option value="serif">Serif</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Font Size (px)</label>
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={
                    (selectedClip.metadata_info?.graphics?.font_size as number) ??
                    (selectedClip.metadata_info?.text?.font_size as number) ??
                    44
                  }
                  onChange={(e) => {
                    const sz = parseInt(e.target.value) || 36;
                    update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.text) c.metadata_info.text = {};
                      c.metadata_info.text.font_size = sz;
                      if (c.metadata_info.graphics) c.metadata_info.graphics.font_size = sz;
                    });
                  }}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Text Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={
                      (selectedClip.metadata_info?.graphics?.font_color as string) ??
                      (selectedClip.metadata_info?.text?.font_color as string) ??
                      '#ffffff'
                    }
                    onChange={(e) => {
                      const col = e.target.value;
                      update((c) => {
                        if (!c.metadata_info) c.metadata_info = {};
                        if (!c.metadata_info.text) c.metadata_info.text = {};
                        c.metadata_info.text.font_color = col;
                        if (c.metadata_info.graphics) c.metadata_info.graphics.font_color = col;
                      });
                    }}
                    className="w-7 h-7 bg-cinema-900 border border-cinema-border rounded cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-cinema-textDim truncate">
                    {(selectedClip.metadata_info?.graphics?.font_color as string) || '#ffffff'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Backdrop Opacity</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={(selectedClip.metadata_info?.graphics?.box_opacity as number) ?? 0.6}
                  onChange={(e) => {
                    const op = parseFloat(e.target.value);
                    update((c) => {
                      if (!c.metadata_info) c.metadata_info = {};
                      if (!c.metadata_info.graphics) c.metadata_info.graphics = {};
                      c.metadata_info.graphics.box_opacity = op;
                    });
                  }}
                  className="w-full accent-orange-500 bg-cinema-900 h-1.5 rounded cursor-pointer mt-2"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-cinema-textDim block mb-1">Alignment / Layout</label>
              <div className="grid grid-cols-4 gap-1">
                {(['center', 'lower_third', 'top_left', 'bottom'] as const).map((align) => {
                  const currentAlign =
                    (selectedClip.metadata_info?.graphics?.alignment as string) ||
                    (selectedClip.metadata_info?.text?.alignment as string) ||
                    'center';
                  return (
                    <button
                      key={align}
                      type="button"
                      onClick={() =>
                        update((c) => {
                          if (!c.metadata_info) c.metadata_info = {};
                          if (!c.metadata_info.text) c.metadata_info.text = {};
                          c.metadata_info.text.alignment = align;
                          if (c.metadata_info.graphics) c.metadata_info.graphics.alignment = align;
                          if (align === 'lower_third') {
                            c.position_x = 0.08;
                            c.position_y = 0.80;
                          } else if (align === 'top_left') {
                            c.position_x = 0.06;
                            c.position_y = 0.12;
                          } else if (align === 'bottom') {
                            c.position_x = 0.5;
                            c.position_y = 0.82;
                          } else {
                            c.position_x = 0.5;
                            c.position_y = 0.5;
                          }
                        })
                      }
                      className={`py-1 rounded border text-[9px] uppercase tracking-wider transition-colors ${
                        currentAlign === align
                          ? 'bg-orange-600 border-orange-500 text-white font-bold'
                          : 'bg-cinema-900 border-cinema-border text-cinema-textDim hover:text-white'
                      }`}
                    >
                      {align.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cinema-border/50">
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Fade In (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={100}
                  value={selectedClip.fade_in_ms ?? 0}
                  onChange={(e) => {
                    const fi = parseInt(e.target.value) || 0;
                    update((c) => {
                      c.fade_in_ms = fi;
                    });
                  }}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-cinema-textDim block mb-1">Fade Out (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={100}
                  value={selectedClip.fade_out_ms ?? 0}
                  onChange={(e) => {
                    const fo = parseInt(e.target.value) || 0;
                    update((c) => {
                      c.fade_out_ms = fo;
                    });
                  }}
                  className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 font-mono text-cinema-text text-[11px]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: AI ─── */}
        {activeInspectorTab === 'ai' && (
          <div className="space-y-3">
            <div className="p-3 bg-gradient-to-br from-cinema-800 to-cinema-900 rounded-lg border border-cinema-ai/30 space-y-2">
              <div className="flex items-center gap-1.5 text-cinema-ai font-semibold text-xs">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>AI Clip Operations</span>
              </div>
              <p className="text-[11px] text-cinema-textDim">
                Configure an AI provider in Settings to enable these operations.
              </p>
            </div>

            <div className="space-y-2">
              {[
                'AI Scene Regeneration',
                'AI Scene Extension (+4s)',
                'Change Background / Sky',
                'Re-align Tamil Lip Sync',
                'Remove Background (Roto)',
                'AI Object Removal',
              ].map((action) => (
                <button
                  key={action}
                  onClick={() => handleAIStub(action)}
                  className="w-full py-2 px-3 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-left flex items-center justify-between text-cinema-text group transition-colors text-[11px]"
                >
                  <span>{action}</span>
                  <Sparkles className="w-3.5 h-3.5 text-cinema-ai group-hover:scale-110 transition-transform" />
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// COLOR INSPECTOR — Phase 5 full implementation
// ═══════════════════════════════════════════════════════════════════

interface ColorInspectorContentProps {
  selectedClip: Clip;
  update: (updater: (clip: Clip) => void) => void;
  showNotification: (msg: string, type?: 'error' | 'info' | 'success' | 'warning') => void;
}

const ColorInspectorContent: React.FC<ColorInspectorContentProps> = ({ selectedClip, update, showNotification }) => {
  const [luts, setLuts] = useState<Array<{ id: string; name: string; path: string }>>([]);
  const [loadingLuts, setLoadingLuts] = useState(false);
  const [scopeUrl, setScopeUrl] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<'waveform' | 'histogram' | 'vectorscope'>('waveform');
  const [loadingScope, setLoadingScope] = useState(false);
  const [trackingResult, setTrackingResult] = useState<string | null>(null);
  const [stabResult, setStabResult] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const cg = (selectedClip.metadata_info?.color_grade || {}) as Record<string, any>;
  const hsl = (cg.hsl || {}) as Record<string, any>;

  const updateCG = useCallback((key: string, val: unknown) => {
    update((c) => {
      if (!c.metadata_info) c.metadata_info = {};
      if (!c.metadata_info.color_grade) c.metadata_info.color_grade = {};
      c.metadata_info.color_grade[key] = val;
    });
  }, [update]);

  const updateHSL = useCallback((key: string, val: unknown) => {
    update((c) => {
      if (!c.metadata_info) c.metadata_info = {};
      if (!c.metadata_info.color_grade) c.metadata_info.color_grade = {};
      if (!c.metadata_info.color_grade.hsl) c.metadata_info.color_grade.hsl = { enabled: true };
      c.metadata_info.color_grade.hsl[key] = val;
    });
  }, [update]);

  useEffect(() => {
    setLoadingLuts(true);
    api.get('/luts').then(r => { setLuts(r.data); }).catch(() => {}).finally(() => setLoadingLuts(false));
  }, []);

  const handleLoadScope = async () => {
    const filePath = (selectedClip as any).file_path || (selectedClip.asset_id ? `assets/${selectedClip.asset_id}` : null);
    if (!filePath) { showNotification('No source file on this clip', 'warning'); return; }
    setLoadingScope(true);
    setScopeUrl(null);
    try {
      const r = await api.post('/scopes/analyze', { file_path: filePath, scope_type: scopeType });
      if (r.data.status === 'unavailable') {
        showNotification(`Scopes unavailable: ${r.data.message}`, 'warning');
      } else if (r.data.scope_url) {
        setScopeUrl(r.data.scope_url);
      }
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Scope analysis failed', 'error');
    } finally {
      setLoadingScope(false);
    }
  };

  const handleTracking = async () => {
    const filePath = (selectedClip as any).file_path || (selectedClip.asset_id ? `assets/${selectedClip.asset_id}` : null);
    if (!filePath) { showNotification('No source file on this clip', 'warning'); return; }
    setProcessing('tracking');
    setTrackingResult(null);
    try {
      const r = await api.post('/tracking/analyze', { file_path: filePath, end_frame: 30 });
      if (r.data.status === 'unavailable') {
        setTrackingResult(`Unavailable: ${r.data.message}`);
      } else {
        setTrackingResult(`Tracked ${r.data.tracked_points?.length || 0} points over ${r.data.end_frame || 0} frames`);
      }
    } catch (e: any) {
      setTrackingResult(`Error: ${e?.response?.data?.detail || 'failed'}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleStabilize = async () => {
    const filePath = (selectedClip as any).file_path || (selectedClip.asset_id ? `assets/${selectedClip.asset_id}` : null);
    if (!filePath) { showNotification('No source file on this clip', 'warning'); return; }
    setProcessing('stabilize');
    setStabResult(null);
    try {
      const r = await api.post('/stabilization/analyze', { file_path: filePath });
      if (r.data.status === 'unavailable') {
        setStabResult(`Unavailable: ${r.data.message}`);
      } else {
        setStabResult(`Job enqueued: ${r.data.job_id}`);
      }
    } catch (e: any) {
      setStabResult(`Error: ${e?.response?.data?.detail || 'failed'}`);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-4" id="color-inspector">

      {/* ─── COLOR BASICS ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2.5">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-cinema-ai" /> Color Basics
        </span>

        <SliderRow label="Saturation" value={cg.saturation ?? 1.0} min={0} max={2} step={0.01}
          onChange={v => updateCG('saturation', v)} />
        <SliderRow label="Contrast" value={cg.contrast ?? 1.0} min={0} max={2} step={0.01}
          onChange={v => updateCG('contrast', v)} />
        <SliderRow label="Brightness" value={cg.brightness ?? 0.0} min={-1} max={1} step={0.01}
          onChange={v => updateCG('brightness', v)} />
        <SliderRow label="Temperature (K)" value={cg.temperature ?? 6500} min={2000} max={10000} step={100} unit="K"
          accentClass="accent-amber-500" onChange={v => updateCG('temperature', v)} />
        <SliderRow label="Exposure (EV)" value={cg.exposure ?? 0.0} min={-5} max={5} step={0.1}
          onChange={v => updateCG('exposure', v)} />
        <SliderRow label="Highlights" value={cg.highlights ?? 0.0} min={-1} max={1} step={0.01}
          onChange={v => updateCG('highlights', v)} />
        <SliderRow label="Shadows" value={cg.shadows ?? 0.0} min={-1} max={1} step={0.01}
          onChange={v => updateCG('shadows', v)} />
        <SliderRow label="Hue Shift (°)" value={cg.hue_shift ?? 0} min={-180} max={180} step={1} unit="°"
          accentClass="accent-purple-500" onChange={v => updateCG('hue_shift', v)} />
        <SliderRow label="Film Grain" value={cg.grain_strength ?? 0} min={0} max={100} step={1}
          onChange={v => updateCG('grain_strength', v)} />
        <SliderRow label="Blur" value={cg.blur ?? 0} min={0} max={50} step={0.5}
          onChange={v => updateCG('blur', v)} />
      </div>

      {/* ─── HSL QUALIFIER ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white">HSL Qualifier</span>
          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-cinema-textDim">
            <input type="checkbox" checked={!!hsl.enabled}
              onChange={e => updateHSL('enabled', e.target.checked)}
              className="rounded accent-cinema-ai" />
            Enable
          </label>
        </div>
        {hsl.enabled && (
          <div className="space-y-1.5 pt-1 border-t border-cinema-border/50">
            <SliderRow label="Hue Adjust" value={hsl.hue_adjust ?? 0} min={-180} max={180} step={1} unit="°"
              accentClass="accent-purple-400" onChange={v => updateHSL('hue_adjust', v)} />
            <SliderRow label="Saturation" value={hsl.sat_adjust ?? 1.0} min={0} max={3} step={0.01}
              accentClass="accent-pink-400" onChange={v => updateHSL('sat_adjust', v)} />
            <SliderRow label="Luminance" value={hsl.luma_adjust ?? 1.0} min={0} max={3} step={0.01}
              accentClass="accent-yellow-400" onChange={v => updateHSL('luma_adjust', v)} />
          </div>
        )}
      </div>

      {/* ─── RGB CURVES ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
        <span className="text-[11px] font-semibold text-white">RGB Curves</span>
        <p className="text-[10px] text-cinema-textDim">
          Curves stored as {JSON.stringify((cg.curves) || 'linear')} — edit via curve points below.
        </p>
        {(['master', 'red', 'green', 'blue'] as const).map(ch => {
          const colors: Record<string, string> = {
            master: 'accent-white', red: 'accent-red-400', green: 'accent-green-400', blue: 'accent-blue-400'
          };
          const labels: Record<string, string> = { master: 'Master (All)', red: 'Red', green: 'Green', blue: 'Blue' };
          const pts: [number, number][] = Array.isArray((cg.curves as any)?.[ch]) ? (cg.curves as any)[ch] : [[0, 0], [1, 1]];
          const midY = pts.find(p => Math.abs(p[0] - 0.5) < 0.1)?.[1] ?? 0.5;
          return (
            <div key={ch} className="space-y-1">
              <label className="text-[10px] text-cinema-textDim">{labels[ch]}</label>
              <input type="range" min={0} max={1} step={0.01} value={midY}
                className={`w-full ${colors[ch]}`}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  update(c => {
                    if (!c.metadata_info) c.metadata_info = {};
                    if (!c.metadata_info.color_grade) c.metadata_info.color_grade = {};
                    if (!c.metadata_info.color_grade.curves) c.metadata_info.color_grade.curves = {};
                    c.metadata_info.color_grade.curves[ch] = [[0, 0], [0.5, v], [1, 1]];
                  });
                }}
              />
              <div className="flex justify-between text-[8px] font-mono text-cinema-textDim px-0.5">
                <span>Blacks</span><span className="text-cinema-ai">{midY.toFixed(2)}</span><span>Whites</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── LUT SELECTOR ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2">
        <span className="text-[11px] font-semibold text-white">3D LUT</span>
        {loadingLuts ? (
          <div className="flex items-center gap-1.5 text-cinema-textDim text-[10px]">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading LUTs...
          </div>
        ) : luts.length === 0 ? (
          <p className="text-[10px] text-cinema-textDim">No LUTs available. Upload .cube files in the Color panel.</p>
        ) : (
          <select
            id="lut-selector"
            value={(cg.lut_path as string) || ''}
            onChange={e => updateCG('lut_path', e.target.value || null)}
            className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1.5 text-cinema-text text-[11px] outline-none"
          >
            <option value="">— None —</option>
            {luts.map(l => (
              <option key={l.id} value={l.path}>{l.name}</option>
            ))}
          </select>
        )}
        {cg.lut_path && (
          <p className="text-[9px] text-cinema-ai font-mono truncate">LUT: {String(cg.lut_path).split('/').pop()}</p>
        )}
      </div>

      {/* ─── SCOPES VIEWER ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2" id="scopes-section">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" /> Video Scopes
        </span>
        <div className="flex gap-1">
          {(['waveform', 'histogram', 'vectorscope'] as const).map(t => (
            <button key={t} onClick={() => setScopeType(t)}
              className={`flex-1 py-1 rounded text-[9px] font-medium border transition-colors capitalize ${
                scopeType === t ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-cinema-850 border-cinema-border text-cinema-textDim hover:text-white'
              }`}>
              {t}
            </button>
          ))}
        </div>
        <button
          id="load-scope-btn"
          onClick={handleLoadScope}
          disabled={loadingScope}
          className="w-full py-1.5 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-[10px] text-cinema-text transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {loadingScope ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</> : <><ScanLine className="w-3 h-3" /> Load {scopeType}</>}
        </button>
        {scopeUrl && (
          <img src={`http://localhost:8000${scopeUrl}`} alt={scopeType} className="w-full rounded border border-cinema-border" />
        )}
      </div>

      {/* ─── MOTION TRACKING ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2" id="tracking-section">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5 text-emerald-400" /> Motion Tracking
        </span>
        <button
          id="launch-tracking-btn"
          onClick={handleTracking}
          disabled={processing === 'tracking'}
          className="w-full py-1.5 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-[10px] text-cinema-text transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {processing === 'tracking' ? <><Loader2 className="w-3 h-3 animate-spin" /> Tracking...</> : <><Crosshair className="w-3 h-3" /> Analyze Track (OpenCV)</>}
        </button>
        {trackingResult && (
          <p className={`text-[10px] ${trackingResult.startsWith('Unavailable') || trackingResult.startsWith('Error') ? 'text-amber-400' : 'text-emerald-400'}`}>
            {trackingResult}
          </p>
        )}
      </div>

      {/* ─── STABILIZATION ─── */}
      <div className="p-2.5 bg-cinema-900/80 rounded border border-cinema-border space-y-2" id="stabilization-section">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-amber-400" /> Stabilization
        </span>
        <button
          id="launch-stabilize-btn"
          onClick={handleStabilize}
          disabled={processing === 'stabilize'}
          className="w-full py-1.5 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border rounded text-[10px] text-cinema-text transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {processing === 'stabilize' ? <><Loader2 className="w-3 h-3 animate-spin" /> Queuing...</> : <><RotateCw className="w-3 h-3" /> Enqueue Stabilization</>}
        </button>
        {stabResult && (
          <p className={`text-[10px] ${stabResult.startsWith('Unavailable') || stabResult.startsWith('Error') ? 'text-amber-400' : 'text-emerald-400'}`}>
            {stabResult}
          </p>
        )}
      </div>

    </div>
  );
};
