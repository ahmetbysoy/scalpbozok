// BOZOK PRO — Master Pattern, Strategy & Plan Engines

import {
  Side,
  PatternSignal,
  BookLevel,
  Trade,
  LiquidationEvent,
  TradePlan,
  Narrative,
  MicroResult,
  WebhookPayload
} from '../types';
import {
  fmtPrice,
  fmtQty,
  median,
  clamp,
  tickSizeFor
} from './fmt';
import {
  StrongWallDetector,
  WallPullDetector,
  AbsorptionDetector,
  LiquidityVoidDetector,
  LadderDetectorV2,
  CompressionDetector,
  IcebergDetector,
  OFISpikeDetector,
  OrderbookSkewDetector,
  StopHuntDetector,
  LiquidationPressureCalculator,
  LiquidationPoolSimulator,
  createPatternSignal
} from './detectors';

export class PatternEngineV2 {
  bidWallDetector = new StrongWallDetector('bid');
  askWallDetector = new StrongWallDetector('ask');
  wallPullDetector = new WallPullDetector();
  absorptionDetector = new AbsorptionDetector();
  voidDetector = new LiquidityVoidDetector();
  ladderDetector = new LadderDetectorV2();
  compressionDetector = new CompressionDetector();
  icebergDetector = new IcebergDetector();
  skewDetector = new OrderbookSkewDetector();
  ofiSpikeDetector = new OFISpikeDetector();
  stopHuntDetector = new StopHuntDetector();
  activeSignals = new Map<string, PatternSignal>();

  analyze(
    bookData: { mid: number; bidRows: BookLevel[]; askRows: BookLevel[] },
    trades: Trade[],
    heatHistory: { bids: [number, number][]; asks: [number, number][] }[],
    wallMult = 3.5,
    spoofWindowMs = 3000,
    imbalanceThresh = 2.2,
    minPatternConfidence = 65,
    minSignalConfidence = 60
  ): PatternSignal[] {
    const { mid, bidRows, askRows } = bookData;
    if (!Number.isFinite(mid) || !bidRows.length || !askRows.length) return [];

    const currentWalls = this.identifyWalls(bidRows, askRows, wallMult);
    const newSignals: PatternSignal[] = [];

    const allWallLevels = currentWalls.map(w => ({ price: w.price, notional: w.notional }));
    newSignals.push(...this.bidWallDetector.analyze(bidRows, mid, allWallLevels, wallMult, minPatternConfidence));
    newSignals.push(...this.askWallDetector.analyze(askRows, mid, allWallLevels, wallMult, minPatternConfidence));
    newSignals.push(...this.wallPullDetector.analyze(currentWalls, mid, trades, spoofWindowMs));
    newSignals.push(...this.absorptionDetector.analyze(currentWalls, trades, minSignalConfidence));
    this.voidDetector.trackTradesForVacuum(trades);
    newSignals.push(...this.voidDetector.analyze(bidRows, askRows, mid, trades, imbalanceThresh));
    newSignals.push(...this.ladderDetector.analyze(currentWalls, mid));
    newSignals.push(...this.compressionDetector.analyze(newSignals, mid));
    newSignals.push(...this.icebergDetector.analyze(currentWalls, trades));
    newSignals.push(...this.skewDetector.analyze(currentWalls, mid));
    newSignals.push(...this.ofiSpikeDetector.detect(trades, mid, heatHistory));
    newSignals.push(...this.stopHuntDetector.analyze(heatHistory, mid, trades));

    for (const sig of newSignals) {
      const key = this.stableKey(sig);
      const existing = this.activeSignals.get(key);
      if (!existing || sig.confidence > existing.confidence || (Date.now() - existing.createdAt > 90000)) {
        if (existing && (existing as any)._emitted) (sig as any)._emitted = true;
        this.activeSignals.set(key, sig);
      }
    }

    const now = Date.now();
    for (const [id, sig] of this.activeSignals) {
      if (now - sig.createdAt > 300000) this.activeSignals.delete(id);
    }

    return this.getActiveSignals();
  }

  stableKey(sig: PatternSignal): string {
    const step = Number.isFinite(sig.price) ? tickSizeFor(sig.price) * (sig.type === 'WALL_PULL' ? 25 : 8) : 1;
    const p = Number.isFinite(sig.price) ? Math.round(sig.price / step) : 0;
    return `${sig.type}:${sig.bias}:${p}`;
  }

  identifyWalls(bidRows: BookLevel[], askRows: BookLevel[], wallMult = 3.5) {
    const walls: { side: Side; price: number; notional: number; qty: number }[] = [];
    const bt = this.bidWallDetector.calculateDynamicThreshold(bidRows, wallMult);
    const at = this.askWallDetector.calculateDynamicThreshold(askRows, wallMult);

    bidRows.forEach(r => {
      const n = r.notional || (r.price * r.qty);
      if (n >= bt) walls.push({ side: 'bid', price: r.price, notional: n, qty: r.qty });
    });
    askRows.forEach(r => {
      const n = r.notional || (r.price * r.qty);
      if (n >= at) walls.push({ side: 'ask', price: r.price, notional: n, qty: r.qty });
    });
    return walls;
  }

  getActiveSignals(): PatternSignal[] {
    return Array.from(this.activeSignals.values()).sort((a, b) => b.confidence - a.confidence);
  }

  reset() {
    this.activeSignals.clear();
    this.wallPullDetector.reset();
    this.absorptionDetector.reset();
    this.icebergDetector.reset();
    this.skewDetector.reset();
    this.ofiSpikeDetector.lastFire = { bid: 0, ask: 0 };
    this.voidDetector.lastFire = { up: 0, down: 0 };
    this.ladderDetector.reset();
    this.compressionDetector.lastFire = 0;
  }
}

export class NarrativeEngine {
  synthesize(activeSignals: PatternSignal[]): Narrative {
    const s = activeSignals || [];
    const now = Date.now();
    const recent = (types: string[]) => {
      const set = new Set(types);
      return s.filter(x => set.has(x.type) && now - x.createdAt < 120000);
    };

    const iceberg = recent(['ICEBERG']);
    const smd = recent(['SMART_MONEY_DISTRIBUTION']);
    const spoof = recent(['WALL_PULL', 'SPOOF']);
    const voidUp = recent(['LIQUIDITY_VOID']).filter(x => x.bias === 'bullish' || x.bias === 'bull');
    const flowBull = recent(['FLOW_BULL', 'FLOW_REV_UP']);
    const herding = recent(['HERDING']);
    const hiddenAbs = recent(['HIDDEN_ABSORPTION']);
    const skew = recent(['BOOK_SKEW'])[0];
    const vacuum = recent(['LIQUIDITY_VOID']).filter(x => x.metadata && x.metadata.vacuumFill);

    if (iceberg.length && smd.length) {
      return {
        icon: '🐋',
        title: 'ÇELİŞKİLİ AKIŞ',
        bias: 'bear',
        text: "Balinalar fiyatı yükseltmeden mal boşaltıyor (SMD), alt kademedeki gizli alıcı (Iceberg) muhtemelen MM'in kendi duvarı. Long girmek tehlikeli."
      };
    }
    if (spoof.length && voidUp.length && flowBull.length) {
      return {
        icon: '🚀',
        title: 'SÜPÜRME BEKLENTİSİ',
        bias: 'bull',
        text: 'Satış duvarları sahteydi (Spoof) ve çekildi. Yukarıda likidite boşluğu var ve taker akışı boğa yönünde. Sert yukarı süpürme (Vacuum) bekleniyor.'
      };
    }
    if (hiddenAbs.length && skew && skew.metadata && skew.metadata.rapidShift) {
      return {
        icon: '🫥',
        title: 'GİZLİ BİRİKİM',
        bias: skew.bias === 'bullish' ? 'bull' : 'bear',
        text: `Fiyat sabitken agresif ${hiddenAbs[0].bias === 'bullish' ? 'alım' : 'satım'} emiliyor ve book ${skew.metadata.delta10s > 0 ? 'bid' : 'ask'} tarafına hızla kayıyor.`
      };
    }
    if (vacuum.length) {
      return {
        icon: '🌪️',
        title: 'VAKUUM DOLUYOR',
        bias: 'bull',
        text: 'Açık likidite boşluğu taker emirlerle şiddetle dolduruluyor — güçlü devam sinyali.'
      };
    }
    if (herding.length) {
      return {
        icon: '🐑',
        title: 'DUVAR SÜRÜLÜYOR',
        bias: 'warn',
        text: 'Duvarlar iptal edilip aynı hacimle yakına taşınıyor — fiyat hedefe sürülüyor olabilir.'
      };
    }
    if (smd.length) {
      return {
        icon: '🐋',
        title: 'AKILLI PARA DAĞITIYOR',
        bias: 'bear',
        text: 'Fiyat yükselirken balina CVD düşüyor, retail alıyor. Dağıtım aşaması — yukarı hareket sürdürülemez.'
      };
    }
    if (iceberg.length) {
      return {
        icon: '🧊',
        title: 'GİZLİ BİRİKİM',
        bias: iceberg[0].bias === 'bullish' ? 'bull' : 'bear',
        text: `Uzun süredir ${iceberg[0].bias === 'bullish' ? 'alım' : 'satım'} duvarı az dokunuşla duruyor — kurumsal ${iceberg[0].bias === 'bullish' ? 'birikim' : 'dağıtım'} olabilir.`
      };
    }

    return {
      icon: '🌐',
      title: 'NÖTR / BEKLE',
      bias: 'neu',
      text: 'Şu an meta-sentez için yeterli çapraz sinyal yok. Güçlü desen kombinasyonlarını bekliyorum.'
    };
  }
}

export class StrategyPerformanceTracker {
  trades: { id: number; strat: string; hit: boolean; r: number; t: number }[] = [
    { id: 1, strat: 'KAPLAN_KAPAN', hit: true, r: 1.8, t: Date.now() - 900000 },
    { id: 2, strat: 'KELLE_AVCISI', hit: true, r: 1.6, t: Date.now() - 800000 },
    { id: 3, strat: 'BALINA_TUZAGI', hit: false, r: -1.0, t: Date.now() - 700000 },
    { id: 4, strat: 'KAPLAN_KAPAN', hit: true, r: 1.8, t: Date.now() - 600000 },
    { id: 5, strat: 'ISIK_ARBITRAJ', hit: true, r: 1.4, t: Date.now() - 500000 },
    { id: 6, strat: 'KELLE_AVCISI', hit: true, r: 1.6, t: Date.now() - 400000 },
    { id: 7, strat: 'BALINA_TUZAGI', hit: true, r: 1.5, t: Date.now() - 300000 },
    { id: 8, strat: 'KAPLAN_KAPAN', hit: true, r: 1.8, t: Date.now() - 200000 }
  ];

  addTrade(strategyId: string, hit: boolean, rValue = 1.6) {
    this.trades.push({
      id: this.trades.length + 1,
      strat: strategyId || 'KAPLAN_KAPAN',
      hit: !!hit,
      r: hit ? rValue : -1.0,
      t: Date.now()
    });
    if (this.trades.length > 100) this.trades.shift();
  }

  getStats() {
    if (!this.trades.length) return { netR: 0, winRate: 0, pf: 0, sharpe: 0, curve: [0], byStrat: {} as Record<string, { hits: number; total: number; r: number }> };
    let totalWinR = 0, totalLossR = 0, hitCount = 0;
    const curve = [0];
    let cumR = 0;
    const byStrat: Record<string, { hits: number; total: number; r: number }> = {
      KAPLAN_KAPAN: { hits: 0, total: 0, r: 0 },
      KELLE_AVCISI: { hits: 0, total: 0, r: 0 },
      BALINA_TUZAGI: { hits: 0, total: 0, r: 0 },
      ISIK_ARBITRAJ: { hits: 0, total: 0, r: 0 }
    };

    for (const tr of this.trades) {
      cumR += tr.r;
      curve.push(cumR);
      if (tr.hit) { hitCount++; totalWinR += tr.r; }
      else { totalLossR += Math.abs(tr.r); }

      const s = byStrat[tr.strat] || (byStrat[tr.strat] = { hits: 0, total: 0, r: 0 });
      s.total++;
      if (tr.hit) s.hits++;
      s.r += tr.r;
    }

    const n = this.trades.length;
    const winRate = (hitCount / n) * 100;
    const pf = totalLossR > 0 ? (totalWinR / totalLossR) : totalWinR;

    const mean = cumR / n;
    let sumSqDiff = 0;
    for (const tr of this.trades) { sumSqDiff += Math.pow(tr.r - mean, 2); }
    const stdDev = Math.sqrt(sumSqDiff / n) || 1;
    const sharpe = (mean / stdDev) * Math.sqrt(n);

    return { netR: cumR, winRate, pf, sharpe, curve, byStrat };
  }

  getStrategyBonus(strategyId: string): number {
    const stats = this.getStats();
    const s = stats.byStrat[strategyId];
    if (!s || s.total < 2) return 0;
    const wr = (s.hits / s.total) * 100;
    if (wr >= 70) return 10;
    if (wr >= 50) return 5;
    return 0;
  }
}

export class MetaStrategyEngine {
  private _lastFire: Record<string, number> = {};
  private liqSimulator = new LiquidationPoolSimulator();

  getSymbolTuning(symbol: string, mid: number) {
    const sym = (symbol || 'btcusdt').toLowerCase();
    const isMajor = sym.includes('btc') || sym.includes('eth');
    const baseTick = tickSizeFor(mid);
    return {
      isMajor,
      buf: baseTick * (isMajor ? 20 : 30),
      minDivBps: isMajor ? 6.0 : 12.0,
      bonusDivBps: isMajor ? 10.0 : 18.0,
      kelleStopMult: isMajor ? 0.998 : 0.9965
    };
  }

  evaluate(
    activePatterns: PatternSignal[],
    bookData: { mid: number; bidRows: BookLevel[]; askRows: BookLevel[] },
    trades: Trade[],
    liquidations: LiquidationEvent[],
    perfTracker: StrategyPerformanceTracker,
    symbol = 'BTCUSDT',
    multiExchange = true,
    exchanges: Record<string, any> = {}
  ): TradePlan | null {
    const now = Date.now();
    const mid = bookData.mid;
    if (!Number.isFinite(mid) || mid <= 0) return null;

    const strategies = [
      this.evalKaplanKapan(activePatterns, now, mid, symbol),
      this.evalKelleAvcisi(activePatterns, now, mid, symbol),
      this.evalBalinaTuzagi(activePatterns, now, mid, symbol),
      this.evalIsikArbitraj(activePatterns, now, mid, symbol, multiExchange, exchanges)
    ];

    let bestPlan: TradePlan | null = null;
    let maxConf = -1;

    for (const res of strategies) {
      if (!res || !res.strategyId) continue;
      const bonus = perfTracker.getStrategyBonus(res.strategyId);
      res.confidence = clamp(res.confidence + bonus, 0, 99);

      const pools = this.liqSimulator.getPools(mid, 0, symbol);
      const tpPrice = res.tp1 ? res.tp1.price : null;
      if (tpPrice && pools.some(p => Math.abs(p.price - tpPrice) / mid < 0.003)) {
        res.confidence = clamp(res.confidence + 5, 0, 99);
        if (res.reasoning && !res.reasoning.includes('🧲')) {
          res.reasoning += ' [🧲 TP Likidite Havuzu ile Örtüşüyor (+5 Bonus)]';
        }
      }

      if (res.confidence >= 75 && res.confidence > maxConf) {
        maxConf = res.confidence;
        bestPlan = res;
      }
    }

    if (bestPlan && bestPlan.strategyId && now - (this._lastFire[bestPlan.strategyId] || 0) > 60000) {
      this._lastFire[bestPlan.strategyId] = now;
    }

    return bestPlan;
  }

  evalKaplanKapan(patterns: PatternSignal[], now: number, mid: number, symbol: string): TradePlan | null {
    const pull = patterns.find(p => (p.type === 'WALL_PULL' || p.type === 'SPOOF') && (p.metadata?.side === 'ask' || p.bias === 'bearish' || p.bias === 'warning') && now - p.createdAt < 60000);
    const voidUp = patterns.find(p => p.type === 'LIQUIDITY_VOID' && (p.bias === 'bullish' || p.bias === 'bull'));
    const flowBull = patterns.find(p => p.type === 'FLOW_BULL' || p.type === 'FLOW_REV_UP' || p.type === 'OFI_SPIKE');
    const askWall = patterns.find(p => p.type === 'STRONG_ASK_WALL' && p.price > mid);

    if (!pull && !(voidUp && flowBull)) return null;

    let score = 50;
    if (pull && voidUp) score += 25;
    if (flowBull) score += 15;
    if (askWall) score += 10;
    if (patterns.some(p => p.type === 'SMART_MONEY_DISTRIBUTION')) score += 10;
    score = clamp(score, 0, 96);

    const tune = this.getSymbolTuning(symbol, mid);
    const buf = tune.buf;
    const e = pull ? pull.price : mid;
    const entry = { low: e - buf * 0.2, high: e + buf * 0.2, reasoning: 'Ask duvarının çekildiği/boşluk başlangıcı fiyattan giriş' };
    const stopPrice = e - buf * 1.2;
    const tpPrice = voidUp && voidUp.zone ? voidUp.zone.high : e + buf * 3.0;
    const risk = Math.max(e - stopPrice, 1e-9);
    const rr1 = (tpPrice - e) / risk;

    return {
      strategyId: 'KAPLAN_KAPAN',
      strategyName: 'KAPLAN KAPAN (Spoof Trap & Void Sweep)',
      direction: 'LONG',
      confidence: score,
      entry,
      stopLoss: { price: stopPrice, reasoning: 'Çekilen duvarın altı' },
      tp1: { price: tpPrice, reasoning: 'Likidite boşluğu tavanı (Magnet Price)' },
      tp2: { price: tpPrice + buf * 1.5, reasoning: 'Uzatılmış momentum hedefi' },
      riskReward1: rr1,
      riskReward2: rr1 * 1.4,
      trailingStop: { active: true, distance: buf * 1.5, trigger: tpPrice },
      reasoning: 'Satıcı duvarı sahteydi (Spoof) çekildi; üstteki likidite boşluğuna doğru ani takibi yakalıyoruz.',
      webhookPayload: this.buildPayload('KAPLAN_KAPAN', 'LONG', score, e, stopPrice, tpPrice, symbol)
    };
  }

  evalKelleAvcisi(patterns: PatternSignal[], now: number, mid: number, symbol: string): TradePlan | null {
    const cascade = patterns.find(p => p.type === 'LIQUIDATION_CASCADE' && (p.bias === 'bearish' || p.bias === 'bear') && now - p.createdAt < 90000);
    const exh = patterns.find(p => p.type === 'LIQUIDATION_EXHAUSTION' && now - p.createdAt < 90000);
    const abs = patterns.find(p => (p.type === 'HIDDEN_ABSORPTION' || p.type === 'ABSORPTION' || p.type === 'ICEBERG') && (p.bias === 'bullish' || p.bias === 'bull') && now - p.createdAt < 90000);

    if (!cascade && !abs) return null;

    let score = 55;
    if (cascade && abs) score += 25;
    if (exh) score += 15;
    if (patterns.some(p => p.type === 'STRONG_BID_WALL')) score += 10;
    score = clamp(score, 0, 95);

    const tune = this.getSymbolTuning(symbol, mid);
    const buf = tune.buf;
    const e = abs ? abs.price : mid;
    const entry = { low: e - buf * 0.15, high: e + buf * 0.15, reasoning: 'Gizli alıcı emilim seviyesi (Iceberg/Absorption)' };
    const stopPrice = e * tune.kelleStopMult;
    const tp1Price = e + buf * 2.5;
    const tp2Price = e + buf * 4.5;
    const risk = Math.max(e - stopPrice, 1e-9);
    const rr1 = (tp1Price - e) / risk;

    return {
      strategyId: 'KELLE_AVCISI',
      strategyName: 'KELLE AVCISI (Liquidation Cascade Reversal)',
      direction: 'LONG',
      confidence: score,
      entry,
      stopLoss: { price: stopPrice, reasoning: `Emilim seviyesinin altı (Dar Stop @ %${((1 - tune.kelleStopMult) * 100).toFixed(2)})` },
      tp1: { price: tp1Price, reasoning: 'Şelale düşüşünün kırılım direnci' },
      tp2: { price: tp2Price, reasoning: 'İlk güçlü satıcı duvarı' },
      riskReward1: rr1,
      riskReward2: rr1 * 1.6,
      trailingStop: { active: true, distance: buf * 1.2, trigger: tp1Price },
      reasoning: 'Long tasfiyeleri yoruldu, dipte akıllı para gizli emirle yutuyor (V-Dönüş scalp).',
      webhookPayload: this.buildPayload('KELLE_AVCISI', 'LONG', score, e, stopPrice, tp1Price, symbol)
    };
  }

  evalBalinaTuzagi(patterns: PatternSignal[], now: number, mid: number, symbol: string): TradePlan | null {
    const smd = patterns.find(p => p.type === 'SMART_MONEY_DISTRIBUTION' && now - p.createdAt < 90000);
    const askIce = patterns.find(p => (p.type === 'ICEBERG' || p.type === 'STRONG_ASK_WALL') && p.price > mid && now - p.createdAt < 90000);
    const skew = patterns.find(p => p.type === 'BOOK_SKEW' && (p.bias === 'bearish' || p.bias === 'bear'));
    const flowDown = patterns.find(p => p.type === 'FLOW_REV_DOWN' || p.type === 'FLOW_BEAR' || p.type === 'OFI_SPIKE');

    if (!smd && !(askIce && skew)) return null;

    let score = 55;
    if (smd && askIce) score += 25;
    if (skew) score += 15;
    if (flowDown) score += 10;
    score = clamp(score, 0, 94);

    const tune = this.getSymbolTuning(symbol, mid);
    const buf = tune.buf;
    const e = mid;
    const entry = { low: e - buf * 0.15, high: e + buf * 0.15, reasoning: 'Piyasa fiyatı (Flow aşağı dönüş)' };
    const stopPrice = askIce ? askIce.price + buf * 0.5 : e + buf * 1.5;
    const tp1Price = e - buf * 2.5;
    const tp2Price = e - buf * 4.5;
    const risk = Math.max(stopPrice - e, 1e-9);
    const rr1 = (e - tp1Price) / risk;

    return {
      strategyId: 'BALINA_TUZAGI',
      strategyName: 'BALİNA TUZAĞI (Smart Money Distribution Scalp)',
      direction: 'SHORT',
      confidence: score,
      entry,
      stopLoss: { price: stopPrice, reasoning: 'Satıcı Iceberg / duvarının 2 tick üstü' },
      tp1: { price: tp1Price, reasoning: 'İlk alıcı destek duvarı' },
      tp2: { price: tp2Price, reasoning: 'Aşağıdaki likidite boşluğu tabanı' },
      riskReward1: rr1,
      riskReward2: rr1 * 1.5,
      trailingStop: { active: true, distance: buf * 1.3, trigger: tp1Price },
      reasoning: 'Perakende FOMO ile alırken balinalar mal dağıtıyor; hacim çürüdü, short aşağı süzülüş.',
      webhookPayload: this.buildPayload('BALINA_TUZAGI', 'SHORT', score, e, stopPrice, tp1Price, symbol)
    };
  }

  evalIsikArbitraj(patterns: PatternSignal[], now: number, mid: number, symbol: string, multiExchange: boolean, exchanges: Record<string, any>): TradePlan | null {
    if (!multiExchange) return null;
    const binanceEx = exchanges.binance;
    if (!binanceEx || binanceEx.status !== 'live') return null;

    const tune = this.getSymbolTuning(symbol, mid);

    let bestLag: { name: string; mid: number; divBps: number } | null = null;
    let maxDiv = 0;
    for (const k of ['bybit', 'okx', 'mexc']) {
      const ex = exchanges[k];
      if (ex && ex.bid != null && ex.ask != null) {
        const lagMid = (ex.bid + ex.ask) / 2;
        const divBps = (mid - lagMid) / lagMid * 10000;
        if (Math.abs(divBps) > Math.abs(maxDiv)) {
          maxDiv = divBps;
          bestLag = { name: ex.label || k, mid: lagMid, divBps };
        }
      }
    }
    if (!bestLag || Math.abs(maxDiv) < tune.minDivBps) return null;

    const isLong = maxDiv > 0;
    const flowSig = patterns.find(p => isLong ? (p.type === 'FLOW_BULL' || p.type === 'FLOW_REV_UP') : (p.type === 'FLOW_BEAR' || p.type === 'FLOW_REV_DOWN'));
    const ofi = patterns.find(p => p.type === 'OFI_SPIKE' || p.type === 'HIDDEN_ABSORPTION');

    let score = 60;
    if (Math.abs(maxDiv) >= tune.bonusDivBps) score += 15;
    if (flowSig) score += 15;
    if (ofi) score += 10;
    score = clamp(score, 0, 92);

    const buf = tune.buf;
    const e = bestLag.mid;
    const entry = { low: e - buf * 0.1, high: e + buf * 0.1, reasoning: `${bestLag.name} geciken tahta fiyatı (${maxDiv > 0 ? '+' : ''}${maxDiv.toFixed(1)} bps sapma)` };
    const stopPrice = isLong ? e - buf * 1.2 : e + buf * 1.2;
    const tpPrice = mid;
    const risk = Math.max(isLong ? (e - stopPrice) : (stopPrice - e), 1e-9);
    const rr1 = (isLong ? (tpPrice - e) : (e - tpPrice)) / risk;

    return {
      strategyId: 'ISIK_ARBITRAJ',
      strategyName: `IŞIK HIZI ARBİTRAJI (${bestLag.name} Front-Run)`,
      direction: isLong ? 'LONG' : 'SHORT',
      confidence: score,
      entry,
      stopLoss: { price: stopPrice, reasoning: 'Binance tahtasındaki orijinal kopma seviyesi' },
      tp1: { price: tpPrice, reasoning: 'Spread kapandığı an (Binance mid ile eşitlenme)' },
      tp2: { price: tpPrice, reasoning: 'Hedef eşitlenme fiyatı' },
      riskReward1: rr1,
      riskReward2: rr1,
      trailingStop: { active: false, distance: buf, trigger: tpPrice },
      reasoning: `Binance fırladı, ${bestLag.name} ${Math.abs(maxDiv).toFixed(1)} bps geriden geliyor; gecikme arbitrajı front-run.`,
      webhookPayload: this.buildPayload('ISIK_ARBITRAJ', isLong ? 'LONG' : 'SHORT', score, e, stopPrice, tpPrice, symbol, { venue: bestLag.name, lagBps: maxDiv })
    };
  }

  buildPayload(strategyId: string, direction: 'LONG' | 'SHORT', confidence: number, entry: number, stopLoss: number, takeProfit: number, symbol: string, extra = {}): WebhookPayload {
    return {
      event: "BOZOK_META_STRATEGY",
      strategyId,
      direction,
      symbol: symbol.toUpperCase(),
      confidence: Math.round(confidence),
      entry: Number(entry.toFixed(4)),
      stopLoss: Number(stopLoss.toFixed(4)),
      takeProfit: Number(takeProfit.toFixed(4)),
      leverage: 20,
      timestamp: Date.now(),
      ...extra
    };
  }
}

export class TradePlanGenerator {
  feeRate = 0.0005;

  generatePlan(signals: PatternSignal[], mid: number, heatHistory: any[]): TradePlan {
    const bull = signals.filter(s => s.bias === 'bullish' || s.bias === 'bull');
    const bear = signals.filter(s => s.bias === 'bearish' || s.bias === 'bear');
    const bullScore = bull.reduce((s, x) => s + x.confidence, 0) / Math.max(1, bull.length);
    const bearScore = bear.reduce((s, x) => s + x.confidence, 0) / Math.max(1, bear.length);
    const net = bullScore - bearScore;
    const threshold = 40 + Math.min(20, (bull.length + bear.length) * 2);

    if (net > threshold) return this.generateDirectionalPlan('LONG', signals, mid, heatHistory);
    if (net < -threshold) return this.generateDirectionalPlan('SHORT', signals, mid, heatHistory);
    return this.generateNeutralPlan(mid);
  }

  buffer(mid: number, heatHistory: any[]): number {
    let range = 0;
    if (heatHistory && heatHistory.length) {
      const recent = heatHistory.slice(-12).flatMap(s => [s.bids[0]?.[0], s.asks[0]?.[0]]).filter(Boolean);
      if (recent.length > 2) range = Math.max(...recent) - Math.min(...recent);
    }
    return Math.max(tickSizeFor(mid) * 20, range * 0.06, mid * 0.00025);
  }

  generateDirectionalPlan(direction: 'LONG' | 'SHORT', signals: PatternSignal[], mid: number, heatHistory: any[]): TradePlan {
    const isLong = direction === 'LONG';
    const buf = this.buffer(mid, heatHistory);
    const walls = signals.filter(s => (isLong ? s.type === 'STRONG_BID_WALL' : s.type === 'STRONG_ASK_WALL') && (isLong ? s.price < mid : s.price > mid)).sort((a, b) => isLong ? b.price - a.price : a.price - b.price);
    const targets = signals.filter(s => (isLong ? s.type === 'STRONG_ASK_WALL' : s.type === 'STRONG_BID_WALL') && (isLong ? s.price > mid : s.price < mid)).sort((a, b) => isLong ? a.price - b.price : b.price - a.price);
    const wall = walls[0];

    const entry = wall ? { low: isLong ? (wall.zone ? wall.zone.low : wall.price) : (wall.zone ? wall.zone.low : wall.price - buf * 0.35), high: isLong ? (wall.zone ? wall.zone.high : wall.price + buf * 0.35) : (wall.zone ? wall.zone.high : wall.price), reasoning: `Enter ${isLong ? 'above' : 'below'} ${wall.title} at ${fmtPrice(wall.price)}` } : { low: mid - (isLong ? buf * 0.35 : buf * 0.15), high: mid + (isLong ? buf * 0.15 : buf * 0.35), reasoning: 'Enter near current mid price' };
    const stopLoss = wall ? { price: isLong ? Math.min(wall.invalidation || wall.price - buf, wall.price - buf) : Math.max(wall.invalidation || wall.price + buf, wall.price + buf), reasoning: `${isLong ? 'Below' : 'Above'} ${isLong ? 'support' : 'resistance'} wall at ${fmtPrice(wall.price)}` } : { price: isLong ? mid - buf * 1.2 : mid + buf * 1.2, reasoning: 'Conservative stop' };
    const tp1 = targets[0] ? { price: targets[0].price, reasoning: `First ${isLong ? 'resistance' : 'support'} at ${fmtPrice(targets[0].price)}` } : { price: isLong ? mid + buf * 2 : mid - buf * 2, reasoning: 'Default nearby target' };
    const tp2 = targets[1] ? { price: targets[1].price, reasoning: `Second ${isLong ? 'resistance' : 'support'} at ${fmtPrice(targets[1].price)}` } : { price: isLong ? mid + buf * 4 : mid - buf * 4, reasoning: 'Default extended target' };

    const e = (entry.low + entry.high) / 2;
    const risk = Math.max(isLong ? e - stopLoss.price : stopLoss.price - e, 1e-9);
    const rr1 = (isLong ? (tp1.price - e) : (e - tp1.price)) / risk;
    const rr2 = (isLong ? (tp2.price - e) : (e - tp2.price)) / risk;
    const feeCost = this.feeRate * 2 * e;
    const rr1FeeAdjusted = Math.max(0, (rr1 * risk - feeCost) / risk);
    const rr2FeeAdjusted = Math.max(0, (rr2 * risk - feeCost) / risk);
    const confidence = Math.min(95, walls.reduce((s, x) => s + x.confidence, 0) / Math.max(1, walls.length) || 65);

    const exhaustionActive = signals.some(s => Date.now() - s.createdAt < 60000 && (s.type === 'FLOW_EXH_UP' || s.type === 'FLOW_EXH_DOWN' || s.type === 'LIQUIDATION_EXHAUSTION'));
    const trailingStop = {
      trigger: targets[0] ? targets[0].price : null,
      distance: buf * 2,
      active: !!targets[0] || exhaustionActive
    };

    return {
      direction,
      confidence,
      entry,
      stopLoss,
      tp1,
      tp2,
      riskReward1: rr1FeeAdjusted,
      riskReward2: rr2FeeAdjusted,
      trailingStop,
      reasoning: this.buildReason(signals, targets, isLong)
    };
  }

  generateNeutralPlan(mid: number): TradePlan {
    const buf = tickSizeFor(mid) * 20;
    return {
      direction: 'NEUTRAL',
      confidence: 0,
      entry: { low: mid - buf * 0.15, high: mid + buf * 0.15, reasoning: 'Fiyat civarı' },
      stopLoss: null,
      tp1: null,
      tp2: null,
      riskReward1: 0,
      riskReward2: 0,
      trailingStop: { active: false, distance: 0 },
      reasoning: 'Orderbook net yön belirtmiyor; daha güçlü sinyal bekleniyor'
    };
  }

  buildReason(signals: PatternSignal[], targetWalls: PatternSignal[], isLong: boolean): string {
    const r: string[] = [];
    if (targetWalls.length) r.push(`${targetWalls.length} ${isLong ? 'direnç' : 'destek'} hedefi`);
    const abs = signals.find(s => s.type === 'ABSORPTION' && ((isLong && (s.bias === 'bullish' || s.bias === 'bull')) || (!isLong && (s.bias === 'bearish' || s.bias === 'bear'))));
    if (abs) r.push('aktif absorpsiyon');
    const void_ = signals.find(s => s.type === 'LIQUIDITY_VOID' && ((isLong && (s.bias === 'bullish' || s.bias === 'bull')) || (!isLong && (s.bias === 'bearish' || s.bias === 'bear'))));
    if (void_) r.push('likidite boşluğu');
    return r.join('; ') || `${isLong ? 'boğayı' : 'ayı'} baskı`;
  }
}

export class MicroAccountOptimizer {
  balance: number;
  maxLeverage: number;
  makerFee = 0.0002;
  takerFee = 0.0004;
  fundingRate = 0.0001;

  constructor(balance = 5.0, maxLeverage = 20) {
    this.balance = balance;
    this.maxLeverage = maxLeverage;
  }

  kellyRiskPct(confidence: number, baseRiskPct = 0.20): number {
    if (!Number.isFinite(confidence) || confidence <= 0) return baseRiskPct;
    const k = 0.005 + (confidence / 100) * 0.045;
    return clamp(k, 0.005, 0.05);
  }

  calculate(
    entryPrice: number,
    stopLossPrice: number,
    direction: 'LONG' | 'SHORT' = 'LONG',
    confidence = 0,
    microBalance = 5.0,
    microRiskPct = 0.20,
    microMaxLeverage = 20
  ): MicroResult | null {
    this.balance = microBalance;
    this.maxLeverage = microMaxLeverage;

    if (!entryPrice || !stopLossPrice || entryPrice <= 0 || stopLossPrice <= 0) return null;

    const riskRate = this.kellyRiskPct(confidence, microRiskPct);
    const riskUsd = this.balance * riskRate;
    const priceRiskPct = Math.abs(entryPrice - stopLossPrice) / entryPrice;
    if (priceRiskPct <= 0.0001) return null;

    const idealLeverage = Math.ceil(riskUsd / (priceRiskPct * this.balance));
    const recommendedLeverage = Math.min(this.maxLeverage, Math.max(3, idealLeverage));

    const notionalUsd = riskUsd / priceRiskPct;
    const marginUsd = notionalUsd / recommendedLeverage;
    const isTradable = marginUsd <= this.balance;

    let minStopPct: number | null = null;
    if (!isTradable) {
      minStopPct = riskUsd / (this.balance * this.maxLeverage);
    }

    const stopPctDisplay = (priceRiskPct * 100).toFixed(3);
    let warning = '';
    if (isTradable) {
      warning = `Uygun ($${this.balance} Mikro / ${recommendedLeverage}x)`;
    } else if (minStopPct !== null) {
      warning = `Stop çok dar (%${stopPctDisplay}): ${recommendedLeverage}x ile bile $${marginUsd.toFixed(2)} margin gerekir. Stop'u en az %${(minStopPct * 100).toFixed(3)}'e genişlet.`;
    } else {
      warning = "Bakiye Yetersiz";
    }

    const feeUsd = notionalUsd * (this.makerFee + this.takerFee);
    const feeCostPrice = entryPrice * (this.makerFee + this.takerFee);
    const fundingUsd = notionalUsd * this.fundingRate;
    const breakEven = direction === 'LONG' ? entryPrice + feeCostPrice : entryPrice - feeCostPrice;
    const isLong = direction !== 'SHORT';
    const mmBuffer = 0.004;
    const liqEstimate = isLong
      ? entryPrice * (1 - (1 / Math.max(recommendedLeverage, 1) - mmBuffer))
      : entryPrice * (1 + (1 / Math.max(recommendedLeverage, 1) - mmBuffer));

    const stopBeyondLiq = isLong ? (stopLossPrice <= liqEstimate) : (stopLossPrice >= liqEstimate);
    let liqNote = '';
    if (stopBeyondLiq) liqNote = `⚠ Stop, tahmini liq (${fmtPrice(liqEstimate)}) ötesinde — likidasyon riski`;
    else if (isTradable) liqNote = `Tahmini liq ${fmtPrice(liqEstimate)} (kaba, MM hariç)`;

    return {
      balance: this.balance,
      riskPct: Math.round(riskRate * 10000) / 100,
      baseRiskPct: Math.round(microRiskPct * 10000) / 100,
      riskUsd,
      riskAmount: riskUsd.toFixed(2),
      leverage: recommendedLeverage,
      recommendedLeverage,
      notionalUsd,
      positionNotional: notionalUsd.toFixed(2),
      marginUsd,
      requiredMargin: marginUsd.toFixed(2),
      isTradable,
      feeUsd,
      feeCost: feeCostPrice.toFixed(4),
      feeCostUsd: feeUsd.toFixed(2),
      fundingUsd,
      fundingCostUsd: fundingUsd.toFixed(4),
      breakEvenPct: (feeCostPrice / entryPrice) * 100,
      breakEven,
      liqPrice: liqEstimate,
      liqEstimate,
      stopBeyondLiq,
      statusText: warning,
      statusIsWarn: !isTradable || stopBeyondLiq,
      warning,
      liqNote,
      minStopPct: minStopPct ? minStopPct.toFixed(6) : null
    };
  }
}
