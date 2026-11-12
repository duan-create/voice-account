const assert = require("node:assert/strict");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

const parser = import(pathToFileURL(join(__dirname, "../js/voice-parser.js")).href);

const cases = [
  ["中午吃面花了二十八块", 28, "支出", "餐饮", "中午吃面"],
  ["坐地铁支出6元", 6, "支出", "交通", "坐地铁"],
  ["买衣服花了二百零五元", 205, "支出", "购物", "买衣服"],
  ["酒店花了三百元", 300, "支出", "住宿", "酒店"],
  ["看电影花了四十五块五毛", 45.5, "支出", "娱乐", "看电影"],
  ["工资收入五千元", 5000, "收入", "其他", "工资"],
  ["收到工资五千元", 5000, "收入", "其他", "工资"],
  ["兼职赚到一百元", 100, "收入", "其他", "兼职"],
  ["买了两瓶水花了八元", 8, "支出", "其他", "买了两瓶水"],
  ["兼职赚了120.50元", 120.5, "收入", "其他", "兼职"],
  ["早餐花了三元两角五分", 3.25, "支出", "餐饮", "早餐"],
  ["公交花了两块五", 2.5, "支出", "交通", "公交"],
  ["买菜花了二十八点五元", 28.5, "支出", "餐饮", "买菜"],
  ["支出五毛", 0.5, "支出", "其他", ""],
  ["支出五分", 0.05, "支出", "其他", ""],
  ["花了半元", 0.5, "支出", "其他", ""],
  ["花了十元半", 10.5, "支出", "其他", ""],
  ["收入一万零三十元", 10030, "收入", "其他", ""],
  ["收入2万元", 20000, "收入", "其他", ""],
  ["花了２８．５０元", 28.5, "支出", "其他", ""],
  ["支出二十八", 28, "支出", "其他", ""],
  ["昨天吃饭花了28元", 28, "支出", "餐饮", "昨天吃饭"],
  ["吃饭打车花了50元", 50, "支出", "其他", "吃饭打车"],
  ["买了三个苹果", null, "支出", "其他", "买了三个苹果"],
  ["吃饭花了20元打车花了30元", null, "支出", "其他", null],
  ["吃饭大约二十八元", null, "支出", "餐饮", null],
  ["花了20到30元", null, "支出", "其他", null],
  ["支出负二十八元", null, "支出", "其他", null],
  ["支出-28元", null, "支出", "其他", null],
  ["支出零元", null, "支出", "其他", null],
  ["支出28.555元", null, "支出", "其他", null],
  ["花了三百五元", null, "支出", "其他", null],
  ["花了20元30", null, "支出", "其他", null],
  ["花了20元三瓶水", null, "支出", "其他", null],
  ["花了1,200元", null, "支出", "其他", null],
  ["吃饭花了20又打车花了30元", null, "支出", "其他", null],
  ["收入20花了30元", null, null, "其他", null],
  ["收入20元支出10元", null, null, "其他", null],
  ["今天吃面", null, "支出", "餐饮", "今天吃面"]
];

for (const [text, amount, type, category, remark] of cases) {
  test(`parse voice: ${text}`, async () => {
    const { parseVoiceBill } = await parser;
    assert.equal(typeof parseVoiceBill, "function", "Voice parser must be implemented");
    const result = parseVoiceBill(text);
    assert.equal(result.amount, amount);
    assert.equal(result.type, type);
    assert.equal(result.category, category);
    if (remark !== null) assert.equal(result.remark, remark);
    assert.equal("date" in result, false, "Dates are not inferred from speech");
  });
}
