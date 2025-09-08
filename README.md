# 最適決済マップ（PWA・自動キャンペーン反映）
1) このフォルダをGitHubリポにアップ → Settings > Pages で公開
2) 地図をタップ → 周辺POI取得 → 推奨カード/推定還元率を表示
3) 複数のキャンペーンCSV URL（1行=1URL）を入力し、更新間隔（分）を設定→自動反映

CSV列: merchant_pattern, category, card_override, bonus_rate_percent, start_date, end_date, note, source, priority
優先: priority 降順 → bonus_rate_percent 降順（重複ヒット時）
