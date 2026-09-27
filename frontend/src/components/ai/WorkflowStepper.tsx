import React, { useMemo } from 'react';
import {
  CheckCircle2, Circle, AlertCircle, Loader2, Lock,
  ChevronRight, BookOpen, Users, Clapperboard, Film,
  Mic, Music2, Subtitles, Layers, Video, Star,
  Volume2, Sliders,
} from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { SidebarTab } from '../../types';

type StepStatus = 'completed' | 'active' | 'pending' | 'failed' | 'blocked';

interface WorkflowStepDef {
  id: string;
  number: number;
  label: string;
  description: string;
  icon: React.ElementType;
  tab: SidebarTab | null;
  getStatus: (status: any) => StepStatus;
}

interface WorkflowStepperProps {
  productionStatus: any;
  compact?: boolean;
}

const STEPS: WorkflowStepDef[] = [
  {
    id: 'project',
    number: 1,
    label: 'Project Setup',
    description: 'Create project, set title and language',
    icon: Star,
    tab: 'my-projects',
    getStatus: (s) => (s ? 'completed' : 'active'),
  },
  {
    id: 'story',
    number: 2,
    label: 'Story & Script',
    description: 'Write or generate your story and screenplay',
    icon: BookOpen,
    tab: 'story-script',
    getStatus: (s) => {
      if (!s) return 'pending';
      if (s.has_plan || s.stages?.story_analysis?.status === 'completed') return 'completed';
      return 'active';
    },
  },
  {
    id: 'characters',
    number: 3,
    label: 'Characters',
    description: 'Create and lock character designs',
    icon: Users,
    tab: 'characters',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      const chars: any[] = s.character_locks || [];
      if (chars.length > 0 && chars.every((c: any) => c.is_locked)) return 'completed';
      if (chars.length > 0) return 'active';
      return 'pending';
    },
  },
  {
    id: 'storyboard',
    number: 4,
    label: 'Storyboard',
    description: 'Visualize shots and compositions',
    icon: Clapperboard,
    tab: 'storyboard',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.storyboard?.status === 'completed') return 'completed';
      if (s.stages?.script_breakdown?.status === 'completed') return 'active';
      return 'pending';
    },
  },
  {
    id: 'scene_gen',
    number: 5,
    label: 'Scene Generation',
    description: 'AI video generation for all scenes',
    icon: Film,
    tab: 'production-studio',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      const scenes: any[] = s.scenes || [];
      const total = scenes.length;
      if (total === 0) return 'pending';
      const ready = scenes.filter((sc: any) => sc.status === 'READY').length;
      const failed = scenes.filter((sc: any) => sc.status === 'FAILED').length;
      const generating = scenes.filter((sc: any) => sc.status === 'GENERATING' || sc.status === 'QUEUED').length;
      if (ready === total) return 'completed';
      if (failed > 0 && generating === 0 && ready < total) return 'failed';
      if (generating > 0) return 'active';
      return 'pending';
    },
  },
  {
    id: 'dialogue',
    number: 6,
    label: 'Voice & Dialogue',
    description: 'AI voice synthesis for character dialogue',
    icon: Mic,
    tab: 'voice-dubbing',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.dialogue_audio?.status === 'completed') return 'completed';
      if ((s.breakdown?.voice?.ready ?? 0) > 0) return 'active';
      return 'pending';
    },
  },
  {
    id: 'music',
    number: 7,
    label: 'Music Score',
    description: 'Background music and score generation',
    icon: Music2,
    tab: 'music-library',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.music_score?.status === 'completed') return 'completed';
      return 'pending';
    },
  },
  {
    id: 'sfx',
    number: 8,
    label: 'Sound Effects',
    description: 'Ambient audio and SFX layer',
    icon: Volume2,
    tab: 'sfx',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.sfx?.status === 'completed') return 'completed';
      return 'pending';
    },
  },
  {
    id: 'captions',
    number: 9,
    label: 'Subtitles & Captions',
    description: 'Timing-aligned captions in target language',
    icon: Subtitles,
    tab: 'captions',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.captions?.status === 'completed' || s.breakdown?.captions?.ready) return 'completed';
      return 'pending';
    },
  },
  {
    id: 'timeline',
    number: 10,
    label: 'Timeline Assembly',
    description: 'Arrange all clips on the production timeline',
    icon: Layers,
    tab: 'edit',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.timeline_assembly?.status === 'completed') return 'completed';
      if (s.stages?.scene_generation?.status === 'completed') return 'active';
      return 'pending';
    },
  },
  {
    id: 'color',
    number: 11,
    label: 'Color Grading',
    description: 'Apply LUTs and cinematic color correction',
    icon: Sliders,
    tab: 'color',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.timeline_assembly?.status === 'completed') return 'active';
      return 'pending';
    },
  },
  {
    id: 'review',
    number: 12,
    label: 'Cinema Review',
    description: 'Screen the cut in the Cinema Screening Theater',
    icon: Video,
    tab: 'production-studio',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.render?.status === 'completed') return 'completed';
      if (s.stages?.timeline_assembly?.status === 'completed') return 'active';
      return 'pending';
    },
  },
  {
    id: 'render',
    number: 13,
    label: 'Master Render',
    description: 'Full quality render with stems and subtitles',
    icon: Clapperboard,
    tab: 'production-studio',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      const renderStatus: string = s.stages?.render?.status ?? '';
      if (renderStatus === 'completed') return 'completed';
      if (renderStatus === 'failed') return 'failed';
      if (renderStatus === 'processing' || renderStatus === 'queued') return 'active';
      if (s.stages?.timeline_assembly?.status === 'completed') return 'pending';
      return 'blocked';
    },
  },
  {
    id: 'deliver',
    number: 14,
    label: 'Deliverables',
    description: 'Download master MP4, stems, and subtitle files',
    icon: CheckCircle2,
    tab: 'production-studio',
    getStatus: (s) => {
      if (!s?.has_plan) return 'blocked';
      if (s.stages?.render?.status === 'completed') return 'completed';
      return 'blocked';
    },
  },
];

const STATUS_CONFIG: Record<StepStatus, { color: string; bg: string; border: string }> = {
  completed: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-800/50',
  },
  active: {
    color: 'text-cinema-ai',
    bg: 'bg-cinema-ai/10',
    border: 'border-cinema-ai/40',
  },
  failed: {
    color: 'text-red-400',
    bg: 'bg-red-950/30',
    border: 'border-red-800/40',
  },
  pending: {
    color: 'text-cinema-textDim',
    bg: 'bg-cinema-950',
    border: 'border-cinema-border',
  },
  blocked: {
    color: 'text-cinema-textDim/40',
    bg: 'bg-cinema-950/50',
    border: 'border-cinema-border/30',
  },
};

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({ productionStatus, compact = false }) => {
  const { setActiveSidebarTab } = useUIStore();

  const steps = useMemo(() => {
    return STEPS.map((step) => ({
      ...step,
      status: step.getStatus(productionStatus) as StepStatus,
    }));
  }, [productionStatus]);

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const overallPct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="space-y-3">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">Filmmaking Workflow</span>
        <span className="text-[10px] text-cinema-textDim font-mono">{completedCount}/{steps.length} steps</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-cinema-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cinema-ai to-emerald-400 rounded-full transition-all duration-700"
          style={{ width: `${overallPct}%` }}
        />
      </div>

      {/* Steps list */}
      <div className="space-y-1">
        {steps.map((step) => {
          const cfg = STATUS_CONFIG[step.status];
          const Icon = step.icon;
          const isClickable = step.tab !== null && step.status !== 'blocked';

          return (
            <button
              key={step.id}
              disabled={!isClickable}
              onClick={() => {
                if (step.tab && isClickable) {
                  setActiveSidebarTab(step.tab);
                }
              }}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left',
                cfg.bg, cfg.border,
                isClickable ? 'hover:brightness-125 cursor-pointer' : 'cursor-default',
              ].join(' ')}
              title={step.description}
            >
              {/* Step number + status icon */}
              <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border ${cfg.border} ${cfg.bg}`}>
                {step.status === 'completed' ? (
                  <CheckCircle2 className={`w-3.5 h-3.5 ${cfg.color}`} />
                ) : step.status === 'active' ? (
                  <Loader2 className={`w-3.5 h-3.5 ${cfg.color} animate-spin`} />
                ) : step.status === 'failed' ? (
                  <AlertCircle className={`w-3.5 h-3.5 ${cfg.color}`} />
                ) : step.status === 'blocked' ? (
                  <Lock className={`w-2.5 h-2.5 ${cfg.color}`} />
                ) : (
                  <span className={`text-[9px] font-mono ${cfg.color}`}>{step.number}</span>
                )}
              </div>

              {/* Icon + Label */}
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.color}`} />
              <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-medium truncate ${cfg.color}`}>{step.label}</div>
                {!compact && (
                  <div className="text-[9px] text-cinema-textDim/70 truncate">{step.description}</div>
                )}
              </div>

              {/* Navigate arrow */}
              {isClickable && (
                <ChevronRight className={`w-3 h-3 ${cfg.color} flex-shrink-0 opacity-60`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
