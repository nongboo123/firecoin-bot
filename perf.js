/* 퍼포먼스 분석 뷰 — app.js 전역(botTrades/mainTrades/acctBal/liveRegime/usd/signed) 재사용.
   HL 온체인 완료 거래로 성과지표·차트 계산. 정적, 인라인 SVG. */
(function () {
  'use strict';
  var currentView = 'live', perfScope = 'bot', perfPeriod = 30;

  // ── 통화 인식 포매터: 주식 스코프면 ₩, 아니면 전역 $ 포매터로 위임 (섀도잉) ──
  var Gusd = window.usd, Gsigned = window.signed;
  function usd(n, d) { if (perfScope === 'stocks') return (n == null || isNaN(n)) ? '–' : '₩' + Math.round(n).toLocaleString('en-US'); return Gusd(n, d); }
  function signed(n, d) { if (perfScope === 'stocks') { if (n == null || isNaN(n)) return '–'; var neg = n < 0; return (neg ? '-' : '+') + '₩' + Math.abs(Math.round(n)).toLocaleString('en-US'); } return Gsigned(n, d); }

  // ── 유틸 ──
  function C(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888'; }
  function pct(n, d) { if (n == null || isNaN(n)) return '–'; return (n >= 0 ? '+' : '') + n.toFixed(d == null ? 1 : d) + '%'; }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function mdKey(ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function money(n, d) { return (typeof signed === 'function') ? signed(n, d) : (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(d || 0); }
  function esc2(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : s); return d.innerHTML; }

  function perfData() {
    if (perfScope === 'main') {
      var mt = (typeof mainTrades !== 'undefined' && mainTrades) ? mainTrades : { positions: [], completed: [] };
      return { completed: mt.completed || [], positions: mt.positions || [], balance: (acctBal['메인'] || 0), label: '메인 계정' };
    }
    if (perfScope === 'tradfi') {
      var tt = (typeof tradfiTrades !== 'undefined' && tradfiTrades) ? tradfiTrades : { positions: [], completed: [] };
      return { completed: tt.completed || [], positions: tt.positions || [], balance: (acctBal['TradFi'] || 0), label: 'TradFi 계정' };
    }
    if (perfScope === 'stocks') {
      var sk = (typeof stockTrades !== 'undefined' && stockTrades) ? stockTrades : { positions: [], completed: [] };
      return { completed: sk.completed || [], positions: sk.positions || [], balance: (acctBal['주식'] || 0), label: '한국주식' };
    }
    var bt = (typeof botTrades !== 'undefined' && botTrades) ? botTrades : { positions: [], completed: [] };
    return { completed: bt.completed || [], positions: bt.positions || [], balance: (acctBal['롱'] || 0) + (acctBal['숏'] || 0), label: '봇 (롱+숏)' };
  }

  // ── 지표 계산 ──
  function computePerf(d) {
    var comp = (d.completed || []).slice().sort(function (a, b) { return a.close_ts - b.close_ts; });
    var totalPnl = 0, gp = 0, gl = 0, wins = 0, losses = 0, cum = 0, cumSeries = [];
    comp.forEach(function (c) { var p = c.pnl_usd || 0; totalPnl += p; if (p > 0) { gp += p; wins++; } else if (p < 0) { gl += -p; losses++; } cum += p; cumSeries.push({ ts: c.close_ts, cum: cum }); });
    var dayMap = {}; comp.forEach(function (c) { var k = dayKey(c.close_ts); dayMap[k] = (dayMap[k] || 0) + (c.pnl_usd || 0); });
    var days = Object.keys(dayMap).sort();
    var dailyArr = days.map(function (k) { return { day: k, pnl: dayMap[k] }; });
    var tradingDays = days.length;
    var winDays = dailyArr.filter(function (x) { return x.pnl > 0; }).length;
    var lossDays = dailyArr.filter(function (x) { return x.pnl < 0; }).length;
    var bestDay = dailyArr.reduce(function (m, x) { return x.pnl > m ? x.pnl : m; }, -Infinity);
    var worstDay = dailyArr.reduce(function (m, x) { return x.pnl < m ? x.pnl : m; }, Infinity);
    if (!isFinite(bestDay)) bestDay = 0; if (!isFinite(worstDay)) worstDay = 0;
    var avgDaily = tradingDays ? totalPnl / tradingDays : 0;
    var winRate = (wins + losses) ? wins / (wins + losses) : 0;
    var pf = gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0);
    var upnl = (d.positions || []).reduce(function (s, p) { return s + (p.upnl || 0); }, 0);
    var estCap = d.balance - totalPnl; if (!(estCap > 100)) estCap = d.balance > 100 ? d.balance : 1000;
    var returnPct = estCap ? totalPnl / estCap * 100 : 0;
    var peak = 0, mdd = 0; cumSeries.forEach(function (p) { if (p.cum > peak) peak = p.cum; var dd = peak - p.cum; if (dd > mdd) mdd = dd; });
    var curDD = peak - cum;
    var rets = dailyArr.map(function (x) { return x.pnl / estCap; });
    var mean = rets.length ? rets.reduce(function (a, b) { return a + b; }, 0) / rets.length : 0;
    var variance = rets.length > 1 ? rets.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (rets.length - 1) : 0;
    var sd = Math.sqrt(variance);
    var sharpe = sd > 0 ? mean / sd * Math.sqrt(365) : 0;
    var vol = sd * Math.sqrt(365) * 100;
    var srt = rets.slice().sort(function (a, b) { return a - b; });
    var var95 = srt.length ? srt[Math.floor(0.05 * srt.length)] * 100 : 0;
    var maxWinS = 0, maxLossS = 0, cw = 0, cl = 0;
    dailyArr.forEach(function (x) { if (x.pnl > 0) { cw++; cl = 0; } else if (x.pnl < 0) { cl++; cw = 0; } else { cw = 0; cl = 0; } if (cw > maxWinS) maxWinS = cw; if (cl > maxLossS) maxLossS = cl; });
    var tW = 0, tcw = 0; comp.forEach(function (c) { if ((c.pnl_usd || 0) > 0) { tcw++; if (tcw > tW) tW = tcw; } else tcw = 0; });
    var notional = (d.positions || []).reduce(function (s, p) { return s + Math.abs(p.notional || 0); }, 0);
    var tradeRets = comp.map(function (c) { var e = c.entry_price, x = c.exit_px; if (!e) return 0; return (x - e) / e * (c.direction === 'long' ? 1 : -1) * 100; });
    var avgTradeRet = tradeRets.length ? tradeRets.reduce(function (a, b) { return a + b; }, 0) / tradeRets.length : 0;
    var bestTradeRet = tradeRets.length ? Math.max.apply(null, tradeRets) : 0;
    var worstTradeRet = tradeRets.length ? Math.min.apply(null, tradeRets) : 0;
    return {
      avgTradeRet: avgTradeRet, bestTradeRet: bestTradeRet, worstTradeRet: worstTradeRet, positions: d.positions || [],
      n: comp.length, totalPnl: totalPnl, returnPct: returnPct, estCap: estCap, upnl: upnl, balance: d.balance,
      tradingDays: tradingDays, winRate: winRate, wins: wins, losses: losses, pf: pf, bestDay: bestDay, worstDay: worstDay,
      avgDaily: avgDaily, gp: gp, gl: gl, avgWin: wins ? gp / wins : 0, avgLoss: losses ? gl / losses : 0,
      winDays: winDays, lossDays: lossDays, mdd: mdd, mddPct: estCap ? mdd / estCap * 100 : 0, curDD: curDD, curDDPct: estCap ? curDD / estCap * 100 : 0,
      sharpe: sharpe, vol: vol, var95: var95, maxWinS: maxWinS, maxLossS: maxLossS, tW: tW, notional: notional, exposurePct: d.balance ? notional / d.balance * 100 : 0,
      cumSeries: cumSeries, dailyArr: dailyArr, dayMap: dayMap, comp: comp,
      t0: comp.length ? comp[0].close_ts : 0, t1: comp.length ? comp[comp.length - 1].close_ts : 0
    };
  }

  function kpi(lab, valHtml, sub, subcls) {
    return '<div class="kpi"><div class="lab">' + lab + '</div><div class="val">' + valHtml + '</div>' +
      (sub ? '<div class="sub2 ' + (subcls || '') + '">' + sub + '</div>' : '') + '</div>';
  }
  function colVal(n, d) { return '<span style="color:' + (n >= 0 ? 'var(--up)' : 'var(--down)') + '">' + money(n, d) + '</span>'; }

  function labCard(lab, val, sub, subcls) { return '<div class="lab-card"><div class="lab">' + lab + '</div><div class="val">' + val + '</div>' + (sub ? '<div class="sub2 ' + (subcls || '') + '">' + sub + '</div>' : '') + '</div>'; }
  function posCard(p) {
    var isS = perfScope === 'stocks', d = p.direction === 'long', up = (p.upnl || 0) >= 0;
    var head = isS
      ? '<span class="dir" style="background:var(--surface-2);color:var(--text-dim);border:1px solid var(--border)">보유</span>'
      : '<span class="dir ' + (d ? 'long' : 'short') + '">' + (d ? 'LONG' : 'SHORT') + (p.leverage ? ' ' + p.leverage + 'x' : '') + '</span>';
    var cost = (p.qty != null && p.entry_price != null) ? p.qty * p.entry_price : null;
    var nums = isS
      ? (p.qty != null ? '수량 <b>' + p.qty + '</b> · ' : '') + '매입 <b>' + usd(p.entry_price, 1) + '</b> · 현재 <b>' + usd(p.mark, 1) + '</b>' +
        (cost != null ? ' · 매입금액 <b>' + usd(cost, 0) + '</b>' : '') + ' · 평가 <b>' + usd(p.notional, 0) + '</b>'
      : '진입 <b>' + usd(p.entry_price, 1) + '</b> · 현재 <b>' + usd(p.mark, 1) + '</b> · 규모 <b>' + usd(p.notional, 0) + '</b>';
    return '<div class="pos-card"><div class="pc-head">' + head +
      '<b class="pc-coin">' + esc2(coinOf(p.symbol)) + '</b>' +
      '<span class="pc-upnl ' + (up ? 'up' : 'down') + '">' + money(p.upnl, 2) + (p.upnl_pct != null ? ' (' + pct(p.upnl_pct) + ')' : '') + '</span></div>' +
      '<div class="pc-nums">' + nums + '</div></div>';
  }
  function renderTopCards(m) {
    var pos = m.positions.slice().sort(function (a, b) { return Math.abs(b.notional || 0) - Math.abs(a.notional || 0); });
    var html = labCard('총 자산', usd(m.balance, 0), pct(m.returnPct) + ' (추정)', m.returnPct >= 0 ? 'up' : 'down');
    if (!pos.length) html += '<div class="pos-card empty"><div class="pc-head"><span class="pc-none">진행중 포지션 없음</span></div></div>';
    else html += pos.map(posCard).join('');
    document.getElementById('p-topcards').innerHTML = html;
  }
  function renderPosDetail(m) {
    var host = document.getElementById('p-posdetail'), pos = m.positions, meta = document.getElementById('p-pos-meta');
    if (meta) meta.textContent = pos.length ? pos.length + '개' : '';
    if (!pos.length) { host.innerHTML = '<div class="chart-empty">진행중 포지션 없음</div>'; return; }
    // 규모 큰 순
    var sorted = pos.slice().sort(function (a, b) { return Math.abs(b.notional || 0) - Math.abs(a.notional || 0); });
    host.innerHTML = '<div class="pd-list">' + sorted.map(function (p) {
      var d = p.direction === 'long', up = (p.upnl || 0) >= 0;
      return '<div class="pd-item">' +
        '<div class="pd-top">' +
        '<span class="dir ' + (d ? 'long' : 'short') + '">' + (d ? 'LONG' : 'SHORT') + '</span>' +
        '<b class="pd-coin">' + esc2(coinOf(p.symbol)) + '</b>' +
        (p.leverage ? '<span class="pd-lev">' + p.leverage + 'x</span>' : '') +
        '<span class="pd-upnl ' + (up ? 'up' : 'down') + '">' + money(p.upnl, 2) + (p.upnl_pct != null ? ' (' + pct(p.upnl_pct) + ')' : '') + '</span>' +
        '</div>' +
        '<div class="pd-sub">진입 <b>' + usd(p.entry_price, 1) + '</b> · 현재 <b>' + usd(p.mark, 1) + '</b> · 규모 <b>' + usd(p.notional, 0) + '</b></div>' +
        '</div>';
    }).join('') + '</div>';
  }
  function renderScoreboard(m) {
    function s(lab, val, cls) { return '<div class="sb-item"><div class="sb-lab">' + lab + '</div><div class="sb-val ' + (cls || '') + '">' + val + '</div></div>'; }
    document.getElementById('p-scoreboard').innerHTML =
      s('총 거래횟수', m.n + '건', '') +
      s('승률', (m.winRate * 100).toFixed(1) + '%', '') +
      s('총 수익률', pct(m.returnPct), m.returnPct >= 0 ? 'up' : 'down') +
      s('평균 수익률', pct(m.avgTradeRet, 2), m.avgTradeRet >= 0 ? 'up' : 'down') +
      s('최대 수익률', pct(m.bestTradeRet, 2), 'up') +
      s('최대 손실률', pct(m.worstTradeRet, 2), 'down');
  }
  function holdFmt(ms) {
    if (ms == null || isNaN(ms) || ms < 0) return '–';
    var mins = Math.floor(ms / 60000), h = Math.floor(mins / 60), mm = mins % 60, d = Math.floor(h / 24);
    if (d > 0) return d + '일 ' + (h % 24) + '시간';
    return h + '시간 ' + mm + '분';
  }
  function renderTable(m) {
    var isS = perfScope === 'stocks', unit = isS ? 'KRW' : 'USDT';
    var rows = m.comp.slice().sort(function (a, b) { return b.close_ts - a.close_ts; }).slice(0, 50);
    document.getElementById('p-table-meta').textContent = '최근 ' + rows.length + '건 · ' + unit;
    if (!rows.length) { document.getElementById('p-table').innerHTML = '<div class="chart-empty">거래 기록 없음</div>'; return; }
    var th = isS
      ? ['#', '매수 시간', '매도 시간', '종목', '수량', '매수가', '매도가', '매입금액', '수익률', 'PNL (KRW)', '보유 시간', '상태']
      : ['#', '진입 시간', '청산 시간', '방향', '진입가', '청산가', '수익률', 'PNL (USDT)', '보유 시간', '상태'];
    var h = '<table class="tbl"><thead><tr><th>' + th.join('</th><th>') + '</th></tr></thead><tbody>';
    rows.forEach(function (c, i) {
      var e = c.entry_price, x = c.exit_px, ret = e ? (x - e) / e * (c.direction === 'short' ? -1 : 1) * 100 : 0, win = (c.pnl_usd || 0) > 0;
      var hold = (c.entry_ts && c.close_ts) ? holdFmt(c.close_ts - c.entry_ts) : '–';
      var cost = (c.qty != null && c.entry_price != null) ? c.qty * c.entry_price : null;
      var nameCell = isS
        ? '<b>' + esc2(coinOf(c.symbol)) + '</b>'
        : '<b class="' + (c.direction === 'long' ? 'up' : 'down') + '">' + (c.direction === 'long' ? 'LONG' : 'SHORT') + '</b> ' + esc2(coinOf(c.symbol));
      h += '<tr><td class="mut">' + (i + 1) + '</td>' +
        '<td class="mono mut">' + (c.entry_ts ? dt(c.entry_ts) : '–') + '</td>' +
        '<td class="mono">' + dt(c.close_ts) + '</td>' +
        '<td>' + nameCell + '</td>' +
        (isS ? '<td class="mono mut">' + (c.qty != null ? c.qty : '–') + '</td>' : '') +
        '<td class="mono">' + usd(c.entry_price, 1) + '</td><td class="mono">' + usd(c.exit_px, 1) + '</td>' +
        (isS ? '<td class="mono">' + (cost != null ? usd(cost, 0) : '–') + '</td>' : '') +
        '<td class="mono ' + (ret >= 0 ? 'up' : 'down') + '">' + pct(ret, 2) + '</td>' +
        '<td class="mono ' + (win ? 'up' : 'down') + '">' + money(c.pnl_usd, 0) + '</td>' +
        '<td class="mono mut">' + hold + '</td>' +
        '<td><span class="badge ' + (win ? 'tp' : 'sl') + '">' + esc2(c.reason || (win ? 'TP' : 'SL')) + '</span></td></tr>';
    });
    document.getElementById('p-table').innerHTML = h + '</tbody></table>';
  }

  function renderStats2(m) {
    function mini(lab, valHtml, sub) { return '<div class="mini"><div class="lab">' + lab + '</div><div class="val">' + valHtml + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>'; }
    document.getElementById('p-stats2').innerHTML =
      mini('총 손익', colVal(m.totalPnl, 2), pct(m.returnPct) + ' (추정)') +
      mini('총 매매 건수', m.n + '건', '일 평균 ' + (m.tradingDays ? (m.n / m.tradingDays).toFixed(2) : 0) + '건') +
      mini('승리 / 패배', m.wins + ' / ' + m.losses, '최대 ' + m.tW + '연승') +
      mini('최대 일간 수익', colVal(m.bestDay, 2), '') +
      mini('최대 일간 손실', colVal(m.worstDay, 2), '') +
      mini('샤프 비율', m.sharpe.toFixed(2), '무위험 0% 기준');
  }

  function metric(k, v, cls) { return '<div class="p-metric"><span class="k">' + k + '</span><span class="v ' + (cls || '') + '">' + v + '</span></div>'; }
  function renderSummary(m) {
    document.getElementById('p-summary').innerHTML =
      metric('평균 일간 손익', money(m.avgDaily, 2), m.avgDaily >= 0 ? 'up' : 'down') +
      metric('평균 수익 (Win)', money(m.avgWin, 2), 'up') +
      metric('평균 손실 (Loss)', money(-m.avgLoss, 2), 'down') +
      metric('최대 연속 수익일', m.maxWinS + '일', '') +
      metric('최대 연속 손실일', m.maxLossS + '일', '') +
      metric('변동성 (연 환산)', m.vol.toFixed(2) + '%', '') +
      metric('Profit Factor', m.pf === Infinity ? '∞' : m.pf.toFixed(2), '');
  }
  function renderRisk(m) {
    document.getElementById('p-risk-meta').textContent = riskLabel(m).t;
    var g = gaugeSvg(riskLabel(m).score);
    document.getElementById('p-risk').innerHTML = g +
      metric('최대 낙폭 (MDD)', '-' + Math.abs(m.mddPct).toFixed(2) + '%', 'down') +
      metric('현재 낙폭', (m.curDD > 0.005 ? '-' : '') + Math.abs(m.curDDPct).toFixed(2) + '%', m.curDD > 0.005 ? 'down' : '') +
      metric('VaR (95%)', m.var95.toFixed(2) + '%', 'down') +
      metric('포지션 노출', m.exposurePct.toFixed(1) + '%', '') +
      metric('진행중 미실현', money(m.upnl, 2), m.upnl >= 0 ? 'up' : 'down');
  }
  function riskLabel(m) {
    var score = Math.max(0, Math.min(100, Math.round(Math.abs(m.mddPct) * 3 + Math.abs(m.var95) * 2 + m.vol * 0.3)));
    var t = score < 30 ? '낮음 (안정적)' : score < 60 ? '보통' : '높음';
    return { score: score, t: t };
  }

  // ── SVG 차트 ──
  function niceLabel(v) {
    if (perfScope === 'stocks') { var k = Math.abs(v); if (k >= 1e8) return (v / 1e8).toFixed(1) + '억'; if (k >= 1e4) return Math.round(v / 1e4) + '만'; return Math.round(v).toString(); }
    var a = Math.abs(v); if (a >= 1000) return (v / 1000).toFixed(1) + 'k'; return v.toFixed(0);
  }

  function drawCumulative(m) {
    var host = document.getElementById('p-cum');
    var comp = m.comp;
    if (perfPeriod > 0) { var cut = Date.now() - perfPeriod * 86400000; comp = comp.filter(function (c) { return c.close_ts >= cut; }); }
    if (comp.length < 2) { host.innerHTML = '<div class="chart-empty">해당 기간 거래가 부족합니다</div>'; return; }
    var cum = 0, s = comp.map(function (c) { cum += (c.pnl_usd || 0); return { ts: c.close_ts, cum: cum }; });
    var pos = C('--up'), neg = C('--down'), tx = C('--text'), faint = C('--text-faint'), line = C('--border');
    var total = s[s.length - 1].cum, up = total >= 0 ? pos : neg;
    var W = 840, H = 300, L = 54, R = 16, T = 14, B = 30;
    var x0 = s[0].ts, x1 = s[s.length - 1].ts;
    var lo = 0, hi = 0; s.forEach(function (p) { if (p.cum < lo) lo = p.cum; if (p.cum > hi) hi = p.cum; });
    if (hi === lo) hi = lo + 1; var padY = (hi - lo) * 0.08; hi += padY; lo -= padY;
    var X = function (t) { return L + (t - x0) / (x1 - x0 || 1) * (W - L - R); };
    var Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var g = ''; for (var i = 0; i <= 4; i++) { var v = lo + (hi - lo) * i / 4, y = Y(v); g += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="' + line + '" stroke-width="1" opacity="0.5"/><text x="' + (L - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="11" fill="' + faint + '" font-family="ui-monospace,monospace">' + niceLabel(v) + '</text>'; }
    var zeroY = Y(0);
    var pts = s.map(function (p) { return X(p.ts).toFixed(1) + ',' + Y(p.cum).toFixed(1); });
    var area = 'M' + X(x0).toFixed(1) + ',' + zeroY.toFixed(1) + ' L' + pts.join(' L') + ' L' + X(x1).toFixed(1) + ',' + zeroY.toFixed(1) + ' Z';
    var xl = ''; for (var k = 0; k <= 3; k++) { var t = x0 + (x1 - x0) * k / 3; xl += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="' + faint + '" font-family="ui-monospace,monospace">' + mdKey(t) + '</text>'; }
    var end = s[s.length - 1];
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' +
      '<defs><linearGradient id="cumg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + up + '" stop-opacity="0.28"/><stop offset="1" stop-color="' + up + '" stop-opacity="0.02"/></linearGradient></defs>' +
      g + '<line x1="' + L + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - R) + '" y2="' + zeroY.toFixed(1) + '" stroke="' + faint + '" stroke-width="1"/>' +
      '<path d="' + area + '" fill="url(#cumg)"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + up + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="' + X(end.ts).toFixed(1) + '" cy="' + Y(end.cum).toFixed(1) + '" r="3.5" fill="' + up + '"/>' +
      '<text x="' + (X(end.ts) - 6).toFixed(1) + '" y="' + (Y(end.cum) - 8).toFixed(1) + '" text-anchor="end" font-size="12" font-weight="700" fill="' + tx + '" font-family="ui-monospace,monospace">' + money(total, 0) + '</text>' +
      xl + '</svg>';
  }

  function drawDaily(m) {
    var host = document.getElementById('p-daily');
    var a = m.dailyArr;
    if (!a.length) { host.innerHTML = '<div class="chart-empty">데이터 없음</div>'; return; }
    var up = C('--up'), dn = C('--down'), faint = C('--text-faint'), line = C('--border');
    var W = 400, H = 240, L = 40, R = 10, T = 12, B = 26;
    var maxAbs = a.reduce(function (mx, x) { return Math.max(mx, Math.abs(x.pnl)); }, 1);
    var n = a.length, bw = Math.max(1.5, Math.min(16, (W - L - R) / n - 2));
    var X = function (i) { return L + (i + 0.5) / n * (W - L - R); };
    var Y = function (v) { return T + (maxAbs - v) / (2 * maxAbs) * (H - T - B); };
    var zeroY = Y(0), g = '';
    [maxAbs, 0, -maxAbs].forEach(function (v) { var y = Y(v); g += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="' + line + '" stroke-width="1" opacity="0.5"/><text x="' + (L - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="' + faint + '" font-family="ui-monospace,monospace">' + niceLabel(v) + '</text>'; });
    var bars = a.map(function (x, i) {
      var y = Y(x.pnl), h = Math.abs(y - zeroY), yy = Math.min(y, zeroY);
      return '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) + '" rx="1.5" fill="' + (x.pnl >= 0 ? up : dn) + '"><title>' + x.day + '  ' + money(x.pnl, 2) + '</title></rect>';
    }).join('');
    var xl = '<text x="' + L + '" y="' + (H - 8) + '" font-size="10" fill="' + faint + '" font-family="ui-monospace,monospace">' + mdKey(new Date(a[0].day).getTime()) + '</text>' +
      '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end" font-size="10" fill="' + faint + '" font-family="ui-monospace,monospace">' + mdKey(new Date(a[a.length - 1].day).getTime()) + '</text>';
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' + g + bars + xl + '</svg>';
  }

  function drawCalendar(m) {
    var host = document.getElementById('p-cal');
    if (!m.t1) { host.innerHTML = '<div class="chart-empty">데이터 없음</div>'; return; }
    var last = new Date(m.t1), year = last.getFullYear(), mon = last.getMonth();
    document.getElementById('p-cal-meta').textContent = year + '년 ' + (mon + 1) + '월';
    var first = new Date(year, mon, 1), startDow = first.getDay(), dim = new Date(year, mon + 1, 0).getDate();
    var scale = 1; Object.keys(m.dayMap).forEach(function (k) { scale = Math.max(scale, Math.abs(m.dayMap[k])); });
    var dows = ['일', '월', '화', '수', '목', '금', '토'];
    var html = '<div class="cal"><div class="cal-grid">';
    dows.forEach(function (w) { html += '<div class="cal-dow">' + w + '</div>'; });
    for (var i = 0; i < startDow; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= dim; d++) {
      var key = year + '-' + String(mon + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var pnl = m.dayMap[key];
      var style = '', pv = '';
      if (pnl != null && Math.abs(pnl) > 0.005) {
        var col = pnl > 0 ? '--up' : '--down';
        var inten = Math.min(0.85, 0.18 + Math.abs(pnl) / scale * 0.67);
        style = 'background:color-mix(in srgb, var(' + col + ') ' + Math.round(inten * 100) + '%, var(--surface-2));border-color:color-mix(in srgb,var(' + col + ') 40%,transparent);';
        pv = '<span class="p" style="color:' + (inten > 0.5 ? '#fff' : 'var(' + col + ')') + '">' + (pnl >= 0 ? '+' : '') + pnl.toFixed(0) + '</span>';
      }
      html += '<div class="cal-cell" style="' + style + '"><span class="d" style="' + (style && Math.abs(pnl) / scale > 0.5 ? 'color:rgba(255,255,255,.8)' : '') + '">' + d + '</span>' + pv + '</div>';
    }
    html += '</div><div class="cal-legend"><i style="background:var(--down)"></i>손실 <i style="background:var(--surface-2)"></i>0 <i style="background:var(--up)"></i>수익</div></div>';
    host.innerHTML = html;
  }

  function drawDonut(m) {
    var host = document.getElementById('p-donut');
    var w = m.winDays, l = m.lossDays, tot = w + l;
    var up = C('--up'), dn = C('--down'), tx = C('--text'), dim = C('--text-dim');
    if (!tot) { host.innerHTML = '<div class="chart-empty">데이터 없음</div>'; return; }
    var R = 62, cx = 90, cy = 92, sw = 20, circ = 2 * Math.PI * R;
    var wFrac = w / tot;
    var winLen = circ * wFrac;
    var svg = '<svg viewBox="0 0 300 200" width="100%">' +
      '<g transform="rotate(-90 ' + cx + ' ' + cy + ')">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + dn + '" stroke-width="' + sw + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + up + '" stroke-width="' + sw + '" stroke-dasharray="' + winLen.toFixed(1) + ' ' + (circ - winLen).toFixed(1) + '"/>' +
      '</g>' +
      '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="13" fill="' + dim + '">총 매매일</text>' +
      '<text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" font-size="24" font-weight="700" fill="' + tx + '" font-family="ui-monospace,monospace">' + tot + '</text>' +
      '<g font-size="13" font-family="var(--font-sans)">' +
      '<rect x="196" y="66" width="12" height="12" rx="3" fill="' + up + '"/><text x="214" y="76" fill="' + tx + '">수익일 ' + w + ' (' + (wFrac * 100).toFixed(0) + '%)</text>' +
      '<rect x="196" y="98" width="12" height="12" rx="3" fill="' + dn + '"/><text x="214" y="108" fill="' + tx + '">손실일 ' + l + ' (' + ((1 - wFrac) * 100).toFixed(0) + '%)</text>' +
      '</g></svg>' +
      '<div style="display:flex;gap:10px;padding:0 6px 4px">' +
      '<div class="mini" style="flex:1"><div class="lab">총 수익</div><div class="val up">' + money(m.gp, 2) + '</div><div class="sub">평균 ' + money(m.avgWin, 2) + '</div></div>' +
      '<div class="mini" style="flex:1"><div class="lab">총 손실</div><div class="val down">' + money(-m.gl, 2) + '</div><div class="sub">평균 ' + money(-m.avgLoss, 2) + '</div></div></div>';
    host.innerHTML = svg;
  }

  function gaugeSvg(score) {
    var up = C('--up'), warn = C('--warn'), dn = C('--down'), tx = C('--text'), dim = C('--text-dim'), line = C('--border');
    var ang = Math.PI * (score / 100); // 0..π
    var cx = 100, cy = 96, r = 74;
    function pt(a) { return [(cx - r * Math.cos(a)).toFixed(1), (cy - r * Math.sin(a)).toFixed(1)]; }
    var seg = function (a0, a1, col) { var p0 = pt(a0), p1 = pt(a1); return '<path d="M' + p0[0] + ',' + p0[1] + ' A' + r + ',' + r + ' 0 0 1 ' + p1[0] + ',' + p1[1] + '" fill="none" stroke="' + col + '" stroke-width="12" stroke-linecap="round"/>'; };
    var np = pt(ang);
    return '<svg viewBox="0 0 200 118" width="100%" style="max-width:230px;margin:0 auto 6px;display:block">' +
      seg(Math.PI, Math.PI * 0.66, up) + seg(Math.PI * 0.66, Math.PI * 0.33, warn) + seg(Math.PI * 0.33, 0, dn) +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + np[0] + '" y2="' + np[1] + '" stroke="' + tx + '" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + tx + '"/>' +
      '<text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" font-size="20" font-weight="700" fill="' + tx + '" font-family="ui-monospace,monospace">' + score + '<tspan font-size="12" fill="' + dim + '"> /100</tspan></text>' +
      '</svg>';
  }

  function drawBenchmark(m) {
    var host = document.getElementById('p-bench');
    var acc = C('--accent'), faint = C('--text-faint'), tx = C('--text'), line = C('--border'), dim = C('--text-dim');
    if (m.cumSeries.length < 2) { host.innerHTML = '<div class="chart-empty">데이터 부족</div>'; return; }
    // 우리 일별 누적 수익률(%) — 거래일 기준
    var ourDaily = m.dailyArr, cum = 0;
    var ours = ourDaily.map(function (x) { cum += x.pnl; return { day: x.day, ts: new Date(x.day).getTime(), ret: cum / m.estCap * 100 }; });
    // BTC 히스토리 (Binance/data.json)
    var hist = ((typeof liveRegime !== 'undefined' && liveRegime && liveRegime.history) || (typeof lastState !== 'undefined' && lastState && lastState.history) || []);
    var btcByDay = {}; hist.forEach(function (h) { btcByDay[dayKey(h.ts)] = h.price; });
    var days = ours.map(function (o) { return o.day; });
    var base = null; var btc = days.map(function (dk) { var p = btcByDay[dk]; if (p == null) return null; if (base == null) base = p; return { day: dk, ts: new Date(dk).getTime(), ret: (p / base - 1) * 100 }; }).filter(function (x) { return x; });
    var W = 840, H = 300, L = 54, R = 16, T = 14, B = 30;
    var allRet = ours.map(function (o) { return o.ret; }).concat(btc.map(function (b) { return b.ret; })).concat([0]);
    var lo = Math.min.apply(null, allRet), hi = Math.max.apply(null, allRet); if (hi === lo) hi = lo + 1; var pad = (hi - lo) * 0.08; hi += pad; lo -= pad;
    var t0 = ours[0].ts, t1 = ours[ours.length - 1].ts;
    var X = function (t) { return L + (t - t0) / (t1 - t0 || 1) * (W - L - R); };
    var Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var g = ''; for (var i = 0; i <= 4; i++) { var v = lo + (hi - lo) * i / 4, y = Y(v); g += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="' + line + '" stroke-width="1" opacity="0.5"/><text x="' + (L - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="11" fill="' + faint + '" font-family="ui-monospace,monospace">' + v.toFixed(0) + '%</text>'; }
    var zeroY = Y(0);
    function poly(arr, col, wdt) { if (arr.length < 2) return ''; return '<polyline points="' + arr.map(function (p) { return X(p.ts).toFixed(1) + ',' + Y(p.ret).toFixed(1); }).join(' ') + '" fill="none" stroke="' + col + '" stroke-width="' + wdt + '" stroke-linejoin="round"/>'; }
    var xl = ''; for (var k = 0; k <= 3; k++) { var t = t0 + (t1 - t0) * k / 3; xl += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="' + faint + '" font-family="ui-monospace,monospace">' + mdKey(t) + '</text>'; }
    document.getElementById('p-bench-meta').textContent = '수익률은 추정 자본 기준';
    host.innerHTML = '<div class="legend-row"><span><i style="background:' + acc + '"></i>봇</span><span><i style="background:' + faint + '"></i>BTC</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' + g +
      '<line x1="' + L + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - R) + '" y2="' + zeroY.toFixed(1) + '" stroke="' + faint + '" stroke-width="1"/>' +
      poly(btc, faint, 1.6) + poly(ours, acc, 2.4) + xl + '</svg>';
  }

  // ── 오케스트레이터 ──
  function renderPerf() {
    var view = document.getElementById('perf-view'); if (!view || view.hidden) return;
    var d = perfData();
    document.getElementById('p-range').textContent = d.label + (d.completed.length ? ' · ' + mdKey(Math.min.apply(null, d.completed.map(function (c) { return c.close_ts; }))) + ' ~ ' + mdKey(Math.max.apply(null, d.completed.map(function (c) { return c.close_ts; }))) + ' · ' + d.completed.length + '건' : ' · 데이터 대기중');
    var m = computePerf(d);
    renderTopCards(m); renderScoreboard(m); renderTable(m);
    drawCumulative(m);
    renderStats2(m); renderSummary(m); drawDaily(m); drawCalendar(m); drawDonut(m); drawBenchmark(m);
  }

  // ── 뷰/계정 전환 ──
  function initTabs() {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () {
        currentView = b.getAttribute('data-view');
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t === b); });
        document.getElementById('live-view').hidden = currentView !== 'live';
        document.getElementById('perf-view').hidden = currentView !== 'perf';
        if (currentView === 'perf') renderPerf();
      });
    });
    document.querySelectorAll('#perf-acct button').forEach(function (b) {
      b.addEventListener('click', function () {
        perfScope = b.getAttribute('data-scope');
        document.querySelectorAll('#perf-acct button').forEach(function (t) { t.classList.toggle('on', t === b); });
        renderPerf();
      });
    });
    document.querySelectorAll('#p-period button').forEach(function (b) {
      b.addEventListener('click', function () {
        perfPeriod = parseInt(b.getAttribute('data-p'), 10);
        document.querySelectorAll('#p-period button').forEach(function (t) { t.classList.toggle('on', t === b); });
        renderPerf();
      });
    });
  }
  if (document.readyState !== 'loading') initTabs(); else document.addEventListener('DOMContentLoaded', initTabs);
  setInterval(function () { if (currentView === 'perf') renderPerf(); }, 15000);   // 데이터 갱신 반영
  window.renderPerf = renderPerf;
})();
