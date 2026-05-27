const DEFAULT_QUICK_ACCESS_IDS = Object.freeze([
  'department',
  'desk',
  'people-plan',
  'whiteboard',
  'utilities',
]);

function toDeskId(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function buildStudioQuickAccessStrip(options = {}) {
  const selectedAgentId = toDeskId(options.selectedAgentId);
  const deskPanelDeskId = toDeskId(options.deskPanelDeskId);
  const ctoDeskId = toDeskId(options.ctoEditTargetDeskId, 'cto-architect');
  const currentDeskId = deskPanelDeskId || selectedAgentId;
  const focusDeskId = currentDeskId || ctoDeskId;

  return [
    {
      id: 'department',
      label: 'Visible + Department',
      active: currentDeskId === ctoDeskId,
      targetDeskId: ctoDeskId,
      kind: 'desk',
      tone: 'primary',
    },
    {
      id: 'desk',
      label: 'Visible + Desk',
      active: Boolean(currentDeskId && currentDeskId !== ctoDeskId),
      targetDeskId: focusDeskId,
      kind: 'desk',
      tone: 'secondary',
    },
    {
      id: 'people-plan',
      label: 'People Plan',
      active: Boolean(options.rosterUtilityOpen),
      windowId: 'roster',
      kind: 'utility',
      tone: 'secondary',
    },
    {
      id: 'whiteboard',
      label: 'Whiteboard',
      active: Boolean(options.teamBoardWallBoardExpanded),
      kind: 'whiteboard',
      tone: 'secondary',
    },
    {
      id: 'utilities',
      label: 'Utilities',
      active: Boolean(options.utilityDockOpen),
      kind: 'utility-toggle',
      tone: 'secondary',
    },
  ].filter((item) => DEFAULT_QUICK_ACCESS_IDS.includes(item.id));
}

