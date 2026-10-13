import { create } from 'zustand';
import { SidebarTab } from '../types';

export type InspectorTab =
  | 'transform'
  | 'crop'
  | 'video'
  | 'effects'
  | 'color'
  | 'audio'
  | 'text'
  | 'ai';

interface UIStore {
  activeSidebarTab: SidebarTab;
  activeInspectorTab: InspectorTab;
  isExportModalOpen: boolean;
  isRenderQueueModalOpen: boolean;
  isSettingsModalOpen: boolean;
  isNewProjectModalOpen: boolean;
  isProjectStatusModalOpen: boolean;
  isAIQueueModalOpen: boolean;
  isAISettingsModalOpen: boolean;
  isThumbnailModalOpen: boolean;
  isShortsModalOpen: boolean;
  isAIAssistantModalOpen: boolean;
  isAudioStudioOpen: boolean;
  aiCommandPrompt: string;
  isExecutingAICommand: boolean;
  notification: { text: string; type: 'info' | 'success' | 'warning' | 'error' } | null;

  setActiveSidebarTab: (tab: SidebarTab) => void;
  setActiveInspectorTab: (tab: InspectorTab) => void;
  setExportModalOpen: (open: boolean) => void;
  setRenderQueueModalOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setNewProjectModalOpen: (open: boolean) => void;
  setProjectStatusModalOpen: (open: boolean) => void;
  setAIQueueModalOpen: (open: boolean) => void;
  setAISettingsModalOpen: (open: boolean) => void;
  setThumbnailModalOpen: (open: boolean) => void;
  setShortsModalOpen: (open: boolean) => void;
  setAIAssistantModalOpen: (open: boolean) => void;
  setAudioStudioOpen: (open: boolean) => void;
  openAudioStudio: () => void;
  closeAudioStudio: () => void;
  setAICommandPrompt: (prompt: string) => void;
  setExecutingAICommand: (loading: boolean) => void;
  showNotification: (text: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  clearNotification: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeSidebarTab: (typeof window !== 'undefined' ? (localStorage.getItem('tamil_ai_forge_active_sidebar_tab') as SidebarTab) : null) || 'edit',
  activeInspectorTab: 'transform',
  isExportModalOpen: false,
  isRenderQueueModalOpen: false,
  isSettingsModalOpen: false,
  isNewProjectModalOpen: false,
  isProjectStatusModalOpen: false,
  isAIQueueModalOpen: false,
  isAISettingsModalOpen: false,
  isThumbnailModalOpen: false,
  isShortsModalOpen: false,
  isAIAssistantModalOpen: false,
  isAudioStudioOpen: false,
  aiCommandPrompt: '',
  isExecutingAICommand: false,
  notification: null,

  setActiveSidebarTab: (tab: SidebarTab) => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('tamil_ai_forge_active_sidebar_tab', tab);
    } catch {}
    set({ activeSidebarTab: tab });
  },
  setActiveInspectorTab: (tab: InspectorTab) => set({ activeInspectorTab: tab }),
  setExportModalOpen: (open: boolean) => set({ isExportModalOpen: open }),
  setRenderQueueModalOpen: (open: boolean) => set({ isRenderQueueModalOpen: open }),
  setSettingsModalOpen: (open: boolean) => set({ isSettingsModalOpen: open }),
  setNewProjectModalOpen: (open: boolean) => set({ isNewProjectModalOpen: open }),
  setProjectStatusModalOpen: (open: boolean) => set({ isProjectStatusModalOpen: open }),
  setAIQueueModalOpen: (open: boolean) => set({ isAIQueueModalOpen: open }),
  setAISettingsModalOpen: (open: boolean) => set({ isAISettingsModalOpen: open }),
  setThumbnailModalOpen: (open: boolean) => set({ isThumbnailModalOpen: open }),
  setShortsModalOpen: (open: boolean) => set({ isShortsModalOpen: open }),
  setAIAssistantModalOpen: (open: boolean) => set({ isAIAssistantModalOpen: open }),
  setAudioStudioOpen: (open: boolean) => set({ isAudioStudioOpen: open }),
  openAudioStudio: () => set({ isAudioStudioOpen: true }),
  closeAudioStudio: () => set({ isAudioStudioOpen: false }),

  setAICommandPrompt: (prompt: string) => set({ aiCommandPrompt: prompt }),
  setExecutingAICommand: (loading: boolean) => set({ isExecutingAICommand: loading }),
  showNotification: (text: any, type = 'info') => {
    let msg = text;
    if (typeof text !== 'string') {
      if (Array.isArray(text)) {
        msg = text.map(t => typeof t === 'object' && t ? (t.msg || JSON.stringify(t)) : String(t)).join('; ');
      } else if (typeof text === 'object' && text !== null) {
        msg = text.msg || text.message || text.detail || JSON.stringify(text);
      } else {
        msg = String(text || '');
      }
    }
    set({ notification: { text: String(msg), type } });
    setTimeout(() => {
      set({ notification: null });
    }, 4000);
  },
  clearNotification: () => set({ notification: null }),
}));

if (typeof window !== 'undefined') {
  (window as any).__uiStore = useUIStore;
}

