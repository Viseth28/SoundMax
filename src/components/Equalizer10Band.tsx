import { useState, useRef, useEffect } from 'react';
import { RotateCcw, Power, ChevronDown, Music } from 'lucide-react';

export const eq10Presets: Record<string, number[]> = {
  "Flat": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [5, 4, 3, 1.5, 0, 0, 0, 0, 0, 0],
  "Vocal Clarity": [-2, -1, 0, 1, 2, 3, 3, 2, 1, 0],
  "Loudness (Smile)": [4, 3, 1, -1, -2, -2, -1, 1, 3, 4],
  "Mid Scoop": [1, 2, 1, -2, -4, -4, -2, 1, 2, 1],
  "Classic Rock": [3, 2, 1.5, 1, -0.5, -1, 0, 1.5, 2.5, 3],
};

interface Equalizer10BandProps {
  values: number[]; // Array of 10 values (-12 to +12 dB)
  isBypassed: boolean;
  onBypassToggle: () => void;
  onReset: () => void;
  onChange: (value: number, index: number) => void;
  presetName: string;
  onPresetSelect: (name: string) => void;
  isSidebar?: boolean;
  language?: 'en' | 'kh';
}

const getPresetNameTrans = (pName: string, lang: 'en' | 'kh') => {
  const translations = {
    en: {
      "Flat": "Flat",
      "Bass Boost": "Bass Boost",
      "Vocal Clarity": "Vocal Clarity",
      "Loudness (Smile)": "Loudness",
      "Mid Scoop": "Mid Scoop",
      "Classic Rock": "Classic Rock",
      "Custom": "Custom",
      "BYP": "BYP",
      "ON": "ON"
    },
    kh: {
      "Flat": "ធម្មតា",
      "Bass Boost": "បង្កើនបាស",
      "Vocal Clarity": "សំឡេងច្បាស់",
      "Loudness (Smile)": "សំឡេងខ្លាំង",
      "Mid Scoop": "បន្ថយសំឡេងកណ្តាល",
      "Classic Rock": "រ៉ក់ក្លាសិក",
      "Custom": "ផ្ទាល់ខ្លួន",
      "BYP": "រំលង",
      "ON": "បើក"
    }
  };
  return translations[lang][pName as keyof typeof translations['en']] || pName;
};

export default function Equalizer10Band({
  values,
  isBypassed,
  onBypassToggle,
  onReset,
  onChange,
  presetName,
  onPresetSelect,
  isSidebar = false,
  language = 'en',
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResetClick = () => {
    setIsSpinning(true);
    onReset();
    setTimeout(() => setIsSpinning(false), 500);
  };

  return (
    <div className={`flex-grow flex flex-col select-none ${
      isSidebar 
        ? 'w-full h-full' 
        : 'bg-zinc-900 rounded-xl border border-zinc-800 p-3 sm:p-5 shadow-[inset_0_2px_20px_rgba(0,0,0,0.2)] group relative min-h-[220px]'
    }`}>
      {/* Header Area */}
      <div className={`flex items-center shrink-0 ${
        isSidebar 
          ? 'justify-between gap-1.5 w-full bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/60 mb-2' 
          : 'justify-between mb-4'
      }`}>
        {!isSidebar && (
          <h2 className="text-sm font-semibold text-zinc-400 tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            {language === 'kh' ? 'អេក្វាឡឺហ្សឺក្រាហ្វិក ១០-ប៊ែន' : '10-BAND GRAPHIC EQUALIZER'}
          </h2>
        )}
        
        {/* Bypass, Preset and Reset Controls */}
        <div className={`flex items-center ${
          isSidebar ? 'justify-between w-full gap-2' : 'gap-2.5'
        }`}>
          {/* Preset Selector Dropdown inside Equalizer Header */}
          <div className="relative flex-1" ref={dropdownRef}>
            <button 
              onClick={() => !isBypassed && setDropdownOpen(!dropdownOpen)}
              disabled={isBypassed}
              className={`flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 text-[10px] font-bold text-zinc-300 rounded px-2.5 py-1 outline-none justify-between transition-all select-none w-full ${
                isBypassed 
                  ? 'opacity-40 cursor-not-allowed border-zinc-900/50' 
                  : 'hover:border-zinc-700 hover:text-white cursor-pointer'
              }`}
            >
              <span className="flex items-center gap-1 truncate">
                <Music size={10} className="text-amber-500 shrink-0" />
                <span className={`truncate ${presetName === "Custom" || presetName === "ផ្ទាល់ខ្លួន" ? "italic text-zinc-500" : "text-zinc-200"}`}>
                  {getPresetNameTrans(presetName, language)}
                </span>
              </span>
              <ChevronDown size={10} className={`text-zinc-500 transition-transform shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {dropdownOpen && !isBypassed && (
              <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-zinc-800 rounded shadow-[0_4px_12px_rgba(0,0,0,0.5)] py-1 z-[100] animate-in fade-in slide-in-from-top-1 duration-100">
                {Object.keys(eq10Presets).map(p => (
                  <button
                    key={p}
                    onClick={() => {
                      onPresetSelect(p);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1 text-[10px] transition-colors flex items-center justify-between ${
                      presetName === p 
                        ? 'bg-amber-500/10 text-amber-400 font-bold' 
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    {getPresetNameTrans(p, language)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button 
            onClick={onBypassToggle}
            className={`flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-1 rounded transition-all cursor-pointer border shrink-0 ${
              isBypassed 
                ? 'bg-zinc-950 border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-500 drop-shadow-[0_0_4px_rgba(245,158,11,0.3)] hover:text-amber-400'
            }`}
            title={isBypassed ? (language === 'kh' ? 'បើកដំណើរការ EQ' : 'Engage 10-Band EQ') : (language === 'kh' ? 'រំលង EQ' : 'Bypass 10-Band EQ')}
          >
            <Power size={11} />
            <span>{isBypassed ? (language === 'kh' ? 'រំលង' : 'BYP') : (language === 'kh' ? 'បើក' : 'ON')}</span>
          </button>

          <button 
            onClick={handleResetClick}
            className={`p-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-all cursor-pointer opacity-80 hover:opacity-100 shrink-0 ${
              isSpinning ? 'animate-spin' : ''
            }`}
            title={language === 'kh' ? 'កំណត់ឡើងវិញទិន្នន័យទាំងអស់' : 'Reset All Faders to 0 dB'}
            style={{ animationDuration: '0.5s' }}
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Main Faders Grid */}
      <div className={`flex-grow flex justify-between items-stretch transition-opacity duration-300 ${
        isSidebar ? 'gap-0.5 mt-2 pb-2' : 'gap-2.5 pb-1'
      } ${
        isBypassed ? 'opacity-35 pointer-events-none' : ''
      }`}>
        
        {/* DB Reference scale lines on the left */}
        <div className={`flex flex-col justify-between text-[8px] font-mono text-zinc-600 select-none border-r border-zinc-800/30 py-4 mr-0.5 ${
          isSidebar ? 'pr-1 text-right min-w-[22px]' : 'pr-1.5'
        }`}>
          <span>{isSidebar ? '+12' : '+12 dB'}</span>
          <span>{isSidebar ? '+6' : '+6 dB'}</span>
          <span>0</span>
          <span>{isSidebar ? '-6' : '-6 dB'}</span>
          <span>{isSidebar ? '-12' : '-12 dB'}</span>
        </div>

        {/* Faders */}
        {frequencies.map(({ label, unit }, idx) => {
          const val = values[idx] ?? 0;
          // Map value -12 to 12 into percentage 0 to 100
          const percent = ((val + 12) / 24) * 100;

          return (
            <div 
              key={idx}
              className="flex-grow flex flex-col items-center relative group/fader"
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
              <div className={`flex-1 relative flex justify-center py-4 cursor-ns-resize ${
                isSidebar ? 'w-3.5' : 'w-6'
              }`}>
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
                  className={`absolute h-2.5 bg-zinc-950 border border-zinc-800 group-hover/fader:border-amber-500/60 rounded shadow-[0_2px_5px_rgba(0,0,0,0.5)] flex items-center justify-center pointer-events-none z-10 transition-all ${
                    isSidebar ? 'w-3.5' : 'w-5'
                  }`}
                  style={{
                    bottom: `calc(${percent}% - 5px)`,
                    boxShadow: hoveredIdx === idx ? '0 0 8px rgba(245, 158, 11, 0.4)' : 'none'
                  }}
                >
                  {/* Metal core notch indicator */}
                  <div className={`h-[2px] rounded ${
                    isSidebar ? 'w-2' : 'w-3.5'
                  } ${
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
