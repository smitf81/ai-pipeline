import { getActorEnergyText, getTaskEnergyLabel } from '../units/energy.js';
import { formatTaskTraceLabel } from '../ai/agentStub.js';
import { getBuilderSpawnerSummary } from '../buildings/builderSpawner.js';
import { formatAdaptiveHistoryLine, formatAdaptiveTrendLine } from '../debug/adaptiveTuningMonitor.js';
import { FIELD_LAYER_ORDER, FIELD_VISUALS } from '../debug/debugOverlay.js';
import { findResolverPresentationEntry, getResolverPresentationEntries, toResolverPresentationEntry } from '../debug/resolverPresentation.js';
import { getFieldValue } from '../world/fields.js';
import { getTileElevation, getTileType } from '../world/tilemap.js';

export function bindUI({ state, actions }) {
  const toolSelect = document.getElementById('tool-select');
  const buildingTypeSelect = document.getElementById('building-type-select');
  const debugOverlayToggle = document.getElementById('debug-overlay-toggle');
  const debugViewMode = document.getElementById('debug-view-mode');
  const debugFieldSelect = document.getElementById('debug-field-select');
  const fieldLayerListEl = document.getElementById('field-layer-list');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');

  const inspectorEmpty = document.getElementById('inspector-empty');
  const buildingForm = document.getElementById('building-form');
  const buildingId = document.getElementById('building-id');
  const buildingName = document.getElementById('building-name');
  const buildingType = document.getElementById('building-type');
  const buildingOwner = document.getElementById('building-owner');
  const buildingState = document.getElementById('building-state');
  const buildingProgress = document.getElementById('building-progress');
  const buildingBuilder = document.getElementById('building-builder');
  const builderSpawnerPanel = document.getElementById('builder-spawner-panel');
  const builderSpawnerStatus = document.getElementById('builder-spawner-status');
  const builderSpawnerActive = document.getElementById('builder-spawner-active');
  const builderSpawnerCooldown = document.getElementById('builder-spawner-cooldown');
  const builderSpawnerExit = document.getElementById('builder-spawner-exit');
  const builderSpawnerPending = document.getElementById('builder-spawner-pending');
  const activateBuilderSpawnerBtn = document.getElementById('activate-builder-spawner-btn');
  const deleteBuildingBtn = document.getElementById('delete-building-btn');

  const commandForm = document.getElementById('command-form');
  const commandInput = document.getElementById('command-input');

  const intentSelect = document.getElementById('intent-select');
  const intentType = document.getElementById('intent-type');
  const intentLabel = document.getElementById('intent-label');
  const intentX = document.getElementById('intent-x');
  const intentY = document.getElementById('intent-y');
  const intentRadius = document.getElementById('intent-radius');
  const intentWeight = document.getElementById('intent-weight');
  const intentPickPositionBtn = document.getElementById('intent-pick-position-btn');
  const intentCreateBtn = document.getElementById('intent-create-btn');
  const intentDeleteBtn = document.getElementById('intent-delete-btn');
  const intentPickHint = document.getElementById('intent-pick-hint');
  const intentCreateHint = document.getElementById('intent-create-hint');
  const intentPromptInput = document.getElementById('intent-prompt-input');
  const translateIntentBtn = document.getElementById('translate-intent-btn');
  const applyTranslatedIntentBtn = document.getElementById('apply-translated-intent-btn');
  const intentTranslationStatusEl = document.getElementById('intent-translation-status');
  const intentTranslationPreviewEl = document.getElementById('intent-translation-preview');
  const postResetCyclesInput = document.getElementById('post-reset-cycles');
  const simulationSpeedSelect = document.getElementById('simulation-speed-select');
  const toggleSimulationPauseBtn = document.getElementById('toggle-simulation-pause-btn');
  const stepSimulationBtn = document.getElementById('step-simulation-btn');
  const simulationStatusEl = document.getElementById('simulation-status');
  const hudWorldSummaryEl = document.getElementById('hud-world-summary');
  const hudConflictSummaryEl = document.getElementById('hud-conflict-summary');
  const hudWeatherSummaryEl = document.getElementById('hud-weather-summary');
  const hudSelectionSummaryEl = document.getElementById('hud-selection-summary');
  const hudInspectTitleEl = document.getElementById('hud-inspect-title');
  const hudInspectModeEl = document.getElementById('hud-inspect-mode');
  const hudInspectSubtitleEl = document.getElementById('hud-inspect-subtitle');
  const hudInspectListEl = document.getElementById('hud-inspect-list');
  const resetWorkerEnergyBtn = document.getElementById('reset-worker-energy-btn');
  const resetScenarioBtn = document.getElementById('reset-scenario-btn');

  const runChecksBtn = document.getElementById('run-checks-btn');
  const qaScorecardEl = document.getElementById('qa-scorecard');
  const adaptiveStatusEl = document.getElementById('adaptive-status');
  const adaptiveWeightListEl = document.getElementById('adaptive-weight-list');
  const adaptiveQaInputsEl = document.getElementById('adaptive-qa-inputs');
  const adaptiveTrendListEl = document.getElementById('adaptive-trend-list');
  const adaptiveHistoryListEl = document.getElementById('adaptive-history-list');
  const adaptivePlateauListEl = document.getElementById('adaptive-plateau-list');
  const adaptiveReasonsEl = document.getElementById('adaptive-reasons');
  const resetAdaptiveWeightsBtn = document.getElementById('reset-adaptive-weights-btn');
  const scoreSummaryToggle = document.getElementById('score-summary-toggle');
  const scoreSummaryEl = document.getElementById('score-summary');
  const resolverLogToggle = document.getElementById('resolver-log-toggle');
  const resolverLogEl = document.getElementById('resolver-log');
  const resolverInspectorToggle = document.getElementById('resolver-inspector-toggle');
  const clearResolverPinBtn = document.getElementById('clear-resolver-pin-btn');
  const resolverInspectorDetailEl = document.getElementById('resolver-inspector-detail');
  const resolverTopCandidatesEl = document.getElementById('resolver-top-candidates');
  const currentTaskEl = document.getElementById('current-task');
  const queuedTasksEl = document.getElementById('queued-tasks');
  const failedTasksEl = document.getElementById('failed-tasks');
  const cancelCurrentTaskBtn = document.getElementById('cancel-current-task-btn');
  const clearTaskQueueBtn = document.getElementById('clear-task-queue-btn');

  const workerListEl = document.getElementById('worker-list');
  const workerDetailsEmptyEl = document.getElementById('worker-details-empty');
  const workerDetailsEl = document.getElementById('worker-details');
  const selectedWorkerIdEl = document.getElementById('selected-worker-id');
  const selectedWorkerStateEl = document.getElementById('selected-worker-state');
  const selectedWorkerEnergyEl = document.getElementById('selected-worker-energy');
  const selectedWorkerCurrentTaskEl = document.getElementById('selected-worker-current-task');
  const selectedWorkerQueueEl = document.getElementById('selected-worker-queue');
  const selectedWorkerFailedEl = document.getElementById('selected-worker-failed');

  toolSelect.addEventListener('change', () => {
    state.tool = toolSelect.value;
  });

  buildingTypeSelect.addEventListener('change', () => {
    state.activeBuildingType = buildingTypeSelect.value;
  });

  debugOverlayToggle.checked = Boolean(state.debugOverlay?.enabled);
  debugViewMode.value = state.debugOverlay?.mode ?? 'isolated';
  debugFieldSelect.value = state.debugOverlay?.isolatedField ?? state.debugOverlay?.selectedField ?? 'defensibility';

  debugOverlayToggle.addEventListener('change', () => {
    actions.setDebugOverlayEnabled(debugOverlayToggle.checked);
  });

  debugViewMode.addEventListener('change', () => {
    actions.setDebugOverlayMode(debugViewMode.value);
  });

  debugFieldSelect.addEventListener('change', () => {
    actions.setDebugOverlayFocusField(debugFieldSelect.value);
  });

  clearSelectionBtn.addEventListener('click', () => {
    actions.selectBuilding(null);
  });

  buildingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    actions.updateSelectedBuilding({
      name: buildingName.value,
      type: buildingType.value,
      owner: buildingOwner.value
    });
  });

  deleteBuildingBtn.addEventListener('click', () => {
    actions.deleteSelectedBuilding();
  });

  activateBuilderSpawnerBtn?.addEventListener('click', () => {
    actions.activateSelectedSpawner();
  });

  commandForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!commandInput.value.trim()) return;
    actions.runCommandText(commandInput.value.trim());
    commandInput.value = '';
  });

  intentSelect.addEventListener('change', () => {
    actions.selectIntent(intentSelect.value);
  });

  intentType.addEventListener('change', () => {
    actions.updateSelectedIntent({ type: intentType.value });
  });

  intentLabel.addEventListener('input', () => {
    actions.updateSelectedIntent({ label: intentLabel.value });
  });
  intentLabel.addEventListener('change', refreshIntentControls);

  intentX.addEventListener('input', () => {
    if (intentX.value === '') return;
    actions.updateSelectedIntent({ x: Number(intentX.value) });
  });
  intentX.addEventListener('change', refreshIntentControls);

  intentY.addEventListener('input', () => {
    if (intentY.value === '') return;
    actions.updateSelectedIntent({ y: Number(intentY.value) });
  });
  intentY.addEventListener('change', refreshIntentControls);

  intentRadius.addEventListener('input', () => {
    if (intentRadius.value === '') return;
    actions.updateSelectedIntent({ radius: Number(intentRadius.value) });
  });
  intentRadius.addEventListener('change', refreshIntentControls);

  intentWeight.addEventListener('input', () => {
    if (intentWeight.value === '') return;
    actions.updateSelectedIntent({ weight: Number(intentWeight.value) });
  });
  intentWeight.addEventListener('change', refreshIntentControls);

  intentPickPositionBtn.addEventListener('click', () => {
    actions.toggleIntentPickMode();
  });

  intentCreateBtn.addEventListener('click', () => {
    actions.toggleIntentCreateMode();
  });

  intentDeleteBtn.addEventListener('click', () => {
    actions.removeSelectedIntent();
  });

  intentPromptInput.addEventListener('input', () => {
    actions.updateIntentPrompt(intentPromptInput.value);
    refreshIntentControls();
  });

  translateIntentBtn.addEventListener('click', () => {
    actions.translateIntentPrompt();
  });

  applyTranslatedIntentBtn.addEventListener('click', () => {
    actions.applyTranslatedIntent();
  });

  postResetCyclesInput.value = state.debug?.postResetCycles ?? 0;
  postResetCyclesInput.addEventListener('input', () => {
    actions.updatePostResetCycles(Number(postResetCyclesInput.value));
  });
  postResetCyclesInput.addEventListener('change', refreshScenarioControls);

  simulationSpeedSelect.value = `${state.simulation?.speedMultiplier ?? 1}`;
  simulationSpeedSelect.addEventListener('change', () => {
    actions.setSimulationSpeed(Number(simulationSpeedSelect.value));
  });

  toggleSimulationPauseBtn.addEventListener('click', () => {
    actions.toggleSimulationPaused();
  });

  stepSimulationBtn.addEventListener('click', () => {
    actions.stepSimulation(1);
  });

  resetWorkerEnergyBtn.addEventListener('click', () => {
    actions.resetWorkerEnergy();
  });

  resetScenarioBtn.addEventListener('click', () => {
    actions.resetScenario();
  });

  runChecksBtn.addEventListener('click', () => {
    actions.runChecks();
  });

  resetAdaptiveWeightsBtn.addEventListener('click', () => {
    actions.resetAdaptiveWeights();
  });

  scoreSummaryToggle.checked = Boolean(state.debug?.scoreSummaryEnabled);
  scoreSummaryToggle.addEventListener('change', () => {
    state.debug.scoreSummaryEnabled = scoreSummaryToggle.checked;
    refreshScoreSummary();
  });

  resolverLogToggle.checked = Boolean(state.debug?.resolverLogEnabled);
  resolverLogToggle.addEventListener('change', () => {
    state.debug.resolverLogEnabled = resolverLogToggle.checked;
    if (!state.debug.resolverLogEnabled) {
      state.emergence.candidateLog = [];
    }
    refreshResolverLog();
  });

  resolverInspectorToggle.checked = Boolean(state.debug?.resolverInspectorEnabled);
  resolverInspectorToggle.addEventListener('change', () => {
    state.debug.resolverInspectorEnabled = resolverInspectorToggle.checked;
    if (!state.debug.resolverInspectorEnabled) {
      state.debug.resolverHoverTile = null;
      state.debug.resolverPinnedTile = null;
    }
    refreshResolverInspector();
  });

  clearResolverPinBtn.addEventListener('click', () => {
    actions.clearResolverInspectorPin();
  });

  cancelCurrentTaskBtn.addEventListener('click', () => {
    actions.cancelCurrentTask();
  });

  clearTaskQueueBtn.addEventListener('click', () => {
    actions.clearTaskQueue();
  });

  function refreshInspector() {
    const selected = state.store.buildings.find((b) => b.id === state.selectedBuildingId);
    if (!selected) {
      inspectorEmpty.classList.remove('hidden');
      buildingForm.classList.add('hidden');
      builderSpawnerPanel.classList.add('hidden');
      refreshOperatorHud();
      return;
    }

    inspectorEmpty.classList.add('hidden');
    buildingForm.classList.remove('hidden');
    buildingId.value = selected.id;
    buildingName.value = selected.name;
    buildingType.value = selected.type;
    buildingOwner.value = selected.owner;
    buildingState.textContent = selected.state ?? 'complete';
    const percent = Math.floor(((selected.buildProgress ?? selected.buildRequired ?? 1) / (selected.buildRequired ?? 1)) * 100);
    buildingProgress.textContent = `${selected.buildProgress ?? selected.buildRequired ?? 1}/${selected.buildRequired ?? 1} (${percent}%)`;
    buildingBuilder.textContent = selected.builderActorId ?? 'n/a';

    const spawnerSummary = getBuilderSpawnerSummary(state, selected);
    if (spawnerSummary.status === 'invalid') {
      builderSpawnerPanel.classList.add('hidden');
      return;
    }

    builderSpawnerPanel.classList.remove('hidden');
    builderSpawnerStatus.textContent = `${spawnerSummary.status} | ${spawnerSummary.reason}`;
    builderSpawnerActive.textContent = `${spawnerSummary.activeCount}/${spawnerSummary.spawnCap}`;
    builderSpawnerCooldown.textContent = `${spawnerSummary.cooldownRemaining}`;
    builderSpawnerPending.textContent = `${spawnerSummary.pendingCount}`;
    builderSpawnerExit.textContent = spawnerSummary.spawnTile
      ? `(${spawnerSummary.spawnTile.x}, ${spawnerSummary.spawnTile.y})`
      : 'blocked';
    activateBuilderSpawnerBtn.disabled = !spawnerSummary.ok;
    refreshOperatorHud();
  }

  function refreshTaskPanel() {
    const currentTask = state.store.agent.currentTask;
    currentTaskEl.textContent = currentTask ? formatTask(currentTask) : 'Idle';

    renderQueueList(queuedTasksEl, state.store.agent.taskQueue, 'agent', actions);
    renderFailedList(failedTasksEl, state.store.agent.failedTasks, 'agent', actions);
    refreshOperatorHud();
  }

  function refreshWorkerPanel() {
    const workers = state.store.units.filter((unit) => unit.type === 'worker');
    workerListEl.innerHTML = '';

    if (workers.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No workers yet';
      workerListEl.append(li);
      state.selectedWorkerId = null;
    } else {
      const selectedStillExists = workers.some((worker) => worker.id === state.selectedWorkerId);
      if (!selectedStillExists) {
        state.selectedWorkerId = workers[0].id;
      }

      workers.forEach((worker) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        const classes = ['worker-btn'];
        if (worker.id === state.selectedWorkerId) {
          classes.push('selected');
        }
        if (worker.state === 'exhausted') {
          classes.push('exhausted');
        }

        button.type = 'button';
        button.className = classes.join(' ');
        const relaySummary = worker.state === 'recharging' && worker.rechargeBuildingId
          ? ` | relay ${worker.rechargeBuildingId}`
          : '';
        const roleSummary = worker.role === 'builder'
          ? ` | builder${worker.spawnedBySpawnerId ? ` @ ${worker.spawnedBySpawnerId}` : ''}`
          : '';
        button.textContent = `${worker.id} | ${worker.state}${roleSummary}${relaySummary} | energy ${getActorEnergyText(worker)}`;
        button.addEventListener('click', () => {
          state.selectedWorkerId = worker.id;
          refreshWorkerPanel();
        });
        li.append(button);
        workerListEl.append(li);
      });
    }

    const selectedWorker = workers.find((worker) => worker.id === state.selectedWorkerId);
    if (!selectedWorker) {
      workerDetailsEmptyEl.classList.remove('hidden');
      workerDetailsEl.classList.add('hidden');
      refreshOperatorHud();
      return;
    }

    workerDetailsEmptyEl.classList.add('hidden');
    workerDetailsEl.classList.remove('hidden');
    selectedWorkerIdEl.textContent = selectedWorker.id;
    selectedWorkerStateEl.textContent = selectedWorker.role === 'builder'
      ? `${selectedWorker.state} | builder from ${selectedWorker.spawnedBySpawnerId ?? 'unknown'}`
      : selectedWorker.state;
    selectedWorkerEnergyEl.textContent = getActorEnergyText(selectedWorker);
    selectedWorkerCurrentTaskEl.textContent = selectedWorker.currentTask
      ? formatTask(selectedWorker.currentTask)
      : selectedWorker.state === 'recharging' && selectedWorker.rechargeBuildingId
        ? `Recharge at ${selectedWorker.rechargeBuildingId}`
        : 'Idle';

    renderQueueList(selectedWorkerQueueEl, selectedWorker.taskQueue, selectedWorker.id, actions);
    renderFailedList(selectedWorkerFailedEl, selectedWorker.failedTasks, selectedWorker.id, actions);
    refreshOperatorHud();
  }

  function refreshFieldLayerControls() {
    debugOverlayToggle.checked = Boolean(state.debugOverlay?.enabled);
    debugViewMode.value = state.debugOverlay?.mode ?? 'isolated';
    debugFieldSelect.value = state.debugOverlay?.isolatedField ?? state.debugOverlay?.selectedField ?? 'defensibility';

    fieldLayerListEl.innerHTML = '';
    FIELD_LAYER_ORDER.forEach((fieldName) => {
      const visual = FIELD_VISUALS[fieldName] ?? FIELD_VISUALS.cover;
      const layerState = state.debugOverlay?.layers?.[fieldName] ?? { enabled: true, opacity: 1 };

      const row = document.createElement('div');
      row.className = 'field-layer-row';

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = Boolean(layerState.enabled);
      toggle.addEventListener('change', () => {
        actions.setDebugOverlayLayerEnabled(fieldName, toggle.checked);
      });

      const chip = document.createElement('span');
      chip.className = 'field-layer-chip';
      chip.style.background = `rgb(${visual.color[0]}, ${visual.color[1]}, ${visual.color[2]})`;

      const meta = document.createElement('div');
      meta.className = 'field-layer-meta';
      const name = document.createElement('div');
      name.className = 'field-layer-name';
      name.textContent = visual.label;
      const slider = document.createElement('input');
      slider.className = 'field-layer-range';
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '5';
      slider.value = String(Math.round((layerState.opacity ?? 1) * 100));
      slider.addEventListener('input', () => {
        actions.setDebugOverlayLayerOpacity(fieldName, Number(slider.value) / 100);
      });
      meta.append(name, slider);

      const solo = document.createElement('button');
      solo.type = 'button';
      solo.textContent = state.debugOverlay?.mode === 'isolated' && (state.debugOverlay?.isolatedField ?? state.debugOverlay?.selectedField) === fieldName
        ? 'Solo'
        : 'Focus';
      solo.addEventListener('click', () => {
        actions.soloDebugOverlayField(fieldName);
      });

      row.append(toggle, chip, meta, solo);
      fieldLayerListEl.append(row);
    });
    refreshOperatorHud();
  }

  function refreshScoreSummary() {
    if (!state.debug?.scoreSummaryEnabled) {
      scoreSummaryEl.classList.add('hidden');
      return;
    }

    scoreSummaryEl.classList.remove('hidden');
    scoreSummaryEl.innerHTML = '';

    const ranked = (state.emergence?.candidates ?? []).slice(0, state.debug.scoreSummaryLimit ?? 3);
    if (ranked.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No active paint candidates.';
      scoreSummaryEl.append(li);
      return;
    }

    ranked.forEach((candidate, index) => {
      const li = document.createElement('li');
      const breakdown = candidate.scoreBreakdown ?? {};
      li.textContent = `#${index + 1} (${candidate.target.x},${candidate.target.y}) ${formatTaskTraceLabel(candidate)} | final ${formatNumber(breakdown.finalScore ?? candidate.score)}`;
      scoreSummaryEl.append(li);
    });
  }

  function refreshQaScorecard() {
    qaScorecardEl.innerHTML = '';

    const qa = state.emergence?.qa;
    if (!qa) {
      const li = document.createElement('li');
      li.textContent = 'Waiting for emergence evaluation.';
      qaScorecardEl.append(li);
      return;
    }

    const summary = document.createElement('li');
    summary.className = `qa-summary ${qa.status}`;

    const summaryTitle = document.createElement('div');
    summaryTitle.className = 'qa-metric-label';
    summaryTitle.textContent = `Overall QA score ${qa.overallScore}/100`;

    const summaryDetail = document.createElement('div');
    summaryDetail.className = 'qa-metric-detail';
    summaryDetail.textContent = qa.summary;

    summary.append(summaryTitle, summaryDetail);
    qaScorecardEl.append(summary);

    qa.metrics.forEach((metric) => {
      const li = document.createElement('li');
      li.className = `qa-metric ${metric.level}`;

      const label = document.createElement('div');
      label.className = 'qa-metric-label';
      label.textContent = `${metric.label}: ${formatPercent(metric.value)}`;

      const detail = document.createElement('div');
      detail.className = 'qa-metric-detail';
      detail.textContent = metric.detail;

      li.append(label, detail);
      qaScorecardEl.append(li);
    });
  }

  function refreshResolverLog() {
    if (!state.debug?.resolverLogEnabled) {
      resolverLogEl.classList.add('hidden');
      return;
    }

    resolverLogEl.classList.remove('hidden');
    resolverLogEl.innerHTML = '';

    const snapshots = state.emergence?.candidateLog ?? [];
    if (snapshots.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No resolver cycles logged yet.';
      resolverLogEl.append(li);
      return;
    }

    snapshots.forEach((snapshot) => {
      const li = document.createElement('li');
      li.className = 'resolver-log-item';

      const header = document.createElement('div');
      header.textContent = `Cycle ${snapshot.cycle} | adaptive ${snapshot.adaptive?.summary ?? 'base resolver weights'}`;
      li.append(header);

      if (snapshot.entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'resolver-log-line';
        empty.textContent = 'No active candidates.';
        li.append(empty);
      } else {
        snapshot.entries.forEach((entry, index) => {
          const line = document.createElement('div');
          line.className = 'resolver-log-line';
          const status = entry.presentationStatus === 'accepted'
            ? 'accepted winner'
            : entry.presentationStatus === 'shortlisted'
              ? 'shortlisted'
              : `rejected: ${entry.rejectionCategory ?? 'shortlist'}`;
          const tie = entry.tieGroupSize > 1 ? ' | tie' : '';
          line.textContent = `#${entry.rank ?? index + 1} (${entry.x},${entry.y}) ${status}${tie} | final ${formatNumber(entry.finalScore)}`;
          li.append(line);
        });
      }

      resolverLogEl.append(li);
    });
  }

  function refreshResolverInspector() {
    resolverInspectorToggle.checked = Boolean(state.debug?.resolverInspectorEnabled);
    clearResolverPinBtn.disabled = !state.debug?.resolverPinnedTile;

    if (!state.debug?.resolverInspectorEnabled) {
      resolverInspectorDetailEl.classList.add('hidden');
      resolverTopCandidatesEl.classList.add('hidden');
      return;
    }

    resolverInspectorDetailEl.classList.remove('hidden');
    resolverTopCandidatesEl.classList.remove('hidden');

    const tile = state.debug?.resolverPinnedTile ?? state.debug?.resolverHoverTile;
    const diagnostic = tile
      ? state.emergence?.resolverInspector?.tileDiagnostics?.[`${tile.x},${tile.y}`]
      : null;
    const decisionEntry = findResolverPresentationEntry(state.emergence?.resolverDecision, tile);
    const detailEntry = decisionEntry ?? (diagnostic ? toResolverPresentationEntry(diagnostic) : null);

    resolverInspectorDetailEl.innerHTML = '';
    if (!tile || !detailEntry) {
      resolverInspectorDetailEl.append(createResolverEmptyState());
    } else {
      const mode = state.debug?.resolverPinnedTile ? 'pinned' : 'hover';
      resolverInspectorDetailEl.append(createResolverInspectorCard(detailEntry, {
        tile,
        mode,
        cycle: state.emergence?.resolverDecision?.cycle ?? state.emergence?.resolveCycle ?? 0
      }));
    }

    resolverTopCandidatesEl.innerHTML = '';
    const topRanked = getResolverPresentationEntries(
      state.emergence?.resolverDecision,
      state.emergence?.resolverInspector?.topRanked ?? []
    );
    if (topRanked.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No ranked candidates.';
      resolverTopCandidatesEl.append(li);
      return;
    }

    topRanked.forEach((entry) => {
      const li = document.createElement('li');
      li.className = `resolver-candidate-card is-${entry.presentationStatus}`;
      li.append(createResolverCandidateCard(entry));
      resolverTopCandidatesEl.append(li);
    });
    refreshOperatorHud();
  }

  function refreshIntentControls() {
    const intents = state.emergence?.intents ?? [];
    const draftId = '__intent-draft__';
    const selectedIntentId = state.debug?.selectedIntentId ?? intents[0]?.id ?? draftId;
    const draft = state.debug?.intentDraft ?? {
      id: draftId,
      type: 'defensibility',
      position: { x: 0, y: 0, z: 0 },
      radius: 4,
      weight: 1,
      label: ''
    };

    intentSelect.innerHTML = '';
    const draftOption = document.createElement('option');
    draftOption.value = draftId;
    draftOption.textContent = 'new influence draft';
    draftOption.selected = selectedIntentId === draftId;
    intentSelect.append(draftOption);

    intents.forEach((intent) => {
      const option = document.createElement('option');
      option.value = intent.id;
      option.textContent = intent.label
        ? `${intent.type} | ${intent.label} (${intent.id})`
        : `${intent.type} | ${intent.id}`;
      option.selected = intent.id === selectedIntentId;
      intentSelect.append(option);
    });

    const selectedIntent = selectedIntentId === draftId
      ? draft
      : intents.find((intent) => intent.id === selectedIntentId) ?? intents[0] ?? draft;
    const selectedIsDraft = selectedIntentId === draftId;
    const disabled = !selectedIntent;

    intentSelect.disabled = disabled;
    intentType.disabled = disabled;
    intentLabel.disabled = disabled;
    intentX.disabled = disabled;
    intentY.disabled = disabled;
    intentRadius.disabled = disabled;
    intentWeight.disabled = disabled;
    intentPickPositionBtn.disabled = disabled || selectedIsDraft;
    intentDeleteBtn.disabled = disabled || selectedIsDraft;

    if (!selectedIntent) {
      intentType.value = 'defensibility';
      intentLabel.value = '';
      intentX.value = '';
      intentY.value = '';
      intentRadius.value = '';
      intentWeight.value = '';
      intentPickHint.classList.add('hidden');
      intentCreateHint.classList.add('hidden');
      intentPickPositionBtn.classList.remove('active-pick');
      intentCreateBtn.classList.remove('active-create');
      intentPickPositionBtn.textContent = 'Move On Map';
      intentCreateBtn.textContent = 'Add On Map';
      refreshIntentTranslation();
      refreshOperatorHud();
      return;
    }

    intentType.value = selectedIntent.type ?? 'defensibility';
    intentLabel.value = selectedIntent.label ?? '';
    intentX.value = selectedIntent.position.x;
    intentY.value = selectedIntent.position.y;
    intentRadius.value = selectedIntent.radius;
    intentWeight.value = formatNumber(selectedIntent.weight);

    const pickModeActive = Boolean(state.debug?.intentPickMode);
    const createModeActive = Boolean(state.debug?.intentCreateMode);
    intentPickHint.classList.toggle('hidden', !pickModeActive);
    intentCreateHint.classList.toggle('hidden', !createModeActive);
    intentPickPositionBtn.classList.toggle('active-pick', pickModeActive);
    intentCreateBtn.classList.toggle('active-create', createModeActive);
    intentPickPositionBtn.textContent = pickModeActive ? 'Cancel Move' : 'Move On Map';
    intentCreateBtn.textContent = createModeActive ? 'Cancel Add' : 'Add On Map';
    if (selectedIsDraft) {
      intentPickHint.classList.add('hidden');
    }
    refreshIntentTranslation();
    refreshOperatorHud();
  }

  function refreshIntentTranslation() {
    const translation = state.debug?.intentTranslation;
    const prompt = translation?.prompt ?? '';
    const status = translation?.status ?? 'idle';
    const hasValidIntent = status === 'ready' && translation?.translatedIntent;

    if (intentPromptInput.value !== prompt) {
      intentPromptInput.value = prompt;
    }

    translateIntentBtn.disabled = prompt.trim().length === 0;
    applyTranslatedIntentBtn.disabled = !hasValidIntent;

    if (status === 'error') {
      intentTranslationStatusEl.textContent = `Translation failed | ${translation.error}`;
      intentTranslationStatusEl.className = 'helper-text intent-translation-status is-error';
      intentTranslationPreviewEl.textContent = translation.error;
      return;
    }

    if (hasValidIntent) {
      const appliedSummary = translation.appliedIntentId ? ` | injected as ${translation.appliedIntentId}` : '';
      intentTranslationStatusEl.textContent = `Translator ${translation.source}${appliedSummary}`;
      intentTranslationStatusEl.className = 'helper-text intent-translation-status is-ready';
      intentTranslationPreviewEl.textContent = JSON.stringify(translation.translatedIntent, null, 2);
      return;
    }

    intentTranslationStatusEl.textContent = 'Translator idle | supported types: defensibility, flow, threat';
    intentTranslationStatusEl.className = 'helper-text intent-translation-status';
    intentTranslationPreviewEl.textContent = 'Type a request, translate it, then inject the validated intent.';
  }

  function refreshAdaptiveFeedback() {
    const adaptive = state.emergence?.adaptiveResolver;
    const monitor = state.emergence?.adaptiveMonitor;

    adaptiveStatusEl.textContent = adaptive
      ? `Cycle ${adaptive.lastUpdatedCycle ?? 0} | ${adaptive.changed ? 'changed' : 'steady'} | ${adaptive.summary ?? 'base resolver weights'}`
      : 'Waiting for QA feedback.';
    adaptiveStatusEl.className = `adaptive-summary ${adaptive?.changed ? 'changed' : 'steady'}`;

    renderSimpleList(
      adaptiveWeightListEl,
      adaptive
        ? [
            `def ${formatSignedWeight(adaptive.def)}`,
            `reg ${formatSignedWeight(adaptive.reg)}`,
            `mem ${formatSignedWeight(adaptive.mem)}`,
            `hold ${formatSignedWeight(adaptive.hold)}`,
            `flow ${formatSignedWeight(adaptive.flow)}`,
            `trav ${formatSignedWeight(adaptive.trav)}`,
            `corr ${formatSignedWeight(adaptive.corr)}`
          ]
        : ['No adaptive weights yet.']
    );

    const qaSignals = adaptive?.lastQaSignals;
    renderSimpleList(
      adaptiveQaInputsEl,
      qaSignals
        ? [
            `blockers ${Number(qaSignals.blockersCount ?? 0).toFixed(0)}`,
            `openness preserved ${formatPercent(qaSignals.opennessPreserved)}`,
            `structure coherence ${formatPercent(qaSignals.structureCoherence)}`,
            `convergence achieved ${formatPercent(qaSignals.convergenceAchieved)}`,
            `stable cycles ${Number(qaSignals.stableCycles ?? 0).toFixed(0)}`
          ]
        : ['No QA signals applied yet.']
    );

    renderSimpleList(
      adaptiveTrendListEl,
      monitor
        ? [
            formatAdaptiveTrendLine('Score', monitor.trends?.score, formatNumber),
            formatAdaptiveTrendLine('Blockers', monitor.trends?.blockers, formatInteger),
            formatAdaptiveTrendLine('Openness', monitor.trends?.openness, formatPercentValue),
            formatAdaptiveTrendLine('Convergence', monitor.trends?.convergence, formatPercentValue)
          ]
        : ['No tuning trend data yet.']
    );

    renderSimpleList(
      adaptiveHistoryListEl,
      monitor?.history?.length
        ? monitor.history.map((entry) => formatAdaptiveHistoryLine(entry))
        : ['No adaptive history yet.']
    );

    renderSimpleList(
      adaptivePlateauListEl,
      adaptive
        ? [
            `plateau detected ${adaptive.plateauDetected ? 'yes' : 'no'}`,
            `reason ${adaptive.plateauReason ?? 'waiting for plateau signal'}`,
            `nudge applied ${adaptive.plateauNudgeApplied ? adaptive.plateauNudgeSummary : 'none'}`
          ]
        : ['No plateau decision yet.']
    );

    renderSimpleList(adaptiveReasonsEl, adaptive?.reasons?.length ? adaptive.reasons : ['No adaptive changes recorded.']);
  }

  function refreshScenarioControls() {
    postResetCyclesInput.value = `${state.debug?.postResetCycles ?? 0}`;
    simulationSpeedSelect.value = `${state.simulation?.speedMultiplier ?? 1}`;
    const paused = state.simulation?.mode === 'paused';
    toggleSimulationPauseBtn.textContent = paused ? 'Resume' : 'Pause';
    simulationStatusEl.textContent = paused
      ? `Paused | ${state.simulation?.speedMultiplier ?? 1}x ready | frame ${state.simulation?.totalFrames ?? 0}`
      : `Running | ${state.simulation?.speedMultiplier ?? 1}x | frame ${state.simulation?.totalFrames ?? 0}`;
    refreshOperatorHud();
  }

  function refreshOperatorHud() {
    const workers = state.store.units.filter((unit) => unit.type === 'worker');
    const fighters = state.store.units.filter((unit) => unit.faction);
    const focusedField = state.debugOverlay?.isolatedField ?? state.debugOverlay?.selectedField ?? 'defensibility';
    const weatherSummary = state.emergence?.weather?.lastSummary ?? {};
    const redCount = fighters.filter((unit) => unit.faction === 'red').length;
    const blueCount = fighters.filter((unit) => unit.faction === 'blue').length;
    const selectedBuilding = state.store.buildings.find((building) => building.id === state.selectedBuildingId) ?? null;
    const selectedWorker = workers.find((worker) => worker.id === state.selectedWorkerId) ?? null;
    const selectedIntent = getSelectedIntentSummary(state);
    const activeTile = state.debug?.resolverPinnedTile ?? state.debug?.resolverHoverTile ?? null;

    hudWorldSummaryEl.textContent = `${workers.length} workers | ${fighters.length} fighters | ${state.store.buildings.length} buildings | focus ${focusedField}`;
    hudConflictSummaryEl.textContent = `red ${redCount} vs blue ${blueCount}${state.conflict?.lastOutcome ? ` | winner ${state.conflict.lastOutcome}` : ''}`;
    hudWeatherSummaryEl.textContent = `${weatherSummary.cloudTiles ?? 0} cloud tiles | peak ${formatNumber(weatherSummary.cloudiestTile?.value ?? 0)} | condense ${weatherSummary.condensationTiles ?? 0}`;
    hudSelectionSummaryEl.textContent = selectedBuilding
      ? `building ${selectedBuilding.id}`
      : selectedWorker
        ? `worker ${selectedWorker.id}`
        : selectedIntent
          ? `intent ${selectedIntent.id}`
          : activeTile
            ? `tile ${activeTile.x},${activeTile.y}`
            : 'Nothing selected';

    const inspect = buildInspectPayload({
      state,
      selectedBuilding,
      selectedWorker,
      selectedIntent,
      activeTile,
      focusedField
    });

    hudInspectTitleEl.textContent = inspect.title;
    hudInspectModeEl.textContent = inspect.mode;
    hudInspectSubtitleEl.textContent = inspect.subtitle;
    renderSimpleList(hudInspectListEl, inspect.lines);
  }

  return {
    refreshInspector,
    refreshTaskPanel,
    refreshWorkerPanel,
    refreshFieldLayerControls,
    refreshQaScorecard,
    refreshAdaptiveFeedback,
    refreshScenarioControls,
    refreshScoreSummary,
    refreshResolverInspector,
    refreshResolverLog,
    refreshIntentControls,
    refreshIntentTranslation,
    refreshOperatorHud
  };
}

function buildInspectPayload({ state, selectedBuilding, selectedWorker, selectedIntent, activeTile, focusedField }) {
  if (selectedBuilding) {
    const spawnerSummary = getBuilderSpawnerSummary(state, selectedBuilding);
    return {
      title: `Building ${selectedBuilding.id}`,
      mode: `${selectedBuilding.type} | selected`,
      subtitle: `Tile (${selectedBuilding.x}, ${selectedBuilding.y}, ${selectedBuilding.z ?? 0}) | owner ${selectedBuilding.owner}`,
      lines: [
        `state ${selectedBuilding.state ?? 'complete'}`,
        `progress ${(selectedBuilding.buildProgress ?? selectedBuilding.buildRequired ?? 1)}/${selectedBuilding.buildRequired ?? 1}`,
        `builder ${selectedBuilding.builderActorId ?? 'n/a'}`,
        spawnerSummary.status !== 'invalid'
          ? `spawner ${spawnerSummary.status} | active ${spawnerSummary.activeCount}/${spawnerSummary.spawnCap}`
          : 'spawner n/a'
      ]
    };
  }

  if (selectedWorker) {
    return {
      title: `Worker ${selectedWorker.id}`,
      mode: `${selectedWorker.role ?? 'worker'} | selected`,
      subtitle: `Tile (${selectedWorker.x}, ${selectedWorker.y}, ${selectedWorker.z ?? 0})`,
      lines: [
        `state ${selectedWorker.state}`,
        `energy ${getActorEnergyText(selectedWorker)}`,
        `current ${selectedWorker.currentTask ? formatTask(selectedWorker.currentTask) : 'Idle'}`,
        `queue ${selectedWorker.taskQueue.length} | failed ${selectedWorker.failedTasks.length}`
      ]
    };
  }

  if (selectedIntent) {
    return {
      title: `Intent ${selectedIntent.id}`,
      mode: `${selectedIntent.type} | selected`,
      subtitle: `Center (${selectedIntent.position.x}, ${selectedIntent.position.y}, ${selectedIntent.position.z ?? 0})`,
      lines: [
        `radius ${selectedIntent.radius}`,
        `weight ${formatNumber(selectedIntent.weight)}`,
        `label ${selectedIntent.label || 'none'}`
      ]
    };
  }

  if (activeTile) {
    const tileType = getTileType(state.map, activeTile);
    const elevation = getTileElevation(state.map, activeTile);
    const tileDiagnostics = state.emergence?.resolverInspector?.tileDiagnostics?.[`${activeTile.x},${activeTile.y}`] ?? null;
    const focusedFieldValue = getFieldValue(state.emergence?.fields?.[focusedField], activeTile.x, activeTile.y);
    const heat = getFieldValue(state.emergence?.weather?.heat, activeTile.x, activeTile.y);
    const moisture = getFieldValue(state.emergence?.weather?.moisture, activeTile.x, activeTile.y);
    const clouds = getFieldValue(state.emergence?.weather?.clouds, activeTile.x, activeTile.y);
    const cooldown = Number(state.emergence?.tileCooldowns?.[`${activeTile.x},${activeTile.y}`] ?? 0);

    return {
      title: `Tile (${activeTile.x}, ${activeTile.y})`,
      mode: state.debug?.resolverPinnedTile ? 'Pinned tile' : 'Hover tile',
      subtitle: `${tileType ?? 'void'} | z ${elevation ?? 0} | field ${focusedField}`,
      lines: [
        `focus ${focusedField}: ${focusedFieldValue == null ? 'n/a' : formatNumber(focusedFieldValue)}`,
        `resolver ${tileDiagnostics?.selectionStatus ?? 'n/a'} | score ${tileDiagnostics?.finalScore == null ? 'n/a' : formatNumber(tileDiagnostics.finalScore)}`,
        `heat ${formatNumber(heat ?? 0)} | moisture ${formatNumber(moisture ?? 0)} | clouds ${formatNumber(clouds ?? 0)}`,
        `cooldown ${cooldown}`
      ]
    };
  }

  return {
    title: 'No active selection',
    mode: 'Operator idle',
    subtitle: 'Click a building, select a worker, or pin a tile to inspect it.',
    lines: [
      'Toolbar controls stay visible here.',
      'Deep debug surfaces remain available in the drawers below.'
    ]
  };
}

function getSelectedIntentSummary(state) {
  const selectedIntentId = state.debug?.selectedIntentId;
  if (!selectedIntentId || selectedIntentId === '__intent-draft__') {
    return null;
  }

  return state.emergence?.intents?.find((intent) => intent.id === selectedIntentId) ?? null;
}

function formatTask(task) {
  const target = task.target ? `@(${task.target.x},${task.target.y})` : '@(-,-)';
  const energy = ` | energy: ${getTaskEnergyLabel(task)}`;
  const reason = task.statusReason ? ` | reason: ${task.statusReason}` : '';
  return `${task.id} | ${formatTaskTraceLabel(task)} | ${task.status} | ${target}${energy}${reason}`;
}

function renderQueueList(container, tasks, actorId, actions) {
  container.innerHTML = '';
  if (tasks.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Queue empty';
    container.append(li);
    return;
  }

  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = 'task-row';

    const text = document.createElement('div');
    text.textContent = formatTask(task);

    const controls = document.createElement('div');
    controls.className = 'mini-actions';

    const up = makeButton('↑', () => actions.moveQueuedTask(actorId, task.id, 'up'));
    const down = makeButton('↓', () => actions.moveQueuedTask(actorId, task.id, 'down'));
    const remove = makeButton('Remove', () => actions.removeQueuedTask(actorId, task.id));

    controls.append(up, down, remove);
    li.append(text, controls);
    container.append(li);
  });
}

function renderFailedList(container, tasks, actorId, actions) {
  container.innerHTML = '';
  if (tasks.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No failed tasks';
    container.append(li);
    return;
  }

  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = 'task-row';

    const text = document.createElement('div');
    text.textContent = formatTask(task);

    const controls = document.createElement('div');
    controls.className = 'mini-actions';
    const retry = makeButton('Retry', () => actions.retryFailedTask(actorId, task.id));
    controls.append(retry);

    li.append(text, controls);
    container.append(li);
  });
}

function makeButton(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderSimpleList(container, items) {
  container.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    container.append(li);
  });
}

function formatNumber(value) {
  return Number(value ?? 0).toFixed(2);
}

function formatInteger(value) {
  return `${Math.round(Number(value ?? 0))}`;
}

function formatSignedWeight(value) {
  const numeric = Number(value ?? 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
}

function formatPercent(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function formatPercentValue(value) {
  return formatPercent(value);
}

export function appendLog(listEl, text, level = 'ok') {
  const li = document.createElement('li');
  li.className = level;
  li.textContent = text;
  listEl.prepend(li);
}

function createResolverEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'resolver-empty-state';

  const title = document.createElement('div');
  title.className = 'resolver-empty-title';
  title.textContent = 'Resolver Inspector';

  const body = document.createElement('div');
  body.className = 'resolver-empty-copy';
  body.textContent = 'Hover a tile or click to pin it.';

  empty.append(title, body);
  return empty;
}

function createResolverInspectorCard(entry, { tile, mode, cycle }) {
  const card = document.createElement('div');
  card.className = `resolver-inspector-shell is-${entry.presentationStatus}`;

  const header = document.createElement('div');
  header.className = 'resolver-inspector-header';

  const titleGroup = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'resolver-inspector-title';
  title.textContent = `Tile (${tile.x}, ${tile.y})`;

  const meta = document.createElement('div');
  meta.className = 'resolver-inspector-meta';
  meta.textContent = `Latest ${mode} view${cycle ? ` | cycle ${cycle}` : ''}`;

  titleGroup.append(title, meta);
  header.append(titleGroup, createResolverBadgeRow(entry.badges));

  const metrics = document.createElement('div');
  metrics.className = 'resolver-metric-stack';
  metrics.append(
    createResolverMetric('Gradient', entry.gradient, 'gain'),
    createResolverMetric('Cover Delta', entry.coverDelta, 'gain'),
    createResolverMetric('Visibility Delta', entry.visibilityDelta, 'gain'),
    createResolverMetric('Traversal Cost', entry.traversalCost, 'cost'),
    createResolverMetric('Final Score', entry.finalScore, entry.finalScore >= 0 ? 'score' : 'cost')
  );

  const summary = document.createElement('div');
  summary.className = 'resolver-inspector-summary';

  const statusLine = document.createElement('div');
  statusLine.className = 'resolver-summary-line';
  statusLine.textContent = buildResolverStatusLine(entry);

  const reason = document.createElement('div');
  reason.className = 'resolver-summary-copy';
  reason.textContent = buildResolverReason(entry);

  summary.append(statusLine, reason);

  if (entry.tieGroupSize > 1) {
    const tie = document.createElement('div');
    tie.className = 'resolver-summary-copy muted-copy';
    tie.textContent = entry.tieBreakReason;
    summary.append(tie);
  }

  card.append(header, metrics, summary);
  return card;
}

function createResolverCandidateCard(entry) {
  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'resolver-candidate-header';

  const title = document.createElement('div');
  title.className = 'resolver-candidate-title';
  title.textContent = `#${entry.rank ?? '-'} (${entry.target.x},${entry.target.y})`;

  const score = document.createElement('div');
  score.className = 'resolver-candidate-score';
  score.textContent = formatNumber(entry.finalScore);

  header.append(title, score);

  const badges = createResolverBadgeRow(entry.badges);

  const metrics = document.createElement('div');
  metrics.className = 'resolver-mini-metrics';
  metrics.append(
    createResolverMiniMetric('G', entry.gradient),
    createResolverMiniMetric('C', entry.coverDelta),
    createResolverMiniMetric('V', entry.visibilityDelta),
    createResolverMiniMetric('T', entry.traversalCost)
  );

  const reason = document.createElement('div');
  reason.className = 'resolver-candidate-reason';
  reason.textContent = buildResolverReason(entry);

  wrapper.append(header, badges, metrics, reason);
  return wrapper;
}

function createResolverBadgeRow(badges = []) {
  const row = document.createElement('div');
  row.className = 'resolver-badge-row';

  badges.forEach((badge) => {
    const chip = document.createElement('span');
    chip.className = `resolver-badge badge-${badge}`;
    chip.textContent = formatResolverBadge(badge);
    row.append(chip);
  });

  return row;
}

function createResolverMetric(label, value, tone = 'gain') {
  const metric = document.createElement('div');
  metric.className = 'resolver-metric';

  const head = document.createElement('div');
  head.className = 'resolver-metric-head';

  const metricLabel = document.createElement('span');
  metricLabel.textContent = label;

  const metricValue = document.createElement('strong');
  metricValue.textContent = formatNumber(value);

  head.append(metricLabel, metricValue);

  const meter = document.createElement('div');
  meter.className = `resolver-meter tone-${tone}`;

  const fill = document.createElement('span');
  fill.style.width = `${Math.max(0, Math.min(100, Math.abs(Number(value ?? 0)) * 100))}%`;

  meter.append(fill);
  metric.append(head, meter);
  return metric;
}

function createResolverMiniMetric(label, value) {
  const chip = document.createElement('span');
  chip.className = 'resolver-mini-metric';
  chip.textContent = `${label} ${formatNumber(value)}`;
  return chip;
}

function buildResolverStatusLine(entry) {
  const primary = formatResolverBadge(entry.presentationStatus);
  const tie = entry.tieGroupSize > 1 ? ' | tie cluster' : '';
  return `${primary}${tie} | rank #${entry.rank ?? '-'} | final ${formatNumber(entry.finalScore)}`;
}

function buildResolverReason(entry) {
  if (entry.presentationStatus === 'accepted') {
    return entry.isCycleWinner
      ? 'Won the latest resolve cycle and triggered the current pulse marker.'
      : 'Current live front-runner in the shortlist.';
  }

  if (entry.presentationStatus === 'shortlisted') {
    return 'Near-winner in the latest shortlist.';
  }

  return entry.rejectionReason ?? 'Rejected in the latest resolver pass.';
}

function formatResolverBadge(badge) {
  switch (badge) {
    case 'accepted':
      return 'Accepted';
    case 'shortlisted':
      return 'Shortlisted';
    case 'rejected':
      return 'Rejected';
    case 'tie':
      return 'Tie';
    default:
      return badge;
  }
}
