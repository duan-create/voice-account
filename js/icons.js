// Lucide icon paths, ISC license: https://lucide.dev/license
const paths = {
  餐饮: '<path d="M4 3v6a2 2 0 0 0 4 0V3M6 3v19M20 22V3c-4 2-4 8 0 8"/>',
  交通: '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M8 3v8M16 3v8M8 19v3M16 19v3M7 15h2M15 15h2"/>',
  购物: '<path d="m6 3-3 5v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8l-3-5ZM3 8h18M8 12a4 4 0 0 0 8 0"/>',
  住宿: '<path d="M3 21V8l9-5 9 5v13M9 21v-7h6v7M7 9h1M16 9h1"/>',
  娱乐: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"/>',
  医疗: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  教育: '<path d="m2 9 10-5 10 5-10 5ZM6 11v6c4 3 8 3 12 0v-6M22 9v7"/>',
  工资: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18M10 12v3h4v-3"/>',
  其他: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
};
export function categoryIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  svg.innerHTML = paths[name === '居住' ? '住宿' : name] || paths.其他;
  return svg;
}
