// BOZOK PRO — Canlı Performans Paneli
//
// NOT: Sahte kline/mum backtest'i kaldırıldı. Mum verisi SPOOF, ICEBERG,
// WALL_PULL, VPIN gibi mikro-yapı detektörlerini besleyecek geçmiş order book/tape
// verisi içermediği için gerçek sistemi test edemiyordu ve kullanıcıyı yanıltıyordu.
// Bu panel artık yalnızca canlı çalışan TradePlan sonuçlarını gösterir.

import React, { useEffect, useRef } from 'react';
import { useBozok, useBozokLive } from '../../context/BozokContext';
import { fmtPrice } from '../../utils/fmt';
import { canvasPalette } from '../../utils/theme';

export const BacktestTab: React.FC = () => {
  const { positionStats, openPositions, perfTracker } = useBozok();
  const { lastPrice } = useBozokLive();
  const equityCanvasRef = useRef<HTMLCanvasElement>(null);

  const stats = perfTracker.getStats();
  const strategyRows = Object.entries(positionStats.byStrategy).sort((a, b) => b[1].total - a[1].total);

  useEffect(() => {
    const canvas = equityCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : 300;
    const h = 120;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, w, h);

    const curve = stats.curve || [0];
    if (curve.length < 2) {
      ctx.fillStyle = 'rgba(148,163,184,.65)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Henüz kapanmış gerçek pozisyon yok.', w / 2, h / 2 - 4);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText('Canlı planlar SL/TP vurduğunda eğri burada oluşur.', w / 2, h / 2 + 14);
      ctx.textAlign = 'left';
      return;
    }

    const min = Math.min(0, ...curve);
    const max = Math.max(1, ...curve);
    const range = max - min || 1;
    const pad = 10;
    const getY = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
    const getX = (i: number) => (i / (curve.length - 1)) * w;

    ctx.strokeStyle = 'rgba(148,163,184,.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, getY(0));
    ctx.lineTo(w, getY(0));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    curve.forEach((v, i) => {
      const x = getX(i);
      const y = getY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = curve[curve.length - 1] >= 0 ? canvasPalette.bull : canvasPalette.bear;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [stats, positionStats]);

  return (
    <div className="view active flex flex-col h-full overflow-hidden" id="backtestView">
      <div className="flex justify-between items-center p-2.5 bg-[var(--panel)] border-b border-[var(--border)] shrink-0">
        <div>
          <div className="font-bold text-xs text-[var(--text)] flex items-center gap-2">
            <span>📊 Canlı Performans</span>
          </div>
          <div className="text-[10px] text-[var(--text-faint)] mt-0.5">
            Mum backtest’i kaldırıldı; bu panel gerçek SL/TP sonuçlarını gösterir.
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="Kapanan Poz." value={String(positionStats.total)} />
          <Metric label="TP / Stop" value={`${positionStats.wins} / ${positionStats.losses}`} accent={positionStats.wins >= positionStats.losses ? 'bull' : 'bear'} />
          <Metric label="Timeout" value={String(positionStats.timeouts)} accent="warn" />
          <Metric
            label="Win Rate"
            value={positionStats.winRate == null ? '—' : `%${positionStats.winRate}`}
            accent="accent"
          />
          <Metric
            label="Ortalama R"
            value={positionStats.avgR == null ? '—' : `${positionStats.avgR >= 0 ? '+' : ''}${positionStats.avgR.toFixed(2)}R`}
            accent={positionStats.avgR != null && positionStats.avgR >= 0 ? 'bull' : 'bear'}
          />
          <Metric label="Net R (perf)" value={`${stats.netR >= 0 ? '+' : ''}${stats.netR.toFixed(2)}R`} accent={stats.netR >= 0 ? 'bull' : 'bear'} />
          <Metric label="Profit Factor" value={stats.pf.toFixed(2)} accent="accent" />
          <Metric label="Sharpe" value={stats.sharpe.toFixed(2)} />
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Kümülatif R Eğrisi</span>
            <span className="text-[10px] text-[var(--text-faint)]">Gerçek kapanan pozisyonlar</span>
          </div>
          <div className="h-[120px] rounded-lg overflow-hidden border border-[var(--border-soft)] bg-[#05070c]">
            <canvas ref={equityCanvasRef} className="block w-full h-full" />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-2">
            Strateji Bazlı Performans
          </div>
          {strategyRows.length === 0 ? (
            <div className="text-xs text-[var(--text-faint)] py-4 text-center">
              Henüz strateji bazında kapanmış pozisyon yok.
            </div>
          ) : (
            <div className="space-y-1.5">
              {strategyRows.map(([id, s]) => (
                <div key={id} className="grid grid-cols-4 gap-2 text-[11px] mono py-1.5 border-b border-[var(--border-soft)] last:border-b-0">
                  <div className="truncate text-[var(--text)] font-bold">{id}</div>
                  <div className="text-center text-[var(--text-dim)]">{s.total} işlem</div>
                  <div className="text-center text-[var(--accent)]">{s.winRate == null ? '—' : `%${s.winRate}`}</div>
                  <div className={`text-right font-bold ${s.avgR >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                    {s.avgR >= 0 ? '+' : ''}{s.avgR.toFixed(2)}R
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Şu An Takip Edilen Pozisyonlar
            </span>
            <span className="text-[10px] mono text-[var(--text-faint)]">{openPositions.length} açık</span>
          </div>
          {openPositions.length === 0 ? (
            <div className="text-xs text-[var(--text-faint)] py-3 text-center">
              Aktif pozisyon yok.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {openPositions.map(pos => {
                const risk = Math.abs(pos.entry - pos.stopLoss) || 1;
                const curR = lastPrice
                  ? (pos.direction === 'LONG' ? lastPrice - pos.entry : pos.entry - lastPrice) / risk
                  : 0;
                const aged = (Date.now() - pos.openedAt) / 1000;
                const isBull = pos.direction === 'LONG';
                return (
                  <div key={pos.id} className="grid grid-cols-5 gap-2 items-center text-[11px] mono py-1.5 border-b border-[var(--border-soft)] last:border-b-0">
                    <div className="truncate">
                      <span className={`font-bold ${isBull ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                        {isBull ? '▲ LONG' : '▼ SHORT'}
                      </span>
                      <div className="text-[9px] text-[var(--text-faint)] truncate">
                        {pos.strategyId || 'DIRECTIONAL'}
                      </div>
                    </div>
                    <div className="text-center text-[var(--text-dim)]">{fmtPrice(pos.entry)}</div>
                    <div className="text-center text-[var(--bull)]">{pos.tp1 ? fmtPrice(pos.tp1) : '—'}</div>
                    <div className="text-center text-[var(--bear)]">{fmtPrice(pos.stopLoss)}</div>
                    <div className={`text-right font-bold ${curR >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                      {curR >= 0 ? '+' : ''}{curR.toFixed(2)}R
                      <div className="text-[9px] text-[var(--text-faint)] font-normal">{Math.floor(aged / 60)}dk {Math.floor(aged % 60)}sn</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-[var(--text-dim)]">
          <b className="text-amber-300">Neden klasik backtest yok?</b> Ücretsiz mum geçmişi,
          gerçek mikro-yapı motorunun ihtiyaç duyduğu order book değişimleri, agresyon tarafı,
          iceberg/spoof izleri ve VPIN verilerini içermiyor. Bu yüzden mumla yapılan “backtest”
          sahte bir stratejiyi test ediyor olurdu. Canlı performans paneli ise gerçekten olanı kaydeder.
        </div>
      </div>
    </div>
  );
};

const Metric: React.FC<{
  label: string;
  value: string;
  accent?: 'bull' | 'bear' | 'warn' | 'accent';
}> = ({ label, value, accent }) => {
  const color =
    accent === 'bull' ? 'text-[var(--bull)]' :
    accent === 'bear' ? 'text-[var(--bear)]' :
    accent === 'warn' ? 'text-[var(--signal)]' :
    accent === 'accent' ? 'text-[var(--accent)]' :
    'text-[var(--text)]';
  return (
    <div className="bg-[var(--panel2)] border border-[var(--border)] rounded-lg p-2 text-center">
      <div className="text-[9px] text-[var(--text-faint)] uppercase">{label}</div>
      <div className={`mt-0.5 text-sm font-extrabold mono ${color}`}>{value}</div>
    </div>
  );
};
