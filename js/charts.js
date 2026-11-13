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
      const radius = width * 0.39;
      let start = -Math.PI / 2;
      if (!statistics.expense) {
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#edf2fa";
        ctx.fill();
      }
      for (const category of statistics.categories.filter((item) => item.amount > 0)) {
        const end = start + category.amount / statistics.expense * Math.PI * 2;
        const middle = (start + end) / 2;
        const offset = selected === category.name ? width * 0.045 : 0;
        const cx = center + Math.cos(middle) * offset;
        const cy = center + Math.sin(middle) * offset;
        ctx.save();
        ctx.shadowColor = selected === category.name ? "#283e6640" : "#283e661c";
        ctx.shadowBlur = selected === category.name ? 10 : 5;
        ctx.shadowOffsetY = 3;
        ctx.beginPath();
        if (category.amount !== statistics.expense) ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        const fill = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
        fill.addColorStop(0, category.color); fill.addColorStop(1, `${category.color}b5`);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "#f8fafc";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        slices.push({ name: category.name, start, end, cx, cy, radius });
        start = end;
      }
      pie.setAttribute("aria-label", `${statistics.key} 分类支出，总计 ${money.format(statistics.expense)} 元`);
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
      ctx.strokeStyle = "#e9eef5";
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillStyle = "#657184";
      ctx.fillText(value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value >= 1000 ? `${(value / 1000).toFixed(1)}千` : value >= 10 ? String(Math.round(value)) : value.toFixed(1), left - 6, y + 4);
    }
    const x = (index) => left + (right - left) * index / Math.max(1, statistics.months.length - 1);
    ctx.textAlign = "center";
    statistics.months.forEach((month, index) => { if (statistics.months.length <= 6 || index % 2 === 0 || index === 11) ctx.fillText(month.label, x(index), height - 10); });
    if (statistics.yearly) {
      const step = (right - left) / 12, bar = Math.max(2, step * 0.3);
      statistics.months.forEach((month, index) => {
        for (const [type, color, offset] of [['income', '#a76e7c', -bar], ['expense', '#578e85', 0]]) {
          const h = month[type] / max * (bottom - top);
          const fill = ctx.createLinearGradient(0, bottom - h, 0, bottom);
          fill.addColorStop(0, color); fill.addColorStop(1, `${color}70`); ctx.fillStyle = fill;
          ctx.fillRect(left + step * (index + 0.5) + offset, bottom - h, bar - 1, h);
        }
      });
      return;
    }
    for (const [type, color] of [["income", "#a76e7c"], ["expense", "#578e85"]]) {
      const points = statistics.months.map((month, index) => [x(index), bottom - month[type] / max * (bottom - top)]);
      const fill = ctx.createLinearGradient(0, top, 0, bottom);
      fill.addColorStop(0, `${color}30`);
      fill.addColorStop(1, `${color}02`);
      ctx.beginPath();
      ctx.moveTo(left, bottom);
      points.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.lineTo(right, bottom);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      points.forEach(([px, py], index) => {
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      statistics.months.forEach((month, index) => {
        ctx.beginPath();
        ctx.arc(x(index), bottom - month[type] / max * (bottom - top), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
  }

  pie.addEventListener("click", (event) => {
    const bounds = pie.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const slice = [...slices].sort((a, b) => Number(b.name === selected) - Number(a.name === selected)).find((item) => {
      const distance = Math.hypot(x - item.cx, y - item.cy);
      let angle = Math.atan2(y - item.cy, x - item.cx);
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
