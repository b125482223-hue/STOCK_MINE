const LATEST_URL = "data/latest/market-dashboard.json";
const SAMPLE_URL = "data/sample/market-dashboard.json";
const BUNDLED_FALLBACK = {
  asOf: "2026-07-10 15:30",
  source: "bundled-sample",
  summary: {
    institutionalNet: 27290000000,
    futuresNetOpenInterest: 1580,
    marginChange: -720,
    shortChange: 127
  },
  institutional: [
    { market: "大盤", foreign: 25740000000, investmentTrust: 3820000000, dealer: -1260000000, total: 28300000000 },
    { market: "櫃買", foreign: -1840000000, investmentTrust: 620000000, dealer: 210000000, total: -1010000000 }
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
  sourceIssues: ["目前顯示內建範例資料，正式資料會由 data/latest/market-dashboard.json 提供。"]
};

const els = {
  dataStatus: document.querySelector("#dataStatus"),
  updatedAt: document.querySelector("#updatedAt"),
  refreshButton: document.querySelector("#refreshButton"),
  institutionalTotal: document.querySelector("#institutionalTotal"),
  futuresTotal: document.querySelector("#futuresTotal"),
  creditTotal: document.querySelector("#creditTotal"),
  sourceIssues: document.querySelector("#sourceIssues"),
  institutionalRows: document.querySelector("#institutionalRows"),
  futuresRows: document.querySelector("#futuresRows"),
  creditRows: document.querySelector("#creditRows")
};

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
  const institutional = data.institutional || [];
  const futures = data.futuresOpenInterest || [];
  const credit = data.credit || [];

  els.institutionalTotal.innerHTML = signedText(summary.institutionalNet, 0);
  els.futuresTotal.innerHTML = signedText(summary.futuresNetOpenInterest, 0);
  els.creditTotal.innerHTML = signedText(summary.marginChange, 0);

  renderRows(els.institutionalRows, institutional, (row) => [
    row.market,
    signedCell(row.foreign),
    signedCell(row.investmentTrust),
    signedCell(row.dealer),
    signedCell(row.total)
  ]);

  renderRows(els.futuresRows, futures, (row) => [
    row.participant,
    formatNumber(row.long, 0),
    formatNumber(row.short, 0),
    signedCell(row.net)
  ]);

  renderRows(els.creditRows, credit, (row) => [
    row.market,
    formatNumber(row.marginBalance, 0),
    signedCell(row.marginChange),
    formatNumber(row.shortBalance, 0),
    signedCell(row.shortChange)
  ]);

  renderIssues(data.sourceIssues || []);
  setStatus(label);
  els.updatedAt.textContent = `資料日期：${data.asOf || "--"}`;
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

function signedCell(value) {
  return `<span class="${signClass(value)}">${formatSigned(value, 0)}</span>`;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}
