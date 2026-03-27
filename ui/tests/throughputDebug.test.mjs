import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export default async function runThroughputDebugTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-throughput-'));
  const throughputDebugPath = path.resolve(process.cwd(), 'throughputDebug.js');
  const intentAnalysisPath = path.resolve(process.cwd(), 'intentAnalysis.js');
  const orchestratorStatePath = path.resolve(process.cwd(), 'orchestratorState.js');
  const {
    runThroughputSession,
    readThroughputSession,
  } = require(throughputDebugPath);
  const {
    analyzeSpatialIntent,
  } = require(intentAnalysisPath);
  const {
    advanceOrchestratorWorkspace,
  } = require(orchestratorStatePath);

  let history = [];
  let runs = [];
  let workspace = {
    graph: { nodes: [], edges: [] },
    sketches: [],
    annotations: [],
    architectureMemory: { versions: [], rules: [] },
    intentState: {
      latest: null,
      contextReport: null,
      byNode: {},
      reports: [],
    },
    studio: {
      handoffs: { history: [] },
      teamBoard: { cards: [], selectedCardId: null, summary: {} },
      selfUpgrade: {
        status: 'idle',
        targetProjectKey: 'ace-self',
        preflight: { status: 'idle', ok: false },
        deploy: { status: 'idle', health: { status: 'ready', pid: 7777 } },
      },
    },
  };

  writeJson(path.join(rootPath, 'data', 'spatial', 'history.json'), history);

  const taskDirs = new Map();
  let taskCounter = 1;

  async function loadWorkspace() {
    return clone(workspace);
  }

  async function persistWorkspace(nextWorkspace) {
    workspace = advanceOrchestratorWorkspace(clone(nextWorkspace), {
      dashboardState: { blockers: [] },
      runs: clone(runs),
    });
    return clone(workspace);
  }

  function appendHistory(entry) {
    history = [...history, clone(entry)];
    writeJson(path.join(rootPath, 'data', 'spatial', 'history.json'), history);
  }

  async function readHistory() {
    return clone(history);
  }

  async function analyzeIntent(prompt) {
    const project = {
      currentFocus: 'ACE Studio desks',
      blockers: [],
      keywords: ['ace', 'studio', 'desk', 'qa', 'agent', 'planner', 'executor', 'kanban', 'board'],
      sourcesRead: [
        'brain/emergence/state.json',
        'brain/emergence/plan.md',
        'brain/emergence/project_brain.md',
      ],
      anchorRefs: [
        'brain/emergence/roadmap.md',
        'brain/emergence/plan.md',
        'brain/emergence/tasks.md',
      ],
      managerSummary: {
        current_focus: 'ACE Studio desks',
        active_milestone: 'Repo anchors',
      },
      truthSources: [],
      drift: [],
    };
    return analyzeSpatialIntent(prompt, project);
  }

  async function createRunnerTask({ title, prompt, handoff, session }) {
    const taskId = String(taskCounter).padStart(4, '0');
    taskCounter += 1;
    const taskDir = path.join(rootPath, 'work', 'tasks', `${taskId}-qa-desk`);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'idea.txt'), `${prompt}\n`, 'utf8');
    writeJson(path.join(taskDir, 'meta.json'), {
      sessionId: session.id,
      taskId,
      title,
      handoffId: handoff?.id || null,
    });
    taskDirs.set(taskId, taskDir);
    return { taskId, taskDir };
  }

  async function executeActionSync(action, body) {
    const taskDir = taskDirs.get(body.taskId);
    assert.ok(taskDir, `Missing task dir for ${body.taskId}`);
    const runId = `${action}_${body.taskId}`;
    if (action === 'scan') {
      fs.writeFileSync(path.join(taskDir, 'context.md'), '# Context\nAdd a QA desk to ACE Studio.\n', 'utf8');
    }
    if (action === 'manage') {
      fs.writeFileSync(path.join(taskDir, 'plan.md'), '# Plan\n- Add QA desk\n- Wire planner handoff\n', 'utf8');
    }
    if (action === 'build') {
      fs.writeFileSync(path.join(taskDir, 'patch.diff'), [
        'diff --git a/ui/public/spatial/studioData.js b/ui/public/spatial/studioData.js',
        '--- a/ui/public/spatial/studioData.js',
        '+++ b/ui/public/spatial/studioData.js',
        '@@ -1,1 +1,1 @@',
        '-const qaDesk = false;',
        '+const qaDesk = true;',
      ].join('\n'), 'utf8');
    }
    writeJson(path.join(taskDir, `run_${action}.json`), {
      runId,
      action,
      taskId: body.taskId,
      project: body.project,
      ok: true,
    });
    fs.writeFileSync(path.join(taskDir, `run_${action}.log`), `${action} ok\n`, 'utf8');
    const result = {
      ok: true,
      runId,
      status: 'completed',
      exitCode: 0,
      summary: `${action} completed`,
      meta: action === 'apply'
        ? { changedFiles: ['ui/public/spatial/studioData.js'], branch: 'codex/throughput-test' }
        : { taskDir },
    };
    runs = [
      {
        runId,
        action,
        status: 'completed',
        exitCode: 0,
        payload: { taskId: body.taskId, project: body.project },
        artifacts: [path.join(taskDir, `run_${action}.json`)],
      },
      ...runs,
    ];
    return result;
  }

  async function runSelfUpgradePreflight({ taskId }) {
    workspace = {
      ...workspace,
      studio: {
        ...(workspace.studio || {}),
        selfUpgrade: {
          ...(workspace.studio?.selfUpgrade || {}),
          status: 'ready-to-deploy',
          taskId,
          preflight: {
            status: 'passed',
            ok: true,
            summary: 'UI and runner checks passed.',
            checks: [
              { id: 'ui-tests', ok: true },
              { id: 'runner-compile', ok: true },
            ],
          },
        },
      },
    };
    return {
      ok: true,
      selfUpgrade: clone(workspace.studio.selfUpgrade),
    };
  }

  async function deploySelfUpgrade() {
    workspace = {
      ...workspace,
      studio: {
        ...(workspace.studio || {}),
        selfUpgrade: {
          ...(workspace.studio?.selfUpgrade || {}),
          status: 'deployed',
          deploy: {
            status: 'completed',
            health: {
              status: 'healthy',
              pid: 8888,
            },
          },
        },
      },
    };
    return {
      ok: true,
      restarting: false,
      selfUpgrade: clone(workspace.studio.selfUpgrade),
    };
  }

  async function getRunsSnapshot() {
    return clone(runs);
  }

  async function getHealthSnapshot() {
    return {
      ok: true,
      selfUpgrade: clone(workspace.studio.selfUpgrade),
    };
  }

  const session = await runThroughputSession({
    rootPath,
    prompt: 'I think we should add a desk to the studio for a QA agent',
    targetProjectKey: 'ace-self',
    mode: 'fixture',
    confirmDeploy: true,
    simulateDeploy: true,
    loadWorkspace,
    persistWorkspace,
    appendHistory,
    readHistory,
    analyzeIntent,
    getDashboardState: () => ({ blockers: [] }),
    createRunnerTask,
    executeActionSync,
    runSelfUpgradePreflight,
    deploySelfUpgrade,
    getRunsSnapshot,
    getHealthSnapshot,
  });

  const persisted = readThroughputSession(rootPath, session.id);
  assert.ok(persisted);
  assert.equal(persisted.id, session.id);
  assert.equal(persisted.verdict, 'pass');
  assert.equal(persisted.status, 'completed');
  assert.equal(persisted.provenance.classification, 'mixed');
  assert.ok(persisted.provenance.legacyActions.includes('scan'));
  assert.ok(persisted.provenance.legacyActions.includes('apply'));
  assert.ok(persisted.provenance.nativeActions.includes('intent'));
  assert.ok(persisted.pageId);
  assert.ok(persisted.nodeId);
  assert.ok(persisted.handoffId);
  assert.equal(persisted.runnerTaskId, '0001');
  assert.equal(persisted.runIds.length, 4);
  assert.equal(persisted.stages.find((stage) => stage.id === 'intent')?.verdict, 'pass');
  assert.equal(persisted.stages.find((stage) => stage.id === 'intent')?.provenance?.classification, 'studio-native');
  assert.equal(persisted.stages.find((stage) => stage.id === 'scan')?.provenance?.classification, 'legacy-fallback');
  assert.ok((persisted.stages.find((stage) => stage.id === 'scan')?.provenance?.evidence || []).includes('route:legacy-fallback'));
  assert.equal(persisted.stages.find((stage) => stage.id === 'deploy')?.verdict, 'pass');
  assert.equal(persisted.stages.find((stage) => stage.id === 'final')?.verdict, 'pass');
  assert.ok(persisted.anchorRefs.includes('brain/emergence/roadmap.md'));
  assert.equal(persisted.sinks['workspace.intentState']?.write, true);
  assert.equal(persisted.sinks['workspace.studio.handoffs.contextToPlanner']?.write, true);
  assert.equal(persisted.sinks['workspace.studio.teamBoard']?.write, true);
  assert.equal(persisted.sinks['data/spatial/history.json']?.write, true);
  assert.equal(persisted.sinks['runner.taskArtifacts']?.write, true);
  assert.equal(persisted.sinks['brain/emergence/*']?.read, true);
  assert.equal(persisted.sinks['manager.anchorBundle']?.read, true);
  assert.match(persisted.sinks['runner.taskArtifacts']?.summary || '', /idea\.txt/i);
  assert.equal(persisted.snapshots.after?.health?.selfUpgrade?.deploy?.health?.status, 'healthy');
  assert.ok(fs.existsSync(path.join(rootPath, 'data', 'spatial', 'throughput', `${session.id}.json`)));
  assert.ok(fs.existsSync(path.join(rootPath, 'work', 'tasks', '0001-qa-desk', 'patch.diff')));
}
