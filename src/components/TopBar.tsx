// BOZOK PRO — TopBar Header Component

import React, { useState } from 'react';
import { useBozok } from '../context/BozokContext';
import { fmtPrice } from '../utils/fmt';

export const TopBar: React.FC = () => {
  const {
    symbol,
    setSymbol,
    lastPrice,
    prevPrice,
    ticker,
    exchanges,
    vpinValue,
    speakTest
  } = useBozok();

  const [showHelpModal, setShowHelpModal] = useState(false);

  const binanceStatus = exchanges.binance?.status || 'disconnected';
  const isLive = binanceStatus === 'live' || binanceStatus === 'connected';
  const isBad = binanceStatus === 'bad' || binanceStatus === 'error';

  const priceColor = lastPrice && prevPrice ? (lastPrice > prevPrice ? 'text-[var(--bull)]' : lastPrice < prevPrice ? 'text-[var(--bear)]' : 'text-white') : 'text-white';
  const changeColor = ticker.changePct >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]';

  const vpinLabel = vpinValue === null ? "—" : vpinValue < 30 ? "DÜŞÜK" : vpinValue < 60 ? "ORTA" : "TOKSİK!";
  const vpinColor = vpinValue === null ? "text-[var(--text-faint)]" : vpinValue < 30 ? "text-[var(--bull)]" : vpinValue < 60 ? "text-[var(--signal)]" : "text-[var(--bear)]";
  const vpinBg = vpinValue === null ? "bg-[rgba(136,148,168,.1)]" : vpinValue < 30 ? "bg-[rgba(31,214,122,.12)]" : vpinValue < 60 ? "bg-[rgba(255,176,32,.12)]" : "bg-[rgba(255,77,109,.15)]";

  return (
    <>
      <header id="topbar" className="flex items-center gap-2.5 px-3 py-2 bg-gradient-to-b from-[#0a0e17] to-[#080b12] border-b border-[var(--border)] shrink-0 z-20">
        <div className="brand font-bold text-[15px] tracking-wider flex items-center gap-1.5 whitespace-nowrap">
          <span className="dot w-1.75 h-1.75 rounded-full bg-[var(--signal)] shadow-[0_0_8px_var(--signal)] shrink-0"></span>
          BOZOK <span className="text-[var(--text-faint)] font-medium">PRO</span>
        </div>

        <input
          type="text"
          id="symSelect"
          list="symList"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          className="mono w-[115px] bg-[var(--panel2)] border border-[var(--border)] rounded-md text-[var(--text)] px-2 py-1 font-bold text-xs uppercase"
          title="Binance Futures Sembolü Yaz veya Seç"
        />
        <datalist id="symList">
          <option value="BTCUSDT" />
          <option value="ETHUSDT" />
          <option value="SOLUSDT" />
          <option value="BNBUSDT" />
          <option value="XRPUSDT" />
          <option value="DOGEUSDT" />
          <option value="PEPEUSDT" />
          <option value="WIFUSDT" />
          <option value="1000SATSUSDT" />
          <option value="SUIUSDT" />
          <option value="NEARUSDT" />
          <option value="AVAXUSDT" />
          <option value="LINKUSDT" />
        </datalist>

        <span
          id="connDot"
          className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-200 ${isLive ? 'bg-[var(--bull)] shadow-[0_0_6px_var(--bull)]' : isBad ? 'bg-[var(--bear)] shadow-[0_0_6px_var(--bear)]' : 'bg-[var(--text-faint)]'}`}
          title={`Bağlantı: ${binanceStatus}`}
        ></span>

        <span
          className={`mono text-[10px] font-bold px-2 py-0.5 rounded border border-transparent ${vpinBg} ${vpinColor} hidden sm:inline-block`}
          title="VPIN Toksisite İndeksi (Emir Akışı Toksisitesi)"
        >
          VPIN {vpinValue !== null ? `%${vpinValue} · ${vpinLabel}` : '—'}
        </span>

        <button
          onClick={() => setShowHelpModal(true)}
          className="soundBtn w-7 h-7 font-extrabold text-xs rounded border border-[var(--border)] bg-[var(--panel2)] hover:border-[var(--accent)] transition-colors flex items-center justify-center text-[var(--text-dim)]"
          title="Klavye Kısayolları (?)"
        >
          ?
        </button>

        <div className="flex-1"></div>

        <div id="priceWrap" className="flex flex-col items-end leading-none">
          <div id="lastPrice" className={`mono font-bold text-base transition-colors ${priceColor}`}>
            {fmtPrice(lastPrice)}
          </div>
          <div id="chg24" className={`mono text-[10.5px] mt-0.5 ${changeColor}`}>
            24s {ticker.changePct >= 0 ? '+' : ''}{ticker.changePct.toFixed(2)}%
          </div>
        </div>
      </header>

      {/* ShortCuts Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] grid place-items-center p-4">
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl w-full max-w-md p-5 shadow-2xl text-[var(--text)] font-sans">
            <div className="flex justify-between items-center mb-3.5 border-b border-[var(--border-soft)] pb-2.5">
              <span className="text-sm font-extrabold flex items-center gap-2">
                ⌨️ BOZOK PRO — Klavye Kısayolları
              </span>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-lg text-[var(--text-faint)] hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="bg-[var(--panel2)] p-2 rounded-lg border border-[var(--border)]">
                <b className="mono text-[var(--accent)]">1 - 8</b>
                <span className="text-[var(--text-dim)] float-right">Sekme Geçişi</span>
              </div>
              <div className="bg-[var(--panel2)] p-2 rounded-lg border border-[var(--border)]">
                <b className="mono text-[var(--accent)]">F</b>
                <span className="text-[var(--text-dim)] float-right">Tam Ekran Chart</span>
              </div>
              <div className="bg-[var(--panel2)] p-2 rounded-lg border border-[var(--border)]">
                <b className="mono text-[var(--accent)]">M</b>
                <span className="text-[var(--text-dim)] float-right">Ses / TTS Mute</span>
              </div>
              <div className="bg-[var(--panel2)] p-2 rounded-lg border border-[var(--border)]">
                <b className="mono text-[var(--accent)]">ESC</b>
                <span className="text-[var(--text-dim)] float-right">Tam Ekrandan Çık</span>
              </div>
              <div className="bg-[var(--panel2)] p-2 rounded-lg border border-[var(--border)]">
                <b className="mono text-[var(--accent)]">?</b>
                <span className="text-[var(--text-dim)] float-right">Kısayol Penceresi</span>
              </div>
            </div>
            <div className="mt-3.5 pt-2.5 border-t border-[var(--border-soft)] text-[11px] text-[var(--text-dim)] leading-relaxed">
              💡 <b className="text-[var(--bull)]">İpucu:</b> BOOK haritası üzerinde Stop-Loss veya Take-Profit çizgisini fareyle/parmakla sürükleyerek Kelly risk oranını ve Webhook JSON payload'unu canlı güncelleyebilirsin!
              <button
                onClick={() => speakTest()}
                className="mt-2 block w-full py-1 px-2 bg-[var(--panel2)] border border-[var(--border)] rounded text-center text-[var(--accent)] hover:border-[var(--accent)] font-bold"
              >
                🔊 Türkçe Sesli Anons Test Et
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
