const fs = require('fs');
const path = require('path');

const QA_RELATIVE_DIR = path.join('data', 'spatial', 'qa');
const BROWSER_CANDIDATES = [
  process.env.ACE_QA_BROWSER || null,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const STUDIO_SIZE = { width: 1200, height: 800 };
const STUDIO_ROOM = { x: 72, y: 86, width: 1056, height: 642 };
const STUDIO_DESK_SIZE = { width: 172, height: 140 };
const STUDIO_TEAM_BOARD_SIZE = { width: 560, height: 164 };

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function ensureQAStorage(rootPath) {
  const dir = path.join(rootPath, QA_RELATIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function qaRunFilePath(rootPath, runId) {
  return path.join(ensureQAStorage(rootPath), `${runId}.json`);
}

function qaArtifactDir(rootPath, runId) {
  const dir = path.join(ensureQAStorage(rootPath), runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readQARun(rootPath, runId) {
  return readJson(qaRunFilePath(rootPath, runId), null);
}

function listQARuns(rootPath) {
  const dir = ensureQAStorage(rootPath);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(path.join(dir, entry.name), null))
    .filter(Boolean)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

function artifactRoute(runId, artifactName) {
  return `/api/spatial/qa/runs/${runId}/artifacts/${encodeURIComponent(artifactName)}`;
}

function summarizeQARun(run) {
  if (!run) return null;
  const screenshot = (run.artifacts?.screenshots || [])[0] || null;
  return {
    id: run.id,
    scenario: run.scenario,
    mode: run.mode,
    trigger: run.trigger,
    status: run.status,
    verdict: run.verdict,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    findingCount: Array.isArray(run.findings) ? run.findings.length : 0,
    highestSeverity: Array.isArray(run.findings) && run.findings.some((finding) => finding.severity === 'error')
      ? 'error'
      : (Array.isArray(run.findings) && run.findings.some((finding) => finding.severity === 'warning') ? 'warning' : 'info'),
    primaryScreenshot: screenshot ? {
      name: screenshot.name,
      label: screenshot.label,
      url: artifactRoute(run.id, screenshot.name),
    } : null,
    stepSummary: (run.steps || []).map((step) => ({
      id: step.id,
      label: step.label,
      status: step.status,
      verdict: step.verdict,
    })),
    linked: run.linked || {},
  };
}

function updateQARun(rootPath, runId, updater) {
  const current = readQARun(rootPath, runId);
  if (!current) return null;
  const next = updater({ ...current }) || current;
  writeJson(qaRunFilePath(rootPath, runId), next);
  return next;
}

function createStep(id, label, details = null) {
  return {
    id,
    label,
    details,
    status: 'pending',
    verdict: 'pending',
    startedAt: null,
    finishedAt: null,
    error: null,
  };
}

function createQARun({ scenario, mode, trigger, prompt, baseUrl, linked = {} }) {
  return {
    id: makeId('qa'),
    scenario,
    mode,
    trigger,
    prompt: prompt || null,
    baseUrl,
    status: 'running',
    verdict: 'pending',
    createdAt: nowIso(),
    finishedAt: null,
    linked,
    browser: {
      executablePath: null,
      engine: 'chromium',
    },
    steps: [
      createStep('health', 'Wait for ACE runtime'),
      createStep('launch', 'Launch browser'),
      createStep('open', 'Open ACE'),
      createStep('studio', 'Enter ACE Studio'),
      createStep('scenario', 'Run QA scenario actions'),
      createStep('capture', 'Capture artifacts'),
      createStep('analyze', 'Analyze layout and runtime'),
    ],
    findings: [],
    artifacts: {
      screenshots: [],
      domSnapshot: null,
      consoleLog: null,
      networkSummary: null,
      runtimeSnapshot: null,
      layoutFindings: null,
    },
    console: [],
    network: [],
    error: null,
  };
}

function beginStep(run, id) {
  const step = run.steps.find((entry) => entry.id === id);
  if (!step) return;
  step.status = 'running';
  step.startedAt = nowIso();
}

function finishStep(run, id, verdict = 'pass', error = null) {
  const step = run.steps.find((entry) => entry.id === id);
  if (!step) return;
  step.status = ['failed', 'blocked'].includes(verdict) ? verdict : 'completed';
  step.verdict = verdict;
  step.error = error;
  step.finishedAt = nowIso();
}

function resolveBrowserExecutable() {
  return BROWSER_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

async function waitForServiceReady(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError = null;
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
      lastError = new Error(`Health endpoint returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('ACE runtime did not become ready in time.');
}

function saveArtifact(rootPath, run, name, value, kind = 'text') {
  const target = path.join(qaArtifactDir(rootPath, run.id), name);
  if (kind === 'binary') {
    fs.writeFileSync(target, value);
  } else if (kind === 'json') {
    writeJson(target, value);
  } else {
    fs.writeFileSync(target, String(value || ''), 'utf8');
  }
  return {
    name,
    path: target,
    url: artifactRoute(run.id, name),
  };
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function resolveExpectedAnchor(fromDesk, toDesk, kind = 'workflow') {
  const source = {
    center: { x: fromDesk.x, y: fromDesk.y },
    left: fromDesk.x - (STUDIO_DESK_SIZE.width / 2),
    right: fromDesk.x + (STUDIO_DESK_SIZE.width / 2),
    top: fromDesk.y - (STUDIO_DESK_SIZE.height / 2),
    bottom: fromDesk.y + (STUDIO_DESK_SIZE.height / 2),
  };
  const target = {
    center: { x: toDesk.x, y: toDesk.y },
    left: toDesk.x - (STUDIO_DESK_SIZE.width / 2),
    right: toDesk.x + (STUDIO_DESK_SIZE.width / 2),
    top: toDesk.y - (STUDIO_DESK_SIZE.height / 2),
    bottom: toDesk.y + (STUDIO_DESK_SIZE.height / 2),
  };
  const dx = target.center.x - source.center.x;
  const dy = target.center.y - source.center.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sourceInset = kind === 'conflict' ? 18 : 12;
  const targetInset = kind === 'conflict' ? 20 : 14;
  if (horizontal) {
    return {
      startX: dx >= 0 ? source.right - sourceInset : source.left + sourceInset,
      startY: source.center.y - 4,
      endX: dx >= 0 ? target.left + targetInset : target.right - targetInset,
      endY: target.center.y - 4,
    };
  }
  return {
    startX: source.center.x,
    startY: dy >= 0 ? source.bottom - sourceInset : source.top + sourceInset,
    endX: target.center.x,
    endY: dy >= 0 ? target.top + targetInset : target.bottom - targetInset,
  };
}

function analyzeStudioSnapshot(snapshot = {}) {
  const findings = [];
  const room = snapshot.room || STUDIO_ROOM;
  const roomRect = snapshot.roomRect || null;
  const shellRect = snapshot.shellRect || null;
  const desks = Array.isArray(snapshot.desks) ? snapshot.desks : [];
  const whiteboards = Array.isArray(snapshot.whiteboards) ? snapshot.whiteboards : [];
  const links = Array.isArray(snapshot.links) ? snapshot.links : [];
  const controls = Array.isArray(snapshot.controls) ? snapshot.controls : [];

  if (roomRect && shellRect) {
    const roomCenterX = roomRect.left + (roomRect.width / 2);
    const roomCenterY = roomRect.top + (roomRect.height / 2);
    const shellCenterX = shellRect.left + (shellRect.width / 2);
    const shellCenterY = shellRect.top + (shellRect.height / 2);
    const deltaX = Math.round(Math.abs(roomCenterX - shellCenterX));
    const deltaY = Math.round(Math.abs(roomCenterY - shellCenterY));
    if (deltaX > 110 || deltaY > 110) {
      findings.push({
        id: 'camera-off-center',
        severity: 'warning',
        kind: 'camera',
        summary: 'Studio camera is not centered on the room.',
        details: `Room center drift is ${deltaX}px horizontally and ${deltaY}px vertically.`,
      });
    }
  }

  desks.forEach((desk) => {
    const insideRoom = (
      desk.x - (STUDIO_DESK_SIZE.width / 2) >= room.x
      && desk.x + (STUDIO_DESK_SIZE.width / 2) <= room.x + room.width
      && desk.y - (STUDIO_DESK_SIZE.height / 2) >= room.y
      && desk.y + (STUDIO_DESK_SIZE.height / 2) <= room.y + room.height
    );
    if (!insideRoom) {
      findings.push({
        id: `desk-outside-${desk.id}`,
        severity: 'error',
        kind: 'layout',
        relatedDeskIds: [desk.id],
        summary: `${desk.label || desk.id} sits outside the Studio room bounds.`,
        details: `Desk center is at (${desk.x}, ${desk.y}) while the room spans (${room.x}, ${room.y}) to (${room.x + room.width}, ${room.y + room.height}).`,
      });
    }
  });

  for (let index = 0; index < desks.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < desks.length; nextIndex += 1) {
      const left = desks[index];
      const right = desks[nextIndex];
      const area = overlapArea(
        { x: left.x - (STUDIO_DESK_SIZE.width / 2), y: left.y - (STUDIO_DESK_SIZE.height / 2), width: STUDIO_DESK_SIZE.width, height: STUDIO_DESK_SIZE.height },
        { x: right.x - (STUDIO_DESK_SIZE.width / 2), y: right.y - (STUDIO_DESK_SIZE.height / 2), width: STUDIO_DESK_SIZE.width, height: STUDIO_DESK_SIZE.height },
      );
      if (area > 900) {
        findings.push({
          id: `desk-overlap-${left.id}-${right.id}`,
          severity: 'error',
          kind: 'layout',
          relatedDeskIds: [left.id, right.id],
          summary: `${left.label || left.id} overlaps ${right.label || right.id}.`,
          details: `Overlap area is ${Math.round(area)}px.`,
        });
      }
    }
  }

  whiteboards.forEach((board) => {
    desks.forEach((desk) => {
      const area = overlapArea(
        { x: board.x, y: board.y, width: board.width || STUDIO_TEAM_BOARD_SIZE.width, height: board.height || STUDIO_TEAM_BOARD_SIZE.height },
        { x: desk.x - (STUDIO_DESK_SIZE.width / 2), y: desk.y - (STUDIO_DESK_SIZE.height / 2), width: STUDIO_DESK_SIZE.width, height: STUDIO_DESK_SIZE.height },
      );
      if (area > 800) {
        findings.push({
          id: `whiteboard-overlap-${board.id}-${desk.id}`,
          severity: 'error',
          kind: 'layout',
          relatedDeskIds: [desk.id],
          relatedWhiteboardIds: [board.id],
          summary: `${board.label || board.id} overlaps ${desk.label || desk.id}.`,
          details: `Overlap area is ${Math.round(area)}px.`,
        });
      }
    });
  });

  controls.filter((control) => !control.visible).forEach((control) => {
    findings.push({
      id: `control-hidden-${control.id}`,
      severity: 'warning',
      kind: 'visibility',
      summary: `${control.label || control.id} is clipped or hidden.`,
      details: `Required control ${control.id} was not fully visible in the current browser pass.`,
    });
  });

  const deskMap = Object.fromEntries(desks.map((desk) => [desk.id, desk]));
  links.forEach((link) => {
    const fromDesk = deskMap[link.fromDeskId];
    const toDesk = deskMap[link.toDeskId];
    if (!fromDesk || !toDesk) return;
    const expected = resolveExpectedAnchor(fromDesk, toDesk, link.kind);
    const delta = Math.max(
      Math.abs((link.startX || 0) - expected.startX),
      Math.abs((link.startY || 0) - expected.startY),
      Math.abs((link.endX || 0) - expected.endX),
      Math.abs((link.endY || 0) - expected.endY),
    );
    if (delta > 8) {
      findings.push({
        id: `stale-anchor-${link.id}`,
        severity: 'warning',
        kind: 'connector',
        relatedDeskIds: [link.fromDeskId, link.toDeskId],
        summary: `${link.label || link.id} is not anchored to the current desk positions.`,
        details: `Connector drift is ${Math.round(delta)}px from the expected anchor geometry.`,
      });
    }
  });

  return findings;
}

function buildScenarioActions(scenario = 'layout-pass') {
  const openStudio = { type: 'click', selector: '[data-qa="scene-studio-button"]', label: 'Open ACE Studio' };
  const resetView = { type: 'click', selector: '[data-qa="reset-view-button"]', label: 'Reset Studio view' };
  if (scenario === 'studio-smoke') return [openStudio];
  if (scenario === 'whiteboard-board-pass') return [openStudio, resetView];
  if (scenario === 'throughput-visual-pass') {
    return [
      openStudio,
      resetView,
      { type: 'select-desk', deskId: 'cto-architect', label: 'Focus CTO / Architect desk' },
    ];
  }
  return [openStudio, resetView];
}

async function performAction(page, action) {
  if (!action) return;
  if (action.type === 'click') {
    await page.locator(action.selector).click();
    return;
  }
  if (action.type === 'select-desk') {
    await page.locator(`[data-qa="desk-${action.deskId}"]`).click();
    return;
  }
  if (action.type === 'switch-graph-layer') {
    await page.locator(`[data-qa="graph-layer-${action.layer}"]`).click();
    return;
  }
  if (action.type === 'type') {
    await page.locator(action.selector).fill(action.text || '');
    return;
  }
  if (action.type === 'drag') {
    const locator = page.locator(action.selector);
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Cannot drag ${action.selector}; bounding box unavailable.`);
    const startX = box.x + (box.width / 2);
    const startY = box.y + (box.height / 2);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + Number(action.dx || 0), startY + Number(action.dy || 0), { steps: 10 });
    await page.mouse.up();
    return;
  }
  if (action.type === 'move-canvas') {
    const locator = page.locator('[data-qa="canvas-shell"]');
    const box = await locator.boundingBox();
    if (!box) throw new Error('Canvas shell not available for move-canvas action.');
    const startX = box.x + (box.width / 2);
    const startY = box.y + (box.height / 2);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + Number(action.dx || 0), startY + Number(action.dy || 0), { steps: 12 });
    await page.mouse.up();
    return;
  }
  throw new Error(`Unsupported QA action type: ${action.type}`);
}

function buildSeverityFinding(kind, entries, severity, summary) {
  if (!entries.length) return [];
  return [{
    id: `${kind}-${entries.length}`,
    severity,
    kind,
    summary,
    details: entries.map((entry) => entry.text || entry.url || entry.message).slice(0, 6).join(' | '),
  }];
}

function isIgnorableConsoleEntry(entry = {}) {
  const text = String(entry.text || '');
  const locationUrl = String(entry.location?.url || '');
  return /favicon\.ico/i.test(text) || /favicon\.ico/i.test(locationUrl);
}

async function runQARun(options = {}) {
  const {
    rootPath,
    baseUrl,
    scenario = 'layout-pass',
    mode = 'interactive',
    trigger = 'manual',
    prompt = '',
    actions = [],
    linked = {},
    getRuntimeSnapshot,
    getHealthSnapshot,
  } = options;

  if (!rootPath) throw new Error('rootPath is required for QA runs.');
  if (!baseUrl) throw new Error('baseUrl is required for QA runs.');

  const run = createQARun({ scenario, mode, trigger, prompt, baseUrl, linked });
  const persist = () => writeJson(qaRunFilePath(rootPath, run.id), run);
  persist();

  const executablePath = resolveBrowserExecutable();
  if (!executablePath) {
    run.status = 'failed';
    run.verdict = 'failed';
    run.error = 'No local Edge or Chrome executable was found for the browser bridge.';
    run.finishedAt = nowIso();
    persist();
    return run;
  }

  let browser = null;
  let context = null;
  let page = null;
  try {
    beginStep(run, 'health');
    await waitForServiceReady(`${baseUrl}/api/health`);
    finishStep(run, 'health', 'pass');
    persist();

    beginStep(run, 'launch');
    const { chromium } = require('playwright-core');
    run.browser.executablePath = executablePath;
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--disable-gpu', '--no-first-run', '--disable-background-networking'],
    });
    context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      ignoreHTTPSErrors: true,
    });
    page = await context.newPage();
    finishStep(run, 'launch', 'pass');
    persist();

    const consoleEntries = [];
    const networkFailures = [];
    page.on('console', (message) => {
      consoleEntries.push({
        type: message.type(),
        text: message.text(),
        location: message.location(),
      });
    });
    page.on('pageerror', (error) => {
      consoleEntries.push({
        type: 'pageerror',
        text: String(error?.stack || error?.message || error),
      });
    });
    page.on('requestfailed', (request) => {
      networkFailures.push({
        url: request.url(),
        method: request.method(),
        errorText: request.failure()?.errorText || 'request failed',
      });
    });

    beginStep(run, 'open');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-qa="spatial-root"]').waitFor({ state: 'visible', timeout: 15000 });
    run.artifacts.screenshots.push({
      ...saveArtifact(rootPath, run, '01-initial.png', await page.screenshot({ fullPage: true }), 'binary'),
      label: 'Initial ACE render',
    });
    finishStep(run, 'open', 'pass');
    persist();

    beginStep(run, 'studio');
    await page.locator('[data-qa="scene-studio-button"]').click();
    await page.locator('[data-qa="studio-room"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);
    finishStep(run, 'studio', 'pass');
    persist();

    beginStep(run, 'scenario');
    const scenarioActions = mode === 'observation' ? buildScenarioActions(scenario).slice(0, 1) : [...buildScenarioActions(scenario), ...(actions || [])];
    for (const action of scenarioActions) {
      await performAction(page, action);
      await page.waitForTimeout(200);
    }
    run.artifacts.screenshots.push({
      ...saveArtifact(rootPath, run, `02-${scenario}.png`, await page.screenshot({ fullPage: true }), 'binary'),
      label: `Scenario ${scenario}`,
    });
    finishStep(run, 'scenario', 'pass');
    persist();

    beginStep(run, 'capture');
    const domSnapshot = await page.content();
    const runtimeSnapshot = typeof getRuntimeSnapshot === 'function'
      ? await getRuntimeSnapshot()
      : await fetch(`${baseUrl}/api/spatial/runtime`).then((response) => response.json());
    const healthSnapshot = typeof getHealthSnapshot === 'function'
      ? await getHealthSnapshot()
      : await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    run.console = consoleEntries;
    run.network = networkFailures;
    run.artifacts.domSnapshot = saveArtifact(rootPath, run, 'dom.html', domSnapshot, 'text');
    run.artifacts.consoleLog = saveArtifact(rootPath, run, 'console.json', consoleEntries, 'json');
    run.artifacts.networkSummary = saveArtifact(rootPath, run, 'network.json', networkFailures, 'json');
    run.artifacts.runtimeSnapshot = saveArtifact(rootPath, run, 'runtime.json', {
      capturedAt: nowIso(),
      runtime: runtimeSnapshot,
      health: healthSnapshot,
    }, 'json');
    finishStep(run, 'capture', 'pass');
    persist();

    beginStep(run, 'analyze');
    const studioSnapshot = await page.evaluate(() => {
      const asNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      };
      const rectOf = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      };
      const desks = Array.from(document.querySelectorAll('[data-qa^="desk-"]')).map((element) => ({
        id: element.getAttribute('data-desk-id') || '',
        label: element.getAttribute('data-desk-label') || '',
        x: asNumber(element.getAttribute('data-stage-x')),
        y: asNumber(element.getAttribute('data-stage-y')),
        rect: rectOf(element),
      }));
      const whiteboards = Array.from(document.querySelectorAll('[data-qa^="whiteboard-"]')).map((element) => ({
        id: element.getAttribute('data-whiteboard-id') || '',
        label: element.getAttribute('data-whiteboard-label') || '',
        x: asNumber(element.getAttribute('data-stage-x')),
        y: asNumber(element.getAttribute('data-stage-y')),
        width: asNumber(element.getAttribute('data-stage-width')),
        height: asNumber(element.getAttribute('data-stage-height')),
        rect: rectOf(element),
      }));
      const links = Array.from(document.querySelectorAll('[data-qa="studio-link-path"]')).map((element) => ({
        id: element.getAttribute('data-link-id') || '',
        label: element.getAttribute('data-link-label') || '',
        kind: element.getAttribute('data-link-kind') || 'workflow',
        fromDeskId: element.getAttribute('data-from-desk') || '',
        toDeskId: element.getAttribute('data-to-desk') || '',
        startX: asNumber(element.getAttribute('data-start-x')),
        startY: asNumber(element.getAttribute('data-start-y')),
        endX: asNumber(element.getAttribute('data-end-x')),
        endY: asNumber(element.getAttribute('data-end-y')),
      }));
      const controls = [
        { id: 'scene-canvas-button', label: 'Canvas button' },
        { id: 'scene-studio-button', label: 'ACE Studio button' },
        { id: 'recent-saves-select', label: 'Recent Saves' },
        { id: 'reset-view-button', label: 'Reset View' },
      ].map((control) => {
        const element = document.querySelector(`[data-qa="${control.id}"]`);
        if (!element) return { ...control, visible: false };
        const rect = element.getBoundingClientRect();
        const fullyVisible = rect.width > 0
          && rect.height > 0
          && rect.top >= 0
          && rect.left >= 0
          && rect.bottom <= window.innerHeight
          && rect.right <= window.innerWidth;
        return {
          ...control,
          visible: fullyVisible,
          rect: rectOf(element),
        };
      });
      const roomElement = document.querySelector('[data-qa="studio-room"]');
      const roomRect = rectOf(roomElement);
      const shellRect = rectOf(document.querySelector('[data-qa="studio-shell"]'));
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        room: {
          x: asNumber(roomElement?.getAttribute('data-stage-x')),
          y: asNumber(roomElement?.getAttribute('data-stage-y')),
          width: asNumber(roomElement?.getAttribute('data-stage-width')),
          height: asNumber(roomElement?.getAttribute('data-stage-height')),
        },
        roomRect,
        shellRect,
        desks: desks.map((desk) => ({
          ...desk,
          width: 172,
          height: 140,
        })),
        whiteboards,
        links,
        controls,
      };
    });
    const layoutFindings = analyzeStudioSnapshot(studioSnapshot);
    const runtimeWarnings = [];
    const teamBoardReviewCount = Number(runtimeSnapshot?.teamBoard?.summary?.review || 0);
    if (teamBoardReviewCount && !studioSnapshot.whiteboards.some((board) => board.id === 'teamBoard')) {
      runtimeWarnings.push({
        id: 'runtime-whiteboard-mismatch',
        severity: 'warning',
        kind: 'runtime',
        summary: 'Runtime reports reviewable work but the Team Board was not found in the browser pass.',
        details: `Runtime summary shows ${teamBoardReviewCount} review cards.`,
      });
    }
    run.findings = [
      ...layoutFindings,
      ...buildSeverityFinding('console', consoleEntries.filter((entry) => (entry.type === 'error' || entry.type === 'pageerror') && !isIgnorableConsoleEntry(entry)), 'error', 'Console errors were captured during the browser pass.'),
      ...buildSeverityFinding('console-warning', consoleEntries.filter((entry) => entry.type === 'warning' && !isIgnorableConsoleEntry(entry)), 'warning', 'Console warnings were captured during the browser pass.'),
      ...buildSeverityFinding('network', networkFailures, 'warning', 'Network requests failed during the browser pass.'),
      ...runtimeWarnings,
    ];
    run.artifacts.layoutFindings = saveArtifact(rootPath, run, 'layout-findings.json', {
      snapshot: studioSnapshot,
      findings: run.findings,
    }, 'json');
    finishStep(run, 'analyze', run.findings.some((finding) => finding.severity === 'error') ? 'weak' : 'pass');
    run.status = 'completed';
    run.verdict = run.findings.some((finding) => finding.severity === 'error')
      ? 'failed'
      : (run.findings.some((finding) => finding.severity === 'warning') ? 'weak' : 'pass');
    run.finishedAt = nowIso();
    persist();
    return run;
  } catch (error) {
    run.status = 'failed';
    run.verdict = 'failed';
    run.error = String(error?.message || error);
    run.finishedAt = nowIso();
    const runningStep = run.steps.find((step) => step.status === 'running');
    if (runningStep) finishStep(run, runningStep.id, 'failed', run.error);
    persist();
    return run;
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = {
  QA_RELATIVE_DIR,
  analyzeStudioSnapshot,
  artifactRoute,
  ensureQAStorage,
  listQARuns,
  readQARun,
  runQARun,
  summarizeQARun,
  updateQARun,
};
