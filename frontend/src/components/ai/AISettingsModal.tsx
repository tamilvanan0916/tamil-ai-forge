import React, { useState, useEffect } from 'react';
import { X, Settings, Key, CheckCircle, AlertCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { api } from '../../services/api';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({ isOpen, onClose }) => {
  const { showNotification } = useUIStore();
  const [providers, setProviders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCap, setSelectedCap] = useState('llm');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadProviders = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/ai/providers');
      setProviders(res.data);
    } catch {
      setProviders([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadProviders();
  }, [isOpen]);

  const handleSaveConfig = async () => {
    if (!selectedCap) return;
    setIsSaving(true);
    try {
      await api.post('/ai/providers/config', {
        capability: selectedCap,
        provider_name: 'default',
        api_key: apiKeyInput.trim() || undefined,
        is_enabled: true,
      });
      setApiKeyInput('');
      showNotification(`Saved server-side config for ${selectedCap.toUpperCase()}`, 'success');
      await loadProviders();
    } catch (e: any) {
      showNotification(e?.response?.data?.detail || 'Failed to save configuration', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" id="ai-settings-modal">
      <div className="bg-cinema-850 border border-cinema-border rounded-xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-900">
          <span className="font-bold text-white flex items-center gap-2 text-xs uppercase tracking-wider">
            <Settings className="w-4 h-4 text-cinema-ai" /> AI Provider Configuration &amp; Settings
          </span>
          <button id="close-settings-btn" data-testid="close-settings-btn" onClick={onClose} className="p-1 text-cinema-textDim hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="p-3 bg-cinema-900 border border-cinema-border rounded-lg flex items-center gap-2 text-[11px] text-cinema-textDim">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>All API keys are stored strictly server-side in environment variables and are never exposed to client browsers.</span>
          </div>

          {/* Capabilities List */}
          <div className="space-y-2">
            <p className="font-semibold text-white text-xs">Provider Capabilities Status</p>
            {isLoading ? (
              <div className="flex items-center justify-center h-20 text-cinema-textDim gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading status...</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {providers.map(p => (
                  <button
                    key={p.capability}
                    onClick={() => setSelectedCap(p.capability)}
                    className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors ${
                      selectedCap === p.capability ? 'bg-cinema-800 border-cinema-ai' : 'bg-cinema-900 border-cinema-border hover:border-cinema-border/80'
                    }`}
                  >
                    <span className="font-bold text-white uppercase text-[10px]">{p.capability}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-semibold ${
                      p.is_configured ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}>
                      {p.is_configured ? 'Configured' : 'Not Configured'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Key Input Form */}
          <div className="p-3 bg-cinema-900 border border-cinema-border rounded-lg space-y-2 pt-3">
            <p className="font-semibold text-white text-xs flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-cinema-ai" /> Configure Key for: <span className="uppercase text-cinema-ai font-mono">{selectedCap}</span>
            </p>
            {selectedCap === 'video' && (
              <div className="p-2 bg-cinema-850 border border-cinema-border rounded text-[11px] text-cinema-textDim flex flex-col gap-1 mb-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-white">Active Video Provider:</span>
                  <span className="font-mono text-cinema-ai font-bold">
                    {providers.find(p => p.capability === 'video')?.active_provider || 'mock'}
                  </span>
                </div>
                <p className="text-[10px] text-cinema-textDim">
                  {providers.find(p => p.capability === 'video')?.message}
                </p>
              </div>
            )}
            <input
              type="password"
              placeholder={selectedCap === 'video' ? "Paste API Key or Token (HF_TOKEN / EIGHTSCALE_API_KEY)..." : "Paste API Key (e.g. sk-proj-...)..."}
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              className="w-full bg-cinema-850 border border-cinema-border rounded p-2 text-white text-xs font-mono outline-none focus:border-cinema-ai"
            />
            <div className="flex justify-end pt-1">
              <button
                id="save-provider-config-btn"
                data-testid="save-provider-config-btn"
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save Server Config
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
