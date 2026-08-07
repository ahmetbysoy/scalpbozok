// BOZOK PRO — Theme & Canvas Palette System

export class CanvasPalette {
  bull: string = '#1fd67a';
  bullDim: string = '#15864e';
  bear: string = '#ff4d6d';
  bearDim: string = '#a5304a';
  accent: string = '#2fd0e0';
  signal: string = '#ffb020';
  violet: string = '#9b7bff';
  bg: string = '#05070c';
  panel: string = '#0c101a';
  text: string = '#e7edf6';
  textDim: string = '#8894a8';
  flowBull: string = '#21f6a2';
  flowBullWick: string = '#16c784';
  flowBullBorder: string = '#0fdf79';
  flowBear: string = '#ff3868';
  flowBearWick: string = '#e72350';
  flowBearBorder: string = '#ff547a';
  flowNeutral: string = '#64748b';
  flowNeutralWick: string = '#475569';
  flowNeutralBorder: string = '#94a3b8';
  tp1: string = '#36d6ff';
  tp2: string = '#a78bfa';
  invalidation: string = '#ffd166';

  refresh() {
    if (typeof document === 'undefined') return;
    const cs = getComputedStyle(document.body);
    const g = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback;
    this.bull = g('--bull', this.bull);
    this.bullDim = g('--bull-dim', this.bullDim);
    this.bear = g('--bear', this.bear);
    this.bearDim = g('--bear-dim', this.bearDim);
    this.accent = g('--accent', this.accent);
    this.signal = g('--signal', this.signal);
    this.violet = g('--violet', this.violet);
    this.bg = g('--bg', this.bg);
    this.panel = g('--panel', this.panel);
    this.text = g('--text', this.text);
    this.textDim = g('--text-dim', this.textDim);
    this.flowBull = g('--flow-bull', this.flowBull);
    this.flowBullWick = g('--flow-bull-wick', this.flowBullWick);
    this.flowBullBorder = g('--flow-bull-border', this.flowBullBorder);
    this.flowBear = g('--flow-bear', this.flowBear);
    this.flowBearWick = g('--flow-bear-wick', this.flowBearWick);
    this.flowBearBorder = g('--flow-bear-border', this.flowBearBorder);
    this.flowNeutral = g('--flow-neu', this.flowNeutral);
    this.flowNeutralWick = g('--flow-neu-wick', this.flowNeutralWick);
    this.flowNeutralBorder = g('--flow-neu-border', this.flowNeutralBorder);
    this.tp1 = g('--tp1', this.tp1);
    this.tp2 = g('--tp2', this.tp2);
    this.invalidation = g('--inv', this.invalidation);
  }
}

export const canvasPalette = new CanvasPalette();

export function applyThemeStyle(name: 'professional' | 'neon' | 'minimal') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  if (name === "neon") {
    root.setProperty("--bg", "#000012");
    root.setProperty("--panel", "#080018");
    root.setProperty("--panel2", "#0c0022");
    root.setProperty("--text", "#e7edf6");
    root.setProperty("--text-dim", "#8894a8");
    root.setProperty("--text-faint", "#4d5568");
    root.setProperty("--border", "#1b2231");
    root.setProperty("--line", "#1b2231");
    root.setProperty("--border-soft", "#161c29");
    root.setProperty("--bull", "#39ff14");
    root.setProperty("--bull-dim", "#20aa0b");
    root.setProperty("--bear", "#ff073a");
    root.setProperty("--bear-dim", "#aa0426");
    root.setProperty("--accent", "#00ffff");
    root.setProperty("--signal", "#ff007f");
  } else if (name === "minimal") {
    root.setProperty("--bg", "#f4f6f9");
    root.setProperty("--panel", "#ffffff");
    root.setProperty("--panel2", "#eef1f5");
    root.setProperty("--text", "#0f1420");
    root.setProperty("--text-dim", "#5a6478");
    root.setProperty("--text-faint", "#9aa3b5");
    root.setProperty("--border", "#dde2ea");
    root.setProperty("--line", "#dde2ea");
    root.setProperty("--border-soft", "#e7eaf0");
    root.setProperty("--bull", "#0f9d58");
    root.setProperty("--bull-dim", "#0a6d3a");
    root.setProperty("--bear", "#d93025");
    root.setProperty("--bear-dim", "#962118");
    root.setProperty("--accent", "#0e7490");
    root.setProperty("--signal", "#f59e0b");
  } else {
    root.setProperty("--bg", "#05070c");
    root.setProperty("--panel", "#0c101a");
    root.setProperty("--panel2", "#101623");
    root.setProperty("--text", "#e7edf6");
    root.setProperty("--text-dim", "#8894a8");
    root.setProperty("--text-faint", "#4d5568");
    root.setProperty("--border", "#1b2231");
    root.setProperty("--line", "#1b2231");
    root.setProperty("--border-soft", "#161c29");
    root.setProperty("--bull", "#1fd67a");
    root.setProperty("--bull-dim", "#15864e");
    root.setProperty("--bear", "#ff4d6d");
    root.setProperty("--bear-dim", "#a5304a");
    root.setProperty("--accent", "#2fd0e0");
    root.setProperty("--signal", "#ffb020");
  }
  canvasPalette.refresh();
}
