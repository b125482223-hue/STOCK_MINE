const assert = require("node:assert/strict");
const {
  buildDashboardData,
  normalizeInstitutionalSummary,
  normalizeCreditSummary,
  normalizeFuturesOpenInterest,
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
  credit
});

assert.equal(dashboard.asOf, "2026-07-10 15:30");
assert.equal(dashboard.institutional.length, 2);
assert.equal(dashboard.futuresOpenInterest.length, 3);
assert.equal(dashboard.credit.length, 2);
assert.equal(dashboard.summary.institutionalNet, 1350);
assert.equal(dashboard.summary.futuresNetOpenInterest, 2500);
assert.equal(dashboard.summary.marginChange, 200);

console.log("normalizers.test.js passed");
