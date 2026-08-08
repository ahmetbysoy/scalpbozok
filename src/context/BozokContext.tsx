// BOZOK PRO — Central State & Live WebSocket Context
// Performance-tuned:
//  - WebSocket reconnect with exponential backoff + jitter + visibility resume.
//  - High-frequency WS messages are buffered into refs and flushed on a timer
//    (config.renderIntervalMs), so React renders once per interval instead of
//    once per incoming frame.
//  - Hot state is split into multiple small Contexts so non-relevant branches
//    (e.g. Settings/Markets) don't re-render on every depth tick.
//  - A legacy useBozok() shim keeps all existing consumers working.
//
// IMPORTANT: scheduleFlush() is intentionally a STABLE callback (empty deps).
// All values it reads are mirrored into refs on every render, so it never
// closes over stale state AND never changes identity — which means the WS
// effect that depends on it will not tear down the socket on every flush.

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo
} from 'react';
import {
  AppConfig,
  Book,
  BookLevel,
  Trade,
  TickerInfo,
  ExchangeState,
  PatternSignal,
  TradePlan,
  Narrative,
  LiquidationEvent,
  FlowCandle,
  MicroResult,
  TabKey,
  HeatmapLayerKey,
  TrackedPosition,
  ClosedPosition,
  PositionStats
} from '../types';
import { setSymbolPrecision } from '../utils/fmt';
import { applyThemeStyle } from '../utils/theme';
import {
  PatternEngineV2,
  NarrativeEngine,
  MetaStrategyEngine,
  TradePlanGenerator,
  MicroAccountOptimizer,
  StrategyPerformanceTracker
} from '../utils/engines';
import {
  signalUX,
  VPINCalculator,
  LiquidationPressureCalculator,
  FlowCandleBuilder,
  CVDDivergenceDetector
} from '../utils/detectors';

/* ------------------------------------------------------------------ */
/*  Default config                                                     */
/* ------------------------------------------------------------------ */

const DEFAULT_LAYERS: HeatmapLayerKey[] = [
  'liquidity', 'walls', 'trades', 'liqpools', 'spoofing', 'iceberg', 'vpvr', 'crosshair'
];

const KNOWN_LAYERS = new Set<HeatmapLayerKey>([
  'liquidity', 'velocity', 'trades', 'walls', 'liqpools', 'spoofing', 'iceberg', 'vpvr', 'crosshair'
]);

const DEFAULT_CONFIG: AppConfig = {
  symbol: 'btcusdt',
  primaryExchange: 'binance',
  bookMode: 'binance',
  multiExchange: true,
  wallMult: 3.5,
  spoofWindowMs: 3000,
  imbalanceThresh: 2.2,
  algoWarEventsPerSec: 6,
  heatmapWindowSec: 60,
  sampleIntervalMs: 300,
  renderIntervalMs: 150,
  depthLevels: 20,
  overlayDensity: typeof window !== 'undefined' && window.innerWidth < 768 ? 'LOW' : 'NORMAL',
  ladderDepth: 'auto',
  chartMode: typeof window !== 'undefined' && window.innerWidth < 768 ? 'MINIMAL' : 'NORMAL',
  soundOn: true,
  voiceAnnounce: true,
  notifications: false,
  sensitivity: 'NORMAL',
  minPatternConfidence: typeof window !== 'undefined' && window.innerWidth < 768 ? 78 : 65,
  minSignalConfidence: 60,
  minFlowConfidence: 65,
  minToastConfidence: 78,
  theme: 'professional',
  colorblind: false,
  flowTimeframeMs: 5000,
  flowCandleMode: 'time',
  flowVolumeTarget: 1000000,
  minLiquidationNotional: 10000,
  feeRate: 0.0005,
  makerFee: 0.0002,
  takerFee: 0.0004,
  fundingRate: 0.0001,
  microBalance: 5.0,
  microRiskPct: 0.20,
  microMaxLeverage: 20,
  activeLayers: new Set<HeatmapLayerKey>(DEFAULT_LAYERS)
};

const LOAD_CONFIG = (): AppConfig => {
  if (typeof localStorage === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem('bozoksettingsv1');
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    let layers: HeatmapLayerKey[];
    const al = parsed.activeLayers;
    if (Array.isArray(al)) layers = al as HeatmapLayerKey[];
    else if (al && typeof al === 'object') layers = Object.keys(al) as HeatmapLayerKey[];
    else layers = DEFAULT_LAYERS;
    layers = layers.filter(l => KNOWN_LAYERS.has(l));
    if (!layers.length) layers = DEFAULT_LAYERS;
    return { ...DEFAULT_CONFIG, ...parsed, activeLayers: new Set<HeatmapLayerKey>(layers) };
  } catch {
    return DEFAULT_CONFIG;
  }
};

/* ------------------------------------------------------------------ */
/*  Slice / context types                                              */
/* ------------------------------------------------------------------ */

interface RollingAccuracy { dir: number | null; vol: number | null; dirN: number; volN: number; }

interface LiveSlice {
  symbol: string;
  lastPrice: number | null;
  prevPrice: number | null;
  ticker: TickerInfo;
  book: Book;
  trades: Trade[];
  cvd: number;
  cvdHistory: number[];
  largeCvdHistory: number[];
  smallCvdHistory: number[];
  vpinValue: number | null;
  heatHistory: { t: number; bids: [number, number][]; asks: [number, number][]; maxQty: number }[];
  liquidations: LiquidationEvent[];
  flowCandles: FlowCandle[];
  exchanges: Record<string, ExchangeState>;
  connStatus: ExchangeState['status'];
}

interface SignalSlice {
  activePatterns: PatternSignal[];
  signalsFeed: PatternSignal[];
  tradePlan: TradePlan | null;
  narrative: Narrative;
  microResult: MicroResult | null;
  sigCounts: { bull: number; bear: number; warn: number };
  manipIndex: number;
  rollingAccuracy: RollingAccuracy | null;
  positionStats: PositionStats;
  openPositions: TrackedPosition[];
}

interface UISlice {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  focusPrice: number | null;
  setFocusPrice: (p: number | null, durationMs?: number) => void;
  isReplaying: boolean;
}

interface ActionSlice {
  updateConfig: (patch: Partial<AppConfig>) => void;
  resetConfig: () => void;
  setSymbol: (sym: string) => void;
  speakTest: (text?: string) => void;
  exportCSV: () => void;
  replaySession: (session: any) => void;
  stopReplay: () => void;
}

interface StableRefs {
  perfTracker: StrategyPerformanceTracker;
  planHitboxes: { id: string; label: string; price: number; y: number }[];
  patternHitboxes: { x: number; y: number; w: number; h: number; pattern: PatternSignal }[];
  audioCtx: AudioContext | null;
}

/* ------------------------------------------------------------------ */
/*  Individual contexts                                                */
/* ------------------------------------------------------------------ */

const ConfigContext = createContext<AppConfig | null>(null);
const LiveContext = createContext<LiveSlice | null>(null);
const SignalContext = createContext<SignalSlice | null>(null);
const UIContext = createContext<UISlice | null>(null);
const ActionContext = createContext<ActionSlice | null>(null);
const StableContext = createContext<StableRefs | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export const BozokProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialConfig = useMemo(LOAD_CONFIG, []);

  // --- UI / static state ---------------------------------------------------
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<TabKey>('bookView');
  const [symbol, setSymbolState] = useState<string>(initialConfig.symbol.toUpperCase());
  const [focusPrice, setFocusPriceState] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  // --- Live / hot state ----------------------------------------------------
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [ticker, setTicker] = useState<TickerInfo>({ changePct: 0, volume: 0, high24h: 0, low24h: 0 });
  const [book, setBook] = useState<Book>({ bids: [], asks: [], ts: 0 });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [cvd, setCvd] = useState<number>(0);
  const [cvdHistory, setCvdHistory] = useState<number[]>([]);
  const [largeCvdHistory, setLargeCvdHistory] = useState<number[]>([]);
  const [smallCvdHistory, setSmallCvdHistory] = useState<number[]>([]);
  const [vpinValue, setVpinValue] = useState<number | null>(null);
  const [heatHistory, setHeatHistory] = useState<{ t: number; bids: [number, number][]; asks: [number, number][]; maxQty: number }[]>([]);
  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);
  const [flowCandles, setFlowCandles] = useState<FlowCandle[]>([]);
  const [connStatus, setConnStatus] = useState<ExchangeState['status']>('connecting');
  const [exchanges, setExchanges] = useState<Record<string, ExchangeState>>({
    binance: { key: 'binance', label: 'Binance Futures', tag: 'fstream.binance.com', status: 'connecting', bid: null, ask: null, ts: null, latencyMs: 0, lastError: null },
    bybit:   { key: 'bybit',   label: 'Bybit Linear',    tag: 'stream.bybit.com',    status: 'idle',         bid: null, ask: null, ts: null, latencyMs: 0, lastError: null },
    okx:     { key: 'okx',     label: 'OKX Swap',        tag: 'ws.okx.com',          status: 'idle',         bid: null, ask: null, ts: null, latencyMs: 0, lastError: null },
    mexc:    { key: 'mexc',    label: 'MEXC Contract',   tag: 'contract.mexc.com',   status: 'idle',         bid: null, ask: null, ts: null, latencyMs: 0, lastError: null }
  });

  // --- Signal / derived state ----------------------------------------------
  const [activePatterns, setActivePatterns] = useState<PatternSignal[]>([]);
  const [signalsFeed, setSignalsFeed] = useState<PatternSignal[]>([]);
  const [tradePlan, setTradePlan] = useState<TradePlan | null>(null);
  const [narrative, setNarrative] = useState<Narrative>({ icon: '🌐', title: 'NÖTR / BEKLE', bias: 'neu', text: 'Veri bekleniyor...' });
  const [microResult, setMicroResult] = useState<MicroResult | null>(null);
  const [sigCounts, setSigCounts] = useState<{ bull: number; bear: number; warn: number }>({ bull: 0, bear: 0, warn: 0 });
  const [rollingAccuracy, setRollingAccuracy] = useState<RollingAccuracy | null>(null);

  // ----------------------------------------------------------------
  // TradePlan yaşam döngüsü takibi (SL/TP1/TP2 vuruşu, R-multiple).
  // Açık pozisyonlar her saniye mid fiyatla çözülür. Timeout'lar
  // win-rate'e dahil edilmez; istatistik "kesin sonuç" üzerinden hesaplanır.
  // ----------------------------------------------------------------
  const POSITION_TIMEOUT_MS = 600000; // 10 dk: ne SL ne TP vurduysa timeout
  const openPositionsRef = useRef<TrackedPosition[]>([]);
  const closedPositionsRef = useRef<ClosedPosition[]>([]);
  const [openPositions, setOpenPositions] = useState<TrackedPosition[]>([]);
  const [positionStats, setPositionStats] = useState<PositionStats>(() => ({
    total: 0, wins: 0, losses: 0, timeouts: 0,
    winRate: null, avgR: null, expectancy: null,
    byStrategy: {}
  }));
  const lastPlanKeyRef = useRef<string>('');

  const computePositionStats = useCallback((closed: ClosedPosition[]): PositionStats => {
    const byStrategy: Record<string, { total: number; wins: number; r: number; decisive: number }> = {};
    let wins = 0;
    let decisiveCount = 0;
    let rSum = 0;

    for (const c of closed) {
      const sid = c.strategyId || 'DIRECTIONAL';
      const s = byStrategy[sid] || (byStrategy[sid] = { total: 0, wins: 0, r: 0, decisive: 0 });
      const isWin = c.outcome === 'TP1' || c.outcome === 'TP2';
      s.total++;
      s.r += c.rMultiple;
      if (c.outcome !== 'TIMEOUT') s.decisive++;
      if (isWin) { wins++; s.wins++; }
      if (c.outcome !== 'TIMEOUT') decisiveCount++;
      rSum += c.rMultiple;
    }

    const losses = closed.filter(c => c.outcome === 'STOP').length;
    const timeouts = closed.filter(c => c.outcome === 'TIMEOUT').length;
    const total = closed.length;
    const avgR = total ? rSum / total : null;

    const byStrategyOut: PositionStats['byStrategy'] = {};
    for (const [sid, s] of Object.entries(byStrategy)) {
      byStrategyOut[sid] = {
        total: s.total,
        wins: s.wins,
        winRate: s.decisive ? Math.round((s.wins / s.decisive) * 100) : null,
        avgR: s.total ? Math.round((s.r / s.total) * 100) / 100 : 0
      };
    }

    return {
      total,
      wins,
      losses,
      timeouts,
      winRate: decisiveCount ? Math.round((wins / decisiveCount) * 100) : null,
      avgR: avgR == null ? null : Math.round(avgR * 100) / 100,
      expectancy: avgR == null ? null : Math.round(avgR * 100) / 100,
      byStrategy: byStrategyOut
    };
  }, []);

  const openPositionForPlan = useCallback((plan: TradePlan) => {
    if (plan.direction === 'NEUTRAL' || !plan.stopLoss || !plan.entry) return;
    const entry = (plan.entry.low + plan.entry.high) / 2;
    const stopLoss = plan.stopLoss.price;
    const tp1 = plan.tp1 ? plan.tp1.price : null;
    const tp2 = plan.tp2 ? plan.tp2.price : null;
    if (!Number.isFinite(entry) || !Number.isFinite(stopLoss) || entry === stopLoss) return;

    const strategyId = plan.strategyId || 'DIRECTIONAL';
    // Aynı strateji için zaten açık pozisyon varsa yeniden açma.
    if (openPositionsRef.current.some(p => p.strategyId === strategyId)) return;

    const risk = Math.abs(entry - stopLoss) || 1e-9;
    openPositionsRef.current.push({
      id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      strategyId,
      strategyName: plan.strategyName,
      direction: plan.direction as 'LONG' | 'SHORT',
      entry,
      stopLoss,
      tp1,
      tp2,
      confidence: plan.confidence,
      rr1: Number.isFinite(plan.riskReward1) ? plan.riskReward1 : (tp1 ? Math.abs(tp1 - entry) / risk : 0),
      rr2: Number.isFinite(plan.riskReward2) ? plan.riskReward2 : (tp2 ? Math.abs(tp2 - entry) / risk : 1),
      openedAt: Date.now()
    });
    openPositionsRef.current = openPositionsRef.current.slice(-40);
    setOpenPositions([...openPositionsRef.current]);
  }, []);

  const resolvePositions = useCallback((midPrice: number) => {
    if (!Number.isFinite(midPrice) || midPrice <= 0) return;
    const open = openPositionsRef.current;
    if (!open.length) return;

    const now = Date.now();
    const keep: TrackedPosition[] = [];
    const newlyClosed: ClosedPosition[] = [];

    for (const pos of open) {
      const isLong = pos.direction === 'LONG';
      const risk = Math.abs(pos.entry - pos.stopLoss) || 1e-9;

      let outcome: ClosedPosition['outcome'] | null = null;
      let exitPrice = midPrice;
      let rMultiple = 0;

      if (isLong ? midPrice <= pos.stopLoss : midPrice >= pos.stopLoss) {
        outcome = 'STOP';
        exitPrice = pos.stopLoss;
        rMultiple = -1;
      } else if (pos.tp2 != null && (isLong ? midPrice >= pos.tp2 : midPrice <= pos.tp2)) {
        outcome = 'TP2';
        exitPrice = pos.tp2;
        rMultiple = pos.rr2;
      } else if (pos.tp1 != null && (isLong ? midPrice >= pos.tp1 : midPrice <= pos.tp1)) {
        outcome = 'TP1';
        exitPrice = pos.tp1;
        rMultiple = pos.rr1;
      } else if (now - pos.openedAt >= POSITION_TIMEOUT_MS) {
        outcome = 'TIMEOUT';
        exitPrice = midPrice;
        rMultiple = (isLong ? midPrice - pos.entry : pos.entry - midPrice) / risk;
      }

      if (!outcome) {
        keep.push(pos);
        continue;
      }

      newlyClosed.push({
        ...pos,
        closedAt: now,
        exitPrice,
        outcome,
        rMultiple: Math.round(rMultiple * 100) / 100
      });

      // Strateji performans bonusunu gerçek sonuçtan besle.
      const hit = outcome === 'TP1' || outcome === 'TP2';
      perfTrackerRef.current.addTrade(pos.strategyId, hit, hit ? rMultiple : -1);
    }

    openPositionsRef.current = keep;
    setOpenPositions([...keep]);
    if (newlyClosed.length) {
      closedPositionsRef.current = [...closedPositionsRef.current, ...newlyClosed].slice(-200);
      setPositionStats(computePositionStats(closedPositionsRef.current));
    }
  }, [computePositionStats]);

  // manipIndex: son 60 saniyedeki duvar çekme/spoof yoğunluğundan türetilir.
  // Sabit gösterim yerine gerçek sinyal akışı kullanılır; mock veri yoktur.
  const manipIndex = useMemo(() => {
    const cutoff = Date.now() - 60000;
    const spoofCount = signalsFeed.filter(s => {
      const type = (s.type || '').toUpperCase();
      const withinWindow = (s.createdAt || 0) >= cutoff;
      return withinWindow && (type.includes('WALL_PULL') || type.includes('SPOOF'));
    }).length;

    // Her bir anlamlı spoof/spike ~15 puan etkiler; 7 olayda yaklaşık max skora ulaşır.
    return Math.min(100, spoofCount * 15);
  }, [signalsFeed]);

  /* ---------------------------------------------------------------- */
  /*  Engine singletons + DOM-shared mutable refs                      */
  /* ---------------------------------------------------------------- */

  const patternEngineRef = useRef(new PatternEngineV2());
  const narrativeEngineRef = useRef(new NarrativeEngine());
  const metaStrategyRef = useRef(new MetaStrategyEngine());
  const tradePlanGenRef = useRef(new TradePlanGenerator());
  const microOptRef = useRef(new MicroAccountOptimizer());
  const perfTrackerRef = useRef(new StrategyPerformanceTracker());
  const vpinCalcRef = useRef(new VPINCalculator());
  const liqCalcRef = useRef(new LiquidationPressureCalculator());
  const flowBuilderRef = useRef(new FlowCandleBuilder(config.flowTimeframeMs));
  const cvdDivDetRef = useRef(new CVDDivergenceDetector());

  const audioCtxRef = useRef<AudioContext | null>(null);
  const planHitboxesRef = useRef<{ id: string; label: string; price: number; y: number }[]>([]);
  const patternHitboxesRef = useRef<{ x: number; y: number; w: number; h: number; pattern: PatternSignal }[]>([]);

  /* ---------------------------------------------------------------- */
  /*  Live mirrors — every value read inside scheduleFlush MUST be     */
  /*  mirrored here so the callback can have an empty dep array.       */
  /* ---------------------------------------------------------------- */

  const configRef = useRef(config); configRef.current = config;
  const symbolRef = useRef(symbol); symbolRef.current = symbol;

  const cvdRef = useRef(cvd); cvdRef.current = cvd;
  const cvdHistoryRef = useRef(cvdHistory); cvdHistoryRef.current = cvdHistory;
  const vpinRef = useRef(vpinValue); vpinRef.current = vpinValue;
  const tradesMirrorRef = useRef(trades); tradesMirrorRef.current = trades;
  const heatMirrorRef = useRef(heatHistory); heatMirrorRef.current = heatHistory;
  const liquidationsRef = useRef(liquidations); liquidationsRef.current = liquidations;
  const exchangesRef = useRef(exchanges); exchangesRef.current = exchanges;
  const lastPriceRef = useRef(lastPrice); lastPriceRef.current = lastPrice;
  const tickerRef = useRef(ticker); tickerRef.current = ticker;

  // Sinyal doğrulama takibi: Her yeni sinyal 45 sn sonra fiyat yönüne göre
  // test edilir. verified olan sinyaller rolling doğruluk oranını besler.
  const pendingVerifyRef = useRef<PatternSignal[]>([]);
  const signalsFeedRef = useRef<PatternSignal[]>([]); signalsFeedRef.current = signalsFeed;

  // Buffered live data between flushes (avoids setState per WS frame)
  const pendingDepthRef = useRef<{ bids: BookLevel[]; asks: BookLevel[]; ts: number } | null>(null);
  const pendingTradesRef = useRef<Trade[]>([]);
  const pendingTickerRef = useRef<TickerInfo | null>(null);
  const pendingLiquidationsRef = useRef<LiquidationEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const lastFlushTsRef = useRef(0);

  /* ---------------------------------------------------------------- */
  /*  Config actions                                                   */
  /* ---------------------------------------------------------------- */

  const updateConfig = useCallback((patch: Partial<AppConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...patch };
      try {
        const toSave = {
          ...updated,
          activeLayers: Array.from(
            updated.activeLayers instanceof Set ? updated.activeLayers : DEFAULT_CONFIG.activeLayers
          )
        };
        localStorage.setItem('bozoksettingsv1', JSON.stringify(toSave));
      } catch {}
      if (patch.theme) applyThemeStyle(patch.theme);
      if (patch.flowTimeframeMs && patch.flowTimeframeMs !== prev.flowTimeframeMs) {
        flowBuilderRef.current = new FlowCandleBuilder(patch.flowTimeframeMs);
      }
      return updated;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    try { localStorage.removeItem('bozoksettingsv1'); } catch {}
    applyThemeStyle(DEFAULT_CONFIG.theme);
  }, []);

  const setSymbol = useCallback((sym: string) => {
    const s = sym.toUpperCase();
    setSymbolState(s);
    updateConfig({ symbol: s });
  }, [updateConfig]);

  const setFocusPrice = useCallback((p: number | null, durationMs = 12000) => {
    setFocusPriceState(p);
    if (p != null) {
      window.setTimeout(() => {
        setFocusPriceState(curr => (curr === p ? null : curr));
      }, durationMs);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Audio / TTS                                                      */
  /* ---------------------------------------------------------------- */

  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current && typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      } catch {}
    }
    return audioCtxRef.current;
  }, []);

  const speakTest = useCallback((text?: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      ensureAudio();
      const u = new SpeechSynthesisUtterance(text || 'BOZOK PRO sesli sinyal motoru aktif');
      u.lang = 'tr-TR';
      window.speechSynthesis.speak(u);
    } catch {}
  }, [ensureAudio]);

  const announceSignal = useCallback((sig: PatternSignal) => {
    const cfg = configRef.current;
    if (!cfg.soundOn || !cfg.voiceAnnounce) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const ux = signalUX(sig);
      const priceTxt = Number.isFinite(sig.price) ? sig.price.toFixed(2) : '';
      let txt = (sig.severity === 'critical' ? 'Dikkat! ' : '') + (ux.title || sig.title);
      if (priceTxt) txt += ', fiyat ' + priceTxt;
      txt += ', güven ' + Math.round(sig.confidence || 0) + ' yüzde';
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = 'tr-TR';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch {}
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Export CSV                                                       */
  /* ---------------------------------------------------------------- */

  const exportCSV = useCallback(() => {
    const rows = [['zaman', 'tip', 'yön', 'başlık', 'fiyat', 'güven', 'açıklama']];
    signalsFeed.forEach(s => {
      rows.push([
        new Date(s.createdAt).toISOString(),
        s.type,
        s.bias,
        (s.title || '').replace(/"/g, '""'),
        s.price ? s.price.toString() : '',
        s.confidence ? s.confidence.toString() : '',
        (s.explanation || '').replace(/"/g, '""')
      ]);
    });
    const csvContent = rows.map(r => r.map(v => `"${v}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bozok_signals_${symbol}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [signalsFeed, symbol]);

  /* ---------------------------------------------------------------- */
  /*  Flush scheduler — STABLE (empty deps, reads everything via refs) */
  /* ---------------------------------------------------------------- */

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) return; // already scheduled
    const cfg = configRef.current;
    const interval = Math.max(50, cfg.renderIntervalMs || 150);
    const wait = Math.max(0, interval - (performance.now() - lastFlushTsRef.current));

    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      lastFlushTsRef.current = performance.now();

      const depth = pendingDepthRef.current;
      const newTrades = pendingTradesRef.current;
      const tickerPatch = pendingTickerRef.current;
      const newLiqs = pendingLiquidationsRef.current;

      pendingDepthRef.current = null;
      pendingTradesRef.current = [];
      pendingTickerRef.current = null;
      pendingLiquidationsRef.current = [];

      const c = configRef.current;

      // --- Trades / CVD / VPIN -----------------------------------------
      if (newTrades.length) {
        const prevTrades = tradesMirrorRef.current;
        const nextTrades = [...newTrades, ...prevTrades].slice(0, 2000);
        tradesMirrorRef.current = nextTrades;
        setTrades(nextTrades);

        let delta = 0;
        for (const t of newTrades) {
          delta += t.side === 'buy' ? t.qty : -t.qty;
          vpinCalcRef.current.update(t);
        }
        const nextCvd = cvdRef.current + delta;
        const nextCvdHist = [...cvdHistoryRef.current.slice(-120), nextCvd];
        const nextVpin = vpinCalcRef.current.getVPIN();

        cvdRef.current = nextCvd;
        cvdHistoryRef.current = nextCvdHist;
        vpinRef.current = nextVpin;

        setCvd(nextCvd);
        setCvdHistory(nextCvdHist);
        setVpinValue(nextVpin);
      }

      // --- Depth / book / heatmap / patterns ---------------------------
      if (depth) {
        const { bids, asks, ts } = depth;
        const newBook: Book = { bids, asks, ts, label: 'Binance' };
        setBook(newBook);

        if (bids.length && asks.length) {
          const mid = (bids[0].price + asks[0].price) / 2;
          // Capture the previous mid for price-flash colour, then replace.
          // Both writes happen outside a state updater (StrictMode-safe).
          setPrevPrice(lastPriceRef.current);
          lastPriceRef.current = mid;
          setLastPrice(mid);

          // Heatmap history
          let snapMax = 1;
          for (const l of [...bids.slice(0, 20), ...asks.slice(0, 20)]) {
            if (l.qty > snapMax) snapMax = l.qty;
          }
          const cut = ts - c.heatmapWindowSec * 1000;
          const nextHeat = [
            ...heatMirrorRef.current.filter(s => s.t >= cut),
            {
              t: ts,
              bids: bids.slice(0, 20).map(b => [b.price, b.qty] as [number, number]),
              asks: asks.slice(0, 20).map(a => [a.price, a.qty] as [number, number]),
              maxQty: snapMax
            }
          ];
          heatMirrorRef.current = nextHeat;
          setHeatHistory(nextHeat);

          // Exchange top-of-book — keep mirror in sync inside updater.
          setExchanges(prev => {
            const next = {
              ...prev,
              binance: { ...prev.binance, bid: bids[0].price, ask: asks[0].price, ts }
            };
            exchangesRef.current = next;
            return next;
          });

          // Pattern engine — runs once per flush instead of per 100ms frame.
          const detected = patternEngineRef.current.analyze(
            { mid, bidRows: bids, askRows: asks },
            tradesMirrorRef.current,
            nextHeat.map(h => ({ bids: h.bids, asks: h.asks })),
            c.wallMult,
            c.spoofWindowMs,
            c.imbalanceThresh,
            c.minPatternConfidence,
            c.minSignalConfidence
          );
          setActivePatterns(detected);

          // Emit new signals to feed + announce.
          for (const sig of detected) {
            if (!(sig as any)._emitted && sig.confidence >= c.minSignalConfidence) {
              (sig as any)._emitted = true;
              announceSignal(sig);
              setSignalsFeed(prev => [sig, ...prev.slice(0, 200)]);

              // Yalnızca net yönlü sinyalleri doğrulama kuyruğuna al.
              const isBull = sig.bias === 'bullish' || sig.bias === 'bull';
              const isBear = sig.bias === 'bearish' || sig.bias === 'bear';
              if ((isBull || isBear) && Number.isFinite(sig.price) && sig.price > 0) {
                pendingVerifyRef.current.push(sig);
              }

              const bucket =
                sig.bias === 'bullish' || sig.bias === 'bull' ? 'bull' :
                sig.bias === 'bearish' || sig.bias === 'bear' ? 'bear' : 'warn';
              setSigCounts(prev => ({ ...prev, [bucket]: (prev as any)[bucket] + 1 }));
            }
          }

          setNarrative(narrativeEngineRef.current.synthesize(detected));

          const basePlan = tradePlanGenRef.current.generatePlan(detected, mid, nextHeat, vpinRef.current);
          const metaPlan = metaStrategyRef.current.evaluate(
            detected,
            { mid, bidRows: bids, askRows: asks },
            tradesMirrorRef.current,
            liquidationsRef.current,
            perfTrackerRef.current,
            symbolRef.current,
            c.multiExchange,
            exchangesRef.current,
            basePlan
          );
          const finalPlan = (metaPlan && metaPlan.confidence >= 75) ? metaPlan : basePlan;
          setTradePlan(finalPlan);

          // Yeni bir plan geldiğinde, kimlik değiştiyse pozisyon aç.
          if (finalPlan && finalPlan.direction !== 'NEUTRAL' && finalPlan.entry && finalPlan.stopLoss) {
            const planKey = [
              finalPlan.strategyId || 'DIR',
              finalPlan.direction,
              Math.round((finalPlan.entry.low + finalPlan.entry.high) / 2),
              Math.round(finalPlan.stopLoss.price),
              Math.round(finalPlan.confidence / 5)
            ].join(':');
            if (planKey !== lastPlanKeyRef.current) {
              lastPlanKeyRef.current = planKey;
              openPositionForPlan(finalPlan);
            }
          } else {
            lastPlanKeyRef.current = '';
          }

          if (finalPlan && finalPlan.entry && finalPlan.stopLoss) {
            const entryAvg = (finalPlan.entry.low + finalPlan.entry.high) / 2;
            const res = microOptRef.current.calculate(
              entryAvg,
              finalPlan.stopLoss.price,
              finalPlan.direction === 'SHORT' ? 'SHORT' : 'LONG',
              finalPlan.confidence,
              c.microBalance,
              c.microRiskPct,
              c.microMaxLeverage
            );
            setMicroResult(res);
          }

          flowBuilderRef.current.update(
            { mid, bidRows: bids, askRows: asks },
            tradesMirrorRef.current,
            detected,
            liquidationsRef.current
          );
          setFlowCandles(flowBuilderRef.current.getCandles());
        }
      }

      if (tickerPatch) {
        tickerRef.current = tickerPatch;
        setTicker(tickerPatch);
      }

      if (newLiqs.length) {
        setLiquidations(prev => {
          const next = [...newLiqs, ...prev].slice(0, 500);
          liquidationsRef.current = next;
          return next;
        });
      }
    }, wait);
  }, [announceSignal]); // <-- STABLE: announceSignal itself is stable.

  // Cancel pending flush on unmount.
  useEffect(() => () => {
    if (flushTimerRef.current != null) clearTimeout(flushTimerRef.current);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Primary Binance Futures WS with reconnect + backoff              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // Binance split its public market data into two base endpoints:
    //   /public  -> high-frequency order book / depth
    //   /market  -> regular market data (aggTrade, ticker, forceOrder)
    // Mixing the two on the legacy root /stream endpoint silently drops
    // aggTrade/ticker/forceOrder frames (verified against the live API),
    // which is why CVD/VPIN/tape and 24h change stayed empty.
    const sockets: { ws: WebSocket; tag: string; reconnectTimer: number | null; attempt: number }[] = [
      { ws: null as any, tag: 'depth',   reconnectTimer: null, attempt: 0 },
      { ws: null as any, tag: 'market',  reconnectTimer: null, attempt: 0 }
    ];
    let isCancelled = false;
    let explicitlyClosed = false;
    let visHandler: (() => void) | null = null;

    const markBinance = (status: ExchangeState['status'], err?: string | null) => {
      setConnStatus(status);
      setExchanges(prev => ({
        ...prev,
        binance: { ...prev.binance, status, lastError: err ?? prev.binance.lastError }
      }));
    };

    // Best-effort exchange info snapshot for tick/step sizes.
    fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo?symbol=${symbol}`)
      .then(r => r.json())
      .then(json => {
        if (isCancelled) return;
        const s = json.symbols && json.symbols[0];
        if (!s) return;
        let tickSize = 0.1, stepSize = 0.001;
        for (const f of s.filters || []) {
          if (f.filterType === 'PRICE_FILTER') tickSize = parseFloat(f.tickSize) || tickSize;
          if (f.filterType === 'LOT_SIZE') stepSize = parseFloat(f.stepSize) || stepSize;
        }
        setSymbolPrecision({
          tickSize, stepSize,
          priceDecimals: Math.max(0, -Math.floor(Math.log10(tickSize))),
          qtyDecimals:   Math.max(0, -Math.floor(Math.log10(stepSize))),
          loaded: true
        });
      })
      .catch(() => {});

    const handleFrame = (event: MessageEvent) => {
      if (isCancelled) return;
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }
      const data = msg.data || msg;
      if (!data) return;
      const now = Date.now();
      const stream: string = msg.stream || '';

      if (stream.includes('@depth')) {
        const rawBids = data.b || data.bids || [];
        const rawAsks = data.a || data.asks || [];

        if (rawBids.length > 0 && Array.isArray(rawBids[0]) && typeof rawBids[0][0] === 'string') {
          const decs = (rawBids[0][0].replace(/0+$/, '').split('.')[1] || '').length;
          if (decs > 0) {
            setSymbolPrecision({
              tickSize: Math.pow(10, -decs),
              priceDecimals: Math.max(2, decs),
              loaded: true
            });
          }
        }

        const bids: BookLevel[] = rawBids
          .map(([p, q]: [string, string]) => {
            const price = parseFloat(p), qty = parseFloat(q);
            return { price, qty, notional: price * qty };
          })
          .filter((b: BookLevel) => b.qty > 0)
          .sort((a: BookLevel, b: BookLevel) => b.price - a.price);

        const asks: BookLevel[] = rawAsks
          .map(([p, q]: [string, string]) => {
            const price = parseFloat(p), qty = parseFloat(q);
            return { price, qty, notional: price * qty };
          })
          .filter((a: BookLevel) => a.qty > 0)
          .sort((a: BookLevel, b: BookLevel) => a.price - b.price);

        pendingDepthRef.current = { bids, asks, ts: now };
        scheduleFlush();
      } else if (stream.includes('@aggTrade')) {
        const price = parseFloat(data.p);
        const qty = parseFloat(data.q);
        const side = data.m ? 'sell' : 'buy';
        pendingTradesRef.current.push({
          price, qty, side,
          timestamp: data.T || now,
          notional: price * qty
        });
        scheduleFlush();
      } else if (stream.includes('@ticker')) {
        pendingTickerRef.current = {
          changePct: parseFloat(data.P || 0),
          volume:    parseFloat(data.q || 0),
          high24h:   parseFloat(data.h || 0),
          low24h:    parseFloat(data.l || 0)
        };
        scheduleFlush();
      } else if (stream.includes('@forceOrder')) {
        const o = data.o || data;
        if (!o) return;
        const price = parseFloat(o.p || o.ap);
        const qty = parseFloat(o.q);
        const notionalUsd = price * qty;
        if (notionalUsd >= configRef.current.minLiquidationNotional) {
          pendingLiquidationsRef.current.push({
            id: `liq_${now}_${Math.random().toString(36).slice(2, 8)}`,
            symbol: o.s || symbolRef.current,
            side: o.S === 'SELL' ? 'long' : 'short',
            price, qty, notionalUsd,
            timestamp: o.T || now
          });
          scheduleFlush();
        }
      }
    };

    const connectSocket = (entry: typeof sockets[number], url: string) => {
      if (isCancelled) return;
      try {
        const ws = new WebSocket(url);
        entry.ws = ws;

        ws.onopen = () => {
          if (isCancelled) return;
          entry.attempt = 0;
          // Binance is "live" only once BOTH sockets are up.
          const bothOpen = sockets.every(s => s.ws && s.ws.readyState === WebSocket.OPEN);
          if (bothOpen) markBinance('live', null);
          else markBinance('connecting', null);
        };

        ws.onmessage = handleFrame;

        ws.onerror = () => {
          markBinance('bad', `WS ${entry.tag} error`);
        };

        ws.onclose = (ev) => {
          if (isCancelled || explicitlyClosed) return;
          markBinance('disconnected', `WS ${entry.tag} closed code ${ev.code}`);
          entry.attempt += 1;
          const base = Math.min(30000, 1000 * 2 ** Math.min(entry.attempt - 1, 5));
          const jitter = Math.random() * 500;
          entry.reconnectTimer = window.setTimeout(() => connectSocket(entry, url), base + jitter);
        };
      } catch (e: any) {
        markBinance('error', String(e?.message || e));
        entry.reconnectTimer = window.setTimeout(() => connectSocket(entry, url), 2000);
      }
    };

    const sym = symbol.toLowerCase();
    // /public for high-frequency depth; /market for regular trade/ticker/liq.
    const depthUrl  = `wss://fstream.binance.com/public/stream?streams=${sym}@depth20@100ms`;
    const marketUrl = `wss://fstream.binance.com/market/stream?streams=${sym}@aggTrade/${sym}@ticker/${sym}@forceOrder`;

    connectSocket(sockets[0], depthUrl);
    connectSocket(sockets[1], marketUrl);

    visHandler = () => {
      if (document.visibilityState === 'visible') {
        for (const entry of sockets) {
          if (!entry.ws || entry.ws.readyState > 1) {
            if (entry.reconnectTimer) { clearTimeout(entry.reconnectTimer); entry.reconnectTimer = null; }
            entry.attempt = 0;
            const url = entry.tag === 'depth' ? depthUrl : marketUrl;
            connectSocket(entry, url);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', visHandler);

    return () => {
      isCancelled = true;
      explicitlyClosed = true;
      if (visHandler) document.removeEventListener('visibilitychange', visHandler);
      for (const entry of sockets) {
        if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
        if (entry.ws) {
          try { entry.ws.onclose = null; entry.ws.close(); } catch {}
        }
      }
    };
    // scheduleFlush is STABLE; this effect only restarts on symbol change.
  }, [symbol, scheduleFlush]);

  /* ---------------------------------------------------------------- */
  /*  Multi-exchange polling                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!config.multiExchange) return;
    let isCancelled = false;

    const poll = async () => {
      if (isCancelled) return;
      const symUpper = symbol.toUpperCase();

      try {
        const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symUpper}`);
        const json = await res.json();
        const item = json?.result?.list?.[0];
        if (!isCancelled && item) {
          setExchanges(prev => {
            const next = { ...prev, bybit: { ...prev.bybit, status: 'live' as const, bid: parseFloat(item.bid1Price) || null, ask: parseFloat(item.ask1Price) || null, ts: Date.now() } };
            exchangesRef.current = next;
            return next;
          });
        }
      } catch {}

      try {
        const inst = `${symUpper.replace('USDT', '')}-USDT-SWAP`;
        const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`);
        const json = await res.json();
        const item = json?.data?.[0];
        if (!isCancelled && item) {
          setExchanges(prev => {
            const next = { ...prev, okx: { ...prev.okx, status: 'live' as const, bid: parseFloat(item.bidPx) || null, ask: parseFloat(item.askPx) || null, ts: Date.now() } };
            exchangesRef.current = next;
            return next;
          });
        }
      } catch {}

      try {
        const mexcSym = `${symUpper.replace('USDT', '')}_USDT`;
        const res = await fetch(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${mexcSym}`);
        const json = await res.json();
        const item = json?.data;
        if (!isCancelled && item) {
          setExchanges(prev => {
            const next = { ...prev, mexc: { ...prev.mexc, status: 'live' as const, bid: parseFloat(item.bid1) || null, ask: parseFloat(item.ask1) || null, ts: Date.now() } };
            exchangesRef.current = next;
            return next;
          });
        }
      } catch {}
    };

    poll();
    const interval = window.setInterval(poll, 2500);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [symbol, config.multiExchange]);

  /* ---------------------------------------------------------------- */
  /*  Sinyal doğrulama / gerçek rolling accuracy                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const HORIZON_MS = 45000;
    const MOVE_BPS = 3; // ~%0.03 hedef hareket; mikro-yapı sinyalleri kısa vadelidir.
    let timer: number | null = null;

    const evaluate = () => {
      timer = null;
      const now = Date.now();

      // 1) TradePlan yaşam döngüsü: her saniye SL/TP/timeout kontrolü.
      if (lastPriceRef.current != null) resolvePositions(lastPriceRef.current);

      // 2) Pattern doğrulama (yön isabeti, 45sn horizon).
      const pending = pendingVerifyRef.current;
      const remaining: PatternSignal[] = [];
      let changed = false;

      for (const sig of pending) {
        const age = now - (sig.createdAt || now);
        if (age < HORIZON_MS) {
          remaining.push(sig);
          continue;
        }

        changed = true;
        const currentMid = lastPriceRef.current;
        if (!currentMid || !Number.isFinite(currentMid) || !Number.isFinite(sig.price) || sig.price <= 0) {
          sig.verified = { hit: false, pct: 0 };
          continue;
        }

        const deltaBps = ((currentMid - sig.price) / sig.price) * 10000;
        const isBull = sig.bias === 'bullish' || sig.bias === 'bull';
        const hit = isBull ? deltaBps >= MOVE_BPS : deltaBps <= -MOVE_BPS;
        sig.verified = { hit, pct: Math.abs(deltaBps) };
      }

      pendingVerifyRef.current = remaining;
      if (!changed) return;

      const feed = signalsFeedRef.current;
      const verifiedSignals = feed.filter(s => s.verified);
      const hits = verifiedSignals.filter(s => s.verified?.hit).length;
      const dirPct = verifiedSignals.length
        ? Math.round((hits / verifiedSignals.length) * 100)
        : null;

      setSignalsFeed([...feed]);
      setRollingAccuracy({
        dir: dirPct,
        vol: null,
        dirN: verifiedSignals.length,
        volN: 0
      });
    };

    timer = window.setInterval(evaluate, 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Replay stubs                                                     */
  /* ---------------------------------------------------------------- */

  const replaySession = useCallback((_session: any) => setIsReplaying(true), []);
  const stopReplay = useCallback(() => setIsReplaying(false), []);

  /* ---------------------------------------------------------------- */
  /*  Memoised slice values                                            */
  /* ---------------------------------------------------------------- */

  const liveValue = useMemo<LiveSlice>(() => ({
    symbol, lastPrice, prevPrice, ticker, book, trades, cvd, cvdHistory,
    largeCvdHistory, smallCvdHistory, vpinValue, heatHistory, liquidations,
    flowCandles, exchanges, connStatus
  }), [symbol, lastPrice, prevPrice, ticker, book, trades, cvd, cvdHistory,
      largeCvdHistory, smallCvdHistory, vpinValue, heatHistory, liquidations,
      flowCandles, exchanges, connStatus]);

  const signalValue = useMemo<SignalSlice>(() => ({
    activePatterns, signalsFeed, tradePlan, narrative, microResult,
    sigCounts, manipIndex, rollingAccuracy, positionStats, openPositions
  }), [activePatterns, signalsFeed, tradePlan, narrative, microResult, sigCounts, manipIndex, rollingAccuracy, positionStats, openPositions]);

  const uiValue = useMemo<UISlice>(() => ({
    activeTab, setActiveTab, focusPrice, setFocusPrice, isReplaying
  }), [activeTab, focusPrice, isReplaying, setFocusPrice]);

  const actionValue = useMemo<ActionSlice>(() => ({
    updateConfig, resetConfig, setSymbol, speakTest, exportCSV, replaySession, stopReplay
  }), [updateConfig, resetConfig, setSymbol, speakTest, exportCSV, replaySession, stopReplay]);

  const stableValue = useMemo<StableRefs>(() => ({
    perfTracker: perfTrackerRef.current,
    planHitboxes: planHitboxesRef.current,
    patternHitboxes: patternHitboxesRef.current,
    audioCtx: audioCtxRef.current
  }), []);

  return (
    <ConfigContext.Provider value={config}>
      <StableContext.Provider value={stableValue}>
        <ActionContext.Provider value={actionValue}>
          <UIContext.Provider value={uiValue}>
            <SignalContext.Provider value={signalValue}>
              <LiveContext.Provider value={liveValue}>
                {children}
              </LiveContext.Provider>
            </SignalContext.Provider>
          </UIContext.Provider>
        </ActionContext.Provider>
      </StableContext.Provider>
    </ConfigContext.Provider>
  );
};

/* ------------------------------------------------------------------ */
/*  Fine-grained public hooks                                         */
/* ------------------------------------------------------------------ */

export const useBozokConfig = () => {
  const v = useContext(ConfigContext);
  if (!v) throw new Error('useBozokConfig must be used within BozokProvider');
  return v;
};
export const useBozokLive = () => {
  const v = useContext(LiveContext);
  if (!v) throw new Error('useBozokLive must be used within BozokProvider');
  return v;
};
export const useBozokSignals = () => {
  const v = useContext(SignalContext);
  if (!v) throw new Error('useBozokSignals must be used within BozokProvider');
  return v;
};
export const useBozokUI = () => {
  const v = useContext(UIContext);
  if (!v) throw new Error('useBozokUI must be used within BozokProvider');
  return v;
};
export const useBozokActions = () => {
  const v = useContext(ActionContext);
  if (!v) throw new Error('useBozokActions must be used within BozokProvider');
  return v;
};
export const useBozokStable = () => {
  const v = useContext(StableContext);
  if (!v) throw new Error('useBozokStable must be used within BozokProvider');
  return v;
};

/* ------------------------------------------------------------------ */
/*  Legacy combined hook                                              */
/* ------------------------------------------------------------------ */

export const useBozok = () => {
  const config = useBozokConfig();
  const live = useBozokLive();
  const sig = useBozokSignals();
  const ui = useBozokUI();
  const act = useBozokActions();
  const stab = useBozokStable();
  return useMemo(() => ({
    config,
    ...live,
    ...sig,
    ...ui,
    ...act,
    ...stab
  }), [config, live, sig, ui, act, stab]);
};
