// BOZOK PRO — Central State & Live WebSocket Context

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
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
import {
  fmtPrice,
  fmtQty,
  median,
  clamp,
  tickSizeFor,
  roundToTick,
  setSymbolPrecision
} from '../utils/fmt';
import {
  applyThemeStyle,
  canvasPalette
} from '../utils/theme';
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
  LiquidationPoolSimulator,
  FlowCandleBuilder,
  FlowCandlePatternDetector,
  CVDDivergenceDetector
} from '../utils/detectors';

const DEFAULT_CONFIG: AppConfig = {
  symbol: "btcusdt",
  primaryExchange: "binance",
  bookMode: "binance",
  multiExchange: true,
  wallMult: 3.5,
  spoofWindowMs: 3000,
  imbalanceThresh: 2.2,
  algoWarEventsPerSec: 6,
  heatmapWindowSec: 60,
  sampleIntervalMs: 300,
  renderIntervalMs: 150,
  depthLevels: 20,
  overlayDensity: typeof window !== 'undefined' && window.innerWidth < 768 ? "LOW" : "NORMAL",
  ladderDepth: "auto",
  chartMode: typeof window !== 'undefined' && window.innerWidth < 768 ? "MINIMAL" : "NORMAL",
  soundOn: true,
  voiceAnnounce: true,
  notifications: false,
  sensitivity: "NORMAL",
  minPatternConfidence: typeof window !== 'undefined' && window.innerWidth < 768 ? 78 : 65,
  minSignalConfidence: 60,
  minFlowConfidence: 65,
  minToastConfidence: 78,
  theme: "professional",
  colorblind: false,
  flowTimeframeMs: 5000,
  flowCandleMode: "time",
  flowVolumeTarget: 1000000,
  minLiquidationNotional: 10000,
  feeRate: 0.0005,
  makerFee: 0.0002,
  takerFee: 0.0004,
  fundingRate: 0.0001,
  microBalance: 5.0,
  microRiskPct: 0.20,
  microMaxLeverage: 20,
  activeLayers: new Set<HeatmapLayerKey>(["liquidity", "walls", "trades", "liqpools", "spoofing", "iceberg", "vpvr", "crosshair"])
};

interface BozokContextType {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => void;
  resetConfig: () => void;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  symbol: string;
  setSymbol: (sym: string) => void;
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
  activePatterns: PatternSignal[];
  signalsFeed: PatternSignal[];
  tradePlan: TradePlan | null;
  narrative: Narrative;
  exchanges: Record<string, ExchangeState>;
  liquidations: LiquidationEvent[];
  flowCandles: FlowCandle[];
  microResult: MicroResult | null;
  focusPrice: number | null;
  setFocusPrice: (p: number | null, durationMs?: number) => void;
  audioCtx: AudioContext | null;
  speakTest: (text?: string) => void;
  exportCSV: () => void;
  perfTracker: StrategyPerformanceTracker;
  planHitboxes: { id: string; label: string; price: number; y: number }[];
  patternHitboxes: { x: number; y: number; w: number; h: number; pattern: PatternSignal }[];
  sigCounts: { bull: number; bear: number; warn: number };
  manipIndex: number;
  rollingAccuracy: { dir: number | null; vol: number | null; dirN: number; volN: number } | null;
  replaySession: (session: any) => void;
  stopReplay: () => void;
  isReplaying: boolean;
}

const BozokContext = createContext<BozokContextType | null>(null);

export const BozokProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('bozoksettingsv1');
        if (raw) {
          const parsed = JSON.parse(raw);
          let layersSet: Set<HeatmapLayerKey>;
          if (Array.isArray(parsed.activeLayers)) {
            layersSet = new Set(parsed.activeLayers);
          } else if (parsed.activeLayers && typeof parsed.activeLayers === 'object' && Object.keys(parsed.activeLayers).length > 0) {
            layersSet = new Set(Object.keys(parsed.activeLayers) as HeatmapLayerKey[]);
          } else {
            layersSet = DEFAULT_CONFIG.activeLayers;
          }
          return { ...DEFAULT_CONFIG, ...parsed, activeLayers: layersSet };
        }
      } catch (e) {}
    }
    return DEFAULT_CONFIG;
  });

  const [activeTab, setActiveTab] = useState<TabKey>('bookView');
  const [symbol, setSymbolState] = useState<string>('BTCUSDT');
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
  const [activePatterns, setActivePatterns] = useState<PatternSignal[]>([]);
  const [signalsFeed, setSignalsFeed] = useState<PatternSignal[]>([]);
  const [tradePlan, setTradePlan] = useState<TradePlan | null>(null);
  const [narrative, setNarrative] = useState<Narrative>({ icon: '🌐', title: 'NÖTR / BEKLE', bias: 'neu', text: 'Veri bekleniyor...' });
  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);
  const [flowCandles, setFlowCandles] = useState<FlowCandle[]>([]);
  const [microResult, setMicroResult] = useState<MicroResult | null>(null);
  const [focusPrice, setFocusPriceState] = useState<number | null>(null);
  const [focusUntil, setFocusUntil] = useState<number>(0);
  const [sigCounts, setSigCounts] = useState<{ bull: number; bear: number; warn: number }>({ bull: 0, bear: 0, warn: 0 });
  const [manipIndex, setManipIndex] = useState<number>(0);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);

  const [exchanges, setExchanges] = useState<Record<string, ExchangeState>>({
    binance: { key: 'binance', label: 'Binance Futures', tag: 'fstream.binance.com', status: 'connecting', bid: null, ask: null, ts: null, latencyMs: 0, lastError: null },
    bybit: { key: 'bybit', label: 'Bybit Linear', tag: 'stream.bybit.com', status: 'idle', bid: null, ask: null, ts: null, latencyMs: 0, lastError: null },
    okx: { key: 'okx', label: 'OKX Swap', tag: 'ws.okx.com', status: 'idle', bid: null, ask: null, ts: null, latencyMs: 0, lastError: null },
    mexc: { key: 'mexc', label: 'MEXC Contract', tag: 'contract.mexc.com', status: 'idle', bid: null, ask: null, ts: null, latencyMs: 0, lastError: null }
  });

  const patternEngineRef = useRef(new PatternEngineV2());
  const narrativeEngineRef = useRef(new NarrativeEngine());
  const metaStrategyRef = useRef(new MetaStrategyEngine());
  const tradePlanGenRef = useRef(new TradePlanGenerator());
  const microOptRef = useRef(new MicroAccountOptimizer());
  const perfTrackerRef = useRef(new StrategyPerformanceTracker());
  const vpinCalcRef = useRef(new VPINCalculator());
  const liqCalcRef = useRef(new LiquidationPressureCalculator());
  const flowBuilderRef = useRef(new FlowCandleBuilder(config.flowTimeframeMs));
  const flowPatternDetRef = useRef(new FlowCandlePatternDetector());
  const cvdDivDetRef = useRef(new CVDDivergenceDetector());

  const audioCtxRef = useRef<AudioContext | null>(null);
  const planHitboxesRef = useRef<{ id: string; label: string; price: number; y: number }[]>([]);
  const patternHitboxesRef = useRef<{ x: number; y: number; w: number; h: number; pattern: PatternSignal }[]>([]);

  // Update Config Helper
  const updateConfig = useCallback((patch: Partial<AppConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...patch };
      if (typeof localStorage !== 'undefined') {
        try {
          const toSave = {
            ...updated,
            activeLayers: Array.from(updated.activeLayers instanceof Set ? updated.activeLayers : DEFAULT_CONFIG.activeLayers)
          };
          localStorage.setItem('bozoksettingsv1', JSON.stringify(toSave));
        } catch (e) {}
      }
      if (patch.theme) applyThemeStyle(patch.theme);
      if (patch.flowTimeframeMs && patch.flowTimeframeMs !== prev.flowTimeframeMs) {
        flowBuilderRef.current = new FlowCandleBuilder(patch.flowTimeframeMs);
      }
      return updated;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem('bozoksettingsv1'); } catch (e) {}
    }
    applyThemeStyle(DEFAULT_CONFIG.theme);
  }, []);

  const setSymbol = useCallback((sym: string) => {
    const s = sym.toUpperCase();
    setSymbolState(s);
    updateConfig({ symbol: s });
  }, [updateConfig]);

  const setFocusPrice = useCallback((p: number | null, durationMs = 12000) => {
    setFocusPriceState(p);
    setFocusUntil(Date.now() + durationMs);
  }, []);

  // Audio & TTS
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current && typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      } catch (e) {}
    }
    return audioCtxRef.current;
  }, []);

  const speakTest = useCallback((text?: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text || 'BOZOK PRO sesli sinyal motoru aktif');
      u.lang = 'tr-TR';
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }, []);

  const announceSignal = useCallback((sig: PatternSignal) => {
    if (!config.soundOn || !config.voiceAnnounce) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const ux = signalUX(sig);
      const priceTxt = Number.isFinite(sig.price) ? fmtPrice(sig.price) : '';
      let txt = (sig.severity === 'critical' ? 'Dikkat! ' : '') + (ux.title || sig.title);
      if (priceTxt) txt += ', fiyat ' + priceTxt;
      txt += ', güven ' + Math.round(sig.confidence || 0) + ' yüzde';
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = 'tr-TR';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }, [config.soundOn, config.voiceAnnounce]);

  // Export CSV
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
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bozok_signals_${symbol}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [signalsFeed, symbol]);

  // Main WebSocket Connection Effect
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isCancelled = false;

    // Fetch Symbol Exchange Info first
    fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo?symbol=${symbol}`)
      .then(r => r.json())
      .then(json => {
        if (isCancelled) return;
        const s = json.symbols && json.symbols[0];
        if (s) {
          let tickSize = 0.1, stepSize = 0.001;
          for (const f of s.filters || []) {
            if (f.filterType === 'PRICE_FILTER') tickSize = parseFloat(f.tickSize) || tickSize;
            if (f.filterType === 'LOT_SIZE') stepSize = parseFloat(f.stepSize) || stepSize;
          }
          setSymbolPrecision({
            tickSize,
            stepSize,
            priceDecimals: Math.max(0, -Math.floor(Math.log10(tickSize))),
            qtyDecimals: Math.max(0, -Math.floor(Math.log10(stepSize))),
            loaded: true
          });
        }
      })
      .catch(() => {});

    // Primary Binance Futures WS Stream
    const sym = symbol.toLowerCase();
    const wsUrl = `wss://fstream.binance.com/public/stream?streams=${sym}@depth20@100ms/${sym}@aggTrade/${sym}@ticker/${sym}@forceOrder`;

    try {
      ws = new WebSocket(wsUrl);
      setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'connecting' } }));

      ws.onopen = () => {
        if (isCancelled) return;
        setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'live' } }));
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const msg = JSON.parse(event.data);
          const data = msg.data || msg;
          if (!data) return;
          const now = Date.now();

          // Depth Update
          if (msg.stream && msg.stream.includes('@depth')) {
            const rawBids = data.b || data.bids || [];
            const rawAsks = data.a || data.asks || [];

            // Auto-detect exchange price precision from raw WebSocket string price
            if (rawBids.length > 0 && Array.isArray(rawBids[0]) && typeof rawBids[0][0] === 'string') {
              const pStr = rawBids[0][0];
              const cleanP = pStr.replace(/0+$/, '');
              if (cleanP.includes('.')) {
                const decs = cleanP.split('.')[1].length;
                const inferredTick = Math.pow(10, -decs);
                setSymbolPrecision({
                  tickSize: inferredTick,
                  priceDecimals: Math.max(2, decs),
                  loaded: true
                });
              }
            }

            const bids: BookLevel[] = rawBids.map(([p, q]: [string, string]) => {
              const price = parseFloat(p), qty = parseFloat(q);
              return { price, qty, notional: price * qty };
            }).filter((b: BookLevel) => b.qty > 0).sort((a: BookLevel, b: BookLevel) => b.price - a.price);

            const asks: BookLevel[] = rawAsks.map(([p, q]: [string, string]) => {
              const price = parseFloat(p), qty = parseFloat(q);
              return { price, qty, notional: price * qty };
            }).filter((a: BookLevel) => a.qty > 0).sort((a: BookLevel, b: BookLevel) => a.price - b.price);

            const newBook: Book = { bids, asks, ts: now, label: 'Binance' };
            setBook(newBook);

            if (bids.length && asks.length) {
              const mid = (bids[0].price + asks[0].price) / 2;
              setLastPrice(prev => {
                setPrevPrice(prev);
                return mid;
              });

              setExchanges(prev => ({
                ...prev,
                binance: { ...prev.binance, bid: bids[0].price, ask: asks[0].price, ts: now }
              }));

              // Update Heatmap History
              setHeatHistory(prev => {
                let snapMax = 1;
                [...bids.slice(0, 20), ...asks.slice(0, 20)].forEach(l => { if (l.qty > snapMax) snapMax = l.qty; });
                const snap = {
                  t: now,
                  bids: bids.slice(0, 20).map(b => [b.price, b.qty] as [number, number]),
                  asks: asks.slice(0, 20).map(a => [a.price, a.qty] as [number, number]),
                  maxQty: snapMax
                };
                const next = [...prev, snap];
                const cut = now - config.heatmapWindowSec * 1000;
                return next.filter(s => s.t >= cut);
              });

              // Run Pattern Engine V2 & Meta Strategy Engine
              const currentTrades = trades;
              const detected = patternEngineRef.current.analyze(
                { mid, bidRows: bids, askRows: asks },
                currentTrades,
                heatHistory.map(h => ({ bids: h.bids, asks: h.asks })),
                config.wallMult,
                config.spoofWindowMs,
                config.imbalanceThresh,
                config.minPatternConfidence,
                config.minSignalConfidence
              );
              setActivePatterns(detected);

              // Update Feed with new signals
              for (const sig of detected) {
                if (!(sig as any)._emitted && sig.confidence >= config.minSignalConfidence) {
                  (sig as any)._emitted = true;
                  announceSignal(sig);
                  setSignalsFeed(prev => [sig, ...prev.slice(0, 200)]);
                  setSigCounts(prev => ({
                    ...prev,
                    [sig.bias === 'bullish' || sig.bias === 'bull' ? 'bull' : sig.bias === 'bearish' || sig.bias === 'bear' ? 'bear' : 'warn']: (prev[sig.bias === 'bullish' || sig.bias === 'bull' ? 'bull' : sig.bias === 'bearish' || sig.bias === 'bear' ? 'bear' : 'warn'] || 0) + 1
                  }));
                }
              }

              // Narrative
              const newNarrative = narrativeEngineRef.current.synthesize(detected);
              setNarrative(newNarrative);

              // Trade Plan & Meta Strategy
              const basePlan = tradePlanGenRef.current.generatePlan(detected, mid, heatHistory);
              const metaPlan = metaStrategyRef.current.evaluate(detected, { mid, bidRows: bids, askRows: asks }, currentTrades, liquidations, perfTrackerRef.current, symbol, config.multiExchange, exchanges);
              const finalPlan = (metaPlan && metaPlan.confidence >= 75) ? metaPlan : basePlan;
              setTradePlan(finalPlan);

              // Micro Optimizer Calculation
              if (finalPlan && finalPlan.entry && finalPlan.stopLoss) {
                const entryAvg = (finalPlan.entry.low + finalPlan.entry.high) / 2;
                const stopPx = finalPlan.stopLoss.price;
                const res = microOptRef.current.calculate(entryAvg, stopPx, finalPlan.direction === 'SHORT' ? 'SHORT' : 'LONG', finalPlan.confidence, config.microBalance, config.microRiskPct, config.microMaxLeverage);
                setMicroResult(res);
              }

              // Flow Candle Update
              flowBuilderRef.current.update({ mid, bidRows: bids, askRows: asks }, currentTrades, detected, liquidations);
              setFlowCandles(flowBuilderRef.current.getCandles());
            }
          }

          // Trade Stream
          else if (msg.stream && msg.stream.includes('@aggTrade')) {
            const price = parseFloat(data.p), qty = parseFloat(data.q);
            const side = data.m ? 'sell' : 'buy';
            const notional = price * qty;
            const newTrade: Trade = { price, qty, side, timestamp: data.T || now, notional };

            setTrades(prev => [newTrade, ...prev.slice(0, 2000)]);
            vpinCalcRef.current.update(newTrade);
            setVpinValue(vpinCalcRef.current.getVPIN());

            // CVD Calculation
            setCvd(prev => {
              const nextCvd = prev + (side === 'buy' ? qty : -qty);
              setCvdHistory(h => [...h.slice(-120), nextCvd]);
              return nextCvd;
            });
          }

          // Ticker Stream
          else if (msg.stream && msg.stream.includes('@ticker')) {
            setTicker({
              changePct: parseFloat(data.P || 0),
              volume: parseFloat(data.q || 0),
              high24h: parseFloat(data.h || 0),
              low24h: parseFloat(data.l || 0)
            });
          }

          // Force Order / Liquidation Stream
          else if (msg.stream && msg.stream.includes('@forceOrder')) {
            const o = data.o || data;
            if (o) {
              const price = parseFloat(o.p || o.ap), qty = parseFloat(o.q);
              const notionalUsd = price * qty;
              if (notionalUsd >= config.minLiquidationNotional) {
                const liqEv: LiquidationEvent = {
                  id: `liq_${now}_${Math.random()}`,
                  symbol: o.s || symbol,
                  side: o.S === 'SELL' ? 'long' : 'short',
                  price,
                  qty,
                  notionalUsd,
                  timestamp: o.T || now
                };
                setLiquidations(prev => [liqEv, ...prev.slice(0, 500)]);
              }
            }
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'bad' } }));
      };

      ws.onclose = () => {
        setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'disconnected' } }));
      };
    } catch (e) {
      setExchanges(prev => ({ ...prev, binance: { ...prev.binance, status: 'error' } }));
    }

    return () => {
      isCancelled = true;
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
    };
  }, [symbol, config.wallMult, config.spoofWindowMs, config.imbalanceThresh, config.minPatternConfidence, config.minSignalConfidence, config.heatmapWindowSec, config.multiExchange, config.microBalance, config.microRiskPct, config.microMaxLeverage, announceSignal]);

  // Multi-Exchange Secondary Prices Polling Effect
  useEffect(() => {
    if (!config.multiExchange) return;
    let isCancelled = false;

    const pollMultiExchanges = async () => {
      if (isCancelled) return;
      const symUpper = symbol.toUpperCase();

      // Bybit Linear V5 Ticker
      try {
        const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symUpper}`);
        const json = await res.json();
        if (!isCancelled && json.result && json.result.list && json.result.list[0]) {
          const item = json.result.list[0];
          setExchanges(prev => ({
            ...prev,
            bybit: {
              ...prev.bybit,
              status: 'live',
              bid: parseFloat(item.bid1Price) || null,
              ask: parseFloat(item.ask1Price) || null,
              ts: Date.now()
            }
          }));
        }
      } catch (e) {}

      // OKX Swap Ticker
      try {
        const okxInst = `${symUpper.replace('USDT', '')}-USDT-SWAP`;
        const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${okxInst}`);
        const json = await res.json();
        if (!isCancelled && json.data && json.data[0]) {
          const item = json.data[0];
          setExchanges(prev => ({
            ...prev,
            okx: {
              ...prev.okx,
              status: 'live',
              bid: parseFloat(item.bidPx) || null,
              ask: parseFloat(item.askPx) || null,
              ts: Date.now()
            }
          }));
        }
      } catch (e) {}

      // MEXC Contract Ticker
      try {
        const mexcSym = `${symUpper.replace('USDT', '')}_USDT`;
        const res = await fetch(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${mexcSym}`);
        const json = await res.json();
        if (!isCancelled && json.data) {
          const item = json.data;
          setExchanges(prev => ({
            ...prev,
            mexc: {
              ...prev.mexc,
              status: 'live',
              bid: parseFloat(item.bid1) || null,
              ask: parseFloat(item.ask1) || null,
              ts: Date.now()
            }
          }));
        }
      } catch (e) {}
    };

    pollMultiExchanges();
    const interval = setInterval(pollMultiExchanges, 2500);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [symbol, config.multiExchange]);

  // Replay Controller Stubs
  const replaySession = useCallback((session: any) => {
    setIsReplaying(true);
  }, []);

  const stopReplay = useCallback(() => {
    setIsReplaying(false);
  }, []);

  return (
    <BozokContext.Provider value={{
      config,
      updateConfig,
      resetConfig,
      activeTab,
      setActiveTab,
      symbol,
      setSymbol,
      lastPrice,
      prevPrice,
      ticker,
      book,
      trades,
      cvd,
      cvdHistory,
      largeCvdHistory,
      smallCvdHistory,
      vpinValue,
      heatHistory,
      activePatterns,
      signalsFeed,
      tradePlan,
      narrative,
      exchanges,
      liquidations,
      flowCandles,
      microResult,
      focusPrice,
      setFocusPrice,
      audioCtx: audioCtxRef.current,
      speakTest,
      exportCSV,
      perfTracker: perfTrackerRef.current,
      planHitboxes: planHitboxesRef.current,
      patternHitboxes: patternHitboxesRef.current,
      sigCounts,
      manipIndex,
      rollingAccuracy: { dir: 75, vol: 80, dirN: 12, volN: 15 },
      replaySession,
      stopReplay,
      isReplaying
    }}>
      {children}
    </BozokContext.Provider>
  );
};

export const useBozok = () => {
  const context = useContext(BozokContext);
  if (!context) throw new Error("useBozok must be used within BozokProvider");
  return context;
};
