const fs = require("node:fs/promises");
const path = require("node:path");
const {
  buildDashboardData,
  buildClosePriceMap,
  buildInstitutionalHistoryRow,
  normalizeInstitutionalSummary,
  normalizeCreditSummary,
  buildCreditHistoryRow,
  parseTaifexFuturesOpenInterestHtml
} = require("./normalizers");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config", "data_sources.json");
const LATEST_PATH = path.join(ROOT, "data", "latest", "market-dashboard.json");
const SAMPLE_PATH = path.join(ROOT, "data", "sample", "market-dashboard.json");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const previous = await readJsonIfExists(LATEST_PATH) || await readJsonIfExists(SAMPLE_PATH);
  const sample = await readJsonIfExists(SAMPLE_PATH);
  const marketDate = process.env.MARKET_DATE || taipeiDate();
  const updateStatus = buildUpdateStatus();
  const sourceIssues = [];

  const tradingBundle = await findLatestTwseBundle(config, marketDate, sourceIssues);
  const yyyymmdd = tradingBundle.yyyymmdd;
  const displayDate = formatDisplayDate(yyyymmdd);
  const twseInstitutionalRows = tradingBundle.institutionalRows;
  const closePriceMap = buildClosePriceMap(tradingBundle.closeRows);
  const taifexFuturesNet = await tryFetchTaifexFuturesNet(config, displayDate, sourceIssues);
  const tpexBundle = await tryFetchTpexBundle(config, yyyymmdd, sourceIssues);
  const twseCreditStatistics = await tryFetchJson(
    config.sources.twseCreditHistory.url.replace("{YYYYMMDD}", yyyymmdd),
    sourceIssues,
    "TWSE credit trading statistics"
  );
  const twseCreditRows = await tryFetchJson(config.sources.margin.url, sourceIssues, "大盤信用交易");

  const institutional = normalizeInstitutionalSummary({
    twseRows: twseInstitutionalRows,
    tpexRows: tpexBundle.institutionalRows
  });

  const credit = normalizeCreditSummary({
    twseRows: Array.isArray(twseCreditRows) ? twseCreditRows : [],
    tpexRows: previous?.credit?.filter((row) => row.market === "櫃買") || []
  });

  replaceEmptyMarket(institutional, "大盤", previous, sample, sourceIssues, "大盤三大法人買賣超");
  replaceEmptyMarket(institutional, "櫃買", previous, sample, sourceIssues, "櫃買三大法人買賣超");

  const tpexCredit = normalizeCreditSummary({ twseRows: [], tpexRows: tpexBundle.creditRows })[1];
  const twseCredit = buildTwseCreditSummary(extractTwseCreditStatistics(twseCreditStatistics));
  if (twseCredit) {
    credit[0] = { ...credit[0], ...twseCredit };
  }
  if (tpexCredit.marginBalance || tpexCredit.shortBalance) {
    credit[1] = tpexCredit;
  }

  let futuresOpenInterest = futuresNetToRows(taifexFuturesNet);
  if (!futuresOpenInterest.length) {
    futuresOpenInterest = previous?.futuresOpenInterest || [];
    sourceIssues.push("三大法人未平倉沿用上一版資料，待接穩定 TAIFEX 端點。");
  }

  const generatedInstitutionalHistoryRow = buildInstitutionalHistoryRow({
    date: displayDate,
    twseRows: twseInstitutionalRows,
    closePriceMap,
    tpexRows: tpexBundle.institutionalRows,
    tpexClosePriceMap: buildClosePriceMap(tpexBundle.closeRows),
    futuresNet: taifexFuturesNet
  });

  const institutionalHistory = mergeHistoryRows(
    generatedInstitutionalHistoryRow,
    previous?.institutionalHistory || sample?.institutionalHistory || [],
    20
  );

  const generatedCreditHistoryRow = buildCreditHistoryRow({
    date: displayDate.slice(5),
    statisticsRows: extractTwseCreditStatistics(twseCreditStatistics)
  });
  const creditHistory = generatedCreditHistoryRow
    ? mergeHistoryRows(generatedCreditHistoryRow, previous?.creditHistory || sample?.creditHistory || [], 20)
    : previous?.creditHistory || sample?.creditHistory || [];

  const dashboard = buildDashboardData({
    asOf: `${displayDate} 盤後`,
    source: "generated",
    institutional,
    institutionalHistory,
    futuresOpenInterest,
    credit,
    creditHistory,
    updateStatus,
    sourceIssues
  });

  await fs.mkdir(path.dirname(LATEST_PATH), { recursive: true });
  await fs.writeFile(LATEST_PATH, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(ROOT, LATEST_PATH)}`);
}

async function tryFetchTpexBundle(config, yyyymmdd, issues) {
  const date = formatDisplayDate(yyyymmdd);
  const institutionalPayload = await tryFetchTpexInstitutional(config.sources.institutionalTpex.url, date, issues);
  const closePayload = await tryFetchJson(
    config.sources.tpexClosePrices.url.replace("{YYYYMMDD}", yyyymmdd),
    issues,
    "TPEx closing prices"
  );
  const creditPayload = await tryFetchJson(
    config.sources.tpexMargin.url.replace("{YYYYMMDD}", yyyymmdd),
    issues,
    "TPEx margin trading"
  );

  return {
    institutionalRows: extractTpexInstitutionalRows(institutionalPayload),
    closeRows: extractTpexCloseRows(closePayload),
    creditRows: extractTpexCreditRows(creditPayload)
  };
}

async function tryFetchTpexInstitutional(url, date, issues) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" },
      body: new URLSearchParams({ type: "Daily", sect: "EW", date, response: "json" })
    });
    if (!response.ok) {
      issues.push(`TPEx institutional data returned HTTP ${response.status}.`);
      return null;
    }

    return await response.json();
  } catch (error) {
    issues.push(`TPEx institutional data failed: ${error.message}`);
    return null;
  }
}

function extractTpexInstitutionalRows(payload) {
  const data = payload?.tables?.[0]?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => ({
    code: row[0],
    foreignNonDealer: row[4],
    foreignDealer: row[7],
    foreign: row[10],
    investmentTrust: row[13],
    dealerProprietary: row[16],
    dealerHedge: row[19],
    dealer: row[22],
    dealerTotal: row[22],
    total: row[23]
  }));
}

function extractTpexCloseRows(payload) {
  const data = payload?.tables?.[0]?.data;
  return Array.isArray(data) ? data.map((row) => ({ code: row[0], close: row[2] })) : [];
}

function extractTpexCreditRows(payload) {
  const data = payload?.tables?.[0]?.data;
  return Array.isArray(data) ? data.map((row) => ({
    marginPrevious: row[2],
    marginBalance: row[6],
    shortPrevious: row[10],
    shortBalance: row[14]
  })) : [];
}

function extractTwseCreditStatistics(payload) {
  const rows = payload?.tables?.[0]?.data;
  if (!Array.isArray(rows) || rows.length < 3) {
    return [];
  }

  return [
    { item: "marginUnits", previous: rows[0]?.[4], current: rows[0]?.[5] },
    { item: "shortBalance", previous: rows[1]?.[4], current: rows[1]?.[5] },
    { item: "marginAmount", previous: rows[2]?.[4], current: rows[2]?.[5] }
  ];
}

function buildTwseCreditSummary(statisticsRows) {
  const margin = statisticsRows.find((row) => row.item === "marginUnits");
  const short = statisticsRows.find((row) => row.item === "shortBalance");
  if (!margin || !short) {
    return null;
  }

  return {
    marginBalance: numberFromValue(margin.current),
    marginChange: numberFromValue(margin.current) - numberFromValue(margin.previous),
    shortBalance: numberFromValue(short.current),
    shortChange: numberFromValue(short.current) - numberFromValue(short.previous)
  };
}

function numberFromValue(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findLatestTwseBundle(config, marketDate, issues) {
  const candidates = recentDateCandidates(marketDate, 10);

  for (const candidate of candidates) {
    const yyyymmdd = candidate.replaceAll("-", "");
    const institutionalRows = await tryFetchTwseInstitutional(config, yyyymmdd, issues, true);
    if (!institutionalRows.length) {
      continue;
    }

    const closePayload = await tryFetchJson(
      config.sources.twseClosePrices.url.replace("{YYYYMMDD}", yyyymmdd),
      issues,
      "上市收盤價",
      true
    );
    const closeRows = extractTwseCloseRows(closePayload);
    if (!closeRows.length) {
      continue;
    }

    if (candidate !== marketDate) {
      issues.push(`今日資料尚未完整發布，已使用最近交易日 ${candidate}。`);
    }

    return { yyyymmdd, institutionalRows, closeRows };
  }

  issues.push("找不到最近可用的證交所 T86 與收盤價資料，改用備援資料。");
  return { yyyymmdd: marketDate.replaceAll("-", ""), institutionalRows: [], closeRows: [] };
}

function replaceEmptyMarket(rows, market, previous, sample, issues, label) {
  const index = rows.findIndex((row) => row.market === market);
  if (index < 0 || rows[index].total) {
    return;
  }

  const fallback = findNonZeroMarket(previous, market) || findNonZeroMarket(sample, market);
  if (!fallback) {
    return;
  }

  rows[index] = fallback;
  issues.push(`${label}沿用備援資料，待接穩定官方端點。`);
}

function findNonZeroMarket(data, market) {
  return data?.institutional?.find((row) => row.market === market && row.total);
}

async function tryFetchTwseInstitutional(config, yyyymmdd, issues, quiet = false) {
  const url = config.sources.institutionalTwse.url.replace("{YYYYMMDD}", yyyymmdd);
  const payload = await tryFetchJson(url, issues, "大盤三大法人買賣超", quiet);
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.data) && Array.isArray(payload.fields)) {
    return payload.data.map((values) => Object.fromEntries(payload.fields.map((field, index) => [field, values[index]])));
  }

  if (!quiet) {
    issues.push("大盤三大法人買賣超回傳格式不符合預期。");
  }
  return [];
}

async function tryFetchJson(url, issues, label, quiet = false) {
  try {
    const response = await fetch(url, { headers: { "accept": "application/json,text/plain,*/*" } });
    if (!response.ok) {
      issues.push(`${label}讀取失敗：HTTP ${response.status}`);
      return null;
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      if (!quiet) {
        issues.push(`${label}讀取失敗：回傳不是 JSON。`);
      }
      return null;
    }
  } catch (error) {
    if (!quiet) {
      issues.push(`${label}讀取失敗：${error.message}`);
    }
    return null;
  }
}

async function tryFetchTaifexFuturesNet(config, displayDate, issues) {
  try {
    const response = await fetch(config.sources.futuresOpenInterest.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        queryDate: displayDate,
        commodityId: "TXF",
        queryType: "",
        goDay: "",
        doQuery: "1",
        dateaddcnt: ""
      })
    });

    if (!response.ok) {
      issues.push(`期交所台股期貨未平倉讀取失敗：HTTP ${response.status}`);
      return {};
    }

    return parseTaifexFuturesOpenInterestHtml(await response.text());
  } catch (error) {
    issues.push(`期交所台股期貨未平倉讀取失敗：${error.message}`);
    return {};
  }
}

function extractTwseCloseRows(payload) {
  const table = payload?.tables?.find((item) => item.title?.includes("每日收盤行情"));
  if (!table?.fields || !Array.isArray(table.data)) {
    return [];
  }

  return table.data.map((values) => Object.fromEntries(table.fields.map((field, index) => [field, values[index]])));
}

function mergeHistoryRows(newRow, existingRows, limit) {
  const rows = [newRow, ...existingRows.filter((row) => row.date !== newRow.date)];
  return rows.filter((row) => row.date).slice(0, limit);
}

function futuresNetToRows(futuresNet) {
  if (!futuresNet?.futuresTotalNet) {
    return [];
  }

  return [
    { participant: "外資", long: null, short: null, net: futuresNet.futuresForeignNet },
    { participant: "投信", long: null, short: null, net: futuresNet.futuresInvestmentTrustNet },
    { participant: "自營商", long: null, short: null, net: futuresNet.futuresDealerNet }
  ];
}

function recentDateCandidates(marketDate, days) {
  const base = new Date(`${marketDate}T12:00:00+08:00`);
  const dates = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() - offset);
    dates.push(formatDate(date));
  }
  return dates;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function taipeiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function buildUpdateStatus() {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(new Date()));
  const stage = process.env.UPDATE_STAGE || (hour >= 20 ? "complete" : "preliminary");

  return stage === "complete"
    ? { stage: "complete", label: "信用交易已補齊" }
    : { stage: "preliminary", label: "初步盤後資料" };
}
