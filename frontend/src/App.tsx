import React, { useEffect, useCallback, useState, Suspense, lazy } from 'react';
import { Allotment } from 'allotment';

// Layout
import { TopBar } from './components/layout/TopBar';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { MobileDrawer } from './components/layout/MobileDrawer';

// Preview
import { VideoPreview } from './components/preview/VideoPreview';
import { MonitorContainer } from './components/preview/MonitorContainer';

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
import { AIEditingAssistantModal } from './components/modals/AIEditingAssistantModal';
import { AudioStudioModal } from './components/modals/AudioStudioModal';
import { FourPointEditModal } from './components/modals/FourPointEditModal';
import { TimecodeJumpModal } from './components/modals/TimecodeJumpModal';

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
    isAIAssistantModalOpen, setAIAssistantModalOpen,
    isAudioStudioOpen, setAudioStudioOpen,
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
    (window as any).__selectionStore = useSelectionStore;
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
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase() || '';
    const isEditable = tag === 'input' || tag === 'textarea' || !!target?.isContentEditable;
    if (isEditable) return;
    if (!e.key) return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (e.code === 'Space') {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        st.toggleSourcePlay();
      } else {
        togglePlay();
      }
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
    } else if (ctrl && e.key.toLowerCase() === 'a') {
      const tl = useTimelineStore.getState().timeline;
      if (tl?.tracks) {
        const allIds: string[] = [];
        for (const track of tl.tracks) {
          for (const c of track.clips) {
            allIds.push(c.id);
          }
        }
        if (allIds.length > 0) {
          e.preventDefault();
          useSelectionStore.getState().selectAll(allIds);
          useTimelineStore.getState().selectClip(allIds[0]);
          showNotification(`Selected ${allIds.length} clips`, 'info');
        }
      }
    } else if (ctrl && e.key.toLowerCase() === 'd') {
      const selCount = useSelectionStore.getState().selectedClipIds.size;
      if (selCount > 1) {
        e.preventDefault();
        const newIds = useTimelineStore.getState().duplicateSelectedClips();
        if (newIds) showNotification(`${newIds.length} clips duplicated`, 'info');
      } else if (selectedClipId) {
        e.preventDefault();
        useTimelineStore.getState().duplicateClip(selectedClipId);
        showNotification('Clip duplicated', 'info');
      }
    } else if (ctrl && e.key.toLowerCase() === 'c') {
      const selCount = useSelectionStore.getState().selectedClipIds.size;
      if (selCount > 1) {
        e.preventDefault();
        const ok = useTimelineStore.getState().copySelectedClips();
        if (ok) showNotification(`${selCount} clips copied`, 'info');
      } else if (selectedClipId) {
        e.preventDefault();
        const ok = useTimelineStore.getState().copyClip(selectedClipId);
        if (ok) showNotification('Clip copied', 'info');
      }
    } else if (ctrl && e.key.toLowerCase() === 'v') {
      const multiClips = useTimelineStore.getState().clipboardClips;
      if (multiClips && multiClips.length > 1) {
        e.preventDefault();
        const newIds = useTimelineStore.getState().pasteSelectedClips();
        if (newIds) showNotification(`${newIds.length} clips pasted`, 'info');
      } else if (useTimelineStore.getState().clipboardClip) {
        e.preventDefault();
        const newId = useTimelineStore.getState().pasteClip();
        if (newId) showNotification('Clip pasted', 'info');
      }
    } else if (e.key === 's' || e.key === 'S') {
      if (selectedClipId) {
        e.preventDefault();
        splitClipAtPlayhead(selectedClipId);
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
      const selectedGap = useTimelineStore.getState().selectedGap;
      if (selectedGap) {
        e.preventDefault();
        const ok = useTimelineStore.getState().deleteGap(selectedGap.trackId, selectedGap.startMs, e.shiftKey ? 'all' : 'track');
        if (ok) showNotification(`Gap closed (${e.shiftKey ? 'all tracks' : 'track'})`, 'info');
        return;
      }
      const selCount = useSelectionStore.getState().selectedClipIds.size;
      if (selCount > 1) {
        e.preventDefault();
        if (e.shiftKey) {
          useTimelineStore.getState().rippleDeleteSelectedClips();
          showNotification(`Ripple deleted ${selCount} clips`, 'info');
        } else {
          useTimelineStore.getState().deleteSelectedClips();
          showNotification(`Deleted ${selCount} clips`, 'info');
        }
      } else if (selectedClipId) {
        e.preventDefault();
        if (e.shiftKey) {
          useTimelineStore.getState().rippleDelete(selectedClipId);
          showNotification('Ripple deleted clip', 'info');
        } else {
          deleteClip(selectedClipId);
        }
      }
    } else if ((e.key === 'b' || e.key === 'B') && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const current = useTimelineStore.getState().activeTimelineTool;
      if (current === 'ripple') {
        useTimelineStore.getState().setActiveTimelineTool('select');
        showNotification('Selection Tool (V)', 'info');
      } else {
        useTimelineStore.getState().setActiveTimelineTool('ripple');
        if (!useTimelineStore.getState().rippleEnabled) {
          useTimelineStore.getState().toggleRipple();
        }
        showNotification('Ripple Tool (B)', 'info');
      }
    } else if ((e.key === 'q' || e.key === 'Q') && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        st.toggleMonitorFocus();
        showNotification('Program Monitor focused (Q)', 'info');
      } else {
        if (st.activeTimelineTool === 'ripple' && st.selectedClipId) {
          const ok = st.rippleTrimToPlayhead('head');
          if (ok) {
            showNotification('Ripple Trim Head to Playhead (Q)', 'info');
            return;
          }
        }
        st.toggleMonitorFocus();
        showNotification('Source Monitor focused (Q)', 'info');
      }
    } else if ((e.key === 'w' || e.key === 'W') && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const ok = useTimelineStore.getState().rippleTrimToPlayhead('tail');
      if (ok) {
        showNotification('Ripple Trim Tail to Playhead (W)', 'info');
      }
    } else if ((e.key === 'y' || e.key === 'Y') && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      useTimelineStore.getState().setActiveTimelineTool('slip');
      showNotification('Slip Tool (Y)', 'info');
    } else if ((e.key === 'u' || e.key === 'U') && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      useTimelineStore.getState().setActiveTimelineTool('slide');
      showNotification('Slide Tool (U)', 'info');
    } else if ((e.key === 'v' || e.key === 'V') && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      useTimelineStore.getState().setActiveTimelineTool('select');
      showNotification('Select Tool (V)', 'info');
    } else if ((e.key === 'n' || e.key === 'N') && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      useTimelineStore.getState().setActiveTimelineTool('roll');
      showNotification('Roll Tool (N)', 'info');
    } else if ((e.key === 'c' || e.key === 'C') && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      useTimelineStore.getState().setActiveTimelineTool('razor');
      showNotification('Razor / Blade Tool (C)', 'info');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        st.stepSourceFrame(e.shiftKey ? -10 : -1);
        return;
      }
      if (e.altKey && !ctrl && !e.shiftKey && st.activeTimelineTool === 'roll') {
        const { timeline, selectedClipId, rollEdit } = st;
        if (selectedClipId && timeline) {
          const track = timeline.tracks.find((t) => t.clips.some((c) => c.id === selectedClipId));
          if (track) {
            const clips = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
            const idx = clips.findIndex((c) => c.id === selectedClipId);
            if (idx !== -1 && idx < clips.length - 1 && Math.abs((clips[idx].start_time_ms + clips[idx].duration_ms) - clips[idx + 1].start_time_ms) <= 5) {
              rollEdit(clips[idx].id, clips[idx + 1].id, -100);
            } else if (idx > 0 && Math.abs((clips[idx - 1].start_time_ms + clips[idx - 1].duration_ms) - clips[idx].start_time_ms) <= 5) {
              rollEdit(clips[idx - 1].id, clips[idx].id, -100);
            }
          }
        }
        return;
      }
      const fps = activeProject?.settings?.fps ?? 30;
      const frameMs = 1000 / fps;
      const delta = e.shiftKey ? frameMs * 10 : frameMs;
      st.setPlayhead(
        Math.max(0, st.playheadMs - delta)
      );
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        st.stepSourceFrame(e.shiftKey ? 10 : 1);
        return;
      }
      if (e.altKey && !ctrl && !e.shiftKey && st.activeTimelineTool === 'roll') {
        const { timeline, selectedClipId, rollEdit } = st;
        if (selectedClipId && timeline) {
          const track = timeline.tracks.find((t) => t.clips.some((c) => c.id === selectedClipId));
          if (track) {
            const clips = [...track.clips].sort((a, b) => a.start_time_ms - b.start_time_ms);
            const idx = clips.findIndex((c) => c.id === selectedClipId);
            if (idx !== -1 && idx < clips.length - 1 && Math.abs((clips[idx].start_time_ms + clips[idx].duration_ms) - clips[idx + 1].start_time_ms) <= 5) {
              rollEdit(clips[idx].id, clips[idx + 1].id, 100);
            } else if (idx > 0 && Math.abs((clips[idx - 1].start_time_ms + clips[idx - 1].duration_ms) - clips[idx].start_time_ms) <= 5) {
              rollEdit(clips[idx - 1].id, clips[idx].id, 100);
            }
          }
        }
        return;
      }
      const fps = activeProject?.settings?.fps ?? 30;
      const frameMs = 1000 / fps;
      const delta = e.shiftKey ? frameMs * 10 : frameMs;
      st.setPlayhead(
        st.playheadMs + delta
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (e.shiftKey) {
        st.jumpToPreviousMarker();
        showNotification('Previous marker (Shift+Up)', 'info');
      } else if (!ctrl && !e.altKey) {
        const jumped = st.jumpToPreviousCut();
        if (jumped) showNotification('Previous cut (Up)', 'info');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (e.shiftKey) {
        st.jumpToNextMarker();
        showNotification('Next marker (Shift+Down)', 'info');
      } else if (!ctrl && !e.altKey) {
        const jumped = st.jumpToNextCut();
        if (jumped) showNotification('Next cut (Down)', 'info');
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      useTimelineStore.getState().jumpToSequenceStart();
      showNotification('Start of sequence (Home)', 'info');
    } else if (e.key === 'End') {
      e.preventDefault();
      useTimelineStore.getState().jumpToSequenceEnd();
      showNotification('End of sequence (End)', 'info');
    } else if ((e.key === 'j' || e.key === 'J') && !ctrl && !e.altKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      const rate = e.shiftKey ? st.shuttleSlowReverse() : st.shuttleReverse();
      showNotification(`Shuttle Reverse: ${rate}x (J)`, 'info');
    } else if ((e.key === 'k' || e.key === 'K') && !ctrl && !e.altKey) {
      e.preventDefault();
      useTimelineStore.getState().shuttleStop();
      showNotification('Shuttle Stopped (K)', 'info');
    } else if ((e.key === 'l' || e.key === 'L') && !ctrl && !e.altKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      const rate = e.shiftKey ? st.shuttleSlowForward() : st.shuttleForward();
      showNotification(`Shuttle Forward: ${rate}x (L)`, 'info');
    } else if (!ctrl && !e.altKey && (e.key === 'Z' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      useTimelineStore.getState().zoomToFit();
      showNotification('Zoomed to Fit (Shift+Z)', 'info');
    } else if ((e.key === '=' || e.key === '+') && !e.altKey) {
      e.preventDefault();
      useTimelineStore.getState().zoomAtPlayhead(true);
    } else if ((e.key === '-' || e.key === '_') && !e.altKey && !ctrl) {
      e.preventDefault();
      useTimelineStore.getState().zoomAtPlayhead(false);
    } else if (e.key === 'm' || e.key === 'M') {
      if (!ctrl && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const selId = useTimelineStore.getState().selectedClipId;
        const currentMs = useTimelineStore.getState().playheadMs;
        const tl = useTimelineStore.getState().timeline;
        let addedToClip = false;
        if (selId && tl) {
          for (const tr of tl.tracks) {
            const cl = tr.clips.find((c) => c.id === selId);
            if (cl && currentMs >= cl.start_time_ms && currentMs <= cl.start_time_ms + cl.duration_ms) {
              useTimelineStore.getState().addClipMarker(cl.id);
              showNotification(`Clip marker added at ${Math.round(currentMs)}ms`, 'info');
              addedToClip = true;
              break;
            }
          }
        }
        if (!addedToClip) {
          useTimelineStore.getState().addTimelineMarker(currentMs);
          showNotification(`Timeline marker added at ${Math.round(currentMs)}ms`, 'info');
        }
      } else if (e.shiftKey && !ctrl && !e.altKey) {
        e.preventDefault();
        useTimelineStore.getState().goToNextMarker();
        showNotification('Next marker', 'info');
      } else if (e.altKey && !ctrl && !e.shiftKey) {
        e.preventDefault();
        useTimelineStore.getState().goToPrevMarker();
        showNotification('Previous marker', 'info');
      }
    } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      const okGroup = useTimelineStore.getState().ungroupSelectedClips();
      if (okGroup) {
        showNotification('Clips ungrouped', 'info');
      } else {
        const okCompound = useTimelineStore.getState().ungroupCompoundClip();
        if (okCompound) showNotification('Compound clip ungrouped', 'info');
      }
    } else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      const selIds = useSelectionStore.getState().selectedClipIds;
      if (selIds.size >= 2) {
        const groupId = useTimelineStore.getState().groupSelectedClips();
        if (groupId) {
          showNotification('Clips grouped', 'success');
        } else {
          const newId = useTimelineStore.getState().createCompoundClip();
          if (newId) showNotification('Compound clip created', 'success');
        }
      } else {
        useTimelineStore.getState().setTimecodeModalOpen(true);
      }
    } else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      const selIds = useSelectionStore.getState().selectedClipIds;
      const tl = useTimelineStore.getState().timeline;
      let hasLinked = false;
      if (tl) {
        for (const t of tl.tracks) {
          for (const c of t.clips) {
            if (selIds.has(c.id) && c.linked_clip_id) {
              hasLinked = true;
              break;
            }
          }
        }
      }
      if (hasLinked) {
        const ok = useTimelineStore.getState().unlinkSelectedClips();
        if (ok) showNotification('Clips unlinked', 'info');
      } else if (selIds.size === 2) {
        const ok = useTimelineStore.getState().linkSelectedClips();
        if (ok) showNotification('Clips linked', 'success');
      }
    } else if ((e.key === 'i' || e.key === 'I') && !ctrl && !e.altKey && e.shiftKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        const sIn = st.sourceInPointMs ?? 0;
        st.setSourcePlayhead(sIn);
        showNotification('Jumped to Source In', 'info');
      } else {
        st.jumpToInPoint();
        showNotification('Jumped to In Point (Shift+I)', 'info');
      }
    } else if ((e.key === 'o' || e.key === 'O') && !ctrl && !e.altKey && e.shiftKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        const sOut = st.sourceOutPointMs ?? (st.sourceAsset?.duration_ms ?? 0);
        st.setSourcePlayhead(sOut);
        showNotification('Jumped to Source Out', 'info');
      } else {
        st.jumpToOutPoint();
        showNotification('Jumped to Out Point (Shift+O)', 'info');
      }
    } else if ((e.key === 'i' || e.key === 'I') && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        st.setSourceInPoint();
        showNotification('Source In marked (I)', 'info');
      } else {
        st.markIn();
        showNotification('Mark In set', 'info');
      }
    } else if ((e.key === 'o' || e.key === 'O') && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        st.setSourceOutPoint();
        showNotification('Source Out marked (O)', 'info');
      } else {
        st.markOut();
        showNotification('Mark Out set', 'info');
      }
    } else if ((e.key === 'x' || e.key === 'X') && !ctrl && e.altKey && !e.shiftKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.activeMonitorFocus === 'source') {
        st.clearSourceInOut();
        showNotification('Source In/Out range cleared', 'info');
      } else {
        st.clearInOut();
        showNotification('In/Out range cleared', 'info');
      }
    } else if ((e.key === 'x' || e.key === 'X') && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const ok = useTimelineStore.getState().markClipRange();
      if (ok) showNotification('Clip range marked', 'info');
    } else if (e.key === ';' && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const ok = useTimelineStore.getState().liftRange();
      if (ok) showNotification('Range lifted', 'info');
    } else if (e.key === "'" && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const ok = useTimelineStore.getState().extractRange();
      if (ok) showNotification('Range extracted', 'info');
    } else if ((e.key === ',' || e.key === '<') && !ctrl && !e.altKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.isTrimPreviewActive) {
        const step = e.shiftKey ? -5 : -1;
        st.nudgeActiveTrim(step);
        showNotification(`Nudge trim: ${step > 0 ? '+' : ''}${step} frames`, 'info');
      } else if (e.key === '<' || (st.selectedClipId && ['roll', 'slip', 'slide', 'ripple'].includes(st.activeTimelineTool))) {
        const step = e.shiftKey ? -5 : -1;
        st.nudgeActiveTrim(step);
        showNotification(`Nudge trim: ${step > 0 ? '+' : ''}${step} frames`, 'info');
      } else if (st.activeMonitorFocus === 'source' && st.sourceAsset) {
        const res = st.insertFromSource();
        if (res) showNotification('Inserted from Source (,)', 'success');
      } else {
        const res = st.insertEdit();
        if (res) showNotification('Insert edit performed (,) - rippled downstream', 'info');
      }
    } else if ((e.key === '.' || e.key === '>') && !ctrl && !e.altKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      if (st.isTrimPreviewActive) {
        const step = e.shiftKey ? 5 : 1;
        st.nudgeActiveTrim(step);
        showNotification(`Nudge trim: ${step > 0 ? '+' : ''}${step} frames`, 'info');
      } else if (e.key === '>' || (st.selectedClipId && ['roll', 'slip', 'slide', 'ripple'].includes(st.activeTimelineTool))) {
        const step = e.shiftKey ? 5 : 1;
        st.nudgeActiveTrim(step);
        showNotification(`Nudge trim: ${step > 0 ? '+' : ''}${step} frames`, 'info');
      } else if (st.activeMonitorFocus === 'source' && st.sourceAsset) {
        const res = st.overwriteFromSource();
        if (res) showNotification('Overwritten from Source (.)', 'success');
      } else {
        const res = st.overwriteEdit();
        if (res) showNotification('Overwrite edit performed (.)', 'info');
      }
    } else if (e.altKey && !ctrl && (e.key === ',' || e.key === '<')) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      const step = e.shiftKey ? -5 : -1;
      st.nudgeActiveTrim(step);
      showNotification(`Nudge trim: ${step > 0 ? '+' : ''}${step} frames`, 'info');
    } else if (e.altKey && !ctrl && (e.key === '.' || e.key === '>')) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      const step = e.shiftKey ? 5 : 1;
      st.nudgeActiveTrim(step);
      showNotification(`Nudge trim: ${step > 0 ? '+' : ''}${step} frames`, 'info');
    } else if (e.key === 'F11' && e.shiftKey) {
      e.preventDefault();
      const res = useTimelineStore.getState().fitToFillEdit();
      if (res) {
        showNotification('Fit to Fill applied (Shift+F11)', 'success');
      } else {
        showNotification('Fit to Fill failed — select clip or load source asset', 'warning');
      }
    } else if (e.key === 'F11' && !e.shiftKey) {
      e.preventDefault();
      const res = useTimelineStore.getState().replaceEdit();
      if (res) {
        showNotification('Replace edit performed (F11)', 'info');
      } else {
        showNotification('Replace edit failed — select clip or load source asset', 'warning');
      }
    } else if ((e.key === 'r' || e.key === 'R') && !ctrl && !e.altKey && e.shiftKey) {
      e.preventDefault();
      const res = useTimelineStore.getState().replaceEdit();
      if (res) {
        showNotification('Replaced clip from Source Monitor (Shift+R)', 'success');
      } else {
        showNotification('Replace edit failed — select clip or load source asset', 'warning');
      }
    } else if ((e.key === 'f' || e.key === 'F') && !ctrl && e.altKey && e.shiftKey) {
      e.preventDefault();
      const st = useTimelineStore.getState();
      let targetAssetId: string | null = null;
      if (st.activeMonitorFocus === 'source' && st.sourceAsset) {
        targetAssetId = st.sourceAsset.id;
      } else {
        const selId = st.selectedClipId;
        if (selId && st.timeline) {
          const clip = st.timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === selId);
          if (clip?.asset_id) targetAssetId = clip.asset_id;
        } else if (st.timeline) {
          // Playhead clip fallback
          for (const t of st.timeline.tracks) {
            const clip = t.clips.find((c) => st.playheadMs >= c.start_time_ms && st.playheadMs < c.start_time_ms + c.duration_ms);
            if (clip?.asset_id) {
              targetAssetId = clip.asset_id;
              break;
            }
          }
        }
      }
      if (targetAssetId) {
        st.setHighlightedAssetId(targetAssetId);
        showNotification('Revealed in Media Browser (Alt+Shift+F)', 'info');
      } else {
        showNotification('No asset to reveal', 'warning');
      }
    } else if ((e.key === 'f' || e.key === 'F') && !ctrl && !e.altKey && e.shiftKey) {
      e.preventDefault();
      const ok = useTimelineStore.getState().reverseMatchFrame();
      if (ok) {
        showNotification('Reverse Match Frame (Shift+F)', 'info');
      } else {
        showNotification('No matching timeline instance found', 'warning');
      }
    } else if ((e.key === 'f' || e.key === 'F') && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const ok = useTimelineStore.getState().matchFrame();
      if (ok) {
        showNotification('Match Frame (F)', 'info');
      } else {
        showNotification('No clip at playhead to match frame', 'warning');
      }
    } else if (e.key === 'Enter' && useTimelineStore.getState().isTrimPreviewActive) {
      e.preventDefault();
      useTimelineStore.getState().endTrimPreview(true);
      showNotification('Trim committed', 'success');
      return;
    } else if (e.key === 'Escape') {
      const st = useTimelineStore.getState();
      if (st.isTrimPreviewActive) {
        e.preventDefault();
        st.cancelTrimPreview();
        showNotification('Trim cancelled (reverted)', 'info');
        return;
      }
      if (st.breadcrumbStack.length > 0) {
        e.preventDefault();
        st.exitCompoundClip();
        showNotification('Returned to parent timeline', 'info');
        return;
      }
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
              {/* Video & Source Preview */}
              <div className="flex-shrink-0" style={{ height: '45%' }}>
                <MonitorContainer />
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
        <FourPointEditModal />
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
                      <MonitorContainer />
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
        <FourPointEditModal />
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
                {/* Video & Source Preview */}
                <Allotment.Pane minSize={120}>
                  <div className="h-full bg-cinema-950">
                    <MonitorContainer />
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
      <FourPointEditModal />
      <TimecodeJumpModal />
      <AIGenerationQueue isOpen={isAIQueueModalOpen} onClose={() => setAIQueueModalOpen(false)} />
      <AISettingsModal isOpen={isAISettingsModalOpen} onClose={() => setAISettingsModalOpen(false)} />
      <ThumbnailStudioModal isOpen={isThumbnailModalOpen} onClose={() => setThumbnailModalOpen(false)} />
      <ShortsGeneratorModal isOpen={isShortsModalOpen} onClose={() => setShortsModalOpen(false)} />
      <UnifiedProjectStatusModal isOpen={isProjectStatusModalOpen} onClose={() => setProjectStatusModalOpen(false)} />
      <AIEditingAssistantModal isOpen={isAIAssistantModalOpen} onClose={() => setAIAssistantModalOpen(false)} />
      <AudioStudioModal isOpen={isAudioStudioOpen} onClose={() => setAudioStudioOpen(false)} />

      {/* TOAST NOTIFICATIONS */}
      <Notification />

    </div>
  );
}

export default App;
