// BOZOK PRO — BookTab Interactive Heatmap Canvas & Microstructure Engine Component

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useBozok } from '../../context/BozokContext';
import { fmtPrice, fmtQty, tickSizeFor, clamp } from '../../utils/fmt';
import { canvasPalette } from '../../utils/theme';
import { signalUX } from '../../utils/detectors';
import { HeatmapLayerKey, PatternSignal, BookLevel } from '../../types';

interface PinnedAlert {
  id: string;
  price: number;
  timestamp: number;
  label: string;
}

export const BookTab: React.FC = () => {
  const {
    lastPrice,
    book,
    trades,
    heatHistory,
    activePatterns,
    tradePlan,
    liquidations,
    config,
    updateConfig,
    setFocusPrice,
    focusPrice,
    setActiveTab,
    planHitboxes,
    patternHitboxes
  } = useBozok();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggingLine, setDraggingLine] = useState<'inv' | 'tp1' | 'tp2' | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number; price: number; timeAgoSec: number; qtyAtPrice: number } | null>(null);
  const [pinnedAlerts, setPinnedAlerts] = useState<PinnedAlert[]>([]);

  // Parmakla yakınlaştırma (pinch-to-zoom). 1 = otomatik sığdırma.
  // Çift dokunuşla otomatik moda geri döner.
  const [zoomLevel, setZoomLevel] = useState(1);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const lastTapRef = useRef(0);
  const touchMovedRef = useRef(false);

  const rawLayers = config.activeLayers;
  const activeLayers = useMemo(() => {
    if (rawLayers instanceof Set) return rawLayers;
    if (Array.isArray(rawLayers)) return new Set<HeatmapLayerKey>(rawLayers as HeatmapLayerKey[]);
    if (rawLayers && typeof rawLayers === 'object') {
      const keys = Object.keys(rawLayers) as HeatmapLayerKey[];
      if (keys.length > 0) return new Set<HeatmapLayerKey>(keys);
    }
    return new Set<HeatmapLayerKey>(["liquidity", "walls", "trades", "liqpools", "spoofing", "iceberg", "vpvr", "crosshair"]);
  }, [rawLayers]);

  const toggleLayer = useCallback((layer: HeatmapLayerKey) => {
    const nextLayers = new Set(activeLayers);
    if (nextLayers.has(layer)) nextLayers.delete(layer);
    else nextLayers.add(layer);
    updateConfig({ activeLayers: nextLayers });
  }, [activeLayers, updateConfig]);

  // Compute Volume Profile at Price (VPVR) dynamically from live trades & book
  const vpvrData = useMemo(() => {
    if (!lastPrice || trades.length === 0) return { profile: new Map<number, { buy: number; sell: number; total: number }>(), maxVol: 1, pocPrice: lastPrice || 0, vah: 0, val: 0 };
    const tick = tickSizeFor(lastPrice);
    const bucket = tick * 2; // group ticks into buckets for clean profile
    const profile = new Map<number, { buy: number; sell: number; total: number }>();
    let maxVol = 0;
    let pocPrice = lastPrice;

    trades.forEach(tr => {
      const pKey = Math.round(tr.price / bucket) * bucket;
      const cur = profile.get(pKey) || { buy: 0, sell: 0, total: 0 };
      if (tr.side === 'buy') cur.buy += tr.notional;
      else cur.sell += tr.notional;
      cur.total += tr.notional;
      profile.set(pKey, cur);

      if (cur.total > maxVol) {
        maxVol = cur.total;
        pocPrice = pKey;
      }
    });

    // Compute Value Area (70% of total volume around POC)
    const sortedLevels = Array.from(profile.entries()).sort((a, b) => b[1].total - a[1].total);
    const totalVol = sortedLevels.reduce((s, [, v]) => s + v.total, 0);
    let targetVol = totalVol * 0.7;
    let accum = 0;
    const vaPrices: number[] = [];

    for (const [p, v] of sortedLevels) {
      if (accum >= targetVol) break;
      accum += v.total;
      vaPrices.push(p);
    }

    const vah = vaPrices.length ? Math.max(...vaPrices) : pocPrice + tick * 10;
    const val = vaPrices.length ? Math.min(...vaPrices) : pocPrice - tick * 10;

    return { profile, maxVol: Math.max(1, maxVol), pocPrice, vah, val };
  }, [trades, lastPrice]);

  // Main Heatmap Canvas Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wrap = containerRef.current;
    const w = wrap ? wrap.clientWidth : window.innerWidth;
    const h = wrap ? wrap.clientHeight : Math.max(300, window.innerHeight * 0.55);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear background
    ctx.fillStyle = canvasPalette.bg;
    ctx.fillRect(0, 0, w, h);

    if (!heatHistory.length || lastPrice == null || !Number.isFinite(lastPrice)) return;

    const mid = focusPrice != null && Number.isFinite(focusPrice) ? focusPrice : lastPrice;
    const tick = tickSizeFor(mid);
    const visiblePrices = [...book.bids.slice(0, 25), ...book.asks.slice(0, 25)].map(l => l.price).filter(Number.isFinite);
    const maxDist = Math.max(tick * 24, ...visiblePrices.map(p => Math.abs(p - mid)));
    const priceRange = clamp((maxDist * 1.65) / zoomLevel, tick * 24, tick * 260);
    const priceTop = mid + priceRange;
    const priceBot = mid - priceRange;

    const priceToY = (p: number) => h * (1 - (p - priceBot) / (priceTop - priceBot));
    const yToPrice = (y: number) => priceBot + (1 - y / h) * (priceTop - priceBot);

    const winMs = config.heatmapWindowSec * 1000;
    const colW = Math.max(2, w / (winMs / config.sampleIntervalMs));
    const now = Date.now();

    // Determine layout columns
    const vpvrWidth = activeLayers.has('vpvr') ? 70 : 0;
    const cobWidth = window.innerWidth < 768 ? 75 : 110;
    const rightMargin = vpvrWidth + cobWidth;
    const mainCanvasW = w - rightMargin;

    // --------------------------------------------------------------
    // Ortak etiket çakışma kaydı (collision registry)
    // SL/TP, pattern, alert, iceberg, spoof ve fiyat etiketleri aynı
    // haritayı kullanır; birbirinin üstüne binmez, aşağı kayar.
    // --------------------------------------------------------------
    type Rect = { x: number; y: number; w: number; h: number };
    const placed: Rect[] = [];

    // Canlı fiyat kutusu alanını en başta rezerve et — diğer tüm etiketler
    // (iceberg, spoof, pattern, SL/TP, fiyat ekseni) bu bölgeden otomatik kaçınır.
    if (Number.isFinite(mid)) {
      ctx.font = "800 11px 'SFMono-Regular','Roboto Mono',monospace";
      const priceTxtW = ctx.measureText(fmtPrice(mid)).width + 16;
      const priceRowH = 22;
      const priceRowY = priceToY(mid) - priceRowH / 2;
      placed.push({ x: mainCanvasW - priceTxtW - 6, y: priceRowY, w: priceTxtW + 6, h: priceRowH });
    }

    const plotBottom = h - 24;
    const placeLabel = (x: number, y: number, ww: number, hh: number): { x: number; y: number } => {
      let cy = y;
      for (let guard = 0; guard < 24; guard++) {
        const r = { x, y: cy, w: ww, h: hh };
        const hit = placed.some(p =>
          r.x < p.x + p.w && r.x + r.w > p.x &&
          r.y < p.y + p.h && r.y + r.h > p.y
        );
        if (!hit || cy >= plotBottom) {
          placed.push(r);
          return { x, y: Math.min(cy, plotBottom - hh) };
        }
        cy += hh + 2;
      }
      placed.push({ x, y: cy, w: ww, h: hh });
      return { x, y: cy };
    };
    // Ölçülü, opak arka planlı etiket pulu çizer ve yerleşimden geçirir.
    const drawPill = (
      x: number, y: number, text: string, color: string,
      font = '700 9px monospace', align: 'left' | 'right' = 'left'
    ) => {
      ctx.font = font;
      const padX = 5;
      const tw = ctx.measureText(text).width + padX * 2;
      const th = 15;
      const lx = align === 'right' ? x - tw : x;
      const pos = placeLabel(lx, y - th + 2, tw, th);
      ctx.fillStyle = 'rgba(2,4,10,0.88)';
      ctx.fillRect(pos.x, pos.y, tw, th);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(pos.x, pos.y, tw, th);
      ctx.fillStyle = color;
      ctx.fillText(text, pos.x + padX, pos.y + th - 4);
    };

    let maxQty = 1;
    for (const snap of heatHistory) {
      if (snap.maxQty && snap.maxQty > maxQty) maxQty = snap.maxQty;
    }

    // Fiyat ekseni: keyfi 7 dilim yerine 1/2/5×10ⁿ mantığıyla "yuvarlak"
    // fiyat adımlarına oturan grid çizgileri (okunabilirlik için).
    const niceGridStep = (rawStep: number): number => {
      if (!Number.isFinite(rawStep) || rawStep <= 0) return tick;
      const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const norm = rawStep / magnitude;
      const niceNorm = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
      const step = niceNorm * magnitude;
      return Math.max(tick, Math.round(step / tick) * tick);
    };
    const gridStep = niceGridStep((priceRange * 2) / 7);
    const gridPrices: number[] = [];
    for (let gp = Math.ceil(priceBot / gridStep) * gridStep; gp < priceTop; gp += gridStep) {
      gridPrices.push(gp);
    }
    ctx.lineWidth = 1;
    gridPrices.forEach(gp => {
      const gy = priceToY(gp);
      if (gy < 0 || gy > plotBottom) return;
      ctx.strokeStyle = 'rgba(148,163,184,0.08)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(mainCanvasW, gy);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 1. Draw Liquidity Heatmap Cells Layer
    if (activeLayers.has('liquidity')) {
      const rowH = Math.max(1.4, h / ((priceRange / tick) * 2));
      heatHistory.forEach((snap: any) => {
        const x = mainCanvasW - ((now - snap.t) / winMs) * mainCanvasW;
        if (x < -colW || x > mainCanvasW + colW) return;

        const drawLevels = (levels: [number, number][], isBid: boolean) => {
          levels.forEach(([p, q]) => {
            if (Math.abs(p - mid) > priceRange * 1.3) return;
            const y = priceToY(p);
            const intensity = clamp(q / maxQty, 0, 1);
            const color = isBid
              ? `rgba(31, 214, 122, ${0.15 + intensity * 0.75})`
              : `rgba(255, 77, 109, ${0.15 + intensity * 0.75})`;
            ctx.fillStyle = color;
            ctx.fillRect(x - colW / 2, y - rowH / 2, colW + 0.6, Math.max(1, rowH));
          });
        };
        drawLevels(snap.bids, true);
        drawLevels(snap.asks, false);
      });
    }

    // 2. Draw Spoofing Radar (Ghost Wall Cancellations) Layer
    if (activeLayers.has('spoofing') && heatHistory.length > 3) {
      for (let i = 1; i < heatHistory.length; i++) {
        const prevSnap = heatHistory[i - 1];
        const currSnap = heatHistory[i];
        const dtSec = (currSnap.t - prevSnap.t) / 1000;
        if (dtSec > 5) continue;

        const prevBids = new Map(prevSnap.bids);
        const currBids = new Map(currSnap.bids);

        prevBids.forEach((oldQ, p) => {
          if (oldQ > maxQty * 0.45 && Math.abs(p - mid) <= priceRange) {
            const newQ = currBids.get(p) || 0;
            // Wall was significantly reduced or pulled without matching trade volume
            if (newQ < oldQ * 0.2) {
              const x = mainCanvasW - ((now - currSnap.t) / winMs) * mainCanvasW;
              const y = priceToY(p);
              if (x >= 0 && x <= mainCanvasW) {
                ctx.save();
                ctx.setLineDash([3, 3]);
                ctx.strokeStyle = 'rgba(255, 170, 0, 0.85)';
                ctx.lineWidth = 1.2;
                ctx.strokeRect(x - 8, y - 6, 16, 12);
                ctx.setLineDash([]);
                drawPill(x + 10, y, '👻 SPOOF', '#ffaa00', '800 9px monospace');
                ctx.restore();
              }
            }
          }
        });
      }
    }

    // 3. Draw Iceberg Order Absorption Overlay Layer
    if (activeLayers.has('iceberg')) {
      // Geniş kova: komşu tick'ler tek kümede toplanır (gürültü azaltma)
      const icebergBucket = tick * 8;
      const priceFills = new Map<number, number>();
      trades.forEach(tr => {
        if (now - tr.timestamp <= 15000) {
          const pKey = Math.round(tr.price / icebergBucket) * icebergBucket;
          priceFills.set(pKey, (priceFills.get(pKey) || 0) + tr.notional);
        }
      });

      // Sadece en güçlü 3 kümeyi çiz (görsel kalabalığı önler)
      const icebergCandidates = Array.from(priceFills.entries())
        .filter(([p, vol]) => vol > maxQty * 1.8 && Math.abs(p - mid) <= priceRange)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const icebergDrawnYs: number[] = [];

      icebergCandidates.forEach(([p, vol]) => {
        const y = priceToY(p);
        // Dikeyde çakışan etiketleri atla
        if (icebergDrawnYs.some(dy => Math.abs(dy - y) < 16)) return;
        icebergDrawnYs.push(y);

        const dotX = mainCanvasW - 14;
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = '#38bdf8';
        ctx.arc(dotX, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();

        drawPill(dotX - 10, y, `🧊 ICEBERG ${fmtQty(vol / 1000)}k`, '#38bdf8', '800 9px monospace', 'right');
      });
    }

    // 4. Draw Trades Bubble Layer
    if (activeLayers.has('trades')) {
      for (let i = trades.length - 1; i >= 0; i--) {
        const tr = trades[i];
        const age = now - tr.timestamp;
        if (age > winMs) break;
        if (Math.abs(tr.price - mid) > priceRange * 1.3) continue;
        const x = mainCanvasW - (age / winMs) * mainCanvasW;
        const y = priceToY(tr.price);
        const r = clamp(Math.sqrt(tr.qty) * 3.2, 2, 12);

        ctx.beginPath();
        ctx.fillStyle = tr.side === 'buy' ? 'rgba(31, 214, 122, 0.75)' : 'rgba(255, 77, 109, 0.75)';
        ctx.strokeStyle = tr.side === 'buy' ? 'rgba(31, 214, 122, 0.95)' : 'rgba(255, 77, 109, 0.95)';
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 5. Draw Session VPVR Volume Profile Margin
    if (activeLayers.has('vpvr')) {
      const vpvrX = mainCanvasW;
      ctx.fillStyle = 'rgba(5, 8, 16, 0.92)';
      ctx.fillRect(vpvrX, 0, vpvrWidth, h - 20);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.strokeRect(vpvrX, 0, vpvrWidth, h - 20);

      // VPVR başlığı — sağ üstteki toolbar/canvas HUD'uyla çakışmasın diye
      // sütunun alt köşesine (time-axis'in hemen üstü) yerleştiriliyor.
      ctx.font = '800 8px Inter, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.fillText('VPVR', vpvrX + 4, h - 26);

      vpvrData.profile.forEach((val, p) => {
        if (Math.abs(p - mid) > priceRange) return;
        const y = priceToY(p);
        if (y < 0 || y > h - 20) return;

        const totalW = (val.total / vpvrData.maxVol) * (vpvrWidth - 8);
        const buyW = (val.buy / val.total) * totalW;
        const sellW = totalW - buyW;

        // Buy volume bar
        ctx.fillStyle = 'rgba(31, 214, 122, 0.65)';
        ctx.fillRect(vpvrX + 2, y - 2, buyW, 4);

        // Sell volume bar
        ctx.fillStyle = 'rgba(255, 77, 109, 0.65)';
        ctx.fillRect(vpvrX + 2 + buyW, y - 2, sellW, 4);
      });

      // Highlight POC (Point of Control) line
      const pocY = priceToY(vpvrData.pocPrice);
      if (pocY >= 0 && pocY <= h - 20) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, pocY);
        ctx.lineTo(w - cobWidth, pocY);
        ctx.stroke();

        ctx.font = '800 9px monospace';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(`POC ${fmtPrice(vpvrData.pocPrice)}`, vpvrX + 4, pocY - 4);
      }
    }

    // 6. Draw Current Orderbook Right Column
    const cobX = w - cobWidth;
    ctx.fillStyle = 'rgba(2, 4, 10, 0.95)';
    ctx.fillRect(cobX, 0, cobWidth, h - 20);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.20)';
    ctx.beginPath();
    ctx.moveTo(cobX, 0);
    ctx.lineTo(cobX, h - 20);
    ctx.stroke();

    const drawCob = (levels: BookLevel[], isBid: boolean) => {
      levels.slice(0, 25).forEach(({ price: p, qty: q }) => {
        const y = priceToY(p);
        if (y < 0 || y > h - 20) return;
        const bw = clamp((q / maxQty) * (cobWidth - 12), 2, cobWidth - 12);
        ctx.fillStyle = isBid ? 'rgba(31, 214, 122, 0.85)' : 'rgba(255, 77, 109, 0.85)';
        ctx.fillRect(cobX + 2, y - 1, bw, 2.2);
      });
    };
    drawCob(book.bids, true);
    drawCob(book.asks, false);

    // 7. Draw Pinned Alerts & Trade Plan SL / TP lines
    planHitboxes.length = 0;
    if (tradePlan && tradePlan.direction !== 'NEUTRAL') {
      const drawPlanLine = (price: number, label: string, color: string, id: string) => {
        const y = priceToY(price);
        if (y < 0 || y > h - 20) return;
        planHitboxes.push({ id, label, price, y });

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mainCanvasW, y);
        ctx.stroke();
        ctx.setLineDash([]);

        const txt = `${label} ${fmtPrice(price)}`;
        drawPill(8, y + 5, txt, color, "800 10px 'SFMono-Regular','Roboto Mono',monospace", 'left');
      };

      if (tradePlan.stopLoss) drawPlanLine(tradePlan.stopLoss.price, 'STOP-LOSS', canvasPalette.invalidation, 'inv');
      if (tradePlan.tp1) drawPlanLine(tradePlan.tp1.price, 'TAKE-PROFIT 1', canvasPalette.tp1, 'tp1');
      if (tradePlan.tp2) drawPlanLine(tradePlan.tp2.price, 'TAKE-PROFIT 2', canvasPalette.tp2, 'tp2');
    }

    // Draw Pinned Alerts
    pinnedAlerts.forEach(alt => {
      const y = priceToY(alt.price);
      if (y >= 0 && y <= h - 20) {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mainCanvasW, y);
        ctx.stroke();
        ctx.setLineDash([]);

        drawPill(12, y + 5, `🔔 ALERT ${fmtPrice(alt.price)}`, '#a855f7', '800 9px monospace', 'left');
      }
    });

    // 7b. Fiyat ekseni etiketleri — COB sütununun solunda, grid ile hizalı.
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'right';
    gridPrices.forEach(gp => {
      const gy = priceToY(gp);
      if (gy < 0 || gy > plotBottom) return;
      const txt = fmtPrice(gp);
      const tw = ctx.measureText(txt).width;
      // Çakışma kaydından geçir (canlı fiyat/crosshair etiketleriyle çarpışmasın)
      const pos = placeLabel(cobX - tw - 8, gy - 7, tw + 6, 13);
      ctx.fillStyle = 'rgba(2,4,10,0.85)';
      ctx.fillRect(pos.x, pos.y, tw + 6, 13);
      ctx.fillStyle = 'rgba(148,163,184,0.75)';
      ctx.fillText(txt, pos.x + tw + 3, pos.y + 9);
    });
    ctx.textAlign = 'left';

    // 8. Draw Live Price Marker Line
    const py = priceToY(mid);
    ctx.strokeStyle = canvasPalette.signal;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(mainCanvasW, py);
    ctx.stroke();

    const priceTxt = fmtPrice(mid);
    ctx.font = "800 11px 'SFMono-Regular','Roboto Mono',monospace";
    const ptw = ctx.measureText(priceTxt).width + 16;
    ctx.fillStyle = 'rgba(2, 4, 10, 0.95)';
    ctx.fillRect(mainCanvasW - ptw - 6, py - 11, ptw, 22);
    ctx.strokeStyle = canvasPalette.signal;
    ctx.strokeRect(mainCanvasW - ptw - 6, py - 11, ptw, 22);
    ctx.fillStyle = canvasPalette.signal;
    ctx.fillText(priceTxt, mainCanvasW - ptw + 2, py + 4);

    // 9. Draw Active Pattern Overlays & Labels
    patternHitboxes.length = 0;
    const usedLabelYs: number[] = [];
    activePatterns.slice(0, 5).forEach((sig: PatternSignal, idx: number) => {
      const y = priceToY(sig.price);
      if (y < 0 || y > h - 20) return;
      const ux = signalUX(sig);
      const isBull = sig.bias === 'bullish' || sig.bias === 'bull';
      const color = isBull ? canvasPalette.bull : canvasPalette.bear;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(mainCanvasW, y);
      ctx.stroke();

      const labelTxt = `${ux.icon} ${ux.short} ${sig.confidence}%`;
      ctx.font = "700 10px 'SFMono-Regular','Roboto Mono',monospace";
      const tw = ctx.measureText(labelTxt).width + 10;
      const lx = 8 + (idx * 130) % Math.max(100, mainCanvasW - 140);
      const ly = y + 4;
      const pos = placeLabel(lx, ly, tw, 15);
      usedLabelYs.push(pos.y);

      ctx.fillStyle = 'rgba(5, 7, 12, 0.88)';
      ctx.fillRect(pos.x, pos.y, tw, 15);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(pos.x, pos.y, tw, 15);
      ctx.fillStyle = color;
      ctx.fillText(labelTxt, pos.x + 5, pos.y + 11);

      patternHitboxes.push({ x: pos.x, y: pos.y, w: tw, h: 15, pattern: sig });
    });

    // 10. Crosshair Inspector Overlay
    if (activeLayers.has('crosshair') && hoverPos && hoverPos.x <= mainCanvasW) {
      const cx = hoverPos.x;
      const cy = hoverPos.y;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h - 20);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(mainCanvasW, cy);
      ctx.stroke();

      // Crosshair Price Tag on Axis
      const hoverPrice = yToPrice(cy);
      const tagTxt = fmtPrice(hoverPrice);
      ctx.font = '800 10px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(mainCanvasW - 65, cy - 10, 60, 20);
      ctx.fillStyle = '#000000';
      ctx.fillText(tagTxt, mainCanvasW - 60, cy + 3);

      ctx.restore();
    }

    // 11. Time Axis
    ctx.fillStyle = 'rgba(136, 148, 168, 0.5)';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText('ŞİMDİ', mainCanvasW - 32, h - 6);
    ctx.fillText('-30s', mainCanvasW / 2, h - 6);
    ctx.fillText('-60s', 12, h - 6);

  }, [heatHistory, lastPrice, book, trades, activePatterns, tradePlan, config, focusPrice, activeLayers, planHitboxes, patternHitboxes, vpvrData, hoverPos, pinnedAlerts, zoomLevel]);

  // Handle Drag-to-Trade Mouse Down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const hit = planHitboxes.find((b: any) => Math.abs(y - b.y) <= 12);
    if (hit) {
      setDraggingLine(hit.id as any);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !lastPrice) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = clamp(e.clientY - rect.top, 10, rect.height - 30);

    const mid = focusPrice != null && Number.isFinite(focusPrice) ? focusPrice : lastPrice;
    const tick = tickSizeFor(mid);
    const visiblePrices = [...book.bids.slice(0, 25), ...book.asks.slice(0, 25)].map(l => l.price).filter(Number.isFinite);
    const maxDist = Math.max(tick * 24, ...visiblePrices.map(p => Math.abs(p - mid)));
    const priceRange = clamp((maxDist * 1.65) / zoomLevel, tick * 24, tick * 260);
    const priceTop = mid + priceRange;
    const priceBot = mid - priceRange;

    const hoverPrice = priceBot + (1 - y / rect.height) * (priceTop - priceBot);

    // Estimate orderbook quantity at hovered price level
    const matchBid = book.bids.find(b => Math.abs(b.price - hoverPrice) < tick * 1.5);
    const matchAsk = book.asks.find(a => Math.abs(a.price - hoverPrice) < tick * 1.5);
    const qtyAtPrice = matchBid ? matchBid.qty : (matchAsk ? matchAsk.qty : 0);

    setHoverPos({
      x,
      y,
      price: hoverPrice,
      timeAgoSec: Math.round(((rect.width - x) / rect.width) * config.heatmapWindowSec),
      qtyAtPrice
    });

    if (draggingLine && tradePlan) {
      if (draggingLine === 'inv' && tradePlan.stopLoss) {
        tradePlan.stopLoss.price = hoverPrice;
      } else if (draggingLine === 'tp1' && tradePlan.tp1) {
        tradePlan.tp1.price = hoverPrice;
      } else if (draggingLine === 'tp2' && tradePlan.tp2) {
        tradePlan.tp2.price = hoverPrice;
      }
    }
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
    setDraggingLine(null);
  };

  const handleMouseUp = () => {
    setDraggingLine(null);
  };

  // Parmakla yakınlaştırma (2 parmak) + çift dokunuşla otomatik moda dönüş (1 parmak)
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    touchMovedRef.current = false;
    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchRef.current = { startDist: dist, startZoom: zoomLevel };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        setZoomLevel(1); // çift dokunuş: otomatik sığdırmaya dön
        pinchRef.current = null;
      }
      lastTapRef.current = now;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      touchMovedRef.current = true;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scale = dist / pinchRef.current.startDist;
      setZoomLevel(clamp(pinchRef.current.startZoom * scale, 0.4, 3));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  // Canvas Click for Focus Pattern or Alarm Pinning
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingLine) return;
    // Pinch hareketinden sonra sentetik click'in alarm kurmasını engelle.
    if (touchMovedRef.current) {
      touchMovedRef.current = false;
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = patternHitboxes.find((b: any) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) {
      setFocusPrice(hit.pattern.price);
      setActiveTab('levelsView');
      return;
    }

    // Otherwise, toggle/pin alert line at target price
    if (hoverPos) {
      const p = hoverPos.price;
      const existing = pinnedAlerts.find(a => Math.abs(a.price - p) < (lastPrice || 1) * 0.0002);
      if (existing) {
        setPinnedAlerts(pinnedAlerts.filter(a => a.id !== existing.id));
      } else {
        setPinnedAlerts([...pinnedAlerts, {
          id: `alt_${Date.now()}`,
          price: p,
          timestamp: Date.now(),
          label: `ALERT ${fmtPrice(p)}`
        }]);
      }
    }
  };

  // Latest Microstructure Anomaly Ticker
  const recentAnomaly = useMemo(() => {
    if (activePatterns.length > 0) {
      return activePatterns[0];
    }
    if (liquidations.length > 0) {
      const lastLiq = liquidations[0];
      return {
        title: `TASFİYE SPATI (${lastLiq.side.toUpperCase()})`,
        explanation: `${fmtPrice(lastLiq.price)} seviyesinde $${fmtQty((lastLiq.notionalUsd || 10000) / 1000)}k hacim patladı`,
        severity: 'high' as const
      };
    }
    return null;
  }, [activePatterns, liquidations]);

  return (
    <div className="view active flex flex-col h-full overflow-hidden bg-[#030509]" id="bookView">
      {/* Top Layer Control Bar — mobilde 4 sütun x 2 satır, masaüstünde tek satır */}
      <div className="layerBar grid grid-cols-4 sm:flex sm:flex-wrap gap-1.5 p-2 bg-[#050810] border-b border-[var(--border)] shrink-0 items-center">
        <span className="hidden sm:inline text-[10px] font-bold tracking-wider text-[var(--accent)] uppercase mr-1 col-span-4 sm:col-span-1 self-center">Katmanlar:</span>
        <button
          onClick={() => toggleLayer('liquidity')}
          className={`layerBtn text-[10.5px] px-2 py-1 rounded-full border border-[var(--border)] font-bold transition-all truncate ${activeLayers.has('liquidity') ? 'text-black bg-[var(--accent)] border-[var(--accent)] shadow-[0_0_8px_rgba(31,214,122,0.4)]' : 'text-[var(--text-dim)] bg-[var(--panel2)]'}`}
        >
          Likidite
        </button>
        <button
          onClick={() => toggleLayer('trades')}
          className={`layerBtn text-[10.5px] px-2 py-1 rounded-full border border-[var(--border)] font-bold transition-all truncate ${activeLayers.has('trades') ? 'text-black bg-[var(--accent)] border-[var(--accent)] shadow-[0_0_8px_rgba(31,214,122,0.4)]' : 'text-[var(--text-dim)] bg-[var(--panel2)]'}`}
        >
          İşlemler
        </button>
        <button
          onClick={() => toggleLayer('spoofing')}
          className={`layerBtn text-[10.5px] px-2 py-1 rounded-full border border-[var(--border)] font-bold transition-all truncate ${activeLayers.has('spoofing') ? 'text-black bg-amber-400 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-[var(--text-dim)] bg-[var(--panel2)]'}`}
          title="Sahte Emir / Duvar İptalleri Radar Katmanı"
        >
          👻 Spoof
        </button>
        <button
          onClick={() => toggleLayer('iceberg')}
          className={`layerBtn text-[10.5px] px-2 py-1 rounded-full border border-[var(--border)] font-bold transition-all truncate ${activeLayers.has('iceberg') ? 'text-black bg-sky-400 border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]' : 'text-[var(--text-dim)] bg-[var(--panel2)]'}`}
          title="Gizli Buzdağı Emir Emilim Tespiti"
        >
          🧊 Iceberg
        </button>
        <button
          onClick={() => toggleLayer('vpvr')}
          className={`layerBtn text-[10.5px] px-2 py-1 rounded-full border border-[var(--border)] font-bold transition-all truncate ${activeLayers.has('vpvr') ? 'text-black bg-emerald-400 border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-[var(--text-dim)] bg-[var(--panel2)]'}`}
          title="Fiyat Seviyesine Göre Hacim Profili (VPVR & POC)"
        >
          📊 VPVR
        </button>
        <button
          onClick={() => toggleLayer('crosshair')}
          className={`layerBtn text-[10.5px] px-2 py-1 rounded-full border border-[var(--border)] font-bold transition-all truncate ${activeLayers.has('crosshair') ? 'text-black bg-purple-400 border-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]' : 'text-[var(--text-dim)] bg-[var(--panel2)]'}`}
          title="Mikro-Yapı Dedektör İmleci"
        >
          🎯 İmleç
        </button>
        <button
          onClick={() => toggleLayer('liqpools')}
          className={`layerBtn text-[10.5px] px-2 py-1 rounded-full border border-[var(--border)] font-bold transition-all truncate ${activeLayers.has('liqpools') ? 'text-black bg-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-dim)] bg-[var(--panel2)]'}`}
          title="Kaldıraçlı Tasfiye Havuzları"
        >
          💧 Liq
        </button>
      </div>

      {/* Live Microstructure Event Ticker Top Banner */}
      {recentAnomaly && (
        <div className="bg-[#0b0f19] border-b border-amber-500/20 px-3 py-1 flex items-center justify-between text-[11px] shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 font-extrabold px-2 py-0.5 rounded text-[9.5px] uppercase tracking-wider animate-pulse">
              🚨 CANLI ANOMALİ
            </span>
            <span className="font-bold text-white truncate">{recentAnomaly.title}</span>
            <span className="text-[var(--text-dim)] truncate hidden sm:inline">— {recentAnomaly.explanation}</span>
          </div>
          <span
            className="text-[9.5px] font-mono text-[var(--accent)] bg-[var(--panel2)] px-1.5 py-0.5 rounded shrink-0"
            title="Kural tabanlı PatternEngine v2 + mikro-yapı detektörleri"
          >
            KURAL MOTORU
          </span>
        </div>
      )}

      {/* Main Heatmap Canvas Area */}
      <div ref={containerRef} id="heatmapWrap" className={`relative flex-1 bg-[#020408] overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 bg-[#020408]' : ''}`}>
        <canvas
          ref={canvasRef}
          id="heatmapCanvas"
          className="block w-full h-full touch-none cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onClick={handleCanvasClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* Floating Crosshair Microstructure Inspector HUD Box */}
        {activeLayers.has('crosshair') && hoverPos && (
          <div
            className="absolute z-30 pointer-events-none bg-[#080d1a]/95 border border-[#38bdf8]/50 rounded-lg p-2.5 shadow-[0_0_15px_rgba(56,189,248,0.25)] backdrop-blur text-[11px] font-mono flex flex-col gap-1 w-52"
            style={{
              left: Math.min(hoverPos.x + 15, (containerRef.current?.clientWidth || 300) - 220),
              top: Math.min(hoverPos.y + 15, (containerRef.current?.clientHeight || 300) - 130)
            }}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-1">
              <span className="text-[#38bdf8] font-black">FİYAT İNCELEME</span>
              <span className="text-gray-400 text-[9.5px]">-{hoverPos.timeAgoSec}sn</span>
            </div>
            <div className="flex justify-between items-center text-white font-bold">
              <span className="text-gray-400">Seviye:</span>
              <span className="text-amber-400 font-mono">{fmtPrice(hoverPos.price)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Sipariş Derinliği:</span>
              <span className="text-emerald-400 font-mono">{fmtQty(hoverPos.qtyAtPrice)}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] text-purple-300 pt-0.5">
              <span>Aksiyon:</span>
              <span className="bg-purple-950/80 px-1.5 py-0.5 rounded text-purple-200">Tıkla & Alarm Kur 🔔</span>
            </div>
          </div>
        )}

        {/* Top-Left Canvas HUD Info */}
        <div id="heatmapHud" className="absolute top-2 left-2 flex gap-1.5 text-[10px] text-[var(--text-faint)] mono pointer-events-none z-10">
          <span className="bg-[#05070c]/80 border border-white/10 px-2 py-0.5 rounded font-bold text-gray-300">{config.heatmapWindowSec}s Pencere</span>
          <span className="bg-[#05070c]/80 border border-white/10 px-2 py-0.5 rounded font-bold text-gray-300">±{fmtPrice((lastPrice || 0) * 0.005)} Range</span>
          <span className="bg-[#05070c]/80 border border-emerald-500/30 px-2 py-0.5 rounded font-bold text-[var(--bull)]">VERİ AKIŞI AKTİF</span>
        </div>

        {/* Fullscreen + Zoom Reset Buttons */}
        <div className="chartToolbar absolute top-2 right-2 z-20 flex gap-1.5 pointer-events-auto">
          {Math.abs(zoomLevel - 1) > 0.05 && (
            <button
              onClick={() => setZoomLevel(1)}
              className="chartToolBtn h-8 px-2.5 rounded-lg bg-[#05070c]/80 border border-[var(--accent)]/50 text-[var(--accent)] flex items-center justify-center text-[10px] font-bold backdrop-blur"
              aria-label="Otomatik yakınlaştırmaya dön"
            >
              {zoomLevel.toFixed(1)}× · AUTO
            </button>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="chartToolBtn w-8 h-8 rounded-lg bg-[#05070c]/80 border border-white/10 text-gray-300 flex items-center justify-center text-sm backdrop-blur hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all"
            aria-label="Tam ekran"
          >
            {isFullscreen ? '✕' : '⛶'}
          </button>
        </div>
      </div>
    </div>
  );
};

