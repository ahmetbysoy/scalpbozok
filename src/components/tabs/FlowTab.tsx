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

    const w = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
    const h = canvas.parentElement ? canvas.parentElement.clientHeight : 300;
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

    const area = { x: 30, y: 20, w: w - 40, h: h - 50 };
    const cw = area.w / Math.max(30, shown.length);
    const bw = Math.max(3, cw * 0.6);

    // Y Axis Lines
    ctx.strokeStyle = 'rgba(148,163,184,.12)';
    ctx.fillStyle = 'rgba(234,243,255,.45)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';

    [-100, -50, 0, 50, 100].forEach(v => {
      const y = area.y + area.h - (((v + 100) / 200) * area.h);
      ctx.beginPath();
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.w, y);
      ctx.stroke();
      ctx.fillText(v > 0 ? '+' + v : v.toString(), area.x - 4, y + 3);
    });

    // Draw Candles
    shown.forEach((c, i) => {
      const x = area.x + i * cw + cw / 2;
      const yh = area.y + area.h - (((c.high + 100) / 200) * area.h);
      const yl = area.y + area.h - (((c.low + 100) / 200) * area.h);
      const yo = area.y + area.h - (((c.open + 100) / 200) * area.h);
      const yc = area.y + area.h - (((c.close + 100) / 200) * area.h);

      const isBull = c.close >= c.open;
      const bodyColor = isBull ? canvasPalette.flowBull : canvasPalette.flowBear;
      const wickColor = isBull ? canvasPalette.flowBullWick : canvasPalette.flowBearWick;

      ctx.strokeStyle = wickColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yh);
      ctx.lineTo(x, yl);
      ctx.stroke();

      const top = Math.min(yo, yc);
      const bh = Math.max(2, Math.abs(yc - yo));
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x - bw / 2, top, bw, bh);

      // POC indicator
      if (c.poc !== undefined) {
        const pocY = area.y + area.h - (((c.poc + 100) / 200) * area.h);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(x - bw / 2 - 2, pocY);
        ctx.lineTo(x + bw / 2 + 2, pocY);
        ctx.stroke();
      }
    });

  }, [flowCandles]);

  const lastCandle = flowCandles[flowCandles.length - 1];
  const pressureVal = lastCandle ? Math.round(lastCandle.close) : 0;
  const isBull = pressureVal > 15;
  const isBear = pressureVal < -15;

  return (
    <div className="view active flex flex-col h-full bg-[#03060d] overflow-hidden" id="flowView">
      <div id="flowHUDContainer" className="p-3 border-b border-white/10 bg-[#02040a]/80 backdrop-blur">
        <div className="flowHUD bg-gradient-to-b from-[#080e1a]/92 to-[#050a14]/88 border border-white/15 rounded-2xl p-3.5 shadow-xl">
          <div className="flowSummary flex items-center justify-between gap-3 mb-2">
            <div className={`flowTitle font-black text-base tracking-wide ${isBull ? 'text-[var(--bull)]' : isBear ? 'text-[var(--bear)]' : 'text-[var(--signal)]'}`}>
              {isBull ? 'ALIM BASKISI HAKİM' : isBear ? 'SATIŞ BASKISI HAKİM' : 'NÖTR / DENGELİ AKIŞ'}
            </div>
            <div className="flowConfidence mono text-xs font-bold text-[var(--accent)]">
              {lastCandle ? `%${Math.round(lastCandle.strength * 100)} GÜÇ` : '—'}
            </div>
          </div>
          <div className="flowDetails text-xs flex flex-col gap-1 mb-2">
            <div className="flowLiquidation font-bold text-[var(--text)]">
              Son 60sn Tasfiyeler: {liquidations.length} Adet Canlı Patlama
            </div>
            <div className="flowBreakdown text-[10px] text-[var(--text-faint)] mono border-t border-white/10 pt-1.5 mt-1">
              Anlık Akış Basıncı: {pressureVal >= 0 ? '+' : ''}{pressureVal} · Mod: {config.flowCandleMode.toUpperCase()}
            </div>
          </div>
          <div className="flowAction flex items-center justify-between gap-2 border-t border-white/10 pt-2">
            <div className="flowActionText text-[11px] text-[var(--text-dim)]">
              {isBull ? "Book sekmesinde üst direnç duvarlarını ve likidite boşluklarını takip et." : "Book sekmesinde alt alıcı desteklerini ve emilimleri incele."}
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
                <span>Alım baskısı</span>
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
                <span className="text-[#ffd166] font-bold">—</span>
                <span>POC Seviyesi</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
