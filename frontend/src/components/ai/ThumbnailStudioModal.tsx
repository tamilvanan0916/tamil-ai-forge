import React, { useState } from 'react';
import { X, Image, Sparkles, Loader2 } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';

interface ThumbnailStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThumbnailStudioModal: React.FC<ThumbnailStudioModalProps> = ({ isOpen, onClose }) => {
  const { activeProject } = useProjectStore();
  const { showNotification } = useUIStore();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleGenerateThumbnail = async () => {
    if (!activeProject || !prompt.trim()) return;
    setIsGenerating(true);
    try {
      await api.post(`/ai/generate/thumbnail?project_id=${activeProject.id}&prompt=${encodeURIComponent(prompt.trim())}`);
      showNotification('Thumbnail generation job enqueued', 'success');
      onClose();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Thumbnail generation failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" id="thumbnail-studio-modal">
      <div className="bg-cinema-850 border border-cinema-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col text-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-900">
          <span className="font-bold text-white flex items-center gap-2 text-xs uppercase tracking-wider">
            <Image className="w-4 h-4 text-cinema-ai" /> Thumbnail Studio
          </span>
          <button onClick={onClose} className="p-1 text-cinema-textDim hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-white block mb-1">Thumbnail Visual Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Heroic portrait of Karthik holding a torch in an ancient Chola fort, dramatic lighting, 8k..."
              rows={3}
              className="w-full bg-cinema-900 border border-cinema-border rounded p-2 text-white text-xs outline-none focus:border-cinema-ai resize-none"
            />
          </div>

          <button
            id="generate-thumbnail-btn"
            data-testid="generate-thumbnail-btn"
            onClick={handleGenerateThumbnail}
            disabled={isGenerating}
            className="w-full py-2 bg-cinema-ai text-cinema-900 font-bold text-xs rounded hover:bg-cinema-aiHover transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate Thumbnail
          </button>
        </div>
      </div>
    </div>
  );
};
