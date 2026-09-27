import React from 'react';
import { Wand2, Loader2, AlertCircle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../services/api';
import { useTimelineStore } from '../../stores/useTimelineStore';

interface VFXEffect {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface EffectState {
  sigma?: number;
  color?: string;
  similarity?: number;
  blend?: number;
  strength?: number;
}

export const VFXPanel: React.FC = () => {
  const { selectedClipId, timeline } = useTimelineStore();
  const [effects, setEffects] = React.useState<VFXEffect[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [params, setParams] = React.useState<Record<string, EffectState>>({});
  const [results, setResults] = React.useState<Record<string, { status: string; filter: string }>>({});
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.get('/vfx/effects').then(r => {
      setEffects(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Get selected clip's asset path for processing
  const getSelectedClipPath = (): string | null => {
    if (!selectedClipId || !timeline) return null;
    for (const track of timeline.tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId);
      if (clip?.asset_id) return `assets/${clip.asset_id}`;
      if ((clip as any)?.file_path) return (clip as any).file_path;
    }
    return null;
  };

  const handleApply = async (effect: VFXEffect) => {
    setError(null);
    const clipPath = getSelectedClipPath();
    if (!clipPath) {
      setError('No clip selected or clip has no source file. Select a video clip on the timeline.');
      return;
    }

    setProcessing(effect.id);
    try {
      const effectParams = params[effect.id] || {};
      let result;

      if (effect.id === 'chroma-key') {
        result = await api.post('/vfx/process/chroma-key', {
          file_path: clipPath,
          color: effectParams.color || '#00FF00',
          similarity: effectParams.similarity ?? 0.15,
          blend: effectParams.blend ?? 0.08,
        });
      } else if (effect.id === 'gaussian-blur') {
        result = await api.post('/vfx/process/blur', {
          file_path: clipPath,
          sigma: effectParams.sigma ?? 10.0,
        });
      } else if (effect.id === 'sharpen') {
        result = await api.post('/vfx/process/sharpen', {
          file_path: clipPath,
          strength: effectParams.strength ?? 1.5,
        });
      } else {
        setError(`Effect "${effect.name}" requires a media file — no source found on selected clip.`);
        setProcessing(null);
        return;
      }

      setResults(prev => ({
        ...prev,
        [effect.id]: { status: result.data.status, filter: result.data.filter_applied },
      }));
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'VFX processing failed';
      setError(detail);
    } finally {
      setProcessing(null);
    }
  };

  const toggleExpand = (id: string) => setExpanded(prev => prev === id ? null : id);

  const setParam = (effectId: string, key: string, value: unknown) => {
    setParams(prev => ({
      ...prev,
      [effectId]: { ...prev[effectId], [key]: value },
    }));
  };

  const getCategoryColor = (cat: string) => {
    const map: Record<string, string> = {
      compositing: 'text-cyan-400',
      lens: 'text-amber-400',
      motion: 'text-purple-400',
      film: 'text-emerald-400',
      camera: 'text-blue-400',
    };
    return map[cat] || 'text-cinema-textDim';
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 overflow-y-auto" id="vfx-panel">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Wand2 className="w-4 h-4 text-cinema-ai" />
        <h2 className="text-sm font-bold text-white">VFX &amp; Compositing</h2>
      </div>
      <p className="text-[11px] text-cinema-textDim px-4 pb-3">
        Select a video clip on the timeline, then apply real FFmpeg VFX processing below.
      </p>

      {!selectedClipId && (
        <div className="mx-4 mb-3 p-2.5 bg-cinema-800 border border-cinema-border rounded text-[11px] text-cinema-textDim">
          Select a video clip on the timeline to enable VFX processing.
        </div>
      )}

      {error && (
        <div className="mx-4 mb-3 p-2 bg-red-900/30 border border-red-700/50 rounded flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-red-300">{error}</span>
        </div>
      )}

      <div className="px-4 space-y-2 pb-4">
        {loading ? (
          <div className="flex items-center gap-2 text-cinema-textDim text-xs py-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading effects...
          </div>
        ) : (
          effects.map(effect => {
            const isExpanded = expanded === effect.id;
            const isProcessing = processing === effect.id;
            const result = results[effect.id];
            const effectParams = params[effect.id] || {};

            return (
              <div
                key={effect.id}
                id={`vfx-effect-${effect.id}`}
                className="bg-cinema-850 border border-cinema-border rounded overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between p-2.5 text-left hover:bg-cinema-800 transition-colors"
                  onClick={() => toggleExpand(effect.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-cinema-text">{effect.name}</p>
                    <p className="text-[10px] text-cinema-textDim">{effect.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-[9px] font-bold ${getCategoryColor(effect.category)}`}>
                      {effect.category}
                    </span>
                    {result && <Check className="w-3 h-3 text-emerald-400" />}
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-cinema-textDim" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-cinema-textDim" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-cinema-border p-2.5 space-y-2.5">
                    {/* Effect-specific parameter controls */}
                    {effect.id === 'chroma-key' && (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-cinema-textDim block mb-0.5">Key Color</label>
                          <input
                            type="color"
                            value={(effectParams.color as string) || '#00FF00'}
                            onChange={e => setParam(effect.id, 'color', e.target.value)}
                            className="w-full h-7 rounded border border-cinema-border cursor-pointer bg-cinema-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-cinema-textDim block mb-0.5">
                            Similarity: {((effectParams.similarity as number) ?? 0.15).toFixed(2)}
                          </label>
                          <input
                            type="range" min={0.01} max={0.5} step={0.01}
                            value={(effectParams.similarity as number) ?? 0.15}
                            onChange={e => setParam(effect.id, 'similarity', parseFloat(e.target.value))}
                            className="w-full accent-cyan-400"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-cinema-textDim block mb-0.5">
                            Blend: {((effectParams.blend as number) ?? 0.08).toFixed(2)}
                          </label>
                          <input
                            type="range" min={0} max={1} step={0.01}
                            value={(effectParams.blend as number) ?? 0.08}
                            onChange={e => setParam(effect.id, 'blend', parseFloat(e.target.value))}
                            className="w-full accent-cyan-400"
                          />
                        </div>
                      </div>
                    )}

                    {effect.id === 'gaussian-blur' && (
                      <div>
                        <label className="text-[10px] text-cinema-textDim block mb-0.5">
                          Blur Sigma: {((effectParams.sigma as number) ?? 10).toFixed(1)}
                        </label>
                        <input
                          type="range" min={0.5} max={50} step={0.5}
                          value={(effectParams.sigma as number) ?? 10}
                          onChange={e => setParam(effect.id, 'sigma', parseFloat(e.target.value))}
                          className="w-full accent-amber-400"
                        />
                      </div>
                    )}

                    {effect.id === 'sharpen' && (
                      <div>
                        <label className="text-[10px] text-cinema-textDim block mb-0.5">
                          Sharpness: {((effectParams.strength as number) ?? 1.5).toFixed(2)}
                        </label>
                        <input
                          type="range" min={0.1} max={5} step={0.1}
                          value={(effectParams.strength as number) ?? 1.5}
                          onChange={e => setParam(effect.id, 'strength', parseFloat(e.target.value))}
                          className="w-full accent-emerald-400"
                        />
                      </div>
                    )}

                    {/* Apply button */}
                    {['chroma-key', 'gaussian-blur', 'sharpen'].includes(effect.id) && (
                      <button
                        id={`apply-vfx-${effect.id}`}
                        onClick={() => handleApply(effect)}
                        disabled={isProcessing || !selectedClipId}
                        className="w-full py-1.5 bg-cinema-ai/20 hover:bg-cinema-ai/30 border border-cinema-ai/40 text-cinema-ai text-[11px] font-medium rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isProcessing ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                        ) : (
                          <><Wand2 className="w-3.5 h-3.5" /> Apply via FFmpeg</>
                        )}
                      </button>
                    )}

                    {/* Result display */}
                    {result && (
                      <div className="p-1.5 bg-cinema-900 rounded border border-emerald-800/40 space-y-0.5">
                        <p className="text-[9px] text-emerald-400 font-semibold">✓ {result.status}</p>
                        <p className="text-[9px] font-mono text-cinema-textDim break-all">{result.filter}</p>
                      </div>
                    )}

                    {/* Info for effects without file processing */}
                    {!['chroma-key', 'gaussian-blur', 'sharpen'].includes(effect.id) && (
                      <p className="text-[10px] text-cinema-textDim italic">
                        Apply via Inspector Effects tab when clip is selected.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
