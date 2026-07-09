# 台股籌碼與指數靜態儀表板

這是一個可部署到 GitHub Pages 的純前端 HTML 儀表板，用來查看台股盤後籌碼與指數資料。

## MVP 範圍

- 三大法人買賣超：只顯示大盤與櫃買各自市場合計
- 融資融券
- 期貨未平倉
- 目前指數摘要

目前版本以純前端為主，優先讀取官方公開端點；若瀏覽器直連失敗，會自動改用 `data/sample/market-dashboard.json` 範例資料，避免頁面空白。

## 本機使用

在 Windows 11 + PowerShell 中可直接開啟：

```powershell
Start-Process .\index.html
```

如果瀏覽器因本機檔案限制阻擋 `fetch()`，可用簡易靜態伺服器：

```powershell
python -m http.server 8080
Start-Process http://127.0.0.1:8080/
```

## GitHub Pages 部署

1. 在 GitHub 建立空 repository。
2. 推送本專案到 GitHub。
3. 到 repository 的 `Settings > Pages`。
4. Source 選 `Deploy from a branch`。
5. Branch 選 `main`，Folder 選 `/root`。

## 資料來源

資料來源設定集中在 `config/data_sources.json`。目前規劃：

- 證交所 OpenAPI：大盤三大法人買賣超、融資融券、指數資料。
- 櫃買中心公開資料：櫃買三大法人買賣超，後續需確認最穩定的可機器讀取端點。
- 期交所公開資料：期貨未平倉，後續需確認最穩定的可機器讀取端點。
- 本地範例資料：`data/sample/market-dashboard.json`。

## 重要限制

- GitHub Pages 是靜態網站，不能保存密鑰，也不能穩定代理 API。
- 官方公開端點可能有 CORS、TLS、更新頻率或防護限制。
- 若前端直連不穩，第二階段建議改用 GitHub Actions 定時抓資料並輸出 `data/latest/*.json`。
