export function createSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function random() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}
