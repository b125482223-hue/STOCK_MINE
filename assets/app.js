const CONFIG_URL = "config/data_sources.json";
const BUNDLED_FALLBACK = {
  asOf: "2026-07-09 14:30",
  source: "bundled-sample",
  marketSummary: {
    indexName: "發行量加權股價指數",
    last: 23520.18,
    change: 86.42,
    changePercent: 0.37,
    marketStatus: "內建範例資料"
  },
  institutional: [
    { market: "大盤", foreign: 25740000000, investmentTrust: 3820000000, dealer: -1260000000, total: 28300000000 },
    { market: "櫃買", foreign: -1840000000, investmentTrust: 620000000, dealer: 210000000, total: -1010000000 }
  ],
  margin: [
    { name: "台積電", code: "2330", marginBalance: 8200, marginChange: 120, shortBalance: 950, shortChange: -35 },
    { name: "鴻海", code: "2317", marginBalance: 31200, marginChange: -840, shortBalance: 2200, shortChange: 160 },
    { name: "聯發科", code: "2454", marginBalance: 6400, marginChange: 75, shortBalance: 510, shortChange: -18 }
  ],
  futuresOpenInterest: [
    { product: "臺股期貨", contract: "近月", openInterest: 85432, change: 1240 },
    { product: "小型臺指期貨", contract: "近月", openInterest: 73108, change: -920 }
  ]
};

const state = {
  config: null,
  usingFallback: false
};

const els = {
  dataStatus: document.querySelector("#dataStatus"),
  updatedAt: document.querySelector("#updatedAt"),
  refreshButton: document.querySelector("#refreshButton"),
  indexName: document.querySelector("#indexName"),
  indexLast: document.querySelector("#indexLast"),
  indexChange: document.querySelector("#indexChange"),
  institutionalTotal: document.querySelector("#institutionalTotal"),
  marginTotal: document.querySelector("#marginTotal"),
  futuresTotal: document.querySelector("#futuresTotal"),
  institutionalRows: document.querySelector("#institutionalRows"),
  marginRows: document.querySelector("#marginRows"),
  futuresRows: document.querySelector("#futuresRows")
};

els.refreshButton.addEventListener("click", () => loadDashboard());

loadDashboard();

async function loadDashboard() {
  setStatus("載入中", "neutral");

  try {
    state.config = state.config || await fetchJson(CONFIG_URL);
    const liveData = await loadLiveData(state.config);
    state.usingFallback = false;
    renderDashboard(liveData, "官方資料");
  } catch (error) {
    console.warn("Live data failed, using fallback sample.", error);
    const fallback = await loadFallbackData();
    state.usingFallback = true;
    renderDashboard(fallback, "範例資料");
  }
}

async function loadFallbackData() {
  try {
    return await fetchJson(state.config?.fallback?.url || "data/sample/market-dashboard.json");
  } catch (error) {
    console.warn("Local fallback JSON failed, using bundled data.", error);
    return BUNDLED_FALLBACK;
  }
}

async function loadLiveData(config) {
  const [institutionalRaw, marginRaw, indexRaw] = await Promise.all([
    fetchJson(config.sources.institutionalTwse.url),
    fetchJson(config.sources.margin.url),
    fetchJson(config.sources.index.url)
  ]);

  return {
    asOf: new Date().toLocaleString("zh-TW", { hour12: false }),
    source: "live",
    marketSummary: normalizeIndex(indexRaw),
    institutional: normalizeInstitutionalMarkets(institutionalRaw),
    margin: normalizeMargin(marginRaw).slice(0, 12),
    futuresOpenInterest: []
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }

  return response.json();
}

function normalizeIndex(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const taiex = list.find((row) => findValue(row, ["發行量加權股價指數", "TAIEX", "加權"]));
  const row = taiex || list[0] || {};
  const last = numberFrom(row, ["收盤指數", "指數", "price", "value", "close"]);
  const change = numberFrom(row, ["漲跌", "漲跌點數", "change"]);
  const changePercent = numberFrom(row, ["漲跌百分比", "changePercent"]);

  return {
    indexName: textFrom(row, ["指數名稱", "名稱", "name"]) || "發行量加權股價指數",
    last,
    change,
    changePercent,
    marketStatus: "官方資料"
  };
}

function normalizeInstitutionalMarkets(twseRows, tpexRows = []) {
  const markets = [];
  const twse = aggregateInstitutionalRows("大盤", twseRows);

  if (twse.count > 0) {
    markets.push(twse);
  }

  const tpex = aggregateInstitutionalRows("櫃買", tpexRows);

  if (tpex.count > 0) {
    markets.push(tpex);
  }

  return markets;
}

function aggregateInstitutionalRows(market, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const result = {
    market,
    foreign: 0,
    investmentTrust: 0,
    dealer: 0,
    total: 0,
    count: 0
  };

  list.forEach((row) => {
    const foreign = numberFrom(row, ["外陸資買賣超股數(不含外資自營商)", "外資買賣超股數", "foreign"]);
    const investmentTrust = numberFrom(row, ["投信買賣超股數", "investment_trust", "investmentTrust"]);
    const dealer = numberFrom(row, ["自營商買賣超股數", "dealer"]);
    const total = numberFrom(row, ["三大法人買賣超股數", "total"], foreign + investmentTrust + dealer);

    result.foreign += foreign;
    result.investmentTrust += investmentTrust;
    result.dealer += dealer;
    result.total += total;
    result.count += 1;
  });

  return result;
}

function normalizeMargin(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const marginToday = numberFrom(row, ["融資今日餘額", "marginBalance"]);
      const marginYesterday = numberFrom(row, ["融資前日餘額"]);
      const shortToday = numberFrom(row, ["融券今日餘額", "shortBalance"]);
      const shortYesterday = numberFrom(row, ["融券前日餘額"]);

      return {
        code: textFrom(row, ["股票代號", "證券代號", "stock_code", "code"]),
        name: textFrom(row, ["股票名稱", "證券名稱", "stock_name", "name"]),
        marginBalance: marginToday,
        marginChange: numberFrom(row, ["融資增減", "marginChange"], marginToday - marginYesterday),
        shortBalance: shortToday,
        shortChange: numberFrom(row, ["融券增減", "shortChange"], shortToday - shortYesterday)
      };
    })
    .filter((row) => row.code || row.name)
    .sort((a, b) => Math.abs(b.marginChange) - Math.abs(a.marginChange));
}

function findValue(row, candidates) {
  return Object.values(row).some((value) => candidates.some((candidate) => String(value).includes(candidate)));
}

function textFrom(row, keys) {
  const key = keys.find((candidate) => row[candidate] !== undefined);
  return key ? String(row[key]).trim() : "";
}

function numberFrom(row, keys, fallback = 0) {
  const key = keys.find((candidate) => row[candidate] !== undefined);
  if (!key) {
    return fallback;
  }

  const value = Number(String(row[key]).replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(value) ? value : fallback;
}

function renderDashboard(data, label) {
  const summary = data.marketSummary || {};
  const institutional = data.institutional || [];
  const margin = data.margin || [];
  const futures = data.futuresOpenInterest || [];

  els.indexName.textContent = summary.indexName || "--";
  els.indexLast.textContent = formatNumber(summary.last, 2);
  renderSigned(els.indexChange, summary.change, summary.changePercent);
  els.institutionalTotal.textContent = formatNumber(sum(institutional, "total"), 0);
  els.marginTotal.textContent = formatNumber(sum(margin, "marginChange"), 0);
  els.futuresTotal.textContent = formatNumber(sum(futures, "change"), 0);

  renderRows(els.institutionalRows, institutional, (row) => [
    row.market,
    signedCell(row.foreign),
    signedCell(row.investmentTrust),
    signedCell(row.dealer),
    signedCell(row.total)
  ]);

  renderRows(els.marginRows, margin, (row) => [
    row.code,
    row.name,
    formatNumber(row.marginBalance, 0),
    signedCell(row.marginChange),
    formatNumber(row.shortBalance, 0),
    signedCell(row.shortChange)
  ]);

  renderRows(els.futuresRows, futures, (row) => [
    row.product,
    row.contract,
    formatNumber(row.openInterest, 0),
    signedCell(row.change)
  ]);

  setStatus(label, state.usingFallback ? "sample" : "live");
  els.updatedAt.textContent = `最後更新：${data.asOf || new Date().toLocaleString("zh-TW", { hour12: false })}`;
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

function signedCell(value) {
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  return `<span class="${cls}">${formatSigned(value, 0)}</span>`;
}

function renderSigned(target, value, percent) {
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  const suffix = Number.isFinite(percent) ? ` (${formatSigned(percent, 2)}%)` : "";
  target.className = `metric-change ${cls}`;
  target.textContent = `${formatSigned(value, 2)}${suffix}`;
}

function setStatus(text, type) {
  els.dataStatus.textContent = text;
  els.dataStatus.dataset.type = type;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
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
