import React from 'react';
import { Scissors, Info } from 'lucide-react';

export const EditPanel: React.FC = () => (
  <div className="flex flex-col h-full bg-cinema-900 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <Scissors className="w-4 h-4 text-cinema-ai" />
      <h2 className="text-sm font-bold text-white">Edit</h2>
    </div>
    <p className="text-[11px] text-cinema-textDim">Editing tools are available in the Timeline below. Select a clip to view properties in the Inspector panel on the right.</p>
    <div className="space-y-1.5">
      {[
        'Drag clips in the timeline to reposition',
        'Right-click clips for context menu',
        'J/K/L for shuttle play',
        'I / O to set In/Out points',
        'C to razor cut at playhead',
        'V for selection tool, A for trim tool',
        'Ctrl+Z / Ctrl+Shift+Z for Undo/Redo',
        'Ctrl+D to duplicate selection',
      ].map(tip => (
        <div key={tip} className="flex items-start gap-2 text-[11px] text-cinema-textDim">
          <span className="text-cinema-ai mt-0.5">•</span>
          <span>{tip}</span>
        </div>
      ))}
    </div>
    <div className="flex items-start gap-2 p-3 bg-cinema-800/60 border border-cinema-border rounded-lg">
      <Info className="w-4 h-4 text-cinema-ai flex-shrink-0 mt-0.5" />
      <p className="text-[11px] text-cinema-textDim">
        AI editing commands are available via the AI Command Bar at the top.
        Try: "Make scene 2 more cinematic" or "Add cross dissolve transitions".
      </p>
    </div>
  </div>
);
