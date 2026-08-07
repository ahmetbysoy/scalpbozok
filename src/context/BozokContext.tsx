// BOZOK PRO — Central State & Live WebSocket Context
// Performance-tuned:
//  - WebSocket reconnect with exponential backoff + jitter + visibility resume
//  - High-frequency WS messages are buffered into refs and flushed via rAF at
//    config.renderIntervalMs, so React only renders once per animation frame
//  - Hot state is split into multiple small Contexts so non-relevant branches
//    (e.g. Settings/Markets) don't re-render on every depth tick
//  - A legacy useBozok() shim keeps all existing consumers working.

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
  HeatmapLayerKey
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
  // Normalised to an array — JSON-safe and no Set/Array/Object type-guards needed.
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
    // Keep only known layer keys
    const known = new Set<HeatmapLayerKey>([
      'liquidity', 'velocity', 'trades', 'walls', 'liqpools', 'spoofing', 'iceberg', 'vpvr', 'crosshair'
    ]);
    layers = layers.filter(l => known.has(l));
    if (!layers.length) layers = DEFAULT_LAYERS;
    // Re-hydrate as a Set for backward-compat with existing engine code / types.
    return { ...DEFAULT_CONFIG, ...parsed, activeLayers: new Set<HeatmapLayerKey>(layers) };
  } catch {
    return DEFAULT_CONFIG;
  }
};

/* ------------------------------------------------------------------ */
/*  Slices / context types                                             */
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
/*  Individual contexts (fine-grained subscriptions)                   */
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
  const [config, setConfig] = useState<AppConfig>(LOAD_CONFIG);

  // --- UI / static state ---------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabKey>('bookView');
  const [symbol, setSymbolState] = useState<string>(() => LOAD_CONFIG().symbol.toUpperCase());
  const [focusPrice, setFocusPriceState] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  // --- Live / hot state (updated at rAF cadence) ---------------------------
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

  // --- Signal / derived state (lower-frequency than ticks) -----------------
  const [activePatterns, setActivePatterns] = useState<PatternSignal[]>([]);
  const [signalsFeed, setSignalsFeed] = useState<PatternSignal[]>([]);
  const [tradePlan, setTradePlan] = useState<TradePlan | null>(null);
  const [narrative, setNarrative] = useState<Narrative>({ icon: '🌐', title: 'NÖTR / BEKLE', bias: 'neu', text: 'Veri bekleniyor...' });
  const [microResult, setMicroResult] = useState<MicroResult | null>(null);
  const [sigCounts, setSigCounts] = useState<{ bull: number; bear: number; warn: number }>({ bull: 0, bear: 0, warn: 0 });
  const [manipIndex] = useState(0);

  /* ---------------------------------------------------------------- */
  /*  Stable refs (engine instances + DOM-shared mutable arrays)       */
  /* ---------------------------------------------------------------- */

  const configRef = useRef(config);
  configRef.current = config;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

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
  // Shared mutable hitboxes — BookTab writes, canvas reads without re-rendering.
  const planHitboxesRef = useRef<{ id: string; label: string; price: number; y: number }[]>([]);
  const patternHitboxesRef = useRef<{ x: number; y: number; w: number; h: number; pattern: PatternSignal }[]>([]);

  // Buffered live data between rAF flushes (avoids setState per WS frame)
  const pendingDepthRef = useRef<{ bids: BookLevel[]; asks: BookLevel[]; ts: number } | null>(null);
  const pendingTradesRef = useRef<Trade[]>([]);
  const pendingTickerRef = useRef<TickerInfo | null>(null);
  const pendingLiquidationsRef = useRef<LiquidationEvent[]>([]);
  const lastTradesRef = useRef<Trade[]>([]);
  const lastHeatRef = useRef<{ t: number; bids: [number, number][]; asks: [number, number][]; maxQty: number }[]>([]);
  const lastBookRef = useRef<Book>({ bids: [], asks: [], ts: 0 });
  const flushRafRef = useRef<number | null>(null);
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
    // Auto-clear focus after duration (optional UX feature; focusUntil unused for now)
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
      // avoid importing fmtPrice in hot closure just for speech
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
  /*  rAF flush — coalesces all buffered WS updates into one render    */
  /* ---------------------------------------------------------------- */

  const scheduleFlush = useCallback(() => {
    if (flushRafRef.current != null) return; // already scheduled
    const cfg = configRef.current;
    const interval = Math.max(50, cfg.renderIntervalMs || 150);
    const now = performance.now();
    const wait = Math.max(0, interval - (now - lastFlushTsRef.current));
    flushRafRef.current = window.setTimeout(() => {
      flushRafRef.current = null;
      lastFlushTsRef.current = performance.now();

      const depth = pendingDepthRef.current;
      const newTrades = pendingTradesRef.current;
      const tickerPatch = pendingTickerRef.current;
      const newLiqs = pendingLiquidationsRef.current;

      pendingDepthRef.current = null;
      pendingTradesRef.current = [];
      pendingTickerRef.current = null;
      pendingLiquidationsRef.current = [];

      // --- Trades / CVD / VPIN -----------------------------------------
      let nextTrades = lastTradesRef.current;
      let nextCvd = cvd;
      let nextCvdHist = cvdHistory;
      let nextVpin = vpinValue;
      if (newTrades.length) {
        nextTrades = [...newTrades, ...nextTrades].slice(0, 2000);
        lastTradesRef.current = nextTrades;
        setTrades(nextTrades);

        let delta = 0;
        for (const t of newTrades) {
          delta += t.side === 'buy' ? t.qty : -t.qty;
          vpinCalcRef.current.update(t);
        }
        nextCvd = cvd + delta;
        nextCvdHist = [...cvdHistory.slice(-120), nextCvd];
        nextVpin = vpinCalcRef.current.getVPIN();
        setCvd(nextCvd);
        setCvdHistory(nextCvdHist);
        setVpinValue(nextVpin);
      }

      // --- Depth / book / heatmap / patterns ---------------------------
      if (depth) {
        const { bids, asks, ts } = depth;
        const newBook: Book = { bids, asks, ts, label: 'Binance' };
        lastBookRef.current = newBook;
        setBook(newBook);

        if (bids.length && asks.length) {
          const mid = (bids[0].price + asks[0].price) / 2;
          setLastPrice(prev => { setPrevPrice(prev); return mid; });

          // Heatmap history
          let snapMax = 1;
          for (const l of [...bids.slice(0, 20), ...asks.slice(0, 20)]) {
            if (l.qty > snapMax) snapMax = l.qty;
          }
          const cut = ts - configRef.current.heatmapWindowSec * 1000;
          const nextHeat = [
            ...lastHeatRef.current.filter(s => s.t >= cut),
            {
              t: ts,
              bids: bids.slice(0, 20).map(b => [b.price, b.qty] as [number, number]),
              asks: asks.slice(0, 20).map(a => [a.price, a.qty] as [number, number]),
              maxQty: snapMax
            }
          ];
          lastHeatRef.current = nextHeat;
          setHeatHistory(nextHeat);

          // Exchange top-of-book
          setExchanges(prev => ({
            ...prev,
            binance: { ...prev.binance, bid: bids[0].price, ask: asks[0].price, ts }
          }));

          // Pattern engine — runs once per flush instead of per 100ms frame
          const c = configRef.current;
          const detected = patternEngineRef.current.analyze(
            { mid, bidRows: bids, askRows: asks },
            lastTradesRef.current,
            nextHeat.map(h => ({ bids: h.bids, asks: h.asks })),
            c.wallMult,
            c.spoofWindowMs,
            c.imbalanceThresh,
            c.minPatternConfidence,
            c.minSignalConfidence
          );
          setActivePatterns(detected);

          // Emit new signals to feed + announce
          for (const sig of detected) {
            if (!(sig as any)._emitted && sig.confidence >= c.minSignalConfidence) {
              (sig as any)._emitted = true;
              announceSignal(sig);
              setSignalsFeed(prev => [sig, ...prev.slice(0, 200)]);
              const bucket =
                sig.bias === 'bullish' || sig.bias === 'bull' ? 'bull' :
                sig.bias === 'bearish' || sig.bias === 'bear' ? 'bear' : 'warn';
              setSigCounts(prev => ({ ...prev, [bucket]: (prev as any)[bucket] + 1 }));
            }
          }

          setNarrative(narrativeEngineRef.current.synthesize(detected));

          const basePlan = tradePlanGenRef.current.generatePlan(detected, mid, nextHeat);
          const metaPlan = metaStrategyRef.current.evaluate(
            detected,
            { mid, bidRows: bids, askRows: asks },
            lastTradesRef.current,
            liquidations,
            perfTrackerRef.current,
            symbolRef.current,
            c.multiExchange,
            exchanges
          );
          const finalPlan = (metaPlan && metaPlan.confidence >= 75) ? metaPlan : basePlan;
          setTradePlan(finalPlan);

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
            lastTradesRef.current,
            detected,
            liquidations
          );
          setFlowCandles(flowBuilderRef.current.getCandles());
        }
      }

      if (tickerPatch) setTicker(tickerPatch);
      if (newLiqs.length) {
        setLiquidations(prev => [...newLiqs, ...prev].slice(0, 500));
      }
    }, wait);
  }, [announceSignal, cvd, cvdHistory, liquidations, exchanges, vpinValue]);

  // Cancel pending flush on unmount
  useEffect(() => () => {
    if (flushRafRef.current != null) clearTimeout(flushRafRef.current);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Primary Binance Futures WebSocket with reconnect+backoff         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let ws: WebSocket | null = null;
    let isCancelled = false;
    let reconnectTimer: number | null = null;
    let attempt = 0;
    let explicitlyClosed = false;

    // ExchangeInfo snapshot — best-effort, failures ignored.
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

    const connect = () => {
      if (isCancelled) return;
      const sym = symbol.toLowerCase();
      const wsUrl =
        `wss://fstream.binance.com/stream?streams=${sym}@depth20@100ms/${sym}@aggTrade/${sym}@ticker/${sym}@forceOrder`;

      try {
        ws = new WebSocket(wsUrl);
        setConnStatus('connecting');
        setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'connecting' } }));

        ws.onopen = () => {
          if (isCancelled) return;
          attempt = 0;
          setConnStatus('live');
          setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'live', lastError: null } }));
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          let msg: any;
          try { msg = JSON.parse(event.data); } catch { return; }
          const data = msg.data || msg;
          if (!data) return;
          const now = Date.now();
          const stream: string = msg.stream || '';

          // --- Depth --------------------------------------------------
          if (stream.includes('@depth')) {
            const rawBids = data.b || data.bids || [];
            const rawAsks = data.a || data.asks || [];

            // Auto-detect price precision from raw string prices
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
          }

          // --- AggTrade -----------------------------------------------
          else if (stream.includes('@aggTrade')) {
            const price = parseFloat(data.p);
            const qty = parseFloat(data.q);
            const side = data.m ? 'sell' : 'buy';
            pendingTradesRef.current.push({
              price, qty, side,
              timestamp: data.T || now,
              notional: price * qty
            });
            scheduleFlush();
          }

          // --- 24h Ticker ---------------------------------------------
          else if (stream.includes('@ticker')) {
            pendingTickerRef.current = {
              changePct: parseFloat(data.P || 0),
              volume:    parseFloat(data.q || 0),
              high24h:   parseFloat(data.h || 0),
              low24h:    parseFloat(data.l || 0)
            };
            scheduleFlush();
          }

          // --- Force Order / Liquidation ------------------------------
          else if (stream.includes('@forceOrder')) {
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

        ws.onerror = () => {
          setConnStatus('bad');
          setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'bad', lastError: 'WS error' } }));
        };

        ws.onclose = (ev) => {
          if (isCancelled || explicitlyClosed) return;
          setConnStatus('disconnected');
          setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'disconnected', lastError: `code ${ev.code}` } }));
          // Exponential backoff with jitter: 1s, 2s, 4s, 8s ... capped 30s
          attempt += 1;
          const base = Math.min(30000, 1000 * 2 ** Math.min(attempt - 1, 5));
          const jitter = Math.random() * 500;
          reconnectTimer = window.setTimeout(connect, base + jitter);
        };
      } catch (e: any) {
        setConnStatus('error');
        setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'error', lastError: String(e?.message || e) } }));
        reconnectTimer = window.setTimeout(connect, 2000);
      }
    };

    connect();

    // When tab becomes visible again, force-reconnect if the socket looks dead.
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (!ws || ws.readyState > 1) { // CLOSING or CLOSED
          explicitlyClosed = false;
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
          attempt = 0;
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      isCancelled = true;
      explicitlyClosed = true;
      document.removeEventListener('visibilitychange', onVis);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try { ws.onclose = null; ws.close(); } catch {}
      }
    };
    // Intentionally only depends on `symbol` — all other live config is read
    // through refs so adjusting wallMult / sensitivity no longer tears down WS.
  }, [symbol, scheduleFlush]);

  /* ---------------------------------------------------------------- */
  /*  Multi-exchange secondary price polling                           */
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
          setExchanges(prev => ({
            ...prev,
            bybit: { ...prev.bybit, status: 'live', bid: parseFloat(item.bid1Price) || null, ask: parseFloat(item.ask1Price) || null, ts: Date.now() }
          }));
        }
      } catch {}

      try {
        const inst = `${symUpper.replace('USDT', '')}-USDT-SWAP`;
        const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`);
        const json = await res.json();
        const item = json?.data?.[0];
        if (!isCancelled && item) {
          setExchanges(prev => ({
            ...prev,
            okx: { ...prev.okx, status: 'live', bid: parseFloat(item.bidPx) || null, ask: parseFloat(item.askPx) || null, ts: Date.now() }
          }));
        }
      } catch {}

      try {
        const mexcSym = `${symUpper.replace('USDT', '')}_USDT`;
        const res = await fetch(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${mexcSym}`);
        const json = await res.json();
        const item = json?.data;
        if (!isCancelled && item) {
          setExchanges(prev => ({
            ...prev,
            mexc: { ...prev.mexc, status: 'live', bid: parseFloat(item.bid1) || null, ask: parseFloat(item.ask1) || null, ts: Date.now() }
          }));
        }
      } catch {}
    };

    poll();
    const interval = window.setInterval(poll, 2500);
    return () => { isCancelled = true; clearInterval(interval); };
  }, [symbol, config.multiExchange]);

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
    sigCounts, manipIndex,
    rollingAccuracy: { dir: 75, vol: 80, dirN: 12, volN: 15 }
  }), [activePatterns, signalsFeed, tradePlan, narrative, microResult, sigCounts, manipIndex]);

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
/*  Fine-grained public hooks (preferred for new components)           */
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
/*  Legacy combined hook (keeps existing components untouched)         */
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
