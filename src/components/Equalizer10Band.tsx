import { useState } from 'react';
import { RotateCcw, Power } from 'lucide-react';

interface Equalizer10BandProps {
  values: number[]; // Array of 10 values (-12 to +12 dB)
  isBypassed: boolean;
  onBypassToggle: () => void;
  onReset: () => void;
  onChange: (value: number, index: number) => void;
}

export default function Equalizer10Band({
  values,
  isBypassed,
  onBypassToggle,
  onReset,
  onChange,
}: Equalizer10BandProps) {
  const frequencies = [
    { label: '31', unit: 'Hz' },
    { label: '62', unit: 'Hz' },
    { label: '125', unit: 'Hz' },
    { label: '250', unit: 'Hz' },
    { label: '500', unit: 'Hz' },
    { label: '1k', unit: 'Hz' },
    { label: '2k', unit: 'Hz' },
    { label: '4k', unit: 'Hz' },
    { label: '8k', unit: 'Hz' },
    { label: '16k', unit: 'Hz' },
  ];

  const [isSpinning, setIsSpinning] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const handleResetClick = () => {
    setIsSpinning(true);
    onReset();
    setTimeout(() => setIsSpinning(false), 500);
  };

  return (
    <div className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col p-5 shadow-[inset_0_2px_20px_rgba(0,0,0,0.2)] group relative select-none min-h-[220px]">
      {/* Header Area */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-400 tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          10-BAND GRAPHIC EQUALIZER
        </h2>
        
        {/* Bypass and Reset Controls */}
        <div className="flex items-center gap-3">
          <button 
            onClick={onBypassToggle}
            className={`flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-1 rounded transition-all cursor-pointer border ${
              isBypassed 
                ? 'bg-zinc-950 border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-500 drop-shadow-[0_0_4px_rgba(245,158,11,0.3)] hover:text-amber-400'
            }`}
            title={isBypassed ? "Engage 10-Band EQ" : "Bypass 10-Band EQ"}
          >
            <Power size={11} />
            <span>{isBypassed ? 'BYPASSED' : 'ACTIVE'}</span>
          </button>

          <button 
            onClick={handleResetClick}
            className={`p-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-all cursor-pointer opacity-80 hover:opacity-100 ${
              isSpinning ? 'animate-spin' : ''
            }`}
            title="Reset All Faders to 0 dB"
            style={{ animationDuration: '0.5s' }}
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Main Faders Grid */}
      <div className={`flex-1 flex justify-between items-stretch gap-2.5 pb-1 transition-opacity duration-300 ${
        isBypassed ? 'opacity-35 pointer-events-none' : ''
      }`}>
        
        {/* DB Reference scale lines on the left */}
        <div className="flex flex-col justify-between text-[8px] font-mono text-zinc-600 select-none pr-1.5 border-r border-zinc-800/30 py-4 mr-0.5">
          <span>+12 dB</span>
          <span>+6 dB</span>
          <span>0 dB</span>
          <span>-6 dB</span>
          <span>-12 dB</span>
        </div>

        {/* Faders */}
        {frequencies.map(({ label, unit }, idx) => {
          const val = values[idx] ?? 0;
          // Map value -12 to 12 into percentage 0 to 100
          const percent = ((val + 12) / 24) * 100;

          return (
            <div 
              key={idx}
              className="flex-1 flex flex-col items-center relative group/fader"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Dynamic Readout Tooltip on Hover */}
              {hoveredIdx === idx && (
                <div className="absolute -top-7 z-50 px-1.5 py-0.5 text-[9px] font-extrabold font-mono bg-zinc-950 text-amber-400 border border-amber-500/30 rounded shadow-[0_0_8px_rgba(245,158,11,0.3)] pointer-events-none whitespace-nowrap animate-in fade-in slide-in-from-bottom-1 duration-100">
                  {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)} dB
                </div>
              )}

              {/* Fader Track & Thumb Container */}
              <div className="flex-1 w-6 relative flex justify-center py-4 cursor-ns-resize">
                {/* Visual Reference Tic marks */}
                <div className="absolute inset-y-4 w-px bg-zinc-800"></div>

                {/* Vertical slider input (rotated to be vertical) */}
                <input 
                  type="range"
                  min={-12}
                  max={12}
                  step={0.1}
                  value={val}
                  onChange={(e) => onChange(parseFloat(e.target.value), idx)}
                  className="absolute inset-y-4 appearance-none w-1 h-full cursor-ns-resize opacity-0 z-20 orientation-vertical"
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl'
                  }}
                />

                {/* Visual Fader Track Fill (Center to Thumb) */}
                <div 
                  className="absolute w-0.5 bg-zinc-700 pointer-events-none rounded"
                  style={{
                    bottom: '16px',
                    top: '16px'
                  }}
                ></div>
                
                {/* Active Colored Fill Line */}
                <div 
                  className="absolute w-[2px] bg-gradient-to-t from-amber-500 to-yellow-400 pointer-events-none transition-all duration-75"
                  style={{
                    bottom: val >= 0 ? '50%' : `${percent}%`,
                    top: val >= 0 ? `${100 - percent}%` : '50%',
                    boxShadow: '0 0 6px rgba(245, 158, 11, 0.4)'
                  }}
                ></div>

                {/* Fader Thumb Handle (Premium analog console look) */}
                <div 
                  className="absolute w-5 h-2.5 bg-zinc-950 border border-zinc-800 group-hover/fader:border-amber-500/60 rounded shadow-[0_2px_5px_rgba(0,0,0,0.5)] flex items-center justify-center pointer-events-none z-10 transition-all"
                  style={{
                    bottom: `calc(${percent}% - 5px)`,
                    boxShadow: hoveredIdx === idx ? '0 0 8px rgba(245, 158, 11, 0.4)' : 'none'
                  }}
                >
                  {/* Metal core notch indicator */}
                  <div className={`w-3.5 h-[2px] rounded ${
                    hoveredIdx === idx ? 'bg-amber-400' : 'bg-zinc-600'
                  }`}></div>
                </div>
              </div>

              {/* Fader Label */}
              <div className="flex flex-col items-center mt-1 shrink-0">
                <span className="text-[9px] font-extrabold text-zinc-300 font-mono tracking-tighter">
                  {label}
                </span>
                <span className="text-[7px] text-zinc-500 font-semibold leading-none uppercase">
                  {unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
