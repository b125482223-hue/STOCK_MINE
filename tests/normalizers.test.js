const assert = require("node:assert/strict");
const {
  buildDashboardData,
  buildClosePriceMap,
  buildInstitutionalHistoryRow,
  normalizeInstitutionalSummary,
  normalizeInstitutionalHistory,
  normalizeCreditHistory,
  normalizeCreditSummary,
  normalizeFuturesOpenInterest,
  parseTaifexFuturesOpenInterestHtml,
  sumBy
} = require("../tools/normalizers");

const institutional = normalizeInstitutionalSummary({
  asOf: "2026-07-10",
  twseRows: [
    { "外陸資買賣超股數(不含外資自營商)": "1,000", "投信買賣超股數": "200", "自營商買賣超股數": "-50" },
    { "外陸資買賣超股數(不含外資自營商)": "-100", "投信買賣超股數": "20", "自營商買賣超股數": "10" }
  ],
  tpexRows: [
    { foreign: "300", investmentTrust: "-50", dealer: "20" }
  ]
});

assert.equal(institutional.length, 2);
assert.deepEqual(institutional[0], {
  market: "大盤",
  foreign: 900,
  investmentTrust: 220,
  dealer: -40,
  total: 1080
});
assert.deepEqual(institutional[1], {
  market: "櫃買",
  foreign: 300,
  investmentTrust: -50,
  dealer: 20,
  total: 270
});

const credit = normalizeCreditSummary({
  twseRows: [
    { "融資今日餘額": "10,500", "融資前日餘額": "10,000", "融券今日餘額": "800", "融券前日餘額": "900" }
  ],
  tpexRows: [
    { marginBalance: "2,000", marginPrevious: "2,300", shortBalance: "100", shortPrevious: "80" }
  ]
});

assert.deepEqual(credit[0], {
  market: "大盤",
  marginBalance: 10500,
  marginChange: 500,
  shortBalance: 800,
  shortChange: -100
});
assert.deepEqual(credit[1], {
  market: "櫃買",
  marginBalance: 2000,
  marginChange: -300,
  shortBalance: 100,
  shortChange: 20
});

const creditHistory = normalizeCreditHistory([
  {
    date: "07/09",
    marginBalance: "6196.48",
    marginChange: "58.32",
    marginMaintenanceRatio: "186.65%",
    shortBalance: "203714",
    shortChange: "-1200"
  },
  {
    date: "07/08",
    marginBalance: "6138.16",
    marginChange: "28.71",
    marginMaintenanceRatio: "186.83%",
    shortBalance: "205830",
    shortChange: "320"
  }
]);

assert.deepEqual(creditHistory[0], {
  date: "07/09",
  marginBalance: 6196.48,
  marginChange: 58.32,
  marginMaintenanceRatio: 186.65,
  shortBalance: 203714,
  shortChange: -1200
});

const institutionalHistory = normalizeInstitutionalHistory([
  {
    date: "2026/07/09",
    foreignNonDealer: "-472.53",
    foreignDealer: "0",
    foreignTotal: "-472.53",
    investmentTrust: "199.01",
    dealerProprietary: "-20.36",
    dealerHedge: "-56.35",
    dealerTotal: "-76.71",
    total: "-350.23",
    futuresForeignNet: "-80730",
    futuresInvestmentTrustNet: "71089",
    futuresDealerNet: "2243",
    futuresTotalNet: "-6798"
  }
]);

assert.deepEqual(institutionalHistory[0], {
  date: "2026/07/09",
  foreignNonDealer: -472.53,
  foreignDealer: 0,
  foreignTotal: -472.53,
  investmentTrust: 199.01,
  dealerProprietary: -20.36,
  dealerHedge: -56.35,
  dealerTotal: -76.71,
  total: -350.23,
  futuresForeignNet: -80730,
  futuresInvestmentTrustNet: 71089,
  futuresDealerNet: 2243,
  futuresTotalNet: -6798
});

const closePriceMap = buildClosePriceMap([
  { "證券代號": "2330", "收盤價": "1,000" },
  { "證券代號": "2317", "收盤價": "200" }
]);

assert.equal(closePriceMap.get("2330"), 1000);

const generatedInstitutionalRow = buildInstitutionalHistoryRow({
  date: "2026/07/09",
  twseRows: [
    {
      "證券代號": "2330",
      "外陸資買賣超股數(不含外資自營商)": "1,000,000",
      "外資自營商買賣超股數": "0",
      "投信買賣超股數": "200,000",
      "自營商買賣超股數(自行買賣)": "-50,000",
      "自營商買賣超股數(避險)": "-20,000",
      "自營商買賣超股數": "-70,000",
      "三大法人買賣超股數": "1,130,000"
    },
    {
      "證券代號": "2317",
      "外陸資買賣超股數(不含外資自營商)": "-500,000",
      "外資自營商買賣超股數": "0",
      "投信買賣超股數": "100,000",
      "自營商買賣超股數(自行買賣)": "10,000",
      "自營商買賣超股數(避險)": "5,000",
      "自營商買賣超股數": "15,000",
      "三大法人買賣超股數": "-385,000"
    }
  ],
  closePriceMap,
  futuresNet: {
    futuresForeignNet: -80730,
    futuresInvestmentTrustNet: 71089,
    futuresDealerNet: 2243,
    futuresTotalNet: -6798
  }
});

assert.equal(generatedInstitutionalRow.date, "2026/07/09");
assert.equal(generatedInstitutionalRow.foreignNonDealer, 9);
assert.equal(generatedInstitutionalRow.investmentTrust, 2.2);
assert.equal(generatedInstitutionalRow.dealerTotal, -0.67);
assert.equal(generatedInstitutionalRow.total, 10.53);
assert.equal(generatedInstitutionalRow.futuresForeignNet, -80730);

const parsedFutures = parseTaifexFuturesOpenInterestHtml(`
  <tr><td>1</td><td>臺股期貨</td><td>自營商</td><td>7,489</td><td>68,392,046</td><td>8,439</td><td>77,152,690</td><td>-950</td><td>-8,760,643</td><td>7,455</td><td>68,296,266</td><td>5,212</td><td>47,769,736</td><td>2,243</td><td>20,526,530</td></tr>
  <tr><td>投信</td><td>7,421</td><td>68,185,516</td><td>5,719</td><td>52,315,804</td><td>1,702</td><td>15,869,712</td><td>77,706</td><td>710,124,202</td><td>6,017</td><td>55,009,742</td><td>71,689</td><td>655,114,460</td></tr>
  <tr><td>外資</td><td>87,694</td><td>798,802,069</td><td>87,226</td><td>794,995,895</td><td>468</td><td>3,806,174</td><td>6,562</td><td>60,008,754</td><td>87,292</td><td>797,925,628</td><td>-80,730</td><td>-737,916,874</td></tr>
`);

assert.deepEqual(parsedFutures, {
  futuresForeignNet: -80730,
  futuresInvestmentTrustNet: 71689,
  futuresDealerNet: 2243,
  futuresTotalNet: -6798
});

const futures = normalizeFuturesOpenInterest([
  { product: "TX", participant: "外資", long: "12,000", short: "10,000" },
  { product: "TX", participant: "投信", long: "2,000", short: "2,500" },
  { product: "TX", participant: "自營商", long: "4,000", short: "3,000" }
]);

assert.deepEqual(futures, [
  { participant: "外資", long: 12000, short: 10000, net: 2000 },
  { participant: "投信", long: 2000, short: 2500, net: -500 },
  { participant: "自營商", long: 4000, short: 3000, net: 1000 }
]);

assert.equal(sumBy(futures, "net"), 2500);

const dashboard = buildDashboardData({
  asOf: "2026-07-10 15:30",
  institutional,
  futuresOpenInterest: futures,
  credit,
  creditHistory,
  institutionalHistory
});

assert.equal(dashboard.asOf, "2026-07-10 15:30");
assert.equal(dashboard.institutional.length, 2);
assert.equal(dashboard.futuresOpenInterest.length, 3);
assert.equal(dashboard.credit.length, 2);
assert.equal(dashboard.creditHistory.length, 2);
assert.equal(dashboard.institutionalHistory.length, 1);
assert.equal(dashboard.summary.institutionalNet, 1350);
assert.equal(dashboard.summary.futuresNetOpenInterest, 2500);
assert.equal(dashboard.summary.marginBalance, 6196.48);
assert.equal(dashboard.summary.marginChange, 58.32);

console.log("normalizers.test.js passed");
