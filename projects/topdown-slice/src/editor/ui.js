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
  const deleteBuildingBtn = document.getElementById('delete-building-btn');

  const commandForm = document.getElementById('command-form');
  const commandInput = document.getElementById('command-input');

  const runChecksBtn = document.getElementById('run-checks-btn');

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
  }

  return { refreshInspector };
}

export function appendLog(listEl, text, level = 'ok') {
  const li = document.createElement('li');
  li.className = level;
  li.textContent = text;
  listEl.prepend(li);
}
