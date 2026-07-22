export function addFloatingText(effects, text, x, y) {
  effects.push({ kind: 'floating_text', text, x, y, age: 0, lifetime: 1.2 });
}
