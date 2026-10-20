# app-phone（発着信・キュー）— itonami（dapp）上の分散型設計

状態: 第 1 スライス実装（2026-10-20）。正本はこの文書。
追跡: Linear JUN-128（親 JUN-116）。

## 位置づけ

app-phone は電話（発着信・キュー・通話統計）。**通話記録と連絡先は E2E
暗号封筒の inner-type**（callRecord / contact —— 通話履歴は個人情報）。

## このスライス: キュー・統計判定コア

| 層 | 実体 | 状態 |
|---|---|---|
| 判定コア guest | `aiueos/phone_queue.cljk` — channel-ok（**pstn / extension / webrtcWidget の 3**）/ direction-ok（inbound/outbound）/ disposition-ok（**answered / missed / abandoned / voicemail / transferred の 5**）/ queue-create（**routingTier は与えられたら 0..100**）/ stat-admission（disposition 検証 + callCount は非負整数） | **実装済み・実測** |
| 記述子 | `aiueos/phone-queue.edn` | **実装済み** |
| parity | `kotoba/test/phone/queue_parity_test.cljk` — 正本（registry.ts / types.ts）の閉じた集合・routingTier 規則・E2E inner-type と一致 | **実装済み・実測** |

実測: `amu test aiueos/phone_queue.cljk` → **15/15**（jvm-kir / js / wasm）。
parity → 2 tests / 17 assertions / 0 failures。

## 正本の正確な規則（guest はこれに追従）

- **CallChannel** = pstn / extension / webrtcWidget。**CallDirection** =
  inbound / outbound。**CallDisposition** = answered / missed / abandoned /
  voicemail / transferred。
- createQueue: queueId + label 必須、channel 検証（invalidChannel）、
  **routingTier は undefined なら不問・与えられたら isPct（0..100）**
  （invalidRoutingTier）。
- recordVolumeStat: statId + window 必須、disposition 検証、callCount は
  isUint。
- **E2E inner-type**: callRecord / contact。

## 未実装境界

- 発着信のルーティング判定（queue の routingTier 適用、転送規則）。
- callRecord の記録判定（disposition の確定、録音 consent は briefing と同族）。
- mon（DNA）化、aiueos session 載せ（fleet 共通）。
