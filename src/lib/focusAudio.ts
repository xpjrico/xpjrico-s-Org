// Web Audio API Synthesizer for Studia Focus Timer

let audioCtx: AudioContext | null = null;
let activeAmbientSource: { stop: () => void } | null = null;
let ambientGainNode: GainNode | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      const AudioContextClass =
        (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) || null;
      if (!AudioContextClass) return null;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (err) {
    console.warn('[Focus Audio] AudioContext not available:', err);
    return null;
  }
}

export function playNotificationChime(type: 'start' | 'complete' | 'levelup' | 'spark') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'start') {
      // High-tech cyber initialization beep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'complete') {
      // Multi-tone victorious finish chime
      const frequencies = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      frequencies.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + index * 0.1);
        gain.gain.setValueAtTime(0.25, now + index * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.1 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + index * 0.1);
        osc.stop(now + index * 0.1 + 0.6);
      });
    } else if (type === 'levelup') {
      // Epic arcade powerup
      const freqs = [330, 392, 494, 587, 659, 784, 988, 1318];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        const startTime = now + idx * 0.06;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.25);
      });
    } else if (type === 'spark') {
      // Coin/Spark reward sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (e) {
    console.warn('Audio playback not permitted or unavailable:', e);
  }
}

export function startAmbientSound(
  type: 'none' | 'binaural40hz' | 'cyberpulse' | 'whitenoise' | 'lofi',
  volume: number = 0.5
) {
  stopAmbientSound();

  if (type === 'none') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    ambientGainNode = ctx.createGain();
    ambientGainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume * 0.3)), ctx.currentTime);
    ambientGainNode.connect(ctx.destination);

    if (type === 'binaural40hz') {
      // Pure 40Hz Gamma frequency difference for cognitive focus
      const carrier = 200; // Base carrier frequency
      const oscLeft = ctx.createOscillator();
      const oscRight = ctx.createOscillator();
      const merger = ctx.createChannelMerger(2);

      oscLeft.frequency.value = carrier;
      oscRight.frequency.value = carrier + 40; // 40Hz gamma beat difference

      oscLeft.connect(merger, 0, 0);
      oscRight.connect(merger, 0, 1);
      merger.connect(ambientGainNode);

      oscLeft.start();
      oscRight.start();

      activeAmbientSource = {
        stop: () => {
          try {
            oscLeft.stop();
            oscRight.stop();
          } catch {}
        },
      };
    } else if (type === 'whitenoise' || type === 'lofi') {
      // Buffer noise generation
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === 'lofi') {
          // Brown/Pink noise filter approximation for relaxing lofi vibe
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 3.5;
        } else {
          data[i] = white * 0.15;
        }
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      // Low pass filter for soft sound
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = type === 'lofi' ? 400 : 1200;

      noise.connect(filter);
      filter.connect(ambientGainNode);
      noise.start();

      activeAmbientSource = {
        stop: () => {
          try {
            noise.stop();
          } catch {}
        },
      };
    } else if (type === 'cyberpulse') {
      // Subtle rhythmic ambient ambient pulsing drone
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.value = 110; // A2 note

      lfo.frequency.value = 0.25; // 4 second rhythmic pulse
      lfoGain.gain.value = 150;
      lfo.connect(filter.frequency);

      filter.type = 'lowpass';
      filter.frequency.value = 350;

      osc.connect(filter);
      filter.connect(ambientGainNode);

      osc.start();
      lfo.start();

      activeAmbientSource = {
        stop: () => {
          try {
            osc.stop();
            lfo.stop();
          } catch {}
        },
      };
    }
  } catch (e) {
    console.warn('Failed to start ambient sound:', e);
  }
}

export function setAmbientVolume(vol: number) {
  if (ambientGainNode && audioCtx) {
    try {
      ambientGainNode.gain.setValueAtTime(Math.max(0, Math.min(1, vol * 0.3)), audioCtx.currentTime);
    } catch {}
  }
}

export function stopAmbientSound() {
  if (activeAmbientSource) {
    try {
      activeAmbientSource.stop();
    } catch {}
    activeAmbientSource = null;
  }
  if (ambientGainNode) {
    try {
      ambientGainNode.disconnect();
    } catch {}
    ambientGainNode = null;
  }
}
