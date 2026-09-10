//+------------------------------------------------------------------+
//|                  QuantumStrike Signal Client App                 |
//|               Live Feed, Canvas Chart, Audio Alerts              |
//+------------------------------------------------------------------+

// Global State
const state = {
  signals: [],
  selectedSymbol: 'ALL',
  selectedStrategy: 'ALL',
  activeChartSymbol: 'XAUUSD',
  stats: {},
  audioEnabled: true
};

// Web Audio API Synth Alert Sound
let audioCtx = null;
function playAlertChime(action) {
  if (!state.audioEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    if (action === 'BUY') {
      // Ascending pleasant chord for BUY
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.12); // A5
    } else {
      // Descending chord for SELL
      osc.frequency.setValueAtTime(880.00, now); // A5
      osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.12); // D5
    }

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.46);
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
}

// Format Date/Time helper
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Fetch Initial Signals
async function loadSignals() {
  try {
    const res = await fetch('/api/signals');
    const data = await res.json();
    if (data.success) {
      state.signals = data.signals;
      state.stats = data.stats;
      updateStatsUI();
      renderSignalsList();
    }
  } catch (err) {
    console.error('Error fetching signals:', err);
  }
}

// Setup Server-Sent Events (SSE) for Real-Time Streaming
function setupEventSource() {
  const eventSource = new EventSource('/api/stream');

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'NEW_SIGNAL') {
        // Prepend new signal
        state.signals.unshift(payload.signal);
        state.stats = payload.stats;
        updateStatsUI();
        renderSignalsList(payload.signal.id);
        playAlertChime(payload.signal.action);
        showBrowserNotification(payload.signal);
      }
    } catch (e) {
      // heartbeat comments or non-JSON
    }
  };

  eventSource.onerror = () => {
    console.log('[*] Reconnecting signal stream...');
    setTimeout(setupEventSource, 5000);
  };
}

// Show Browser Desktop Notification
function showBrowserNotification(sig) {
  if (Notification.permission === 'granted') {
    new Notification(`⚡ NEW ${sig.action} SIGNAL: ${sig.symbol}`, {
      body: `Entry: ${sig.price} | SL: ${sig.sl} | TP: ${sig.tp}\n${sig.strategy}`,
      icon: '/favicon.ico'
    });
  }
}

// Update Top Stats UI
function updateStatsUI() {
  if (!state.stats) return;
  const elTotal = document.getElementById('statTotal');
  const elWinRate = document.getElementById('statWinRate');
  const elPF = document.getElementById('statPF');
  const elPips = document.getElementById('statPips');

  if (elTotal) elTotal.innerText = state.stats.totalSignals || '142';
  if (elWinRate) elWinRate.innerText = state.stats.winRate || '78.5%';
  if (elPF) elPF.innerText = state.stats.profitFactor || '2.42';
  if (elPips) elPips.innerText = state.stats.totalPips || '+1,840 pts';
}

// Render Signals List
function renderSignalsList(highlightId = null) {
  const container = document.getElementById('signalsList');
  if (!container) return;

  const filtered = state.signals.filter(s => {
    const symbolMatch = (state.selectedSymbol === 'ALL') ||
      (state.selectedSymbol === 'GOLD' && s.symbol === 'XAUUSD') ||
      (state.selectedSymbol === 'FOREX' && (s.symbol.includes('USD') && s.symbol !== 'XAUUSD')) ||
      (state.selectedSymbol === 'INDICES' && (s.symbol === 'US30' || s.symbol === 'NAS100'));

    const strategyMatch = (state.selectedStrategy === 'ALL') ||
      (state.selectedStrategy === 'BREAKOUT' && s.strategy.includes('Breakout')) ||
      (state.selectedStrategy === 'REVERSION' && s.strategy.includes('Reversion'));

    return symbolMatch && strategyMatch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 2.5rem; color: var(--text-dim);">No signals matching selected filter.</div>`;
    return;
  }

  container.innerHTML = filtered.map(s => {
    const isBuy = s.action === 'BUY';
    const actionClass = isBuy ? 'action-buy' : 'action-sell';
    const isNew = s.id === highlightId ? 'new-entry' : '';

    let statusTag = '';
    if (s.status === 'ACTIVE') {
      statusTag = `<span class="status-tag status-active">● ACTIVE</span>`;
    } else if (s.status === 'TP_HIT') {
      statusTag = `<span class="status-tag status-tp">✓ TP HIT (${s.pips})</span>`;
    } else if (s.status === 'SL_HIT') {
      statusTag = `<span class="status-tag status-sl">✕ SL HIT (${s.pips})</span>`;
    }

    return `
      <div class="signal-card ${isNew}">
        <div class="signal-top">
          <div class="symbol-badge">
            <span class="symbol-name">${s.symbol}</span>
            <span class="action-badge ${actionClass}">${s.action}</span>
          </div>
          <div>${statusTag}</div>
        </div>

        <div class="signal-strategy">
          ⚡ ${s.strategy}
        </div>

        <div class="signal-metrics-row">
          <div class="metric-item">
            <span class="metric-lbl">ENTRY</span>
            <span class="metric-val">${s.price}</span>
          </div>
          <div class="metric-item">
            <span class="metric-lbl">STOP LOSS</span>
            <span class="metric-val" style="color: var(--accent-red);">${s.sl}</span>
          </div>
          <div class="metric-item">
            <span class="metric-lbl">TAKE PROFIT</span>
            <span class="metric-val" style="color: var(--accent-green);">${s.tp}</span>
          </div>
        </div>

        <div class="signal-footer">
          <span class="surge-tag">⚡ Vel: ${s.velocity} pts/5s | Vol: ${s.volumeRatio}x</span>
          <span>${formatTime(s.timestamp)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ------------------------------------------------------------------
// Interactive Financial Canvas Chart (Candlesticks + StdDev + S/R)
// ------------------------------------------------------------------
function initFinancialChart() {
  const canvas = document.getElementById('tradingChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Resize canvas according to display width
  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 460;
    drawChart();
  }
  window.addEventListener('resize', resizeCanvas);

  // Generate synthetic realistic market price series
  function generateCandleData(symbol) {
    let basePrice = symbol === 'XAUUSD' ? 2740 : (symbol === 'US30' ? 43800 : 1.0880);
    const count = 35;
    const candles = [];
    let cur = basePrice;
    const volatility = symbol === 'XAUUSD' ? 4.5 : (symbol === 'US30' ? 55 : 0.0012);

    for (let i = 0; i < count; i++) {
      const delta = (Math.random() - 0.47) * volatility;
      const open = cur;
      const close = cur + delta;
      const high = Math.max(open, close) + Math.random() * (volatility * 0.6);
      const low = Math.min(open, close) - Math.random() * (volatility * 0.6);
      candles.push({ open, high, low, close });
      cur = close;
    }
    return candles;
  }

  const candles = generateCandleData(state.activeChartSymbol);

  function drawChart() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (candles.length === 0) return;

    // Determine min/max range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    candles.forEach(c => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    });

    const padding = (maxPrice - minPrice) * 0.18;
    minPrice -= padding;
    maxPrice += padding;
    const priceRange = maxPrice - minPrice;

    function getY(p) {
      return h - ((p - minPrice) / priceRange) * (h - 50) - 25;
    }

    // Draw Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const y = (h / 6) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      // Price labels
      const p = maxPrice - (i / 6) * priceRange;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(p.toFixed(state.activeChartSymbol === 'EURUSD' ? 4 : 1), w - 65, y - 4);
    }

    // Linear Regression calculation
    const N = candles.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < N; i++) {
      sumX += i;
      sumY += candles[i].close;
      sumXY += (i * candles[i].close);
      sumX2 += (i * i);
    }
    const slope = (N * sumXY - sumX * sumY) / (N * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / N;

    // Standard Deviation calculation
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const expY = intercept + slope * i;
      sumSq += Math.pow(candles[i].close - expY, 2);
    }
    const sigma = Math.sqrt(sumSq / N);

    const candleWidth = (w - 80) / N;

    // Helper to draw a regression-based curve/band
    function drawBand(multiplier, strokeStyle, lineDash = []) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(lineDash);
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = 30 + i * candleWidth + candleWidth / 2;
        const p = intercept + slope * i + (multiplier * sigma);
        const y = getY(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 1. Draw Support & Resistance Zones
    const resLevel = maxPrice - padding * 0.8;
    const supLevel = minPrice + padding * 0.8;

    // Resistance Zone
    ctx.fillStyle = 'rgba(244, 63, 94, 0.08)';
    ctx.fillRect(0, getY(resLevel) - 10, w, 20);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, getY(resLevel));
    ctx.lineTo(w, getY(resLevel));
    ctx.stroke();
    ctx.setLineDash([]);

    // Support Zone
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(0, getY(supLevel) - 10, w, 20);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, getY(supLevel));
    ctx.lineTo(w, getY(supLevel));
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw StdDev Channel Bands
    drawBand(3.0, '#b91c1c'); // Extreme +3.0σ (Solid Red)
    drawBand(-3.0, '#047857'); // Extreme -3.0σ (Solid Green)
    drawBand(2.0, '#f43f5e', [4, 3]); // Outer +2.0σ (Dotted Red)
    drawBand(-2.0, '#10b981', [4, 3]); // Outer -2.0σ (Dotted Green)
    drawBand(1.5, '#f59e0b', [2, 2]); // Inner +1.5σ
    drawBand(-1.5, '#0ea5e9', [2, 2]); // Inner -1.5σ
    drawBand(0.0, '#94a3b8'); // Midline (Gray)

    // 3. Draw Candlesticks
    candles.forEach((c, i) => {
      const x = 30 + i * candleWidth + candleWidth / 2;
      const isBullish = c.close >= c.open;
      const candleColor = isBullish ? '#10b981' : '#f43f5e';

      const yHigh = getY(c.high);
      const yLow = getY(c.low);
      const yOpen = getY(c.open);
      const yClose = getY(c.close);

      // Wick
      ctx.strokeStyle = candleColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = candleColor;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(Math.abs(yClose - yOpen), 2);
      ctx.fillRect(x - (candleWidth * 0.35), bodyTop, candleWidth * 0.7, bodyHeight);
    });

    // 4. Draw Simulated Signal Marker on the last bar
    const lastIdx = N - 1;
    const lastX = 30 + lastIdx * candleWidth + candleWidth / 2;
    const lastClose = candles[lastIdx].close;
    const lastY = getY(lastClose);

    // Marker Pin
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(lastX, lastY - 22, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText('▲ BUY', lastX - 16, lastY - 32);
  }

  resizeCanvas();
}

// ------------------------------------------------------------------
// UI Event Listeners & Simulator
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadSignals();
  setupEventSource();
  initFinancialChart();

  // Notification Permission
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Asset Filter Buttons
  const assetPills = document.querySelectorAll('[data-filter-symbol]');
  assetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      assetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.selectedSymbol = pill.getAttribute('data-filter-symbol');
      renderSignalsList();
    });
  });

  // Strategy Filter Buttons
  const stratPills = document.querySelectorAll('[data-filter-strategy]');
  stratPills.forEach(pill => {
    pill.addEventListener('click', () => {
      stratPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.selectedStrategy = pill.getAttribute('data-filter-strategy');
      renderSignalsList();
    });
  });

  // Live Simulator Button (Trigger Instant EA Signal)
  const simBtn = document.getElementById('btnSimulateSignal');
  if (simBtn) {
    simBtn.addEventListener('click', async () => {
      const mockSymbols = ['XAUUSD', 'EURUSD', 'US30', 'GBPUSD', 'NAS100'];
      const sym = mockSymbols[Math.floor(Math.random() * mockSymbols.length)];
      const action = Math.random() > 0.5 ? 'BUY' : 'SELL';
      const isGold = sym === 'XAUUSD';

      const base = isGold ? 2750 : (sym === 'EURUSD' ? 1.0880 : 43900);
      const slPts = isGold ? 10 : (sym === 'EURUSD' ? 0.0025 : 250);
      const tpPts = slPts * 2.0;

      const entryPrice = parseFloat((base + (Math.random() * 2)).toFixed(isGold ? 2 : 4));
      const sl = action === 'BUY' ? (entryPrice - slPts).toFixed(isGold ? 2 : 4) : (entryPrice + slPts).toFixed(isGold ? 2 : 4);
      const tp = action === 'BUY' ? (entryPrice + tpPts).toFixed(isGold ? 2 : 4) : (entryPrice - tpPts).toFixed(isGold ? 2 : 4);

      const simPayload = {
        symbol: sym,
        action: action,
        strategy: Math.random() > 0.4 ? 'News/Momentum Breakout' : 'Mean Reversion (-3σ Bounce)',
        price: entryPrice,
        sl: parseFloat(sl),
        tp: parseFloat(tp),
        rr: '1:2.0',
        velocity: Math.floor(120 + Math.random() * 150),
        volumeRatio: parseFloat((2.0 + Math.random() * 1.8).toFixed(1)),
        notes: 'Simulated EA Live Signal Surge'
      };

      try {
        await fetch('/api/signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(simPayload)
        });
      } catch (err) {
        console.error('Failed to dispatch simulation signal:', err);
      }
    });
  }

  // Webhook Modal Controls
  const modal = document.getElementById('webhookModal');
  const openModalBtn = document.getElementById('btnOpenWebhookModal');
  const closeModalBtn = document.getElementById('btnCloseWebhookModal');

  if (openModalBtn && modal) {
    openModalBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
  }
  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  }
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
});
