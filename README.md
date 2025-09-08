# Pay Optimizer Map (Japan)
地図をタップ/検索 → 店舗のカテゴリに応じて **最適な決済手段**（カード/QR）と **推定還元率** を提案するPWA（iPhone最適化UI）。

- 端末内データ（`/data/*.json`）と**キャンペーン**（手動 or 画面からインポート）を組み合わせてスコアリング
- Leaflet + OSM。検索はNominatim（公開API）を利用（GitHub Pages公開時にそのまま使えます）
- PWA（オフライン簡易対応）/ iPhoneホーム追加OK
- **GitHub Pages** で静的ホスティング可能

## 使い方（超速）
1. 「Use this template」またはzipを展開してリポジトリにpush
2. GitHub -> Settings -> Pages -> Branchを`main`/`docs`等に設定してデプロイ
3. iPhoneで公開URLを開き、共有→「ホーム画面に追加」

## データの編集
- `/data/cards.json` ベース還元や招待制特典など **あなたの実数値** に書き換えてください
- `/data/wallets.json` QR系のベース/上限など
- `/data/merchant_rules.json` 店舗カテゴリ→推し決済の**優先ヒント**
- `/data/campaigns.json` キャンペーン。アプリ内「設定→キャンペーンをインポート」からCSV/JSONで上書き可

> 重要: カード/QR/店舗の特典・上限は**頻繁に変わります**。本プロジェクトは**計算エンジンと編集可能なデータ雛形**を提供します。実際の還元は必ず公式情報で確認・反映してください。

## 推定スコアの考え方（簡略）
- `effective_rate = base + category_bonus + campaign_bonus`（上限/倍付け/条件はcampaign定義に従って調整）
- CSV/JSONでキャンペーンを追加し、対象カテゴリ・店舗名・支払いブランド・期間・上限などを指定
- `merchant_rules.json` は「優先候補」のヒント（スコアに微加点）

## ライセンス
MIT
