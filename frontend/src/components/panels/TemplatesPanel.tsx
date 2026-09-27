import React from 'react';
import { LayoutTemplate } from 'lucide-react';

const TEMPLATES = [
  { name: 'Short Film (3 min)', desc: '3-act structure, 13 tracks, cinematic grade', tags: ['Drama', 'Tamil'] },
  { name: 'Music Video (4 min)', desc: 'Sync-cut timeline, beat markers, fx overlays', tags: ['Music', 'Dance'] },
  { name: 'Documentary Short', desc: 'Interview + B-roll structure, captions preset', tags: ['Non-fiction'] },
  { name: 'Trailer (90 sec)', desc: 'High-impact cuts, crescendo audio, title slams', tags: ['Action'] },
  { name: 'Social Reel (30 sec)', desc: 'Vertical-ready, fast cuts, text animations', tags: ['Social'] },
  { name: 'Wedding Highlight', desc: 'Emotional arc, Tamil music integration', tags: ['Wedding', 'Tamil'] },
];

export const TemplatesPanel: React.FC = () => (
  <div className="flex flex-col h-full bg-cinema-900">
    <div className="flex items-center gap-2 px-3 py-2 border-b border-cinema-border">
      <LayoutTemplate className="w-3.5 h-3.5 text-cinema-ai" />
      <h2 className="text-xs font-bold text-white">Templates</h2>
    </div>
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {TEMPLATES.map(t => (
        <div key={t.name} className="bg-cinema-850 border border-cinema-border rounded-lg p-3 cursor-pointer hover:border-cinema-ai/40 transition-all">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-cinema-text">{t.name}</p>
              <p className="text-[10px] text-cinema-textDim mt-0.5">{t.desc}</p>
            </div>
            <button className="text-[10px] text-cinema-ai hover:text-white flex-shrink-0 transition-colors">Use</button>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {t.tags.map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-cinema-800 border border-cinema-border rounded text-cinema-textDim">{tag}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);
