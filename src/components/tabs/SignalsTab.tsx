// BOZOK PRO — SignalsTab Real-time Feed & Filters Component

import React, { useState } from 'react';
import { useBozok } from '../../context/BozokContext';
import { fmtPrice, fmtAgo } from '../../utils/fmt';
import { signalUX } from '../../utils/detectors';
import { PatternSignal } from '../../types';

export const SignalsTab: React.FC = () => {
  const {
    signalsFeed,
    sigCounts,
    manipIndex,
    rollingAccuracy,
    exportCSV,
    setFocusPrice,
    setActiveTab
  } = useBozok();

  const [biasFilter, setBiasFilter] = useState<'all' | 'bull' | 'bear' | 'warn'>('all');
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [onlyLiq, setOnlyLiq] = useState(false);
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'confidence'>('newest');

  const isLiqSignal = (sig: PatternSignal) => {
    const t = (sig.type || '').toUpperCase();
    return t.includes('LIQUIDATION') || t.includes('CASCADE') || t.includes('SHORT_LIQ') || t.includes('LONG_LIQ');
  };

  const filtered = signalsFeed.filter(sig => {
    if (biasFilter !== 'all') {
      const b = sig.bias === 'bullish' ? 'bull' : sig.bias === 'bearish' ? 'bear' : 'warn';
      if (b !== biasFilter) return false;
    }
    if (onlyVerified && !sig.verified?.hit) return false;
    if (onlyLiq && !isLiqSignal(sig)) return false;
    if (onlyHigh && (sig.confidence || 0) < 75) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'confidence') return (b.confidence || 0) - (a.confidence || 0);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const handleCardClick = (sig: PatternSignal) => {
    if (sig.price) {
      setFocusPrice(sig.price);
      setActiveTab('levelsView');
    }
  };

  return (
    <div className="view active flex flex-col h-full overflow-hidden" id="signalsView">
      <div id="signalsHeader" className="flex items-center gap-2 p-2.5 border-b border-[var(--border)] shrink-0">
        <span className="title font-bold text-sm text-[var(--text)]">🎯 Sinyal Akışı</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="soundBtn w-7 h-7 rounded-lg bg-[var(--panel2)] border border-[var(--border)] text-xs font-bold flex items-center justify-center hover:border-[var(--accent)]"
            title="Sinyalleri CSV İndir"
          >
            ⬇
          </button>
        </div>
      </div>

      <div id="statChips" className="flex gap-1.5 p-2 shrink-0 overflow-x-auto">
        <div className="chip flex-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg p-1.5 text-center min-w-[60px]">
          <div className="n mono font-bold text-sm text-[var(--text)]">{signalsFeed.length}</div>
          <div className="l text-[9px] text-[var(--text-faint)] uppercase">toplam</div>
        </div>
        <div className="chip flex-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg p-1.5 text-center min-w-[60px]">
          <div className="n mono font-bold text-sm text-[var(--bull)]">{sigCounts.bull}</div>
          <div className="l text-[9px] text-[var(--text-faint)] uppercase">bullish</div>
        </div>
        <div className="chip flex-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg p-1.5 text-center min-w-[60px]">
          <div className="n mono font-bold text-sm text-[var(--bear)]">{sigCounts.bear}</div>
          <div className="l text-[9px] text-[var(--text-faint)] uppercase">bearish</div>
        </div>
        <div className="chip flex-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg p-1.5 text-center min-w-[60px]">
          <div className="n mono font-bold text-sm text-[var(--signal)]">{sigCounts.warn}</div>
          <div className="l text-[9px] text-[var(--text-faint)] uppercase">uyarı</div>
        </div>
        <div className="chip flex-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg p-1.5 text-center min-w-[70px]">
          <div className="n mono font-bold text-sm text-[var(--accent)]">
            {rollingAccuracy?.dir != null ? `%${rollingAccuracy.dir}` : '—'}
          </div>
          <div className="l text-[9px] text-[var(--text-faint)] uppercase">doğruluk</div>
        </div>
        <div className="chip flex-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg p-1.5 text-center min-w-[70px]">
          <div className={`n mono font-bold text-sm ${manipIndex < 35 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
            {manipIndex}/100
          </div>
          <div className="l text-[9px] text-[var(--text-faint)] uppercase">manip radarı</div>
        </div>
      </div>

      <div id="sigFilterBar" className="flex gap-1.5 p-2 shrink-0 items-center flex-wrap border-b border-[var(--border)]">
        <div className="filterChips flex gap-1">
          <button onClick={() => setBiasFilter('all')} className={`fchip text-[10.5px] font-bold px-2.5 py-1 rounded-full border border-[var(--border)] ${biasFilter === 'all' ? 'bg-[var(--accent)] text-black border-[var(--accent)]' : 'bg-[var(--panel2)] text-[var(--text-dim)]'}`}>Tümü</button>
          <button onClick={() => setBiasFilter('bull')} className={`fchip text-[10.5px] font-bold px-2.5 py-1 rounded-full border border-[var(--border)] ${biasFilter === 'bull' ? 'bg-[var(--accent)] text-black border-[var(--accent)]' : 'bg-[var(--panel2)] text-[var(--text-dim)]'}`}>🟢</button>
          <button onClick={() => setBiasFilter('bear')} className={`fchip text-[10.5px] font-bold px-2.5 py-1 rounded-full border border-[var(--border)] ${biasFilter === 'bear' ? 'bg-[var(--accent)] text-black border-[var(--accent)]' : 'bg-[var(--panel2)] text-[var(--text-dim)]'}`}>🔴</button>
          <button onClick={() => setBiasFilter('warn')} className={`fchip text-[10.5px] font-bold px-2.5 py-1 rounded-full border border-[var(--border)] ${biasFilter === 'warn' ? 'bg-[var(--accent)] text-black border-[var(--accent)]' : 'bg-[var(--panel2)] text-[var(--text-dim)]'}`}>⚠️</button>
        </div>

        <div className="filterChips flex gap-1">
          <button onClick={() => setOnlyVerified(!onlyVerified)} className={`fchip text-[10.5px] font-bold px-2.5 py-1 rounded-full border border-[var(--border)] ${onlyVerified ? 'bg-[var(--accent)] text-black border-[var(--accent)]' : 'bg-[var(--panel2)] text-[var(--text-dim)]'}`}>✓ isabet</button>
          <button onClick={() => setOnlyLiq(!onlyLiq)} className={`fchip text-[10.5px] font-bold px-2.5 py-1 rounded-full border border-[var(--border)] ${onlyLiq ? 'bg-[var(--accent)] text-black border-[var(--accent)]' : 'bg-[var(--panel2)] text-[var(--text-dim)]'}`}>⚡ liq</button>
          <button onClick={() => setOnlyHigh(!onlyHigh)} className={`fchip text-[10.5px] font-bold px-2.5 py-1 rounded-full border border-[var(--border)] ${onlyHigh ? 'bg-[var(--accent)] text-black border-[var(--accent)]' : 'bg-[var(--panel2)] text-[var(--text-dim)]'}`}>⭐ yüksek</button>
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="setInput bg-[var(--panel2)] border border-[var(--border)] text-xs text-[var(--text)] rounded-md px-2 py-1 ml-auto"
        >
          <option value="newest">Yeni önce</option>
          <option value="confidence">Güven yüksek</option>
        </select>
      </div>

      <div id="signalFeed" className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {!signalsFeed.length ? (
          <div id="emptyFeed" className="text-center text-[var(--text-faint)] py-10 text-xs leading-relaxed">
            Henüz pattern tespit edilmedi.<br />Binance & borsa akışı başladığında sinyaller burada listelenecek.
          </div>
        ) : !filtered.length ? (
          <div className="text-center text-[var(--text-faint)] py-10 text-xs">
            Filtreye uyan sinyal bulunamadı.
          </div>
        ) : (
          filtered.map(sig => {
            const ux = signalUX(sig);
            const isBull = sig.bias === 'bullish' || sig.bias === 'bull';
            const isBear = sig.bias === 'bearish' || sig.bias === 'bear';
            const borderCol = isBull ? 'border-l-[var(--bull)]' : isBear ? 'border-l-[var(--bear)]' : 'border-l-[var(--signal)]';

            return (
              <div
                key={sig.id}
                onClick={() => handleCardClick(sig)}
                className={`sigCard flex gap-2.5 p-2.5 rounded-xl bg-[var(--panel)] border border-[var(--border)] border-l-4 ${borderCol} cursor-pointer hover:border-[var(--accent)] transition-all`}
              >
                <div className="sigIcon text-xl shrink-0 w-6 text-center">{ux.icon}</div>
                <div className="sigBody flex-1 min-w-0">
                  <div className="sigTitle font-extrabold text-xs text-[var(--text)] flex items-center gap-1.5">
                    {ux.title} <span className="text-[var(--text-faint)] font-normal text-[10px]">· {ux.direction}</span>
                  </div>
                  <div className="sigDesc text-[11px] text-[var(--text-dim)] mt-0.5 leading-snug">{ux.action}</div>

                  <div className="sigMeta flex gap-2 mt-1.5 text-[10.5px] text-[var(--text-faint)] mono">
                    <span>{fmtAgo(Date.now() - sig.createdAt)} önce</span>
                    <span>{fmtPrice(sig.price)}</span>
                    <span>{sig.timeframe || '—'}</span>
                  </div>
                </div>

                <div className="confBadge mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/10 text-[var(--accent)] shrink-0 self-start">
                  %{Math.round(sig.confidence || 0)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
