const fs = require("node:fs/promises");
const path = require("node:path");
const {
  buildDashboardData,
  buildClosePriceMap,
  extractTwseMarketIndex,
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
const API_HISTORY_PATH = path.join(ROOT, "data", "logs", "api-call-history.json");
const API_HISTORY_LIMIT = 100;
const apiCalls = [];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const previous = await readJsonIfExists(LATEST_PATH) || await readJsonIfExists(SAMPLE_PATH);
  const sample = await readJsonIfExists(SAMPLE_PATH);
  const marketDate = process.env.MARKET_DATE || taipeiDate();
  const runAt = taipeiTimestamp();
  const sourceIssues = [];
  const requestedYyyymmdd = marketDate.replaceAll("-", "");
  const displayDate = formatDisplayDate(requestedYyyymmdd);

  const twseInstitutionalRows = await tryFetchTwseInstitutional(
    config,
    requestedYyyymmdd,
    sourceIssues,
    true
  );
  const closePayload = await tryFetchJson(
    config.sources.twseClosePrices.url.replace("{YYYYMMDD}", requestedYyyymmdd),
    sourceIssues,
    "TWSE closing prices",
    true,
    displayDate
  );
  const closeRows = extractTwseCloseRows(closePayload);
  const currentMarketIndex = extractTwseMarketIndex(closePayload, displayDate);
  updateApiCall("TWSE closing prices", displayDate, {
    dataAvailable: closeRows.length > 0,
    rowCount: closeRows.length
  });

  const taifexFuturesNet = await tryFetchTaifexFuturesNet(config, displayDate, sourceIssues);
  const tpexBundle = await tryFetchTpexBundle(config, requestedYyyymmdd, sourceIssues);
  const twseCreditStatistics = await tryFetchJson(
    config.sources.twseCreditHistory.url.replace("{YYYYMMDD}", requestedYyyymmdd),
    sourceIssues,
    "TWSE credit trading statistics",
    false,
    displayDate
  );
  const statisticsRows = extractTwseCreditStatistics(twseCreditStatistics);
  updateApiCall("TWSE credit trading statistics", displayDate, {
    dataAvailable: statisticsRows.length > 0,
    rowCount: statisticsRows.length
  });

  const twseCreditRows = await tryFetchJson(
    config.sources.margin.url,
    sourceIssues,
    "TWSE margin OpenAPI",
    false,
    displayDate
  );
  updateApiCall("TWSE margin OpenAPI", displayDate, {
    dataAvailable: Array.isArray(twseCreditRows) && twseCreditRows.length > 0,
    rowCount: Array.isArray(twseCreditRows) ? twseCreditRows.length : 0
  });

  let institutional = previous?.institutional || sample?.institutional || [];
  let marketIndex = previous?.marketIndex || sample?.marketIndex || null;
  let institutionalHistory = previous?.institutionalHistory || sample?.institutionalHistory || [];
  let futuresOpenInterest = previous?.futuresOpenInterest || sample?.futuresOpenInterest || [];
  let credit = previous?.credit || sample?.credit || [];
  let creditHistory = previous?.creditHistory || sample?.creditHistory || [];
  const sectionUpdates = buildPreviousSectionUpdates(previous, runAt);

  const institutionalAvailable = twseInstitutionalRows.length > 0 && closeRows.length > 0;
  const indexAvailable = Boolean(currentMarketIndex);
  const futuresAvailable = hasFuturesNet(taifexFuturesNet);
  const generatedCreditHistoryRow = buildCreditHistoryRow({
    date: displayDate.slice(5),
    statisticsRows
  });
  const creditAvailable = Boolean(generatedCreditHistoryRow);

  if (indexAvailable) {
    marketIndex = currentMarketIndex;
    sectionUpdates.index = currentSectionUpdate(displayDate, runAt);
  } else {
    sourceIssues.push(`加權指數 ${displayDate} 資料尚未發布，指數資料維持前次版本。`);
    sectionUpdates.index = staleSectionUpdate(sectionUpdates.index, runAt);
  }

  if (institutionalAvailable) {
    institutional = normalizeInstitutionalSummary({
      twseRows: twseInstitutionalRows,
      tpexRows: tpexBundle.institutionalRows
    });
    replaceEmptyMarket(institutional, "大盤", previous, sample, sourceIssues, "大盤三大法人買賣超");
    replaceEmptyMarket(institutional, "櫃買", previous, sample, sourceIssues, "櫃買三大法人買賣超");

    const generatedInstitutionalHistoryRow = buildInstitutionalHistoryRow({
      date: displayDate,
      twseRows: twseInstitutionalRows,
      closePriceMap: buildClosePriceMap(closeRows),
      tpexRows: tpexBundle.institutionalRows,
      tpexClosePriceMap: buildClosePriceMap(tpexBundle.closeRows),
      futuresNet: taifexFuturesNet
    });
    institutionalHistory = mergeHistoryRows(generatedInstitutionalHistoryRow, institutionalHistory, 20);
    sectionUpdates.institutional = currentSectionUpdate(displayDate, runAt);
  } else {
    sourceIssues.push(`三大法人 ${displayDate} 資料尚未完整發布，法人資料維持前次版本。`);
    sectionUpdates.institutional = staleSectionUpdate(sectionUpdates.institutional, runAt);
  }

  if (futuresAvailable) {
    futuresOpenInterest = futuresNetToRows(taifexFuturesNet);
    sectionUpdates.futures = currentSectionUpdate(displayDate, runAt);
  } else {
    sourceIssues.push(`外資未平倉 ${displayDate} 資料尚未發布，期貨資料維持前次版本。`);
    sectionUpdates.futures = staleSectionUpdate(sectionUpdates.futures, runAt);
  }

  const tpexCredit = normalizeCreditSummary({ twseRows: [], tpexRows: tpexBundle.creditRows })[1];
  const twseCredit = buildTwseCreditSummary(extractTwseCreditStatistics(twseCreditStatistics));
  if (creditAvailable) {
    credit = normalizeCreditSummary({
      twseRows: Array.isArray(twseCreditRows) ? twseCreditRows : [],
      tpexRows: tpexBundle.creditRows
    });
    if (twseCredit) {
      credit[0] = { ...credit[0], ...twseCredit };
    }
    if (tpexCredit.marginBalance || tpexCredit.shortBalance) {
      credit[1] = tpexCredit;
    }
    creditHistory = mergeHistoryRows(generatedCreditHistoryRow, creditHistory, 20);
    sectionUpdates.credit = currentSectionUpdate(displayDate, runAt);
  } else {
    sourceIssues.push(`融資融券 ${displayDate} 資料尚未發布，信用交易維持前次版本。`);
    sectionUpdates.credit = staleSectionUpdate(sectionUpdates.credit, runAt);
  }

  const updateStatus = buildUpdateStatus({
    institutionalAvailable,
    futuresAvailable,
    creditAvailable
  });
  const newestDataDate = latestSectionDate(sectionUpdates) || previous?.asOf?.slice(0, 10) || displayDate;

  const dashboard = buildDashboardData({
    asOf: `${newestDataDate} 盤後`,
    generatedAt: runAt,
    source: "generated",
    marketIndex,
    institutional,
    institutionalHistory,
    futuresOpenInterest,
    credit,
    creditHistory,
    updateStatus,
    sectionUpdates,
    sourceIssues
  });

  await fs.mkdir(path.dirname(LATEST_PATH), { recursive: true });
  await fs.writeFile(LATEST_PATH, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  await writeApiCallHistory({
    runAt,
    marketDate,
    trigger: process.env.MARKET_UPDATE_TRIGGER || "manual-local",
    result: {
      institutionalUpdated: institutionalAvailable,
      indexUpdated: indexAvailable,
      futuresUpdated: futuresAvailable,
      creditUpdated: creditAvailable
    },
    calls: apiCalls
  });
  console.log(`Wrote ${path.relative(ROOT, LATEST_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, API_HISTORY_PATH)}`);
}

async function tryFetchTpexBundle(config, yyyymmdd, issues) {
  const date = formatDisplayDate(yyyymmdd);
  const institutionalPayload = await tryFetchTpexInstitutional(config.sources.institutionalTpex.url, date, issues);
  const closePayload = await tryFetchJson(
    config.sources.tpexClosePrices.url.replace("{YYYYMMDD}", yyyymmdd),
    issues,
    "TPEx closing prices",
    false,
    date
  );
  const creditPayload = await tryFetchJson(
    config.sources.tpexMargin.url.replace("{YYYYMMDD}", yyyymmdd),
    issues,
    "TPEx margin trading",
    false,
    date
  );

  const institutionalRows = extractTpexInstitutionalRows(institutionalPayload);
  const closeRows = extractTpexCloseRows(closePayload);
  const creditRows = extractTpexCreditRows(creditPayload);
  updateApiCall("TPEx institutional data", date, {
    dataAvailable: institutionalRows.length > 0,
    rowCount: institutionalRows.length
  });
  updateApiCall("TPEx closing prices", date, {
    dataAvailable: closeRows.length > 0,
    rowCount: closeRows.length
  });
  updateApiCall("TPEx margin trading", date, {
    dataAvailable: creditRows.length > 0,
    rowCount: creditRows.length
  });

  return {
    institutionalRows,
    closeRows,
    creditRows
  };
}

async function tryFetchTpexInstitutional(url, date, issues) {
  try {
    const response = await fetchWithLog(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" },
      body: new URLSearchParams({ type: "Daily", sect: "EW", date, response: "json" })
    }, "TPEx institutional data", date);
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
  const requestedDate = formatDisplayDate(yyyymmdd);
  const payload = await tryFetchJson(url, issues, "TWSE T86 institutional", quiet, requestedDate);
  if (!payload) {
    updateApiCall("TWSE T86 institutional", requestedDate, { dataAvailable: false, rowCount: 0 });
    return [];
  }

  if (Array.isArray(payload)) {
    updateApiCall("TWSE T86 institutional", requestedDate, {
      dataAvailable: payload.length > 0,
      rowCount: payload.length
    });
    return payload;
  }

  if (Array.isArray(payload.data) && Array.isArray(payload.fields)) {
    const rows = payload.data.map((values) => Object.fromEntries(payload.fields.map((field, index) => [field, values[index]])));
    updateApiCall("TWSE T86 institutional", requestedDate, {
      dataAvailable: rows.length > 0,
      rowCount: rows.length
    });
    return rows;
  }

  if (!quiet) {
    issues.push("大盤三大法人買賣超回傳格式不符合預期。");
  }
  return [];
}

async function tryFetchJson(url, issues, label, quiet = false, requestedDate = null) {
  try {
    const response = await fetchWithLog(
      url,
      { headers: { "accept": "application/json,text/plain,*/*" } },
      label,
      requestedDate
    );
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
    const response = await fetchWithLog(config.sources.futuresOpenInterest.url, {
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
    }, "TAIFEX futures open interest", displayDate);

    if (!response.ok) {
      issues.push(`期交所台股期貨未平倉讀取失敗：HTTP ${response.status}`);
      return {};
    }

    const result = parseTaifexFuturesOpenInterestHtml(await response.text());
    updateApiCall("TAIFEX futures open interest", displayDate, {
      dataAvailable: hasFuturesNet(result),
      rowCount: hasFuturesNet(result) ? 3 : 0
    });
    return result;
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
  if (!hasFuturesNet(futuresNet)) {
    return [];
  }

  return [
    { participant: "外資", long: null, short: null, net: futuresNet.futuresForeignNet },
    { participant: "投信", long: null, short: null, net: futuresNet.futuresInvestmentTrustNet },
    { participant: "自營商", long: null, short: null, net: futuresNet.futuresDealerNet }
  ];
}

function hasFuturesNet(futuresNet) {
  return [
    futuresNet?.futuresForeignNet,
    futuresNet?.futuresInvestmentTrustNet,
    futuresNet?.futuresDealerNet
  ].some((value) => Number(value) !== 0);
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

async function fetchWithLog(url, options, source, requestedDate = null) {
  const entry = {
    source,
    requestedDate,
    calledAt: taipeiTimestamp(),
    url,
    httpStatus: null,
    ok: false,
    dataAvailable: null,
    rowCount: null,
    message: null
  };
  apiCalls.push(entry);

  try {
    const response = await fetch(url, options);
    entry.httpStatus = response.status;
    entry.ok = response.ok;
    if (!response.ok) {
      entry.message = `HTTP ${response.status}`;
    }
    return response;
  } catch (error) {
    entry.message = error.message;
    throw error;
  }
}

function updateApiCall(source, requestedDate, details) {
  const entry = [...apiCalls].reverse().find((item) => (
    item.source === source && item.requestedDate === requestedDate
  ));
  if (entry) {
    Object.assign(entry, details);
  }
}

function buildPreviousSectionUpdates(previous, checkedAt) {
  const generatedAt = previous?.generatedAt || null;
  const institutionalDate = previous?.institutionalHistory?.[0]?.date || null;
  const creditDate = fullCreditDate(previous?.creditHistory?.[0]?.date, previous?.asOf);

  return {
    index: {
      dataDate: previous?.sectionUpdates?.index?.dataDate || previous?.marketIndex?.date || institutionalDate,
      updatedAt: previous?.sectionUpdates?.index?.updatedAt || generatedAt,
      lastCheckedAt: checkedAt,
      status: "stale"
    },
    institutional: {
      dataDate: previous?.sectionUpdates?.institutional?.dataDate || institutionalDate,
      updatedAt: previous?.sectionUpdates?.institutional?.updatedAt || generatedAt,
      lastCheckedAt: checkedAt,
      status: "stale"
    },
    futures: {
      dataDate: previous?.sectionUpdates?.futures?.dataDate || institutionalDate,
      updatedAt: previous?.sectionUpdates?.futures?.updatedAt || generatedAt,
      lastCheckedAt: checkedAt,
      status: "stale"
    },
    credit: {
      dataDate: previous?.sectionUpdates?.credit?.dataDate || creditDate,
      updatedAt: previous?.sectionUpdates?.credit?.updatedAt || generatedAt,
      lastCheckedAt: checkedAt,
      status: "stale"
    }
  };
}

function currentSectionUpdate(dataDate, timestamp) {
  return {
    dataDate,
    updatedAt: timestamp,
    lastCheckedAt: timestamp,
    status: "current"
  };
}

function staleSectionUpdate(section, checkedAt) {
  return {
    dataDate: section?.dataDate || null,
    updatedAt: section?.updatedAt || null,
    lastCheckedAt: checkedAt,
    status: "stale"
  };
}

function fullCreditDate(shortDate, asOf) {
  if (!shortDate) {
    return null;
  }
  const year = String(asOf || "").slice(0, 4);
  return /^\d{4}$/.test(year) ? `${year}/${shortDate}` : shortDate;
}

function latestSectionDate(sectionUpdates) {
  return Object.values(sectionUpdates)
    .map((section) => section?.dataDate)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

async function writeApiCallHistory(entry) {
  const previous = await readJsonIfExists(API_HISTORY_PATH);
  const entries = [entry, ...(previous?.entries || [])].slice(0, API_HISTORY_LIMIT);
  const history = {
    version: "1.0.0",
    updatedAt: entry.runAt,
    entries
  };

  await fs.mkdir(path.dirname(API_HISTORY_PATH), { recursive: true });
  await fs.writeFile(API_HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`, "utf8");
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

function taipeiTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}+08:00`;
}

function buildUpdateStatus({ institutionalAvailable, futuresAvailable, creditAvailable }) {
  if (institutionalAvailable && futuresAvailable && creditAvailable) {
    return { stage: "complete", label: "當日資料已補齊" };
  }
  if (creditAvailable) {
    return { stage: "credit", label: "信用交易已更新" };
  }
  if (institutionalAvailable || futuresAvailable) {
    return { stage: "partial", label: "部分盤後資料已更新" };
  }
  return { stage: "waiting", label: "等待官方資料" };
}
