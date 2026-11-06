/* ================================================================
   Mamdani Fuzzy Logic Dam Controller – Interactive Visualization
   ================================================================ */

// ===== FUZZY LOGIC ENGINE =====
function trimf(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x <= b) return b !== a ? (x - a) / (b - a) : 1;
  return c !== b ? (c - x) / (c - b) : 1;
}

function trapmf(x, a, b, c, d) {
  if (x < a || x > d) return 0;
  if (x <= b) return b !== a ? (x - a) / (b - a) : 1;
  if (x <= c) return 1;
  return d !== c ? (d - x) / (d - c) : 1;
}

function fuzzyDamController(currentH, currentDH) {
  const h = {
    Low: trapmf(currentH, 0, 0, 20, 40),
    Mid: trimf(currentH, 20, 40, 60),
    High: trimf(currentH, 40, 60, 80),
    VH: trimf(currentH, 60, 80, 100),
    VVH: trapmf(currentH, 80, 100, 120, 120),
  };
  const dh = {
    NB: trapmf(currentDH, -10, -10, -5, -2.5),
    NS: trimf(currentDH, -5, -2.5, 0),
    Z: trimf(currentDH, -2.5, 0, 2.5),
    PS: trimf(currentDH, 0, 2.5, 5),
    PB: trapmf(currentDH, 2.5, 5, 10, 10),
  };

  const mn = Math.min, mx = Math.max;
  const ruleD1 = mx(mn(h.Low,dh.NB),mn(h.Low,dh.NS),mn(h.Low,dh.Z),mn(h.Low,dh.PS),mn(h.Mid,dh.NB),mn(h.Mid,dh.NS));
  const ruleD2 = mx(mn(h.Low,dh.PB),mn(h.Mid,dh.Z),mn(h.High,dh.NB));
  const ruleD3 = mx(mn(h.Mid,dh.PS),mn(h.High,dh.NS),mn(h.VH,dh.NB),mn(h.VH,dh.NS));
  const ruleD4 = mx(mn(h.Mid,dh.PB),mn(h.High,dh.Z),mn(h.High,dh.PS),mn(h.VH,dh.Z));
  const ruleD5 = mx(mn(h.High,dh.PB),mn(h.VH,dh.PS),mn(h.VH,dh.PB),h.VVH);

  const outX = [];
  for (let i = 0; i <= 100; i++) outX.push(i);

  const agg = outX.map(x => {
    const c1 = Math.min(ruleD1, trapmf(x, 0, 0, 10, 25));
    const c2 = Math.min(ruleD2, trimf(x, 10, 25, 45));
    const c3 = Math.min(ruleD3, trimf(x, 25, 45, 65));
    const c4 = Math.min(ruleD4, trimf(x, 45, 65, 85));
    const c5 = Math.min(ruleD5, trapmf(x, 65, 85, 100, 100));
    return Math.max(c1, c2, c3, c4, c5);
  });

  const area = agg.reduce((s, v) => s + v, 0);
  const cog = area === 0 ? 0 : agg.reduce((s, v, i) => s + i * v, 0) / area;
  return { cog, agg, rules: [ruleD1, ruleD2, ruleD3, ruleD4, ruleD5], h, dh };
}

function getTargetH(inflow) {
  let bestH = 40;
  let minDiff = Infinity;
  for (let hVal = 0; hVal <= 120; hVal += 0.5) {
    const cog = fuzzyDamController(hVal, 0).cog;
    const diff = Math.abs(cog - inflow * 10);
    if (diff < minDiff) {
      minDiff = diff;
      bestH = hVal;
    }
  }
  return bestH;
}

// ===== SIMULATION =====
function runSimulation(steps, initialH, inflow) {
  let currentH = initialH, currentDH = 0;
  const history = [];
  for (let t = 0; t <= steps; t++) {
    const result = fuzzyDamController(currentH, currentDH);
    history.push({ step: t, H: currentH, dH: currentDH, gate: result.cog, agg: result.agg, rules: result.rules, h: result.h, dh: result.dh });
    const outflow = result.cog / 10;
    const rawDH = inflow - outflow;
    const nextH = Math.max(0, currentH + rawDH);
    currentDH = nextH - currentH;
    currentH = nextH;
  }
  return history;
}

// ===== GLOBAL STATE =====
let simData = [];
let currentStep = 0;
let isPlaying = false;
let playInterval = null;
let charts = {};
let lastSteps = null;
let lastInitialH = null;
let lastInflow = null;

// ===== DOM REFS =====
const $ = id => document.getElementById(id);

// ===== CHART SETUP =====
function initCharts() {
  const commonOpts = (title, yLabel) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
      legend: { display: true, position: 'top', labels: { font: { family: "'Inter'", size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
      tooltip: { backgroundColor: '#0c2340', titleFont: { family: "'Inter'" }, bodyFont: { family: "'Inter'" }, cornerRadius: 6 },
    },
    scales: {
      x: { title: { display: true, text: 'Time Step (Hours)', font: { family: "'Inter'", size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
      y: { title: { display: true, text: yLabel, font: { family: "'Inter'", size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
    },
  });

  charts.level = new Chart($('chart-level'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Dam Level (H)', data: [], borderColor: '#0b5394', backgroundColor: 'rgba(11,83,148,0.08)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Ideal (40m)', data: [], borderColor: '#10b981', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: commonOpts('Dam Level', 'Level (m)'),
  });

  charts.rate = new Chart($('chart-rate'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Rate of Change (dH)', data: [], borderColor: '#2d79cd', backgroundColor: 'rgba(45,121,205,0.08)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Stable (0)', data: [], borderColor: '#ef4444', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: commonOpts('Rate of Change', 'Rate (m/hr)'),
  });

  charts.gate = new Chart($('chart-gate'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Gate Openness %', data: [], borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Inflow Match', data: [], borderColor: '#64748b', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: commonOpts('Gate Openness', 'Gate (%)'),
  });

  // Membership function charts
  initMembershipCharts();
}

function initMembershipCharts() {
  const xH = [], xdH = [], xD = [];
  for (let i = 0; i <= 120; i++) xH.push(i);
  for (let i = -100; i <= 100; i++) xdH.push(i / 10);
  for (let i = 0; i <= 100; i++) xD.push(i);

  const mfOpts = (title) => ({
    responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
    plugins: { legend: { position: 'top', labels: { font: { family: "'Inter'", size: 10 }, usePointStyle: true, pointStyleWidth: 6, boxWidth: 8 } } },
    scales: {
      x: { title: { display: true, text: title, font: { family: "'Inter'", size: 10 } }, grid: { display: false } },
      y: { min: 0, max: 1.05, title: { display: true, text: 'μ', font: { family: "'Inter'", size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
    },
  });

  const ds = (label, data, color) => ({ label, data, borderColor: color, borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.1 });

  charts.mfH = new Chart($('chart-mf-h'), {
    type: 'line',
    data: {
      labels: xH,
      datasets: [
        ds('Low', xH.map(x => trapmf(x,0,0,20,40)), '#3b82f6'),
        ds('Mid', xH.map(x => trimf(x,20,40,60)), '#10b981'),
        ds('High', xH.map(x => trimf(x,40,60,80)), '#f59e0b'),
        ds('VH', xH.map(x => trimf(x,60,80,100)), '#f97316'),
        ds('VVH', xH.map(x => trapmf(x,80,100,120,120)), '#ef4444'),
      ],
    },
    options: mfOpts('Dam Level (H) [m]'),
  });

  charts.mfDH = new Chart($('chart-mf-dh'), {
    type: 'line',
    data: {
      labels: xdH,
      datasets: [
        ds('NB', xdH.map(x => trapmf(x,-10,-10,-5,-2.5)), '#1d4ed8'),
        ds('NS', xdH.map(x => trimf(x,-5,-2.5,0)), '#60a5fa'),
        ds('Z', xdH.map(x => trimf(x,-2.5,0,2.5)), '#64748b'),
        ds('PS', xdH.map(x => trimf(x,0,2.5,5)), '#f97316'),
        ds('PB', xdH.map(x => trapmf(x,2.5,5,10,10)), '#ef4444'),
      ],
    },
    options: mfOpts('Rate of Change (dH) [m/hr]'),
  });

  charts.mfD = new Chart($('chart-mf-d'), {
    type: 'line',
    data: {
      labels: xD,
      datasets: [
        ds('VVL (d1)', xD.map(x => trapmf(x,0,0,10,25)), '#93c5fd'),
        ds('VL (d2)', xD.map(x => trimf(x,10,25,45)), '#60a5fa'),
        ds('L (d3)', xD.map(x => trimf(x,25,45,65)), '#3b82f6'),
        ds('M (d4)', xD.map(x => trimf(x,45,65,85)), '#f97316'),
        ds('H (d5)', xD.map(x => trapmf(x,65,85,100,100)), '#ef4444'),
      ],
    },
    options: mfOpts('Gate Openness (d) [%]'),
  });
}

// ===== UPDATE CHARTS =====
function updateCharts(upToStep) {
  const labels = [], hData = [], dhData = [], gData = [], ideal = [], stable = [], inMatch = [];
  const inflow = parseFloat($('inflow-rate').value);
  const targetH = getTargetH(inflow);
  for (let i = 0; i <= upToStep && i < simData.length; i++) {
    const d = simData[i];
    labels.push(d.step);
    hData.push(d.H);
    dhData.push(d.dH);
    gData.push(d.gate);
    ideal.push(targetH);
    stable.push(0);
    inMatch.push(inflow * 10);
  }

  charts.level.data.labels = labels;
  charts.level.data.datasets[0].data = hData;
  charts.level.data.datasets[1].data = ideal;
  charts.level.data.datasets[1].label = `Target (${targetH.toFixed(0)}m)`;
  charts.level.update();

  charts.rate.data.labels = labels;
  charts.rate.data.datasets[0].data = dhData;
  charts.rate.data.datasets[1].data = stable;
  charts.rate.update();

  charts.gate.data.labels = labels;
  charts.gate.data.datasets[0].data = gData;
  charts.gate.data.datasets[1].data = inMatch;
  charts.gate.update();
}

// ===== DAM SVG ANIMATION =====
function updateDamVisual(step) {
  if (!simData[step]) return;
  const d = simData[step];

  // Water level: H=0 → y=390 (bottom), H=120 → y=90 (top)
  const maxY = 340, minY = 90;
  const waterY = maxY - (d.H / 120) * (maxY - minY);
  const waterH = maxY - waterY;
  const water = $('reservoir-water');
  const wave = $('wave-surface');
  if (water) { water.setAttribute('y', waterY); water.setAttribute('height', waterH); }
  if (wave) wave.setAttribute('y', waterY - 6);

  // Level indicator
  const indicator = $('level-indicator');
  const badge = $('level-badge');
  const levelText = $('level-text');
  if (indicator) { indicator.setAttribute('y1', waterY); indicator.setAttribute('y2', waterY); }
  if (badge) badge.setAttribute('y', waterY - 15);
  if (levelText) { levelText.setAttribute('y', waterY); levelText.textContent = `${d.H.toFixed(0)}m`; }

  // Target Level indicator
  const inflow = parseFloat($('inflow-rate').value);
  const targetH = getTargetH(inflow);
  const targetY = maxY - (targetH / 120) * (maxY - minY);
  const targetIndicator = $('target-level-indicator');
  const targetBadge = $('target-level-badge');
  const targetText = $('target-level-text');
  if (targetIndicator) { targetIndicator.setAttribute('y1', targetY); targetIndicator.setAttribute('y2', targetY); }
  if (targetBadge) targetBadge.setAttribute('y', targetY - 15);
  if (targetText) { targetText.setAttribute('y', targetY); targetText.textContent = `Target: ${targetH.toFixed(0)}m`; }

  // Gate: 0% → fully closed (height=40), 100% → fully open (height=2) (Slides UP to open)
  const gateH = Math.max(2, 40 * (1 - d.gate / 100));
  const gate = $('dam-gate');
  if (gate) { 
    gate.setAttribute('height', gateH); 
    gate.setAttribute('y', 300); 
  }
  
  // Hide gate lines dynamically if they are below the gate's bottom edge
  const gateBottom = 300 + gateH;
  const lineYCoords = [305, 315, 325, 335];
  for (let i = 1; i <= 4; i++) {
    const gl = $('gate-line' + i);
    if (gl) {
      const lineY = lineYCoords[i - 1];
      if (lineY < gateBottom - 2) {
        gl.setAttribute('opacity', '0.6');
      } else {
        gl.setAttribute('opacity', '0');
      }
    }
  }

  // Outflow stream height, position, and opacity adjust with the gate opening
  const outflow = $('outflow-stream');
  if (outflow) {
    const streamH = 40 - gateH;
    outflow.setAttribute('height', streamH);
    outflow.setAttribute('y', 300 + gateH);
    outflow.setAttribute('opacity', streamH > 0.5 ? '0.85' : '0');
  }

  // Gate badge
  const gateText = $('gate-text');
  if (gateText) gateText.textContent = `Gate: ${d.gate.toFixed(0)}%`;

  // Color water by danger
  const waterEl = $('reservoir-water');
  if (waterEl) {
    let fill = 'url(#waterGradient)';
    if (d.H > 100) fill = '#ef4444';
    else if (d.H > 80) fill = '#f97316';
    waterEl.setAttribute('fill', d.H > 80 ? fill : 'url(#waterGradient)');
  }
}

// ===== FUZZY DECISION CANVAS =====
function drawFuzzyDecision(step) {
  const canvas = $('fuzzy-canvas');
  if (!canvas || !simData[step]) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const W = rect.width, H = rect.height;

  ctx.clearRect(0, 0, W, H);

  const d = simData[step];
  const agg = d.agg;
  const pad = { left: 45, right: 15, top: 20, bottom: 30 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  // Draw original MF shapes (faint)
  const origSets = [
    { fn: x => trapmf(x,0,0,10,25), color: 'rgba(147,197,253,0.2)' },
    { fn: x => trimf(x,10,25,45), color: 'rgba(96,165,250,0.2)' },
    { fn: x => trimf(x,25,45,65), color: 'rgba(59,130,246,0.2)' },
    { fn: x => trimf(x,45,65,85), color: 'rgba(249,115,22,0.2)' },
    { fn: x => trapmf(x,65,85,100,100), color: 'rgba(239,68,68,0.2)' },
  ];
  origSets.forEach(s => {
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const px = pad.left + (i / 100) * cW;
      const py = pad.top + (1 - s.fn(i)) * cH;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = s.color.replace('0.2', '0.45');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Aggregated fill
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + cH);
  for (let i = 0; i <= 100; i++) {
    const px = pad.left + (i / 100) * cW;
    const py = pad.top + (1 - agg[i]) * cH;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(pad.left + cW, pad.top + cH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, 'rgba(45,121,205,0.6)');
  grad.addColorStop(1, 'rgba(45,121,205,0.1)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#2d79cd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const px = pad.left + (i / 100) * cW;
    const py = pad.top + (1 - agg[i]) * cH;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();

  // COG line
  const cogX = pad.left + (d.gate / 100) * cW;
  ctx.beginPath();
  ctx.moveTo(cogX, pad.top);
  ctx.lineTo(cogX, pad.top + cH);
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // COG label
  ctx.fillStyle = '#e74c3c';
  ctx.font = "bold 11px 'Inter', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText(`COG: ${d.gate.toFixed(1)}%`, cogX, pad.top - 5);

  // Axes
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + cH);
  ctx.lineTo(pad.left + cW, pad.top + cH);
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#6b7280';
  ctx.font = "10px 'Inter', sans-serif";
  ctx.textAlign = 'center';
  for (let v = 0; v <= 100; v += 20) {
    const px = pad.left + (v / 100) * cW;
    ctx.fillText(v.toString(), px, pad.top + cH + 15);
  }
  ctx.textAlign = 'right';
  for (let v = 0; v <= 1; v += 0.25) {
    const py = pad.top + (1 - v) * cH;
    ctx.fillText(v.toFixed(2), pad.left - 5, py + 3);
  }
  ctx.save();
  ctx.translate(12, pad.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('μ', 0, 0);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillText('Gate Openness (%)', pad.left + cW / 2, pad.top + cH + 27);
}

// ===== RULE MATRIX HIGHLIGHTING =====
const RULE_MATRIX = [
  ['d1','d1','d1','d1','d2'],  // Low
  ['d1','d1','d2','d3','d4'],  // Mid
  ['d2','d3','d4','d4','d5'],  // High
  ['d3','d3','d4','d5','d5'],  // VH
  ['d5','d5','d5','d5','d5'],  // VVH
];
const H_LABELS = ['Low','Mid','High','VH','VVH'];
const DH_LABELS = ['NB','NS','Z','PS','PB'];

function updateRuleMatrix(step) {
  if (!simData[step]) return;
  const d = simData[step];
  const cells = document.querySelectorAll('.rule-table td:not(.row-header)');
  cells.forEach(c => c.classList.remove('active'));

  H_LABELS.forEach((hLabel, hi) => {
    DH_LABELS.forEach((dhLabel, di) => {
      const strength = Math.min(d.h[hLabel] || 0, d.dh[dhLabel] || 0);
      if (strength > 0.01) {
        const cellId = `rule-${hi}-${di}`;
        const cell = $(cellId);
        if (cell) {
          cell.classList.add('active');
          cell.title = `Strength: ${strength.toFixed(3)}`;
        }
      }
    });
  });
}

// ===== INLINE STATS =====
function updateStats(step) {
  if (!simData[step]) return;
  const d = simData[step];
  $('stat-rate-value').textContent = `${d.dH.toFixed(2)} m/hr`;
  $('stat-step-value').textContent = `${d.step}/${simData.length - 1} hr`;
}

// ===== MASTER UPDATE =====
function updateAll(step) {
  currentStep = step;
  updateStats(step);
  updateCharts(step);
  updateDamVisual(step);
  drawFuzzyDecision(step);
  updateRuleMatrix(step);
  $('step-scrubber').value = step;
}

// ===== RUN SIMULATION & SETUP =====
function runAndDisplay() {
  stopPlayback();

  // Sync slider labels to match actual input values (prevents mismatches due to browser caching on reload)
  if ($('initial-level-value')) $('initial-level-value').textContent = $('initial-level').value + ' m';
  if ($('sim-steps-value')) $('sim-steps-value').textContent = $('sim-steps').value;
  if ($('inflow-rate-value')) $('inflow-rate-value').textContent = parseFloat($('inflow-rate').value).toFixed(2) + ' m/hr';
  if ($('sim-speed-value')) $('sim-speed-value').textContent = $('sim-speed').value + 'x';

  const steps = parseInt($('sim-steps').value);
  const initialH = parseFloat($('initial-level').value);
  const inflow = parseFloat($('inflow-rate').value);

  simData = runSimulation(steps, initialH, inflow);
  $('step-scrubber').max = simData.length - 1;
  $('step-scrubber').value = 0;
  currentStep = 0;

  // Track the parameters of the current simulation run
  lastSteps = steps;
  lastInitialH = initialH;
  lastInflow = inflow;

  updateAll(0);
}

function checkAndRunIfParamsChanged() {
  const steps = parseInt($('sim-steps').value);
  const initialH = parseFloat($('initial-level').value);
  const inflow = parseFloat($('inflow-rate').value);
  if (steps !== lastSteps || initialH !== lastInitialH || inflow !== lastInflow) {
    runAndDisplay();
  }
}

// ===== PLAYBACK =====
function startPlayback() {
  if (isPlaying) return;
  checkAndRunIfParamsChanged();
  if (currentStep >= simData.length - 1) currentStep = 0;
  isPlaying = true;
  $('play-icon').style.display = 'none';
  $('pause-icon').style.display = 'block';
  const speed = parseInt($('sim-speed').value);
  const interval = Math.max(50, 600 - speed * 55);
  playInterval = setInterval(() => {
    if (currentStep >= simData.length - 1) { stopPlayback(); return; }
    currentStep++;
    updateAll(currentStep);
  }, interval);
}

function stopPlayback() {
  isPlaying = false;
  clearInterval(playInterval);
  $('play-icon').style.display = 'block';
  $('pause-icon').style.display = 'none';
}

function togglePlayback() {
  isPlaying ? stopPlayback() : startPlayback();
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Sliders display
  $('initial-level').addEventListener('input', e => $('initial-level-value').textContent = e.target.value + ' m');
  $('sim-steps').addEventListener('input', e => $('sim-steps-value').textContent = e.target.value);
  $('inflow-rate').addEventListener('input', e => $('inflow-rate-value').textContent = parseFloat(e.target.value).toFixed(2) + ' m/hr');
  $('sim-speed').addEventListener('input', e => {
    $('sim-speed-value').textContent = e.target.value + 'x';
    if (isPlaying) { stopPlayback(); startPlayback(); }
  });

  // Buttons
  $('btn-play').addEventListener('click', togglePlayback);
  $('btn-reset').addEventListener('click', runAndDisplay);
  $('btn-step-back').addEventListener('click', () => {
    checkAndRunIfParamsChanged();
    if (currentStep > 0) updateAll(currentStep - 1);
  });
  $('btn-step-forward').addEventListener('click', () => {
    checkAndRunIfParamsChanged();
    if (currentStep < simData.length - 1) updateAll(currentStep + 1);
  });
  $('btn-run-all').addEventListener('click', () => {
    stopPlayback();
    checkAndRunIfParamsChanged();
    updateAll(simData.length - 1);
  });

  // Step scrubber
  $('step-scrubber').addEventListener('input', e => {
    stopPlayback();
    checkAndRunIfParamsChanged();
    updateAll(parseInt(e.target.value));
  });

  // Param changes only update the labels, not running the simulation
  ['initial-level', 'sim-steps', 'inflow-rate'].forEach(id => {
    $(id).addEventListener('change', () => {
      if (id === 'initial-level') $('initial-level-value').textContent = $(id).value + ' m';
      if (id === 'sim-steps') $('sim-steps-value').textContent = $(id).value;
      if (id === 'inflow-rate') $('inflow-rate-value').textContent = parseFloat($(id).value).toFixed(2) + ' m/hr';
    });
  });

  // Resize fuzzy canvas
  window.addEventListener('resize', () => drawFuzzyDecision(currentStep));
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  setupEventListeners();
  runAndDisplay();
});
