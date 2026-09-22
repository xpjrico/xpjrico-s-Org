import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, Activity, AlertCircle, PhoneCall, PhoneOff, Radio } from 'lucide-react';
import { float32To16BitPCMBase64, base64To16BitPCM, createPcmAudioBuffer } from '../utils/audioStream';

interface LiveVoiceTutorProps {
  currentNotesContext?: string;
  onSaveNote?: (note: any) => void;
}

export const LiveVoiceTutor: React.FC<LiveVoiceTutorProps> = ({ currentNotesContext }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [statusText, setStatusText] = useState('Tap "Start Voice Conversation" to begin');
  const [modelSpeaking, setModelSpeaking] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conversationLog, setConversationLog] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string }>>([
    {
      sender: 'ai',
      text: 'Live API ready. I can hear you in real-time and speak back naturally using Gemini 3.8 Live.',
      time: 'Ready',
    },
  ]);

  // Audio Context references
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  const stopVoiceSession = () => {
    setIsConnecting(false);
    setIsConnected(false);
    setModelSpeaking(false);
    setInputVolume(0);
    setStatusText('Session ended');

    // Stop active audio playbacks
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    });
    activeSourcesRef.current = [];

    // Stop microphone stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Disconnect script processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close audio contexts
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    // Close websocket
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  const startVoiceSession = async () => {
    try {
      setErrorMsg(null);
      setIsConnecting(true);
      setStatusText('Requesting microphone access and connecting to Live API...');

      // 1. Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Setup Audio Contexts (iOS Safari safe fallback)
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      let inputCtx: AudioContext;
      try {
        inputCtx = new AudioCtxClass({ sampleRate: 16000 });
      } catch {
        inputCtx = new AudioCtxClass();
      }
      inputAudioCtxRef.current = inputCtx;

      let outputCtx: AudioContext;
      try {
        outputCtx = new AudioCtxClass({ sampleRate: 24000 });
      } catch {
        outputCtx = new AudioCtxClass();
      }
      outputAudioCtxRef.current = outputCtx;

      if (inputCtx.state === 'suspended') {
        inputCtx.resume().catch(() => {});
      }
      if (outputCtx.state === 'suspended') {
        outputCtx.resume().catch(() => {});
      }
      nextStartTimeRef.current = outputCtx.currentTime;

      // 3. Connect WebSocket to /api/live
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsConnected(true);
        setStatusText('Live connected (gemini-3.8-live) • Listening...');

        // If context notes exist, send as initial prompt
        if (currentNotesContext) {
          ws.send(
            JSON.stringify({
              text: `Hello! I am studying this topic right now: "${currentNotesContext.slice(0, 1500)}". Let's do a live Socratic tutoring session!`,
            })
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.status === 'connected') {
            setStatusText('Connected to gemini-3.8-live • Speak anytime!');
          }

          if (msg.error) {
            setErrorMsg(msg.error);
            setStatusText(`Error: ${msg.error}`);
          }

          // Handle incoming audio from model (24kHz 16-bit PCM)
          if (msg.audio) {
            setModelSpeaking(true);
            setStatusText('Studia is speaking...');
            playAudioChunk(msg.audio);
          }

          // Handle model interruption
          if (msg.interrupted) {
            setStatusText('Interrupted by student • Listening...');
            setModelSpeaking(false);
            // Stop current playback
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
              } catch (e) {}
            });
            activeSourcesRef.current = [];
            if (outputAudioCtxRef.current) {
              nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
            }
          }
        } catch (e) {
          console.error('Error handling live message:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setErrorMsg('Live WebSocket connection encountered an error.');
        setStatusText('Connection error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setStatusText('Disconnected');
      };

      // 4. Hook up microphone capture
      const source = inputCtx.createMediaStreamSource(stream);
      // Using ScriptProcessor with 4096 buffer length
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
          setInputVolume(0);
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate simple volume level for visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setInputVolume(Math.min(100, Math.round(rms * 400)));

        // Convert float32 to base64 16-bit PCM
        const base64PCM = float32To16BitPCMBase64(inputData);
        socketRef.current.send(JSON.stringify({ audio: base64PCM }));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    } catch (err: any) {
      console.error('Error starting live session:', err);
      setIsConnecting(false);
      setIsConnected(false);
      setErrorMsg(err?.message || 'Could not access microphone or initiate Live API.');
      setStatusText('Failed to start');
    }
  };

  const playAudioChunk = (base64Data: string) => {
    if (!outputAudioCtxRef.current) return;
    const ctx = outputAudioCtxRef.current;

    // Resume context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    try {
      const pcm16 = base64To16BitPCM(base64Data);
      const audioBuffer = createPcmAudioBuffer(ctx, pcm16, 24000);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Schedule gapless playback
      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.push(source);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setModelSpeaking(false);
          setStatusText('Listening to student...');
        }
      };
    } catch (err) {
      console.error('Error playing audio chunk:', err);
    }
  };

  const sendTextMessage = (text: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ text }));
    setConversationLog((prev) => [
      ...prev,
      { sender: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ]);
  };

  return (
    <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 flex flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Live Voice Study Companion</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                gemini-3.8-live
              </span>
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            Real-time, bidirectional voice tutoring using the Gemini Live API. Speak questions aloud or listen to step-by-step explanations.
          </p>
        </div>

        {/* Live Call Toggle Button */}
        <div className="flex items-center gap-2">
          {!isConnected ? (
            <button
              onClick={startVoiceSession}
              disabled={isConnecting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              <PhoneCall className="w-4 h-4 animate-bounce" />
              <span>{isConnecting ? 'Connecting...' : 'Start Voice Conversation'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-zinc-800 border-white/10 text-zinc-300 hover:text-white'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-4 h-4 text-amber-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
              </button>

              <button
                onClick={stopVoiceSession}
                className="px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Central Visualizer & Status Area */}
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-zinc-950/60 border border-white/5 relative overflow-hidden">
        {/* Glowing background halo */}
        <div
          className={`absolute w-64 h-64 rounded-full filter blur-3xl transition-all duration-700 pointer-events-none ${
            modelSpeaking
              ? 'bg-cyan-500/20 scale-125'
              : isConnected
              ? 'bg-emerald-500/15 scale-100'
              : 'bg-zinc-800/10 scale-75'
          }`}
        />

        {/* Central Orb / Microphone icon with ripples */}
        <div className="relative mb-6">
          <div
            className={`w-28 h-28 rounded-full flex items-center justify-center border transition-all duration-500 ${
              modelSpeaking
                ? 'bg-cyan-950/50 border-cyan-400 text-cyan-300 shadow-[0_0_40px_rgba(6,182,212,0.4)] scale-110'
                : isConnected
                ? 'bg-emerald-950/50 border-emerald-400 text-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
                : 'bg-zinc-900 border-white/10 text-zinc-500'
            }`}
          >
            {modelSpeaking ? (
              <Volume2 className="w-12 h-12 animate-pulse" />
            ) : isConnected && !isMuted ? (
              <Mic className="w-12 h-12" />
            ) : isMuted ? (
              <MicOff className="w-12 h-12 text-amber-400" />
            ) : (
              <Radio className="w-12 h-12" />
            )}
          </div>

          {/* Animated concentric rings when active */}
          {isConnected && (
            <>
              <div
                className="absolute inset-0 rounded-full border border-emerald-400/30 animate-ping pointer-events-none"
                style={{ animationDuration: '2s' }}
              />
              {modelSpeaking && (
                <div
                  className="absolute -inset-3 rounded-full border border-cyan-400/40 animate-ping pointer-events-none"
                  style={{ animationDuration: '1.4s' }}
                />
              )}
            </>
          )}
        </div>

        {/* Status text */}
        <div className="text-center space-y-1 relative z-10">
          <div className="text-sm font-semibold text-white tracking-wide">{statusText}</div>
          <p className="text-xs text-zinc-400 max-w-md">
            {isConnected
              ? modelSpeaking
                ? 'Studia is explaining. Speak at any moment to pause or ask a follow-up.'
                : isMuted
                ? 'Microphone is muted. Unmute to speak.'
                : 'Listening via 16kHz low-latency stream. Say your question or formula.'
              : 'Click "Start Voice Conversation" to talk directly with your Socratic study mentor.'}
          </p>
        </div>

        {/* Live Audio Level Meter */}
        {isConnected && (
          <div className="mt-6 w-48 space-y-1.5 relative z-10">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span>Mic Input Level</span>
              <span>{inputVolume}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-75 rounded-full"
                style={{ width: `${Math.min(100, inputVolume * 1.5)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Suggested Spoken Prompts */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Suggested Spoken Questions</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            'Explain how kidney nephrons maintain fluid balance using a real-world analogy.',
            'Walk me through the chain rule in calculus step-by-step.',
            'Quiz me on the differences between mitosis and meiosis.',
          ].map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={!isConnected}
              onClick={() => sendTextMessage(prompt)}
              className="p-3 rounded-xl bg-zinc-950/70 hover:bg-zinc-800/80 border border-white/5 hover:border-cyan-500/30 text-left text-xs text-zinc-300 hover:text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex flex-col justify-between"
            >
              <span className="line-clamp-2">{prompt}</span>
              <span className="text-[10px] font-mono text-cyan-400/80 mt-2 flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                <span>Ask Voice Tutor</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
