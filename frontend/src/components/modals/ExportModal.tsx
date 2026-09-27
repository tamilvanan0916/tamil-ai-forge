import React from 'react';
import { X, DownloadCloud, Loader2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { api } from '../../services/api';

const FORMATS = [
  { label: 'MP4 — H.264', format: 'mp4', codec: 'libx264' },
  { label: 'MP4 — H.265 (HEVC)', format: 'mp4', codec: 'libx265' },
  { label: 'MOV — ProRes 422', format: 'mov', codec: 'prores' },
  { label: 'WebM — VP9', format: 'webm', codec: 'libvpx-vp9' },
  { label: 'GIF — Animated', format: 'gif', codec: 'gif' },
];

const PRESETS = [
  { name: 'YouTube 1080p', width: 1920, height: 1080, fps: 30, bitrate_video: '8M', format: 'mp4', codec: 'libx264', audio_codec: 'aac', audio_bitrate: '192k' },
  { name: 'YouTube 4K', width: 3840, height: 2160, fps: 30, bitrate_video: '35M', format: 'mp4', codec: 'libx265', audio_codec: 'aac', audio_bitrate: '320k' },
  { name: 'Instagram Reel (Vertical)', width: 1080, height: 1920, fps: 30, bitrate_video: '6M', format: 'mp4', codec: 'libx264', audio_codec: 'aac', audio_bitrate: '128k' },
  { name: 'Cinema DCP', width: 2048, height: 1080, fps: 24, bitrate_video: '50M', format: 'mp4', codec: 'libx265', audio_codec: 'aac', audio_bitrate: '320k' },
  { name: 'Preview (720p)', width: 1280, height: 720, fps: 30, bitrate_video: '4M', format: 'mp4', codec: 'libx264', audio_codec: 'aac', audio_bitrate: '128k' },
];

export const ExportModal: React.FC = () => {
  const { isExportModalOpen, setExportModalOpen, showNotification } = useUIStore();
  const { activeProject } = useProjectStore();
  const { timeline } = useTimelineStore();
  const [presetIdx, setPresetIdx] = React.useState(0);
  const [framingMode, setFramingMode] = React.useState<'fit' | 'fill' | 'cinemascope'>('fit');
  const [burnSubtitles, setBurnSubtitles] = React.useState(false);
  const [exportStems, setExportStems] = React.useState(true);
  const [isExporting, setIsExporting] = React.useState(false);

  if (!isExportModalOpen) return null;

  const preset = PRESETS[presetIdx];

  const handleExport = async () => {
    if (!activeProject || !timeline) {
      showNotification('No project or timeline loaded', 'error');
      return;
    }
    setIsExporting(true);
    try {
      const res = await api.post('/render/jobs', {
        project_id: activeProject.id,
        timeline_id: timeline.id,
        export_preset: {
          name: preset.name,
          format: preset.format,
          codec: preset.codec,
          width: preset.width,
          height: preset.height,
          fps: preset.fps,
          bitrate_video: preset.bitrate_video,
          audio_codec: preset.audio_codec,
          audio_bitrate: preset.audio_bitrate,
          framing_mode: framingMode,
          burn_subtitles: burnSubtitles,
          export_stems: exportStems,
        },
      });
      showNotification('Render job queued. Check Render Queue for progress.', 'success');
      setExportModalOpen(false);
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => setExportModalOpen(false)}>
      <div
        className="bg-cinema-900 border border-cinema-borderLight rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-cinema-border">
          <div className="flex items-center gap-3">
            <DownloadCloud className="w-5 h-5 text-cinema-ai" />
            <h2 className="text-sm font-bold text-white">Export Project</h2>
          </div>
          <button onClick={() => setExportModalOpen(false)} className="p-1.5 hover:bg-cinema-800 rounded-lg">
            <X className="w-4 h-4 text-cinema-textDim" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-cinema-textMuted uppercase tracking-wider mb-2">Export Preset</label>
            <div className="space-y-1.5">
              {PRESETS.map((p, i) => (
                <label key={p.name} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border transition-all ${i === presetIdx ? 'border-cinema-ai/60 bg-cinema-800' : 'border-cinema-border bg-cinema-850 hover:border-cinema-borderLight'}`}>
                  <input type="radio" name="preset" value={i} checked={i === presetIdx} onChange={() => setPresetIdx(i)} className="sr-only" />
                  <div className={`w-3 h-3 rounded-full border-2 ${i === presetIdx ? 'border-cinema-ai bg-cinema-ai' : 'border-cinema-border'} flex-shrink-0`} />
                  <div>
                    <p className="text-xs font-semibold text-cinema-text">{p.name}</p>
                    <p className="text-[10px] text-cinema-textDim">{p.width}×{p.height} @ {p.fps}fps • {p.codec} • {p.bitrate_video}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Phase 11: Framing Conform & Master Deliverables Options */}
          <div className="space-y-3 pt-2 border-t border-cinema-border/60">
            <div>
              <label className="block text-[11px] font-semibold text-cinema-textMuted uppercase tracking-wider mb-1.5">
                Framing Conform Mode
              </label>
              <select
                id="export-framing-mode"
                data-testid="export-framing-mode"
                value={framingMode}
                onChange={e => setFramingMode(e.target.value as any)}
                className="w-full bg-cinema-850 border border-cinema-border rounded p-2 text-xs text-white outline-none focus:border-cinema-ai"
              >
                <option value="fit">Fit (Letterbox / Pillarbox Safe Framing)</option>
                <option value="fill">Fill / Center Crop (9:16 Vertical Reel/Shorts)</option>
                <option value="cinemascope">CinemaScope (2.39:1 Anamorphic Matte)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-[11px] text-cinema-text cursor-pointer p-2 bg-cinema-850 border border-cinema-border rounded hover:border-cinema-borderLight transition-colors">
                <input
                  id="export-burn-subtitles"
                  data-testid="export-burn-subtitles"
                  type="checkbox"
                  checked={burnSubtitles}
                  onChange={e => setBurnSubtitles(e.target.checked)}
                  className="rounded border-cinema-border text-cinema-ai focus:ring-0"
                />
                <span className="font-medium">Burn Subtitles</span>
              </label>

              <label className="flex items-center gap-2 text-[11px] text-cinema-text cursor-pointer p-2 bg-cinema-850 border border-cinema-border rounded hover:border-cinema-borderLight transition-colors">
                <input
                  id="export-audio-stems"
                  data-testid="export-audio-stems"
                  type="checkbox"
                  checked={exportStems}
                  onChange={e => setExportStems(e.target.checked)}
                  className="rounded border-cinema-border text-cinema-ai focus:ring-0"
                />
                <span className="font-medium">Audio Stems (WAV)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cinema-border bg-cinema-850">
          <button onClick={() => setExportModalOpen(false)} className="px-4 py-2 text-sm text-cinema-textMuted hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || !activeProject}
            className="flex items-center gap-2 px-5 py-2 bg-cinema-ai text-cinema-void text-sm font-bold rounded-lg disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
            Queue Export
          </button>
        </div>
      </div>
    </div>
  );
};
