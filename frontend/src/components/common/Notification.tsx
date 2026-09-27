import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

const NOTIFICATION_CONFIG = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-900/90 border-emerald-600/60', text: 'text-emerald-300', iconColor: 'text-emerald-400' },
  error: { icon: AlertCircle, bg: 'bg-red-950/90 border-red-700/60', text: 'text-red-300', iconColor: 'text-red-400' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-950/90 border-amber-700/60', text: 'text-amber-300', iconColor: 'text-amber-400' },
  info: { icon: Info, bg: 'bg-cinema-800/95 border-cinema-ai/40', text: 'text-cinema-text', iconColor: 'text-cinema-ai' },
};

export const Notification: React.FC = () => {
  const { notification, clearNotification } = useUIStore();

  if (!notification) return null;

  const config = NOTIFICATION_CONFIG[notification.type] || NOTIFICATION_CONFIG.info;
  const Icon = config.icon;

  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-2xl max-w-sm ${config.bg}`}>
        <Icon className={`w-4 h-4 flex-shrink-0 ${config.iconColor}`} />
        <p className={`text-sm font-medium ${config.text} flex-1`}>{notification.text}</p>
        <button
          onClick={clearNotification}
          className="p-0.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-cinema-textDim" />
        </button>
      </div>
    </div>
  );
};
