# 台股籌碼與指數靜態儀表板

這是一個可部署到 GitHub Pages 的純前端 HTML 儀表板，用來查看台股每日盤後籌碼資料。

## MVP 範圍

- 每日盤後三大法人買賣超：只顯示大盤與櫃買各自市場合計
- 三大法人未平倉
- 每日信用交易變化

目前網頁優先讀取 `data/latest/market-dashboard.json`；若檔案不存在或讀取失敗，會自動改用 `data/sample/market-dashboard.json` 範例資料，避免頁面空白。

## 本機使用

在 Windows 11 + PowerShell 中可直接開啟：

```powershell
Start-Process .\index.html
```

如果瀏覽器因本機檔案限制阻擋 `fetch()`，頁面會改用內建備援資料；正式使用以 GitHub Pages 網址為準。手動更新本地 latest JSON：

```powershell
node tools\build_daily_data.js
```

## GitHub Pages 部署

1. 在 GitHub 建立空 repository。
2. 推送本專案到 GitHub。
3. 到 repository 的 `Settings > Pages`。
4. Source 選 `Deploy from a branch`。
5. Branch 選 `main`，Folder 選 `/root`。

## 資料來源

資料來源設定集中在 `config/data_sources.json`。目前規劃：

- 證交所公開資料：大盤三大法人買賣超、信用交易資料。
- 首頁與歷史表的法人買賣超金額：直接使用 TWSE `BFI82U` 官方買賣差額，單位由元轉為億；不納入上櫃市場。
- 櫃買中心公開資料：櫃買三大法人買賣超，後續需確認最穩定的可機器讀取端點。
- 期交所公開資料：台股期貨三大法人未平倉多空淨額。
- 本地範例資料：`data/sample/market-dashboard.json`。

## 每日更新

手動更新：

```powershell
node tools\build_daily_data.js
```

GitHub Actions 於台灣時間週一到週五錯峰執行：11:47–17:17 每 30 分鐘重試盤後資料，
另保留 14:50 正式抓取；18:17–22:47 每 30 分鐘重試信用交易資料。
詳細規則與限制請見 `docs/UPDATE_SCHEDULE.md`。

## 重要限制

- GitHub Pages 是靜態網站，不能保存密鑰，也不能穩定代理 API。
- 官方公開端點可能有 CORS、TLS、更新頻率或防護限制，因此網頁讀取本 repo 內的固定 JSON。
- 櫃買與期交所端點尚未完全穩定化前，頁面會清楚顯示來源提醒。
