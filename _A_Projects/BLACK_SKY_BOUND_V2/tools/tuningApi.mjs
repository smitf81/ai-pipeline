import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeAudioTuning } from '../src/data/audio/audioTuning.js';
import { normalizeCreatureTuning } from '../src/data/creatures/creatureTuning.js';

const TUNING_PATH = 'tuning/creature-overrides.json';
const AUDIO_TUNING_PATH = 'tuning/audio-overrides.json';

export async function handleCreatureTuningApi(req, res, rootDir) {
  const parsed = new URL(req.url || '/', 'http://127.0.0.1');
  if (parsed.pathname !== '/api/tuning/creature-overrides') return false;
  if (req.method === 'GET') {
    const tuning = await readCreatureTuningFile(rootDir);
    sendJson(res, 200, tuning);
    return true;
  }
  if (req.method === 'PUT') {
    try {
      const body = await readRequestBody(req);
      const parsedBody = body ? JSON.parse(body) : {};
      const normalized = normalizeCreatureTuning(parsedBody, { rejectUnknown: true });
      if (!normalized.ok) {
        sendJson(res, 400, { error: 'invalid_creature_tuning', issues: normalized.issues });
        return true;
      }
      const tuning = await writeCreatureTuningFile(rootDir, normalized.tuning);
      sendJson(res, 200, { ok: true, tuning });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error?.message ?? 'invalid_request' });
      return true;
    }
  }
  sendJson(res, 405, { error: 'method_not_allowed' });
  return true;
}

export async function handleAudioTuningApi(req, res, rootDir) {
  const parsed = new URL(req.url || '/', 'http://127.0.0.1');
  if (parsed.pathname !== '/api/tuning/audio-overrides') return false;
  if (req.method === 'GET') {
    const tuning = await readAudioTuningFile(rootDir);
    sendJson(res, 200, tuning);
    return true;
  }
  if (req.method === 'PUT') {
    try {
      const body = await readRequestBody(req);
      const parsedBody = body ? JSON.parse(body) : {};
      const normalized = normalizeAudioTuning(parsedBody, { rejectUnknown: true });
      if (!normalized.ok) {
        sendJson(res, 400, { error: 'invalid_audio_tuning', issues: normalized.issues });
        return true;
      }
      const tuning = await writeAudioTuningFile(rootDir, normalized.tuning);
      sendJson(res, 200, { ok: true, tuning });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error?.message ?? 'invalid_request' });
      return true;
    }
  }
  sendJson(res, 405, { error: 'method_not_allowed' });
  return true;
}

export async function readCreatureTuningFile(rootDir) {
  try {
    const raw = await fs.readFile(tuningFilePath(rootDir), 'utf8');
    return normalizeCreatureTuning(JSON.parse(raw)).tuning;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return normalizeCreatureTuning(null).tuning;
  }
}

export async function writeCreatureTuningFile(rootDir, payload) {
  const normalized = normalizeCreatureTuning(payload, { rejectUnknown: true });
  if (!normalized.ok) {
    const error = new Error('invalid_creature_tuning');
    error.issues = normalized.issues;
    throw error;
  }
  const filePath = tuningFilePath(rootDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized.tuning, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
  return normalized.tuning;
}

export async function readAudioTuningFile(rootDir) {
  try {
    const raw = await fs.readFile(audioTuningFilePath(rootDir), 'utf8');
    return normalizeAudioTuning(JSON.parse(raw)).tuning;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return normalizeAudioTuning(null).tuning;
  }
}

export async function writeAudioTuningFile(rootDir, payload) {
  const normalized = normalizeAudioTuning(payload, { rejectUnknown: true });
  if (!normalized.ok) {
    const error = new Error('invalid_audio_tuning');
    error.issues = normalized.issues;
    throw error;
  }
  const filePath = audioTuningFilePath(rootDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized.tuning, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
  return normalized.tuning;
}

function tuningFilePath(rootDir) {
  return path.join(rootDir, TUNING_PATH);
}

function audioTuningFilePath(rootDir) {
  return path.join(rootDir, AUDIO_TUNING_PATH);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(new Error('request_too_large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}
