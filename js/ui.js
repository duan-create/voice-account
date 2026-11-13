import { money } from "./finance.js";

const amounts = new WeakMap();
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function fitAmount(element, size) {
  element.style.fontSize = size;
  const fontSize = parseFloat(getComputedStyle(element).fontSize);
  if (element.scrollWidth > element.clientWidth && element.clientWidth > 0) {
    element.style.fontSize = `${fontSize * element.clientWidth / element.scrollWidth}px`;
  }
}

export function stopAmountAnimation(element) {
  amounts.get(element)?.();
}

export function animateAmount(element, value) {
  stopAmountAnimation(element);
  element.setAttribute("aria-label", money.format(value));
  if (reducedMotion() || value === 0) {
    element.textContent = money.format(value);
    return Promise.resolve();
  }
  element.textContent = "0.00";
  element.dataset.animating = "true";
  return new Promise((resolve) => {
    let frame;
    const start = performance.now();
    const finish = () => {
      cancelAnimationFrame(frame);
      delete element.dataset.animating;
      amounts.delete(element);
      resolve();
    };
    amounts.set(element, finish);
    function tick(now) {
      const progress = Math.min(1, (now - start) / 240);
      element.textContent = money.format(value * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { element.textContent = money.format(value); finish(); }
    }
    frame = requestAnimationFrame(tick);
  });
}

export function setupDisclosure(button, panel) {
  let animation;
  button.addEventListener("click", () => {
    const expand = button.getAttribute("aria-expanded") !== "true";
    const height = panel.hidden ? 0 : panel.getBoundingClientRect().height;
    animation?.cancel();
    button.setAttribute("aria-expanded", String(expand));
    panel.hidden = false;
    panel.inert = !expand;
    if (reducedMotion()) { panel.hidden = !expand; return; }
    animation = panel.animate([{ height: `${height}px`, opacity: expand ? 0.3 : 1 },
      { height: `${expand ? panel.scrollHeight : 0}px`, opacity: expand ? 1 : 0 }],
    { duration: 220, easing: "ease-out" });
    animation.onfinish = () => { panel.hidden = !expand; animation = null; };
  });
}

export function requestDelete(description, updateViewport, { title = '删除这笔账单？', confirm = '确认删除' } = {}) {
  const dialog = document.querySelector("#delete-dialog");
  if (dialog.open) return Promise.resolve(false);
  document.querySelector("#delete-description").textContent = description;
  document.querySelector('#delete-title').textContent = title;
  document.querySelector('#confirm-delete').textContent = confirm;
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
    updateViewport();
    document.querySelector("#cancel-delete").focus();
  });
}
