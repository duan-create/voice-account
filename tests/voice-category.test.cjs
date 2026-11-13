const assert = require('node:assert/strict');
const { test } = require('node:test');
test('category adapter extends clear aliases without changing amount, type or note', async () => {
  const { parseVoiceBill } = await import('../js/voice-parser.js');
  const { enrichVoiceCategory } = await import('../js/voice-category.js');
  const { DEFAULT_CATEGORIES } = await import('../js/categories.js');
  for (const [text, expected] of [['工资收入五千元', '工资'], ['买药花了28元', '医疗'], ['学费支出800元', '教育'], ['话费支出50元', '通讯'], ['奖金收入500元', '奖金'], ['股票分红收入20元', '理财收益'], ['中午吃面花了二十八块', '餐饮'], ['酒店花了三百元', '住宿']]) {
    const original = parseVoiceBill(text), result = enrichVoiceCategory(text, original, DEFAULT_CATEGORIES);
    assert.deepEqual(result, { ...original, category: expected });
  }
  const text = '学费大约二十八元';
  assert.equal(enrichVoiceCategory(text, parseVoiceBill(text), DEFAULT_CATEGORIES).amount, null);
  const ambiguous = '吃饭打车花了50元补课';
  assert.equal(enrichVoiceCategory(ambiguous, parseVoiceBill(ambiguous), DEFAULT_CATEGORIES).category, '其他');
});
test('custom aliases require a unique active matching category; ambiguity stays other', async () => {
  const { enrichVoiceCategory } = await import('../js/voice-category.js');
  const { DEFAULT_CATEGORIES } = await import('../js/categories.js');
  const draft = { amount: null, type: '支出', category: '其他', remark: '原备注' };
  const custom = { name: '宠物', label: '宠物', type: '支出', aliases: ['猫粮'], archived: false };
  assert.equal(enrichVoiceCategory('买猫粮', draft, [...DEFAULT_CATEGORIES, custom]).category, '宠物');
  assert.equal(enrichVoiceCategory('买猫粮和药品', draft, [...DEFAULT_CATEGORIES, custom]).category, '其他');
  assert.equal(enrichVoiceCategory('买猫粮', draft, [...DEFAULT_CATEGORIES, { ...custom, archived: true }]).category, '其他');
  assert.equal(enrichVoiceCategory('买猫粮', draft, [custom, { ...custom, name: '日用' }]).category, '其他');
});
