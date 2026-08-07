# 🚀 BOZOK PRO MASTER MİMARİ VE UYGULAMA BLUEPRINTI (TASK.MD)

## 📌 MİSYON: CANLI ORDERBOOK & MİKRO-YAPI AVCI TERMİNALİ
Sıfır sahte veri, sıfır mock, sıfır basitleştirme. Gerçek Binance Futures, Bybit Linear, OKX Swap ve MEXC Contract akışlarıyla milisaniyelik canlı emilim, spoof, likidasyon şelalesi, CVD sapması, VPIN toksisite ve avcı strateji motoru.

---

## 🛠️ 1. MİMARİ VE MODÜLLER (SATIR SATIR BİLEŞEN HARİTASI)

### A. CANLI VERİ VE BORSA BAĞLANTILARI (DATA LAYER)
- **Binance Futures Websocket Stream (`wss://fstream.binance.com/stream`)**:
  - `depth20@100ms`: Canlı 20 kademe derinlik güncellemeleri.
  - `aggTrade`: Gerçek zamanlı anonim işlem akışı (fiyat, miktar, taker yönü `isMaker`).
  - `ticker`: 24s değişim %, hacim, en yüksek/en düşük.
  - `forceOrder`: Canlı likidasyon (tasfiye) patlamaları.
- **REST Depth Snapshot & ExchangeInfo (`fapi.binance.com`)**:
  - Dinamik `tickSize`, `stepSize` ve hassasiyet hesabı.
  - Kaçırılan tasfiyeler için REST telafi akışı (`/fapi/v1/allForceOrders`).
- **Çoklu Borsa Çapraz Arbitraj ve Fiyat Sapması (Multi-Exchange Scanner)**:
  - **Bybit Linear API**: Canlı V5 Ticker/Depth akışı.
  - **OKX Swap API**: Canlı V5 Inst Ticker/Depth akışı.
  - **MEXC Contract API**: Canlı Kontrat Ticker akışı.
  - Borsa sapması (Deviation Bps) ve gecikme (Latency ms) hesaplama.

---

### B. MİKRO-YAPI VE PATTERN ALGILAMA MOTORLARI (DETECTOR ENGINES)
1. **StrongWallDetector**:
   - Dinamik medyan çarpanı (`wallMult`) ile alıcı ve satıcı duvarlarını tespit etme.
2. **WallPullDetector (Spoof Risk)**:
   - Duvar yaşam süresi, emilim oranı ve çekilme hızı takibi. Korku (Fear) vs Spoof ayrımı.
3. **AbsorptionDetector**:
   - Büyük duvarların market emriyle yutulması / emilmesi.
4. **LiquidityVoidDetector (Vacuum Fill)**:
   - Derinlikteki ince likidite boşlukları ve hızı.
5. **LadderDetectorV2**:
   - Algoritmik merdiven emri dizilimleri (Bot aktiviteleri).
6. **IcebergDetector**:
   - Gizli kurumsal birikim/dağıtım duvarları.
7. **OFISpikeDetector (Hidden Absorption)**:
   - Fiyat sabitken tek tarafa anlık devasa market akışı.
8. **OrderbookSkewDetector**:
   - Derinlik asimetrisi ve 10sn türevsel kayma hızı.
9. **VPINCalculator**:
   - Volume-Synchronized Probability of Toxicity (Sipariş akışı toksisite indeksi).
10. **CVDDivergenceDetector**:
    - Fiyat-CVD uyumsuzluğu + Balina vs Retail ayrı CVD takibi (Smart Money Distribution).
11. **StopHuntDetector**:
    - Tepe/Dip iğneleme ve stop-loss avı tespiti.
12. **LiquidationPressureCalculator & LiquidationPoolSimulator**:
    - 10x / 25x / 50x / 100x kaldırımlı tasfiye mıknatısı havuzları.

---

### C. AVCI STRATEJİ MOTORU (META STRATEGY ENGINE)
1. **KAPLAN KAPAN (Spoof Trap & Void Sweep)**:
   - Sahte satıcı duvarı çekildiğinde yukarı boşluğu süpürme stratejisi.
2. **KELLE AVCISI (Liquidation Cascade Reversal)**:
   - Long/Short tasfiye şelalesinde dip emilimi yakalama.
3. **BALİNA TUZAĞI (Smart Money Distribution Scalp)**:
   - Retail alırken balinanın mal boşaltmasını yakalayıp ters pozisyon açma.
4. **IŞIK HIZI ARBİTRAJI (Latency Front-Running)**:
   - Binance fırladığında Bybit/OKX sapmasını yakalama.

---

### D. TİCARİ PLAN VE MİKRO BAKİYE OPTİMİZÖRÜ (TRADE PLAN & MICRO OPTIMIZER)
- **TradePlanGenerator**:
  - Dinamik volatilite tamponlu Entry, SL, TP1, TP2, R:R ve Trailing Stop.
  - Bota direkt gönderilebilir **Webhook Payload (JSON)** üretimi.
- **MicroAccountOptimizer**:
  - Bütçe (ör. $5, $10, $50, $100) üzerinden dinamik Kelly riski.
  - Kaldıraç, margin, maker/taker komisyon, fonlama ve tahmini likidasyon fiyatı hesabı.

---

### E. DAHİLİ BACKTEST MOTORU (BACKTEST TERMINAL & SIMULATOR)
- **Zero Lookahead Bias Engine**:
  - Kapanmış bar sinyalleriyle bir sonraki barın açılışında işlem.
  - Komisyon, kayma (slippage), pozisyon boyutlandırma.
  - Sharpe Ratio, Sortino Ratio, Win Rate %, Profit Factor, Expectancy R, Max Drawdown hesabı.
  - TradingView Lightweight Charts entegrasyonu.

---

### F. KULLANICI ARAYÜZÜ (7 TAM SEKME)
1. **📊 BOOK (Isı Haritası & Canlı Derinlik)**:
   - 60sn Isı Haritası canvas'ı, Drag-to-Trade interaktif SL/TP sürükleme, katmanlar, canlı emilimler.
2. **🕯️ FLOW (Baskı Mumları & Footprint)**:
   - Hacim/Zaman modlu baskı mumları, POC seviyesi, footprint akışı.
3. **📚 DEPTH (OBI & CVD & Kademeli Merdiven)**:
   - OBI gauge, CVD sparkline, balina/retail CVD, bid/ask merdiveni.
4. **🎯 SIGNALS (Sinyal Akışı & Filtreler)**:
   - Canlı tespit edilen patternler, güven oranları, doğrulama durumu, CSV aktarım.
5. **📍 LEVELS (Meta-Analiz & Plan & Mikro Optimizör)**:
   - Narrative Engine Türkçe piyasa yorumu, trade plan kartı, equity eğrisi.
6. **🌐 MARKETS (Borsa Karşılaştırma & Arbitraj)**:
   - Binance, Bybit, OKX, MEXC fiyat sapması, gecikme, veri kalitesi skoru.
7. **⚙️ SETTINGS (Ayarlar & Ses/TTS & Replay)**:
   - Hassasiyet presetleri, sesli Türkçe anons (TTS), JSON yedekleme, IndexedDB Replay backtest oynatıcı.

---

## 📈 UYGULAMA ADIMLARI (CHECKLIST)
- [ ] **Aşama 1**: Veri tipleri (`/src/types.ts`) - Tüm detector, signal, trade, book ve config arayüzlerini eksiksiz tanımla.
- [ ] **Aşama 2**: Yardımcı matematik ve format fonksiyonları (`/src/utils/fmt.ts`, `/src/utils/theme.ts`).
- [ ] **Aşama 3**: Çekirdek Analiz ve Detector Motorları (`/src/utils/detectors.ts` ve `/src/utils/engines.ts`).
- [ ] **Aşama 4**: Bozok Context (`/src/context/BozokContext.tsx`) - Gerçek Binance Futures WebSocket akışı, Bybit/OKX REST/WS fiyat tarayıcısı, canlı CVD/VPIN/Pattern/Plan hesaplamaları.
- [ ] **Aşama 5**: Görsel Arayüz Bileşenleri (`TopBar.tsx`, `TabBar.tsx`, 7 sekme bileşeni: `BookTab.tsx`, `FlowTab.tsx`, `DepthTab.tsx`, `SignalsTab.tsx`, `LevelsTab.tsx`, `MarketsTab.tsx`, `BacktestTab.tsx`, `SettingsTab.tsx`).
- [ ] **Aşama 6**: Uygulama derleme ve linter doğrulaması.
