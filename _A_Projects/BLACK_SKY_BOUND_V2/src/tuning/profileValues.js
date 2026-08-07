export function getProfileValue(profile, path) {
  let cursor = profile;
  for (const part of String(path || '').split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}
