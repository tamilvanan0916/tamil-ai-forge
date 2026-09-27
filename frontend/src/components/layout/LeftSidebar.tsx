import React from 'react';
import {
  Home,
  Film,
  Sparkles,
  FileText,
  Users,
  Clapperboard,
  LayoutGrid,
  Scissors,
  Palette,
  Wand2,
  Mic2,
  Music2,
  Volume2,
  Subtitles,
  Type,
  Boxes,
  LayoutTemplate,
  FolderHeart,
  ListOrdered,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { SidebarTab } from '../../types';

interface SidebarItem {
  id: SidebarTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'media', label: 'Media', icon: Film },
  { id: 'ai-generate', label: 'AI Generate', icon: Sparkles, tag: 'AI' },
  { id: 'media-transform', label: 'AI Transform', icon: Wand2, tag: 'AI' },
  { id: 'production-studio', label: 'Production Studio', icon: Clapperboard, tag: 'Film' },
  { id: 'story-script', label: 'Story / Script', icon: FileText },
  { id: 'characters', label: 'Characters', icon: Users },
  { id: 'scenes', label: 'Scenes', icon: Clapperboard },
  { id: 'storyboard', label: 'Storyboard', icon: LayoutGrid },
  { id: 'edit', label: 'Edit', icon: Scissors },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'vfx', label: 'VFX / Compositing', icon: Wand2 },
  { id: 'voice-dubbing', label: 'Voice & Dubbing', icon: Mic2, tag: 'Tamil' },
  { id: 'music-library', label: 'Music Library', icon: Music2 },
  { id: 'sfx', label: 'Sound Effects', icon: Volume2 },
  { id: 'captions', label: 'Captions / Subtitles', icon: Subtitles },
  { id: 'graphics', label: 'Graphics / Titles', icon: Type },
  { id: 'assets', label: 'Assets / Elements', icon: Boxes },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'my-projects', label: 'My Projects', icon: FolderHeart },
  { id: 'render-queue', label: 'Render Queue', icon: ListOrdered },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export const LeftSidebar: React.FC = () => {
  const { activeSidebarTab, setActiveSidebarTab } = useUIStore();

  return (
    <aside className="w-16 md:w-56 bg-cinema-900 border-r border-cinema-border flex flex-col justify-between select-none h-full z-30">
      <div className="flex-1 overflow-y-auto py-2">
        <div className="space-y-0.5 px-2">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSidebarTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSidebarTab(item.id)}
                title={item.label}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all group ${
                  isActive
                    ? 'bg-cinema-750 text-white border-l-2 border-cinema-red'
                    : 'text-cinema-textMuted hover:text-white hover:bg-cinema-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 transition-colors ${
                      isActive ? 'text-cinema-red' : 'text-cinema-textDim group-hover:text-white'
                    }`}
                  />
                  <span className="hidden md:inline truncate">{item.label}</span>
                </div>
                {item.tag && (
                  <span
                    className={`hidden md:inline-block text-[9px] font-bold px-1.5 py-0.2 rounded ${
                      item.tag === 'AI'
                        ? 'bg-cinema-ai/20 text-cinema-ai border border-cinema-ai/30'
                        : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                    }`}
                  >
                    {item.tag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
