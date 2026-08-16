/* 봇 상태 대시보드 — data.json 을 읽어 렌더링. 봇 코드와 분리된 정적 사이트.
   data.json 은 (1) 봇이 주기적으로 export 하거나 (2) 서버 API로 대체 가능. */
var POLL_MS = 30000;
var REG_NAMES = ['강하락', '중하락', '약하락', '약상승', '중상승', '강상승'];
var BAND = ['#d64545', '#e8875a', '#eac86b', '#bcd977', '#7cc46e', '#3f9e56']; // 강하락→강상승 발산 팔레트
document.getElementById('poll').textContent = Math.round(POLL_MS / 1000);

// 국면 히스토리 차트: BTC 로그 가격선 + 국면 밴드 배경 (첨부 이미지 하단 방식)
function renderRegimeChart(hist) {
  var el = document.getElementById('reg-chart'), ax = document.getElementById('reg-axis');
  if (!hist || !hist.length) { el.innerHTML = ''; ax.innerHTML = ''; return; }
  var W = 1000, H = 200, n = hist.length;
  var ls = hist.map(function (h) { return Math.log(h.price); });
  var lo = Math.min.apply(null, ls), hi = Math.max.apply(null, ls);
  var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  function X(i) { return n < 2 ? 0 : i / (n - 1) * W; }
  function Y(lp) { return H - (lp - lo) / (hi - lo) * H; }
  var step = n < 2 ? W : W / (n - 1);
  var bands = '', i = 0;
  while (i < n) {                                   // 연속 동일 레벨 병합
    var j = i; while (j + 1 < n && hist[j + 1].level === hist[i].level) j++;
    var x0 = Math.max(0, X(i) - step / 2), x1 = Math.min(W, X(j) + step / 2);
    bands += '<rect x="' + x0.toFixed(1) + '" y="0" width="' + (x1 - x0).toFixed(1) + '" height="' + H + '" fill="' + BAND[hist[i].level] + '" opacity="0.5"/>';
    i = j + 1;
  }
  var pts = ''; for (var k = 0; k < n; k++) pts += X(k).toFixed(1) + ',' + Y(ls[k]).toFixed(1) + ' ';
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" width="100%" height="200">' +
    bands + '<polyline points="' + pts.trim() + '" fill="none" stroke="var(--text)" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  ax.innerHTML = '';
  for (var t = 0; t < 5; t++) {
    var d = new Date(hist[Math.round(t / 4 * (n - 1))].ts);
    ax.innerHTML += '<span>' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '</span>';
  }
}

// ── 국면 = 실제 BTC 일봉으로 실시간 계산 (브라우저에서 Binance 직접 호출) ──
var liveRegime = null;
function regimeLevel(m) { if (m == null) return 3; if (m <= -0.10) return 0; if (m <= -0.04) return 1; if (m < 0) return 2; if (m < 0.04) return 3; if (m < 0.10) return 4; return 5; }
function computeRegime(klines) {
  var pts = klines.map(function (k) { return { ts: k[0], price: parseFloat(k[4]) }; });
  var n = pts.length, mom = new Array(n).fill(null);
  for (var i = 0; i < n; i++) if (i >= 7) mom[i] = pts[i].price / pts[i - 7].price - 1;
  var a = 2 / 4, prev = null, ema = new Array(n).fill(null);
  for (var i = 0; i < n; i++) { if (mom[i] == null) continue; prev = prev == null ? mom[i] : a * mom[i] + (1 - a) * prev; ema[i] = prev; }
  var history = pts.map(function (p, i) { return { ts: p.ts, price: p.price, level: regimeLevel(ema[i]) }; });
  var cur = regimeLevel(ema[n - 1]);
  return { history: history, regime: { level: cur, name: REG_NAMES[cur], mom: Math.round((ema[n - 1] || 0) * 1000) / 10, meta: '7일 모멘텀·EMA3 · 실 BTC 일봉 (실시간)', live: true } };
}
function refreshLive() {
  var urls = ['https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=365',
              'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365',
              'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365'];
  var i = 0;
  function attempt() {
    if (i >= urls.length) return;
    fetch(urls[i]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (k) { liveRegime = computeRegime(k); renderRegime(liveRegime.regime, liveRegime.history); })
      .catch(function () { i++; attempt(); });
  }
  attempt();
}

function renderRegime(r, history) {
  document.getElementById('reg-name').textContent = r ? r.name : '데이터 없음';
  document.getElementById('reg-mom').textContent = r && r.mom != null ? ('모멘텀 ' + (r.mom > 0 ? '+' : '') + r.mom + '%') : '';
  document.getElementById('reg-meta').textContent = r && r.meta ? r.meta : (r ? '' : '미가동');
  document.getElementById('reg-asof').textContent = r ? '기준: ' + new Date().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  document.getElementById('k-reg').innerHTML = r ? esc(r.name) + ' <small>Lv ' + r.level + '</small>' : '–';
  renderRegimeChart(history);
  var sc = document.getElementById('reg-scale'); sc.innerHTML = '';
  for (var i = 0; i < 6; i++) {                     // 6단계 미터 = 차트 범례(색 일치)
    var on = r && r.level === i;
    var st = on ? 'background:' + BAND[i] + ';border-color:' + BAND[i] + ';' : 'background:' + BAND[i] + '2e;';
    var tc = on ? 'color:#fff;' : '';
    sc.innerHTML += '<div class="seg' + (on ? ' on' : '') + '" style="' + st + '">' +
      '<div class="lv" style="' + tc + '">Lv ' + i + '</div>' +
      '<div class="nm" style="' + (on ? 'color:#fff;font-weight:680;' : '') + '">' + REG_NAMES[i] + '</div></div>';
  }
}

function usd(n, d) { if (n == null || isNaN(n)) return '–'; return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
function signed(n, d) { if (n == null || isNaN(n)) return '–'; var neg = n < 0; return (neg ? '-' : '+') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
function mm(n) { if (n == null || isNaN(n)) return '–'; return '$' + (n / 1e6).toFixed(1) + 'M'; }
function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : s); return d.innerHTML; }
function tago(ts) { if (!ts) return ''; var s = (Date.now() - ts) / 1000; if (s < 60) return Math.floor(s) + '초 전'; if (s < 3600) return Math.floor(s / 60) + '분 전'; if (s < 86400) return Math.floor(s / 3600) + '시간 전'; return Math.floor(s / 86400) + '일 전'; }
function hhmm(ts) { if (!ts) return ''; return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); }
function dt(ts) { if (!ts) return ''; var d = new Date(ts), p = function (n) { return String(n).padStart(2, '0'); }; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
function dirKo(d) { return d === 'long' ? '롱' : d === 'short' ? '숏' : (d || ''); }
function hs(a) { return 'https://hypurrscan.io/address/' + a; }
function wlink(addr, label) { if (!addr) return ''; var sh = addr.length > 12 ? addr.slice(0, 6) + '…' + addr.slice(-4) : addr; return '<a class="wlink" href="' + hs(addr) + '" target="_blank" rel="noopener">' + (label || '') + sh + ' 🔗</a>'; }
function sideCls(s) { return s === 'buy' ? 'buy' : s === 'sell' ? 'sell' : 'flat'; }
function coinOf(sym) { return (sym || '').replace('USDT', ''); }

var lastState = { positions: [], completed: [], live: false };
var botTrades = null;    // 롱+숏 계정 온체인 실거래 {positions, completed}
var mainTrades = null;   // 메인 계정 온체인 실거래
var tradfiTrades = null; // TradFi 계정 온체인 실거래
var stockTrades = null;  // 한국주식 봇 (stocks.json export)
var acctBal = {};       // 계정별 잔고 (name → 금액)
function won(n) { return (n == null || isNaN(n)) ? '–' : '₩' + Math.round(n).toLocaleString('en-US'); }
function wonS(n) { if (n == null || isNaN(n)) return '–'; var neg = n < 0; return (neg ? '-' : '+') + '₩' + Math.abs(Math.round(n)).toLocaleString('en-US'); }
function effPos() { return botTrades ? botTrades.positions : (lastState.positions || []); }
function effComp() { return botTrades ? botTrades.completed : (lastState.completed || []); }

function render(s) {
  s.positions = s.positions || []; s.completed = s.completed || []; s.whales = s.whales || [];
  lastState = s;

  // 상태 pill
  var mp = document.getElementById('mode'), mt = document.getElementById('mode-t');
  if (s.live || botTrades) { mp.className = 'pill live'; mt.textContent = '라이브 · 실거래'; }
  else { mp.className = 'pill off'; mt.textContent = '관찰 모드'; }
  document.getElementById('upd').textContent = '갱신 ' + new Date(s.updated_ts || Date.now()).toLocaleTimeString('ko-KR') + ' KST';

  // 국면 — 실시간(Binance) 우선, 아직 못 받았으면 data.json 폴백
  var reg = liveRegime || { regime: s.regime, history: s.history };
  renderRegime(reg.regime, reg.history);

  renderTrades();
  renderMain();
  renderTradfi();
  renderStocks();

}

// ── 포지션 카드 · 완료 행 (봇 시그널·메인 공용) ──
function posCardHtml(p) {
  var up = (p.upnl || 0) >= 0, acctLabel = p.acct ? p.acct + '계정 ' : '계정 ';
  return '<div class="pos"><div class="top">' +
    '<span class="strat">' + esc(coinOf(p.symbol)) + '</span>' +
    '<span class="dir ' + (p.direction === 'long' ? 'long' : 'short') + '">' + dirKo(p.direction) + '</span>' +
    '<span class="upnl ' + (up ? 'pos-v' : 'neg-v') + '">' + signed(p.upnl, 0) + (p.upnl_pct != null ? ' (' + (p.upnl_pct >= 0 ? '+' : '') + p.upnl_pct + '%)' : '') + '</span></div>' +
    '<div class="nums">진입 <b>' + usd(p.entry_price, 1) + '</b> · 현재 <b>' + usd(p.mark, 1) + '</b> · ' +
    'TP <b>' + usd(p.tp_price, 1) + '</b> · SL <b>' + usd(p.sl_price, 1) + '</b> · 규모 <b>' + usd(p.notional, 0) + '</b> · ' + wlink(p.wallet, acctLabel) + '</div></div>';
}
function compRowHtml(c) {
  var win = (c.pnl_usd || 0) > 0;
  return '<div class="row done-row"><div>' +
    '<span class="dir ' + (c.direction === 'long' ? 'long' : 'short') + '" style="margin-right:6px">' + dirKo(c.direction) + '</span>' +
    '<span class="sym">' + esc(coinOf(c.symbol)) + '</span> ' +
    '<span class="acct">진입 ' + usd(c.entry_price, 1) + ' → 청산 ' + usd(c.exit_px, 1) + ' · ' + dt(c.close_ts) + '</span></div>' +
    '<span class="result ' + (win ? 'tp' : 'sl') + '">' + esc(c.reason || (win ? 'TP' : 'SL')) + '</span>' +
    '<span class="pnl ' + (win ? 'pos-v' : 'neg-v') + '">' + signed(c.pnl_usd, 0) + '</span></div>';
}
function renderList(posId, compId, headId, positions, completed) {
  document.getElementById(headId).textContent = '진행중 (' + positions.length + ')';
  document.getElementById(posId).innerHTML = !positions.length ? '<div class="empty">진행중 포지션 없음</div>' : positions.map(posCardHtml).join('');
  document.getElementById(compId).innerHTML = !completed.length ? '<div class="empty">완료된 거래 없음</div>' : completed.slice(0, 30).map(compRowHtml).join('');
}

// ── 봇 시그널 거래 (롱+숏) + 상단 KPI ──
function renderTrades() {
  var positions = effPos(), completed = effComp();
  document.getElementById('k-pos').innerHTML = positions.length + '<small>개</small>';
  var w = 0, l = 0, realized = 0;
  completed.forEach(function (c) { var p = c.pnl_usd || 0; p > 0 ? w++ : l++; realized += p; });
  document.getElementById('k-wl').innerHTML = w + '<small>승</small> · ' + l + '<small>패</small>';
  var kr = document.getElementById('k-realized'); kr.className = 'val ' + (realized >= 0 ? 'pos' : 'neg'); kr.textContent = signed(realized, 2);
  var upnl = 0; positions.forEach(function (p) { upnl += (p.upnl || 0); });
  var ke = document.getElementById('k-upnl'); ke.className = 'val ' + (upnl >= 0 ? 'pos' : 'neg'); ke.textContent = signed(upnl, 2);
  document.getElementById('sig-meta').textContent = botTrades
    ? '롱 잔고 ' + usd(acctBal['롱'] || 0, 0) + ' · 숏 잔고 ' + usd(acctBal['숏'] || 0, 0)
    : (lastState.live ? '실거래' : '관찰 모드');
  renderList('positions', 'completed', 'pos-h', positions, completed);
}

// ── 메인 계정 거래 (전체 코인) + 계정 요약 ──
function renderMain() {
  if (!mainTrades) return;
  var positions = mainTrades.positions, completed = mainTrades.completed;
  document.getElementById('main-meta').textContent = '잔고 ' + usd(acctBal['메인'] || 0, 0) + ' · 0xfe65…1EAE';
  var w = 0, l = 0, realized = 0;
  completed.forEach(function (c) { var p = c.pnl_usd || 0; p > 0 ? w++ : l++; realized += p; });
  var upnl = 0; positions.forEach(function (p) { upnl += (p.upnl || 0); });
  document.getElementById('main-stats').innerHTML =
    '<b>' + w + '</b>승 · <b>' + l + '</b>패 · 총 PNL <b class="' + (realized >= 0 ? 'up' : 'down') + '">' + signed(realized, 0) + '</b>' +
    ' · 미실현 <b class="' + (upnl >= 0 ? 'up' : 'down') + '">' + signed(upnl, 0) + '</b>';
  renderList('main-positions', 'main-completed', 'main-pos-h', positions, completed);
}

// ── TradFi 계정 거래 (뉴스 자동매매) ──
function renderTradfi() {
  if (!tradfiTrades) return;
  var positions = tradfiTrades.positions, completed = tradfiTrades.completed;
  document.getElementById('tradfi-meta').textContent = '잔고 ' + usd(acctBal['TradFi'] || 0, 0) + ' · 0x0d48…1a80';
  var w = 0, l = 0, realized = 0;
  completed.forEach(function (c) { var p = c.pnl_usd || 0; p > 0 ? w++ : l++; realized += p; });
  var upnl = 0; positions.forEach(function (p) { upnl += (p.upnl || 0); });
  document.getElementById('tradfi-stats').innerHTML =
    '<b>' + w + '</b>승 · <b>' + l + '</b>패 · 총 PNL <b class="' + (realized >= 0 ? 'up' : 'down') + '">' + signed(realized, 0) + '</b>' +
    ' · 미실현 <b class="' + (upnl >= 0 ? 'up' : 'down') + '">' + signed(upnl, 0) + '</b>';
  renderList('tradfi-positions', 'tradfi-completed', 'tradfi-pos-h', positions, completed);
}

// ── 한국주식 봇 (stocks.json export — 온체인 아님, 봇이 내보낸 파일을 읽음) ──
function fetchStocks() {
  fetch('stocks.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      var positions = (d.positions || []).map(function (p) {
        return {
          symbol: p.symbol || p.code, code: p.code, direction: p.direction || 'long',
          entry_price: p.entry_price, mark: p.mark, notional: p.notional, qty: p.qty,
          upnl: p.upnl || 0, upnl_pct: p.upnl_pct, leverage: null, wallet: null, acct: '주식'
        };
      });
      var completed = (d.completed || []).map(function (c) {
        return {
          close_ts: c.close_ts, entry_ts: c.entry_ts || null, symbol: c.symbol || c.code, code: c.code,
          direction: c.direction || 'long', entry_price: c.entry_price, exit_px: c.exit_px,
          pnl_usd: (c.pnl_krw != null ? c.pnl_krw : (c.pnl || 0)), reason: c.reason || ((c.pnl_krw || 0) > 0 ? '익절' : '손절'), acct: '주식'
        };
      }).sort(function (a, b) { return b.close_ts - a.close_ts; });
      stockTrades = { positions: positions, completed: completed, balance: d.balance || 0 };
      acctBal['주식'] = d.balance || 0;
      renderStocks();
      if (window.renderPerf) window.renderPerf();
    })
    .catch(function () { /* stocks.json 미존재 → 대기 */ });
}
function renderStocks() {
  if (!stockTrades) return;
  var positions = stockTrades.positions, completed = stockTrades.completed;
  document.getElementById('stocks-meta').textContent = '잔고 ' + won(acctBal['주식'] || 0) + ' · 한국주식';
  var w = 0, l = 0, realized = 0;
  completed.forEach(function (c) { var p = c.pnl_usd || 0; p > 0 ? w++ : l++; realized += p; });
  var upnl = 0; positions.forEach(function (p) { upnl += (p.upnl || 0); });
  document.getElementById('stocks-stats').innerHTML =
    '<b>' + w + '</b>승 · <b>' + l + '</b>패 · 총 PNL <b class="' + (realized >= 0 ? 'up' : 'down') + '">' + wonS(realized) + '</b>' +
    ' · 미실현 <b class="' + (upnl >= 0 ? 'up' : 'down') + '">' + wonS(upnl) + '</b>';
  document.getElementById('stocks-pos-h').textContent = '보유중 (' + positions.length + ')';
  document.getElementById('stocks-positions').innerHTML = !positions.length ? '<div class="empty">보유 종목 없음</div>' : positions.map(function (p) {
    var up = (p.upnl || 0) >= 0;
    return '<div class="pos"><div class="top"><span class="strat">' + esc(p.symbol) + '</span>' +
      (p.code ? '<span class="tag">' + esc(p.code) + '</span>' : '') +
      '<span class="upnl ' + (up ? 'pos-v' : 'neg-v') + '">' + wonS(p.upnl) + (p.upnl_pct != null ? ' (' + (p.upnl_pct >= 0 ? '+' : '') + p.upnl_pct + '%)' : '') + '</span></div>' +
      '<div class="nums">' + (p.qty != null ? '수량 <b>' + p.qty + '</b> · ' : '') + '매입 <b>' + won(p.entry_price) + '</b> · 현재 <b>' + won(p.mark) + '</b> · 평가 <b>' + won(p.notional) + '</b></div></div>';
  }).join('');
  document.getElementById('stocks-completed').innerHTML = !completed.length ? '<div class="empty">매도 내역 없음</div>' : completed.slice(0, 30).map(function (c) {
    var win = (c.pnl_usd || 0) > 0;
    return '<div class="row done-row"><div><span class="sym">' + esc(c.symbol) + '</span> ' +
      '<span class="acct">' + (c.code ? esc(c.code) + ' · ' : '') + '매도 · ' + hhmm(c.close_ts) + '</span></div>' +
      '<span class="result ' + (win ? 'tp' : 'sl') + '">' + esc(c.reason) + '</span>' +
      '<span class="pnl ' + (win ? 'pos-v' : 'neg-v') + '">' + wonS(c.pnl_usd) + '</span></div>';
  }).join('');
}

// ── 봇 계정 3개를 HL 온체인으로 직접 조회 (롱/숏/메인) ──
var ACCTS = {
  long:   { addr: '0xaca1f2524a6c3a75511a44cc7c437bcfd9350afb', name: '롱' },
  short:  { addr: '0xfee8c8b02fd5c0f8034ce41e04a0d135c3f919bf', name: '숏' },
  main:   { addr: '0xfe65E38Ffe08d8a2888E1467E1ABAfd9F2921EAE', name: '메인' },
  tradfi: { addr: '0x0d48933fd842901b1d7a67475c436fe655421a80', name: 'TradFi' }
};
function hlPost(body) {
  return fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
}
function fetchAccount(a) {
  return Promise.all([
    hlPost({ type: 'clearinghouseState', user: a.addr }),
    hlPost({ type: 'frontendOpenOrders', user: a.addr }),
    hlPost({ type: 'userFills', user: a.addr }),
    hlPost({ type: 'spotClearinghouseState', user: a.addr })   // SPOT 잔고
  ]).then(function (res) {
    var st = res[0] || {}, orders = Array.isArray(res[1]) ? res[1] : [], fills = Array.isArray(res[2]) ? res[2] : [];
    // SPOT 잔고 (USDC)
    var bals = (res[3] && res[3].balances) || [], usdc = 0;
    bals.forEach(function (b) { if (b.coin === 'USDC') usdc = parseFloat(b.total || 0); });
    acctBal[a.name] = usdc;
    var positions = [];
    (st.assetPositions || []).forEach(function (ap) {
      var p = ap.position || {}, coin = p.coin, szi = parseFloat(p.szi);
      if (!szi) return;
      var entry = parseFloat(p.entryPx), size = Math.abs(szi), isLong = szi > 0;
      var notional = parseFloat(p.positionValue || 0), mark = size ? notional / size : entry;
      var tp = null, sl = null;
      orders.forEach(function (o) {
        if (o.coin !== coin) return; var px = parseFloat(o.triggerPx || o.limitPx || 0); if (!px) return;
        if (isLong) { if (px > entry) tp = px; else if (px < entry) sl = px; }
        else { if (px < entry) tp = px; else if (px > entry) sl = px; }
      });
      positions.push({
        symbol: coin, signal: '', direction: isLong ? 'long' : 'short', entry_price: entry, mark: mark,
        tp_price: tp, sl_price: sl, notional: notional, upnl: parseFloat(p.unrealizedPnl || 0),
        upnl_pct: entry ? Math.round((mark - entry) / entry * (isLong ? 1 : -1) * 1000) / 10 : 0,
        leverage: (p.leverage && p.leverage.value) || null, wallet: a.addr, acct: a.name
      });
    });
    // 진입시각 재구성: 체결을 시간순으로 훑어 '포지션 오픈(0→보유)' 시각을 기록해 청산 체결에 매핑.
    var segEntry = {};
    try {
      var openTs = {};
      fills.slice().sort(function (a, b) { return (a.time || 0) - (b.time || 0); }).forEach(function (f) {
        var coin = f.coin, dir = f.dir || '', sz = parseFloat(f.sz) || 0, t = parseInt(f.time) || 0, sp = parseFloat(f.startPosition || 0);
        if (!coin || !dir) return;
        if (dir.indexOf('>') >= 0) { segEntry[coin + '|' + t] = (openTs[coin] != null ? openTs[coin] : null); openTs[coin] = t; return; }   // 플립: 청산+반대오픈
        if (dir.indexOf('Open') === 0) { if (openTs[coin] == null) openTs[coin] = t; }   // 새 포지션 오픈 시각(스케일링은 첫 오픈 유지)
        else if (dir.indexOf('Close') === 0) {
          segEntry[coin + '|' + t] = (openTs[coin] != null ? openTs[coin] : null);        // 부분청산 포함 모든 청산에 진입시각 부여
          var after = sp + (dir === 'Close Short' ? sz : -sz);
          if (Math.abs(after) < Math.max(1e-6, Math.abs(sp) * 0.02)) openTs[coin] = null;  // 완전 청산 → 리셋
        }
      });
    } catch (e) { segEntry = {}; }
    // 완료 거래 = Close 체결을 '오더(oid)' 단위로 묶음. 청산가=체결 가중평균, 진입가=closedPnl로 역산.
    var g = {};
    fills.forEach(function (f) {
      var dir = f.dir || ''; if (dir.indexOf('Close') !== 0) return;
      var k = g[f.oid] || (g[f.oid] = { coin: f.coin, dir: dir, ts: 0, pnl: 0, sz: 0, pxsz: 0 });
      var sz = parseFloat(f.sz) || 0, px = parseFloat(f.px) || 0;
      k.ts = Math.max(k.ts, parseInt(f.time)); k.pnl += parseFloat(f.closedPnl || 0); k.sz += sz; k.pxsz += px * sz;
    });
    var completed = Object.keys(g).map(function (o) {
      var k = g[o], isLong = k.dir.indexOf('Long') >= 0, exit = k.sz ? k.pxsz / k.sz : 0;
      var entry = k.sz ? (isLong ? exit - k.pnl / k.sz : exit + k.pnl / k.sz) : 0;   // pnl=(exit-entry)*sz (롱)
      var et = segEntry[k.coin + '|' + k.ts];
      return { close_ts: k.ts, entry_ts: (et != null ? et : null), symbol: k.coin, direction: isLong ? 'long' : 'short', entry_price: entry, exit_px: exit, pnl_usd: k.pnl, reason: k.pnl > 0 ? 'TP' : 'SL', acct: a.name };
    });
    return { positions: positions, completed: completed, balance: usdc };
  }).catch(function () { return { positions: [], completed: [], balance: 0 }; });
}
function refreshBotTrades() {
  // 봇 시그널 = 롱 + 숏 계정
  Promise.all([fetchAccount(ACCTS.long), fetchAccount(ACCTS.short)]).then(function (r) {
    botTrades = {
      positions: r[0].positions.concat(r[1].positions),
      completed: r[0].completed.concat(r[1].completed).sort(function (a, b) { return b.close_ts - a.close_ts; })
    };
    renderTrades();
    var mp = document.getElementById('mode'), mt = document.getElementById('mode-t');
    mp.className = 'pill live'; mt.textContent = '라이브 · 실거래';
  });
  // 메인 계정
  fetchAccount(ACCTS.main).then(function (m) {
    mainTrades = { positions: m.positions, completed: m.completed.sort(function (a, b) { return b.close_ts - a.close_ts; }) };
    renderMain();
  });
  // TradFi 계정
  fetchAccount(ACCTS.tradfi).then(function (t) {
    tradfiTrades = { positions: t.positions, completed: t.completed.sort(function (a, b) { return b.close_ts - a.close_ts; }) };
    renderTradfi();
  });
}

function tick() {
  fetch('data.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function (e) { document.getElementById('upd').textContent = 'data.json 로드 실패 — ' + e.message; });
}
tick();
setInterval(tick, POLL_MS);

refreshLive();                       // 국면 차트: 실제 BTC 일봉 실시간
setInterval(refreshLive, 600000);    // 10분마다 갱신
refreshBotTrades();                  // 봇 시그널: HL 계정 온체인 실거래
setInterval(refreshBotTrades, 30000);
fetchStocks();                       // 한국주식: stocks.json (봇 export)
setInterval(fetchStocks, 30000);
