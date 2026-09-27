import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Boxes, Folder, Upload, Plus, Film, Image as ImageIcon, FileAudio,
  Search, PlusCircle, Sparkles, Wand2, Download, Trash2,
  Check, RefreshCw, Music2, Tag, Layers
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';
import { api, mediaUrl } from '../../services/api';
import { Asset } from '../../types';

type AssetCategoryFilter = 'all' | 'transformed' | 'scenes' | 'video' | 'audio' | 'image' | 'elements';

const ELEMENT_CATEGORIES = [
  { name: 'Lower Thirds', count: 0, icon: Film },
  { name: 'Transitions', count: 0, icon: Film },
  { name: 'Overlays', count: 0, icon: ImageIcon },
  { name: 'Audio Beds', count: 0, icon: FileAudio },
  { name: 'Sound Stings', count: 0, icon: FileAudio },
  { name: 'Watermarks', count: 0, icon: ImageIcon },
  { name: 'Custom Elements', count: 0, icon: Folder },
];

export const AssetsPanel: React.FC = () => {
  const { activeProject, assets, fetchAssets } = useProjectStore();
  const { timeline, addClipToTrack, playheadMs } = useTimelineStore();
  const { showNotification, setActiveSidebarTab } = useUIStore();

  const [activeCategory, setActiveCategory] = useState<AssetCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [addedAssetIds, setAddedAssetIds] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeProject?.id) {
      fetchAssets();
    }
  }, [activeProject?.id, fetchAssets]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !activeProject) return;
    setIsUploading(true);
    let success = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder_path', '/Imported Assets');
        await api.post(`/projects/${activeProject.id}/assets/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        success++;
      } catch {
        showNotification(`Failed to upload ${file.name}`, 'error');
      }
    }
    setIsUploading(false);
    if (success > 0) {
      showNotification(`${success} asset(s) imported`, 'success');
      fetchAssets();
    }
  };

  const handleAddToTimeline = (asset: Asset) => {
    if (!timeline) {
      showNotification('No active timeline loaded. Select a project first.', 'warning');
      return;
    }

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
      showNotification('No suitable unlocked track found for this asset.', 'warning');
      return;
    }

    const durationMs = asset.duration_ms || 4000;
    addClipToTrack(targetTrack.id, {
      asset_id: asset.id,
      name: asset.file_name.replace(/\.[^.]+$/, ''),
      start_time_ms: playheadMs,
      duration_ms: durationMs,
      source_in_ms: 0,
      source_out_ms: durationMs,
      clip_type: 'media',
    });

    setAddedAssetIds((prev) => ({ ...prev, [asset.id]: true }));
    showNotification(`Added "${asset.file_name}" to ${targetTrack.name}`, 'success');
  };

  const handleDelete = async (assetId: string) => {
    try {
      await api.delete(`/assets/${assetId}`);
      showNotification('Asset removed from library', 'info');
      fetchAssets();
      if (selectedAssetId === assetId) setSelectedAssetId(null);
    } catch {
      showNotification('Failed to delete asset', 'error');
    }
  };

  // Helper formatting
  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Classification helpers
  const isTransformed = (asset: Asset) =>
    (asset.folder_path && asset.folder_path.includes('Transform')) ||
    Boolean((asset.metadata_info as any)?.transformation_mode) ||
    Boolean((asset.metadata_info as any)?.is_transformed);

  const isSceneAsset = (asset: Asset) =>
    Boolean((asset.metadata_info as any)?.scene_id) ||
    Boolean((asset.metadata_info as any)?.scene_number) ||
    asset.file_name.startsWith('scene_');

  // Filtered assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Category filter
      if (activeCategory === 'transformed' && !isTransformed(asset)) return false;
      if (activeCategory === 'scenes' && !isSceneAsset(asset)) return false;
      if (activeCategory === 'video' && asset.asset_type !== 'video') return false;
      if (activeCategory === 'audio' && asset.asset_type !== 'audio') return false;
      if (activeCategory === 'image' && asset.asset_type !== 'image') return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = asset.file_name.toLowerCase().includes(q);
        const matchesType = asset.asset_type.toLowerCase().includes(q);
        const matchesFolder = (asset.folder_path || '').toLowerCase().includes(q);
        if (!matchesName && !matchesType && !matchesFolder) return false;
      }

      return true;
    });
  }, [assets, activeCategory, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: assets.length,
      transformed: assets.filter(isTransformed).length,
      scenes: assets.filter(isSceneAsset).length,
      video: assets.filter((a) => a.asset_type === 'video').length,
      audio: assets.filter((a) => a.asset_type === 'audio').length,
      image: assets.filter((a) => a.asset_type === 'image').length,
    };
  }, [assets]);

  return (
    <div className="flex flex-col h-full bg-cinema-900 text-cinema-text select-none text-xs" id="global-assets-panel">
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cinema-border bg-cinema-850">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <Boxes className="w-3.5 h-3.5 text-cinema-ai" /> Global Assets & Library
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeProject || isUploading}
            className="flex items-center gap-1 px-2.5 py-1 bg-cinema-red hover:bg-cinema-redHover text-white text-[11px] font-semibold rounded transition-colors disabled:opacity-50"
            title="Import media files"
          >
            {isUploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            <span>Import</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-2 border-b border-cinema-border bg-cinema-900">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cinema-textDim" />
          <input
            id="assets-search-input"
            data-testid="assets-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search media, transformed assets, scenes…"
            className="w-full pl-8 pr-3 py-1 bg-cinema-800 border border-cinema-border rounded text-[11px] text-white placeholder-cinema-textDim/60 focus:outline-none focus:border-cinema-ai"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-cinema-border bg-cinema-850 overflow-x-auto text-[10px]">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
            activeCategory === 'all'
              ? 'bg-cinema-ai text-cinema-950 font-bold'
              : 'text-cinema-textDim hover:text-white hover:bg-cinema-800'
          }`}
        >
          <span>All</span>
          <span className="opacity-80">({counts.all})</span>
        </button>

        <button
          onClick={() => setActiveCategory('transformed')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
            activeCategory === 'transformed'
              ? 'bg-purple-600 text-white font-bold'
              : 'text-purple-400 hover:text-purple-300 hover:bg-cinema-800'
          }`}
        >
          <Wand2 className="w-2.5 h-2.5" />
          <span>Transformed</span>
          <span>({counts.transformed})</span>
        </button>

        <button
          onClick={() => setActiveCategory('scenes')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
            activeCategory === 'scenes'
              ? 'bg-cyan-600 text-white font-bold'
              : 'text-cyan-400 hover:text-cyan-300 hover:bg-cinema-800'
          }`}
        >
          <Film className="w-2.5 h-2.5" />
          <span>AI Scenes</span>
          <span>({counts.scenes})</span>
        </button>

        <button
          onClick={() => setActiveCategory('video')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
            activeCategory === 'video'
              ? 'bg-blue-600 text-white font-bold'
              : 'text-cinema-textDim hover:text-white hover:bg-cinema-800'
          }`}
        >
          <span>Video</span>
          <span>({counts.video})</span>
        </button>

        <button
          onClick={() => setActiveCategory('audio')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
            activeCategory === 'audio'
              ? 'bg-emerald-600 text-white font-bold'
              : 'text-cinema-textDim hover:text-white hover:bg-cinema-800'
          }`}
        >
          <span>Audio</span>
          <span>({counts.audio})</span>
        </button>

        <button
          onClick={() => setActiveCategory('image')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
            activeCategory === 'image'
              ? 'bg-amber-600 text-white font-bold'
              : 'text-cinema-textDim hover:text-white hover:bg-cinema-800'
          }`}
        >
          <span>Images</span>
          <span>({counts.image})</span>
        </button>

        <button
          onClick={() => setActiveCategory('elements')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
            activeCategory === 'elements'
              ? 'bg-cinema-border text-white font-bold'
              : 'text-cinema-textDim hover:text-white hover:bg-cinema-800'
          }`}
        >
          <span>Templates</span>
        </button>
      </div>

      {/* Asset Content List / Grid */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {activeCategory === 'elements' ? (
          <div className="space-y-1.5">
            {ELEMENT_CATEGORIES.map(({ name, count, icon: Icon }) => (
              <div
                key={name}
                className="flex items-center gap-3 p-2 bg-cinema-850 border border-cinema-border rounded hover:border-cinema-ai/40 transition-colors cursor-pointer"
              >
                <Icon className="w-4 h-4 text-cinema-ai flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{name}</p>
                </div>
                <span className="text-[10px] text-cinema-textDim">{count} items</span>
              </div>
            ))}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-2 text-cinema-textDim">
            <Boxes className="w-8 h-8 opacity-40 text-cinema-ai" />
            <p className="text-xs font-semibold text-white">
              {activeCategory === 'transformed'
                ? 'No transformed assets yet'
                : activeCategory === 'scenes'
                ? 'No AI scene assets generated yet'
                : 'No assets found'}
            </p>
            <p className="text-[11px] max-w-xs text-cinema-textDim/80">
              {activeCategory === 'transformed' ? (
                <span>
                  Convert videos and portraits to cinema style in the{' '}
                  <button
                    onClick={() => setActiveSidebarTab('media-transform')}
                    className="text-cinema-ai underline font-medium hover:text-cyan-300"
                  >
                    Media Transformation Studio
                  </button>
                  .
                </span>
              ) : activeCategory === 'scenes' ? (
                <span>
                  Plan and generate multi-scene video sequences in the{' '}
                  <button
                    onClick={() => setActiveSidebarTab('production-studio')}
                    className="text-cinema-ai underline font-medium hover:text-cyan-300"
                  >
                    Production Studio
                  </button>
                  .
                </span>
              ) : (
                'Import media files or transform videos into 3D animation.'
              )}
            </p>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const transformed = isTransformed(asset);
            const scene = isSceneAsset(asset);
            const isAdded = addedAssetIds[asset.id];
            const meta = (asset.metadata_info || {}) as any;

            return (
              <div
                key={asset.id}
                onClick={() => setSelectedAssetId(asset.id)}
                className={`flex items-start gap-2.5 p-2 bg-cinema-850 border rounded transition-all cursor-pointer ${
                  selectedAssetId === asset.id
                    ? 'border-cinema-ai shadow-sm bg-cinema-800'
                    : 'border-cinema-border hover:border-cinema-border/80'
                }`}
              >
                {/* Media Icon / Thumbnail Placeholder */}
                <div className="w-10 h-10 rounded bg-cinema-950 border border-cinema-border flex items-center justify-center flex-shrink-0 text-cinema-textDim relative overflow-hidden">
                  {asset.asset_type === 'video' ? (
                    <Film className="w-5 h-5 text-blue-400" />
                  ) : asset.asset_type === 'audio' ? (
                    <FileAudio className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-purple-400" />
                  )}
                  {transformed && (
                    <span className="absolute bottom-0 right-0 w-2 h-2 bg-purple-500 rounded-tl" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-semibold text-white truncate max-w-[180px]" title={asset.file_name}>
                      {asset.file_name}
                    </p>
                    {/* Badge */}
                    {transformed ? (
                      <span className="px-1.5 py-0.2 bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-bold rounded">
                        TRANSFORMED
                      </span>
                    ) : scene ? (
                      <span className="px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-bold rounded">
                        AI SCENE
                      </span>
                    ) : asset.folder_path?.includes('Import') ? (
                      <span className="px-1.5 py-0.2 bg-cinema-800 text-cinema-textDim text-[9px] rounded">
                        IMPORTED
                      </span>
                    ) : null}
                  </div>

                  {/* Metadata Specs */}
                  <div className="flex items-center gap-2 text-[10px] text-cinema-textDim">
                    {meta.width && meta.height && <span>{meta.width}×{meta.height}</span>}
                    {formatDuration(asset.duration_ms) && <span>{formatDuration(asset.duration_ms)}</span>}
                    {formatSize(asset.file_size_bytes) && <span>{formatSize(asset.file_size_bytes)}</span>}
                    <span className="capitalize">{asset.asset_type}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToTimeline(asset);
                    }}
                    className={`p-1.5 rounded transition-colors ${
                      isAdded
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-cinema-ai hover:bg-cyan-300 text-cinema-950 font-bold'
                    }`}
                    title="Insert asset into timeline"
                  >
                    {isAdded ? <Check className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}
                  </button>

                  <a
                    href={mediaUrl(`/assets/${asset.id}/download`)}
                    download
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 hover:bg-cinema-750 text-cinema-textDim hover:text-white rounded transition-colors"
                    title="Download asset"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(asset.id);
                    }}
                    className="p-1.5 hover:bg-red-500/20 text-cinema-textDim hover:text-red-400 rounded transition-colors"
                    title="Delete asset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
