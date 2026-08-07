// BOZOK PRO — DepthTab Orderbook Ladder & Gauges Component

import React, { useRef, useEffect } from 'react';
import { useBozok } from '../../context/BozokContext';
import { fmtPrice, fmtQty } from '../../utils/fmt';
import { canvasPalette } from '../../utils/theme';

export const DepthTab: React.FC = () => {
  const {
    book,
    lastPrice,
    cvd,
    cvdHistory,
    largeCvdHistory,
    smallCvdHistory,
    setFocusPrice,
    setActiveTab
  } = useBozok();

  const cvdCanvasRef = useRef<HTMLCanvasElement>(null);

  // Draw CVD Sparkline
  useEffect(() => {
    const canvas = cvdCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.parentElement ? canvas.parentElement.clientWidth : 200;
    const h = 24;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    if (cvdHistory.length < 2) return;

    const min = Math.min(...cvdHistory);
    const max = Math.max(...cvdHistory);
    const range = max - min || 1;

    ctx.beginPath();
    cvdHistory.forEach((v, i) => {
      const x = (i / (cvdHistory.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = cvdHistory[cvdHistory.length - 1] >= cvdHistory[0] ? canvasPalette.bull : canvasPalette.bear;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }, [cvdHistory]);

  // Orderbook Imbalance (OBI) Calculation
  const bidSum = book.bids.slice(0, 10).reduce((s, l) => s + l.qty, 0);
  const askSum = book.asks.slice(0, 10).reduce((s, l) => s + l.qty, 0);
  const totalQty = bidSum + askSum;
  const obiPct = totalQty > 0 ? ((bidSum - askSum) / totalQty) * 100 : 0;
  const fillPct = Math.min(50, Math.abs(obiPct) / 2);

  const maxQty = Math.max(1, ...book.bids.slice(0, 15).map(b => b.qty), ...book.asks.slice(0, 15).map(a => a.qty));

  const handleRowClick = (price: number) => {
    setFocusPrice(price);
    setActiveTab('bookView');
  };

  return (
    <div className="view active flex flex-col h-full overflow-hidden" id="depthView">
      <div className="scroll flex-1 overflow-y-auto">
        <div id="gaugeRow" className="flex gap-2 p-2 shrink-0">
          <div className="gaugeCard flex-1 bg-[var(--panel)] border border-[var(--border)] rounded-xl p-2.5">
            <div className="gaugeLabel text-[9.5px] text-[var(--text-faint)] uppercase tracking-wider mb-1">
              OBI (Book Imbalance)
            </div>
            <div className={`gaugeVal mono font-bold text-base ${obiPct >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
              {obiPct >= 0 ? '+' : ''}{obiPct.toFixed(1)}%
            </div>
            <div className="obiBar h-1.5 rounded-full bg-[var(--panel2)] mt-1.5 overflow-hidden relative">
              <div
                className="fill absolute top-0 bottom-0 bg-gradient-to-r from-[var(--bear)] to-[var(--bull)] transition-all"
                style={{
                  left: obiPct >= 0 ? '50%' : `${50 - fillPct}%`,
                  width: `${fillPct}%`
                }}
              />
            </div>
          </div>

          <div className="gaugeCard flex-1 bg-[var(--panel)] border border-[var(--border)] rounded-xl p-2.5">
            <div className="gaugeLabel text-[9.5px] text-[var(--text-faint)] uppercase tracking-wider mb-1">
              CVD (Tape Delta)
            </div>
            <div className={`gaugeVal mono font-bold text-base ${cvd >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
              {cvd >= 0 ? '+' : ''}{cvd.toFixed(2)}
            </div>
            <canvas ref={cvdCanvasRef} className="w-full h-6 mt-1" />
          </div>
        </div>

        <div className="ladderHead grid grid-cols-3 text-[9.5px] text-[var(--text-faint)] px-3 py-1.5 uppercase tracking-wider font-bold">
          <span>Miktar</span>
          <span className="text-center">Fiyat</span>
          <span className="text-right">Toplam</span>
        </div>

        {/* Asks (Sells) */}
        <div id="askLadder" className="flex flex-col-reverse">
          {book.asks.slice(0, 15).map(({ price, qty }, idx) => {
            const widthPct = Math.min(100, (qty / maxQty) * 100);
            return (
              <div
                key={`ask_${price}_${idx}`}
                onClick={() => handleRowClick(price)}
                className="ladderRow ask grid grid-cols-3 items-center px-3 py-1 relative font-mono text-xs cursor-pointer hover:bg-[var(--accent)]/10 transition-colors"
              >
                <div className="bar absolute top-0.5 bottom-0.5 right-0 bg-[var(--bear)] opacity-20 rounded" style={{ width: `${widthPct}%` }} />
                <span className="qty relative z-10 text-[var(--bear)] text-left font-semibold">{fmtQty(qty)}</span>
                <span className="px relative z-10 text-[var(--text)] text-center font-bold">{fmtPrice(price)}</span>
                <span className="tot relative z-10 text-[var(--text-dim)] text-right text-[11px]">
                  {fmtQty(book.asks.slice(0, idx + 1).reduce((s, a) => s + a.qty, 0))}
                </span>
              </div>
            );
          })}
        </div>

        {/* Mid Price Divider */}
        <div id="midDivider" className="flex items-center justify-center gap-2 py-1.5 px-2 font-mono text-xs font-bold text-[var(--text-dim)] border-y border-dashed border-[var(--border-soft)] my-1">
          <span>{fmtPrice(lastPrice)}</span>
          <span id="spreadTag" className="text-[10px] text-[var(--text-faint)] font-normal">
            spread {book.asks[0] && book.bids[0] ? fmtPrice(book.asks[0].price - book.bids[0].price) : '—'}
          </span>
        </div>

        {/* Bids (Buys) */}
        <div id="bidLadder">
          {book.bids.slice(0, 15).map(({ price, qty }, idx) => {
            const widthPct = Math.min(100, (qty / maxQty) * 100);
            return (
              <div
                key={`bid_${price}_${idx}`}
                onClick={() => handleRowClick(price)}
                className="ladderRow bid grid grid-cols-3 items-center px-3 py-1 relative font-mono text-xs cursor-pointer hover:bg-[var(--accent)]/10 transition-colors"
              >
                <div className="bar absolute top-0.5 bottom-0.5 left-0 bg-[var(--bull)] opacity-20 rounded" style={{ width: `${widthPct}%` }} />
                <span className="qty relative z-10 text-[var(--bull)] text-left font-semibold">{fmtQty(qty)}</span>
                <span className="px relative z-10 text-[var(--text)] text-center font-bold">{fmtPrice(price)}</span>
                <span className="tot relative z-10 text-[var(--text-dim)] text-right text-[11px]">
                  {fmtQty(book.bids.slice(0, idx + 1).reduce((s, b) => s + b.qty, 0))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
