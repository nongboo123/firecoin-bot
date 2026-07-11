# 봇 상태 대시보드 (bot-homepage)

고래·OI 자동매매 봇의 **국면 / 고래 거래 / 봇 시그널 거래**를 한 화면에서 보는
**독립 실행 정적 웹사이트**입니다. 봇 코드와 완전히 분리돼 있고, `data.json` 하나만 읽어
렌더링합니다. (프레임워크·빌드 단계 없음 — HTML/CSS/바닐라 JS)

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 페이지 골격 |
| `styles.css` | 디자인(테마 자동 라이트/다크, 반응형, 한국어) |
| `app.js` | `data.json`을 30초마다 불러와 렌더 |
| `data.json` | **표시할 데이터**(현재는 샘플). 이 파일만 갈아끼우면 됨 |

## 배포 (라이브)
👉 **https://bot.firecoin.me** — 전용 저장소 `nongboo123/firecoin-bot`의 GitHub Pages (CNAME=bot.firecoin.me).
> ⚠️ `firecoin.me/bot`은 불가: firecoin.me 저장소(`bull-market-alerter`)는 `site-sync[bot]`이 매번
> orphan 커밋으로 통째 force-push해서 하위 폴더가 지워짐. 그래서 **독립 서브도메인**으로 분리함.

**업데이트 방법** (이 폴더 `bot-homepage`가 원본. 수정 후):
```bash
git clone https://github.com/nongboo123/firecoin-bot.git
cp index.html styles.css app.js data.json README.md firecoin-bot/
cd firecoin-bot && git add -A && git commit -m "update" && git push
# ~1분 뒤 bot.firecoin.me 반영. (CNAME/.nojekyll 파일은 건드리지 말 것)
```

## 로컬에서 보는 법
`file://`로 열면 브라우저 보안정책 때문에 fetch가 막힙니다. 간단한 웹서버로 여세요:

```bash
cd bot-homepage
python -m http.server 8250
# 브라우저에서 http://localhost:8250
```

## 실시간으로 이미 동작하는 것 (백엔드 불필요)
고래 임계값: **BTC $8M · ETH $6M** (양쪽 공통).

- **국면 차트**: 브라우저가 Binance 일봉(**1년/365일**)을 직접 받아 7d 모멘텀·EMA3로 계산. 10분마다.
- **HL 고래 (정확)**: 브라우저가 Hyperliquid **WebSocket 체결**을 실시간 구독 → 주문(hash)별 집계 →
  테이커의 `userFills`로 **거래소 확정 dir**을 조회. 온체인이라 추정이 아니라 **정확**합니다:
  `신규 롱포지션` · `롱포지션 청산` · `신규 숏포지션` · `숏포지션 청산` (+ 지갑주소 hypurrscan 링크 · 실현손익 · 승률).
- **Binance 고래 (추정)**: `aggTrades`를 20초마다 폴링해 대형 체결을 누적하고, 최근 OI 방향으로 dir 추정:
  `매수+OI↑ = 신규 롱포지션(추정)` · `매도+OI↓ = 롱포지션 청산(추정)` ·
  `매도+OI↑ = 신규 숏포지션(추정)` · `매수+OI↓ = 숏포지션 청산(추정)`.
  (Binance는 CEX라 온체인 dir이 없어 **추정**. Binance WS는 이 환경에서 데이터가 안 와서 REST 폴링 사용.)

> ⚠️ $8M/$6M은 **드물게** 발생합니다. 페이지를 열어두면 실제 고래가 뜰 때마다 위쪽에 쌓입니다.

- **봇 시그널 거래 / 메인 계정 거래 (실거래)**: HL 계정 3개를 브라우저에서 직접 조회
  (`clearinghouseState`=진행중·미실현손익·TP/SL, `frontendOpenOrders`=TP/SL, `userFills`=완료·실현손익). 30초마다.
  - **봇 시그널 거래** = 롱 계정 `0xaca1…50afb` + 숏 계정 `0xfee8…919bf` (전체 코인). *현재 롱 계정은 비어있음.*
  - **메인 계정 거래** = 메인 계정 `0xfe65…1EAE` (전체 코인 · xyz 상품/주식 퍼프 포함).
  - 상단 KPI(진행중·전체성적·전체손익·미실현)는 **롱+숏(봇 시그널) 기준**. 전체 손익 = 실현손익 누적.
  - 온체인이라 손익·진입가는 정확하지만 **전략명(시그널N)은 온체인에 없어** 코인·방향으로 표시.
  - 계정 주소·범위는 `app.js`의 `ACCTS`에서 조절.

## 남은 것 (선택)
- **시그널N 전략명**을 살리려면 봇이 `completed_trades`(sig_type 포함)를 `data.json`으로 내보내야 함(봇 레포 수정).
- Coinbase/Deribit 고래(현재 미표시). `data.json`의 `positions`/`completed`/`whales`가 있으면 실시간 피드와 **통합**됨.

1. **봇이 주기적으로 `data.json` export** (가장 단순): 봇에 30초 타이머를 두고 현재 상태를
   이 스키마로 써서 이 폴더(또는 웹서버 루트)에 저장. 정적 호스팅만으로 끝.
2. **봇에 작은 읽기 전용 API** 를 띄우고 `app.js`의 `fetch('data.json')`을 그 주소로 변경.
3. **봇 DB를 읽는 별도 백엔드** (완료거래·HL 고래는 SQLite에 있음).

> 어느 쪽이든 **개인키·텔레그램 토큰은 절대 포함하지 말 것**. 읽기 전용으로만.

## data.json 스키마
```jsonc
{
  "updated_ts": 1783333400000,           // 마지막 갱신(ms)
  "live": true,                          // true=실거래 / false=관찰 모드
  "regime": { "level": 2, "name": "약하락", "mom": -1.3, "meta": "설명(선택)" },
  "history": [                           // 국면 차트용 일봉 시계열 (오래된→최신)
    { "ts": 1719759600000, "price": 59816, "level": 3 }
  ],
  "positions": [                         // 진행중 (심볼당 1건)
    { "symbol": "BTCUSDT", "signal": "시그널4", "direction": "short",
      "entry_price": 99900, "mark": 99838, "tp_price": 98901, "sl_price": 100899,
      "notional": 20000, "upnl": 62, "upnl_pct": 0.31, "wallet": "0x…" }
  ],
  "completed": [                         // 완료 (최근순)
    { "close_ts": 1783332800000, "symbol": "BTCUSDT", "signal": "시그널1",
      "direction": "short", "pnl_usd": 160, "reason": "TP" }
  ],
  "whales": [                            // 고래 피드 (HL+CEX 통합, ts 내림차순 정렬은 앱이 처리)
    { "ts": 1783333392000, "coin": "BTC", "venue": "Hyperliquid", "label": "롱 종료",
      "side": "sell", "size_usd": 13200000, "price": 99850,
      "win_rate": 62, "closed_pnl": 42000, "wallet": "0x…" },
    { "ts": 1783333280000, "coin": "ETH", "venue": "Binance", "label": "매도",
      "side": "sell", "size_usd": 18500000, "price": 3142 }
  ]
}
```
- **국면 차트는 이미 실시간입니다.** `app.js`가 브라우저에서 Binance 일봉(BTCUSDT 1d, 730개)을
  직접 받아 **7일 모멘텀 → EMA(3) → 6단계**로 국면을 계산해 그립니다(방향일치 74% — 30일 모멘텀보다
  반응이 빨라 급락을 제때 반영). 페이지 진입 시 + 10분마다 자동 갱신, 백엔드 불필요.
  → 따라서 `data.json`의 `regime`/`history`는 **Binance 호출 실패 시 폴백**으로만 쓰입니다(생략 가능).
- `signal`은 **익명화된 이름**("시그널N")으로 넣으세요. 실제 전략명은 노출하지 않습니다.
- `side`: `"buy"`(녹색) / `"sell"`(빨강) / 없음(회색). `wallet`이 있으면 hypurrscan 링크가 붙습니다.
- `price`가 `null`이면 가격 표시를 생략합니다(예: 규모만 아는 CEX 고래).

## 주의
- 지갑 주소를 페이지에 올리면 온체인으로 봇 계정이 추적될 수 있습니다(원치 않으면 `wallet` 생략).
- 공개 배포 시엔 접근 제한(비밀번호/방화벽)을 별도로 두세요. 이 사이트 자체엔 인증이 없습니다.
