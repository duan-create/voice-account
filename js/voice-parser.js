import Nzh from "./vendor/nzh-cn.js";

const digits = "零一二三四五六七八九";
const numberPattern = "[0-9零一二三四五六七八九十百千万亿点.]+";
const singleDigit = "[0-9零一二三四五六七八九]";
const moneyPattern = new RegExp(`(?:${numberPattern}|半)(?:元|块)(?:钱)?(?:${singleDigit}(?:角|毛)(?:${singleDigit}分)?|${singleDigit}分|半|${singleDigit}(?=[，。！？,!?\\s]|$))?|${singleDigit}(?:角|毛)(?:${singleDigit}分)?|${singleDigit}分`, "g");
const expensePattern = /花了|花费|支出|支付|付了|消费/g;
const incomePattern = /赚了|赚到|收入|收到|入账/g;
const categoryRules = [
  ["餐饮", /餐饮|吃饭|吃面|午餐|早餐|晚餐|午饭|早饭|晚饭|外卖|咖啡|奶茶|买菜|饭店|餐厅/],
  ["交通", /交通|地铁|公交|打车|出租车|高铁|火车|机票|加油|停车/],
  ["购物", /购物|买衣服|衣服|鞋子|超市|网购|日用品|手机|电脑/],
  ["住宿", /住宿|酒店|宾馆|民宿|房费|房租/],
  ["娱乐", /娱乐|电影|游戏|唱歌|门票|演唱会|游乐园/]
];

function parseNumber(text) {
  if (text === "半") return 0.5;
  if (/^\d+(?:\.\d{1,2})?$/.test(text)) return Number(text);
  const scaled = /^(\d+(?:\.\d{1,2})?)(万|亿)$/.exec(text);
  if (scaled) return Number(scaled[1]) * (scaled[2] === "万" ? 10000 : 100000000);
  if (!/^[零一二三四五六七八九十百千万亿]+(?:点[零一二三四五六七八九]{1,2})?$/.test(text)) return null;
  const [integer, decimal] = text.split("点");
  const value = Nzh.decodeS(integer);
  // Reject shorthand such as 三百五: it can mean either 305 or 350.
  if (Nzh.encodeS(value).replace(/^一十/, "十") !== integer.replace(/^一十/, "十")) return null;
  return value + (decimal ? Number(`0.${[...decimal].map((char) => digits.indexOf(char)).join("")}`) : 0);
}

function parseMoney(text) {
  const parts = /^(.*?)(?:元|块)(?:钱)?(.*)$/.exec(text);
  const base = parts ? parseNumber(parts[1]) : 0;
  const fraction = parts ? parts[2] : text;
  if (base === null) return null;
  if (!fraction) return base;
  if (!Number.isInteger(base)) return null;
  if (fraction === "半") return base + 0.5;
  if (new RegExp(`^${singleDigit}$`).test(fraction)) return base + parseNumber(fraction) / 10;
  const match = new RegExp(`^(?:(${singleDigit})(?:角|毛))?(?:(${singleDigit})分)?$`).exec(fraction);
  if (!match) return null;
  return Math.round(base * 100 + (match[1] ? parseNumber(match[1]) * 10 : 0) + (match[2] ? parseNumber(match[2]) : 0)) / 100;
}

export function parseVoiceBill(transcript) {
  const original = transcript.normalize("NFKC").trim();
  const text = original.replace(/两/g, "二").replace(/〇/g, "零");
  const income = new RegExp(incomePattern.source).test(text);
  const expense = new RegExp(expensePattern.source).test(text);
  const type = income && expense ? null : income ? "收入" : "支出";
  const categories = categoryRules.filter(([, rule]) => rule.test(text));
  const category = categories.length === 1 ? categories[0][0] : "其他";
  const matches = [...text.matchAll(moneyPattern)];
  // Without a currency unit, accept only a number directly following an explicit money verb.
  if (!matches.length) {
    const plainPattern = new RegExp(`(?:花了|花费|支出|支付|付了|消费|赚了|赚到|收入|收到|入账)\\s*(${numberPattern})(?=[，。！？,!?\\s]|$)`, "g");
    for (const match of text.matchAll(plainPattern)) {
      matches.push({ 0: match[1], index: match.index + match[0].indexOf(match[1]), plain: true });
    }
  }
  const candidate = matches.length === 1 ? matches[0] : null;
  let amount = candidate ? (candidate.plain ? parseNumber(candidate[0]) : parseMoney(candidate[0])) : null;
  if (candidate) {
    const before = text.slice(0, candidate.index).replace(incomePattern, "").replace(expensePattern, "");
    const after = text.slice(candidate.index + candidate[0].length);
    if (/[负\-~～至到0-9零一二三四五六七八九十百千万亿点.]\s*$/.test(before)
      || /[0-9][,，]\s*$/.test(before)
      || /^[0-9零一二三四五六七八九十百千万亿点.]/.test(after)) amount = null;
  }
  const monetaryPhrases = text.match(new RegExp(`(?:${expensePattern.source}|${incomePattern.source})\\s*${numberPattern}`, "g")) || [];
  if (type === null || monetaryPhrases.length > 1 || /大约|大概|差不多|左右|多元|多块|几|或|约\d|约[零一二三四五六七八九十百千万]/.test(text)) amount = null;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) amount = null;
  let remark = original;
  if (amount !== null && candidate) remark = original.slice(0, candidate.index) + original.slice(candidate.index + candidate[0].length);
  remark = remark.replace(expensePattern, "").replace(incomePattern, "").replace(/^[\s，。！？,!?]+|[\s，。！？,!?]+$/g, "").trim();
  return { amount, type, category, remark };
}
