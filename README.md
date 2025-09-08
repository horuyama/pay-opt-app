# 最適決済マップ（PWA）

## セットアップ
1. 本リポジトリを GitHub で作成し、`Settings > Pages` で公開
2. ブラウザで公開URL（`https://<username>.github.io/<repo>/`）へアクセス
3. スマホで **ホーム画面に追加**（iOS Safari / Android Chrome）

## 運用
- `pay_opt_rules.csv`：カード基本ルールを編集（行追加で拡張）
- `pay_opt_campaigns.csv`：キャンペーンを記録（期間/上乗せ/カード指定）
- Googleスプレッドシートを「ウェブに公開→CSV」にして、画面の URL 欄に貼れば **自動反映**

## 構成
- `index.html` … アプリ本体（Leaflet地図＋判定UI、PWA対応）
- `manifest.json` … PWAメタデータ（名称/テーマ色/アイコン）
- `service-worker.js` … オフライン用キャッシュ（簡易）
- `icon-192.png` / `icon-512.png` … アプリアイコン
- `pay_opt_rules.csv` / `pay_opt_campaigns.csv` … 設定CSV
