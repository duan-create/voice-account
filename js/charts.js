import { money } from "./finance.js";

function surface(canvas, height) {
  const width = canvas.getBoundingClientRect().width;
  if (!width) return null;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return { ctx, width, height };
}

export function setupCharts(pie, trend, onSelect) {
  let statistics;
  let selected;
  let slices = [];

  function draw() {
    if (!statistics) return;
    const circle = surface(pie, pie.getBoundingClientRect().width);
    slices = [];
    if (circle) {
      const { ctx, width } = circle;
      const center = width / 2;
      const radius = width * 0.43;
      let start = -Math.PI / 2;
      if (!statistics.expense) {
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#edf1f6";
        ctx.fill();
        ctx.fillStyle = "#657184";
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("本月暂无支出", center, center + 5);
      }
      for (const category of statistics.categories.filter((item) => item.amount > 0)) {
        const end = start + category.amount / statistics.expense * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = category.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = selected === category.name ? 4 : 2;
        ctx.stroke();
        slices.push({ name: category.name, start, end, center, radius });
        start = end;
      }
      pie.setAttribute("aria-label", `本月分类支出，总计 ${money.format(statistics.expense)} 元`);
    }
    const chart = surface(trend, 220);
    if (!chart) return;
    const { ctx, width, height } = chart;
    const left = 48;
    const right = width - 18;
    const top = 20;
    const bottom = height - 34;
    const max = Math.max(1, ...statistics.months.flatMap((item) => [item.income, item.expense]));
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.lineWidth = 1;
    for (let index = 0; index < 4; index += 1) {
      const y = top + (bottom - top) * index / 3;
      const value = max * (3 - index) / 3;
      ctx.strokeStyle = "#e9edf3";
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillStyle = "#657184";
      ctx.fillText(value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value >= 1000 ? `${(value / 1000).toFixed(1)}千` : String(Math.round(value)), left - 6, y + 4);
    }
    const x = (index) => left + (right - left) * index / 5;
    ctx.textAlign = "center";
    statistics.months.forEach((month, index) => ctx.fillText(month.label, x(index), height - 10));
    for (const [type, color] of [["income", "#238779"], ["expense", "#527dc9"]]) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      statistics.months.forEach((month, index) => {
        const y = bottom - month[type] / max * (bottom - top);
        if (index === 0) ctx.moveTo(x(index), y);
        else ctx.lineTo(x(index), y);
      });
      ctx.stroke();
      statistics.months.forEach((month, index) => {
        ctx.beginPath();
        ctx.arc(x(index), bottom - month[type] / max * (bottom - top), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  pie.addEventListener("click", (event) => {
    const bounds = pie.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const slice = slices.find((item) => {
      const distance = Math.hypot(x - item.center, y - item.center);
      let angle = Math.atan2(y - item.center, x - item.center);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      return distance <= item.radius && angle >= item.start && angle <= item.end;
    });
    if (slice) onSelect(slice.name);
  });
  const observer = new ResizeObserver(draw);
  observer.observe(pie);
  observer.observe(trend);
  return { update(data, category) { statistics = data; selected = category; draw(); } };
}
