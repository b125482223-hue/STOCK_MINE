const API_LOG_URL = "data/logs/api-call-history.json";

const sourceLabels = {
  "TWSE T86 institutional": "證交所三大法人",
  "TWSE closing prices": "證交所收盤價",
  "TAIFEX futures open interest": "期交所未平倉",
  "TPEx institutional data": "櫃買三大法人",
  "TPEx closing prices": "櫃買收盤價",
  "TPEx margin trading": "櫃買融資融券",
  "TWSE credit trading statistics": "證交所融資融券",
  "TWSE margin OpenAPI": "證交所信用交易明細"
};

const rowsElement = document.querySelector("#apiLogRows");
const updatedAtElement = document.querySelector("#apiLogUpdatedAt");

loadApiLog();

async function loadApiLog() {
  try {
    const response = await fetch(`${API_LOG_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    renderApiLog(await response.json());
  } catch (error) {
    rowsElement.innerHTML = `<tr class="empty-row"><td colspan="2">紀錄載入失敗：${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderApiLog(history) {
  updatedAtElement.textContent = `最後更新：${formatTimestamp(history.updatedAt)}`;
  const calls = (history.entries || []).flatMap((entry) => entry.calls || []);

  if (!calls.length) {
    rowsElement.innerHTML = '<tr class="empty-row"><td colspan="2">目前沒有 API 呼叫紀錄</td></tr>';
    return;
  }

  rowsElement.innerHTML = calls.map((call) => `
    <tr>
      <td>${formatTimestamp(call.calledAt)}</td>
      <td><span class="api-call-name">${escapeHtml(sourceLabels[call.source] || call.source)}</span>${statusBadge(call)}</td>
    </tr>
  `).join("");
}

function statusBadge(call) {
  if (!call.ok) {
    return '<span class="api-state failed">失敗</span>';
  }
  if (!call.dataAvailable) {
    return '<span class="api-state waiting">無資料</span>';
  }
  return '<span class="api-state success">成功</span>';
}

function formatTimestamp(value) {
  if (!value) {
    return "--";
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  return match ? `${match[2]}/${match[3]} ${match[4]}:${match[5]}:${match[6]}` : value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}
