import { create } from 'zustand';
import { api } from '../services/api';
import { Project, Asset } from '../types';

interface ProjectStore {
  projects: Project[];
  activeProject: Project | null;
  assets: Asset[];
  isLoading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  fetchAssets: () => Promise<void>;
  getAsset: (id: string) => Asset | undefined;
  selectProject: (project: Project) => void;
  createProject: (opts: string | { title: string; description?: string; settings?: Partial<Project['settings']> }, description?: string) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<Project | null>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProject: null,
  assets: [],
  isLoading: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<Project[]>('/projects');
      const projects = res.data;
      set({ projects, isLoading: false });

      // Phase 16: Restore saved active project if available, otherwise default to first project
      if (!get().activeProject && projects.length > 0) {
        const savedProjectId = typeof window !== 'undefined' ? localStorage.getItem('tamil_ai_forge_active_project_id') : null;
        const target = projects.find(p => p.id === savedProjectId) || projects[0];
        set({ activeProject: target });
        try {
          if (typeof window !== 'undefined') localStorage.setItem('tamil_ai_forge_active_project_id', target.id);
        } catch {}
        get().fetchAssets();
      }
    } catch (e: any) {
      set({ error: e.message || 'Failed to fetch projects', isLoading: false });
    }
  },

  fetchAssets: async () => {
    const active = get().activeProject;
    if (!active) return;
    try {
      const res = await api.get<Asset[]>(`/projects/${active.id}/assets`);
      set({ assets: res.data });
    } catch {
      set({ assets: [] });
    }
  },

  getAsset: (id: string) => {
    return get().assets.find((a) => a.id === id);
  },

  selectProject: (project: Project) => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('tamil_ai_forge_active_project_id', project.id);
    } catch {}
    set({ activeProject: project });
    get().fetchAssets();
  },

  createProject: async (opts: string | { title: string; description?: string; settings?: Partial<Project['settings']> }, description?: string) => {
    try {
      let title: string;
      let desc: string | undefined;
      let settings = { width: 1920, height: 1080, fps: 30, sample_rate: 48000, color_space: 'bt709', max_duration_sec: 600 };

      if (typeof opts === 'string') {
        title = opts;
        desc = description;
      } else {
        title = opts.title;
        desc = opts.description;
        if (opts.settings) settings = { ...settings, ...opts.settings };
      }

      const res = await api.post<Project>('/projects', { title, description: desc, settings });
      const newProj = res.data;
      try {
        if (typeof window !== 'undefined') localStorage.setItem('tamil_ai_forge_active_project_id', newProj.id);
      } catch {}
      set((state) => ({
        projects: [newProj, ...state.projects],
        activeProject: newProj,
      }));
      return newProj;
    } catch (e: any) {
      console.error('Failed to create project', e);
      return null;
    }
  },

  updateProject: async (id: string, updates: Partial<Project>) => {
    try {
      const res = await api.patch<Project>(`/projects/${id}`, updates);
      const updated = res.data;
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        activeProject: state.activeProject?.id === id ? updated : state.activeProject,
      }));
    } catch (e) {
      console.error('Failed to update project', e);
    }
  },

  deleteProject: async (id: string) => {
    try {
      await api.delete(`/projects/${id}`);
      set((state) => {
        const remaining = state.projects.filter((p) => p.id !== id);
        const nextActive = state.activeProject?.id === id ? (remaining[0] || null) : state.activeProject;
        try {
          if (typeof window !== 'undefined') {
            if (nextActive) localStorage.setItem('tamil_ai_forge_active_project_id', nextActive.id);
            else localStorage.removeItem('tamil_ai_forge_active_project_id');
          }
        } catch {}
        return {
          projects: remaining,
          activeProject: nextActive,
        };
      });
    } catch (e) {
      console.error('Failed to delete project', e);
    }
  },

  duplicateProject: async (id: string) => {
    try {
      const res = await api.post<Project>(`/projects/${id}/duplicate`);
      const copy = res.data;
      try {
        if (typeof window !== 'undefined') localStorage.setItem('tamil_ai_forge_active_project_id', copy.id);
      } catch {}
      set((state) => ({
        projects: [copy, ...state.projects],
        activeProject: copy,
      }));
      return copy;
    } catch (e) {
      console.error('Failed to duplicate project', e);
      return null;
    }
  },
}));

if (typeof window !== 'undefined') {
  (window as any).__projectStore = useProjectStore;
}

