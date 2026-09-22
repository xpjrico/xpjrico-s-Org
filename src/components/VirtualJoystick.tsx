import React, { useRef, useState, useEffect, useCallback } from 'react';

export interface JoystickValue {
  x: number; // -1 to 1
  y: number; // -1 to 1
  angle: number; // in degrees 0-360
  distance: number; // 0 to 1
  active: boolean;
}

interface VirtualJoystickProps {
  size?: number;
  maxDistance?: number;
  deadzone?: number;
  label?: string;
  theme?: 'neon-purple' | 'cyber-cyan' | 'blaze-orange';
  onMove?: (value: JoystickValue) => void;
  onRelease?: () => void;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  size = 140,
  maxDistance = 50,
  deadzone = 0.08,
  label = 'STUDIA JOYSTICK',
  theme = 'neon-purple',
  onMove,
  onRelease,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);

  const themeClasses = {
    'neon-purple': {
      outerRing: 'border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.25)] bg-purple-950/20',
      thumbStick: 'bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-[0_0_15px_rgba(168,85,247,0.8)] border-purple-300',
      activeRing: 'border-purple-400 shadow-[0_0_25px_rgba(168,85,247,0.5)]',
      accentGlow: 'bg-purple-500/10',
      indicator: 'text-purple-400',
    },
    'cyber-cyan': {
      outerRing: 'border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.25)] bg-cyan-950/20',
      thumbStick: 'bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-[0_0_15px_rgba(6,182,212,0.8)] border-cyan-300',
      activeRing: 'border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.5)]',
      accentGlow: 'bg-cyan-500/10',
      indicator: 'text-cyan-400',
    },
    'blaze-orange': {
      outerRing: 'border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.25)] bg-orange-950/20',
      thumbStick: 'bg-gradient-to-tr from-orange-600 to-amber-500 shadow-[0_0_15px_rgba(249,115,22,0.8)] border-orange-300',
      activeRing: 'border-orange-400 shadow-[0_0_25px_rgba(249,115,22,0.5)]',
      accentGlow: 'bg-orange-500/10',
      indicator: 'text-orange-400',
    },
  }[theme];

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Multi-touch isolation: only latch the first pointer touching this joystick
    if (activePointerIdRef.current !== null) return;

    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setIsActive(true);

    processMovement(e.clientX, e.clientY);
  };

  const processMovement = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;

    const rawDistance = Math.hypot(deltaX, deltaY);
    const clampedDistance = Math.min(rawDistance, maxDistance);
    const angleRad = Math.atan2(deltaY, deltaX);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    let normX = 0;
    let normY = 0;
    let normDistance = clampedDistance / maxDistance;

    if (normDistance < deadzone) {
      normDistance = 0;
      normX = 0;
      normY = 0;
    } else {
      normX = (Math.cos(angleRad) * clampedDistance) / maxDistance;
      normY = (Math.sin(angleRad) * clampedDistance) / maxDistance;
    }

    const stickX = Math.cos(angleRad) * clampedDistance;
    const stickY = Math.sin(angleRad) * clampedDistance;

    setPosition({ x: stickX, y: stickY });

    if (onMove) {
      onMove({
        x: Number(normX.toFixed(3)),
        y: Number(normY.toFixed(3)),
        angle: Math.round(angleDeg),
        distance: Number(normDistance.toFixed(3)),
        active: true,
      });
    }
  }, [maxDistance, deadzone, onMove]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    processMovement(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
      }
      activePointerIdRef.current = null;
      setIsActive(false);
      setPosition({ x: 0, y: 0 });

      if (onRelease) {
        onRelease();
      }
      if (onMove) {
        onMove({
          x: 0,
          y: 0,
          angle: 0,
          distance: 0,
          active: false,
        });
      }
    }
  };

  // Keyboard navigation fallback (WASD / Arrows)
  useEffect(() => {
    const activeKeys = new Set<string>();

    const updateFromKeys = () => {
      let kx = 0;
      let ky = 0;
      if (activeKeys.has('ArrowUp') || activeKeys.has('KeyW')) ky -= 1;
      if (activeKeys.has('ArrowDown') || activeKeys.has('KeyS')) ky += 1;
      if (activeKeys.has('ArrowLeft') || activeKeys.has('KeyA')) kx -= 1;
      if (activeKeys.has('ArrowRight') || activeKeys.has('KeyD')) kx += 1;

      if (kx !== 0 || ky !== 0) {
        const mag = Math.hypot(kx, ky);
        const nx = kx / mag;
        const ny = ky / mag;
        const angleRad = Math.atan2(ny, nx);
        let angleDeg = (angleRad * 180) / Math.PI;
        if (angleDeg < 0) angleDeg += 360;

        setPosition({ x: nx * maxDistance, y: ny * maxDistance });
        setIsActive(true);
        if (onMove) {
          onMove({
            x: nx,
            y: ny,
            angle: Math.round(angleDeg),
            distance: 1,
            active: true,
          });
        }
      } else if (activePointerIdRef.current === null) {
        setPosition({ x: 0, y: 0 });
        setIsActive(false);
        if (onRelease) onRelease();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        // Prevent scrolling if focusing joystick area
        if (document.activeElement?.closest('#focus-joystick-section')) {
          e.preventDefault();
        }
        activeKeys.add(e.code);
        updateFromKeys();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (activeKeys.has(e.code)) {
        activeKeys.delete(e.code);
        updateFromKeys();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [maxDistance, onMove, onRelease]);

  const thumbSize = size * 0.36;

  return (
    <div className="flex flex-col items-center select-none gap-2">
      <div
        id="virtual-joystick-pad"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          touchAction: 'none', // Crucial to prevent browser gestures / pull-to-refresh
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        className={`relative rounded-full border-2 transition-colors cursor-crosshair flex items-center justify-center backdrop-blur-md ${
          isActive ? themeClasses.activeRing : themeClasses.outerRing
        }`}
      >
        {/* Crosshair grid lines */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-full h-[1px] bg-white/40" />
          <div className="absolute h-full w-[1px] bg-white/40" />
        </div>

        {/* Direction markers */}
        <span className={`absolute top-1 text-[9px] font-mono font-bold tracking-widest ${themeClasses.indicator}`}>N</span>
        <span className={`absolute bottom-1 text-[9px] font-mono font-bold tracking-widest ${themeClasses.indicator}`}>S</span>
        <span className={`absolute left-1.5 text-[9px] font-mono font-bold tracking-widest ${themeClasses.indicator}`}>W</span>
        <span className={`absolute right-1.5 text-[9px] font-mono font-bold tracking-widest ${themeClasses.indicator}`}>E</span>

        {/* Center resting ring */}
        <div className="w-6 h-6 rounded-full border border-white/10 pointer-events-none" />

        {/* Floating thumbstick */}
        <div
          id="virtual-joystick-thumb"
          style={{
            width: `${thumbSize}px`,
            height: `${thumbSize}px`,
            transform: `translate(${position.x}px, ${position.y}px)`,
            touchAction: 'none',
          }}
          className={`absolute rounded-full border transition-transform duration-75 flex items-center justify-center pointer-events-none ${
            themeClasses.thumbStick
          }`}
        >
          {/* Inner pulsating core */}
          <div className="w-3 h-3 rounded-full bg-white/90 shadow-[0_0_8px_#ffffff] animate-pulse" />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-ping' : 'bg-zinc-600'}`} />
        <span>{label}</span>
      </div>
    </div>
  );
};
