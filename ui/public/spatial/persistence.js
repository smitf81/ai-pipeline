export async function loadWorkspace() {
  const res = await fetch('/api/spatial/workspace');
  if (!res.ok) throw new Error('Failed to load workspace');
  return res.json();
}

function logPayloadSizes(payload = {}, label = 'workspace') {
  try {
    const json = JSON.stringify(payload);
    console.log(`${label} payload bytes:`, new Blob([json]).size);
  } catch (error) {
    console.log(`${label} payload logging failed`, error);
  }
  for (const [key, value] of Object.entries(payload || {})) {
    try {
      const json = JSON.stringify(value);
      console.log(`${label} key "${key}": ${new Blob([json]).size} bytes`);
    } catch (err) {
      console.log(`${label} key "${key}": could not measure`, err);
    }
  }
}

async function sendSave(endpoint, label, payload = {}) {
  logPayloadSizes(payload, label);
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${label} save failed`);
  return res.json();
}

export async function saveWorkspace(payload) {
  return sendSave('/api/spatial/workspace', 'workspace', payload);
}

export async function savePages(payload) {
  return sendSave('/api/spatial/pages', 'pages', payload);
}

export async function saveIntentState(payload) {
  return sendSave('/api/spatial/intent-state', 'intent-state', payload);
}

export async function saveStudioState(payload) {
  return sendSave('/api/spatial/studio-state', 'studio-state', payload);
}

export async function saveArchitectureMemory(payload) {
  return sendSave('/api/spatial/architecture-memory', 'architecture-memory', payload);
}
