export function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

export function equal(actual, expected, message = 'Expected values to be equal') {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

export function deepEqual(actual, expected, message = 'Expected values to match') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
}
