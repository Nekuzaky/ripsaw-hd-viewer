type Child = Node | string | null | undefined | false;
type Attributes = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'className') {
      element.className = String(value);
    } else if (key === 'html') {
      element.innerHTML = String(value);
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

export function icon(svg: string): HTMLSpanElement {
  return h('span', { className: 'icon', html: svg, 'aria-hidden': 'true' });
}
