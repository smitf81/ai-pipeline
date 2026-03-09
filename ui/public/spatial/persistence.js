export async function loadWorkspace() {
  const res = await fetch('/api/spatial/workspace');
  if (!res.ok) throw new Error('Failed to load workspace');
  return res.json();
}

export async function saveWorkspace(payload) {
  const res = await fetch('/api/spatial/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save workspace');
  return res.json();
}
