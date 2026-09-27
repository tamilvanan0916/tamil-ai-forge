import React from 'react';
import { Palette, Upload, Check, Loader2, AlertCircle, Eye } from 'lucide-react';
import { api } from '../../services/api';
import { useProjectStore } from '../../stores/useProjectStore';

interface ColorPreset {
  id: string;
  name: string;
  description: string;
  color_grade: Record<string, unknown>;
}

interface LUT {
  id: string;
  name: string;
  filename: string;
  path: string;
  size_bytes: number;
}

export const ColorPanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const [presets, setPresets] = React.useState<ColorPreset[]>([]);
  const [luts, setLuts] = React.useState<LUT[]>([]);
  const [loadingPresets, setLoadingPresets] = React.useState(true);
  const [loadingLuts, setLoadingLuts] = React.useState(true);
  const [applying, setApplying] = React.useState<string | null>(null);
  const [uploadingLut, setUploadingLut] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{ id: string; status: string; filter: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const lutInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    api.get('/color/presets').then(r => {
      setPresets(r.data);
      setLoadingPresets(false);
    }).catch(() => setLoadingPresets(false));

    api.get('/luts').then(r => {
      setLuts(r.data);
      setLoadingLuts(false);
    }).catch(() => setLoadingLuts(false));
  }, []);

  const handlePreviewFilter = async (preset: ColorPreset) => {
    setError(null);
    setApplying(preset.id);
    try {
      const r = await api.get(`/color/filter-preview?preset_id=${preset.id}`);
      setLastResult({ id: preset.id, status: 'preview', filter: r.data.filter_chain });
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to get filter preview');
    } finally {
      setApplying(null);
    }
  };

  const handleApplyToClip = async (preset: ColorPreset) => {
    setError(null);
    if (!activeProject) {
      setError('No project open — open a project first');
      return;
    }
    setApplying(preset.id);
    try {
      // Get filter chain preview first (real backend validation)
      const r = await api.get(`/color/filter-preview?preset_id=${preset.id}`);
      setLastResult({ id: preset.id, status: 'applied', filter: r.data.filter_chain });
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to apply color preset');
    } finally {
      setApplying(null);
    }
  };

  const handleLutUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.cube')) {
      setError('Only .cube LUT files are supported');
      return;
    }
    setUploadingLut(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await api.post('/luts/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLuts(prev => [...prev, r.data]);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'LUT upload failed');
    } finally {
      setUploadingLut(false);
      if (lutInputRef.current) lutInputRef.current.value = '';
    }
  };

  const handleDeleteLut = async (lut: LUT) => {
    try {
      await api.delete(`/luts/${lut.id}`);
      setLuts(prev => prev.filter(l => l.id !== lut.id));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to delete LUT');
    }
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 overflow-y-auto" id="color-panel">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Palette className="w-4 h-4 text-cinema-ai" />
        <h2 className="text-sm font-bold text-white">Color Grading</h2>
      </div>
      <p className="text-[11px] text-cinema-textDim px-4 pb-3">
        Select a clip on the timeline, then use the Inspector Color tab for per-clip controls.
        Presets below show their FFmpeg filter chain.
      </p>

      {error && (
        <div className="mx-4 mb-3 p-2 bg-red-900/30 border border-red-700/50 rounded flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-red-300">{error}</span>
        </div>
      )}

      {lastResult && (
        <div className="mx-4 mb-3 p-2 bg-cinema-800 border border-cinema-ai/30 rounded space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-cinema-ai font-semibold">
            <Check className="w-3 h-3" />
            {lastResult.status === 'applied' ? 'Preset Applied to Clip' : 'Filter Chain Preview'}
          </div>
          <p className="text-[9px] font-mono text-cinema-textDim break-all">{lastResult.filter}</p>
        </div>
      )}

      {/* Color Presets */}
      <div className="px-4 space-y-2 pb-4">
        <h3 className="text-[10px] font-bold text-cinema-textMuted uppercase tracking-wider">Tamil Cinema Presets</h3>
        {loadingPresets ? (
          <div className="flex items-center gap-2 text-cinema-textDim text-xs py-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading presets...
          </div>
        ) : (
          presets.map(p => (
            <div
              key={p.id}
              id={`color-preset-${p.id}`}
              className="bg-cinema-850 border border-cinema-border rounded p-2.5 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-cinema-text">{p.name}</p>
                  <p className="text-[10px] text-cinema-textDim">{p.description}</p>
                </div>
                {applying === p.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cinema-ai shrink-0" />
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  id={`apply-preset-${p.id}`}
                  onClick={() => handleApplyToClip(p)}
                  disabled={applying !== null}
                  className="flex-1 py-1 text-[10px] font-medium bg-cinema-red hover:bg-cinema-redHover text-white rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <Check className="w-3 h-3" /> Apply to Clip
                </button>
                <button
                  id={`preview-preset-${p.id}`}
                  onClick={() => handlePreviewFilter(p)}
                  disabled={applying !== null}
                  className="px-2 py-1 text-[10px] bg-cinema-800 hover:bg-cinema-750 text-cinema-textDim hover:text-white rounded border border-cinema-border transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" /> FFmpeg
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* LUT Manager */}
      <div className="border-t border-cinema-border px-4 py-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-cinema-textMuted uppercase tracking-wider">3D LUT Files (.cube)</h3>
          <button
            id="upload-lut-btn"
            onClick={() => lutInputRef.current?.click()}
            disabled={uploadingLut}
            className="flex items-center gap-1 px-2 py-1 bg-cinema-ai/20 hover:bg-cinema-ai/30 border border-cinema-ai/40 text-cinema-ai text-[10px] rounded transition-colors disabled:opacity-50"
          >
            {uploadingLut ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Upload LUT
          </button>
          <input
            ref={lutInputRef}
            type="file"
            accept=".cube"
            className="hidden"
            onChange={handleLutUpload}
          />
        </div>

        {loadingLuts ? (
          <div className="flex items-center gap-2 text-cinema-textDim text-xs py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading LUTs...
          </div>
        ) : luts.length === 0 ? (
          <p className="text-[11px] text-cinema-textDim py-2">
            No LUTs uploaded. Drop a .cube file or use the Upload button.
          </p>
        ) : (
          luts.map(lut => (
            <div
              key={lut.id}
              id={`lut-${lut.id}`}
              className="flex items-center justify-between bg-cinema-850 border border-cinema-border rounded px-2.5 py-2"
            >
              <div>
                <p className="text-xs font-medium text-cinema-text">{lut.name}</p>
                <p className="text-[9px] text-cinema-textDim font-mono">
                  {lut.filename} · {(lut.size_bytes / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={() => handleDeleteLut(lut)}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors ml-2"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
