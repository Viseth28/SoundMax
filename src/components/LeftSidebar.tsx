import { 
  Sliders, 
  Music,
  Brain,
  Settings
} from 'lucide-react';

interface LeftSidebarProps {
  activePanel: 'eq' | 'master' | 'ai';
  onPanelChange: (panel: 'eq' | 'master' | 'ai') => void;
  onOpenSettings: () => void;
  language?: 'en' | 'kh';
}

export default function LeftSidebar({
  activePanel,
  onPanelChange,
  onOpenSettings,
  language = 'en',
}: LeftSidebarProps) {
  const menuItems = [
    { 
      id: 'eq' as const, 
      label: 'EQ', 
      icon: Sliders,
      action: () => onPanelChange('eq'),
      isActive: activePanel === 'eq'
    },
    { 
      id: 'master' as const, 
      label: language === 'kh' ? 'ម៉ាស្ទ័រ' : 'Master', 
      icon: Music,
      action: () => onPanelChange('master'),
      isActive: activePanel === 'master'
    },
    { 
      id: 'ai' as const, 
      label: 'AI Detect', 
      icon: Brain,
      action: () => onPanelChange('ai'),
      isActive: activePanel === 'ai'
    },
  ];

  return (
    <div className="w-20 h-full bg-zinc-950 border-r border-zinc-900 flex flex-col justify-between items-center py-6 shrink-0 select-none">
      <div className="flex flex-col items-center w-full">
        {/* Menu Buttons Stack */}
        <div className="flex flex-col gap-4 w-full px-2">
          {menuItems.map(({ id, label, icon: Icon, action, isActive }) => (
            <button
              key={id}
              onClick={action}
              className={`w-full py-3.5 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer border relative group ${
                isActive 
                  ? 'text-amber-500 bg-amber-500/10 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.05)]' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border-transparent'
              }`}
              title={label}
            >
              <Icon size={20} className="transition-transform group-hover:scale-105" />
              <span className={`text-[9px] font-extrabold uppercase tracking-wider transition-colors ${
                isActive ? 'text-amber-500' : 'text-zinc-500 group-hover:text-zinc-300'
              }`}>
                {label}
              </span>
              
              {/* Active Marker Indicator line on the left boundary */}
              {isActive && (
                <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-amber-500 rounded-r shadow-[0_0_8px_#f59e0b]"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Section: Settings Icon & Clean Footer Accent */}
      <div className="flex flex-col items-center gap-3 w-full shrink-0">
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-500 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all cursor-pointer group"
          title={language === 'kh' ? 'ការកំណត់' : 'Settings'}
        >
          <Settings size={20} className="transition-transform group-hover:rotate-45" />
        </button>
        <div className="text-[8px] font-mono font-bold tracking-widest text-zinc-700 uppercase">
          v2.0
        </div>
      </div>
    </div>
  );
}
