// BOZOK PRO — SettingsTab Engine & Theme Customization Component

import React from 'react';
import { useBozok } from '../../context/BozokContext';

export const SettingsTab: React.FC = () => {
  const { config, updateConfig, resetConfig, speakTest } = useBozok();

  return (
    <div className="view active flex flex-col h-full overflow-hidden" id="settingsView">
      <div className="scroll flex-1 overflow-y-auto p-3 space-y-4">
        {/* Theme & Visual Options */}
        <div className="setGroup bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3 space-y-3">
          <div className="groupTitle text-xs font-extrabold text-[var(--accent)] uppercase tracking-wider">
            🎨 Arayüz & Tema Ayarları
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Renk Teması</span>
            <select
              value={config.theme}
              onChange={(e) => updateConfig({ theme: e.target.value as any })}
              className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1"
            >
              <option value="professional">Profesyonel Koyu</option>
              <option value="neon">Neon Cyberpunk</option>
              <option value="minimal">Sade Minimal</option>
            </select>
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Renk Körü Modu</span>
            <input
              type="checkbox"
              checked={config.colorblind}
              onChange={(e) => updateConfig({ colorblind: e.target.checked })}
              className="w-4 h-4 accent-[var(--accent)]"
            />
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Ekran Yoğunluğu</span>
            <select
              value={config.overlayDensity}
              onChange={(e) => updateConfig({ overlayDensity: e.target.value as any })}
              className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1"
            >
              <option value="LOW">Düşük Yoğunluk</option>
              <option value="NORMAL">Normal Yoğunluk</option>
              <option value="HIGH">Yüksek Yoğunluk</option>
            </select>
          </div>
        </div>

        {/* Microstructure Detector Settings */}
        <div className="setGroup bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3 space-y-3">
          <div className="groupTitle text-xs font-extrabold text-[var(--accent)] uppercase tracking-wider">
            ⚡ Mikroyapı & Dedektör Parametreleri
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Duvar Eşik Çarpanı (xMedyan)</span>
            <input
              type="number"
              step="0.5"
              min="1.5"
              max="10"
              value={config.wallMult}
              onChange={(e) => updateConfig({ wallMult: parseFloat(e.target.value) || 3.5 })}
              className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1 w-20 text-right mono font-bold"
            />
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Spoofing Penceresi (Pencere ms)</span>
            <input
              type="number"
              step="500"
              min="1000"
              max="10000"
              value={config.spoofWindowMs}
              onChange={(e) => updateConfig({ spoofWindowMs: parseInt(e.target.value) || 3000 })}
              className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1 w-20 text-right mono font-bold"
            />
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Flow Zaman Dilimi (ms)</span>
            <select
              value={config.flowTimeframeMs}
              onChange={(e) => updateConfig({ flowTimeframeMs: parseInt(e.target.value) as any })}
              className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1"
            >
              <option value="1000">1 Saniye</option>
              <option value="5000">5 Saniye</option>
              <option value="15000">15 Saniye</option>
              <option value="60000">1 Dakika</option>
            </select>
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Minimum Sinyal Güveni (%)</span>
            <input
              type="number"
              step="5"
              min="40"
              max="95"
              value={config.minSignalConfidence}
              onChange={(e) => updateConfig({ minSignalConfidence: parseInt(e.target.value) || 60 })}
              className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1 w-20 text-right mono font-bold"
            />
          </div>
        </div>

        {/* Micro Scalp Account Settings */}
        <div className="setGroup bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3 space-y-3">
          <div className="groupTitle text-xs font-extrabold text-[var(--accent)] uppercase tracking-wider">
            💰 Micro-Account Bütçe & Kaldıraç
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Başlangıç Bütçesi ($)</span>
            <input
              type="number"
              step="1"
              min="1"
              max="1000"
              value={config.microBalance}
              onChange={(e) => updateConfig({ microBalance: parseFloat(e.target.value) || 5.0 })}
              className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1 w-20 text-right mono font-bold"
            />
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <div className="flex flex-col">
              <span className="text-[var(--text)]">İşlem Başı Risk Limiti</span>
              <span className="text-[9px] text-[var(--text-faint)] leading-tight">Kelly bu değeri tavan olarak kullanır (maks. risk)</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="1"
                min="1"
                max="50"
                value={Math.round((config.microRiskPct || 0.20) * 100)}
                onChange={(e) => {
                  const pct = parseInt(e.target.value, 10);
                  updateConfig({ microRiskPct: Number.isFinite(pct) ? Math.max(0.01, Math.min(0.50, pct / 100)) : 0.20 });
                }}
                className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1 w-16 text-right mono font-bold"
              />
              <span className="text-[var(--text-dim)] text-xs">%</span>
            </div>
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Maksimum Kaldıraç</span>
            <input
              type="number"
              step="5"
              min="1"
              max="100"
              value={config.microMaxLeverage}
              onChange={(e) => updateConfig({ microMaxLeverage: parseInt(e.target.value) || 20 })}
              className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded px-2 py-1 w-20 text-right mono font-bold"
            />
          </div>
        </div>

        {/* Audio & Voice Settings */}
        <div className="setGroup bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3 space-y-3">
          <div className="groupTitle text-xs font-extrabold text-[var(--accent)] uppercase tracking-wider">
            🔊 Ses & Türkçe Sesli Anons
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Sinyal Bip Sesi</span>
            <input
              type="checkbox"
              checked={config.soundOn}
              onChange={(e) => updateConfig({ soundOn: e.target.checked })}
              className="w-4 h-4 accent-[var(--accent)]"
            />
          </div>

          <div className="setRow flex justify-between items-center text-xs">
            <span className="text-[var(--text)]">Türkçe Sesli Anons</span>
            <input
              type="checkbox"
              checked={config.voiceAnnounce}
              onChange={(e) => updateConfig({ voiceAnnounce: e.target.checked })}
              className="w-4 h-4 accent-[var(--accent)]"
            />
          </div>

          <button
            onClick={() => speakTest("Bozok Pro canlı mikroyapı sesli uyarı sistemi çalışıyor")}
            className="w-full py-1.5 bg-[var(--panel2)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--accent)] hover:border-[var(--accent)]"
          >
            🔊 Ses Anonsunu Test Et
          </button>
        </div>

        <button
          onClick={resetConfig}
          className="w-full py-2 bg-[var(--bear)]/10 border border-[var(--bear)]/40 rounded-xl text-xs font-bold text-[var(--bear)] hover:bg-[var(--bear)]/20"
        >
          Tüm Ayarları Varsayılana Sıfırla
        </button>
      </div>
    </div>
  );
};
