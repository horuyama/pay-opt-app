# アップロード手順（404/ファイル未検出のとき）
1. この `index.html` と `service-worker.js` を GitHub のリポジトリ直下（root）に上書き。
2. ブランチは `main`、Pages のフォルダは `/ (root)`。
3. 公開URLを `...?v=5` を付けて開く（例: https://<user>.github.io/pay-opt-app/?v=5）。
4. 反映しなければ、Safariの更新ボタン長押し→「キャッシュなしで再読み込み」。
5. それでもダメなら、設定→Safari→Webサイトデータ→`github.io` を削除→再アクセス。
