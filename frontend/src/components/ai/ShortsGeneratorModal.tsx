import React, { useState } from 'react';
import { X, Smartphone, Sparkles, Loader2 } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';

interface ShortsGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortsGeneratorModal: React.FC<ShortsGeneratorModalProps> = ({ isOpen, onClose }) => {
  const { activeProject } = useProjectStore();
  const { showNotification } = useUIStore();
  const [durationSec, setDurationSec] = useState(30);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleGenerateShorts = async () => {
    if (!activeProject) return;
    setIsGenerating(true);
    try {
      const res = await api.post(`/ai/generate/shorts?project_id=${activeProject.id}&duration_sec=${durationSec}`);
      showNotification(`Created 9:16 Short project! (${res.data.derived_project_id})`, 'success');
      onClose();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Shorts generation failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" id="shorts-generator-modal">
      <div className="bg-cinema-850 border border-cinema-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col text-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-900">
          <span className="font-bold text-white flex items-center gap-2 text-xs uppercase tracking-wider">
            <Smartphone className="w-4 h-4 text-cinema-ai" /> 9:16 Shorts Generator
          </span>
          <button onClick={onClose} className="p-1 text-cinema-textDim hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-cinema-textDim text-xs">
            Creates a derived 9:16 vertical short project from candidate timeline moments without altering your original timeline.
          </p>

          <div>
            <label className="text-[10px] text-cinema-textDim block mb-1">Target Duration</label>
            <select value={durationSec} onChange={e => setDurationSec(parseInt(e.target.value))} className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs">
              <option value={15}>15 Seconds (YouTube Shorts / Reel)</option>
              <option value={30}>30 Seconds (Standard Short)</option>
              <option value={60}>60 Seconds (Full Short)</option>
            </select>
          </div>

          <button
            id="create-shorts-btn"
            data-testid="create-shorts-btn"
            onClick={handleGenerateShorts}
            disabled={isGenerating}
            className="w-full py-2 bg-cinema-ai text-cinema-900 font-bold text-xs rounded hover:bg-cinema-aiHover transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Create 9:16 Short
          </button>
        </div>
      </div>
    </div>
  );
};
