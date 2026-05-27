const fs = require('fs');
const path = require('path');

const TASK_CACHE_SOURCE = Object.freeze({
  HIT: 'cache_hit',
  MISS: 'cache_miss',
  INVALID: 'cache_invalid',
  BYPASS: 'cache_bypass',
});

const TASK_CACHE_STAGE_FILES = Object.freeze({
  planner: ['idea', 'context', 'plan'],
  executor: ['plan', 'patch', 'applyResult'],
});

const TASK_CACHE_FILE_PATHS = Object.freeze({
  idea: 'idea.txt',
  context: 'context.md',
  plan: 'plan.md',
  patch: 'patch.diff',
  applyResult: 'apply_result.json',
});

const TASK_CACHE_STAGE_LABELS = Object.freeze({
  planner: 'planner',
  executor: 'executor',
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeTaskId(taskId = '') {
  return String(taskId || '').trim();
}

function rootTasksDir(rootPath) {
  return path.join(rootPath || process.cwd(), 'work', 'tasks');
}

function listTaskFolders(rootPath) {
  const tasksDir = rootTasksDir(rootPath);
  if (!fs.existsSync(tasksDir)) return [];
  return fs.readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-.+/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function findTaskFolderByTaskId(rootPath, taskId) {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (!normalizedTaskId) return null;
  const prefix = normalizedTaskId.slice(0, 4);
  return listTaskFolders(rootPath).find((folder) => folder.startsWith(prefix)) || null;
}

function resolveTaskDir(rootPath, { taskId = null, taskDir = null } = {}) {
  if (taskDir) return path.resolve(taskDir);
  const folder = findTaskFolderByTaskId(rootPath, taskId);
  return folder ? path.join(rootTasksDir(rootPath), folder) : null;
}

function relativeToRoot(rootPath, targetPath) {
  if (!rootPath || !targetPath) return null;
  return path.relative(rootPath, targetPath).replace(/\\/g, '/');
}

function truncateText(value, limit = 4000) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[truncated]`;
}

function readTextFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      exists: false,
      valid: false,
      content: null,
      reason: 'missing',
    };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const content = raw.trim();
  if (!content) {
    return {
      exists: true,
      valid: false,
      content: null,
      reason: 'empty',
    };
  }
  return {
    exists: true,
    valid: true,
    content: raw,
    reason: null,
  };
}

function validateIdeaText(content) {
  return String(content || '').trim().length >= 8;
}

function validateContextMarkdown(content) {
  const text = String(content || '').trim();
  return text.length >= 16 && (text.includes('## Context') || text.startsWith('#'));
}

function validatePlanMarkdown(content) {
  const text = String(content || '').trim();
  return text.length >= 24 && text.includes('## Acceptance criteria') && text.includes('## MVP scope');
}

function validatePatchDiff(content) {
  const text = String(content || '').trim();
  return text.length >= 12 && /(^diff --git|^---\s|^\+\+\+\s|^@@)/m.test(text);
}

function readApplyResultJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      exists: false,
      valid: false,
      data: null,
      reason: 'missing',
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        exists: true,
        valid: false,
        data: null,
        reason: 'malformed',
      };
    }
    if (!String(parsed.stage || parsed.status || '').trim()) {
      return {
        exists: true,
        valid: false,
        data: null,
        reason: 'malformed',
      };
    }
    return {
      exists: true,
      valid: true,
      data: parsed,
      reason: null,
    };
  } catch {
    return {
      exists: true,
      valid: false,
      data: null,
      reason: 'malformed',
    };
  }
}

function normalizeSelectedFiles(files = {}, stage = 'planner') {
  const stageKey = TASK_CACHE_STAGE_LABELS[stage] || 'planner';
  const required = TASK_CACHE_STAGE_FILES[stageKey] || TASK_CACHE_STAGE_FILES.planner;
  return required.map((key) => {
    const file = files[key] || {};
    return {
      key,
      name: TASK_CACHE_FILE_PATHS[key],
      exists: Boolean(file.exists),
      valid: Boolean(file.valid),
    };
  });
}

function summarizeTaskCache(cache = {}) {
  const files = cache.files || {};
  return {
    stage: cache.stage || null,
    source: cache.source || TASK_CACHE_SOURCE.BYPASS,
    taskId: cache.taskId || null,
    taskFolder: cache.taskFolder || null,
    taskDir: cache.taskDir || null,
    requiredFiles: Array.isArray(cache.requiredFiles) ? cache.requiredFiles : [],
    selectedFiles: Array.isArray(cache.selectedFiles) ? cache.selectedFiles : [],
    fileStates: Object.fromEntries(Object.entries(files).map(([key, file]) => ([key, {
      exists: Boolean(file.exists),
      valid: Boolean(file.valid),
      reason: file.reason || null,
    }]))),
    invalidReasons: Array.isArray(cache.invalidReasons) ? cache.invalidReasons.slice(0, 6) : [],
    updatedAt: cache.updatedAt || null,
  };
}

function readTaskCache(rootPath, { taskId = null, taskDir = null, stage = 'planner' } = {}) {
  const normalizedStage = stage === 'executor' || stage === 'apply' ? 'executor' : 'planner';
  const normalizedTaskId = normalizeTaskId(taskId);
  const resolvedTaskDir = resolveTaskDir(rootPath, { taskId: normalizedTaskId, taskDir });
  if (!normalizedTaskId && !resolvedTaskDir) {
    return {
      source: TASK_CACHE_SOURCE.BYPASS,
      stage: normalizedStage,
      taskId: null,
      taskFolder: null,
      taskDir: null,
      requiredFiles: TASK_CACHE_STAGE_FILES[normalizedStage],
      selectedFiles: [],
      files: {},
      invalidReasons: ['task-id-missing'],
      updatedAt: nowIso(),
    };
  }
  if (!resolvedTaskDir || !fs.existsSync(resolvedTaskDir)) {
    return {
      source: TASK_CACHE_SOURCE.MISS,
      stage: normalizedStage,
      taskId: normalizedTaskId || null,
      taskFolder: null,
      taskDir: resolvedTaskDir ? relativeToRoot(rootPath, resolvedTaskDir) : null,
      requiredFiles: TASK_CACHE_STAGE_FILES[normalizedStage],
      selectedFiles: [],
      files: {},
      invalidReasons: ['task-folder-missing'],
      updatedAt: nowIso(),
    };
  }

  const taskFolder = path.basename(resolvedTaskDir);
  const files = {
    idea: readTextFile(path.join(resolvedTaskDir, TASK_CACHE_FILE_PATHS.idea)),
    context: readTextFile(path.join(resolvedTaskDir, TASK_CACHE_FILE_PATHS.context)),
    plan: readTextFile(path.join(resolvedTaskDir, TASK_CACHE_FILE_PATHS.plan)),
    patch: readTextFile(path.join(resolvedTaskDir, TASK_CACHE_FILE_PATHS.patch)),
    applyResult: readApplyResultJson(path.join(resolvedTaskDir, TASK_CACHE_FILE_PATHS.applyResult)),
  };

  files.idea.valid = files.idea.exists && validateIdeaText(files.idea.content);
  if (files.idea.exists && !files.idea.valid) files.idea.reason = 'malformed';
  files.context.valid = files.context.exists && validateContextMarkdown(files.context.content);
  if (files.context.exists && !files.context.valid) files.context.reason = 'malformed';
  files.plan.valid = files.plan.exists && validatePlanMarkdown(files.plan.content);
  if (files.plan.exists && !files.plan.valid) files.plan.reason = 'malformed';
  files.patch.valid = files.patch.exists && validatePatchDiff(files.patch.content);
  if (files.patch.exists && !files.patch.valid) files.patch.reason = 'malformed';

  const requiredKeys = TASK_CACHE_STAGE_FILES[normalizedStage];
  const requiredFileStates = requiredKeys.map((key) => files[key]);
  const anyKnownFilesExist = Object.values(files).some((file) => file.exists);
  const missingRequired = requiredFileStates.some((file) => !file.exists);
  const invalidRequired = requiredFileStates.some((file) => file.exists && !file.valid);
  const selectedFiles = normalizeSelectedFiles(files, normalizedStage);

  let source = TASK_CACHE_SOURCE.HIT;
  const invalidReasons = [];
  if (!anyKnownFilesExist) {
    source = TASK_CACHE_SOURCE.MISS;
  } else if (missingRequired || invalidRequired) {
    source = TASK_CACHE_SOURCE.INVALID;
    requiredFileStates.forEach((file, index) => {
      const key = requiredKeys[index];
      if (!file.exists) invalidReasons.push(`${TASK_CACHE_FILE_PATHS[key]}-missing`);
      else if (!file.valid) invalidReasons.push(`${TASK_CACHE_FILE_PATHS[key]}-malformed`);
    });
  }

  const selectedAllValid = selectedFiles.every((entry) => entry.exists && entry.valid);
  if (source === TASK_CACHE_SOURCE.HIT && !selectedAllValid) {
    source = TASK_CACHE_SOURCE.INVALID;
    invalidReasons.push('selected-files-invalid');
  }

  return {
    source,
    stage: normalizedStage,
    taskId: normalizedTaskId || null,
    taskFolder,
    taskDir: relativeToRoot(rootPath, resolvedTaskDir),
    taskDirPath: resolvedTaskDir,
    requiredFiles: requiredKeys.map((key) => TASK_CACHE_FILE_PATHS[key]),
    selectedFiles,
    files,
    invalidReasons,
    updatedAt: nowIso(),
  };
}

function buildTaskCachePromptSection(cache = {}, { stage = 'planner', limitChars = 2400 } = {}) {
  if (!cache || cache.source !== TASK_CACHE_SOURCE.HIT) return '';
  const selected = Array.isArray(cache.selectedFiles) ? cache.selectedFiles : [];
  if (!selected.length) return '';
  const lines = [
    '## Cached Task Files',
    `Source: ${cache.source}`,
    `Stage: ${stage}`,
    `Task: ${cache.taskId || 'unknown'}`,
  ];
  for (const entry of selected) {
    const file = cache.files?.[entry.key];
    if (!file?.valid) continue;
    lines.push(`### ${entry.name}`);
    if (entry.key === 'applyResult') {
      lines.push('```json');
      lines.push(truncateText(JSON.stringify(file.data, null, 2), limitChars));
      lines.push('```');
    } else {
      lines.push('```text');
      lines.push(truncateText(file.content, limitChars));
      lines.push('```');
    }
  }
  return lines.join('\n').trim();
}

module.exports = {
  TASK_CACHE_FILE_PATHS,
  TASK_CACHE_SOURCE,
  TASK_CACHE_STAGE_FILES,
  buildTaskCachePromptSection,
  findTaskFolderByTaskId,
  readTaskCache,
  resolveTaskDir,
  summarizeTaskCache,
};
