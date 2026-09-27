import React, { useEffect, useCallback } from 'react';
import {
  ListOrdered,
  X,
  DownloadCloud,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { api, mediaUrl } from '../../services/api';
import { RenderJob } from '../../types';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  queued: { label: 'Queued', color: 'text-amber-400', icon: <Clock className="w-3.5 h-3.5" /> },
  processing: { label: 'Rendering', color: 'text-cinema-ai', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  completed: { label: 'Completed', color: 'text-emerald-400', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: 'Failed', color: 'text-red-400', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Cancelled', color: 'text-cinema-textDim', icon: <X className="w-3.5 h-3.5" /> },
};

export const RenderQueuePanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const [jobs, setJobs] = React.useState<RenderJob[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const loadJobs = useCallback(async () => {
    if (!activeProject) return;
    try {
      const res = await api.get('/render/queue', { params: { project_id: activeProject.id } });
      setJobs(res.data);
    } catch {
      setJobs([]);
    }
  }, [activeProject]);

  useEffect(() => {
    setIsLoading(true);
    loadJobs().finally(() => setIsLoading(false));
  }, [loadJobs]);

  // Auto-refresh when jobs are queued or processing
  useEffect(() => {
    const hasActiveJobs = jobs.some((j) => j.status === 'queued' || j.status === 'processing');
    if (!hasActiveJobs) return;

    const timer = setInterval(() => {
      loadJobs();
    }, 2500);

    return () => clearInterval(timer);
  }, [jobs, loadJobs]);

  const handleCancel = async (jobId: string) => {
    try {
      await api.post(`/render/jobs/${jobId}/cancel`);
      loadJobs();
    } catch (e) {
      console.error('Failed to cancel render job', e);
    }
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  return (
    <div className="flex flex-col h-full bg-cinema-900 select-none">
      <div className="flex items-center justify-between px-3 py-2 border-b border-cinema-border flex-shrink-0">
        <span className="text-xs font-semibold text-cinema-text flex items-center gap-1.5">
          <ListOrdered className="w-3.5 h-3.5 text-cinema-red" /> Render Queue
        </span>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            loadJobs().finally(() => setIsLoading(false));
          }}
          className="text-[10px] text-cinema-textDim hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && jobs.length === 0 ? (
          <div className="flex items-center justify-center h-24 gap-2 text-cinema-textDim text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-cinema-ai" /> Loading...
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-cinema-textDim text-center">
            <DownloadCloud className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium">No render jobs</p>
            <p className="text-xs">Click Export on the top bar to start rendering your project.</p>
          </div>
        ) : (
          jobs.map((job) => {
            const s = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
            const downloadHref = job.output_path ? mediaUrl(job.output_path) : null;

            return (
              <div key={job.id} className="bg-cinema-850 border border-cinema-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={s.color}>{s.icon}</span>
                    <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
                    <span className="text-[10px] text-cinema-textDim">{timeAgo(job.created_at)}</span>
                  </div>
                  <span className="text-[10px] font-mono text-cinema-textDim uppercase">
                    {job.export_preset?.format || 'mp4'} / {job.export_preset?.width}×{job.export_preset?.height}
                  </span>
                </div>

                {job.status === 'processing' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-cinema-textDim">
                      <span>Progress</span>
                      <span>{Math.round(job.progress_percent)}%</span>
                    </div>
                    <div className="h-1.5 bg-cinema-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cinema-ai rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(4, job.progress_percent)}%` }}
                      />
                    </div>
                  </div>
                )}

                {job.status === 'completed' && downloadHref && (
                  <div className="pt-2 space-y-1.5 border-t border-cinema-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Render Master Ready
                      </span>
                      <a
                        href={downloadHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-cinema-800 hover:bg-cinema-700 text-cinema-ai rounded text-[10px] font-medium transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Download / View</span>
                      </a>
                    </div>
                    {/* Phase 11 Deliverable metadata badges */}
                    <div className="flex flex-wrap gap-1 text-[9px] font-mono text-cinema-textDim">
                      {job.export_preset?.framing_mode && (
                        <span className="px-1.5 py-0.5 bg-cinema-900 border border-cinema-border rounded text-cyan-300">
                          Framing: {job.export_preset.framing_mode}
                        </span>
                      )}
                      {job.export_preset?.burn_subtitles && (
                        <span className="px-1.5 py-0.5 bg-cinema-900 border border-cinema-border rounded text-amber-300">
                          Subtitles Burned
                        </span>
                      )}
                      {job.export_preset?.export_stems && (
                        <span className="px-1.5 py-0.5 bg-cinema-900 border border-cinema-border rounded text-purple-300">
                          Stems: Dia/Mus/SFX
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {['queued', 'processing'].includes(job.status) && (
                  <button
                    type="button"
                    onClick={() => handleCancel(job.id)}
                    className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                )}

                {job.status === 'failed' && job.error_message && (
                  <p className="text-[10px] text-red-400 bg-red-950/40 border border-red-900/30 rounded p-1.5">
                    {job.error_message}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
