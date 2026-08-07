// BOZOK PRO — Math & Formatting Utilities

export interface SymbolPrecision {
  tickSize: number;
  stepSize: number;
  priceDecimals: number;
  qtyDecimals: number;
  loaded: boolean;
}

export let globalSymbolPrecision: SymbolPrecision = {
  tickSize: 0.1,
  stepSize: 0.001,
  priceDecimals: 2,
  qtyDecimals: 3,
  loaded: false
};

export function setSymbolPrecision(prec: Partial<SymbolPrecision>) {
  globalSymbolPrecision = { ...globalSymbolPrecision, ...prec, loaded: true };
}

export function getDecimalsForPrice(p: number): number {
  if (globalSymbolPrecision.loaded && globalSymbolPrecision.priceDecimals !== undefined) {
    const prec = globalSymbolPrecision.priceDecimals;
    if (p < 0.0001 && prec >= 6) return prec;
    if (p < 0.01 && prec >= 4) return prec;
    if (p < 1 && prec >= 3) return prec;
    if (p < 100 && prec >= 2) return prec;
    if (p >= 100) return prec;
  }
  if (!Number.isFinite(p) || p <= 0) return 2;
  if (p >= 10000) return 2;
  if (p >= 1000) return 2;
  if (p >= 100) return 2;
  if (p >= 10) return 3;
  if (p >= 1) return 4;
  if (p >= 0.1) return 4;
  if (p >= 0.01) return 5;
  if (p >= 0.001) return 6;
  return 8;
}

export function fmtPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const decs = getDecimalsForPrice(p);
  return p.toLocaleString("en-US", {
    minimumFractionDigits: decs,
    maximumFractionDigits: decs
  });
}

export function fmtQty(q: number | null | undefined): string {
  if (q == null || !Number.isFinite(q)) return "—";
  if (q >= 1000000) return (q / 1000000).toFixed(2) + "M";
  if (q >= 1000) return (q / 1000).toFixed(2) + "K";
  if (globalSymbolPrecision.loaded && globalSymbolPrecision.qtyDecimals !== undefined) {
    return q.toFixed(globalSymbolPrecision.qtyDecimals);
  }
  return q.toFixed(3);
}

export function fmtAgo(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0.0s";
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + "s";
  const m = s / 60;
  if (m < 60) return m.toFixed(1) + "m";
  return (m / 60).toFixed(1) + "h";
}

export function median(arr: number[]): number {
  if (!arr || !arr.length) return 0;
  const valid = arr.filter(Number.isFinite);
  if (!valid.length) return 0;
  const s = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function tickSizeFor(price: number): number {
  if (globalSymbolPrecision.loaded && globalSymbolPrecision.tickSize) {
    const ts = globalSymbolPrecision.tickSize;
    if (price < 1 && ts >= 0.01) {
      return price < 0.001 ? 0.00000001 : (price < 0.1 ? 0.000001 : 0.0001);
    }
    if (price < 10 && ts >= 0.1) {
      return 0.001;
    }
    return ts;
  }
  if (!Number.isFinite(price) || price <= 0) return 0.0001;
  if (price >= 10000) return 1.0;
  if (price >= 1000) return 0.5;
  if (price >= 100) return 0.05;
  if (price >= 10) return 0.005;
  if (price >= 1) return 0.0005;
  if (price >= 0.1) return 0.0001;
  if (price >= 0.01) return 0.00001;
  if (price >= 0.001) return 0.000001;
  return 0.00000001;
}

export function roundToTick(price: number, tick: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(tick) || tick <= 0) return price;
  return Math.round(price / tick) * tick;
}

export function hexToRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '255,255,255';
}
