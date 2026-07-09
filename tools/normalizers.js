function normalizeInstitutionalSummary({ twseRows = [], tpexRows = [] } = {}) {
  return [
    aggregateInstitutionalMarket("大盤", twseRows),
    aggregateInstitutionalMarket("櫃買", tpexRows)
  ];
}

function normalizeInstitutionalHistory(rows = []) {
  return rows.map((row) => ({
    date: textFrom(row, ["date", "日期"]),
    foreignNonDealer: numberFrom(row, ["foreignNonDealer", "外資不含自營商"]),
    foreignDealer: numberFrom(row, ["foreignDealer", "外資自營商"]),
    foreignTotal: numberFrom(row, ["foreignTotal", "外資合計"]),
    investmentTrust: numberFrom(row, ["investmentTrust", "投信"]),
    dealerProprietary: numberFrom(row, ["dealerProprietary", "自營自行買賣"]),
    dealerHedge: numberFrom(row, ["dealerHedge", "自營避險"]),
    dealerTotal: numberFrom(row, ["dealerTotal", "自營合計"]),
    total: numberFrom(row, ["total", "總和"]),
    futuresForeignNet: numberFrom(row, ["futuresForeignNet", "外資未平倉"]),
    futuresInvestmentTrustNet: numberFrom(row, ["futuresInvestmentTrustNet", "投信未平倉"]),
    futuresDealerNet: numberFrom(row, ["futuresDealerNet", "自營未平倉"]),
    futuresTotalNet: numberFrom(row, ["futuresTotalNet", "未平倉總和"])
  })).filter((row) => row.date);
}

function buildClosePriceMap(rows = []) {
  const prices = new Map();

  rows.forEach((row) => {
    const code = textFrom(row, ["證券代號", "code"]);
    const close = numberFrom(row, ["收盤價", "close"]);
    if (code && close) {
      prices.set(code, close);
    }
  });

  return prices;
}

function buildInstitutionalHistoryRow({
  date,
  twseRows = [],
  closePriceMap = new Map(),
  tpexRows = [],
  tpexClosePriceMap = new Map(),
  futuresNet = {}
} = {}) {
  const fields = {
    foreignNonDealer: 0,
    foreignDealer: 0,
    foreignTotal: 0,
    investmentTrust: 0,
    dealerProprietary: 0,
    dealerHedge: 0,
    dealerTotal: 0,
    total: 0
  };

  twseRows.forEach((row) => {
    const code = textFrom(row, ["證券代號", "code"]);
    const close = closePriceMap.get(code);
    if (!close) {
      return;
    }

    addAmount(fields, "foreignNonDealer", row, ["外陸資買賣超股數(不含外資自營商)", "foreignNonDealer"], close);
    addAmount(fields, "foreignDealer", row, ["外資自營商買賣超股數", "foreignDealer"], close);
    addAmount(fields, "investmentTrust", row, ["投信買賣超股數", "investmentTrust"], close);
    addAmount(fields, "dealerProprietary", row, ["自營商買賣超股數(自行買賣)", "dealerProprietary"], close);
    addAmount(fields, "dealerHedge", row, ["自營商買賣超股數(避險)", "dealerHedge"], close);
    addAmount(fields, "dealerTotal", row, ["自營商買賣超股數", "dealerTotal"], close);
    addAmount(fields, "total", row, ["三大法人買賣超股數", "total"], close);
  });

  // TPEx uses the same net-share fields after the updater normalizes its table.
  tpexRows.forEach((row) => {
    const close = tpexClosePriceMap.get(textFrom(row, ["code"]));
    if (!close) {
      return;
    }

    addAmount(fields, "foreignNonDealer", row, ["foreignNonDealer"], close);
    addAmount(fields, "foreignDealer", row, ["foreignDealer"], close);
    addAmount(fields, "investmentTrust", row, ["investmentTrust"], close);
    addAmount(fields, "dealerProprietary", row, ["dealerProprietary"], close);
    addAmount(fields, "dealerHedge", row, ["dealerHedge"], close);
    addAmount(fields, "dealerTotal", row, ["dealerTotal"], close);
    addAmount(fields, "total", row, ["total"], close);
  });

  fields.foreignTotal = fields.foreignNonDealer + fields.foreignDealer;

  return {
    date,
    foreignNonDealer: round2(fields.foreignNonDealer),
    foreignDealer: round2(fields.foreignDealer),
    foreignTotal: round2(fields.foreignTotal),
    investmentTrust: round2(fields.investmentTrust),
    dealerProprietary: round2(fields.dealerProprietary),
    dealerHedge: round2(fields.dealerHedge),
    dealerTotal: round2(fields.dealerTotal),
    total: round2(fields.total),
    futuresForeignNet: Number(futuresNet.futuresForeignNet) || 0,
    futuresInvestmentTrustNet: Number(futuresNet.futuresInvestmentTrustNet) || 0,
    futuresDealerNet: Number(futuresNet.futuresDealerNet) || 0,
    futuresTotalNet: Number(futuresNet.futuresTotalNet) || 0
  };
}

function addAmount(target, targetKey, row, sourceKeys, close) {
  target[targetKey] += numberFrom(row, sourceKeys) * close / 100000000;
}

function parseTaifexFuturesOpenInterestHtml(html = "") {
  const result = {
    futuresForeignNet: 0,
    futuresInvestmentTrustNet: 0,
    futuresDealerNet: 0,
    futuresTotalNet: 0
  };

  const rows = [...String(html).matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  rows.forEach((row) => {
    const cells = extractHtmlCells(row);
    const participant = cells.find((cell) => ["外資", "投信", "自營商"].includes(cell));
    if (!participant) {
      return;
    }

    const numbers = cells.map((cell) => numberFrom({ value: cell }, ["value"], NaN)).filter(Number.isFinite);
    const netOpenInterest = numbers[numbers.length - 2] || 0;

    if (participant === "外資") {
      result.futuresForeignNet = netOpenInterest;
    } else if (participant === "投信") {
      result.futuresInvestmentTrustNet = netOpenInterest;
    } else if (participant === "自營商") {
      result.futuresDealerNet = netOpenInterest;
    }
  });

  result.futuresTotalNet = result.futuresForeignNet + result.futuresInvestmentTrustNet + result.futuresDealerNet;
  return result;
}

function extractHtmlCells(rowHtml) {
  return [...String(rowHtml).matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function aggregateInstitutionalMarket(market, rows) {
  const result = {
    market,
    foreign: 0,
    investmentTrust: 0,
    dealer: 0,
    total: 0
  };

  rows.forEach((row) => {
    const foreign = numberFrom(row, ["外陸資買賣超股數(不含外資自營商)", "外資買賣超股數", "foreign"]);
    const investmentTrust = numberFrom(row, ["投信買賣超股數", "investmentTrust", "investment_trust"]);
    const dealer = numberFrom(row, ["自營商買賣超股數", "dealer"]);
    const total = numberFrom(row, ["三大法人買賣超股數", "total"], foreign + investmentTrust + dealer);

    result.foreign += foreign;
    result.investmentTrust += investmentTrust;
    result.dealer += dealer;
    result.total += total;
  });

  return result;
}

function normalizeCreditSummary({ twseRows = [], tpexRows = [] } = {}) {
  return [
    aggregateCreditMarket("大盤", twseRows),
    aggregateCreditMarket("櫃買", tpexRows)
  ];
}

function normalizeCreditHistory(rows = []) {
  return rows.map((row) => ({
    date: textFrom(row, ["date", "日期"]),
    marginBalance: numberFrom(row, ["marginBalance", "融資餘額", "融資今日餘額"]),
    marginChange: numberFrom(row, ["marginChange", "融資增減", "增減"]),
    marginMaintenanceRatio: numberFrom(row, ["marginMaintenanceRatio", "融資維持率", "維持率"]),
    shortBalance: numberFrom(row, ["shortBalance", "融券餘額", "融券今日餘額"]),
    shortChange: numberFrom(row, ["shortChange", "融券增減"])
  })).filter((row) => row.date);
}

function aggregateCreditMarket(market, rows) {
  const result = {
    market,
    marginBalance: 0,
    marginChange: 0,
    shortBalance: 0,
    shortChange: 0
  };

  rows.forEach((row) => {
    const marginBalance = numberFrom(row, ["融資今日餘額", "marginBalance"]);
    const marginPrevious = numberFrom(row, ["融資前日餘額", "marginPrevious"]);
    const shortBalance = numberFrom(row, ["融券今日餘額", "shortBalance"]);
    const shortPrevious = numberFrom(row, ["融券前日餘額", "shortPrevious"]);

    result.marginBalance += marginBalance;
    result.marginChange += numberFrom(row, ["融資增減", "marginChange"], marginBalance - marginPrevious);
    result.shortBalance += shortBalance;
    result.shortChange += numberFrom(row, ["融券增減", "shortChange"], shortBalance - shortPrevious);
  });

  return result;
}

function normalizeFuturesOpenInterest(rows = []) {
  return rows.map((row) => {
    const long = numberFrom(row, ["long", "多方未平倉口數", "多方"]);
    const short = numberFrom(row, ["short", "空方未平倉口數", "空方"]);

    return {
      participant: textFrom(row, ["participant", "身份別", "身分別", "交易人類別"]),
      long,
      short,
      net: numberFrom(row, ["net", "多空淨額"], long - short)
    };
  }).filter((row) => row.participant);
}

function buildDashboardData({
  asOf,
  source = "generated",
  institutional = [],
  institutionalHistory = [],
  futuresOpenInterest = [],
  credit = [],
  creditHistory = [],
  sourceIssues = []
} = {}) {
  return {
    asOf,
    source,
    summary: {
      institutionalNet: sumBy(institutional, "total"),
      futuresNetOpenInterest: sumBy(futuresOpenInterest, "net"),
      marginBalance: creditHistory[0]?.marginBalance ?? sumBy(credit, "marginBalance"),
      marginChange: creditHistory[0]?.marginChange ?? sumBy(credit, "marginChange"),
      shortChange: sumBy(credit, "shortChange")
    },
    institutional,
    institutionalHistory,
    futuresOpenInterest,
    credit,
    creditHistory,
    sourceIssues
  };
}

function sumBy(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
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

  const value = Number(String(row[key]).replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(value) ? value : fallback;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

module.exports = {
  buildDashboardData,
  buildClosePriceMap,
  buildInstitutionalHistoryRow,
  normalizeInstitutionalSummary,
  normalizeInstitutionalHistory,
  normalizeCreditSummary,
  normalizeCreditHistory,
  normalizeFuturesOpenInterest,
  parseTaifexFuturesOpenInterestHtml,
  sumBy,
  numberFrom,
  textFrom
};
