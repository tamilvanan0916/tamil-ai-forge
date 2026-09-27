import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload, FolderOpen, Film, Music2, Image, FileAudio, Plus,
  Trash2, Star, Grid3X3, List, Search, ChevronDown, PlusCircle,
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';
import { api, mediaUrl } from '../../services/api';
import { Asset } from '../../types';
import { useIsMobile } from '../../hooks/useMediaQuery';

export const MediaBrowserPanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { timeline, addClipToTrack, playheadMs } = useTimelineStore();
  const { showNotification } = useUIStore();
  const isMobile = useIsMobile();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAssets = useCallback(async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterType !== 'all') params.asset_type = filterType;
      const res = await api.get<Asset[]>(`/projects/${activeProject.id}/assets`, { params });
      setAssets(res.data);
    } catch {
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeProject, filterType]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !activeProject) return;
    setIsUploading(true);
    let success = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Uploading ${file.name} (${i + 1}/${files.length})…`);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('folder_path', '/');
        await api.post(`/projects/${activeProject.id}/assets/upload`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        success++;
      } catch {
        showNotification(`Failed to upload: ${file.name}`, 'error');
      }
    }
    setUploadProgress(null);
    setIsUploading(false);
    if (success > 0) {
      showNotification(`${success} file(s) imported`, 'success');
      loadAssets();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // Only handle file drops (from OS), not from inside the app
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleDelete = async (assetId: string) => {
    try {
      await api.delete(`/assets/${assetId}`);
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      if (selectedAssetId === assetId) setSelectedAssetId(null);
      setDeleteConfirmId(null);
      showNotification('Asset deleted', 'info');
    } catch {
      showNotification('Failed to delete asset', 'error');
    }
  };

  const handleAddToTimeline = async (asset: Asset) => {
    if (!timeline) {
      showNotification('No timeline loaded. Open a project first.', 'warning');
      return;
    }
    // Find best target track by asset type
    const typeToRole: Record<string, string[]> = {
      video: ['video'],
      audio: ['dialogue', 'music', 'sfx', 'voiceover', 'ambience'],
      image: ['video', 'graphics'],
    };
    const preferredRoles = typeToRole[asset.asset_type] || ['video'];
    const targetTrack = timeline.tracks.find((t) =>
      preferredRoles.includes(t.track_role) && !t.is_locked
    );

    if (!targetTrack) {
      showNotification('No suitable unlocked track found for this asset type.', 'warning');
      return;
    }

    const durationMs = asset.duration_ms || 4000;
    addClipToTrack(targetTrack.id, {
      asset_id: asset.id,
      name: asset.file_name.replace(/\.[^.]+$/, ''),
      start_time_ms: playheadMs,
      duration_ms: durationMs,
      source_out_ms: durationMs,
      clip_type: asset.asset_type === 'image' ? 'media' : 'media',
    });

    showNotification(`Added "${asset.file_name}" to ${targetTrack.name}`, 'success');
  };

  const filtered = assets.filter((a) =>
    !searchQuery || a.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getTypeIcon = (type: string) => {
    if (type === 'video') return <Film className="w-3.5 h-3.5 text-blue-400" />;
    if (type === 'audio') return <FileAudio className="w-3.5 h-3.5 text-emerald-400" />;
    if (type === 'image') return <Image className="w-3.5 h-3.5 text-purple-400" />;
    return <Music2 className="w-3.5 h-3.5 text-cinema-textDim" />;
  };

  const selectedAsset = selectedAssetId ? assets.find((a) => a.id === selectedAssetId) : null;

  return (
    <div className="flex flex-col h-full bg-cinema-900">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-cinema-border flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-cinema-textDim pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search media…"
            className="w-full bg-cinema-800 border border-cinema-border rounded pl-6 pr-2 py-1 text-[11px] text-cinema-text outline-none placeholder:text-cinema-textDim focus:border-cinema-ai"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-cinema-800 border border-cinema-border rounded px-1.5 py-1 text-[10px] text-cinema-text outline-none"
        >
          <option value="all">All</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="image">Image</option>
        </select>
        <button
          onClick={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
          className="p-1 hover:bg-cinema-750 rounded text-cinema-textDim hover:text-white transition-colors"
          title="Toggle view"
        >
          {viewMode === 'grid' ? <List className="w-3.5 h-3.5" /> : <Grid3X3 className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!activeProject || isUploading}
          className="flex items-center gap-1 px-2 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-[10px] rounded transition-colors disabled:opacity-50 flex-shrink-0"
          title="Import media files"
        >
          <Plus className="w-3 h-3" /> Import
        </button>
      </div>

      {/* Selected asset "Add to Timeline" action bar */}
      {selectedAsset && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-cinema-ai/10 border-b border-cinema-ai/30">
          {getTypeIcon(selectedAsset.asset_type)}
          <span className="text-[10px] text-cinema-ai font-medium truncate flex-1">{selectedAsset.file_name}</span>
          <button
            onClick={() => handleAddToTimeline(selectedAsset)}
            className="flex items-center gap-1 px-2 py-1 bg-cinema-ai text-black rounded text-[10px] font-semibold hover:bg-cyan-300 transition-colors flex-shrink-0"
            title="Add selected asset to timeline at playhead"
          >
            <PlusCircle className="w-3 h-3" /> Add to Timeline
          </button>
        </div>
      )}

      {/* Drop zone + content */}
      <div
        className="flex-1 overflow-y-auto p-2"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {isUploading && (
          <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-cinema-ai/10 border border-cinema-ai/30 rounded text-[11px] text-cinema-ai">
            <div className="w-3 h-3 border-2 border-cinema-ai border-t-transparent rounded-full animate-spin" />
            {uploadProgress}
          </div>
        )}

        {!activeProject ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-cinema-textDim">
            <FolderOpen className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium">No project selected</p>
            <p className="text-xs">Create or select a project to browse media</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-24 gap-2 text-cinema-textDim text-xs">
            <div className="w-4 h-4 border-2 border-cinema-ai/50 border-t-cinema-ai rounded-full animate-spin" />
            Loading media…
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center min-h-[120px] gap-3 text-cinema-textDim border-2 border-dashed border-cinema-border rounded-lg cursor-pointer hover:border-cinema-ai/40 hover:text-cinema-ai/60 transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-6 h-6 opacity-40" />
            <p className="text-xs font-medium">Drop files or click Import</p>
            <p className="text-[10px]">MP4, MOV, MP3, WAV, PNG, JPG and more</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((asset) => {
              const isAssetSelected = selectedAssetId === asset.id;
              return (
                <div
                  key={asset.id}
                  className={`group relative bg-cinema-850 border rounded-md overflow-hidden cursor-pointer transition-all ${
                    isAssetSelected ? 'border-cinema-ai ring-1 ring-cinema-ai/50' : 'border-cinema-border hover:border-cinema-ai/40'
                  }`}
                  onClick={() => setSelectedAssetId(isAssetSelected ? null : asset.id)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-asset-id', asset.id);
                    e.dataTransfer.setData('application/x-asset-name', asset.file_name);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <div className="aspect-video bg-cinema-800 flex items-center justify-center relative">
                    {asset.thumbnail_url ? (
                      <img
                        src={mediaUrl(asset.thumbnail_url)}
                        className="w-full h-full object-cover"
                        alt={asset.file_name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="opacity-40">{getTypeIcon(asset.asset_type)}</div>
                    )}
                    {asset.duration_ms && (
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] px-1 rounded font-mono">
                        {formatDuration(asset.duration_ms)}
                      </span>
                    )}
                    {/* Delete button on hover */}
                    <button
                      className="absolute top-1 right-1 p-0.5 bg-black/70 rounded opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(asset.id); }}
                      title="Delete asset"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="px-1.5 py-1">
                    <p className="text-[10px] text-cinema-text font-medium truncate">{asset.file_name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {getTypeIcon(asset.asset_type)}
                      <p className="text-[9px] text-cinema-textDim">{formatSize(asset.file_size_bytes)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((asset) => {
              const isAssetSelected = selectedAssetId === asset.id;
              return (
                <div
                  key={asset.id}
                  className={`flex items-center gap-2 p-1.5 border rounded cursor-pointer transition-all group ${
                    isAssetSelected ? 'border-cinema-ai bg-cinema-ai/10' : 'bg-cinema-850 border-cinema-border hover:border-cinema-ai/40'
                  }`}
                  onClick={() => setSelectedAssetId(isAssetSelected ? null : asset.id)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-asset-id', asset.id);
                    e.dataTransfer.setData('application/x-asset-name', asset.file_name);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  {getTypeIcon(asset.asset_type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-cinema-text truncate">{asset.file_name}</p>
                    <p className="text-[9px] text-cinema-textDim">
                      {formatSize(asset.file_size_bytes)}{asset.duration_ms ? ` • ${formatDuration(asset.duration_ms)}` : ''}
                    </p>
                  </div>
                  <button
                    className="p-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(asset.id); }}
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-cinema-850 border border-cinema-border rounded-lg p-4 w-56 space-y-3">
            <p className="text-sm font-semibold text-white">Delete Asset?</p>
            <p className="text-[11px] text-cinema-textDim">This will permanently remove the file from storage.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-1.5 border border-cinema-border rounded text-cinema-textDim hover:text-white text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-xs transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.aac,.ogg,.flac,.m4a,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />
    </div>
  );
};
