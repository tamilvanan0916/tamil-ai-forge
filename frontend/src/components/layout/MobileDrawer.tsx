import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { SidebarTab } from '../../types';

const NAV_ITEMS: Array<{ id: SidebarTab; label: string; emoji: string }> = [
  { id: 'home', label: 'Home', emoji: '🏠' },
  { id: 'media', label: 'Media', emoji: '🎬' },
  { id: 'ai-generate', label: 'AI Generate', emoji: '✨' },
  { id: 'media-transform', label: 'AI Transform', emoji: '🪄' },
  { id: 'production-studio', label: 'Production Studio', emoji: '🎥' },
  { id: 'story-script', label: 'Story / Script', emoji: '📝' },
  { id: 'characters', label: 'Characters', emoji: '👤' },
  { id: 'scenes', label: 'Scenes', emoji: '🎭' },
  { id: 'storyboard', label: 'Storyboard', emoji: '🖼️' },
  { id: 'edit', label: 'Edit', emoji: '✂️' },
  { id: 'color', label: 'Color', emoji: '🎨' },
  { id: 'vfx', label: 'VFX', emoji: '🌀' },
  { id: 'voice-dubbing', label: 'Voice & Dubbing', emoji: '🎙️' },
  { id: 'music-library', label: 'Music Library', emoji: '🎵' },
  { id: 'sfx', label: 'Sound Effects', emoji: '🔊' },
  { id: 'captions', label: 'Captions', emoji: '💬' },
  { id: 'graphics', label: 'Graphics', emoji: '📐' },
  { id: 'assets', label: 'Assets', emoji: '📁' },
  { id: 'templates', label: 'Templates', emoji: '🗂️' },
  { id: 'my-projects', label: 'My Projects', emoji: '📽️' },
  { id: 'render-queue', label: 'Render Queue', emoji: '⚙️' },
  { id: 'settings', label: 'Settings', emoji: '⚙️' },
];

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ isOpen, onClose }) => {
  const { activeSidebarTab, setActiveSidebarTab } = useUIStore();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-[100] backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed left-0 top-0 bottom-0 w-64 bg-cinema-900 border-r border-cinema-border z-[101] flex flex-col shadow-2xl">
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cinema-border">
          <span className="font-bold text-white text-sm tracking-wide">TAMIL AI FORGE</span>
          <button onClick={onClose} className="p-1 text-cinema-textDim hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSidebarTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSidebarTab(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'bg-cinema-red/20 text-cinema-red border-r-2 border-cinema-red'
                    : 'text-cinema-textMuted hover:bg-cinema-800 hover:text-white'
                }`}
              >
                <span className="text-base w-6 text-center">{item.emoji}</span>
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-cinema-border">
          <p className="text-[10px] text-cinema-textDim text-center">From Words to Cinema.</p>
        </div>
      </div>
    </>
  );
};
