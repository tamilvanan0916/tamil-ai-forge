import React from 'react';
import { Settings, Monitor, HardDrive, Cpu, Volume2, Globe, Info } from 'lucide-react';
import { api } from '../../services/api';

export const SettingsPanel: React.FC = () => {
  const [health, setHealth] = React.useState<any>(null);

  React.useEffect(() => {
    api.get('/../../health').then(r => setHealth(r.data)).catch(() => {});
    // Also try with base URL
    fetch('http://localhost:8000/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full bg-cinema-900">
      <div className="px-4 py-3 border-b border-cinema-border">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-cinema-red" />
          <h2 className="text-sm font-bold text-white">Settings</h2>
        </div>
        <p className="text-[11px] text-cinema-textDim mt-0.5">System configuration and backend status.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Backend Status */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-cinema-textMuted uppercase tracking-wider">Backend Status</h3>
          <div className={`p-3 rounded-lg border ${health ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-red-950/30 border-red-800/40'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${health ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={`text-xs font-semibold ${health ? 'text-emerald-400' : 'text-red-400'}`}>
                {health ? 'Backend Connected' : 'Backend Offline — Start with: uvicorn app.main:app'}
              </span>
            </div>
            {health && (
              <div className="mt-2 space-y-1 text-[10px] text-cinema-textDim font-mono">
                <p>App: {health.app}</p>
                <p>Storage: {health.storage_backend}</p>
                <p>FFmpeg: {health.ffmpeg ? '✓ Available' : '⚠ Not found'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Export Defaults */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-cinema-textMuted uppercase tracking-wider flex items-center gap-1.5">
            <Monitor className="w-3 h-3" /> Default Export Settings
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Resolution', value: '1920 × 1080 (Full HD)' },
              { label: 'Frame Rate', value: '30 fps' },
              { label: 'Video Codec', value: 'H.264 (libx264)' },
              { label: 'Audio Codec', value: 'AAC 192kbps' },
              { label: 'Color Space', value: 'Rec. 709' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between bg-cinema-850 border border-cinema-border rounded px-3 py-1.5">
                <span className="text-[11px] text-cinema-textDim">{label}</span>
                <span className="text-[11px] text-cinema-text font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Storage */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-cinema-textMuted uppercase tracking-wider flex items-center gap-1.5">
            <HardDrive className="w-3 h-3" /> Storage
          </h3>
          <div className="bg-cinema-850 border border-cinema-border rounded p-3 space-y-1 text-[11px] text-cinema-textDim">
            <p>Backend: Local filesystem (./storage)</p>
            <p>Projects: ./storage/projects/</p>
            <p>Cache: ./storage/cache/ (proxies, thumbs, waveforms)</p>
            <p>Music Library: ./storage/music-library/</p>
            <p className="text-cinema-textDim/50 mt-2 text-[10px]">S3 abstraction available — set STORAGE_BACKEND=s3 in .env</p>
          </div>
        </div>

        {/* AI Providers */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-cinema-textMuted uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3 h-3" /> AI Provider Keys
          </h3>
          <div className="bg-cinema-850 border border-cinema-border rounded p-3 space-y-1.5 text-[10px] text-cinema-textDim">
            {[
              ['LLM', 'GOOGLE_API_KEY or ANTHROPIC_API_KEY'],
              ['Image Gen', 'FLUX_API_KEY or STABILITY_API_KEY'],
              ['Video Gen', 'RUNWAY_API_KEY or KLING_API_KEY'],
              ['Tamil TTS', 'AZURE_SPEECH_KEY or GOOGLE_API_KEY'],
              ['STT', 'Whisper runs locally — no key needed'],
              ['Lip Sync', 'SYNCLABS_API_KEY (optional, Wav2Lip free)'],
              ['Music', 'MusicGen is local — Stable Audio needs STABILITY_API_KEY'],
            ].map(([name, key]) => (
              <div key={name} className="flex items-start justify-between gap-2">
                <span className="text-cinema-text font-medium w-20 flex-shrink-0">{name}</span>
                <span className="font-mono text-cinema-textDim/70">{key}</span>
              </div>
            ))}
            <p className="text-cinema-textDim/50 mt-2 pt-2 border-t border-cinema-border">Add keys to .env file in project root</p>
          </div>
        </div>

        {/* About */}
        <div className="p-3 bg-gradient-to-br from-cinema-800 to-cinema-900 border border-cinema-border rounded-lg text-center space-y-1">
          <p className="text-sm font-extrabold text-white tracking-wider">TAMIL AI FORGE</p>
          <p className="text-[10px] text-cinema-ai">From Words to Cinema.</p>
          <p className="text-[9px] text-cinema-textDim">Phase 1 — Foundation Release</p>
          <p className="text-[9px] text-cinema-textDim/50">Personal-use AI filmmaking studio • No subscriptions • No credits</p>
        </div>
      </div>
    </div>
  );
};
