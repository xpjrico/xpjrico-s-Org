import React, { useState, useEffect, useRef } from 'react';
import { FocusDroneArena } from './FocusDroneArena';
import { playNotificationChime, startAmbientSound, stopAmbientSound, setAmbientVolume } from '../lib/focusAudio';
import { useAuth } from '../lib/authContext';
import { StudySession } from '../types';
import { formatDate } from '../lib/gamification';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Sliders,
  CheckCircle,
  Radio,
  Flame,
  Zap,
  Crown,
} from 'lucide-react';

interface FocusViewProps {
  onSessionComplete: (session: StudySession) => void;
  onOpenPayment: () => void;
}

export const FocusView: React.FC<FocusViewProps> = ({ onSessionComplete, onOpenPayment }) => {
  const { user, addXpAndSparks } = useAuth();

  // Timer Configuration State
  const [timerMode, setTimerMode] = useState<'focus' | 'shortBreak' | 'longBreak'>('focus');
  const [customMinutes, setCustomMinutes] = useState(25);
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [subjectTag, setSubjectTag] = useState('General Study');

  // Ambient sound state
  const [ambientType, setAmbientType] = useState<'none' | 'binaural40hz' | 'cyberpulse' | 'whitenoise' | 'lofi'>('none');
  const [ambientVol, setAmbientVol] = useState(0.6);

  // Joystick Theme
  const [joystickTheme, setJoystickTheme] = useState<'neon-purple' | 'cyber-cyan' | 'blaze-orange'>('neon-purple');

  // Session Reward tracking during active focus
  const [liveSessionXp, setLiveSessionXp] = useState(0);
  const [liveSessionSparks, setLiveSessionSparks] = useState(0);

  const initialSecondsRef = useRef(25 * 60);

  // Sync timer duration on mode change
  useEffect(() => {
    let mins = 25;
    if (timerMode === 'focus') mins = customMinutes;
    if (timerMode === 'shortBreak') mins = 5;
    if (timerMode === 'longBreak') mins = 15;

    initialSecondsRef.current = mins * 60;
    setSecondsRemaining(mins * 60);
    setIsRunning(false);
    stopAmbientSound();
  }, [timerMode, customMinutes]);

  // Timer Interval
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRunning && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            handleTimerFinish();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, secondsRemaining]);

  const handleTimerFinish = () => {
    setIsRunning(false);
    stopAmbientSound();
    playNotificationChime('complete');

    if (timerMode === 'focus') {
      const minutesSpent = Math.max(1, Math.round(initialSecondsRef.current / 60));
      const multiplier = user?.isPro ? 2 : 1;
      const earnedXp = (minutesSpent * 10 + liveSessionXp) * multiplier;
      const earnedSparks = minutesSpent * 2 + liveSessionSparks;

      const newSession: StudySession = {
        id: `session_${Date.now()}`,
        userId: user?.id || 'guest',
        timestamp: Date.now(),
        date: formatDate(new Date()),
        durationMinutes: minutesSpent,
        tag: subjectTag.trim() || 'Deep Focus',
        xpEarned: earnedXp,
        sparksEarned: earnedSparks,
      };

      onSessionComplete(newSession);
      addXpAndSparks(earnedXp, earnedSparks);
    }
  };

  const toggleTimer = () => {
    if (!isRunning) {
      setIsRunning(true);
      playNotificationChime('start');
      if (ambientType !== 'none') {
        startAmbientSound(ambientType, ambientVol);
      }
    } else {
      setIsRunning(false);
      stopAmbientSound();
    }
  };

  const resetTimer = () => {
    setIsRunning(false);
    stopAmbientSound();
    setSecondsRemaining(initialSecondsRef.current);
    setLiveSessionXp(0);
    setLiveSessionSparks(0);
  };

  const handleAmbientChange = (type: 'none' | 'binaural40hz' | 'cyberpulse' | 'whitenoise' | 'lofi') => {
    setAmbientType(type);
    if (isRunning && type !== 'none') {
      startAmbientSound(type, ambientVol);
    } else if (type === 'none') {
      stopAmbientSound();
    }
  };

  const handleVolumeChange = (vol: number) => {
    setAmbientVol(vol);
    setAmbientVolume(vol);
  };

  const handleDroneReward = (sparks: number, xp: number) => {
    if (isRunning) {
      setLiveSessionSparks((s) => s + sparks);
      setLiveSessionXp((x) => x + xp);
      addXpAndSparks(xp, sparks);
    }
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const progressPercent = ((initialSecondsRef.current - secondsRemaining) / initialSecondsRef.current) * 100;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Flame className="w-6 h-6 animate-pulse" />
            </span>
            Pomodoro Focus Arena & Controls
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Immerse in uninterrupted study flow. Pilot your Cyber-Drone with touch joystick controls to collect focus sparks.
          </p>
        </div>

        {/* Joystick theme selector */}
        <div className="flex items-center gap-2 bg-zinc-900/80 p-1 rounded-xl border border-white/5 text-xs font-mono">
          <span className="text-zinc-400 px-2 text-[10px]">JOYSTICK SKIN:</span>
          <button
            onClick={() => setJoystickTheme('neon-purple')}
            className={`px-2 py-1 rounded-lg transition-all ${
              joystickTheme === 'neon-purple' ? 'bg-purple-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Purple
          </button>
          <button
            onClick={() => setJoystickTheme('cyber-cyan')}
            className={`px-2 py-1 rounded-lg transition-all ${
              joystickTheme === 'cyber-cyan' ? 'bg-cyan-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Cyan
          </button>
          <button
            onClick={() => setJoystickTheme('blaze-orange')}
            className={`px-2 py-1 rounded-lg transition-all ${
              joystickTheme === 'blaze-orange' ? 'bg-orange-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Blaze
          </button>
        </div>
      </div>

      {/* Main Timer Display Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Pomodoro Circular Timer & Controls */}
        <div className="lg:col-span-5 p-6 sm:p-8 rounded-3xl bg-zinc-900/40 border border-white/5 flex flex-col items-center shadow-lg">
          {/* Mode Switcher */}
          <div className="grid grid-cols-3 gap-1 w-full p-1 bg-white/5 rounded-lg border border-white/5 mb-6 text-xs font-semibold">
            <button
              onClick={() => setTimerMode('focus')}
              className={`py-1.5 rounded-md transition-all ${
                timerMode === 'focus'
                  ? 'bg-white/10 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Focus
            </button>
            <button
              onClick={() => setTimerMode('shortBreak')}
              className={`py-1.5 rounded-md transition-all ${
                timerMode === 'shortBreak'
                  ? 'bg-white/10 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Short Break
            </button>
            <button
              onClick={() => setTimerMode('longBreak')}
              className={`py-1.5 rounded-md transition-all ${
                timerMode === 'longBreak'
                  ? 'bg-white/10 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Long Break
            </button>
          </div>

          {/* Glowing Circular Timer Ring */}
          <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center mb-6">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="88"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-zinc-800/80"
              />
              <circle
                cx="100"
                cy="100"
                r="88"
                stroke="url(#timerGradient)"
                strokeWidth="8"
                strokeDasharray={2 * Math.PI * 88}
                strokeDashoffset={2 * Math.PI * 88 * (1 - progressPercent / 100)}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-linear"
              />
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="50%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
            </svg>

            {/* Inner Digits */}
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">
                {isRunning ? '⚡ SESSION IN PROGRESS' : 'READY TO STUDY'}
              </span>
            </div>
          </div>

          {/* Quick Custom Time presets for Focus */}
          {timerMode === 'focus' && !isRunning && (
            <div className="flex items-center gap-2 mb-6 text-xs font-mono">
              <span className="text-zinc-500 text-[10px]">TIME:</span>
              {[15, 25, 45, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => setCustomMinutes(m)}
                  className={`px-2.5 py-1 rounded-md border transition-all ${
                    customMinutes === m
                      ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 font-bold'
                      : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          )}

          {/* Subject Tag input */}
          <div className="w-full mb-6">
            <input
              type="text"
              value={subjectTag}
              disabled={isRunning}
              onChange={(e) => setSubjectTag(e.target.value)}
              placeholder="Topic / Course (e.g. Advanced Calculus)"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-center font-mono"
            />
          </div>

          {/* Main Action Buttons */}
          <div className="flex items-center gap-4 w-full">
            <button
              onClick={toggleTimer}
              className={`flex-1 py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
                isRunning
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-orange-400 border border-orange-500/30'
                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-orange-500 hover:opacity-90 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)]'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4" /> Pause Focus
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" /> Start Focus Session
                </>
              )}
            </button>

            <button
              onClick={resetTimer}
              title="Reset Timer"
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Virtual Joystick Arena + Web Audio Synthesizer */}
        <div className="lg:col-span-7 space-y-6">
          {/* Cyber-Drone Interactive Focus Space with Virtual Joystick */}
          <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-400 animate-pulse" />
                Virtual Joystick Focus Arena
              </h3>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-indigo-300">+{liveSessionXp} XP</span>
                <span className="text-zinc-600">•</span>
                <span className="text-orange-400">+{liveSessionSparks} Sparks</span>
              </div>
            </div>

            {/* Drone Arena with touch-action: none & pointer capture */}
            <FocusDroneArena
              isTimerRunning={isRunning}
              onCollectReward={handleDroneReward}
              joystickTheme={joystickTheme}
            />
          </div>

          {/* Ambient Sound Synthesizer Engine */}
          <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                Web Audio Ambient Synthesizer
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                Cognitive Audio Generator
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4 text-xs font-mono">
              {[
                { id: 'none', label: 'Mute' },
                { id: 'binaural40hz', label: '40Hz Gamma' },
                { id: 'cyberpulse', label: 'Cyber Synth' },
                { id: 'lofi', label: 'Lo-Fi Brown' },
                { id: 'whitenoise', label: 'White Noise' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleAmbientChange(s.id as any)}
                  className={`py-2 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    ambientType === s.id
                      ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 font-bold'
                      : 'bg-zinc-900/80 border-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-3">
              <VolumeX className="w-4 h-4 text-zinc-500" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={ambientVol}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-indigo-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <Volume2 className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-mono text-zinc-400 w-10 text-right">{Math.round(ambientVol * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
