import React, { useState, useEffect, useRef } from 'react';
import {
  Mic2,
  Loader2,
  Play,
  Pause,
  Plus,
  Volume2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useTimelineStore } from '../../stores/useTimelineStore';
import { useUIStore } from '../../stores/useUIStore';
import { api, mediaUrl } from '../../services/api';

const TAMIL_VOICES = [
  { id: 'ta-IN-ValluvarNeural', name: 'Valluvar (Male)', provider: 'Azure', lang: 'Tamil' },
  { id: 'ta-IN-PallaviNeural', name: 'Pallavi (Female)', provider: 'Azure', lang: 'Tamil' },
  { id: 'sarvam-tamil-male', name: 'Chennai Male', provider: 'Sarvam AI', lang: 'Tamil' },
  { id: 'sarvam-tamil-female', name: 'Chennai Female', provider: 'Sarvam AI', lang: 'Tamil' },
  { id: 'en-US-GuyNeural', name: 'Guy (Male EN)', provider: 'Azure', lang: 'English' },
  { id: 'en-US-JennyNeural', name: 'Jenny (Female EN)', provider: 'Azure', lang: 'English' },
];

export const VoiceDubbingPanel: React.FC = () => {
  const { activeProject } = useProjectStore();
  const { timeline, playheadMs, addClipToTrack } = useTimelineStore();
  const { showNotification } = useUIStore();

  const [text, setText] = useState('');
  const [voice, setVoice] = useState('ta-IN-ValluvarNeural');
  const [speed, setSpeed] = useState(1.0);
  const [emotion, setEmotion] = useState('neutral');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneDialogues, setSceneDialogues] = useState<string[]>([]);

  // Audition state
  const [generatedAudio, setGeneratedAudio] = useState<{
    url: string;
    assetId?: string;
    text: string;
    durationSec: number;
  } | null>(null);
  const [isPlayingAudition, setIsPlayingAudition] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Fetch scene dialogue lines from project
  useEffect(() => {
    if (!activeProject) {
      setSceneDialogues([]);
      return;
    }

    const fetchDialogues = async () => {
      try {
        const res = await api.get(`/ai/projects/${activeProject.id}/scenes`);
        const dialogues: string[] = [];
        for (const sc of res.data) {
          if (sc.dialogue_text?.trim()) {
            dialogues.push(sc.dialogue_text.trim());
          }
        }
        setSceneDialogues(Array.from(new Set(dialogues)));
      } catch {
        setSceneDialogues([]);
      }
    };

    fetchDialogues();
  }, [activeProject]);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    if (!activeProject) {
      showNotification('Please open a project to generate voice dubbing', 'warning');
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      // Call verified API endpoint POST /api/v1/ai/voice/tts
      const res = await api.post('/ai/voice/tts', {
        project_id: activeProject.id,
        text: text.trim(),
        voice_id: voice,
        language: voice.startsWith('en-') ? 'en' : 'ta',
        speed,
        pitch: 1.0,
        emotion,
      });

      const jobId = res.data?.id;
      if (jobId) {
        // Poll job until complete or failed
        let attempts = 0;
        let done = false;
        while (attempts < 20 && !done) {
          await new Promise((r) => setTimeout(r, 1000));
          attempts++;
          try {
            const jobRes = await api.get(`/ai/jobs/${jobId}`);
            if (jobRes.data.status === 'completed') {
              done = true;
              const rawUrl = jobRes.data.output_url;
              const resolvedUrl = rawUrl?.startsWith('http') || rawUrl?.startsWith('/')
                ? rawUrl
                : rawUrl ? mediaUrl(rawUrl) : '';
              const assetId = jobRes.data.result_asset_id;
              setGeneratedAudio({
                url: resolvedUrl,
                assetId,
                text: text.trim(),
                durationSec: 4.0,
              });
              showNotification('Voice synthesis complete', 'success');
              break;
            } else if (jobRes.data.status === 'failed') {
              throw new Error(jobRes.data.error_message || 'Voice synthesis failed');
            }
          } catch (pollErr: any) {
            if (pollErr?.response?.data?.detail) {
              throw new Error(pollErr.response.data.detail);
            }
          }
        }
      }
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail ||
        e?.message ||
        'TTS not configured. Add AZURE_SPEECH_KEY or GOOGLE_API_KEY to .env';
      setError(detail);
      showNotification(detail, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleAudition = () => {
    const audio = audioPlayerRef.current;
    if (!audio || !generatedAudio?.url) return;

    if (isPlayingAudition) {
      audio.pause();
      setIsPlayingAudition(false);
    } else {
      audio
        .play()
        .then(() => setIsPlayingAudition(true))
        .catch(() => setIsPlayingAudition(false));
    }
  };

  const handleAddToTimeline = () => {
    if (!timeline?.tracks) {
      showNotification('No active timeline found', 'warning');
      return;
    }

    let targetTrack = timeline.tracks.find(
      (t) =>
        t.track_role === 'dialogue' ||
        t.name.toLowerCase().includes('dialogue') ||
        t.name.startsWith('A1')
    );
    if (!targetTrack) {
      targetTrack = timeline.tracks.find((t) => t.track_type === 'audio');
    }

    if (!targetTrack) {
      showNotification('No audio track available on timeline', 'warning');
      return;
    }

    addClipToTrack(targetTrack.id, {
      name: `Dub: ${text.slice(0, 20)}...`,
      clip_type: 'media',
      duration_ms: Math.round((generatedAudio?.durationSec || 4.0) * 1000),
      start_time_ms: playheadMs,
      volume_db: 0.0,
      fade_in_ms: 50,
      fade_out_ms: 100,
      asset_id: generatedAudio?.assetId,
      metadata_info: {
        url: generatedAudio?.url,
        audio_url: generatedAudio?.url,
        voice_id: voice,
        dialogue: text,
        role: 'dialogue',
      },
    });

    showNotification(`Dialogue clip added to ${targetTrack.name} at playhead`, 'success');
  };

  return (
    <div
      className="flex flex-col h-full bg-cinema-900 p-4 space-y-3.5 overflow-y-auto select-none"
      id="voice-dubbing-panel"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic2 className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">Voice &amp; Dubbing Studio</h2>
          <span className="text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 px-1.5 py-0.5 rounded font-bold">
            Tamil / English
          </span>
        </div>
      </div>

      {/* Voice Selection */}
      <div className="space-y-1.5">
        <label className="block text-[10px] text-cinema-textDim font-semibold uppercase tracking-wider">
          Voice Model
        </label>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="w-full bg-cinema-850 border border-cinema-border rounded px-2.5 py-1.5 text-xs text-cinema-text outline-none focus:border-emerald-600 transition-colors"
        >
          {TAMIL_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.provider} • {v.lang})
            </option>
          ))}
        </select>
      </div>

      {/* Speed & Emotion Controls */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-cinema-textDim font-semibold uppercase tracking-wider mb-1">
            Speed ({speed.toFixed(2)}x)
          </label>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 h-1 bg-cinema-800 rounded cursor-pointer"
          />
        </div>
        <div>
          <label className="block text-[10px] text-cinema-textDim font-semibold uppercase tracking-wider mb-1">
            Tone / Emotion
          </label>
          <select
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            className="w-full bg-cinema-850 border border-cinema-border rounded px-2 py-1 text-xs text-cinema-text outline-none focus:border-emerald-600"
          >
            <option value="neutral">Neutral / Natural</option>
            <option value="dramatic">Dramatic / Intense</option>
            <option value="empathetic">Empathetic / Soft</option>
            <option value="energetic">Energetic / Heroic</option>
          </select>
        </div>
      </div>

      {/* Script / Dialogue Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-[10px] text-cinema-textDim font-semibold uppercase tracking-wider">
            Script / Dialogue Line
          </label>
          {sceneDialogues.length > 0 && (
            <span className="text-[10px] text-cinema-ai">
              {sceneDialogues.length} script lines available
            </span>
          )}
        </div>

        {/* Quick Dialogue Bank Chips */}
        {sceneDialogues.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {sceneDialogues.slice(0, 4).map((line, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setText(line)}
                className="px-2 py-0.5 bg-cinema-850 hover:bg-cinema-800 border border-cinema-border rounded text-[10px] text-cinema-textDim hover:text-white truncate max-w-[150px] font-serif transition-colors flex-shrink-0"
                title={line}
              >
                {line}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="தமிழ் உரையை இங்கு உள்ளிடுங்கள்... (Enter Tamil or English dialogue here)"
          rows={4}
          className="w-full bg-cinema-850 border border-cinema-border rounded-lg p-2.5 text-xs text-cinema-text placeholder:text-cinema-textDim outline-none resize-none focus:border-emerald-600 transition-colors font-serif"
          style={{ userSelect: 'text' }}
        />
      </div>

      {/* Action Buttons */}
      <button
        onClick={handleGenerate}
        disabled={!text.trim() || isGenerating}
        id="generate-voice-btn"
        data-testid="generate-voice-btn"
        className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-950/40"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Synthesizing Dialogue...</span>
          </>
        ) : (
          <>
            <Mic2 className="w-3.5 h-3.5" />
            <span>Generate Voice via TTS</span>
          </>
        )}
      </button>

      {/* Error notice */}
      {error && (
        <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded p-2.5">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Audition & Timeline Placement Card */}
      {generatedAudio && (
        <div
          id="audition-player-card"
          data-testid="audition-player-card"
          className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-lg space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Synthesized Speech Ready</span>
            </div>
            <span className="text-[10px] text-cinema-textDim font-mono">
              ~{generatedAudio.durationSec}s
            </span>
          </div>

          <p className="text-[11px] text-white italic font-serif bg-cinema-900/60 p-2 rounded border border-cinema-border/50">
            "{generatedAudio.text}"
          </p>

          {/* Hidden audio element for playback */}
          {generatedAudio.url && (
            <audio
              ref={audioPlayerRef}
              src={generatedAudio.url}
              onEnded={() => setIsPlayingAudition(false)}
              onError={() => setIsPlayingAudition(false)}
            />
          )}

          {/* Audition Transport & Add to Timeline */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={toggleAudition}
              id="audition-play-btn"
              data-testid="audition-play-btn"
              className="py-1.5 px-3 bg-cinema-850 hover:bg-cinema-800 border border-cinema-border rounded text-xs text-white font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              {isPlayingAudition ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-cinema-ai" />
                  <span>Pause Audition</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Audition Audio</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleAddToTimeline}
              id="add-to-a1-btn"
              data-testid="add-to-a1-btn"
              className="py-1.5 px-3 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Add to Track A1</span>
            </button>
          </div>
        </div>
      )}

      {/* Information Footer */}
      <div className="text-[10px] text-cinema-textDim bg-cinema-850 border border-cinema-border rounded p-3 space-y-1">
        <p className="font-semibold text-cinema-textMuted">Tamil AI Forge Audio Capabilities:</p>
        <p>• Local / Azure Tamil Neural TTS with pitch and speed modulation</p>
        <p>• Orchestrated timeline synchronization with dialogue ducking (-12dB BGM)</p>
        <p>• Direct insertion onto dialogue track A1 with FFmpeg rendering</p>
      </div>
    </div>
  );
};
