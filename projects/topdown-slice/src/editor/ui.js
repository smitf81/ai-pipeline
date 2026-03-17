export function bindUI({ state, actions }) {
  const toolSelect = document.getElementById('tool-select');
  const buildingTypeSelect = document.getElementById('building-type-select');
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
  const deleteBuildingBtn = document.getElementById('delete-building-btn');

  const commandForm = document.getElementById('command-form');
  const commandInput = document.getElementById('command-input');

  const runChecksBtn = document.getElementById('run-checks-btn');
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
  const selectedWorkerCurrentTaskEl = document.getElementById('selected-worker-current-task');
  const selectedWorkerQueueEl = document.getElementById('selected-worker-queue');
  const selectedWorkerFailedEl = document.getElementById('selected-worker-failed');

  toolSelect.addEventListener('change', () => {
    state.tool = toolSelect.value;
  });

  buildingTypeSelect.addEventListener('change', () => {
    state.activeBuildingType = buildingTypeSelect.value;
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

  commandForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!commandInput.value.trim()) return;
    actions.runCommandText(commandInput.value.trim());
    commandInput.value = '';
  });

  runChecksBtn.addEventListener('click', () => {
    actions.runChecks();
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
  }

  function refreshTaskPanel() {
    const currentTask = state.store.agent.currentTask;
    currentTaskEl.textContent = currentTask ? formatTask(currentTask) : 'Idle';

    renderQueueList(queuedTasksEl, state.store.agent.taskQueue, 'agent', actions);
    renderFailedList(failedTasksEl, state.store.agent.failedTasks, 'agent', actions);
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
        button.type = 'button';
        button.className = worker.id === state.selectedWorkerId ? 'worker-btn selected' : 'worker-btn';
        button.textContent = `${worker.id} (${worker.state})`;
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
      return;
    }

    workerDetailsEmptyEl.classList.add('hidden');
    workerDetailsEl.classList.remove('hidden');
    selectedWorkerIdEl.textContent = selectedWorker.id;
    selectedWorkerStateEl.textContent = selectedWorker.state;
    selectedWorkerCurrentTaskEl.textContent = selectedWorker.currentTask ? formatTask(selectedWorker.currentTask) : 'Idle';

    renderQueueList(selectedWorkerQueueEl, selectedWorker.taskQueue, selectedWorker.id, actions);
    renderFailedList(selectedWorkerFailedEl, selectedWorker.failedTasks, selectedWorker.id, actions);
  }

  return { refreshInspector, refreshTaskPanel, refreshWorkerPanel };
}

function formatTask(task) {
  const target = task.target ? `@(${task.target.x},${task.target.y})` : '@(-,-)';
  const reason = task.statusReason ? ` | reason: ${task.statusReason}` : '';
  return `${task.id} | ${task.type} | ${task.status} | ${target}${reason}`;
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

export function appendLog(listEl, text, level = 'ok') {
  const li = document.createElement('li');
  li.className = level;
  li.textContent = text;
  listEl.prepend(li);
}
