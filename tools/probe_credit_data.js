const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config", "data_sources.json");
const LATEST_PATH = path.join(ROOT, "data", "latest", "market-dashboard.json");
const HISTORY_PATH = path.join(ROOT, "data", "logs", "api-call-history.json");
const HISTORY_LIMIT = 100;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const latest = JSON.parse(await fs.readFile(LATEST_PATH, "utf8"));
  const history = JSON.parse(await fs.readFile(HISTORY_PATH, "utf8"));
  const marketDate = process.env.MARKET_DATE || taipeiDate();
  const displayDate = marketDate.replaceAll("-", "/");
  const calledAt = taipeiTimestamp();
  const url = config.sources.twseCreditHistory.url.replace("{YYYYMMDD}", marketDate.replaceAll("-", ""));

  let httpStatus = null;
  let ok = false;
  let rows = [];
  let message = null;

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "STOCK_MINE credit watchdog"
      },
      signal: AbortSignal.timeout(20000)
    });
    httpStatus = response.status;
    ok = response.ok;
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    rows = Array.isArray(payload?.tables?.[0]?.data) ? payload.tables[0].data : [];
  } catch (error) {
    message = error.message;
  }

  const dataAvailable = rows.length >= 3;
  const entry = {
    runAt: calledAt,
    marketDate,
    trigger: process.env.MARKET_UPDATE_TRIGGER || "credit-watchdog",
    schedule: process.env.MARKET_SCHEDULE || "credit-watchdog",
    result: {
      institutionalUpdated: false,
      indexUpdated: false,
      futuresUpdated: false,
      creditUpdated: false
    },
    calls: [{
      source: "TWSE credit trading watchdog",
      requestedDate: displayDate,
      calledAt,
      url,
      httpStatus,
      ok,
      dataAvailable,
      rowCount: rows.length,
      message
    }]
  };

  const section = latest.sectionUpdates?.credit;
  if (section) {
    section.lastCheckedAt = calledAt;
    section.status = section.dataDate === displayDate ? "current" : "stale";
  }

  const nextHistory = {
    ...history,
    updatedAt: calledAt,
    entries: [entry, ...(history.entries || [])].slice(0, HISTORY_LIMIT)
  };

  if (process.env.PROBE_DRY_RUN !== "1") {
    await fs.writeFile(LATEST_PATH, `${JSON.stringify(latest, null, 2)}\n`, "utf8");
    await fs.writeFile(HISTORY_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify({ marketDate, calledAt, httpStatus, dataAvailable, rowCount: rows.length, message }));
  process.exitCode = dataAvailable ? 0 : 2;
}

function taipeiDate() {
  const parts = dateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function taipeiTimestamp() {
  const parts = dateParts(true);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function dateParts(includeTime = false) {
  const options = {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  };
  if (includeTime) {
    Object.assign(options, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
  }
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", options)
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return values;
}
