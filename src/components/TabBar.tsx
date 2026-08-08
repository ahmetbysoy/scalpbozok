// BOZOK PRO — TabBar Navigation Component

import React from 'react';
import { useBozok } from '../context/BozokContext';
import { TabKey } from '../types';

export const TabBar: React.FC = () => {
  const { activeTab, setActiveTab, signalsFeed } = useBozok();

  const tabs: { key: TabKey; icon: string; label: string; badge?: number }[] = [
    { key: 'bookView', icon: '📊', label: 'BOOK' },
    { key: 'flowView', icon: '🕯️', label: 'FLOW' },
    { key: 'depthView', icon: '📚', label: 'DEPTH' },
    { key: 'signalsView', icon: '🎯', label: 'SIGNALS', badge: signalsFeed.length },
    { key: 'levelsView', icon: '📍', label: 'LEVELS' },
    { key: 'marketsView', icon: '🌐', label: 'MARKETS' },
    { key: 'backtestView', icon: '📊', label: 'PERF' },
    { key: 'settingsView', icon: '⚙️', label: 'SETTINGS' }
  ];

  return (
    <nav id="tabbar" className="flex bg-[var(--panel)] border-t border-[var(--border)] shrink-0 z-30 h-[64px] pb-[env(safe-area-inset-bottom,0px)] order-3">
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`tab flex-1 py-2 px-1 text-center font-semibold tracking-wide text-[10px] sm:text-[11px] flex flex-col items-center justify-center gap-0.5 relative transition-colors ${isActive ? 'text-[var(--text)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-faint)] border-b-2 border-transparent hover:text-[var(--text-dim)]'}`}
          >
            <span className="ic text-base sm:text-lg leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`badge absolute top-1 right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--signal)] color-black font-extrabold text-[9px] flex items-center justify-center mono ${isActive ? 'hidden' : 'flex'}`}>
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
