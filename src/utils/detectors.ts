// BOZOK PRO — Orderbook & Microstructure Detector Engines

import {
  Side,
  PatternSignal,
  BookLevel,
  Trade,
  LiquidationEvent,
  LiquidationPool,
  FlowCandle
} from '../types';
import {
  fmtPrice,
  fmtQty,
  median,
  clamp,
  tickSizeFor,
  roundToTick
} from './fmt';
import { canvasPalette } from './theme';

let patternSeq = 0;

export function signalUX(sig: PatternSignal) {
  const type = (sig.type || '').toUpperCase();
  const bias = sig.bias || 'warning';
  const rawText = ((sig.explanation || '') + '').toLowerCase();
  const side = sig.metadata?.side || (type.includes('BID') ? 'bid' : type.includes('ASK') ? 'ask' : rawText.includes('bid') ? 'bid' : rawText.includes('ask') ? 'ask' : null);
  const isBull = bias === 'bullish' || bias === 'bull';
  const isBear = bias === 'bearish' || bias === 'bear';
  const base = {
    icon: isBull ? '🟢' : isBear ? '🔴' : '⚠️',
    title: sig.title || 'Sinyal',
    short: sig.title || 'Sinyal',
    action: sig.explanation || 'Orderbook sinyali',
    direction: isBull ? 'ALIM FİKRİ' : isBear ? 'SATIŞ FİKRİ' : 'DİKKAT / BEKLE',
    hint: 'Sinyali takip et'
  };

  if (type === 'STRONG_BID_WALL') return { icon: '🛡️', title: 'ALICI DUVARI', short: 'ALICI', action: 'Fiyat altında güçlü alıcı var. Yukarı tepki gelebilir.', direction: 'ALIM FİKRİ', hint: 'Destek bölgesi. Altına inilirse fikir bozulur.' };
  if (type === 'STRONG_ASK_WALL') return { icon: '🧱', title: 'SATICI DUVARI', short: 'SATICI', action: 'Fiyat üstünde güçlü satıcı var. Düşüş/ret gelebilir.', direction: 'SATIŞ FİKRİ', hint: 'Direnç bölgesi. Üstüne çıkılırsa fikir bozulur.' };
  if (type === 'WALL_PULL' || type === 'SPOOF' || type === 'SPOOF TRAP') {
    if (side === 'bid') return { icon: '⚠️', title: 'DESTEK ÇEKİLDİ', short: 'DESTEK GİTTİ', action: 'Alış duvarı kayboldu. Aşağı düşüş riski artar.', direction: 'SATIŞ RİSKİ', hint: 'Spoof/trap; destek zayıfladı uyarısıdır.' };
    if (side === 'ask') return { icon: '⚠️', title: 'DİRENÇ ÇEKİLDİ', short: 'DİRENÇ GİTTİ', action: 'Satış duvarı kayboldu. Yukarı hareket alanı açılabilir.', direction: 'ALIM RİSKİ/FIRSATI', hint: 'Direnç zayıfladı uyarısıdır.' };
    return { icon: '⚠️', title: 'DUVAR ÇEKİLDİ', short: 'DUVAR GİTTİ', action: 'Büyük emir hızlı kayboldu. Fiyat o yöne hızlı hareket edebilir.', direction: 'DİKKAT', hint: 'Piyasa manipülasyonu veya normal emir iptali olabilir.' };
  }
  if (type === 'ABSORPTION' || type === 'ABSORPTION WALL') {
    if (side === 'bid' || isBull) return { icon: '🟢', title: 'SATIŞ EMİLİYOR', short: 'EMİLİM', action: 'Satışlar geliyor ama alıcılar tutuyor. Yukarı tepki gelebilir.', direction: 'ALIM FİKRİ', hint: 'Alıcı savunması görülüyor.' };
    return { icon: '🔴', title: 'ALIM EMİLİYOR', short: 'EMİLİM', action: 'Alımlar geliyor ama satıcılar tutuyor. Aşağı dönüş olabilir.', direction: 'SATIŞ FİKRİ', hint: 'Satıcı savunması görülüyor.' };
  }
  if (type === 'LIQUIDITY_VOID' || type === 'VOID') {
    if (isBull) return { icon: '⬆️', title: 'YUKARI BOŞLUK', short: 'YUKARI BOŞ', action: 'Üst tarafta likidite ince. Fiyat hızlı yukarı süpürebilir.', direction: 'ALIM FİKRİ', hint: 'Boşluk hedef değil, hızlı hareket riski demektir.' };
    return { icon: '⬇️', title: 'AŞAĞI BOŞLUK', short: 'AŞAĞI BOŞ', action: 'Alt tarafta likidite ince. Fiyat hızlı aşağı kayabilir.', direction: 'SATIŞ FİKRİ', hint: 'Boşluk hedef değil, hızlı hareket riski demektir.' };
  }
  if (type === 'LADDER_BUILDING' || type === 'LADDER') return { icon: '🪜', title: isBull ? 'ALICI DİZİLİMİ' : 'SATICI DİZİLİMİ', short: isBull ? 'ALICI DİZİ' : 'SATICI DİZİ', action: isBull ? 'Alıcılar kademeli destek kuruyor. Yukarı baskı oluşabilir.' : 'Satıcılar kademeli direnç kuruyor. Aşağı baskı oluşabilir.', direction: isBull ? 'ALIM FİKRİ' : 'SATIŞ FİKRİ', hint: 'Tek seviye değil, birkaç kademe birlikte oluşuyor.' };
  if (type === 'COMPRESSION_ZONE' || type === 'COMPRESSION') return { icon: '◆', title: 'SIKIŞMA', short: 'SIKIŞMA', action: 'Fiyat iki duvar arasında sıkıştı. Sert hareket gelebilir; yön için kırılım bekle.', direction: 'BEKLE', hint: 'Kırılım yönü gelmeden al/sat demek risklidir.' };
  if (type === 'ICEBERG' || type === 'HIDDEN ICEBERG') return { icon: '🧊', title: isBull ? 'GİZLİ ALICI' : 'GİZLİ SATICI', short: 'ICEBERG', action: 'Uzun süre dayanan büyük emir — kurumsal birikim/dağıtım olabilir.', direction: isBull ? 'ALIM FİKRİ' : 'SATIŞ FİKRİ', hint: 'Seviye tekrar görünürse güçlü referans noktası.' };
  if (type === 'FLOW_BULL') return { icon: '🟢', title: 'ALIM AKIŞI GÜÇLENİYOR', short: 'AKIŞ ↑', action: 'Son mumlarda alış baskısı artıyor.', direction: 'ALIM FİKRİ', hint: 'Flow baskısı derinlik + işlem akışından türetilir.' };
  if (type === 'FLOW_BEAR') return { icon: '🔴', title: 'SATIŞ AKIŞI GÜÇLENİYOR', short: 'AKIŞ ↓', action: 'Son mumlarda satış baskısı artıyor.', direction: 'SATIŞ FİKRİ', hint: 'Flow baskısı derinlik + işlem akışından türetilir.' };
  if (type === 'FLOW_REV_UP' || type === 'FLOW_REV_DOWN') return { icon: '↩️', title: type === 'FLOW_REV_UP' ? 'AKIŞ YUKARI DÖNDÜ' : 'AKIŞ AŞAĞI DÖNDÜ', short: 'DÖNÜŞ', action: type === 'FLOW_REV_UP' ? 'Satış baskısı yerini alıma bırakıyor.' : 'Alım baskısı yerini satışa bırakıyor.', direction: type === 'FLOW_REV_UP' ? 'ALIM FİKRİ' : 'SATIŞ FİKRİ', hint: '5 mumluk yapıda yön değişimi görüldü.' };
  if (type === 'FLOW_EXH_UP' || type === 'FLOW_EXH_DOWN') return { icon: '⏸️', title: type === 'FLOW_EXH_UP' ? 'ALIM MOMENTUMU ZAYIFLIYOR' : 'SATIŞ MOMENTUMU ZAYIFLIYOR', short: 'YORULMA', action: 'Momentum kademeli düşüyor — mevcut yön gücünü kaybediyor olabilir.', direction: 'DİKKAT / BEKLE', hint: 'Güçlü akışın son aşaması olabilir.' };
  if (type === 'CVD_DIVERGENCE') return { icon: '⚖️', title: 'FİYAT-CVD DİVERJANSI', short: 'DİVERJANS', action: 'Fiyat ile işlem deltası zıt yönde — mevcut hareketin gücü azalıyor olabilir.', direction: 'DİKKAT / BEKLE', hint: 'Diverjans tek başına ters sinyal değil; destek/dirençle birlikte değerlendir.' };
  if (type === 'HIDDEN_ABSORPTION') return { icon: '🫥', title: isBull ? 'GİZLİ ALIM' : 'GİZLİ SATIM', short: 'EMİLİM', action: 'Fiyat sabitken tek tarafa agresif emir iniyor — limit emirler yutuyor, gizli emilim.', direction: isBull ? 'ALIM FİKRİ' : 'SATIŞ FİKRİ', hint: 'Fiyat hareket etmiyorsa taraf güçlü demektir.' };
  if (type === 'SMART_MONEY_DISTRIBUTION') return { icon: '🐋', title: 'AKILLI PARA DAĞITIYOR', short: 'SMD', action: 'Balina satarken retail alıyor — yukarı hareket dağıtım amaçlı olabilir.', direction: 'SATIŞ RİSKİ', hint: 'Balina CVD ile retail CVD zıtlaştığında tehlikeli.' };
  if (type === 'HERDING') return { icon: '🐑', title: 'DUVAR SÜRÜLÜYOR', short: 'SÜRÜLEME', action: 'Duvar iptal edilip aynı hacimle yakın fiyata taşınıyor — fiyat sürülme baskısı.', direction: isBull ? 'ALIM FİKRİ' : 'SATIŞ FİKRİ', hint: 'Fiyatı hedefe sürüklemek için duvar kaydırma taktiği.' };
  if (type === 'BOOK_SKEW') return { icon: '⚖️', title: isBull ? 'BİD AĞIRLIKLI BOOK' : 'ASK AĞIRLIKLI BOOK', short: 'SKEW', action: isBull ? 'Alıcı duvarları satıcılardan belirgin ağır — MM aşağıyı destekliyor.' : 'Satıcı duvarları alıcılardan belirgin ağır — MM yukarıyı satıyor.', direction: isBull ? 'ALIM FİKRİ' : 'SATIŞ FİKRİ', hint: 'Derinlik asimetrisi; teyit için fiyat hareketini bekle.' };
  if (type === 'ALGOWAR' || type === 'ALGO WAR') return { icon: '🤖', title: 'PİYASA GÜRÜLTÜLÜ', short: 'GÜRÜLTÜ', action: 'Botlar hızlı emir değiştiriyor. Manuel işlem için beklemek daha güvenli.', direction: 'BEKLE', hint: 'Çok hızlı emir ekleme/iptal var.' };
  if (type === 'SHORT_LIQUIDATION_CLUSTER') return { icon: '🟢', title: "SHORT'LAR PATLIYOR", short: 'SHORT PATLIYOR', action: 'Short pozisyonlar tasfiye oluyor. Yukarı hareket güçlenebilir.', direction: 'ALIM FİKRİ', hint: 'Short tasfiye = pozisyon kapatmak için market buy baskısı.' };
  if (type === 'LONG_LIQUIDATION_CLUSTER') return { icon: '🔴', title: "LONG'LAR PATLIYOR", short: 'LONG PATLIYOR', action: 'Long pozisyonlar tasfiye oluyor. Aşağı satış baskısı artabilir.', direction: 'SATIŞ FİKRİ', hint: 'Long tasfiye = pozisyon kapatmak için market sell baskısı.' };
  if (type === 'LIQUIDATION_CASCADE') return { icon: '⚡', title: 'TASFİYE DALGASI', short: 'TASFİYE', action: 'Zincirleme tasfiye var. Sert hareket devam edebilir.', direction: isBull ? 'ALIM FİKRİ' : 'SATIŞ FİKRİ', hint: 'Aynı yönde art arda tasfiye yüksek volatilite yaratır.' };
  if (type === 'STOP_HUNT_SWEEP') return { icon: '🎯', title: 'STOP-HUNT SWEEP', short: 'SWEEP', action: 'Fiyat tepe/dip iğneledi ve hemen geri döndü — stop-loss avı tespiti.', direction: isBull ? 'ALIM FİKRİ' : 'SATIŞ FİKRİ', hint: 'İğnelenen seviye ihlal edildikten sonra ret geldi.' };
  return base;
}

export function createPatternSignal(data: Partial<PatternSignal>): PatternSignal {
  const t = Date.now();
  const bias = data.bias || 'warning';
  const conf = Math.round(clamp(data.confidence || 0, 0, 100));
  const bull = bias === 'bullish' || bias === 'bull';
  const bear = bias === 'bearish' || bias === 'bear';
  const color = bull ? canvasPalette.bull : bear ? canvasPalette.bear : canvasPalette.signal;
  
  let icon = '•';
  try { icon = signalUX(data as PatternSignal).icon || '•'; } catch (e) {}

  const short = (data.type || 'SIGNAL').replace('STRONG_', '').replace('_WALL', '').replace('_', ' ');

  return {
    id: `${data.type}_${t}_${++patternSeq}`,
    type: data.type || 'SIGNAL',
    title: data.title || 'Signal',
    bias,
    price: data.price || 0,
    zone: data.zone || null,
    confidence: conf,
    severity: data.severity || 'medium',
    timeframe: data.timeframe || '5min',
    explanation: data.explanation || '',
    invalidation: data.invalidation || null,
    createdAt: t,
    t,
    metadata: data.metadata || {},
    confidenceBreakdown: data.confidenceBreakdown || null,
    visual: data.visual || { color, style: bear ? 'dashed' : 'solid', label: `${short} ${conf}%`, icon }
  };
}

export class StrongWallDetector {
  side: Side;
  history = new Map<string, { firstSeen: number; lastSeen: number; samples: number; maxNotional: number; side: Side; price: number; cancelledAt?: number }>();
  maxHistorySize = 500;
  private _sortedWalls: { price: number; notional: number }[] = [];

  constructor(side: Side) {
    this.side = side;
  }

  analyze(rows: BookLevel[], mid: number, allWalls: { price: number; notional: number }[], wallMult = 3.5, minPatternConfidence = 65): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const threshold = this.calculateDynamicThreshold(rows, wallMult);
    const t = Date.now();
    const seenThisTick = new Set<string>();

    this._sortedWalls = allWalls.map(w => ({ price: w.price, notional: w.notional })).sort((a, b) => a.price - b.price);

    for (const row of rows) {
      const notional = row.notional || row.price * row.qty;
      seenThisTick.add(`${this.side}:${row.price}`);
      if (notional < threshold) continue;

      const key = `${this.side}:${row.price}`;
      const existing = this.history.get(key);
      if (existing) {
        existing.lastSeen = t;
        existing.samples++;
        existing.maxNotional = Math.max(existing.maxNotional, notional);
      } else {
        if (this.history.size >= this.maxHistorySize) {
          let oldestKey: string | null = null, oldestTime = Infinity;
          for (const [k, v] of this.history) {
            if (v.lastSeen < oldestTime) { oldestTime = v.lastSeen; oldestKey = k; }
          }
          if (oldestKey) this.history.delete(oldestKey);
        }
        const step = tickSizeFor(row.price) * 8;
        for (const [k, h] of this.history) {
          if (h.side === this.side && h.cancelledAt && t - h.cancelledAt < 15000 && Math.abs(h.price - row.price) < step && h.maxNotional >= notional * 0.6) {
            signals.push(createPatternSignal({
              type: 'HERDING',
              title: 'Wall Herding / Price Drive',
              bias: this.side === 'bid' ? 'bullish' : 'bearish',
              price: row.price,
              confidence: clamp(55 + Math.min(h.maxNotional / notional, 1) * 15, 55, 85),
              severity: 'medium',
              timeframe: '2-10min',
              explanation: `${this.side === 'bid' ? 'Bid' : 'Ask'} wall moved from ${fmtPrice(h.price)} to ${fmtPrice(row.price)} (same size) — price-driving behavior`,
              invalidation: this.side === 'bid' ? row.price * 0.997 : row.price * 1.003,
              metadata: { side: this.side, fromPrice: h.price, toPrice: row.price, movedPct: Math.abs(row.price - h.price) / row.price * 100 }
            }));
          }
        }
        this.history.set(key, { firstSeen: t, lastSeen: t, samples: 1, maxNotional: notional, side: this.side, price: row.price });
      }

      const hist = this.history.get(key)!;
      const persistence = this.calculatePersistence(hist);
      const cluster = this.getCluster(row, rows, threshold);
      const distanceScore = this.calculateDistanceScore(row.price, mid);
      const multiExchangeVisible = this.isMultiExchangeVisible(row.price, notional);
      const sizeScore = clamp(notional / threshold, 0, 3) / 3;
      const clusterScore = cluster.size >= 2 ? 1 : 0;
      const multiScore = multiExchangeVisible ? 1 : 0;

      const breakdown = {
        size: sizeScore * 25,
        persistence: persistence * 25,
        cluster: clusterScore * 20,
        proximity: distanceScore * 15,
        multiExchange: multiScore * 15
      };
      const confidence = Object.values(breakdown).reduce((a, b) => a + b, 0);

      if (confidence >= minPatternConfidence - 10) {
        signals.push(createPatternSignal({
          type: this.side === 'bid' ? 'STRONG_BID_WALL' : 'STRONG_ASK_WALL',
          title: this.side === 'bid' ? 'Strong Support Wall' : 'Strong Resistance Wall',
          bias: this.side === 'bid' ? 'bullish' : 'bearish',
          price: row.price,
          zone: cluster.size >= 2 ? { low: cluster.low, high: cluster.high } : null,
          confidence,
          severity: confidence > 80 ? 'high' : 'medium',
          timeframe: persistence > 0.7 ? '10-30min' : '2-10min',
          explanation: this.generateExplanation(row, notional, persistence, cluster.size >= 2, multiExchangeVisible),
          invalidation: this.side === 'bid' ? row.price - Math.max(tickSizeFor(row.price), row.price * 0.0005) : row.price + Math.max(tickSizeFor(row.price), row.price * 0.0005),
          confidenceBreakdown: breakdown,
          metadata: { notional, qty: row.qty, persistence, isCluster: cluster.size >= 2, clusterSize: cluster.size, multiExchange: multiExchangeVisible, threshold, distanceScore }
        }));
      }
    }

    for (const [k, h] of this.history) {
      if (!seenThisTick.has(k) && !h.cancelledAt) h.cancelledAt = t;
    }
    this.cleanupHistory();
    return signals;
  }

  calculateDynamicThreshold(rows: BookLevel[], wallMult = 3.5): number {
    const notionals = rows.map(r => r.notional || r.price * r.qty).filter(Number.isFinite);
    if (!notionals.length) return 50000;
    const m = median(notionals);
    const mean = notionals.reduce((a, b) => a + b, 0) / notionals.length;
    const sd = Math.sqrt(notionals.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / notionals.length);
    return Math.max(m * wallMult, m + 1.5 * sd, 30000);
  }

  calculatePersistence(hist: { firstSeen: number; samples: number }): number {
    const age = Math.min(1, (Date.now() - hist.firstSeen) / 180000);
    const samples = Math.min(1, hist.samples / 20);
    return (age + samples) / 2;
  }

  getCluster(row: BookLevel, rows: BookLevel[], threshold: number) {
    const nearby = rows.filter(r => Math.abs(r.price - row.price) < row.price * 0.002 && (r.notional || r.price * r.qty) >= threshold * 0.6);
    const prices = nearby.map(r => r.price);
    return {
      size: nearby.length,
      low: prices.length ? Math.min(...prices) : row.price,
      high: prices.length ? Math.max(...prices) : row.price
    };
  }

  calculateDistanceScore(price: number, mid: number): number {
    const distance = Math.abs(price - mid) / mid;
    return 1 / (1 + distance * 100);
  }

  isMultiExchangeVisible(price: number, ownNotional: number): boolean {
    const arr = this._sortedWalls;
    if (!arr || !arr.length) return false;
    const low = price * 0.999, high = price * 1.001;
    let lo = 0, hi = arr.length - 1, start = arr.length;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (arr[m].price >= low) { start = m; hi = m - 1; }
      else lo = m + 1;
    }
    let count = 0, otherNotional = 0;
    for (let i = start; i < arr.length; i++) {
      const w = arr[i];
      if (w.price > high) break;
      count++;
      otherNotional += w.notional;
    }
    if (count < 2) return false;
    if (Number.isFinite(ownNotional) && ownNotional > 0 && otherNotional < ownNotional * 0.5) return false;
    return true;
  }

  generateExplanation(row: BookLevel, notional: number, persistence: number, isCluster: boolean, multiExchange: boolean): string {
    const parts = [];
    parts.push(`${fmtQty(row.qty)} qty / ${fmtQty(notional / 1000)}k notional`);
    if (persistence > 0.6) parts.push('persistent wall');
    if (isCluster) parts.push('cluster formation');
    if (multiExchange) parts.push('multi-exchange visible');
    return parts.join('; ');
  }

  cleanupHistory() {
    const t = Date.now();
    for (const [k, h] of this.history) {
      if (t - h.lastSeen > 600000) this.history.delete(k);
    }
  }
}

export class WallPullDetector {
  wallHistory = new Map<string, { firstSeen: number; lastSeen: number; maxNotional: number }>();
  fired = new Set<string>();
  private _sortedTrades: Trade[] = [];

  analyze(currentWalls: { side: Side; price: number; notional: number }[], mid: number, recentTrades: Trade[], spoofWindowMs = 3000): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const t = Date.now();
    const currentKeys = new Set(currentWalls.map(w => `${w.side}:${w.price}`));

    this._sortedTrades = recentTrades.slice().sort((a, b) => a.price - b.price);

    for (const [key, hist] of this.wallHistory) {
      if (currentKeys.has(key)) continue;
      const [side, priceStr] = key.split(':');
      const price = parseFloat(priceStr);
      const age = t - hist.firstSeen;
      const wasSignificant = hist.maxNotional > 50000;
      const wasNear = Math.abs(price - mid) < mid * 0.01;
      const executed = this.getExecutionAtLevel(price);
      const little = executed < hist.maxNotional * 0.2;
      const proxPct = Math.abs(price - mid) / mid * 100;
      const fear = proxPct < 0.05;
      const fireKey = `${key}:${Math.floor(hist.firstSeen / 10000)}`;

      if (!this.fired.has(fireKey) && age > spoofWindowMs && age < 120000 && wasSignificant && wasNear && little) {
        const confidence = clamp(((wasSignificant ? 0.30 : 0) + (wasNear ? 0.30 : 0) + (little ? 0.25 : 0) + (age < 30000 ? 0.15 : 0)) * 100, 45, 82);
        if (confidence >= 55) {
          this.fired.add(fireKey);
          signals.push(createPatternSignal({
            type: 'WALL_PULL',
            title: fear ? 'Wall Pull (Fear)' : 'Wall Pull / Spoof Risk',
            bias: 'warning',
            price,
            confidence,
            confidenceBreakdown: { size: wasSignificant ? 30 : 0, proximity: wasNear ? 30 : 0, execution: little ? 25 : 0, timing: age < 30000 ? 15 : 0 },
            severity: confidence > 75 ? 'high' : 'medium',
            timeframe: '1-5min',
            explanation: fear ? `${fmtQty(hist.maxNotional / 1000)}k ${side} wall pulled with price AT level (${proxPct.toFixed(3)}%) — real fear` : `${fmtQty(hist.maxNotional / 1000)}k ${side} wall pulled from distance (${proxPct.toFixed(3)}%) with minimal execution — likely spoof`,
            metadata: { side: side as Side, maxNotional: hist.maxNotional, ageSeconds: Math.floor(age / 1000), executionRatio: executed / Math.max(1, hist.maxNotional), pullType: fear ? 'fear' : 'spoof', proximityPct: +proxPct.toFixed(3) }
          }));
        }
      }
    }

    for (const wall of currentWalls) {
      const key = `${wall.side}:${wall.price}`;
      const h = this.wallHistory.get(key) || { firstSeen: t, lastSeen: t, maxNotional: 0 };
      h.lastSeen = t;
      h.maxNotional = Math.max(h.maxNotional, wall.notional);
      this.wallHistory.set(key, h);
    }
    this.cleanupHistory();
    return signals;
  }

  getExecutionAtLevel(price: number): number {
    const arr = this._sortedTrades;
    if (!arr || !arr.length) return 0;
    const low = price * 0.9995, high = price * 1.0005;
    let lo = 0, hi = arr.length - 1, start = arr.length;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (arr[m].price >= low) { start = m; hi = m - 1; }
      else lo = m + 1;
    }
    let sum = 0;
    for (let i = start; i < arr.length; i++) {
      if (arr[i].price > high) break;
      sum += arr[i].notional || (arr[i].price * arr[i].qty);
    }
    return sum;
  }

  cleanupHistory() {
    const t = Date.now();
    for (const [k, h] of this.wallHistory) {
      if (t - h.lastSeen > 300000) this.wallHistory.delete(k);
    }
    if (this.fired.size > 500) {
      const arr = [...this.fired].sort();
      this.fired = new Set(arr.slice(-300));
    }
  }

  reset() {
    this.wallHistory.clear();
    this.fired.clear();
  }
}

export class AbsorptionDetector {
  wallExecutions = new Map<string, { firstSeen: number; totalExecution: number; initialNotional: number; lastExecution: number }>();
  lastFire = new Map<string, number>();
  private _sortedTrades30: Trade[] = [];

  analyze(currentWalls: { side: Side; price: number; notional: number }[], recentTrades: Trade[], minSignalConfidence = 60): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const t = Date.now();
    const cut30 = t - 30000;

    this._sortedTrades30 = recentTrades.filter(x => x.timestamp > cut30).sort((a, b) => a.price - b.price);

    for (const wall of currentWalls) {
      const key = `${wall.side}:${wall.price}`;
      const execution = this.getExecutionAtLevel(wall.price);
      const h = this.wallExecutions.get(key) || { firstSeen: t, totalExecution: 0, initialNotional: wall.notional, lastExecution: 0 };
      h.totalExecution = Math.max(h.totalExecution, execution);
      h.lastExecution = execution;
      this.wallExecutions.set(key, h);

      const age = t - h.firstSeen;
      if (age < 10000) continue;

      const executionRatio = h.totalExecution / Math.max(1, h.initialNotional);
      const wallDecay = (h.initialNotional - wall.notional) / Math.max(1, h.initialNotional);

      if (executionRatio > 0.5 && wallDecay < 0.35 && t - (this.lastFire.get(key) || 0) > 60000) {
        const confidence = ((executionRatio > 1 ? 0.40 : executionRatio * 0.40) + ((1 - wallDecay) * 0.30) + (age > 60000 ? 0.30 : age / 60000 * 0.30)) * 100;
        if (confidence >= minSignalConfidence) {
          this.lastFire.set(key, t);
          signals.push(createPatternSignal({
            type: 'ABSORPTION',
            title: wall.side === 'bid' ? 'Support Absorption' : 'Resistance Absorption',
            bias: wall.side === 'bid' ? 'bullish' : 'bearish',
            price: wall.price,
            confidence,
            confidenceBreakdown: { execution: Math.min(40, executionRatio * 40), remaining: (1 - wallDecay) * 30, age: age > 60000 ? 30 : age / 60000 * 30 },
            severity: confidence > 80 ? 'high' : 'medium',
            timeframe: '5-15min',
            explanation: `Wall absorbing ${fmtPrice(h.totalExecution)} execution against ${fmtPrice(wall.notional)} remaining`,
            invalidation: wall.side === 'bid' ? wall.price * 0.995 : wall.price * 1.005,
            metadata: { side: wall.side, executionRatio, wallDecay, totalExecution: h.totalExecution, currentNotional: wall.notional }
          }));
        }
      }
    }
    this.cleanupHistory(currentWalls);
    return signals;
  }

  getExecutionAtLevel(price: number): number {
    const arr = this._sortedTrades30;
    if (!arr || !arr.length) return 0;
    const low = price * 0.9995, high = price * 1.0005;
    let lo = 0, hi = arr.length - 1, start = arr.length;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (arr[m].price >= low) { start = m; hi = m - 1; }
      else lo = m + 1;
    }
    let sum = 0;
    for (let i = start; i < arr.length; i++) {
      if (arr[i].price > high) break;
      sum += arr[i].notional || (arr[i].price * arr[i].qty);
    }
    return sum;
  }

  cleanupHistory(currentWalls: { side: Side; price: number }[]) {
    const active = new Set(currentWalls.map(w => `${w.side}:${w.price}`));
    const t = Date.now();
    for (const [k, h] of this.wallExecutions) {
      if (!active.has(k) && t - h.firstSeen > 300000) this.wallExecutions.delete(k);
    }
  }

  reset() {
    this.wallExecutions.clear();
    this.lastFire.clear();
  }
}

export class LiquidityVoidDetector {
  lastFire = { up: 0, down: 0 };
  private _voidState: { t: number; direction: 'up' | 'down'; fill: boolean; fillNotional: number } | null = null;

  trackTradesForVacuum(trades: Trade[]) {
    if (!this._voidState) return;
    const t = Date.now();
    if (t - this._voidState.t > 4000) { this._voidState = null; return; }
    let into = 0, against = 0;
    const dir = this._voidState.direction;
    for (let i = trades.length - 1; i >= 0; i--) {
      const tr = trades[i];
      if (t - tr.timestamp > 3000) break;
      if (dir === 'up' && tr.side === 'buy') into += tr.notional;
      else if (dir === 'down' && tr.side === 'sell') into += tr.notional;
      else against += tr.notional;
    }
    if (into > 0 && into > against * 2.5) {
      this._voidState.fill = true;
      this._voidState.fillNotional = into;
    }
  }

  analyze(bidRows: BookLevel[], askRows: BookLevel[], mid: number, trades: Trade[], imbalanceThresh = 2.2): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const agg = (rows: BookLevel[]) => {
      let near = 0, medSum = 0;
      for (const r of rows) {
        const notional = r.notional || (r.price * r.qty);
        const d = Math.abs(r.price - mid) / mid;
        if (d < 0.005) near += notional;
        if (d < 0.015) medSum += notional;
      }
      return { near, medSum };
    };

    const b = agg(bidRows), a = agg(askRows);
    const nearBid = b.near, nearAsk = a.near, medBid = b.medSum, medAsk = a.medSum;
    const t = Date.now();
    const voidRatio = clamp(0.5 / imbalanceThresh, 0.15, 0.45);

    if (medBid > 0 && nearBid < medBid * voidRatio && t - this.lastFire.down > 45000) {
      this.lastFire.down = t;
      this._voidState = { t, direction: 'down', fill: false, fillNotional: 0 };
      const confidence = ((1 - nearBid / medBid) * 0.6 + 0.4) * 100;
      signals.push(createPatternSignal({
        type: 'LIQUIDITY_VOID',
        title: 'Downside Liquidity Void',
        bias: 'bearish',
        price: mid * 0.995,
        zone: { low: mid * 0.99, high: mid },
        confidence,
        confidenceBreakdown: { nearThinness: (1 - nearBid / medBid) * 60, base: 40 },
        severity: confidence > 75 ? 'high' : 'medium',
        timeframe: '2-10min',
        explanation: `Thin bid support ${fmtPrice(nearBid)} vs ${fmtPrice(medBid)} deeper`,
        invalidation: mid * 1.002,
        metadata: { nearTotal: nearBid, mediumTotal: medBid, ratio: nearBid / medBid }
      }));
    }

    if (medAsk > 0 && nearAsk < medAsk * voidRatio && t - this.lastFire.up > 45000) {
      this.lastFire.up = t;
      this._voidState = { t, direction: 'up', fill: false, fillNotional: 0 };
      const confidence = ((1 - nearAsk / medAsk) * 0.6 + 0.4) * 100;
      signals.push(createPatternSignal({
        type: 'LIQUIDITY_VOID',
        title: 'Upside Liquidity Void',
        bias: 'bullish',
        price: mid * 1.005,
        zone: { low: mid, high: mid * 1.01 },
        confidence,
        confidenceBreakdown: { nearThinness: (1 - nearAsk / medAsk) * 60, base: 40 },
        severity: confidence > 75 ? 'high' : 'medium',
        timeframe: '2-10min',
        explanation: `Thin ask resistance ${fmtPrice(nearAsk)} vs ${fmtPrice(medAsk)} higher`,
        invalidation: mid * 0.998,
        metadata: { nearTotal: nearAsk, mediumTotal: medAsk, ratio: nearAsk / medAsk }
      }));
    }

    if (this._voidState && this._voidState.fill) {
      for (const s of signals) {
        if (s.type === 'LIQUIDITY_VOID') {
          s.confidence = clamp(s.confidence + 20, 0, 100);
          s.title = 'Liquidity Void (Vacuum Fill)';
          s.explanation += ' — boşluk taker emirlerle şiddetle dolduruldu (vacuum)';
          if (s.metadata) s.metadata.vacuumFill = Math.round(this._voidState.fillNotional);
          s.severity = 'high';
        }
      }
    }
    return signals;
  }
}

export class LadderDetectorV2 {
  lastFire: Record<Side, number> = { bid: 0, ask: 0, buy: 0, sell: 0 };
  private _seen = new Map<string, number>();

  reset() {
    this.lastFire = { bid: 0, ask: 0, buy: 0, sell: 0 };
    this._seen.clear();
  }

  analyze(currentWalls: { side: Side; price: number; notional: number }[], mid: number): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const t = Date.now();

    (['bid', 'ask'] as Side[]).forEach(side => {
      for (const w of currentWalls) {
        if (w.side !== side) continue;
        const k = side + ':' + w.price;
        if (!this._seen.has(k)) this._seen.set(k, t);
      }
      const walls = currentWalls.filter(w => w.side === side).sort((a, b) => side === 'bid' ? b.price - a.price : a.price - b.price);
      if (walls.length >= 3 && t - this.lastFire[side] > 60000) {
        const prices = walls.slice(0, 5).map(w => w.price);
        let regular = true;
        if (prices.length >= 3) {
          const gaps = [];
          for (let i = 1; i < prices.length; i++) gaps.push(Math.abs(prices[i] - prices[i - 1]));
          const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          if (meanGap > 0) {
            const dev = gaps.reduce((a, b) => a + Math.abs(b - meanGap), 0) / gaps.length;
            if (dev / meanGap > 0.55) regular = false;
          }
        }
        if (regular) {
          const times = prices.map(p => this._seen.get(side + ':' + p) || t);
          const orderDelta = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
          const simultaneous = orderDelta <= 8000;
          const conf = clamp(55 + walls.length * 7 + (simultaneous ? 6 : 0), 55, 92);
          this.lastFire[side] = t;
          signals.push(createPatternSignal({
            type: 'LADDER_BUILDING',
            title: 'Ladder Building',
            bias: side === 'bid' ? 'bullish' : 'bearish',
            price: prices[0],
            zone: { low: Math.min(...prices), high: Math.max(...prices) },
            confidence: conf,
            severity: walls.length >= 4 ? 'high' : 'medium',
            timeframe: '10-30min',
            explanation: `${side === 'bid' ? 'Bid' : 'Ask'} side has ${walls.length} stacked wall levels (regular spacing${simultaneous ? ', bot-placed' : ', gradual'})`,
            metadata: { side, count: walls.length, orderDeltaMs: orderDelta, simultaneous }
          }));
        }
      }
    });

    const cut = t - 120000;
    for (const [k, v] of this._seen) {
      if (v < cut) this._seen.delete(k);
    }
    return signals;
  }
}

export class IcebergDetector {
  wallHistory = new Map<string, { firstSeen: number; lastSeen: number; initialNotional: number; lastNotional: number; maxNotional: number; sizeRatio: number }>();
  fired = new Set<string>();
  private _sortedTrades: Trade[] = [];

  private _buildTradeIndex(trades: Trade[]) {
    this._sortedTrades = trades.slice().sort((a, b) => a.price - b.price);
  }

  getExecutionAtLevel(price: number): number {
    const arr = this._sortedTrades;
    if (!arr || !arr.length) return 0;
    const low = price * 0.9995, high = price * 1.0005;
    let lo = 0, hi = arr.length - 1, start = arr.length;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (arr[m].price >= low) { start = m; hi = m - 1; }
      else lo = m + 1;
    }
    let sum = 0;
    for (let i = start; i < arr.length; i++) {
      if (arr[i].price > high) break;
      sum += arr[i].notional || (arr[i].price * arr[i].qty);
    }
    return sum;
  }

  analyze(currentWalls: { side: Side; price: number; notional: number }[], trades: Trade[]): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const t = Date.now();
    this._buildTradeIndex(trades);
    const currentKeys = new Set(currentWalls.map(w => `${w.side}:${w.price}`));

    for (const [key, h] of this.wallHistory) {
      if (currentKeys.has(key)) continue;
      const [side, priceStr] = key.split(':');
      const price = parseFloat(priceStr);
      const life = t - h.firstSeen;
      const executed = this.getExecutionAtLevel(price);
      const absorbedFrac = clamp(executed / Math.max(h.maxNotional, 1e-9), 0, 3);
      const stillBig = h.lastNotional >= h.initialNotional * 0.7;
      const fireKey = key + ':' + Math.floor(h.firstSeen / 30000);

      if (!this.fired.has(fireKey) && life > 8000 && absorbedFrac < 0.4 && stillBig) {
        this.fired.add(fireKey);
        const bull = side === 'bid';
        const conf = clamp(40 + life / 1000 + Math.min(h.sizeRatio, 8) * 1.2, 40, 90);
        signals.push(createPatternSignal({
          type: 'ICEBERG',
          title: 'Hidden Iceberg',
          bias: bull ? 'bullish' : 'bearish',
          price,
          confidence: conf,
          severity: conf > 75 ? 'high' : 'medium',
          timeframe: '10-30min',
          explanation: `${fmtQty(h.maxNotional / 1000)}k ${side} wall persisted ${(life / 1000).toFixed(0)}s with minimal execution — possible hidden accumulation/distribution`,
          invalidation: side === 'bid' ? price * 0.997 : price * 1.003,
          metadata: { side: side as Side, lifeMs: life, maxNotional: h.maxNotional, sizeRatio: h.sizeRatio, absorbedFrac }
        }));
      }
      this.wallHistory.delete(key);
    }

    const notionals = currentWalls.map(w => w.notional);
    const medN = median(notionals) || 1;
    for (const wall of currentWalls) {
      const key = `${wall.side}:${wall.price}`;
      const h = this.wallHistory.get(key);
      if (h) {
        h.lastSeen = t;
        h.lastNotional = wall.notional;
        h.maxNotional = Math.max(h.maxNotional, wall.notional);
      } else {
        this.wallHistory.set(key, { firstSeen: t, lastSeen: t, initialNotional: wall.notional, lastNotional: wall.notional, maxNotional: wall.notional, sizeRatio: wall.notional / medN });
      }
    }

    const cut = t - 600000;
    for (const [k, h] of this.wallHistory) {
      if (h.lastSeen < cut) this.wallHistory.delete(k);
    }
    if (this.fired.size > 600) {
      const arr = [...this.fired].sort();
      this.fired = new Set(arr.slice(-400));
    }
    return signals;
  }

  reset() {
    this.wallHistory.clear();
    this.fired.clear();
  }
}

export class OFISpikeDetector {
  lastFire = { bid: 0, ask: 0 };

  detect(trades: Trade[], mid: number, heatHistory: { bids: [number, number][]; asks: [number, number][] }[]): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const t = Date.now();
    if (!Number.isFinite(mid)) return signals;

    let bidAggr = 0, askAggr = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      const tr = trades[i];
      if (t - tr.timestamp > 3000) break;
      if (tr.side === 'buy') bidAggr += tr.notional || (tr.price * tr.qty);
      else askAggr += tr.notional || (tr.price * tr.qty);
    }

    const hv = heatHistory.slice(-6).map(s => s.bids[0]?.[0] ?? s.asks[0]?.[0]).filter(Number.isFinite);
    const priceStable = hv.length >= 3 ? (Math.abs(hv[hv.length - 1] - hv[0]) / hv[0]) * 100 < 0.03 : true;
    const spike = Math.max(bidAggr, askAggr);

    if (priceStable && spike > 300000) {
      const bidSide = bidAggr > askAggr;
      const side = bidSide ? 'bid' : 'ask';
      if (t - this.lastFire[side] < 120000) return signals;
      this.lastFire[side] = t;
      const conf = clamp(58 + Math.min(spike / 500000 * 20, 25), 58, 88);
      signals.push(createPatternSignal({
        type: 'HIDDEN_ABSORPTION',
        title: bidSide ? 'Bid Absorption (Hidden)' : 'Ask Absorption (Hidden)',
        bias: bidSide ? 'bullish' : 'bearish',
        price: mid,
        confidence: conf,
        severity: conf > 75 ? 'high' : 'medium',
        timeframe: '1-5min',
        explanation: `${fmtQty(spike / 1000)}k aggressive ${bidSide ? 'buy' : 'sell'} flow with price flat — hidden absorption`,
        metadata: { aggressiveNotional: spike, bidAggr, askAggr, priceStable }
      }));
    }
    return signals;
  }
}

export class OrderbookSkewDetector {
  lastFire = { bid: 0, ask: 0 };
  private _hist: { t: number; skew: number }[] = [];

  reset() {
    this.lastFire = { bid: 0, ask: 0 };
    this._hist = [];
  }

  analyze(currentWalls: { side: Side; price: number; notional: number }[], mid: number): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const t = Date.now();
    const bidWalls = currentWalls.filter(w => w.side === 'bid' && w.price < mid);
    const askWalls = currentWalls.filter(w => w.side === 'ask' && w.price > mid);
    const bidN = bidWalls.reduce((s, w) => s + w.notional, 0);
    const askN = askWalls.reduce((s, w) => s + w.notional, 0);
    if (bidN <= 0 || askN <= 0) return signals;

    const skew = (bidN - askN) / (bidN + askN);
    this._hist.push({ t, skew });
    const cut = t - 10000;
    while (this._hist.length && this._hist[0].t < cut) this._hist.shift();

    let delta = 0;
    if (this._hist.length >= 3) {
      const first = this._hist[0].skew, last = this._hist[this._hist.length - 1].skew;
      delta = last - first;
    }

    const rapidShift = Math.abs(delta) >= 0.30;
    if (Math.abs(skew) < 0.45 && !rapidShift) return signals;

    const bidHeavy = skew > 0;
    const side = bidHeavy ? 'bid' : 'ask';
    if (t - this.lastFire[side] < 120000) return signals;

    this.lastFire[side] = t;
    const conf = clamp(50 + Math.abs(skew) * 30 + (rapidShift ? 10 : 0), 50, 90);
    signals.push(createPatternSignal({
      type: 'BOOK_SKEW',
      title: bidHeavy ? 'Bid-Dominant Book' : 'Ask-Dominant Book',
      bias: bidHeavy ? 'bullish' : 'bearish',
      price: mid,
      confidence: conf,
      severity: conf > 75 ? 'high' : 'medium',
      timeframe: '5-20min',
      explanation: `Book skew ${(skew * 100).toFixed(0)}% ${bidHeavy ? 'bid' : 'ask'}${rapidShift ? ` — hızla ${delta > 0 ? 'bid' : 'ask'} tarafına kayıyor (${(delta * 100).toFixed(0)}%/10sn)` : ''} (${bidWalls.length}b/${askWalls.length}a walls)`,
      metadata: { skew: +skew.toFixed(3), delta10s: +delta.toFixed(3), rapidShift, bidNotional: bidN, askNotional: askN, bidWalls: bidWalls.length, askWalls: askWalls.length }
    }));
    return signals;
  }
}

export class CompressionDetector {
  lastFire = 0;

  analyze(signals: PatternSignal[], mid: number): PatternSignal[] {
    const t = Date.now();
    if (t - this.lastFire < 60000) return [];
    const bid = signals.filter(s => s.type === 'STRONG_BID_WALL' && s.price < mid).sort((a, b) => b.price - a.price)[0];
    const ask = signals.filter(s => s.type === 'STRONG_ASK_WALL' && s.price > mid).sort((a, b) => a.price - b.price)[0];
    if (!bid || !ask) return [];

    const band = (ask.price - bid.price) / mid;
    if (band < 0.01) {
      this.lastFire = t;
      return [createPatternSignal({
        type: 'COMPRESSION_ZONE',
        title: 'Compression Zone',
        bias: 'warning',
        price: mid,
        zone: { low: bid.price, high: ask.price },
        confidence: clamp(60 + (1 - band / 0.01) * 25, 60, 85),
        severity: 'medium',
        timeframe: '30sec-5min',
        explanation: `Price compressed between bid wall ${fmtPrice(bid.price)} and ask wall ${fmtPrice(ask.price)}; volatility expansion risk`,
        metadata: { bid: bid.price, ask: ask.price, band }
      })];
    }
    return [];
  }
}

export class VPINCalculator {
  bucketVolume: number;
  numBuckets: number;
  currentBucket = { buyVol: 0, sellVol: 0, totalVol: 0 };
  completedBuckets: number[] = [];

  constructor(bucketVolume = 500000, numBuckets = 10) {
    this.bucketVolume = bucketVolume;
    this.numBuckets = numBuckets;
  }

  update(tr: Trade) {
    const vol = tr.notional || (tr.price * tr.qty);
    if (tr.side === 'buy') this.currentBucket.buyVol += vol;
    else this.currentBucket.sellVol += vol;
    this.currentBucket.totalVol += vol;

    if (this.currentBucket.totalVol >= this.bucketVolume) {
      const imbalance = Math.abs(this.currentBucket.buyVol - this.currentBucket.sellVol);
      const vpin = (imbalance / this.currentBucket.totalVol) * 100;
      this.completedBuckets.push(vpin);
      if (this.completedBuckets.length > this.numBuckets) this.completedBuckets.shift();
      this.currentBucket = { buyVol: 0, sellVol: 0, totalVol: 0 };
    }
  }

  getVPIN(): number | null {
    if (!this.completedBuckets.length) return null;
    const avg = this.completedBuckets.reduce((a, b) => a + b, 0) / this.completedBuckets.length;
    return Math.round(avg);
  }
}

export class StopHuntDetector {
  lastFire = { high: 0, low: 0 };

  analyze(heatHistory: { bids: [number, number][]; asks: [number, number][] }[], currentPrice: number, trades: Trade[]): PatternSignal[] {
    const now = Date.now();
    if (!heatHistory || heatHistory.length < 10 || !Number.isFinite(currentPrice)) return [];
    const signals: PatternSignal[] = [];

    let maxPx = -Infinity, minPx = Infinity;
    for (const snap of heatHistory) {
      for (const [p] of (snap.asks || [])) if (p > maxPx) maxPx = p;
      for (const [p] of (snap.bids || [])) if (p < minPx) minPx = p;
    }
    if (!Number.isFinite(maxPx) || !Number.isFinite(minPx) || maxPx <= minPx) return [];

    const tick = tickSizeFor(currentPrice);
    const tol = tick * 3;

    if (currentPrice >= maxPx - tol && now - this.lastFire.high > 120000) {
      this.lastFire.high = now;
      signals.push(createPatternSignal({
        type: 'STOP_HUNT_SWEEP',
        title: 'STOP-HUNT SWEEP (Tepe Avı / EQH Sweep)',
        bias: 'bearish',
        price: currentPrice,
        confidence: 84,
        severity: 'high',
        timeframe: '1-5dk',
        explanation: `Fiyat son dakikaların tepe bölgesini (${fmtPrice(maxPx)}) iğneledi — stop-loss avı (sweep & reject)`,
        metadata: { sweptLevel: maxPx, side: 'high' }
      }));
    } else if (currentPrice <= minPx + tol && now - this.lastFire.low > 120000) {
      this.lastFire.low = now;
      signals.push(createPatternSignal({
        type: 'STOP_HUNT_SWEEP',
        title: 'STOP-HUNT SWEEP (Dip Avı / EQL Sweep)',
        bias: 'bullish',
        price: currentPrice,
        confidence: 84,
        severity: 'high',
        timeframe: '1-5dk',
        explanation: `Fiyat son dakikaların dip bölgesini (${fmtPrice(minPx)}) iğneledi — stop-loss avı (sweep & reject)`,
        metadata: { sweptLevel: minPx, side: 'low' }
      }));
    }
    return signals;
  }
}

export class LiquidationPressureCalculator {
  windowMs = 15000;
  lastClusterFire = 0;
  lastCascadeFire = 0;

  calculate(liqs: LiquidationEvent[]) {
    const t = Date.now();
    const recent = liqs.filter(l => t - l.timestamp < this.windowMs);
    if (!recent.length) return { pressure: 0, data: null };

    let longN = 0, shortN = 0, longCount = 0, shortCount = 0;
    for (const l of recent) {
      const age = t - l.timestamp;
      const decay = 1 - (age / this.windowMs) * 0.4;
      const notional = l.notionalUsd || l.notional || (l.price * (l.qty || l.quantity || 0));
      const n = notional * decay;
      if (l.side === 'long' || l.side === 'SELL') { longN += n; longCount++; }
      else { shortN += n; shortCount++; }
    }
    const total = longN + shortN;
    if (!total) return { pressure: 0, data: null };

    const pressure = ((shortN - longN) / total) * 100;
    return {
      pressure: clamp(pressure, -100, 100),
      data: {
        longLiqNotional: longN,
        shortLiqNotional: shortN,
        longCount,
        shortCount,
        total,
        dominant: Math.abs(pressure) > 30 ? (pressure > 0 ? 'short' : 'long') : null
      }
    };
  }

  _findCluster(liqs: LiquidationEvent[], windowMs = 5000, minCount = 3, minNotional = 100000) {
    const t = Date.now();
    const recent = liqs.filter(l => t - l.timestamp < windowMs);
    if (recent.length < minCount) return null;

    const longs = recent.filter(l => l.side === 'long' || l.side === 'SELL');
    const shorts = recent.filter(l => l.side === 'short' || l.side === 'BUY');
    const longT = longs.reduce((s, l) => s + (l.notionalUsd || l.notional || l.price * (l.qty || 0)), 0);
    const shortT = shorts.reduce((s, l) => s + (l.notionalUsd || l.notional || l.price * (l.qty || 0)), 0);

    if (longT > minNotional && longT > shortT * 2) {
      return { type: 'LONG_CLUSTER', side: 'long', count: longs.length, notional: longT, avgPrice: longs.reduce((s, l) => s + l.price, 0) / Math.max(1, longs.length) };
    }
    if (shortT > minNotional && shortT > longT * 2) {
      return { type: 'SHORT_CLUSTER', side: 'short', count: shorts.length, notional: shortT, avgPrice: shorts.reduce((s, l) => s + l.price, 0) / Math.max(1, shorts.length) };
    }
    return null;
  }

  _findCascade(liqs: LiquidationEvent[], windowMs = 10000) {
    const t = Date.now();
    const recent = liqs.filter(l => t - l.timestamp < windowMs);
    if (recent.length < 5) return null;

    const long = recent.filter(l => l.side === 'long' || l.side === 'SELL');
    const short = recent.filter(l => l.side === 'short' || l.side === 'BUY');
    const side = long.length > short.length ? 'long' : 'short';
    const arr = side === 'long' ? long : short;
    if (arr.length < 5) return null;

    const total = arr.reduce((s, l) => s + (l.notionalUsd || l.notional || l.price * (l.qty || 0)), 0);
    if (total < 250000) return null;

    const prices = arr.map(l => l.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const rangePct = (Math.max(...prices) - Math.min(...prices)) / avg * 100;
    if (rangePct > 2) return null;

    return { type: 'CASCADE', side, count: arr.length, notional: total, priceRange: { min: Math.min(...prices), max: Math.max(...prices) }, rangePercent: rangePct };
  }

  detectCluster(liqs: LiquidationEvent[], windowMs = 5000, minCount = 3, minNotional = 100000) {
    const t = Date.now();
    const res = this._findCluster(liqs, windowMs, minCount, minNotional);
    if (!res || t - this.lastClusterFire < 15000) return null;
    this.lastClusterFire = t;
    return res;
  }

  detectCascade(liqs: LiquidationEvent[], windowMs = 10000) {
    const t = Date.now();
    const res = this._findCascade(liqs, windowMs);
    if (!res || t - this.lastCascadeFire < 25000) return null;
    this.lastCascadeFire = t;
    return res;
  }
}

export class LiquidationPoolSimulator {
  leverageTiers = [
    { lev: 100, longMult: 0.991, shortMult: 1.009, baseNotional: 450000 },
    { lev: 50,  longMult: 0.982, shortMult: 1.018, baseNotional: 1200000 },
    { lev: 25,  longMult: 0.964, shortMult: 1.036, baseNotional: 2400000 },
    { lev: 10,  longMult: 0.910, shortMult: 1.090, baseNotional: 4800000 }
  ];

  getPools(mid: number, cvd = 0, symbol = 'BTCUSDT'): LiquidationPool[] {
    if (!Number.isFinite(mid) || mid <= 0) return [];
    const pools: LiquidationPool[] = [];
    const absCvdMult = Math.min(2.5, Math.max(0.6, 1 + Math.abs(cvd) / 500));
    const isBtc = symbol.toLowerCase().includes('btc');
    const scale = isBtc ? 1.0 : 0.3;

    for (const tier of this.leverageTiers) {
      const longPrice = mid * tier.longMult;
      const shortPrice = mid * tier.shortMult;

      const longEst = tier.baseNotional * scale * absCvdMult * (cvd > 0 ? 1.35 : 0.85);
      const shortEst = tier.baseNotional * scale * absCvdMult * (cvd < 0 ? 1.35 : 0.85);

      pools.push({
        leverage: tier.lev,
        side: 'long',
        price: longPrice,
        estNotionalUsd: longEst,
        estNotionalFormatted: longEst >= 1000000 ? (longEst / 1000000).toFixed(1) + 'M' : (longEst / 1000).toFixed(0) + 'K'
      });
      pools.push({
        leverage: tier.lev,
        side: 'short',
        price: shortPrice,
        estNotionalUsd: shortEst,
        estNotionalFormatted: shortEst >= 1000000 ? (shortEst / 1000000).toFixed(1) + 'M' : (shortEst / 1000).toFixed(0) + 'K'
      });
    }
    return pools;
  }
}

export class FlowStateCalculator {
  thresholds = { strongBuy: 35, strongSell: -35, weakBuy: 15, weakSell: -15 };

  calculateState(candles: FlowCandle[], liquidations: LiquidationEvent[], liqCalc?: LiquidationPressureCalculator) {
    if (!candles || !candles.length) return this.getEmptyState();
    const current = candles[candles.length - 1];
    const pressure = Number(current?.close || 0);
    const trend = this.calculateTrend(candles.slice(-3));
    const liquidation = this.calculateLiquidationState(liquidations || [], liqCalc);
    const confidence = this.calculateConfidence(pressure, trend, liquidation);

    return {
      pressure: { value: pressure, direction: this.getPressureDirection(pressure), strength: this.getPressureStrength(pressure), trend: trend.direction },
      liquidation,
      confidence,
      summary: this.generateSummary(pressure, trend, liquidation),
      action: this.generateAction(pressure, trend, liquidation),
      shouldCheckBook: this.shouldCheckBook(pressure, trend, confidence)
    };
  }

  calculateTrend(recentCandles: FlowCandle[]) {
    const pressures = (recentCandles || []).map(c => Number(c?.close || 0)).filter(Number.isFinite);
    if (pressures.length < 2) return { direction: 'unknown', strength: 0 };
    if (pressures.length >= 3) {
      const increasing = pressures[0] < pressures[1] && pressures[1] < pressures[2];
      const decreasing = pressures[0] > pressures[1] && pressures[1] > pressures[2];
      if (increasing) return { direction: 'increasing', strength: clamp((pressures[2] - pressures[0]) / 100, 0, 5) };
      if (decreasing) return { direction: 'decreasing', strength: clamp((pressures[0] - pressures[2]) / 100, 0, 5) };
    }
    const first = pressures[0], last = pressures[pressures.length - 1];
    if (Math.abs(last - first) < 10) return { direction: 'sideways', strength: 0 };
    return { direction: last > first ? 'increasing' : 'decreasing', strength: Math.abs(last - first) / 100 };
  }

  calculateLiquidationState(liquidations: LiquidationEvent[], liqCalc?: LiquidationPressureCalculator) {
    const calc = liqCalc || new LiquidationPressureCalculator();
    const liqPressure = calc.calculate(liquidations || []);
    const cluster = calc._findCluster(liquidations || []);
    const cascade = calc._findCascade(liquidations || []);

    if (cascade) {
      return { type: 'cascade', side: cascade.side, intensity: 'high', message: 'TASFİYE DALGASI', detail: `${cascade.count} tasfiye art arda`, impact: cascade.side === 'long' ? 'Aşağı baskı güçlü' : 'Yukarı baskı güçlü' };
    }
    if (cluster) {
      return { type: 'cluster', side: cluster.side, intensity: 'medium', message: cluster.side === 'long' ? "LONG'LAR PATLIYOR" : "SHORT'LAR PATLIYOR", detail: `${cluster.count} tasfiye, ${(cluster.notional / 1000).toFixed(0)}k`, impact: cluster.side === 'long' ? 'Satış baskısı artabilir' : 'Yukarı hareket güçlenebilir' };
    }
    if (liqPressure && liqPressure.data && liqPressure.data.total > 50000) {
      const dominant = liqPressure.data.dominant;
      if (dominant) {
        return { type: 'pressure', side: dominant, intensity: 'low', message: dominant === 'long' ? 'Long tasfiye var' : 'Short tasfiye var', detail: `${(liqPressure.data.total / 1000).toFixed(0)}k`, impact: dominant === 'long' ? 'Hafif aşağı baskı' : 'Hafif yukarı baskı' };
      }
    }
    return { type: 'quiet', message: 'Tasfiye sakin', detail: '', impact: '' };
  }

  getPressureDirection(pressure: number) {
    if (pressure >= this.thresholds.strongBuy) return 'strong_buy';
    if (pressure >= this.thresholds.weakBuy) return 'weak_buy';
    if (pressure <= this.thresholds.strongSell) return 'strong_sell';
    if (pressure <= this.thresholds.weakSell) return 'weak_sell';
    return 'neutral';
  }

  getPressureStrength(pressure: number) {
    const abs = Math.abs(pressure);
    if (abs >= 50) return 'very_strong';
    if (abs >= 35) return 'strong';
    if (abs >= 20) return 'medium';
    if (abs >= 10) return 'weak';
    return 'very_weak';
  }

  calculateConfidence(pressure: number, trend: { direction: string }, liqState: { type: string }) {
    let confidence = 48;
    confidence += Math.min(20, Math.abs(pressure) * 0.45);
    if (trend.direction === 'increasing' && pressure > 0) confidence += 10;
    if (trend.direction === 'decreasing' && pressure < 0) confidence += 10;
    if (trend.direction === 'sideways') confidence -= 6;
    if (liqState.type === 'cascade') confidence += 18;
    if (liqState.type === 'cluster') confidence += 12;
    if (liqState.type === 'pressure') confidence += 5;
    return Math.round(clamp(confidence, 30, 85));
  }

  generateSummary(pressure: number, trend: { direction: string }, liqState: { type: string; message?: string }) {
    const direction = this.getPressureDirection(pressure);
    const labels: Record<string, string> = { strong_buy: 'ALIM BASKISI', weak_buy: 'ALIM EĞİLİMİ', strong_sell: 'SATIŞ BASKISI', weak_sell: 'SATIŞ EĞİLİMİ', neutral: 'NÖTR' };
    if (direction === 'neutral') return 'NÖTR / BEKLE';
    const trendText: Record<string, string> = { increasing: 'ARTIYOR', decreasing: 'AZALIYOR', sideways: 'YATAY', unknown: '' };
    let summary = labels[direction] || 'NÖTR';
    if (trendText[trend.direction]) summary += ` ${trendText[trend.direction]}`;
    if (liqState.type === 'cascade') summary += ' · TASFİYE DALGASI';
    else if (liqState.type === 'cluster') summary += ` · ${liqState.message}`;
    return summary;
  }

  generateAction(pressure: number, trend: any, liqState: { impact?: string }) {
    const direction = this.getPressureDirection(pressure);
    let action = '';
    if (direction.includes('buy')) action = "Book sekmesinde en yakın alıcı duvarı entry bölgesi olabilir";
    else if (direction.includes('sell')) action = "Book sekmesinde satıcı duvarları direnç bölgesi olabilir";
    else action = "Akış kararsız, daha net sinyal bekle";
    if (liqState.impact) action += `. ${liqState.impact}.`;
    return action;
  }

  shouldCheckBook(pressure: number, trend: any, confidence: number) {
    return Math.abs(pressure) > 20 && confidence > 55;
  }

  getEmptyState() {
    return {
      pressure: { direction: 'neutral', strength: 'very_weak', trend: 'unknown', value: 0 },
      liquidation: { type: 'quiet', message: 'Veri bekleniyor', detail: '', impact: '' },
      confidence: 0,
      summary: 'VERİ BEKLENİYOR',
      action: 'Flow verisi yükleniyor',
      shouldCheckBook: false
    };
  }
}

export class FlowCandleBuilder {
  private timeframeMs: number;
  private candles: FlowCandle[] = [];
  private currentCandle: FlowCandle | null = null;

  constructor(timeframeMs = 10000) {
    this.timeframeMs = timeframeMs;
  }

  update(
    bookState: { mid: number; bidRows: BookLevel[]; askRows: BookLevel[] },
    trades: Trade[],
    detected: PatternSignal[],
    liquidations: LiquidationEvent[]
  ) {
    const now = Date.now();
    const bucketId = Math.floor(now / this.timeframeMs);
    const mid = bookState.mid;
    if (!Number.isFinite(mid) || mid <= 0) return;

    if (!this.currentCandle || this.currentCandle.bucketId !== bucketId) {
      if (this.currentCandle) {
        this.currentCandle.isLive = false;
        this.candles.push(this.currentCandle);
        if (this.candles.length > 200) this.candles.shift();
      }
      this.currentCandle = {
        bucketId,
        timestamp: bucketId * this.timeframeMs,
        open: mid,
        high: mid,
        low: mid,
        close: mid,
        activity: 0,
        buyActivity: 0,
        sellActivity: 0,
        events: [],
        liquidationData: { longLiqNotional: 0, shortLiqNotional: 0, longCount: 0, shortCount: 0 },
        metadata: { samples: 0, avgBidLiquidity: 0, avgAskLiquidity: 0, tradeCount: 0 },
        isLive: true,
        direction: 'neutral',
        strength: 0
      };
    }

    const c = this.currentCandle;
    c.high = Math.max(c.high, mid);
    c.low = Math.min(c.low, mid);
    c.close = mid;

    const bucketStart = bucketId * this.timeframeMs;
    let buyVol = 0, sellVol = 0, tradeCount = 0;
    for (const tr of trades) {
      if (tr.timestamp >= bucketStart) {
        const notional = tr.notional || (tr.price * tr.qty);
        if (tr.side === 'buy') buyVol += notional;
        else sellVol += notional;
        tradeCount++;
      }
    }

    c.buyActivity = buyVol;
    c.sellActivity = sellVol;
    c.activity = buyVol + sellVol;
    c.metadata.tradeCount = tradeCount;

    const bidLiq = bookState.bidRows.slice(0, 10).reduce((s, b) => s + (b.notional || b.price * b.qty), 0);
    const askLiq = bookState.askRows.slice(0, 10).reduce((s, a) => s + (a.notional || a.price * a.qty), 0);
    c.metadata.avgBidLiquidity = (c.metadata.avgBidLiquidity * c.metadata.samples + bidLiq) / (c.metadata.samples + 1);
    c.metadata.avgAskLiquidity = (c.metadata.avgAskLiquidity * c.metadata.samples + askLiq) / (c.metadata.samples + 1);
    c.metadata.samples++;

    let longLiqN = 0, shortLiqN = 0, longC = 0, shortC = 0;
    for (const l of liquidations) {
      if (l.timestamp >= bucketStart) {
        const n = l.notionalUsd || (l.price * l.qty);
        if (l.side === 'long' || l.side === 'SELL') { longLiqN += n; longC++; }
        else { shortLiqN += n; shortC++; }
      }
    }
    c.liquidationData = { longLiqNotional: longLiqN, shortLiqNotional: shortLiqN, longCount: longC, shortCount: shortC };

    const netDelta = buyVol - sellVol;
    const priceDiff = c.close - c.open;
    if (netDelta > 0 || priceDiff > 0) c.direction = 'bullish';
    else if (netDelta < 0 || priceDiff < 0) c.direction = 'bearish';
    else c.direction = 'neutral';

    c.strength = c.activity > 0 ? Math.min(100, Math.round((Math.abs(netDelta) / c.activity) * 100)) : 0;
  }

  getCandles(): FlowCandle[] {
    if (this.currentCandle) {
      return [...this.candles, { ...this.currentCandle }];
    }
    return [...this.candles];
  }
}

export class FlowCandlePatternDetector {
  detect(candles: FlowCandle[]): PatternSignal[] {
    const signals: PatternSignal[] = [];
    if (!candles || candles.length < 2) return signals;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    if (last.activity > prev.activity * 2.5 && last.activity > 300000) {
      const isBull = last.buyActivity > last.sellActivity * 1.8;
      const isBear = last.sellActivity > last.buyActivity * 1.8;
      if (isBull || isBear) {
        signals.push(createPatternSignal({
          type: 'FLOW_DELTA_EXPANSION',
          title: isBull ? 'Bullish Delta Spike' : 'Bearish Delta Spike',
          bias: isBull ? 'bullish' : 'bearish',
          price: last.close,
          confidence: clamp(65 + Math.min(25, (last.activity / 1000000) * 10), 65, 92),
          severity: 'high',
          timeframe: '1-3min',
          explanation: `Sipariş akışında hacim patlaması (${fmtQty(last.activity / 1000)}k) — güçlü yönsel ivme`,
          metadata: { buyActivity: last.buyActivity, sellActivity: last.sellActivity, total: last.activity }
        }));
      }
    }
    return signals;
  }
}

export class CVDDivergenceDetector {
  detect(candles: FlowCandle[], cvdValues: number[]): PatternSignal[] {
    const signals: PatternSignal[] = [];
    if (!candles || candles.length < 5 || !cvdValues || cvdValues.length < 5) return signals;

    const priceStart = candles[candles.length - 5].close;
    const priceEnd = candles[candles.length - 1].close;
    const cvdStart = cvdValues[cvdValues.length - 5];
    const cvdEnd = cvdValues[cvdValues.length - 1];

    const priceUp = priceEnd > priceStart * 1.0008;
    const priceDown = priceEnd < priceStart * 0.9992;
    const cvdUp = cvdEnd > cvdStart + 5;
    const cvdDown = cvdEnd < cvdStart - 5;

    if (priceDown && cvdUp) {
      signals.push(createPatternSignal({
        type: 'CVD_BULLISH_DIVERGENCE',
        title: 'Bullish CVD Divergence',
        bias: 'bullish',
        price: priceEnd,
        confidence: 78,
        severity: 'high',
        timeframe: '1-5min',
        explanation: 'Fiyat düşerken CVD yükseliyor — pasif alıcı emilimi (absorption)',
        metadata: { priceDelta: priceEnd - priceStart, cvdDelta: cvdEnd - cvdStart }
      }));
    } else if (priceUp && cvdDown) {
      signals.push(createPatternSignal({
        type: 'CVD_BEARISH_DIVERGENCE',
        title: 'Bearish CVD Divergence',
        bias: 'bearish',
        price: priceEnd,
        confidence: 78,
        severity: 'high',
        timeframe: '1-5min',
        explanation: 'Fiyat yükselirken CVD düşüyor — pasif satıcı emilimi',
        metadata: { priceDelta: priceEnd - priceStart, cvdDelta: cvdEnd - cvdStart }
      }));
    }

    return signals;
  }
}
