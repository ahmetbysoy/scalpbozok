// BOZOK PRO — FlowTab Flow Pressure Candles Component

import React, { useRef, useEffect, useState } from 'react';
import { useBozok } from '../../context/BozokContext';
import { canvasPalette } from '../../utils/theme';
import { fmtPrice } from '../../utils/fmt';

export const FlowTab: React.FC = () => {
  const { flowCandles, lastPrice, liquidations, config, setActiveTab } = useBozok();
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : 300;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#03060d';
    ctx.fillRect(0, 0, w, h);

    const shown = flowCandles.slice(-60);
    if (!shown.length) return;

    const area = { x: 44, y: 20, w: w - 54, h: h - 50 };
    const cw = area.w / Math.max(30, shown.length);
    const bw = Math.max(3, cw * 0.6);

    // FlowCandleBuilder OHLC alanlarına gerçek fiyatı (mid) yazar.
    // Eski kod bunları -100..+100 basınç değeri gibi çiziyordu; bu yüzden
    // mumlar ekran dışına çıkıyordu. Gerçek fiyat aralığına göre ölçekle.
    const highs = shown.map(c => c.high);
    const lows = shown.map(c => c.low);
    let maxP = Math.max(...highs);
    let minP = Math.min(...lows);
    if (!Number.isFinite(maxP) || !Number.isFinite(minP) || maxP <= minP) {
      maxP = (lastPrice || 0) + 1;
      minP = (lastPrice || 0) - 1;
    }
    const pad = (maxP - minP) * 0.08 || 1;
    maxP += pad;
    minP = Math.max(0, minP - pad);
    const pRange = maxP - minP || 1;

    const priceToY = (p: number) => area.y + area.h - ((p - minP) / pRange) * area.h;

    // Y axis — fiyat seviyeleri
    ctx.strokeStyle = 'rgba(148,163,184,.12)';
    ctx.fillStyle = 'rgba(234,243,255,.45)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const p = minP + (pRange * i) / yTicks;
      const y = priceToY(p);
      ctx.beginPath();
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.w, y);
      ctx.stroke();
      ctx.fillText(fmtPrice(p), area.x - 5, y + 3);
    }

    // Candles
    shown.forEach((c, i) => {
      const x = area.x + i * cw + cw / 2;
      const yh = priceToY(c.high);
      const yl = priceToY(c.low);
      const yo = priceToY(c.open);
      const yc = priceToY(c.close);

      const isBull = c.close >= c.open;
      const bodyColor = isBull ? canvasPalette.flowBull : canvasPalette.flowBear;
      const wickColor = isBull ? canvasPalette.flowBullWick : canvasPalette.flowBearWick;

      // Wick
      ctx.strokeStyle = wickColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yh);
      ctx.lineTo(x, yl);
      ctx.stroke();

      // Body
      const top = Math.min(yo, yc);
      const bh = Math.max(2, Math.abs(yc - yo));
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x - bw / 2, top, bw, bh);

      // Hacim/akış yoğunluğunu gövdede belirt: aktivite yüksekse
      // kenarlığı hafifçe parlak çiz.
      if (c.activity > 0 && c.strength > 60) {
        ctx.strokeStyle = isBull ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - bw / 2, top, bw, bh);
      }
    });
  }, [flowCandles, lastPrice]);

  const lastCandle = flowCandles[flowCandles.length - 1];

  // signed basınç: alış-satış aktivitesinin oranı (-100..+100)
  const pressureVal = lastCandle && lastCandle.activity > 0
    ? Math.round(((lastCandle.buyActivity - lastCandle.sellActivity) / lastCandle.activity) * 100)
    : 0;
  const isBull = pressureVal > 15;
  const isBear = pressureVal < -15;
  const last60sLiq = liquidations.filter(l => Date.now() - l.timestamp < 60000).length;

  return (
    <div className="view active flex flex-col h-full bg-[#03060d] overflow-hidden" id="flowView">
      <div id="flowHUDContainer" className="p-3 border-b border-white/10 bg-[#02040a]/80 backdrop-blur">
        <div className="flowHUD bg-gradient-to-b from-[#080e1a]/92 to-[#050a14]/88 border border-white/15 rounded-2xl p-3.5 shadow-xl">
          <div className="flowSummary flex items-center justify-between gap-3 mb-2">
            <div className={`flowTitle font-black text-base tracking-wide ${isBull ? 'text-[var(--bull)]' : isBear ? 'text-[var(--bear)]' : 'text-[var(--signal)]'}`}>
              {isBull ? 'ALIM BASKISI HAKİM' : isBear ? 'SATIŞ BASKISI HAKİM' : 'NÖTR / DENGELİ AKIŞ'}
            </div>
            <div className="flowConfidence mono text-xs font-bold text-[var(--accent)]">
              {lastCandle ? `%${Math.round(lastCandle.strength)} KESİNLİK` : '—'}
            </div>
          </div>
          <div className="flowDetails text-xs flex flex-col gap-1 mb-2">
            <div className="flowLiquidation font-bold text-[var(--text)]">
              Son 60sn Tasfiyeler: {last60sLiq} Adet
            </div>
            <div className="flowBreakdown text-[10px] text-[var(--text-faint)] mono border-t border-white/10 pt-1.5 mt-1">
              İmzalı Akış Basıncı: {pressureVal >= 0 ? '+' : ''}{pressureVal} · Pencere: {config.flowTimeframeMs / 1000}s
            </div>
          </div>
          <div className="flowAction flex items-center justify-between gap-2 border-t border-white/10 pt-2">
            <div className="flowActionText text-[11px] text-[var(--text-dim)]">
              {isBull ? "Book sekmesinde üst direnç duvarlarını ve likidite boşluklarını takip et." : isBear ? "Book sekmesinde alt alıcı desteklerini ve emilimleri incele." : "Akış kararsız, daha net sinyal bekleniyor."}
            </div>
            <button
              onClick={() => setActiveTab('bookView')}
              className="flowBookBtn px-3 py-1.5 bg-[var(--bull)]/10 border border-[var(--bull)]/30 rounded-lg text-[var(--bull)] text-[10px] font-extrabold hover:bg-[var(--bull)]/20 transition-all shrink-0"
            >
              Book'ta Gör
            </button>
          </div>
        </div>
      </div>

      <div id="flowWrap" className="relative flex-1 min-h-0 bg-[#03060d]">
        <canvas ref={canvasRef} id="flowCanvas" className="block w-full h-full touch-none" />
        <div id="flowHud" className="absolute top-1.5 left-2 flex gap-1.5 pointer-events-none text-[9px] mono text-[var(--text-faint)]">
          <span className="bg-[#05070c]/62 border border-white/10 px-1.5 py-0.5 rounded">FLOW {config.flowTimeframeMs / 1000}s</span>
          <span className="bg-[#05070c]/62 border border-white/10 px-1.5 py-0.5 rounded">FİYAT: {fmtPrice(lastPrice)}</span>
        </div>
      </div>

      <div id="flowLegendContainer" className="p-2 border-t border-white/10 bg-[#02040a]/62">
        <div className="flowLegend bg-[#050a14]/62 border border-white/10 rounded-xl p-2">
          <div
            onClick={() => setLegendCollapsed(!legendCollapsed)}
            className="legendTitle text-[10px] font-extrabold text-[var(--text-faint)] uppercase tracking-wider mb-1.5 cursor-pointer flex justify-between items-center"
          >
            <span>Flow Candles Lejand</span>
            <span>{legendCollapsed ? '▸' : '▾'}</span>
          </div>
          {!legendCollapsed && (
            <div className="legendItems grid grid-cols-3 gap-1.5 text-[10px] text-[var(--text-dim)]">
              <div className="legendItem flex items-center gap-1.5">
                <span className="w-2 h-3 rounded-sm bg-[var(--bull)] shrink-0"></span>
                <span>Alış baskısı</span>
              </div>
              <div className="legendItem flex items-center gap-1.5">
                <span className="w-2 h-3 rounded-sm bg-[var(--bear)] shrink-0"></span>
                <span>Satış baskısı</span>
              </div>
              <div className="legendItem flex items-center gap-1.5">
                <span className="w-2 h-3 rounded-sm bg-[#64748b] shrink-0"></span>
                <span>Nötr</span>
              </div>
              <div className="legendItem flex items-center gap-1.5">
                <span className="text-[var(--bull)] font-bold">▲</span>
                <span>Short tasfiye</span>
              </div>
              <div className="legendItem flex items-center gap-1.5">
                <span className="text-[var(--bear)] font-bold">▼</span>
                <span>Long tasfiye</span>
              </div>
              <div className="legendItem flex items-center gap-1.5">
                <span className="text-[var(--text-faint)] font-bold">━</span>
                <span>Fiyat mum (OHLC)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
