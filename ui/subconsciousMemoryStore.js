const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const MEMORY_STORE_CONTRACT = 'subconscious.memory.sqlite.v1';
const MEMORY_STORE_SCHEMA_VERSION = 1;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizePath(value = '') {
  return String(value || '').replace(/\\/g, '/');
}

function openMemoryStore({ databasePath, rootPath }) {
  ensureDir(path.dirname(databasePath));
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    CREATE TABLE IF NOT EXISTS store_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      model TEXT NOT NULL,
      classification TEXT NOT NULL DEFAULT 'derived_advisory',
      canonical INTEGER NOT NULL DEFAULT 0 CHECK (canonical = 0),
      commentary TEXT NOT NULL,
      thought_ref TEXT,
      change_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      scan_at TEXT
    );
    CREATE TABLE IF NOT EXISTS compression_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id INTEGER,
      generated_at TEXT NOT NULL,
      model TEXT,
      status TEXT NOT NULL,
      candidate_memory TEXT,
      rejection_reason TEXT,
      prior_summary_substantive INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (observation_id) REFERENCES observations(id)
    );
    CREATE TABLE IF NOT EXISTS memory_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id INTEGER,
      compression_run_id INTEGER,
      event_type TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      update_status TEXT NOT NULL,
      update_applied INTEGER NOT NULL DEFAULT 0,
      rejection_reason TEXT,
      current_memory_ref TEXT,
      previous_snapshot_ref TEXT,
      active_snapshot_ref TEXT,
      classification TEXT NOT NULL DEFAULT 'derived_advisory',
      canonical INTEGER NOT NULL DEFAULT 0 CHECK (canonical = 0),
      FOREIGN KEY (observation_id) REFERENCES observations(id),
      FOREIGN KEY (compression_run_id) REFERENCES compression_runs(id)
    );
    CREATE TABLE IF NOT EXISTS memory_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_event_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      disposition TEXT NOT NULL,
      content TEXT NOT NULL,
      export_ref TEXT,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
      FOREIGN KEY (memory_event_id) REFERENCES memory_events(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS memory_snapshots_one_current
      ON memory_snapshots(is_current) WHERE is_current = 1;
    CREATE TABLE IF NOT EXISTS file_mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      change_kind TEXT,
      size_bytes INTEGER,
      FOREIGN KEY (observation_id) REFERENCES observations(id)
    );
    CREATE TABLE IF NOT EXISTS agent_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id INTEGER,
      created_at TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      state TEXT NOT NULL,
      detail_json TEXT,
      FOREIGN KEY (observation_id) REFERENCES observations(id)
    );
  `);
  const upsertMeta = db.prepare(`
    INSERT INTO store_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const existingMeta = Object.fromEntries(
    db.prepare('SELECT key, value FROM store_meta').all().map((entry) => [entry.key, entry.value]),
  );
  Object.entries({
    contract: MEMORY_STORE_CONTRACT,
    schema_version: String(MEMORY_STORE_SCHEMA_VERSION),
    classification: 'derived_advisory',
    canonical: 'false',
    root_boundary: normalizePath(rootPath),
  }).forEach(([key, value]) => {
    if (existingMeta[key] !== value) {
      upsertMeta.run(key, value);
    }
  });

  function getCurrentSnapshot() {
    return db.prepare(`
      SELECT id, memory_event_id AS memoryEventId, created_at AS createdAt,
             disposition, content, export_ref AS exportRef
      FROM memory_snapshots
      WHERE is_current = 1
      ORDER BY id DESC
      LIMIT 1
    `).get() || null;
  }

  function getSummary() {
    const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
    const current = getCurrentSnapshot();
    return {
      contract: MEMORY_STORE_CONTRACT,
      schemaVersion: MEMORY_STORE_SCHEMA_VERSION,
      classification: 'derived_advisory',
      canonical: false,
      databaseRef: normalizePath(path.relative(rootPath, databasePath)),
      observations: count('observations'),
      memoryEvents: count('memory_events'),
      memorySnapshots: count('memory_snapshots'),
      fileMentions: count('file_mentions'),
      agentActivity: count('agent_activity'),
      compressionRuns: count('compression_runs'),
      currentSnapshotId: current?.id || null,
      currentMemoryAvailable: Boolean(current),
    };
  }

  function bootstrapCurrentSummary({ createdAt, content, currentMemoryRef }) {
    if (getCurrentSnapshot() || !String(content || '').trim()) return getSummary();
    db.exec('BEGIN IMMEDIATE');
    try {
      const event = db.prepare(`
        INSERT INTO memory_events (
          event_type, generated_at, update_status, update_applied,
          current_memory_ref, classification, canonical
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'memory_summary_imported',
        createdAt,
        'imported_existing_export',
        1,
        currentMemoryRef,
        'derived_advisory',
        0,
      );
      db.prepare(`
        INSERT INTO memory_snapshots (
          memory_event_id, created_at, disposition, content, export_ref, is_current
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(event.lastInsertRowid, createdAt, 'imported', content, currentMemoryRef, 1);
      db.prepare(`
        INSERT INTO agent_activity (created_at, activity_type, state, detail_json)
        VALUES (?, ?, ?, ?)
      `).run(createdAt, 'memory_store_bootstrap', 'imported', JSON.stringify({ currentMemoryRef }));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return getSummary();
  }

  function recordGeneration({
    observation,
    compression,
    memoryEvent,
    snapshots = [],
    fileMentions = [],
    activity,
  }) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const observationResult = db.prepare(`
        INSERT INTO observations (
          generated_at, model, classification, canonical, commentary,
          thought_ref, change_count, duration_ms, scan_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        observation.generatedAt,
        observation.model,
        'derived_advisory',
        0,
        observation.commentary,
        observation.thoughtRef,
        observation.changeCount || 0,
        observation.durationMs || 0,
        observation.scanAt || null,
      );
      const observationId = observationResult.lastInsertRowid;
      const compressionResult = db.prepare(`
        INSERT INTO compression_runs (
          observation_id, generated_at, model, status, candidate_memory,
          rejection_reason, prior_summary_substantive
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        observationId,
        observation.generatedAt,
        observation.model,
        compression.status,
        compression.candidateMemory || '',
        compression.rejectionReason || null,
        compression.previousSummarySubstantive ? 1 : 0,
      );
      const compressionRunId = compressionResult.lastInsertRowid;
      const eventResult = db.prepare(`
        INSERT INTO memory_events (
          observation_id, compression_run_id, event_type, generated_at,
          update_status, update_applied, rejection_reason, current_memory_ref,
          previous_snapshot_ref, active_snapshot_ref, classification, canonical
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        observationId,
        compressionRunId,
        memoryEvent.event,
        observation.generatedAt,
        memoryEvent.updateStatus,
        memoryEvent.updateApplied ? 1 : 0,
        memoryEvent.rejectionReason || null,
        memoryEvent.currentMemoryRef || null,
        memoryEvent.previousSnapshotRef || null,
        memoryEvent.activeSnapshotRef || null,
        'derived_advisory',
        0,
      );
      const memoryEventId = eventResult.lastInsertRowid;
      if (snapshots.some((snapshot) => snapshot.isCurrent)) {
        db.exec('UPDATE memory_snapshots SET is_current = 0 WHERE is_current = 1');
      }
      const insertSnapshot = db.prepare(`
        INSERT INTO memory_snapshots (
          memory_event_id, created_at, disposition, content, export_ref, is_current
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      snapshots.forEach((snapshot) => {
        insertSnapshot.run(
          memoryEventId,
          observation.generatedAt,
          snapshot.disposition,
          snapshot.content,
          snapshot.exportRef || null,
          snapshot.isCurrent ? 1 : 0,
        );
      });
      const insertMention = db.prepare(`
        INSERT INTO file_mentions (observation_id, path, change_kind, size_bytes)
        VALUES (?, ?, ?, ?)
      `);
      fileMentions.forEach((mention) => {
        insertMention.run(
          observationId,
          mention.path,
          mention.kind || null,
          Number.isFinite(Number(mention.size)) ? Number(mention.size) : null,
        );
      });
      db.prepare(`
        INSERT INTO agent_activity (
          observation_id, created_at, activity_type, state, detail_json
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        observationId,
        observation.generatedAt,
        activity.type,
        activity.state,
        JSON.stringify(activity.details || {}),
      );
      db.exec('COMMIT');
      return {
        observationId: Number(observationId),
        compressionRunId: Number(compressionRunId),
        memoryEventId: Number(memoryEventId),
        summary: getSummary(),
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    bootstrapCurrentSummary,
    close: () => db.close(),
    getCurrentSnapshot,
    getSummary,
    recordGeneration,
  };
}

module.exports = {
  MEMORY_STORE_CONTRACT,
  MEMORY_STORE_SCHEMA_VERSION,
  openMemoryStore,
};
