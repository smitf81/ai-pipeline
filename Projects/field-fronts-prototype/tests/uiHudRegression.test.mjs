import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function run() {
  const source = readFileSync(new URL('../src/ui/gameUI.js', import.meta.url), 'utf8');
  const hudStart = source.indexOf('export function mountGameHUD');
  const actionButtonIndex = source.indexOf("const actionButton = btn('Action'", hudStart);
  const contextPanelIndex = source.indexOf('function renderContextActionPanel()', hudStart);
  const orderWheelIndex = source.indexOf("const orderWheel = el('div', 'ui-order-wheel')", hudStart);
  const renderOrderWheelIndex = source.indexOf('function renderOrderWheel(', hudStart);
  const renderIndex = source.indexOf('function render()', hudStart);

  assert.ok(hudStart >= 0, 'mountGameHUD must exist');
  assert.ok(actionButtonIndex > hudStart, 'HUD action button must be declared inside mountGameHUD');
  assert.ok(orderWheelIndex > actionButtonIndex, 'context order wheel must be declared inside mountGameHUD');
  assert.ok(contextPanelIndex > actionButtonIndex, 'context action render helper must live after the HUD action controls it references');
  assert.ok(contextPanelIndex < renderIndex, 'context action render helper must be in scope before the HUD render function calls it');
  assert.ok(renderOrderWheelIndex > renderIndex, 'order wheel render helper must live in the HUD scope');
  assert.ok(source.includes("'MoveTo'"), 'order wheel must expose the primary MoveTo slot');
  assert.ok(source.includes('ui-order-wheel-slot-label'), 'order wheel actions should render within stable spoke labels');
  assert.ok(source.includes('aria-activedescendant'), 'order wheel should expose its highlighted segment for assistive state');
  assert.equal(
    source.indexOf('function renderContextActionPanel()'),
    contextPanelIndex,
    'context action render helper must not be accidentally left in another UI mount scope'
  );
}
