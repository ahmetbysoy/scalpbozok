// BOZOK PRO — Orderbook & Microstructure Hunter Terminal Root

import React, { useEffect } from 'react';
import { BozokProvider, useBozok } from './context/BozokContext';
import { TopBar } from './components/TopBar';
import { TabBar } from './components/TabBar';
import { BookTab } from './components/tabs/BookTab';
import { FlowTab } from './components/tabs/FlowTab';
import { DepthTab } from './components/tabs/DepthTab';
import { SignalsTab } from './components/tabs/SignalsTab';
import { LevelsTab } from './components/tabs/LevelsTab';
import { MarketsTab } from './components/tabs/MarketsTab';
import { BacktestTab } from './components/tabs/BacktestTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { applyThemeStyle } from './utils/theme';

const MainAppContent: React.FC = () => {
  const { activeTab, setActiveTab, config, updateConfig } = useBozok();

  // Apply visual theme on mount or theme change
  useEffect(() => {
    applyThemeStyle(config.theme);
  }, [config.theme]);

  // Global Keyboard Shortcuts (1-8 keys for Tab switching, M for mute, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing inside inputs or textareas
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      const tabsList = [
        'bookView',
        'flowView',
        'depthView',
        'signalsView',
        'levelsView',
        'marketsView',
        'backtestView',
        'settingsView'
      ] as const;

      if (e.key >= '1' && e.key <= '8') {
        const idx = parseInt(e.key) - 1;
        if (tabsList[idx]) {
          setActiveTab(tabsList[idx]);
        }
      } else if (e.key.toLowerCase() === 'm') {
        updateConfig({ soundOn: !config.soundOn, voiceAnnounce: !config.voiceAnnounce });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, config.soundOn, config.voiceAnnounce, updateConfig]);

  return (
    <div id="app" className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text)] font-sans antialiased">
      <TopBar />

      <main id="main" className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        {activeTab === 'bookView' && <BookTab />}
        {activeTab === 'flowView' && <FlowTab />}
        {activeTab === 'depthView' && <DepthTab />}
        {activeTab === 'signalsView' && <SignalsTab />}
        {activeTab === 'levelsView' && <LevelsTab />}
        {activeTab === 'marketsView' && <MarketsTab />}
        {activeTab === 'backtestView' && <BacktestTab />}
        {activeTab === 'settingsView' && <SettingsTab />}
      </main>

      <TabBar />
    </div>
  );
};

export function App() {
  return (
    <BozokProvider>
      <MainAppContent />
    </BozokProvider>
  );
}

export default App;
