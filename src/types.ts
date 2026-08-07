// BOZOK PRO — Exhaustive Type Definitions

export type Side = 'buy' | 'sell' | 'bid' | 'ask';
export type BiasType = 'bullish' | 'bearish' | 'warning' | 'bull' | 'bear' | 'warn';
export type SeverityType = 'low' | 'medium' | 'high' | 'critical';
export type TabKey = 'bookView' | 'flowView' | 'depthView' | 'signalsView' | 'levelsView' | 'marketsView' | 'backtestView' | 'settingsView';
export type ThemeType = 'professional' | 'neon' | 'minimal';
export type SensitivityPreset = 'CONSERVATIVE' | 'NORMAL' | 'AGGRESSIVE' | 'CUSTOM';
export type OverlayDensityType = 'LOW' | 'NORMAL' | 'HIGH';
export type ChartModeType = 'MINIMAL' | 'NORMAL' | 'PRO';
export type FlowCandleMode = 'time' | 'volume';
export type ConnStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'live' | 'bad' | 'idle' | 'STALE';
export type HeatmapLayerKey = 'liquidity' | 'velocity' | 'trades' | 'walls' | 'liqpools' | 'spoofing' | 'iceberg' | 'vpvr' | 'crosshair';

export interface BookLevel {
  price: number;
  qty: number;
  notional?: number;
  exchangeCount?: number;
}

export interface Book {
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
  label?: string;
  bucketSize?: number;
}

export interface Trade {
  price: number;
  qty: number;
  side: Side;
  timestamp: number;
  notional: number;
}

export interface TickerInfo {
  changePct: number;
  volume: number;
  high24h: number;
  low24h: number;
}

export interface ExchangeState {
  key: string;
  label: string;
  tag: string;
  status: ConnStatus;
  bid: number | null;
  ask: number | null;
  ts: number | null;
  latencyMs: number;
  lastError: string | null;
}

export interface ArbitrageSkew {
  venueA: string;
  venueB: string;
  priceA: number;
  priceB: number;
  deviationBps: number;
  absBps: number;
  leadVenue: string;
  isOpportunity: boolean;
}

export interface WallRecord {
  key: string;
  side: Side;
  price: number;
  qty: number;
  notional: number;
  firstSeen: number;
  lastSeen: number;
  maxNotional: number;
  sizeRatio: number;
  cancelledAt?: number;
}

export interface WallEvent {
  timestamp: number;
}

export interface PatternSignalVisual {
  color: string;
  style: 'solid' | 'dashed';
  label: string;
  icon: string;
}

export interface PatternSignal {
  id: string;
  type: string;
  title: string;
  bias: BiasType;
  price: number;
  confidence: number;
  severity: SeverityType;
  timeframe: string;
  explanation: string;
  invalidation?: number | null;
  zone?: { low: number; high: number } | null;
  createdAt: number;
  t?: number;
  metadata?: Record<string, any>;
  confidenceBreakdown?: Record<string, number> | null;
  visual?: PatternSignalVisual;
  verified?: { hit: boolean; pct: number };
  _conflict?: boolean;
  _emitted?: boolean;
}

export interface TradePlanEntry {
  low: number;
  high: number;
  reasoning: string;
}

export interface TradePlanLevel {
  price: number;
  reasoning: string;
}

export interface TrailingStopInfo {
  active: boolean;
  distance: number;
  trigger?: number | null;
}

export interface WebhookPayload {
  event: string;
  strategyId: string;
  direction: 'LONG' | 'SHORT';
  symbol: string;
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  leverage: number;
  timestamp: number;
  [key: string]: any;
}

export interface TradePlan {
  strategyId?: string;
  strategyName?: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  entry: TradePlanEntry;
  stopLoss: TradePlanLevel | null;
  tp1: TradePlanLevel | null;
  tp2: TradePlanLevel | null;
  riskReward1: number;
  riskReward2: number;
  trailingStop: TrailingStopInfo;
  reasoning: string;
  webhookPayload?: WebhookPayload;
}

export interface Narrative {
  icon: string;
  title: string;
  bias: 'bull' | 'bear' | 'warn' | 'neu';
  text: string;
}

export interface FlowCandleEvent {
  type: string;
  icon: string;
  severity: SeverityType;
}

export interface FlowCandleLiquidationData {
  longLiqNotional?: number;
  shortLiqNotional?: number;
  longCount?: number;
  shortCount?: number;
  longLiq?: number;
  shortLiq?: number;
}

export interface FlowCandleFootprintCell {
  buy: number;
  sell: number;
}

export interface FlowCandle {
  bucketId: number;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  activity: number;
  buyActivity: number;
  sellActivity: number;
  poc?: number;
  events: FlowCandleEvent[];
  liquidationData: FlowCandleLiquidationData;
  metadata: {
    samples: number;
    avgBidLiquidity: number;
    avgAskLiquidity: number;
    tradeCount: number;
  };
  footprint?: Map<number, FlowCandleFootprintCell> | Record<number, FlowCandleFootprintCell>;
  isLive: boolean;
  direction: 'bullish' | 'bearish' | 'neutral' | 'bull' | 'bear';
  strength: number;
  _maxAct?: number;
}

export interface LiquidationEvent {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL' | 'long' | 'short';
  price: number;
  qty: number;
  notionalUsd: number;
  timestamp: number;
  quantity?: number;
  notional?: number;
  exchange?: string;
}

export interface LiquidationPool {
  leverage: number;
  side: 'long' | 'short';
  price: number;
  estNotionalUsd: number;
  estNotionalFormatted?: string;
}

export interface StrategyPerformance {
  strategyId: string;
  totalTrades: number;
  winTrades: number;
  netRReturn: number;
  equityHistory: number[];
  winRatePct: number;
  profitFactor: number;
}

export interface MicroResult {
  balance: number;
  riskPct?: number;
  baseRiskPct?: number;
  riskUsd: number;
  riskAmount?: string;
  leverage: number;
  recommendedLeverage?: number;
  notionalUsd: number;
  positionNotional?: string;
  marginUsd: number;
  requiredMargin?: string;
  isTradable?: boolean;
  feeUsd: number;
  feeCost?: string;
  feeCostUsd?: string;
  fundingUsd: number;
  fundingCostUsd?: string;
  breakEvenPct: number;
  breakEven?: number;
  liqPrice: number;
  liqEstimate?: number;
  stopBeyondLiq?: boolean;
  statusText: string;
  statusIsWarn: boolean;
  warning?: string;
  liqNote?: string;
  minStopPct?: string | null;
}

export interface AppConfig {
  symbol: string;
  primaryExchange: string;
  bookMode: 'binance' | 'global';
  multiExchange: boolean;
  wallMult: number;
  spoofWindowMs: number;
  imbalanceThresh: number;
  algoWarEventsPerSec: number;
  heatmapWindowSec: number;
  sampleIntervalMs: number;
  renderIntervalMs: number;
  depthLevels: number;
  overlayDensity: OverlayDensityType;
  ladderDepth: string;
  chartMode: ChartModeType;
  soundOn: boolean;
  voiceAnnounce: boolean;
  notifications: boolean;
  sensitivity: SensitivityPreset;
  minPatternConfidence: number;
  minSignalConfidence: number;
  minFlowConfidence: number;
  minToastConfidence: number;
  theme: ThemeType;
  colorblind: boolean;
  flowTimeframeMs: number;
  flowCandleMode: FlowCandleMode;
  flowVolumeTarget: number;
  minLiquidationNotional: number;
  feeRate: number;
  makerFee: number;
  takerFee: number;
  fundingRate: number;
  microBalance: number;
  microRiskPct: number;
  microMaxLeverage: number;
  activeLayers: Set<HeatmapLayerKey>;
}
