const fs = require("node:fs/promises");
const path = require("node:path");
const {
  buildDashboardData,
  normalizeInstitutionalSummary,
  normalizeCreditSummary
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
  const yyyymmdd = marketDate.replaceAll("-", "");
  const sourceIssues = [];

  const twseInstitutionalRows = await tryFetchTwseInstitutional(config, yyyymmdd, sourceIssues);
  const twseCreditRows = await tryFetchJson(config.sources.margin.url, sourceIssues, "大盤信用交易");

  const institutional = normalizeInstitutionalSummary({
    twseRows: twseInstitutionalRows,
    tpexRows: []
  });

  const credit = normalizeCreditSummary({
    twseRows: Array.isArray(twseCreditRows) ? twseCreditRows : [],
    tpexRows: previous?.credit?.filter((row) => row.market === "櫃買") || []
  });

  replaceEmptyMarket(institutional, "大盤", previous, sample, sourceIssues, "大盤三大法人買賣超");
  replaceEmptyMarket(institutional, "櫃買", previous, sample, sourceIssues, "櫃買三大法人買賣超");

  const futuresOpenInterest = previous?.futuresOpenInterest || [];
  if (futuresOpenInterest.length) {
    sourceIssues.push("三大法人未平倉沿用上一版資料，待接穩定 TAIFEX 端點。");
  }

  const dashboard = buildDashboardData({
    asOf: `${marketDate} 盤後`,
    source: "generated",
    institutional,
    futuresOpenInterest,
    credit,
    creditHistory: previous?.creditHistory || sample?.creditHistory || [],
    sourceIssues
  });

  await fs.mkdir(path.dirname(LATEST_PATH), { recursive: true });
  await fs.writeFile(LATEST_PATH, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(ROOT, LATEST_PATH)}`);
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

async function tryFetchTwseInstitutional(config, yyyymmdd, issues) {
  const url = config.sources.institutionalTwse.url.replace("{YYYYMMDD}", yyyymmdd);
  const payload = await tryFetchJson(url, issues, "大盤三大法人買賣超");
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.data) && Array.isArray(payload.fields)) {
    return payload.data.map((values) => Object.fromEntries(payload.fields.map((field, index) => [field, values[index]])));
  }

  issues.push("大盤三大法人買賣超回傳格式不符合預期。");
  return [];
}

async function tryFetchJson(url, issues, label) {
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
      issues.push(`${label}讀取失敗：回傳不是 JSON。`);
      return null;
    }
  } catch (error) {
    issues.push(`${label}讀取失敗：${error.message}`);
    return null;
  }
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
