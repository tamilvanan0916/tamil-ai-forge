import React, { useEffect, useCallback, useState, Suspense, lazy } from 'react';
import { Allotment } from 'allotment';

// Layout
import { TopBar } from './components/layout/TopBar';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { MobileDrawer } from './components/layout/MobileDrawer';

// Preview
import { VideoPreview } from './components/preview/VideoPreview';

// Inspector
import { DynamicInspector } from './components/inspector/DynamicInspector';

// Timeline
import { TimelineShell } from './components/timeline/TimelineShell';

// Panels - eagerly load the most common ones
import { HomePanel } from './components/panels/HomePanel';
import { MediaBrowserPanel } from './components/panels/MediaBrowserPanel';
import { EditPanel } from './components/panels/EditPanel';
import { MyProjectsPanel } from './components/panels/MyProjectsPanel';
import { RenderQueuePanel } from './components/panels/RenderQueuePanel';
import { SettingsPanel } from './components/panels/SettingsPanel';
import { AssetsPanel } from './components/panels/AssetsPanel';
import { CaptionsPanel } from './components/panels/CaptionsPanel';
import { GraphicsPanel } from './components/panels/GraphicsPanel';
import { MusicLibraryPanel } from './components/panels/MusicLibraryPanel';

// Lazy-load heavier panels
// Phase 6 AI Studio Panels
import { StoryStudio } from './components/ai/StoryStudio';
import { ProductionStudio } from './components/ai/ProductionStudio';
import { CharacterStudio } from './components/ai/CharacterStudio';
import { SceneStudio } from './components/ai/SceneStudio';
import { StoryboardView } from './components/ai/StoryboardView';
import { MediaTransformationStudio } from './components/ai/MediaTransformationStudio';

// Phase 6 AI Modals
import { AIGenerationQueue } from './components/ai/AIGenerationQueue';
import { AISettingsModal } from './components/ai/AISettingsModal';
import { ThumbnailStudioModal } from './components/ai/ThumbnailStudioModal';
import { ShortsGeneratorModal } from './components/ai/ShortsGeneratorModal';

// Modals
import { NewProjectModal } from './components/modals/NewProjectModal';
import { ExportModal } from './components/modals/ExportModal';
import { UnifiedProjectStatusModal } from './components/modals/UnifiedProjectStatusModal';

// Common
import { Notification } from './components/common/Notification';

// Stores
import { useUIStore } from './stores/useUIStore';
import { useProjectStore } from './stores/useProjectStore';
import { useTimelineStore } from './stores/useTimelineStore';
import { useSelectionStore } from './stores/useSelectionStore';
import { SidebarTab } from './types';
import { useIsMobile, useIsTablet } from './hooks/useMediaQuery';

// Lazy-load heavier panels
const AIGeneratePanel = lazy(() => import('./components/panels/AIGeneratePanel').then(m => ({ default: m.AIGeneratePanel })));
const ColorPanel = lazy(() => import('./components/panels/ColorPanel').then(m => ({ default: m.ColorPanel })));
const VFXPanel = lazy(() => import('./components/panels/VFXPanel').then(m => ({ default: m.VFXPanel })));
const VoiceDubbingPanel = lazy(() => import('./components/panels/VoiceDubbingPanel').then(m => ({ default: m.VoiceDubbingPanel })));
const SFXPanel = lazy(() => import('./components/panels/SFXPanel').then(m => ({ default: m.SFXPanel })));
const TemplatesPanel = lazy(() => import('./components/panels/TemplatesPanel').then(m => ({ default: m.TemplatesPanel })));

// Panel router
const PANEL_MAP: Record<SidebarTab, React.ComponentType> = {
  'home': HomePanel,
  'media': MediaBrowserPanel,
  'ai-generate': AIGeneratePanel as React.ComponentType,
  'media-transform': MediaTransformationStudio,
  'production-studio': ProductionStudio,
  'story-script': StoryStudio,
  'characters': CharacterStudio,
  'scenes': SceneStudio,
  'storyboard': StoryboardView,
  'edit': EditPanel,
  'color': ColorPanel as React.ComponentType,
  'vfx': VFXPanel as React.ComponentType,
  'voice-dubbing': VoiceDubbingPanel as React.ComponentType,
  'music-library': MusicLibraryPanel,
  'sfx': SFXPanel as React.ComponentType,
  'captions': CaptionsPanel,
  'graphics': GraphicsPanel,
  'assets': AssetsPanel,
  'templates': TemplatesPanel as React.ComponentType,
  'my-projects': MyProjectsPanel,
  'render-queue': RenderQueuePanel,
  'settings': SettingsPanel,
};


const PanelFallback: React.FC = () => (
  <div className="flex items-center justify-center h-24 gap-2 text-cinema-textDim text-xs">
    <div className="w-4 h-4 border-2 border-cinema-ai/40 border-t-cinema-ai rounded-full animate-spin" />
    Loading…
  </div>
);

const SidePanelContent: React.FC = () => {
  const { activeSidebarTab } = useUIStore();
  const PanelComponent = PANEL_MAP[activeSidebarTab] || EditPanel;
  return (
    <div className="w-full h-full overflow-hidden">
      <Suspense fallback={<PanelFallback />}>
        <PanelComponent />
      </Suspense>
    </div>
  );
};

function App() {
  const {
    activeSidebarTab,
    isAIQueueModalOpen, setAIQueueModalOpen,
    isAISettingsModalOpen, setAISettingsModalOpen,
    isThumbnailModalOpen, setThumbnailModalOpen,
    isShortsModalOpen, setShortsModalOpen,
    isProjectStatusModalOpen, setProjectStatusModalOpen,
  } = useUIStore();

  const { fetchProjects, activeProject } = useProjectStore();
  const {
    fetchTimeline, togglePlay, selectedClipId, deleteClip,
    splitClipAtPlayhead, undo, redo, saveTimeline,
  } = useTimelineStore();
  const { clearSelection } = useSelectionStore();
  const { showNotification } = useUIStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  // On mount: fetch projects & attach stores to window for Puppeteer verification
  useEffect(() => {
    (window as any).__projectStore = useProjectStore;
    (window as any).__timelineStore = useTimelineStore;
    (window as any).__uiStore = useUIStore;
    fetchProjects();
  }, [fetchProjects]);

  // Whenever active project changes: fetch its timeline
  useEffect(() => {
    if (activeProject?.id) {
      fetchTimeline(activeProject.id);
    }
  }, [activeProject?.id, fetchTimeline]);

  // Open inspector on mobile when a clip is selected
  useEffect(() => {
    if (isMobile && selectedClipId) {
      setMobileInspectorOpen(true);
    }
  }, [selectedClipId, isMobile]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip when user is typing in an input field
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    const isEditable = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement).isContentEditable;
    if (isEditable) return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      redo();
    } else if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveTimeline();
      showNotification('Timeline saved', 'success');
    } else if (e.key === 's' || e.key === 'S') {
      if (selectedClipId) {
        e.preventDefault();
        splitClipAtPlayhead(selectedClipId);
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
      if (selectedClipId) {
        e.preventDefault();
        deleteClip(selectedClipId);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const fps = activeProject?.settings?.fps ?? 30;
      const frameMs = 1000 / fps;
      const delta = e.shiftKey ? frameMs * 10 : frameMs;
      useTimelineStore.getState().setPlayhead(
        Math.max(0, useTimelineStore.getState().playheadMs - delta)
      );
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const fps = activeProject?.settings?.fps ?? 30;
      const frameMs = 1000 / fps;
      const delta = e.shiftKey ? frameMs * 10 : frameMs;
      useTimelineStore.getState().setPlayhead(
        useTimelineStore.getState().playheadMs + delta
      );
    } else if (e.key === 'Escape') {
      clearSelection();
      useTimelineStore.getState().selectClip(null);
      setMobileInspectorOpen(false);
    }
  }, [
    togglePlay, undo, redo, saveTimeline, selectedClipId,
    splitClipAtPlayhead, deleteClip, clearSelection, showNotification, activeProject,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── MOBILE LAYOUT ───
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-cinema-void text-cinema-text">
        {/* Top Bar */}
        <div className="flex-shrink-0 h-11 border-b border-cinema-border">
          <TopBar onMenuClick={() => setMobileDrawerOpen(true)} />
        </div>

        {/* Mobile Drawer */}
        <MobileDrawer
          isOpen={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
        />

        {/* Main scrollable area: SidePanelContent if any workspace tab active, else Preview + Timeline for 'edit' */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeSidebarTab !== 'edit' ? (
            <div className="flex-1 overflow-y-auto">
              <SidePanelContent />
            </div>
          ) : (
            <>
              {/* Video Preview */}
              <div className="flex-shrink-0" style={{ height: '45%' }}>
                <VideoPreview />
              </div>

              {/* Timeline */}
              <div id="timeline-shell" className="flex-1 overflow-hidden">
                <TimelineShell />
              </div>
            </>
          )}
        </div>

        {/* Mobile bottom nav for panel access */}
        <div className="flex-shrink-0 h-10 bg-cinema-900 border-t border-cinema-border flex items-center justify-between px-3">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="text-[10px] text-cinema-textDim hover:text-white"
          >
            ☰ Panels
          </button>
          <span className="text-[10px] text-cinema-ai font-medium capitalize">{activeSidebarTab}</span>
          <button
            onClick={() => setMobileInspectorOpen(true)}
            className="text-[10px] text-cinema-textDim hover:text-white"
          >
            Inspector ⚙
          </button>
        </div>

        {/* Mobile Inspector as bottom sheet */}
        {mobileInspectorOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setMobileInspectorOpen(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-cinema-850 border-t border-cinema-borderLight rounded-t-2xl shadow-2xl"
              style={{ height: '70vh' }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-cinema-border">
                <span className="font-bold text-white text-sm">Inspector</span>
                <button
                  onClick={() => setMobileInspectorOpen(false)}
                  className="p-1 text-cinema-textDim hover:text-white"
                >✕</button>
              </div>
              <div className="h-full overflow-y-auto pb-8">
                <DynamicInspector />
              </div>
            </div>
          </>
        )}

        {/* Modals & Notifications */}
        <NewProjectModal />
        <ExportModal />
        <Notification />
      </div>
    );
  }

  // ─── TABLET LAYOUT ───
  if (isTablet) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-cinema-void text-cinema-text">
        <div className="flex-shrink-0 h-11 border-b border-cinema-border">
          <TopBar onMenuClick={() => setMobileDrawerOpen(true)} />
        </div>

        <MobileDrawer
          isOpen={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Collapsible side panel — hidden on tablet by default, drawer opens */}
          <div className="hidden md:flex w-48 flex-shrink-0 border-r border-cinema-border flex-col bg-cinema-900 overflow-hidden">
            <SidePanelContent />
          </div>

          {/* Center + Inspector */}
          <div className="flex-1 overflow-hidden">
            <Allotment defaultSizes={[3, 1]} minSize={180}>
              <Allotment.Pane>
                <Allotment vertical defaultSizes={[3, 2]} minSize={80}>
                  <Allotment.Pane minSize={120}>
                    <div className="h-full bg-cinema-950">
                      <VideoPreview />
                    </div>
                  </Allotment.Pane>
                  <Allotment.Pane minSize={80}>
                    <div className="h-full bg-cinema-950">
                      <TimelineShell />
                    </div>
                  </Allotment.Pane>
                </Allotment>
              </Allotment.Pane>
              <Allotment.Pane minSize={200} maxSize={380}>
                <div className="h-full bg-cinema-900 border-l border-cinema-border overflow-hidden">
                  <DynamicInspector />
                </div>
              </Allotment.Pane>
            </Allotment>
          </div>
        </div>

        <NewProjectModal />
        <ExportModal />
        <Notification />
      </div>
    );
  }

  // ─── DESKTOP LAYOUT (≥1024px) ───
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-cinema-void text-cinema-text">
      {/* TOP BAR — full width, fixed height */}
      <div className="flex-shrink-0 h-11 border-b border-cinema-border">
        <TopBar />
      </div>

      {/* MAIN BODY below top bar */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR — icon strip */}
        <LeftSidebar />

        {/* SIDE PANEL — contextual content panel */}
        <div className="w-64 flex-shrink-0 border-r border-cinema-border overflow-hidden flex flex-col bg-cinema-900">
          <SidePanelContent />
        </div>

        {/* CENTER + RIGHT — main editor area */}
        <div className="flex-1 overflow-hidden">
          {/* Horizontal split: Center (preview+timeline) | Right (inspector) */}
          <Allotment defaultSizes={[3, 1]} minSize={200}>
            {/* CENTER — vertical split: Video Preview | Timeline */}
            <Allotment.Pane>
              <Allotment vertical defaultSizes={[3, 2]} minSize={80}>
                {/* Video Preview */}
                <Allotment.Pane minSize={120}>
                  <div className="h-full bg-cinema-950">
                    <VideoPreview />
                  </div>
                </Allotment.Pane>
                {/* Timeline */}
                <Allotment.Pane minSize={80}>
                  <div className="h-full bg-cinema-950">
                    <TimelineShell />
                  </div>
                </Allotment.Pane>
              </Allotment>
            </Allotment.Pane>

            {/* RIGHT — Dynamic Inspector */}
            <Allotment.Pane minSize={220} maxSize={450}>
              <div className="h-full bg-cinema-900 border-l border-cinema-border overflow-hidden">
                <DynamicInspector />
              </div>
            </Allotment.Pane>
          </Allotment>
        </div>
      </div>

      {/* MODALS */}
      <NewProjectModal />
      <ExportModal />
      <AIGenerationQueue isOpen={isAIQueueModalOpen} onClose={() => setAIQueueModalOpen(false)} />
      <AISettingsModal isOpen={isAISettingsModalOpen} onClose={() => setAISettingsModalOpen(false)} />
      <ThumbnailStudioModal isOpen={isThumbnailModalOpen} onClose={() => setThumbnailModalOpen(false)} />
      <ShortsGeneratorModal isOpen={isShortsModalOpen} onClose={() => setShortsModalOpen(false)} />
      <UnifiedProjectStatusModal isOpen={isProjectStatusModalOpen} onClose={() => setProjectStatusModalOpen(false)} />

      {/* TOAST NOTIFICATIONS */}
      <Notification />

    </div>
  );
}

export default App;
