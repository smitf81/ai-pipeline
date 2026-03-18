import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runServerTests() {
  const serverPath = path.resolve(process.cwd(), 'server.js');
  const {
    evaluateApplyGate,
    evaluateVerifyGate,
    evaluateDeployGate,
    buildVerificationPlan,
    detectMaterialGenerationIntent,
    buildMaterialIntentModuleEnvelope,
    normalizeExecutiveEnvelope,
    mapEnvelopeToMaterialModule,
    buildModulePreview,
    resolveLegacyFallbackPayload,
    executeModuleAction,
  } = require(serverPath);

  assert.equal(detectMaterialGenerationIntent('Generate a material for wet stone'), true);
  assert.equal(detectMaterialGenerationIntent('Need planning updates for team board'), false);

  const moduleEnvelope = buildMaterialIntentModuleEnvelope({
    text: 'Generate a material for "wet stone" for Unreal',
    nodeId: 'n-1',
    source: 'context-intake',
  });
  assert.equal(moduleEnvelope.action, 'run_module');
  assert.equal(moduleEnvelope.module_id, 'material_gen');
  assert.equal(moduleEnvelope.input.intent.surface, 'wet stone');
  assert.equal(moduleEnvelope.input.context.source_node_id, 'n-1');

  const moduleResult = executeModuleAction(moduleEnvelope, { logger: null });
  assert.equal(moduleResult.ok, true);
  assert.equal(moduleResult.output.validation.status, 'pass');
  assert.equal(moduleResult.confidence, 0.82);

  const executiveEnvelope = normalizeExecutiveEnvelope({
    envelope: {
      entries: [
        { type: 'prompt', node_id: 'prompt-1', content: 'Generate a material for wet stone', data: {} },
        { type: 'constraints', node_id: 'constraints-1', content: '', data: { engine_target: 'unreal' } },
        { type: 'target', node_id: 'target-1', content: '', data: { module_id: 'material_gen' } },
      ],
    },
  });
  assert.equal(executiveEnvelope.version, 'ace/studio-envelope.v1');
  assert.equal(executiveEnvelope.nodes.prompt.node_id, 'prompt-1');

  const mappedModuleEnvelope = mapEnvelopeToMaterialModule(executiveEnvelope);
  assert.equal(mappedModuleEnvelope.action, 'run_module');
  assert.equal(mappedModuleEnvelope.module_id, 'material_gen');
  assert.equal(mappedModuleEnvelope.input.context.source_node_id, 'prompt-1');

  const mappedModuleResult = executeModuleAction(mappedModuleEnvelope, { logger: null });
  assert.equal(mappedModuleResult.ok, true);
  const modulePreview = buildModulePreview(mappedModuleResult);
  assert.equal(modulePreview.artifact_type, 'material');
  assert.equal(modulePreview.validation_status, 'pass');
  assert.equal(modulePreview.requires_human_review, false);
  assert.ok(Array.isArray(modulePreview.output_paths));
  assert.ok(modulePreview.output_paths.length >= 3);

  const fallbackPayload = resolveLegacyFallbackPayload({
    nodes: {
      target: {
        data: {
          legacy_action: 'scan',
          task_id: '0007',
          project: 'ace-self',
        },
      },
    },
  });
  assert.deepEqual(fallbackPayload, { action: 'scan', taskId: '0007', project: 'ace-self' });

  const baseWorkspace = {
    studio: {
      selfUpgrade: {
        preflight: {
          ok: true,
          taskId: '0007',
          summary: 'ACE self-upgrade preflight passed.',
        },
        apply: {
          ok: true,
          taskId: '0007',
        },
      },
    },
  };

  const baseCard = {
    id: '0001',
    title: 'Tighten executor gating',
    status: 'review',
    approvalState: 'approved',
    applyStatus: 'idle',
    deployStatus: 'idle',
    targetProjectKey: 'ace-self',
    builderTaskId: '0007',
    sourceAnchorRefs: ['brain/emergence/plan.md'],
    executionPackage: {
      status: 'ready',
      taskId: '0007',
      patchPath: 'work/tasks/0007-tighten-executor/patch.diff',
      changedFiles: ['ui/server.js'],
      expectedAction: 'apply + deploy',
    },
    verifyRequired: true,
    verifyStatus: 'passed',
    verifiedSignature: 'sig',
    lastVerificationSummary: 'Verification passed.',
    riskReasons: [],
  };

  const verificationPlan = buildVerificationPlan({
    taskId: '0007',
    patchPath: baseCard.executionPackage.patchPath,
    changedFiles: baseCard.executionPackage.changedFiles,
    targetProjectKey: 'ace-self',
    expectedAction: baseCard.executionPackage.expectedAction,
  });
  assert.equal(verificationPlan.required, true);
  assert.equal(verificationPlan.commands[0].preset, 'runner_compile');
  assert.equal(verificationPlan.qaScenarios[0].scenario, 'layout-pass');

  const applyReady = evaluateApplyGate({
    card: {
      ...baseCard,
      verifiedSignature: verificationPlan.signature,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(applyReady.ok, true);

  const verifyReady = evaluateVerifyGate({
    card: {
      ...baseCard,
      verifyStatus: 'queued',
      verifiedSignature: null,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(verifyReady.ok, true);

  const noAnchor = evaluateApplyGate({
    card: { ...baseCard, sourceAnchorRefs: [], executionPackage: { ...baseCard.executionPackage, verificationPlan } },
    workspace: baseWorkspace,
  });
  assert.equal(noAnchor.ok, false);
  assert.equal(noAnchor.code, 'missing-anchor');

  const noPackage = evaluateApplyGate({
    card: {
      ...baseCard,
      executionPackage: { ...baseCard.executionPackage, status: 'idle' },
    },
    workspace: baseWorkspace,
  });
  assert.equal(noPackage.ok, false);
  assert.equal(noPackage.code, 'missing-package');

  const stalePreflight = evaluateApplyGate({
    card: {
      ...baseCard,
      verifiedSignature: verificationPlan.signature,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: {
      studio: {
        selfUpgrade: {
          ...baseWorkspace.studio.selfUpgrade,
          preflight: {
            ok: true,
            taskId: '9999',
            summary: 'stale',
          },
        },
      },
    },
  });
  assert.equal(stalePreflight.ok, false);
  assert.equal(stalePreflight.code, 'preflight-stale');

  const verificationRequired = evaluateApplyGate({
    card: {
      ...baseCard,
      verifyStatus: 'queued',
      verifiedSignature: null,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(verificationRequired.ok, false);
  assert.equal(verificationRequired.code, 'verification-required');

  const verificationStale = evaluateApplyGate({
    card: {
      ...baseCard,
      verifiedSignature: 'old-signature',
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(verificationStale.ok, false);
  assert.equal(verificationStale.code, 'verification-stale');

  const deployReady = evaluateDeployGate({
    card: {
      ...baseCard,
      status: 'complete',
      applyStatus: 'applied',
      deployStatus: 'queued',
      verifiedSignature: verificationPlan.signature,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(deployReady.ok, true);

  const deployNeedsApply = evaluateDeployGate({
    card: {
      ...baseCard,
      status: 'complete',
      applyStatus: 'queued',
      deployStatus: 'queued',
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: baseWorkspace,
  });
  assert.equal(deployNeedsApply.ok, false);
  assert.equal(deployNeedsApply.code, 'invalid-deploy-state');

  const deployStaleApply = evaluateDeployGate({
    card: {
      ...baseCard,
      status: 'complete',
      applyStatus: 'applied',
      deployStatus: 'queued',
      verifiedSignature: verificationPlan.signature,
      executionPackage: {
        ...baseCard.executionPackage,
        verificationPlan,
      },
    },
    workspace: {
      studio: {
        selfUpgrade: {
          ...baseWorkspace.studio.selfUpgrade,
          apply: {
            ok: true,
            taskId: '9999',
          },
        },
      },
    },
  });
  assert.equal(deployStaleApply.ok, false);
  assert.equal(deployStaleApply.code, 'apply-stale');
}
