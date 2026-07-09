function normalizeInstitutionalSummary({ twseRows = [], tpexRows = [] } = {}) {
  return [
    aggregateInstitutionalMarket("大盤", twseRows),
    aggregateInstitutionalMarket("櫃買", tpexRows)
  ];
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
  futuresOpenInterest = [],
  credit = [],
  sourceIssues = []
} = {}) {
  return {
    asOf,
    source,
    summary: {
      institutionalNet: sumBy(institutional, "total"),
      futuresNetOpenInterest: sumBy(futuresOpenInterest, "net"),
      marginChange: sumBy(credit, "marginChange"),
      shortChange: sumBy(credit, "shortChange")
    },
    institutional,
    futuresOpenInterest,
    credit,
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

module.exports = {
  buildDashboardData,
  normalizeInstitutionalSummary,
  normalizeCreditSummary,
  normalizeFuturesOpenInterest,
  sumBy,
  numberFrom,
  textFrom
};
