import React, { useEffect, useState, useCallback } from 'react';
import { History, RotateCcw, X, ChevronRight, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { useTimelineStore } from '../../stores/useTimelineStore';

interface RevisionMeta {
  id: string;
  revision_number: number;
  description: string | null;
  created_at: string;
  track_count?: number;
  clip_count?: number;
}

interface TimelineRevisionsModalProps {
  projectId: string;
  onClose: () => void;
}

export const TimelineRevisionsModal: React.FC<TimelineRevisionsModalProps> = ({ projectId, onClose }) => {
  const [revisions, setRevisions] = useState<RevisionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fetchTimeline = useTimelineStore((s) => s.fetchTimeline);

  const loadRevisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<RevisionMeta[]>(`/timelines/projects/${projectId}/revisions`);
      // Sort newest first
      const sorted = [...(res.data || [])].sort((a, b) => b.revision_number - a.revision_number);
      setRevisions(sorted);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load revisions');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadRevisions();
  }, [loadRevisions]);

  const handleRestore = async (revisionId: string) => {
    setRestoring(revisionId);
    setConfirmId(null);
    try {
      await api.post(`/timelines/revisions/${revisionId}/restore`);
      // Reload the timeline in the store
      await fetchTimeline(projectId);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Restore failed');
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-cinema-900 border border-cinema-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cinema-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cinema-ai" />
            <span className="text-sm font-semibold text-white">Timeline Revision History</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-cinema-750 rounded text-cinema-textDim hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="text-center text-cinema-textDim text-sm py-8 animate-pulse">Loading revisions…</div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-900/40 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && revisions.length === 0 && (
            <div className="text-center text-cinema-textDim text-sm py-8">
              No revisions saved yet. Revisions are created automatically when you save the timeline.
            </div>
          )}

          {revisions.map((rev) => (
            <div
              key={rev.id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-cinema-border bg-cinema-950 hover:border-cinema-borderLight transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-cinema-ai">v{rev.revision_number}</span>
                  <span className="text-xs text-cinema-textDim">{formatDate(rev.created_at)}</span>
                </div>
                <p className="text-xs text-white mt-0.5 truncate">
                  {rev.description || 'Auto-saved snapshot'}
                </p>
              </div>

              {confirmId === rev.id ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] text-amber-400">Restore?</span>
                  <button
                    onClick={() => handleRestore(rev.id)}
                    disabled={!!restoring}
                    className="px-2 py-0.5 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {restoring === rev.id ? 'Restoring…' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="px-2 py-0.5 text-[10px] border border-cinema-border text-cinema-textDim hover:text-white rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(rev.id)}
                  disabled={!!restoring}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] border border-cinema-border text-cinema-textDim hover:text-white hover:border-cinema-borderLight rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                  title="Restore this revision"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restore
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-cinema-border flex-shrink-0">
          <p className="text-[10px] text-cinema-textDim">
            Restoring a revision creates a new pre-restore snapshot first, so you can always undo.
          </p>
        </div>
      </div>
    </div>
  );
};
