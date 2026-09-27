import React from 'react';
import { Subtitles, Loader2, Plus, Wand2, Upload, Download, Trash2, Edit2, Check } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';

export interface CaptionItem {
  id: string;
  project_id: string;
  clip_id?: string;
  language: string;
  start_time_ms: number;
  end_time_ms: number;
  text: string;
  style?: Record<string, any>;
}

export const CaptionsPanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { showNotification } = useUIStore();
  const [captions, setCaptions] = React.useState<CaptionItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState('');
  const [newText, setNewText] = React.useState('');
  const [newStartSec, setNewStartSec] = React.useState('0.0');
  const [newEndSec, setNewEndSec] = React.useState('3.0');
  const [isAdding, setIsAdding] = React.useState(false);
  const importRef = React.useRef<HTMLInputElement>(null);

  const loadCaptions = React.useCallback(async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const res = await api.get<CaptionItem[]>(`/projects/${activeProject.id}/captions`);
      setCaptions(res.data);
    } catch {
      setCaptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  React.useEffect(() => {
    loadCaptions();
  }, [loadCaptions]);

  const handleAutoCaption = async () => {
    if (!activeProject) return;
    setIsGenerating(true);
    try {
      await api.post(`/projects/${activeProject.id}/captions/auto-generate`);
      await loadCaptions();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Auto-caption failed. Whisper STT required.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportSRT = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject) return;
    const form = new FormData();
    form.append('file', file);
    try {
      await api.post(`/projects/${activeProject.id}/captions/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadCaptions();
    } catch (err: any) {
      showNotification(err?.response?.data?.detail || 'Import failed', 'error');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const handleExportSRT = async () => {
    if (!activeProject) return;
    try {
      const res = await api.get(`/projects/${activeProject.id}/captions/export/srt`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `captions_${activeProject.id}.srt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showNotification(err?.response?.data?.detail || 'No captions to export', 'error');
    }
  };

  const handleExportVTT = async () => {
    if (!activeProject) return;
    try {
      const res = await api.get(`/projects/${activeProject.id}/captions/export/vtt`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `captions_${activeProject.id}.vtt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showNotification(err?.response?.data?.detail || 'No captions to export', 'error');
    }
  };

  const handleAddCaption = async () => {
    if (!activeProject || !newText.trim()) return;
    const startMs = Math.round(parseFloat(newStartSec) * 1000) || 0;
    const endMs = Math.round(parseFloat(newEndSec) * 1000) || (startMs + 3000);
    try {
      await api.post(`/projects/${activeProject.id}/captions`, {
        start_time_ms: startMs,
        end_time_ms: endMs,
        text: newText.trim(),
        language: 'ta',
      });
      setNewText('');
      setIsAdding(false);
      await loadCaptions();
    } catch (err: any) {
      showNotification(err?.response?.data?.detail || 'Failed to add caption', 'error');
    }
  };

  const handleDeleteCaption = async (id: string) => {
    try {
      await api.delete(`/captions/${id}`);
      await loadCaptions();
    } catch (err: any) {
      showNotification(err?.response?.data?.detail || 'Failed to delete caption', 'error');
    }
  };

  const handleUpdateCaption = async (id: string) => {
    if (!activeProject || !editText.trim()) return;
    try {
      await api.patch(`/projects/${activeProject.id}/captions/${id}`, {
        text: editText.trim(),
      });
      setEditingId(null);
      await loadCaptions();
    } catch (err: any) {
      showNotification(err?.response?.data?.detail || 'Failed to update caption', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none text-xs" id="captions-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cinema-border bg-cinema-850">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <Subtitles className="w-4 h-4 text-cinema-ai" /> Captions
        </span>
        <div className="flex items-center gap-1">
          <button
            id="auto-caption-btn"
            onClick={handleAutoCaption}
            disabled={!activeProject || isGenerating}
            title="Auto-generate captions (Whisper STT)"
            className="flex items-center gap-1 px-2 py-1 bg-cinema-ai/20 hover:bg-cinema-ai/30 border border-cinema-ai/40 text-cinema-ai text-[11px] rounded transition-colors disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            Auto
          </button>
          <button
            id="import-srt-btn"
            data-testid="import-srt-btn"
            onClick={() => importRef.current?.click()}
            disabled={!activeProject}
            title="Import SRT/VTT subtitles"
            className="flex items-center gap-1 px-2 py-1 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border text-cinema-text text-[11px] rounded transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" /> Import SRT/VTT
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".srt,.vtt"
            className="hidden"
            onChange={handleImportSRT}
          />
          <button
            id="export-srt-btn"
            data-testid="export-srt-btn"
            onClick={handleExportSRT}
            disabled={!activeProject || captions.length === 0}
            title="Export as SRT"
            className="flex items-center gap-1 px-2 py-1 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border text-cinema-text text-[11px] rounded transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> Export SRT
          </button>
          <button
            id="export-vtt-btn"
            data-testid="export-vtt-btn"
            onClick={handleExportVTT}
            disabled={!activeProject || captions.length === 0}
            title="Export as VTT"
            className="flex items-center gap-1 px-2 py-1 bg-cinema-800 hover:bg-cinema-750 border border-cinema-border text-cinema-text text-[11px] rounded transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> Export VTT
          </button>
          <button
            id="add-caption-btn"
            data-testid="add-caption-btn"
            onClick={() => setIsAdding(prev => !prev)}
            disabled={!activeProject}
            className="flex items-center gap-1 px-2 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-[11px] rounded transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Manual Add Form */}
      {isAdding && (
        <div className="p-3 bg-cinema-850 border-b border-cinema-border space-y-2">
          <p className="text-[11px] font-semibold text-white">Add New Caption</p>
          <input
            type="text"
            placeholder="Caption text (e.g. வணக்கம்)..."
            value={newText}
            onChange={e => setNewText(e.target.value)}
            className="w-full bg-cinema-900 border border-cinema-border rounded px-2 py-1 text-cinema-text text-xs outline-none"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-cinema-textDim">Start(s):</span>
              <input
                type="number"
                step="0.1"
                value={newStartSec}
                onChange={e => setNewStartSec(e.target.value)}
                className="w-16 bg-cinema-900 border border-cinema-border rounded px-1 py-0.5 text-cinema-text text-xs font-mono"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-cinema-textDim">End(s):</span>
              <input
                type="number"
                step="0.1"
                value={newEndSec}
                onChange={e => setNewEndSec(e.target.value)}
                className="w-16 bg-cinema-900 border border-cinema-border rounded px-1 py-0.5 text-cinema-text text-xs font-mono"
              />
            </div>
            <button
              onClick={handleAddCaption}
              className="ml-auto px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium rounded transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!activeProject ? (
          <p className="text-xs text-cinema-textDim text-center mt-8">Open a project to manage captions</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-24 gap-2 text-cinema-textDim text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading captions...
          </div>
        ) : captions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-cinema-textDim text-center">
            <Subtitles className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium text-white">No captions yet</p>
            <p className="text-[11px]">
              Use <strong>Auto</strong> to generate (Whisper STT), <strong>Import SRT/VTT</strong> to upload, or <strong>Add</strong> manually.
            </p>
          </div>
        ) : (
          captions.map((cap) => (
            <div key={cap.id} className="bg-cinema-850 border border-cinema-border rounded p-2.5 space-y-1.5 hover:border-cinema-ai/40 transition-colors">
              <div className="flex items-center justify-between text-[10px] text-cinema-textDim font-mono">
                <span>{(cap.start_time_ms / 1000).toFixed(2)}s → {(cap.end_time_ms / 1000).toFixed(2)}s</span>
                <div className="flex items-center gap-1">
                  {editingId === cap.id ? (
                    <button
                      onClick={() => handleUpdateCaption(cap.id)}
                      className="text-emerald-400 hover:text-emerald-300 p-0.5"
                      title="Save edit"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setEditingId(cap.id); setEditText(cap.text); }}
                      className="text-cinema-textDim hover:text-white p-0.5"
                      title="Edit caption"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    id={`delete-caption-btn-${cap.id}`}
                    onClick={() => handleDeleteCaption(cap.id)}
                    className="text-red-400 hover:text-red-300 p-0.5"
                    title="Delete caption"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {editingId === cap.id ? (
                <input
                  type="text"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="w-full bg-cinema-900 border border-cinema-ai rounded px-2 py-1 text-xs text-white outline-none"
                  autoFocus
                />
              ) : (
                <p className="text-xs font-medium text-white">{cap.text}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
