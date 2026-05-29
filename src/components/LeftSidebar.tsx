import { useState } from 'react';
import { 
  History, 
  HelpCircle, 
  ChevronLeft, 
  ChevronRight, 
  Sliders, 
  Clock, 
  Keyboard 
} from 'lucide-react';
import Equalizer10Band from './Equalizer10Band';

export interface HistoryRecord {
  id: string;
  name: string;
  format: string;
  timestamp: string;
  sampleRate: number;
}

interface LeftSidebarProps {
  eqValues: number[];
  isEqBypassed: boolean;
  onEqBypassToggle: () => void;
  onEqReset: () => void;
  onEqChange: (value: number, index: number) => void;
  eqPresetName: string;
  onEqPresetSelect: (name: string) => void;
  history: HistoryRecord[];
  onClearHistory: () => void;
}

export default function LeftSidebar({
  eqValues,
  isEqBypassed,
  onEqBypassToggle,
  onEqReset,
  onEqChange,
  eqPresetName,
  onEqPresetSelect,
  history,
  onClearHistory,
}: LeftSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'eq' | 'history' | 'help'>('eq');

  const tabs = [
    { id: 'eq' as const, label: '10-Band EQ', icon: Sliders },
    { id: 'history' as const, label: 'Mastering Logs', icon: History },
    { id: 'help' as const, label: 'Help Center', icon: HelpCircle },
  ];

  return (
    <div 
      className={`h-full bg-zinc-900 border-r border-zinc-800 flex flex-row shrink-0 select-none relative transition-all duration-300 ${
        isOpen ? 'w-[300px]' : 'w-16'
      }`}
    >
      {/* 1. Slim Nav strip (always visible) */}
      <div className="w-16 flex flex-col justify-between items-center py-4 bg-zinc-950/50 h-full border-r border-zinc-800/40 shrink-0">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo badge inside sidebar */}
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-bold text-sm shadow-[0_0_10px_rgba(245,158,11,0.4)]">
            SM
          </div>

          {/* Navigation tab icon-buttons */}
          <div className="flex flex-col gap-3 w-full px-2 mt-4">
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id && isOpen;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setIsOpen(true);
                  }}
                  className={`w-full py-2.5 rounded-lg flex items-center justify-center transition-all cursor-pointer group/btn relative ${
                    isActive 
                      ? 'text-amber-500 bg-amber-500/10 border border-amber-500/20' 
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 border border-transparent'
                  }`}
                  title={label}
                >
                  <Icon size={18} />
                  
                  {/* Floating tooltip when sidebar is collapsed */}
                  {!isOpen && (
                    <div className="absolute left-16 z-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider bg-zinc-950 text-zinc-200 rounded border border-zinc-800 shadow-md whitespace-nowrap opacity-0 pointer-events-none group-hover/btn:opacity-100 transition-opacity duration-150">
                      {label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Retractable Double Chevron Collapse toggle button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-md focus:outline-none"
        >
          {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* 2. Expanded Detail Panel */}
      {isOpen && (
        <div className="flex-1 flex flex-col h-full overflow-hidden p-4">
          {/* Tab Header title */}
          <div className="border-b border-zinc-800 pb-3 mb-4 shrink-0 flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400">
              {activeTab === 'eq' && '10-Band Graphic EQ'}
              {activeTab === 'history' && 'Mastering Logs'}
              {activeTab === 'help' && 'Console Help'}
            </span>
            {activeTab === 'history' && history.length > 0 && (
              <button 
                onClick={onClearHistory}
                className="text-[9px] font-extrabold text-red-400/80 hover:text-red-400 uppercase tracking-tighter cursor-pointer hover:underline"
              >
                Clear Logs
              </button>
            )}
          </div>

          {/* Dynamic Tab Body */}
          <div className="flex-1 overflow-auto pr-1">
            
            {/* TAB A: 10-Band EQ */}
            {activeTab === 'eq' && (
              <div className="h-full flex flex-col">
                <Equalizer10Band
                  values={eqValues}
                  isBypassed={isEqBypassed}
                  onBypassToggle={onEqBypassToggle}
                  onReset={onEqReset}
                  onChange={onEqChange}
                  presetName={eqPresetName}
                  onPresetSelect={onEqPresetSelect}
                  isSidebar={true}
                />
              </div>
            )}

            {/* TAB B: Session logs history */}
            {activeTab === 'history' && (
              <div className="h-full">
                {history.length === 0 ? (
                  <div className="h-[200px] flex flex-col items-center justify-center text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg p-4">
                    <Clock size={20} className="text-zinc-600 mb-1.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">No Logs Available</span>
                    <p className="text-[9px] text-zinc-600 mt-1 leading-normal">Your exported tracks will appear here in real-time.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map(item => (
                      <div key={item.id} className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-lg flex flex-col relative">
                        <span className="text-xs font-bold text-zinc-200 truncate pr-4">{item.name}</span>
                        <div className="flex justify-between items-center mt-2 border-t border-zinc-900/50 pt-2 text-[9px] text-zinc-500 font-mono">
                          <span>{item.format}</span>
                          <span>{item.sampleRate}Hz</span>
                          <span>{item.timestamp}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB C: Documentation help */}
            {activeTab === 'help' && (
              <div className="space-y-3.5 pb-2 text-[10px] text-zinc-400 leading-normal">
                {/* Dial Controls card */}
                <div className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                    <Sliders size={12} className="text-amber-500" />
                    <span>DIAL KNOB INTERACTION</span>
                  </div>
                  <ul className="list-disc pl-3.5 space-y-1 text-[9px] text-zinc-500">
                    <li><strong className="text-zinc-400">Mouse Drag</strong>: Click and slide mouse vertically to rotate dials.</li>
                    <li><strong className="text-zinc-400">Scroll Wheel</strong>: Hover dial and scroll to adjust values.</li>
                    <li><strong className="text-zinc-400">Double Click</strong>: Instantly resets dial to its safety default.</li>
                  </ul>
                </div>

                {/* Keyboard nav card */}
                <div className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                    <Keyboard size={12} className="text-amber-500" />
                    <span>KEYBOARD NAVIGATION</span>
                  </div>
                  <p className="text-[9px] text-zinc-500 leading-normal">
                    Click a dial knob to instantly select and focus it. A glowing ring will indicate focus:
                  </p>
                  <ul className="list-disc pl-3.5 space-y-1 text-[9px] text-zinc-500">
                    <li><strong className="text-zinc-400">ArrowUp / Right</strong>: Rotate clockwise to increase values.</li>
                    <li><strong className="text-zinc-400">ArrowDown / Left</strong>: Rotate counter-clockwise to decrease.</li>
                    <li><strong className="text-zinc-400">Shift + Arrow</strong>: Activate micro-tuning adjustments.</li>
                  </ul>
                </div>

                {/* Console card */}
                <div className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>SIGNAL FLOW CONTROLS</span>
                  </div>
                  <ul className="list-disc pl-3.5 space-y-1 text-[9px] text-zinc-500">
                    <li><strong className="text-zinc-400">Bypass Power</strong>: Sleek switches to route signals cleanly past selected channels.</li>
                    <li><strong className="text-zinc-400">Fader Ticks</strong>: Visual references to level fader sculpts precisely.</li>
                  </ul>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
