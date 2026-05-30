import React, { useRef, useState } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  color?: 'cyan' | 'purple' | 'orange' | 'slate' | 'emerald' | 'gold' | 'rose';
  onChange: (value: number) => void;
}

export default function Knob({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  unit = '',
  color = 'cyan',
  onChange,
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);

  // Colors mapping for SVG styles
  const colorMap = {
    cyan: {
      glow: 'rgba(0, 245, 255, 0.4)',
      stroke: '#00f5ff',
      track: '#102025',
    },
    purple: {
      glow: 'rgba(189, 0, 255, 0.4)',
      stroke: '#bd00ff',
      track: '#1b1028',
    },
    orange: {
      glow: 'rgba(255, 107, 0, 0.4)',
      stroke: '#ff6b00',
      track: '#251610',
    },
    slate: {
      glow: 'rgba(148, 163, 184, 0.2)',
      stroke: '#94a3b8',
      track: '#1e293b',
    },
    emerald: {
      glow: 'rgba(0, 230, 118, 0.4)',
      stroke: '#00e676',
      track: '#0c2615',
    },
    gold: {
      glow: 'rgba(255, 170, 0, 0.4)',
      stroke: '#ffaa00',
      track: '#251d08',
    },
    rose: {
      glow: 'rgba(255, 0, 85, 0.4)',
      stroke: '#ff0055',
      track: '#250d12',
    },
  };

  const selectedColor = colorMap[color];

  // Map value to angle (-135deg to 135deg)
  const range = max - min;
  const percentage = (value - min) / range;
  const startAngle = -135;
  const endAngle = 135;
  const angleRange = endAngle - startAngle;
  const angle = startAngle + percentage * angleRange;

  // Handle drag vertical movements
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    knobRef.current?.focus();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartValue.current = value;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    knobRef.current?.focus();
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
    dragStartValue.current = value;

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  const handleMouseMove = (e: MouseEvent) => {
    const deltaY = dragStartY.current - e.clientY; // drag up increases
    // scale sensitivity (pixels to cover full range)
    const sensitivity = 150;
    const valueDelta = (deltaY / sensitivity) * range;
    let newValue = dragStartValue.current + valueDelta;

    // Apply step and clamp bounds
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(min, Math.min(max, newValue));

    // Round to 2 decimal places to avoid floating point anomalies
    newValue = parseFloat(newValue.toFixed(2));
    onChange(newValue);
  };

  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault(); // prevent bounce scrolling
    const deltaY = dragStartY.current - e.touches[0].clientY;
    const sensitivity = 150;
    const valueDelta = (deltaY / sensitivity) * range;
    let newValue = dragStartValue.current + valueDelta;

    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(min, Math.min(max, newValue));
    newValue = parseFloat(newValue.toFixed(2));
    onChange(newValue);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  };

  // Scroll wheel adjustments
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    // Multiplier for fine-grained changes
    const multiplier = e.shiftKey ? 0.1 : 1;
    let newValue = value + direction * step * multiplier;
    newValue = Math.max(min, Math.min(max, newValue));
    newValue = parseFloat(newValue.toFixed(2));
    onChange(newValue);
  };

  // Reset to default on double-click
  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  // Keyboard adjustments (Arrow keys)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const direction = ['ArrowUp', 'ArrowRight'].includes(e.key) ? 1 : -1;
      // Hold shift for micro-tuning (0.1x of step)
      const multiplier = e.shiftKey ? 0.1 : 1;
      let newValue = value + direction * step * multiplier;
      newValue = Math.max(min, Math.min(max, newValue));
      newValue = parseFloat(newValue.toFixed(2));
      onChange(newValue);
    }
  };

  // SVG calculations for arc path
  const radius = 24;
  const strokeWidth = 3.5;
  const circumference = 2 * Math.PI * radius;
  // Arc only goes from startAngle to endAngle (270 degrees total)
  const arcLength = circumference * (270 / 360);
  const strokeDasharray = `${arcLength} ${circumference}`;
  
  // Calculate offset to draw colored portion of dial
  const strokeDashoffset = arcLength - percentage * arcLength;

  return (
    <div 
      className="relative flex flex-col items-center select-none group w-20 sm:w-24"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover Tooltip */}
      {isHovered && (
        <div 
          className="absolute -top-10 z-50 px-2 py-1 text-[10px] font-bold font-mono rounded border backdrop-blur-md bg-zinc-950/90 text-zinc-100 shadow-[0_4px_12px_rgba(0,0,0,0.5)] pointer-events-none whitespace-nowrap transition-all duration-150 animate-in fade-in slide-in-from-bottom-2"
          style={{ 
            borderColor: selectedColor.stroke, 
            boxShadow: `0 0 8px ${selectedColor.glow}` 
          }}
        >
          {label}: {value > 0 ? '+' : ''}{value}{unit}
        </div>
      )}

      {/* Label */}
      <span className="text-[8.5px] sm:text-[10px] text-zinc-400 font-extrabold tracking-widest uppercase mb-1 transition-all group-hover:text-[#ff6b00] group-hover:scale-105 duration-200">
        {label}
      </span>

      {/* SVG Dial */}
      <div
        ref={knobRef}
        tabIndex={0}
        className="relative w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center cursor-ns-resize transition-all duration-200 group-hover:scale-105 group-hover:drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] rounded-full"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          boxShadow: isFocused ? `0 0 0 1.5px #050608, 0 0 0 3.5px ${selectedColor.stroke}, 0 0 10px ${selectedColor.stroke}` : 'none',
          outline: 'none',
        }}
      >
        <svg className="w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 64 64">
          <defs>
            {/* Soft inner blur shadow */}
            <filter id={`shadow-${color}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Concentric Brushed Aluminum radial cap gradient */}
            <radialGradient id={`center-cap-${color}`} cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#5a6073" />
              <stop offset="30%" stopColor="#2a2e3a" />
              <stop offset="70%" stopColor="#15171e" />
              <stop offset="100%" stopColor="#08090c" />
            </radialGradient>

            {/* Machined Metal Rim gradient */}
            <linearGradient id="metal-rim-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8a92a6" />
              <stop offset="35%" stopColor="#3b404d" />
              <stop offset="75%" stopColor="#1a1c22" />
              <stop offset="100%" stopColor="#090a0d" />
            </linearGradient>
          </defs>

          {/* Outer hardware markings / tech ticks */}
          {Array.from({ length: 9 }).map((_, i) => {
            const tickAngle = startAngle + (i / 8) * angleRange;
            const rad = (tickAngle * Math.PI) / 180;
            const x1 = 32 + 28 * Math.cos(rad);
            const y1 = 32 + 28 * Math.sin(rad);
            const x2 = 32 + 30 * Math.cos(rad);
            const y2 = 32 + 30 * Math.sin(rad);
            const isActiveTick = percentage * 8 >= i;

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isActiveTick ? selectedColor.stroke : 'rgba(255,255,255,0.05)'}
                strokeWidth={isActiveTick ? 1.75 : 1}
                className={`transition-colors duration-150 ${isActiveTick ? '' : 'stroke-tick-inactive'}`}
                style={{
                  filter: isActiveTick ? `drop-shadow(0 0 3px ${selectedColor.stroke})` : 'none',
                }}
              />
            );
          })}

          {/* Base Background Track Circle */}
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="#050608"
            stroke={selectedColor.track}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            className="transform rotate-[225deg] origin-center knob-track-bg"
          />

          {/* Glowing Active Arc */}
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="transparent"
            stroke={selectedColor.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 3px ${selectedColor.stroke})`,
              transition: isDragging ? 'none' : 'stroke-dashoffset 0.15s ease-out',
            }}
            className="transform rotate-[225deg] origin-center"
          />

          {/* Outer metal ring bevel rim */}
          <circle
            cx="32"
            cy="32"
            r="18"
            fill="none"
            stroke="url(#metal-rim-gradient)"
            strokeWidth="1.2"
            className="knob-metal-rim"
          />

          {/* Hardware Knob Center cap (Machined Metal radial gradient) */}
          <circle
            cx="32"
            cy="32"
            r="16.5"
            fill={`url(#center-cap-${color})`}
            stroke="#07080a"
            strokeWidth="1.2"
            className="knob-center-cap"
          />

          {/* Active indicator needle / line (White-hot engraved indicator) */}
          <g
            className="origin-center"
            style={{
              transform: `rotate(${angle}deg)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            <line
              x1="32"
              y1="32"
              x2="46"
              y2="32"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="knob-needle"
              style={{
                filter: isDragging ? `drop-shadow(0 0 3px ${selectedColor.stroke})` : 'drop-shadow(0 0 1px rgba(255,255,255,0.7))',
              }}
            />
            {/* Center core cap rivet */}
            <circle
              cx="32"
              cy="32"
              r="2"
              fill="#5a6073"
            />
          </g>
        </svg>

        {/* Micro Glow inside center cap when active/dragging */}
        <div
          className="absolute w-7 h-7 rounded-full pointer-events-none transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle, ${selectedColor.stroke} 0%, transparent 80%)`,
            opacity: isDragging ? 0.25 : 0,
          }}
        />
      </div>

      {/* Numeric Technical Readout Value */}
      <span className="text-[10px] sm:text-xs font-mono mt-1.5 sm:mt-2 font-bold text-zinc-100 bg-[#050608]/90 border border-zinc-900 px-1.5 sm:px-2 py-0.5 rounded leading-none text-center min-w-[40px] sm:min-w-[48px] shadow-inner group-hover:border-zinc-800 transition-colors">
        {value > 0 ? `+${value}` : value}
        <span className="text-[9px] sm:text-[10px] text-zinc-500 ml-0.5 font-sans font-semibold">{unit}</span>
      </span>
    </div>
  );
}
