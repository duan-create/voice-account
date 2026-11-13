const aliases = {
  餐饮: ['餐饮', '吃饭', '吃面', '午餐', '早餐', '晚餐', '午饭', '早饭', '晚饭', '外卖', '外麦', '咖啡', '奶茶', '零食', '买菜', '饭店', '餐厅'],
  交通: ['交通', '地铁', '公交', '打车', '出租车', '高铁', '火车', '机票', '加油', '停车'],
  购物: ['购物', '买衣服', '衣服', '鞋子', '超市', '网购', '日用品', '手机', '电脑'],
  住宿: ['住宿', '酒店', '宾馆', '民宿', '房费', '房租'], 娱乐: ['娱乐', '电影', '游戏', '唱歌', '游玩', '门票', '演唱会', '游乐园'],
  医疗: ['买药', '药品', '看病', '挂号', '医院', '体检'], 教育: ['学费', '培训费', '补课', '教材'],
  通讯: ['话费', '流量费', '宽带'], 居住: ['水费', '电费', '燃气', '物业'], 人情: ['红包', '礼金', '份子钱'],
  工资: ['工资', '薪水'], 奖金: ['奖金', '年终奖'], 理财收益: ['理财', '利息', '分红'], 兼职: ['兼职'], 退款: ['退款', '退货款']
};

// Only category assignment changes; monetary ambiguity and confirmation stay with the existing parser.
export function enrichVoiceCategory(transcript, draft, categories) {
  const text = transcript.normalize('NFKC').replace(/吃(?:了|过)(饭|面)/g, '吃$1');
  const matches = new Set(draft.category === '其他' ? [] : [draft.category]);
  for (const c of categories) {
    if (c.archived || (c.type !== '通用' && draft.type && c.type !== draft.type)) continue;
    if ([c.name, c.label, ...(aliases[c.name] || []), ...(c.aliases || [])].some(a => a && text.includes(a))) matches.add(c.name);
  }
  return { ...draft, category: matches.size === 1 ? [...matches][0] : '其他' };
}
