// BOZOK PRO — MarketsTab Multi-Exchange Arbitrage & Quality Component

import React, { useMemo } from 'react';
import { useBozok } from '../../context/BozokContext';
import { fmtPrice, fmtAgo } from '../../utils/fmt';

export const MarketsTab: React.FC = () => {
  const { exchanges, lastPrice, config } = useBozok();

  const primaryMid = lastPrice;

  const quality = useMemo(() => {
    const exList = Object.values(exchanges);
    const liveCount = exList.filter(
      ex => ex.status === 'live' || ex.status === 'connected'
    ).length;

    const now = Date.now();
    const freshnessScores = exList.map(ex => {
      if (!ex.ts) return 0;
      const ageMs = now - ex.ts;
      if (ageMs <= 3000) return 100;
      if (ageMs >= 15000) return 0;
      return Math.round(100 - ((ageMs - 3000) / 12000) * 100);
    });

    const avgFreshness = freshnessScores.length
      ? Math.round(freshnessScores.reduce((a, b) => a + b, 0) / freshnessScores.length)
      : 0;

    const liveRatioScore = exList.length
      ? Math.round((liveCount / exList.length) * 100)
      : 0;

    const score = Math.round(liveRatioScore * 0.6 + avgFreshness * 0.4);

    return {
      score,
      liveCount,
      total: exList.length,
      avgFreshness,
      color: score >= 80 ? 'var(--bull)' : score >= 50 ? 'var(--signal)' : 'var(--bear)'
    };
  }, [exchanges]);

  return (
    <div className="view active flex flex-col h-full overflow-hidden" id="marketsView">
      <div className="scroll flex-1 overflow-y-auto p-2.5 space-y-3">
        <div className="marketSummary bg-gradient-to-br from-[var(--accent)]/10 to-[var(--bull)]/5 border border-[var(--border)] rounded-xl p-3">
          <div className="marketSummaryTop flex justify-between items-center gap-2 mb-2">
            <div className="marketSummaryTitle font-extrabold text-xs text-[var(--text)]">
              Global Book & Çapraz Borsa Taraması
            </div>
            <div
              className="qualityBadge mono font-extrabold text-xs px-2 py-1 rounded-lg border"
              style={{
                borderColor: `${quality.color}4d`,
                backgroundColor: `${quality.color}1a`,
                color: quality.color
              }}
            >
              KALİTE %{quality.score}/100
            </div>
          </div>
          <div className="marketSummaryGrid grid grid-cols-3 gap-2 text-xs">
            <div className="marketMini">
              <div className="l text-[9px] text-[var(--text-faint)] uppercase">Global Kaynak</div>
              <div className="v mono font-extrabold text-xs mt-0.5 text-[var(--text)]">
                {quality.liveCount}/{quality.total} Canlı
              </div>
            </div>
            <div className="marketMini">
              <div className="l text-[9px] text-[var(--text-faint)] uppercase">Book Modu</div>
              <div className="v mono font-extrabold text-xs mt-0.5 text-[var(--accent)]">
                {config.bookMode.toUpperCase()}
              </div>
            </div>
            <div className="marketMini">
              <div className="l text-[9px] text-[var(--text-faint)] uppercase">Veri Tazeliği</div>
              <div className="v mono font-extrabold text-xs mt-0.5 text-[var(--bull)]">
                %{quality.avgFreshness}
              </div>
            </div>
          </div>
        </div>

        {/* Exchange Cards */}
        {Object.values(exchanges).map(ex => {
          const isLive = ex.status === 'live' || ex.status === 'connected';
          const mid = ex.bid && ex.ask ? (ex.bid + ex.ask) / 2 : null;
          const spreadBps = ex.bid && ex.ask && mid ? ((ex.ask - ex.bid) / mid) * 10000 : null;
          const devBps = mid && primaryMid ? ((mid - primaryMid) / primaryMid) * 10000 : null;

          return (
            <div
              key={ex.key}
              className={`exCard bg-[var(--panel)] border ${isLive ? 'border-[var(--border)]' : 'border-[var(--bear)]/40'} rounded-xl p-3 space-y-2`}
            >
              <div className="exCardHead flex items-center gap-2">
                <span className={`exDot w-2 h-2 rounded-full shrink-0 ${isLive ? 'bg-[var(--bull)] shadow-[0_0_6px_var(--bull)]' : 'bg-[var(--bear)]'}`} />
                <span className="exName font-bold text-sm text-[var(--text)] flex-1">{ex.label}</span>
                <span className="exRole text-[9px] font-extrabold px-1.5 py-0.5 rounded text-[var(--accent)] bg-[var(--accent)]/10 border border-[var(--accent)]/30 uppercase">
                  {ex.key === 'binance' ? 'Primary + Global' : 'Compare + Global'}
                </span>
                <span className="exTag text-[9.5px] text-[var(--text-faint)] mono">{ex.tag}</span>
              </div>

              <div className="exGrid grid grid-cols-3 gap-1.5 text-xs">
                <div className="exStat">
                  <div className="l text-[9px] text-[var(--text-faint)] uppercase">Bid</div>
                  <div className="v mono font-bold text-[var(--bull)]">{fmtPrice(ex.bid)}</div>
                </div>
                <div className="exStat">
                  <div className="l text-[9px] text-[var(--text-faint)] uppercase">Ask</div>
                  <div className="v mono font-bold text-[var(--bear)]">{fmtPrice(ex.ask)}</div>
                </div>
                <div className="exStat">
                  <div className="l text-[9px] text-[var(--text-faint)] uppercase">Spread</div>
                  <div className="v mono font-bold text-[var(--text)]">
                    {spreadBps ? `${spreadBps.toFixed(1)} bps` : '—'}
                  </div>
                </div>
                <div className="exStat">
                  <div className="l text-[9px] text-[var(--text-faint)] uppercase">Sapma (Bps)</div>
                  <div className={`v mono font-bold ${devBps && devBps > 0 ? 'text-[var(--bull)]' : devBps && devBps < 0 ? 'text-[var(--bear)]' : 'text-[var(--text)]'}`}>
                    {devBps ? `${devBps >= 0 ? '+' : ''}${devBps.toFixed(1)} bps` : '—'}
                  </div>
                </div>
                <div className="exStat">
                  <div className="l text-[9px] text-[var(--text-faint)] uppercase">Durum</div>
                  <div className={`v mono font-bold ${isLive ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                    {isLive ? 'CANLI' : ex.status.toUpperCase()}
                  </div>
                </div>
                <div className="exStat">
                  <div className="l text-[9px] text-[var(--text-faint)] uppercase">Gecikme</div>
                  <div className="v mono font-bold text-[var(--text-dim)]">
                    {ex.ts ? `${fmtAgo(Date.now() - ex.ts)} önce` : '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
