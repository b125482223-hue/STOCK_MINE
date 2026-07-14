const LATEST_URL = "data/latest/market-dashboard.json";
const SAMPLE_URL = "data/sample/market-dashboard.json";
const BUNDLED_FALLBACK = {
  asOf: "2026-07-10 15:30",
  source: "bundled-sample",
  summary: {
    institutionalNet: 27290000000,
    futuresNetOpenInterest: 1580,
    marginChange: -720,
    marginBalance: 6196.48,
    shortChange: 127
  },
  institutional: [
    { market: "大盤", foreign: 25740000000, investmentTrust: 3820000000, dealer: -1260000000, total: 28300000000 },
    { market: "櫃買", foreign: -1840000000, investmentTrust: 620000000, dealer: 210000000, total: -1010000000 }
  ],
  institutionalHistory: [
    { date: "2026/07/09", foreignNonDealer: -472.53, foreignDealer: 0, foreignTotal: -472.53, investmentTrust: 199.01, dealerProprietary: -20.36, dealerHedge: -56.35, dealerTotal: -76.71, total: -350.23, futuresForeignNet: -80730, futuresInvestmentTrustNet: 71089, futuresDealerNet: 2243, futuresTotalNet: -6798 },
    { date: "2026/07/08", foreignNonDealer: -379.49, foreignDealer: 0, foreignTotal: -379.49, investmentTrust: 126.8, dealerProprietary: -33.43, dealerHedge: -136, dealerTotal: -169.43, total: -422.11, futuresForeignNet: -81208, futuresInvestmentTrustNet: 69987, futuresDealerNet: 3311, futuresTotalNet: -7970 },
    { date: "2026/07/07", foreignNonDealer: -547.31, foreignDealer: 0, foreignTotal: -547.31, investmentTrust: 96.83, dealerProprietary: -126.1, dealerHedge: -361.24, dealerTotal: -487.33, total: -937.82, futuresForeignNet: -80042, futuresInvestmentTrustNet: 68187, futuresDealerNet: 3793, futuresTotalNet: -8062 }
  ],
  futuresOpenInterest: [
    { participant: "外資", long: 48210, short: 46180, net: 2030 },
    { participant: "投信", long: 8120, short: 8460, net: -340 },
    { participant: "自營商", long: 21400, short: 21510, net: -110 }
  ],
  credit: [
    { market: "大盤", marginBalance: 238450000, marginChange: -840, shortBalance: 6120000, shortChange: 160 },
    { market: "櫃買", marginBalance: 92600000, marginChange: 120, shortBalance: 1480000, shortChange: -33 }
  ],
  creditHistory: [
    { date: "07/09", marginBalance: 6196.48, marginChange: 58.32, marginMaintenanceRatio: 186.65, shortBalance: 203714, shortChange: -1200 },
    { date: "07/08", marginBalance: 6138.16, marginChange: 28.71, marginMaintenanceRatio: 186.83, shortBalance: 205830, shortChange: 320 },
    { date: "07/07", marginBalance: 6109.45, marginChange: -204, marginMaintenanceRatio: 186.11, shortBalance: 213844, shortChange: -880 }
  ],
  sourceIssues: ["目前顯示內建範例資料，正式資料會由 data/latest/market-dashboard.json 提供。"]
};

const els = {
  dataStatus: document.querySelector("#dataStatus"),
  dataVersion: document.querySelector("#dataVersion"),
  updatedAt: document.querySelector("#updatedAt"),
  marketIndex: document.querySelector("#marketIndex"),
  marketIndexChange: document.querySelector("#marketIndexChange"),
  refreshButton: document.querySelector("#refreshButton"),
  creditUpdatedAt: document.querySelector("#creditUpdatedAt"),
  institutionalTotal: document.querySelector("#institutionalTotal"),
  futuresTotal: document.querySelector("#futuresTotal"),
  creditTotal: document.querySelector("#creditTotal"),
  marginBalanceTotal: document.querySelector("#marginBalanceTotal"),
  sourceIssues: document.querySelector("#sourceIssues"),
  institutionalHistoryRows: document.querySelector("#institutionalHistoryRows"),
  futuresRows: document.querySelector("#futuresRows"),
  creditHistoryRows: document.querySelector("#creditHistoryRows"),
  foreignLabel: document.querySelector("#foreignLabel"),
  foreignSubtitle: document.querySelector("#foreignSubtitle"),
  marginLabel: document.querySelector("#marginLabel"),
  marginSubtitle: document.querySelector("#marginSubtitle"),
  futuresLabel: document.querySelector("#futuresLabel"),
  futuresSubtitle: document.querySelector("#futuresSubtitle")
};

setupFuturesTable();
els.refreshButton.addEventListener("click", () => loadDashboard());

loadDashboard();

async function loadDashboard() {
  setStatus("載入中");

  try {
    const latest = await fetchJson(LATEST_URL);
    renderDashboard(latest, "每日盤後資料");
  } catch (latestError) {
    console.warn("Latest data failed, using sample.", latestError);
    try {
      const sample = await fetchJson(SAMPLE_URL);
      renderDashboard(sample, "範例資料");
    } catch (sampleError) {
      console.warn("Sample data failed, using bundled fallback.", sampleError);
      renderDashboard(BUNDLED_FALLBACK, "內建範例");
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }

  return response.json();
}

function renderDashboard(data, label) {
  const summary = data.summary || {};
  const marketIndex = data.marketIndex || {};
  const institutionalHistory = data.institutionalHistory || [];
  const futures = data.futuresOpenInterest || [];
  const creditHistory = data.creditHistory || [];
  const currentInstitutional = institutionalHistory[0] || {};
  const previousInstitutional = institutionalHistory[1] || {};
  const currentCredit = creditHistory[0] || {};
  const currentForeignFutures = futures.find((row) => row.participant === "外資");
  const foreignAmount = currentInstitutional.twseForeignTotal ?? currentInstitutional.foreignTotal;
  const previousForeignAmount = previousInstitutional.twseForeignTotal ?? previousInstitutional.foreignTotal;
  const foreignFutures = currentForeignFutures?.net ?? currentInstitutional.futuresForeignNet;
  const previousForeignFutures = previousInstitutional.futuresForeignNet;
  const foreignFuturesChange = Number.isFinite(foreignFutures) && Number.isFinite(previousForeignFutures)
    ? foreignFutures - previousForeignFutures
    : null;

  els.marketIndex.innerHTML = metricValue(marketIndex.close, 2, "點");
  els.marketIndexChange.innerHTML = `${signedText(marketIndex.change, 2)} 點 · ${signedText(marketIndex.changePercent, 2)}%`;

  els.foreignLabel.textContent = "外資今日買賣超金額（上市）";
  els.creditTotal.innerHTML = metricValue(foreignAmount, 2, "億", true);
  els.foreignSubtitle.innerHTML = comparisonText("昨日", previousForeignAmount, 2, "億");

  els.marginLabel.textContent = "融資餘額";
  els.marginBalanceTotal.innerHTML = metricValue(summary.marginBalance ?? currentCredit.marginBalance, 2, "億");
  els.marginSubtitle.innerHTML = comparisonText("與前次相比", currentCredit.marginChange ?? summary.marginChange, 2, "億");

  els.futuresLabel.textContent = "外資未平倉";
  els.futuresTotal.innerHTML = metricValue(foreignFutures, 0, "口", true);
  els.futuresSubtitle.innerHTML = comparisonText("與前次相比", foreignFuturesChange, 0, "口");

  renderRows(els.creditHistoryRows, creditHistory, (row) => [
    row.date,
    formatNumber(row.marginBalance, 2),
    signedCell(row.marginChange, 2),
    formatPercent(row.marginMaintenanceRatio),
    formatNumber(row.shortBalance, 0),
    signedCell(row.shortChange, 0)
  ]);

  renderRows(els.institutionalHistoryRows, institutionalHistory, (row) => [
    row.date,
    signedCell(row.foreignNonDealer, 2),
    signedCell(row.foreignDealer, 2),
    signedCell(row.foreignTotal, 2),
    signedCell(row.investmentTrust, 2),
    signedCell(row.dealerProprietary, 2),
    signedCell(row.dealerHedge, 2),
    signedCell(row.dealerTotal, 2),
    signedCell(row.total, 2),
    signedCell(row.futuresForeignNet, 0),
    signedCell(row.futuresInvestmentTrustNet, 0),
    signedCell(row.futuresDealerNet, 0),
    signedCell(row.futuresTotalNet, 0)
  ]);

  renderRows(els.futuresRows, futures, (row) => [
    row.participant,
    signedCell(row.net)
  ]);

  renderIssues(data.sourceIssues || []);
  renderUpdateStatus(data.updateStatus);
  renderCreditTimestamp(data.sectionUpdates?.credit);
  setStatus(label);
  els.updatedAt.textContent = sectionDateSummary(data);
}

function setupFuturesTable() {
  const table = els.futuresRows?.closest("table");
  if (!table) {
    return;
  }

  table.classList.add("futures-table");
  const headers = table.querySelectorAll("thead th");
  if (headers.length >= 4) {
    headers[2].remove();
    headers[1].remove();
  }
}

function metricValue(value, digits, unit, signed = false) {
  const number = signed ? signedText(value, digits) : formatNumber(value, digits);
  return `${number}<small class="metric-unit">${unit}</small>`;
}

function comparisonText(label, value, digits, unit) {
  return `${label} ${signedText(value, digits)} ${unit}`;
}

function renderUpdateStatus(status) {
  const stage = status?.stage || "unknown";
  const label = status?.label || "資料完整度待確認";
  els.dataVersion.textContent = label;
  els.dataVersion.dataset.stage = stage;
}

function renderCreditTimestamp(section) {
  if (!els.creditUpdatedAt) {
    return;
  }

  const dataDate = section?.dataDate || "--";
  const updatedAt = formatTimestamp(section?.updatedAt);
  const checkedAt = formatTimestamp(section?.lastCheckedAt);
  els.creditUpdatedAt.textContent = `資料 ${dataDate} · 更新 ${updatedAt} · 檢查 ${checkedAt}`;
}

function sectionDateSummary(data) {
  const institutionalDate = data.sectionUpdates?.institutional?.dataDate;
  const creditDate = data.sectionUpdates?.credit?.dataDate;
  if (institutionalDate || creditDate) {
    return `資料日期：法人 ${shortDate(institutionalDate)} · 信用 ${shortDate(creditDate)}`;
  }
  return `資料日期：${data.asOf || "--"}`;
}

function shortDate(value) {
  return value ? String(value).slice(5) : "--";
}

function formatTimestamp(value) {
  if (!value) {
    return "--";
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match ? `${match[2]}/${match[3]} ${match[4]}:${match[5]}` : value;
}

function renderRows(target, rows, mapper) {
  target.innerHTML = "";

  if (!rows.length) {
    const colSpan = target.closest("table").querySelectorAll("th").length;
    target.insertAdjacentHTML("beforeend", `<tr class="empty-row"><td colspan="${colSpan}">目前沒有可顯示資料</td></tr>`);
    return;
  }

  rows.forEach((row) => {
    const cells = mapper(row).map((value) => `<td>${value}</td>`).join("");
    target.insertAdjacentHTML("beforeend", `<tr>${cells}</tr>`);
  });
}

function renderIssues(issues) {
  els.sourceIssues.hidden = issues.length === 0;
  els.sourceIssues.innerHTML = issues.map((issue) => `<div>${escapeHtml(issue)}</div>`).join("");
}

function signedCell(value, digits = 0) {
  return `<span class="${signClass(value)}">${formatSigned(value, digits)}</span>`;
}

function signedText(value, digits) {
  return `<span class="${signClass(value)}">${formatSigned(value, digits)}</span>`;
}

function signClass(value) {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

function setStatus(text) {
  els.dataStatus.textContent = text;
}

function formatNumber(value, digits) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return value.toLocaleString("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatSigned(value, digits) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, digits)}`;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 2)}%` : "--";
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
