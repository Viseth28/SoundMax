import { 
  Sliders, 
  Music,
  ListMusic,
  Settings
} from 'lucide-react';

interface LeftSidebarProps {
  activePanel: 'eq' | 'master' | 'queue';
  onPanelChange: (panel: 'eq' | 'master' | 'queue') => void;
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
      id: 'queue' as const, 
      label: language === 'kh' ? 'បញ្ជី' : 'Queue', 
      icon: ListMusic,
      action: () => onPanelChange('queue'),
      isActive: activePanel === 'queue',
      className: 'md:hidden'
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 md:relative w-full md:w-20 h-16 md:h-full bg-zinc-950/95 border-t md:border-t-0 md:border-r border-zinc-900 flex flex-row md:flex-col justify-between items-center px-4 md:px-0 py-3 md:py-6 shrink-0 select-none z-50 backdrop-blur-md">
      <div className="flex flex-row md:flex-col items-center w-auto md:w-full flex-1 md:flex-none">
        {/* Menu Buttons Stack */}
        <div className="flex flex-row md:flex-col gap-2 md:gap-4 w-auto md:w-full px-0 md:px-2 flex-1 md:flex-none justify-around md:justify-start">
          {menuItems.map(({ id, label, icon: Icon, action, isActive, className }) => (
            <button
              key={id}
              onClick={action}
              className={`px-3 md:px-0 py-1.5 md:py-3.5 w-20 md:w-full rounded-md md:rounded-lg flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border relative group ${
                isActive 
                  ? 'text-amber-500 bg-amber-500/10 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.05)]' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border-transparent'
              } ${className || ''}`}
              title={label}
            >
              <Icon size={18} className="transition-transform group-hover:scale-105" />
              <span className={`text-[8.5px] md:text-[9px] font-extrabold uppercase tracking-wider transition-colors ${
                isActive ? 'text-amber-500' : 'text-zinc-500 group-hover:text-zinc-300'
              }`}>
                {label}
              </span>
              
              {/* Active Marker Indicator line (Bottom bar on mobile, Left line on desktop) */}
              {isActive && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 md:h-auto md:w-0.5 md:left-0 md:top-1/4 md:bottom-1/4 bg-amber-500 rounded-t md:rounded-r shadow-[0_0_8px_#f59e0b]"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Section: Settings Icon & Clean Footer Accent */}
      <div className="flex flex-row md:flex-col items-center gap-2 md:gap-3 w-auto md:w-full shrink-0 pl-3 md:pl-0">
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 md:w-10 md:h-10 rounded-md md:rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-500 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all cursor-pointer group"
          title={language === 'kh' ? 'ការកំណត់' : 'Settings'}
        >
          <Settings size={18} className="transition-transform group-hover:rotate-45" />
        </button>
        <div className="hidden sm:block text-[8px] font-mono font-bold tracking-widest text-zinc-700 uppercase">
          v2.0
        </div>
      </div>
    </div>
  );
}
