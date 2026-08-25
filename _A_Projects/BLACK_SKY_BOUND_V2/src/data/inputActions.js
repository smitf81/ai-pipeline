export const InputActionId = Object.freeze({
  MOVE: 'move',
  SPRINT: 'sprint',
  MELEE: 'melee',
  SMOKE: 'smoke',
  DODGE: 'dodge',
  POUNCE_COUNTER: 'pounce_counter',
  DODGE_FOLLOWUP: 'pounce_counter',
  LUNGE: 'lunge',
  PAUSE: 'pause',
  MENU_UP: 'menu_up',
  MENU_DOWN: 'menu_down',
  MENU_LEFT: 'menu_left',
  MENU_RIGHT: 'menu_right',
  MENU_CONFIRM: 'menu_confirm',
  MENU_MIN: 'menu_min',
  MENU_MAX: 'menu_max'
});

const key = (value, label, options = {}) => Object.freeze({ device: 'keyboard', key: value, label, ...options });
const pointer = (button, label, options = {}) => Object.freeze({ device: 'pointer', button, label, ...options });

export const INPUT_ACTIONS = Object.freeze({
  [InputActionId.MOVE]: action(InputActionId.MOVE, 'MOVE', [
    key('w', 'W', { direction: Object.freeze({ x: 0, y: -1 }) }),
    key('a', 'A', { direction: Object.freeze({ x: -1, y: 0 }) }),
    key('s', 'S', { direction: Object.freeze({ x: 0, y: 1 }) }),
    key('d', 'D', { direction: Object.freeze({ x: 1, y: 0 }) }),
    key('arrowup', 'UP', { direction: Object.freeze({ x: 0, y: -1 }), alternate: true }),
    key('arrowleft', 'LEFT', { direction: Object.freeze({ x: -1, y: 0 }), alternate: true }),
    key('arrowdown', 'DOWN', { direction: Object.freeze({ x: 0, y: 1 }), alternate: true }),
    key('arrowright', 'RIGHT', { direction: Object.freeze({ x: 1, y: 0 }), alternate: true })
  ]),
  [InputActionId.SPRINT]: action(InputActionId.SPRINT, 'SPRINT', [key('shift', 'SHIFT')]),
  [InputActionId.MELEE]: action(InputActionId.MELEE, 'ATTACK COMBO', [pointer(0, 'LMB'), key('j', 'J', { alternate: true })]),
  [InputActionId.SMOKE]: action(InputActionId.SMOKE, 'SMOKE', [pointer(2, 'RMB')]),
  [InputActionId.DODGE]: action(InputActionId.DODGE, 'DODGE', [key(' ', 'SPACE', { aliases: Object.freeze(['space']) })]),
  [InputActionId.POUNCE_COUNTER]: action(InputActionId.POUNCE_COUNTER, 'POUNCE COUNTER', [pointer(0, 'LMB')]),
  [InputActionId.LUNGE]: action(InputActionId.LUNGE, 'LUNGE', [key('q', 'Q')]),
  [InputActionId.PAUSE]: action(InputActionId.PAUSE, 'PAUSE', [key('escape', 'ESC'), key('tab', 'TAB', { alternate: true })]),
  [InputActionId.MENU_UP]: action(InputActionId.MENU_UP, 'MENU UP', [key('arrowup', 'UP'), key('w', 'W', { alternate: true })]),
  [InputActionId.MENU_DOWN]: action(InputActionId.MENU_DOWN, 'MENU DOWN', [key('arrowdown', 'DOWN'), key('s', 'S', { alternate: true })]),
  [InputActionId.MENU_LEFT]: action(InputActionId.MENU_LEFT, 'MENU LEFT', [key('arrowleft', 'LEFT'), key('a', 'A', { alternate: true })]),
  [InputActionId.MENU_RIGHT]: action(InputActionId.MENU_RIGHT, 'MENU RIGHT', [key('arrowright', 'RIGHT'), key('d', 'D', { alternate: true })]),
  [InputActionId.MENU_CONFIRM]: action(InputActionId.MENU_CONFIRM, 'CONFIRM', [key('enter', 'ENTER')]),
  [InputActionId.MENU_MIN]: action(InputActionId.MENU_MIN, 'MINIMUM', [key('home', 'HOME')]),
  [InputActionId.MENU_MAX]: action(InputActionId.MENU_MAX, 'MAXIMUM', [key('end', 'END')])
});

export function getInputAction(id) {
  return INPUT_ACTIONS[id] ?? null;
}

export function getInputActionPromptLabels(id, includeAlternates = false) {
  return (getInputAction(id)?.bindings ?? [])
    .filter((binding) => includeAlternates || binding.alternate !== true)
    .map((binding) => binding.label);
}

export function formatInputActionBindings(id) {
  if (id === InputActionId.MOVE) return getInputActionPromptLabels(id).join(' ');
  return getInputActionPromptLabels(id, true).join(' / ');
}

export function isInputActionDown(input, id) {
  return (getInputAction(id)?.bindings ?? []).some((binding) => bindingDown(input, binding));
}

export function wasInputActionPressed(input, id) {
  return (getInputAction(id)?.bindings ?? []).some((binding) => bindingPressed(input, binding));
}

export function consumeInputActionPressed(input, id) {
  for (const binding of getInputAction(id)?.bindings ?? []) {
    if (binding.device === 'pointer') {
      if (input.consumePointerClick?.(binding.button)) return true;
    } else if (bindingPressed(input, binding)) {
      return true;
    }
  }
  return false;
}

export function resolveMovementInput(input) {
  let x = 0;
  let y = 0;
  for (const binding of getInputAction(InputActionId.MOVE)?.bindings ?? []) {
    if (!bindingDown(input, binding) || !binding.direction) continue;
    x += binding.direction.x;
    y += binding.direction.y;
  }
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

export function getActiveInputLabels(input, id) {
  return (getInputAction(id)?.bindings ?? [])
    .filter((binding) => bindingDown(input, binding) || bindingPressed(input, binding))
    .map((binding) => binding.label);
}

function action(id, label, bindings) {
  return Object.freeze({ id, label, bindings: Object.freeze(bindings) });
}

function bindingDown(input, binding) {
  if (binding.device === 'pointer') return input.pointer?.down === true && input.pointer?.button === binding.button;
  return bindingKeys(binding).some((value) => input.isDown?.(value));
}

function bindingPressed(input, binding) {
  if (binding.device === 'pointer') return input.wasPointerPressed?.(binding.button) === true;
  return bindingKeys(binding).some((value) => input.wasPressed?.(value));
}

function bindingKeys(binding) {
  return [binding.key, ...(binding.aliases ?? [])];
}
