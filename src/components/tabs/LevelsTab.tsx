// BOZOK PRO — LevelsTab Meta-Analysis, Plan & Micro Optimizer Component

import React, { useRef, useEffect } from 'react';
import { useBozok } from '../../context/BozokContext';
import { fmtPrice, fmtQty, fmtAgo } from '../../utils/fmt';
import { canvasPalette } from '../../utils/theme';

export const LevelsTab: React.FC = () => {
  const {
    narrative,
    tradePlan,
    microResult,
    activePatterns,
    book,
    lastPrice,
    setFocusPrice,
    setActiveTab,
    perfTracker,
    positionStats
  } = useBozok();

  const equityCanvasRef = useRef<HTMLCanvasElement>(null);

  // Equity Curve Canvas
  useEffect(() => {
    const canvas = equityCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.parentElement ? canvas.parentElement.clientWidth : 300;
    const h = 76;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    const stats = perfTracker.getStats();
    const curve = stats.curve || [0];
    if (curve.length < 2) return;

    const minVal = Math.min(0, ...curve);
    const maxVal = Math.max(5, ...curve);
    const range = (maxVal - minVal) || 10;

    const getY = (v: number) => h - 8 - ((v - minVal) / range) * (h - 16);
    const zeroY = getY(0);

    ctx.strokeStyle = "rgba(148,163,184,.22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    curve.forEach((val, idx) => {
      const x = (idx / (curve.length - 1)) * w;
      const y = getY(val);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    const isPos = curve[curve.length - 1] >= 0;
    ctx.strokeStyle = isPos ? canvasPalette.bull : canvasPalette.bear;
    ctx.lineWidth = 2.2;
    ctx.stroke();

  }, [perfTracker, activePatterns]);

  const stats = perfTracker.getStats();

  const handleLevelClick = (price: number) => {
    setFocusPrice(price);
    setActiveTab('bookView');
  };

  const copyWebhookJSON = () => {
    if (tradePlan && tradePlan.webhookPayload) {
      try {
        navigator.clipboard.writeText(JSON.stringify(tradePlan.webhookPayload, null, 2));
        alert('Webhook JSON Panoya Kopyalandı! ✓');
      } catch (e) {}
    }
  };

  return (
    <div className="view active flex flex-col h-full overflow-hidden" id="levelsView">
      <div className="scroll flex-1 overflow-y-auto p-2.5 space-y-3">
        {/* Section 1: Meta Analysis Türkçe Yorum */}
        <div className="sectionLabel text-[10.5px] text-[var(--text-faint)] uppercase tracking-wider font-bold">
          Meta-Analiz (Piyasa Yorumu)
        </div>
        <div className={`narrativeCard flex gap-2.5 p-3 border rounded-xl bg-[var(--panel)] ${narrative.bias === 'bull' ? 'border-[var(--bull)]/40 bg-[var(--bull)]/5' : narrative.bias === 'bear' ? 'border-[var(--bear)]/40 bg-[var(--bear)]/5' : 'border-[var(--border)]'}`}>
          <div className="narrativeIcon text-2xl">{narrative.icon}</div>
          <div className="narrativeBody flex-1 min-w-0">
            <div className={`narrativeTitle font-extrabold text-xs mb-0.5 ${narrative.bias === 'bull' ? 'text-[var(--bull)]' : narrative.bias === 'bear' ? 'text-[var(--bear)]' : 'text-[var(--signal)]'}`}>
              {narrative.title}
            </div>
            <div className="narrativeText text-xs text-[var(--text-dim)] leading-relaxed">
              {narrative.text}
            </div>
          </div>
        </div>

        {/* Section 2: Otomatik Trade Planı */}
        <div className="sectionLabel text-[10.5px] text-[var(--text-faint)] uppercase tracking-wider font-bold">
          Otomatik Trade Planı
        </div>
        <div className="planCard bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3">
          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Yön Önerisi</span>
            <span className={`v font-bold ${tradePlan?.direction === 'LONG' ? 'text-[var(--bull)]' : tradePlan?.direction === 'SHORT' ? 'text-[var(--bear)]' : 'text-[var(--text)]'}`}>
              {tradePlan ? tradePlan.direction : 'BEKLE'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Entry Bölgesi</span>
            <span className="v mono font-bold text-[var(--text)]">
              {tradePlan && tradePlan.entry ? `${fmtPrice(tradePlan.entry.low)} - ${fmtPrice(tradePlan.entry.high)}` : '—'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Stop-Loss</span>
            <span className="v mono font-bold text-[var(--bear)]">
              {tradePlan && tradePlan.stopLoss ? fmtPrice(tradePlan.stopLoss.price) : '—'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Take-Profit</span>
            <span className="v mono font-bold text-[var(--bull)]">
              {tradePlan && tradePlan.tp1 ? fmtPrice(tradePlan.tp1.price) : '—'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Risk / Ödül</span>
            <span className="v mono font-bold text-[var(--text)]">
              {tradePlan ? `1:${(tradePlan.riskReward1 || 0).toFixed(2)}` : '—'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Trailing Stop</span>
            <span className="v mono font-bold text-[var(--text-dim)]">
              {tradePlan && tradePlan.trailingStop && tradePlan.trailingStop.active ? `TP1 sonrası ${fmtPrice(tradePlan.trailingStop.distance)}` : '—'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 text-xs">
            <span className="text-[var(--text-dim)]">Gerekçe</span>
            <span className="v text-[11px] text-[var(--text-dim)] text-right font-medium max-w-[65%]">
              {tradePlan ? tradePlan.reasoning : 'Yeterli veri yok'}
            </span>
          </div>

          {tradePlan && tradePlan.webhookPayload && (
            <div className="mt-2 pt-2 border-t border-[var(--border-soft)] flex justify-between items-center">
              <span className="text-xs text-[var(--text-dim)]">Webhook Payload</span>
              <button
                onClick={copyWebhookJSON}
                className="px-2.5 py-1 bg-[var(--accent)]/15 border border-[var(--accent)]/40 rounded text-[var(--accent)] font-bold text-xs hover:bg-[var(--accent)]/30"
              >
                JSON Kopyala ✓
              </button>
            </div>
          )}
        </div>

        {/* Section 3: Micro Account $5 Scalp Optimizer */}
        <div className="sectionLabel text-[10.5px] text-[var(--text-faint)] uppercase tracking-wider font-bold">
          Micro-Account Scalp Optimizer ($5)
        </div>
        <div className="planCard bg-[var(--panel)] border border-[var(--accent)]/30 rounded-xl p-3 bg-gradient-to-br from-[var(--accent)]/5 to-[var(--panel)]">
          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Bütçe / Risk</span>
            <span className="v mono font-bold text-[var(--text)]">
              ${microResult ? microResult.balance.toFixed(2) : '5.00'} (${microResult ? microResult.riskAmount : '1.00'} Risk @ %{microResult ? microResult.riskPct : '20'} Kelly)
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Önerilen Kaldıraç</span>
            <span className="v mono font-bold text-[var(--accent)]">
              {microResult ? microResult.recommendedLeverage : '20'}x
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Pozisyon Notional</span>
            <span className="v mono font-bold text-[var(--text)]">
              ${microResult ? microResult.positionNotional : '0.00'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Gerekli Margin</span>
            <span className="v mono font-bold text-[var(--text)]">
              ${microResult ? microResult.requiredMargin : '0.00'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Fee (M+T)</span>
            <span className="v mono font-bold text-[var(--text-dim)]">
              ${microResult ? microResult.feeCostUsd : '0.00'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Break-even</span>
            <span className="v mono font-bold text-[var(--text)]">
              {microResult ? fmtPrice(microResult.breakEven) : '—'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] text-xs">
            <span className="text-[var(--text-dim)]">Tahmini Liq</span>
            <span className="v mono font-bold text-[var(--bear)]">
              {microResult ? fmtPrice(microResult.liqEstimate) : '—'}
            </span>
          </div>

          <div className="planRow flex justify-between items-center py-1.5 text-xs">
            <span className="text-[var(--text-dim)]">Durum / Uyarı</span>
            <span className={`v font-bold ${microResult && microResult.isTradable ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
              {microResult ? microResult.warning : '—'}
            </span>
          </div>
        </div>

        {/* Section 4: Equity Curve — gerçekleşen performans */}
        <div className="sectionLabel text-[10.5px] text-[var(--text-faint)] uppercase tracking-wider font-bold">
          Strateji Performans ve Kâr Eğrisi (Equity Curve)
        </div>
        <div className="planCard bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3">
          <div className="flex justify-between items-center mb-2 text-xs mono">
            <span>Net Kâr: <b className={stats.netR >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}>{stats.netR >= 0 ? '+' : ''}{stats.netR.toFixed(1)}R</b></span>
            <span>Win Rate: <b className="text-[var(--accent)]">%{stats.winRate.toFixed(1)}</b></span>
            <span>PF: <b>{stats.pf.toFixed(2)}</b></span>
            <span>Sharpe: <b>{stats.sharpe.toFixed(2)}</b></span>
          </div>
          <div className="h-[76px] bg-[#05070c]/65 border border-[var(--border-soft)] rounded-lg relative overflow-hidden">
            <canvas ref={equityCanvasRef} className="w-full h-full block" />
          </div>
        </div>

        {/* Section 5: Canlı pozisyon sonuçları */}
        <div className="sectionLabel text-[10.5px] text-[var(--text-faint)] uppercase tracking-wider font-bold">
          Pozisyon Takibi (Canlı SL/TP Sonuçları)
        </div>
        <div className="planCard bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3">
          <div className="grid grid-cols-4 gap-2 text-center text-[10px] mono">
            <div>
              <div className="text-[var(--text-faint)]">Toplam</div>
              <div className="text-sm font-bold text-[var(--text)]">{positionStats.total}</div>
            </div>
            <div>
              <div className="text-[var(--text-faint)]">TP</div>
              <div className="text-sm font-bold text-[var(--bull)]">{positionStats.wins}</div>
            </div>
            <div>
              <div className="text-[var(--text-faint)]">Stop</div>
              <div className="text-sm font-bold text-[var(--bear)]">{positionStats.losses}</div>
            </div>
            <div>
              <div className="text-[var(--text-faint)]">Win%</div>
              <div className="text-sm font-bold text-[var(--accent)]">
                {positionStats.winRate == null ? '—' : `%${positionStats.winRate}`}
              </div>
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[10px] mono">
            <span className="text-[var(--text-faint)]">Timeout</span>
            <b className="text-[var(--signal)]">{positionStats.timeouts}</b>
          </div>
          <div className="mt-1 flex justify-between text-[10px] mono">
            <span className="text-[var(--text-faint)]">Ortalama R / Expectancy</span>
            <b className={positionStats.avgR != null && positionStats.avgR >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}>
              {positionStats.avgR == null ? '—' : `${positionStats.avgR.toFixed(2)}R`}
            </b>
          </div>
        </div>

        {/* Section 6: Active Levels List */}
        <div className="sectionLabel text-[10.5px] text-[var(--text-faint)] uppercase tracking-wider font-bold">
          Aktif Duvarlar & Seviyeler
        </div>
        <div className="space-y-1.5">
          {!book.bids.length && !book.asks.length ? (
            <div className="text-[var(--text-faint)] text-xs py-2">Aktif duvar verisi yükleniyor...</div>
          ) : (
            [...book.bids.slice(0, 5), ...book.asks.slice(0, 5)]
              .sort((a, b) => Math.abs(a.price - (lastPrice || 0)) - Math.abs(b.price - (lastPrice || 0)))
              .map((l, idx) => {
                const isBid = book.bids.some(b => b.price === l.price);
                const distPct = lastPrice ? ((l.price - lastPrice) / lastPrice) * 100 : 0;
                return (
                  <div
                    key={`lvl_${l.price}_${idx}`}
                    onClick={() => handleLevelClick(l.price)}
                    className="levelCard flex items-center gap-2.5 bg-[var(--panel)] border border-[var(--border)] rounded-xl p-2.5 cursor-pointer hover:border-[var(--accent)] transition-colors"
                  >
                    <div className={`w-1 self-stretch rounded ${isBid ? 'bg-[var(--bull)]' : 'bg-[var(--bear)]'}`} />
                    <div className="levelBody flex-1 min-w-0">
                      <div className="levelPx mono font-bold text-sm text-[var(--text)]">
                        {fmtPrice(l.price)} <span className="text-[var(--text-faint)] font-normal text-[10.5px]">{isBid ? 'BID' : 'ASK'}</span>
                      </div>
                      <div className="levelSub text-[10.5px] text-[var(--text-faint)] font-mono mt-0.5">
                        {fmtQty(l.qty)} • ${(l.notional || l.price * l.qty).toFixed(0)} Notional
                      </div>
                    </div>
                    <div className={`levelDist mono text-xs font-bold ${distPct >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                      {distPct >= 0 ? '+' : ''}{distPct.toFixed(2)}%
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
};
