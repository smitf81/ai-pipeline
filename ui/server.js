const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// Serve static assets from ui/public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Paths
const UI_DIR = __dirname;                 // .../ui
const ROOT = path.join(__dirname, '..');  // repo root (ai-pipeline)

// Helper to read a file relative to repo root
function readFile(relPath, parseJson = false) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(ROOT, relPath);
    fs.readFile(fullPath, 'utf8', (err, data) => {
      if (err) return reject(err);
      if (parseJson) {
        try { return resolve(JSON.parse(data)); }
        catch (e) { return reject(e); }
      }
      resolve(data);
    });
  });
}

// ===== Existing dashboard endpoints =====
app.get('/api/state', async (req, res) => {
  try {
    const state = await readFile('projects/emergence/state.json', true);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read state.json', details: String(err) });
  }
});

app.get('/api/decisions', async (req, res) => {
  try {
    const data = await readFile('projects/emergence/decisions.md');
    res.type('text/plain').send(data);
  } catch (err) {
    res.status(500).type('text/plain').send('Failed to read decisions.md');
  }
});

// Keep /api/tasks as TEXT because app.js expects text
app.get('/api/tasks', async (req, res) => {
  try {
    const data = await readFile('projects/emergence/tasks.md');
    res.type('text/plain').send(data);
  } catch (err) {
    res.status(500).type('text/plain').send('Failed to read tasks.md');
  }
});

app.get('/api/roadmap', async (req, res) => {
  try {
    const roadmap = await readFile('projects/emergence/roadmap.md');
    res.json({ roadmap });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read roadmap.md' });
  }
});

app.get('/api/changelog', async (req, res) => {
  try {
    const changelog = await readFile('projects/emergence/changelog.md');
    res.json({ changelog });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read changelog.md' });
  }
});

// ===== New pipeline control endpoints =====
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await readFile('projects.json', true);
    res.json(projects || {});
  } catch (err) {
    // If projects.json doesn't exist yet, return empty object
    res.json({});
  }
});

app.post('/api/run', (req, res) => {
  const { cmd, task_id, project, model } = req.body || {};

  if (!cmd || !task_id || !project) {
    return res.status(400).json({ error: 'Missing required fields: cmd, task_id, project' });
  }

  const aiPath = path.join(ROOT, 'runner', 'ai.py');

  const args = [aiPath, cmd, String(task_id), '--project', String(project)];
  if (model) args.push('--model', String(model));

  const proc = spawn('python', args, { cwd: ROOT, windowsHide: true });

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (d) => stdout += d.toString());
  proc.stderr.on('data', (d) => stderr += d.toString());

  proc.on('close', (code) => {
    res.json({ ok: code === 0, exitCode: code, stdout, stderr });
  });
});

// Start server
app.listen(port, () => {
  console.log(`AI Core Engine UI running at http://localhost:${port}`);
});
