# API 更新與稽核

## 手動更新

1. 從儀表板點選「手動更新 API」。
2. 在 GitHub Actions 的 `Update market data` 頁面點選 `Run workflow`。
3. 選擇 `main` 後再次按下綠色 `Run workflow`。
4. 等待工作流程完成，GitHub Pages 會接續部署最新資料。

公開靜態網頁不能安全保存 GitHub Token，因此手動更新必須在已登入的 GitHub 頁面執行。
儀表板原有的重新整理按鈕只會重新讀取已部署的 JSON，不會觸發 GitHub Actions。

## 更新時間

`data/latest/market-dashboard.json` 以 `sectionUpdates` 分別記錄：

- `dataDate`：該區資料所屬交易日。
- `updatedAt`：該區最後成功取得資料的台灣時間。
- `lastCheckedAt`：最後一次呼叫 API 的台灣時間。
- `status`：`current` 表示本次取得當日資料，`stale` 表示沿用前次資料。

三大法人、期貨與信用交易各自更新，不再互相阻擋。

## API 呼叫紀錄

`data/logs/api-call-history.json` 保留最近 100 次更新工作，每次包含：

- 執行時間、目標交易日、觸發方式。
- 各 API 的呼叫時間、HTTP 狀態、是否取得資料、資料筆數與錯誤訊息。
- 三大法人、期貨、信用交易是否成功更新。

可依 `calledAt` 與 `dataAvailable` 比對不同時間點，判斷官方資料通常從何時開始可用。
儀表板的「API 紀錄」會開啟 `api-status.html`，以呼叫時間與呼叫項目表格呈現，狀態標記顯示成功、無資料或失敗。
