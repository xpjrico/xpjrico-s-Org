import React, { useRef, useEffect, useState, useCallback } from 'react';
import { VirtualJoystick, JoystickValue } from './VirtualJoystick';
import { playNotificationChime } from '../lib/focusAudio';

interface Orb {
  x: number;
  y: number;
  radius: number;
  type: 'spark' | 'xp' | 'focus';
  color: string;
  glow: string;
  pulsePhase: number;
  points: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FocusDroneArenaProps {
  isTimerRunning: boolean;
  onCollectReward: (sparks: number, xp: number) => void;
  joystickTheme?: 'neon-purple' | 'cyber-cyan' | 'blaze-orange';
}

export const FocusDroneArena: React.FC<FocusDroneArenaProps> = ({
  isTimerRunning,
  onCollectReward,
  joystickTheme = 'neon-purple',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Drone State
  const droneRef = useRef({
    x: 200,
    y: 150,
    vx: 0,
    vy: 0,
    angle: 0,
    thrust: 0,
    targetVx: 0,
    targetVy: 0,
  });

  const orbsRef = useRef<Orb[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const [collectedCount, setCollectedCount] = useState(0);
  const [lastRewardLabel, setLastRewardLabel] = useState<string | null>(null);

  // Handle Joystick Vector
  const handleJoystickMove = useCallback((val: JoystickValue) => {
    const speed = 4.5;
    droneRef.current.targetVx = val.x * speed;
    droneRef.current.targetVy = val.y * speed;
    if (val.distance > 0.1) {
      droneRef.current.angle = (val.angle * Math.PI) / 180;
      droneRef.current.thrust = val.distance;
    } else {
      droneRef.current.thrust = 0;
    }
  }, []);

  const handleJoystickRelease = useCallback(() => {
    droneRef.current.targetVx = 0;
    droneRef.current.targetVy = 0;
    droneRef.current.thrust = 0;
  }, []);

  // Spawn Orbs
  const spawnOrbs = useCallback((width: number, height: number) => {
    const orbTypes: ('spark' | 'xp' | 'focus')[] = ['spark', 'xp', 'focus', 'spark'];
    const colors = {
      spark: { color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.8)', points: 1 },
      xp: { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.8)', points: 5 },
      focus: { color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.8)', points: 2 },
    };

    while (orbsRef.current.length < 6) {
      const type = orbTypes[Math.floor(Math.random() * orbTypes.length)];
      const conf = colors[type];
      orbsRef.current.push({
        x: 30 + Math.random() * (width - 60),
        y: 30 + Math.random() * (height - 60),
        radius: type === 'xp' ? 12 : 9,
        type,
        color: conf.color,
        glow: conf.glow,
        pulsePhase: Math.random() * Math.PI * 2,
        points: conf.points,
      });
    }
  }, []);

  // Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      if (containerRef.current && canvas) {
        const rect = containerRef.current.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        if (droneRef.current.x === 200 && droneRef.current.y === 150) {
          droneRef.current.x = rect.width / 2;
          droneRef.current.y = rect.height / 2;
        }
        spawnOrbs(rect.width, rect.height);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    resize();

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const w = canvas.width;
      const h = canvas.height;

      // Clear with dark cyber grid
      ctx.fillStyle = '#0a0c16';
      ctx.fillRect(0, 0, w, h);

      // Draw cyber grid
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.07)';
      ctx.lineWidth = 1;
      const gridSize = 32;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Physics update for drone
      const drone = droneRef.current;
      drone.vx += (drone.targetVx - drone.vx) * 8 * dt;
      drone.vy += (drone.targetVy - drone.vy) * 8 * dt;

      drone.x += drone.vx;
      drone.y += drone.vy;

      // Keep within bounds
      drone.x = Math.max(16, Math.min(w - 16, drone.x));
      drone.y = Math.max(16, Math.min(h - 16, drone.y));

      // Spawn drone thruster particles when moving
      if (Math.hypot(drone.vx, drone.vy) > 0.5) {
        for (let i = 0; i < 2; i++) {
          particlesRef.current.push({
            x: drone.x - Math.cos(drone.angle) * 12,
            y: drone.y - Math.sin(drone.angle) * 12,
            vx: -Math.cos(drone.angle) * 2 + (Math.random() - 0.5),
            vy: -Math.sin(drone.angle) * 2 + (Math.random() - 0.5),
            life: 1,
            maxLife: 0.3 + Math.random() * 0.2,
            color: '#a855f7',
            size: 2 + Math.random() * 2,
          });
        }
      }

      // Update & Render Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.life -= dt / p.maxLife;
        p.x += p.vx;
        p.y += p.vy;

        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Render Orbs
      for (let i = orbsRef.current.length - 1; i >= 0; i--) {
        const orb = orbsRef.current[i];
        orb.pulsePhase += dt * 3;
        const pulse = Math.sin(orb.pulsePhase) * 2;
        const currentRadius = orb.radius + pulse;

        // Glow ring
        ctx.shadowColor = orb.glow;
        ctx.shadowBlur = 12;
        ctx.fillStyle = orb.color;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, Math.max(2, currentRadius), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner white shine
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(orb.x - 2, orb.y - 2, currentRadius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Check collision with drone
        const dist = Math.hypot(drone.x - orb.x, drone.y - orb.y);
        if (dist < currentRadius + 14) {
          // Collect!
          const collected = orbsRef.current.splice(i, 1)[0];
          playNotificationChime('spark');

          // Burst particles
          for (let k = 0; k < 12; k++) {
            const angle = (k / 12) * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            particlesRef.current.push({
              x: collected.x,
              y: collected.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1,
              maxLife: 0.5,
              color: collected.color,
              size: 3 + Math.random() * 2,
            });
          }

          setCollectedCount((c) => c + 1);
          let sparkAward = 0;
          let xpAward = 0;

          if (collected.type === 'spark') {
            sparkAward = 1;
            xpAward = 3;
            setLastRewardLabel('+1 Spark & +3 XP');
          } else if (collected.type === 'xp') {
            sparkAward = 1;
            xpAward = 10;
            setLastRewardLabel('+10 Bonus XP!');
          } else {
            sparkAward = 2;
            xpAward = 5;
            setLastRewardLabel('+2 Sparks Focus Surge!');
          }

          onCollectReward(sparkAward, xpAward);
          spawnOrbs(w, h);
        }
      }

      // Draw Drone (Cyber-Spaceship)
      ctx.save();
      ctx.translate(drone.x, drone.y);
      ctx.rotate(drone.angle);

      // Drone Shadow / Glow
      ctx.shadowColor = isTimerRunning ? '#06b6d4' : '#a855f7';
      ctx.shadowBlur = 15;

      // Drone Body (Triangular fighter craft)
      ctx.fillStyle = '#1e1b4b';
      ctx.strokeStyle = isTimerRunning ? '#22d3ee' : '#c084fc';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-12, -9);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-12, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cockpit laser eye
      ctx.fillStyle = isTimerRunning ? '#67e8f9' : '#f472b6';
      ctx.beginPath();
      ctx.arc(2, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Wing glow accents
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, -6);
      ctx.lineTo(-10, -8);
      ctx.moveTo(-6, 6);
      ctx.lineTo(-10, 8);
      ctx.stroke();

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  }, [spawnOrbs, isTimerRunning, onCollectReward]);

  return (
    <div id="focus-joystick-section" className="flex flex-col xl:flex-row items-center gap-4 sm:gap-6 w-full">
      {/* Flight Canvas Arena */}
      <div
        ref={containerRef}
        className="relative w-full h-56 sm:h-64 md:h-72 xl:h-80 rounded-2xl overflow-hidden border border-purple-500/20 shadow-[inset_0_0_25px_rgba(0,0,0,0.8)] bg-zinc-950/80 backdrop-blur-md"
        style={{ touchAction: 'none' }}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Top Info Overlay */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none text-xs gap-2">
          <div className="flex items-center gap-1.5 bg-zinc-900/90 px-2 sm:px-2.5 py-1 rounded-lg border border-white/10 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="font-mono text-zinc-300 text-[10px] sm:text-xs truncate">
              ORBS: <strong className="text-purple-400">{collectedCount}</strong>
            </span>
          </div>

          {lastRewardLabel && (
            <div className="bg-amber-500/20 text-amber-300 font-mono font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-amber-500/30 text-[10px] sm:text-xs animate-bounce truncate">
              {lastRewardLabel}
            </div>
          )}

          <div className="bg-zinc-900/80 px-2 py-1 rounded-lg border border-white/10 text-zinc-400 font-mono hidden md:block text-[11px]">
            JOYSTICK / WASD TO PILOT
          </div>
        </div>

        {/* Bottom hint overlay */}
        <div className="absolute bottom-2 left-2.5 right-2.5 text-[9px] sm:text-[10px] text-zinc-500 font-mono pointer-events-none truncate">
          {isTimerRunning ? '⚡ FOCUS ACTIVE: Collecting bonus XP & Sparks' : '⏸️ START TIMER TO MULTIPLY REWARDS'}
        </div>
      </div>

      {/* Virtual Joystick Controller */}
      <div className="flex flex-col items-center justify-center p-3 bg-zinc-900/60 rounded-2xl border border-white/5 shadow-lg shrink-0">
        <VirtualJoystick
          size={130}
          maxDistance={44}
          theme={joystickTheme}
          label="FOCUS JOYSTICK"
          onMove={handleJoystickMove}
          onRelease={handleJoystickRelease}
        />
      </div>
    </div>
  );
};
