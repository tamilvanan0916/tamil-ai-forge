import React, { useState, useEffect } from 'react';
import { X, Loader2, RefreshCw, StopCircle, CheckCircle2, AlertTriangle, Sparkles, Plus } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { api } from '../../services/api';

interface AIGenerationQueueProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIGenerationQueue: React.FC<AIGenerationQueueProps> = ({ isOpen, onClose }) => {
  const { activeProject } = useProjectStore();
  const { timeline, addClipToTrack } = useTimelineStore();
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddToTimeline = (job: any) => {
    if (!timeline) return;
    const isAudio = job.job_type === 'tts' || job.job_type === 'music' || job.job_type === 'sfx';
    const targetTrack = timeline.tracks.find(t => isAudio ? t.track_type === 'audio' : t.track_type === 'video') || timeline.tracks[0];
    if (!targetTrack) return;

    const durMs = Math.round((job.job_metadata?.duration_sec || 5.0) * 1000);
    addClipToTrack(targetTrack.id, {
      id: `clip-job-${job.id.slice(0, 8)}-${Date.now()}`,
      name: `${job.job_type.toUpperCase()}: ${(job.prompt || '').slice(0, 20)}`,
      clip_type: 'media',
      duration_ms: durMs,
      source_in_ms: 0,
      source_out_ms: durMs,
      start_time_ms: 0,
      asset_id: job.result_asset_id,
      effects: [],
      keyframes: []
    });
  };

  const loadJobs = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/ai/jobs?project_id=${activeProject.id}`);
      setJobs(res.data);
    } catch {
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadJobs();
  }, [isOpen, activeProject]);

  const handleCancel = async (id: string) => {
    try {
      await api.post(`/ai/jobs/${id}/cancel`);
      await loadJobs();
    } catch {
      // ignore
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await api.post(`/ai/jobs/${id}/retry`);
      await loadJobs();
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" id="ai-generation-queue-modal">
      <div className="bg-cinema-850 border border-cinema-border rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-900">
          <span className="font-bold text-white flex items-center gap-2 text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-cinema-ai" /> AI Generation Queue &amp; Jobs
          </span>
          <div className="flex items-center gap-2">
            <button onClick={loadJobs} className="p-1 text-cinema-textDim hover:text-white"><RefreshCw className="w-3.5 h-3.5" /></button>
            <button id="close-queue-btn" data-testid="close-queue-btn" onClick={onClose} className="p-1 text-cinema-textDim hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-cinema-textDim gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading generation jobs...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-cinema-textDim space-y-2">
              <Sparkles className="w-8 h-8 mx-auto opacity-20" />
              <p className="text-xs font-semibold text-white">No Active AI Generation Jobs</p>
              <p className="text-[11px]">Enqueued video, image, TTS, and music generation tasks will appear here.</p>
            </div>
          ) : (
            jobs.map(job => (
              <div key={job.id} className="p-3 bg-cinema-900 border border-cinema-border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-cinema-800 text-cinema-ai font-mono text-[10px] font-bold rounded uppercase">{job.job_type}</span>
                    <span className="font-semibold text-white text-xs truncate max-w-[200px]">{job.prompt || 'Generation task'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      job.status === 'completed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                      job.status === 'processing' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
                      job.status === 'failed' ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-cinema-800 text-cinema-textDim'
                    }`}>
                      {job.status}
                    </span>
                    {job.status === 'completed' && job.output_url && (
                      <button
                        onClick={() => handleAddToTimeline(job)}
                        className="px-2 py-0.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 rounded border border-emerald-700/60 flex items-center gap-1 text-[10px] font-bold transition-colors"
                        title="Add to Timeline"
                      >
                        <Plus className="w-2.5 h-2.5" /> Timeline
                      </button>
                    )}
                    {job.status === 'processing' && (
                      <button onClick={() => handleCancel(job.id)} className="text-red-400 hover:text-red-300 p-1" title="Cancel"><StopCircle className="w-3.5 h-3.5" /></button>
                    )}
                    {job.status === 'failed' && (
                      <button onClick={() => handleRetry(job.id)} className="text-cinema-ai hover:text-white p-1" title="Retry"><RefreshCw className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>

                {job.status === 'processing' && (
                  <div className="w-full bg-cinema-800 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-cinema-ai h-full transition-all duration-300" style={{ width: `${job.progress_percent}%` }} />
                  </div>
                )}

                {job.error_message && (
                  <p className="text-[10px] text-amber-400 font-mono bg-amber-950/30 p-1.5 rounded border border-amber-900/40">{job.error_message}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
