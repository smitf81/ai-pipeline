export const THREE_SCREEN_STYLE_ID = 'bsb-three-screen-style-v2';

export function installThreeScreenTheme(documentRef = globalThis.document) {
  if (!documentRef?.head) return null;
  const existing = documentRef.getElementById(THREE_SCREEN_STYLE_ID);
  if (existing) return existing;
  const style = documentRef.createElement('style');
  style.id = THREE_SCREEN_STYLE_ID;
  style.textContent = THREE_SCREEN_CSS;
  documentRef.head.appendChild(style);
  return style;
}

const THREE_SCREEN_CSS = `
#bsb-three-screen-overlay {
  --bsb-night: #05090b;
  --bsb-panel: rgba(5, 9, 11, .93);
  --bsb-ivory: #e8dfcc;
  --bsb-ash: #8f9a97;
  --bsb-dim: #58625f;
  --bsb-ember: #d9974b;
  --bsb-edge: rgba(190, 203, 198, .28);
  color: var(--bsb-ivory);
  font: 12px/1.35 ui-monospace, "Cascadia Mono", Consolas, monospace;
  text-shadow: 0 1px 3px #000;
}
#bsb-three-screen-overlay *, #bsb-three-screen-overlay *::before, #bsb-three-screen-overlay *::after { box-sizing: border-box; }
.bsb-screen-layer { position: absolute; inset: 0; pointer-events: none; }
.bsb-hud {
  position: absolute; left: 18px; bottom: 18px; min-width: 276px; max-width: min(430px, calc(100vw - 36px));
  padding: 12px 14px; border: 1px solid var(--bsb-edge); border-radius: 6px;
  background: rgba(4, 8, 10, .76); backdrop-filter: blur(5px); z-index: 4;
}
.bsb-hud-kicker { color: #9eaaa8; font-size: 10px; letter-spacing: .08em; }
.bsb-hud-vitals { margin-top: 5px; }
.bsb-hud-objective { color: #aeb8b2; margin-top: 4px; }
.bsb-hud-arena { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(213, 151, 75, .2); color: #d9ad72; }
.bsb-message { position: absolute; left: 50%; top: 24px; transform: translateX(-50%); max-width: min(680px, 80vw); text-align: center; z-index: 5; }
.bsb-arena-banner { display: none; align-items: flex-start; justify-content: center; padding-top: 76px; z-index: 6; }
.bsb-arena-banner.is-visible { display: flex; }
.bsb-arena-card {
  min-width: min(540px, calc(100vw - 36px)); max-width: calc(100vw - 36px); padding: 15px 22px 16px;
  border-top: 1px solid rgba(229, 160, 80, .68); border-bottom: 1px solid rgba(229, 160, 80, .22);
  background: linear-gradient(90deg, rgba(5, 9, 11, 0), rgba(5, 9, 11, .9) 18%, rgba(5, 9, 11, .9) 82%, rgba(5, 9, 11, 0));
  text-align: center; animation: bsb-banner-in .2s ease-out both;
}
.bsb-arena-eyebrow { color: var(--bsb-ember); font-size: 10px; }
.bsb-arena-title { margin-top: 4px; color: var(--bsb-ivory); font-size: 20px; }
.bsb-arena-detail { margin-top: 5px; color: #aeb8b2; font-size: 11px; }
@keyframes bsb-banner-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
.bsb-tutorial { display: none; z-index: 12; }
.bsb-tutorial.is-visible { display: block; }
.bsb-tutorial-card {
  position: absolute; left: 50%; bottom: 20%; transform: translate(-50%, 0); min-width: 280px; max-width: min(560px, calc(100vw - 32px));
  padding: 22px 28px 18px; text-align: center; border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(4, 8, 10, .82) 0, rgba(4, 8, 10, .48) 55%, rgba(4, 8, 10, 0) 76%);
}
.bsb-tutorial.is-entering .bsb-tutorial-card { animation: bsb-cue-in .18s ease-out both; }
.bsb-tutorial.is-exiting .bsb-tutorial-card { transform: translate(-50%, 6px); }
@keyframes bsb-cue-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
.bsb-key-row { display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 34px; }
.bsb-keycap {
  min-width: 34px; height: 32px; padding: 6px 9px; border: 1px solid rgba(232, 223, 204, .74); border-bottom-color: rgba(232, 223, 204, .42);
  background: rgba(20, 23, 22, .84); color: var(--bsb-ivory); box-shadow: inset 0 -2px rgba(0, 0, 0, .28);
}
.bsb-keycap.is-active, .bsb-keycap.is-complete { color: #ffd49c; border-color: var(--bsb-ember); background: rgba(64, 42, 21, .82); transform: translateY(2px); }
.bsb-key-arrow { color: var(--bsb-ember); font-size: 17px; }
.bsb-cue-title { margin-top: 9px; color: var(--bsb-ivory); font-size: 16px; }
.bsb-cue-title.is-message { color: var(--bsb-ember); margin-top: 0; }
.bsb-cue-support { margin-top: 5px; color: #a0aaa6; font-size: 11px; }
.bsb-cue-combo { margin-top: 5px; color: #b9c0ba; font-size: 10px; }
.bsb-transition { display: none; overflow: hidden; z-index: 7; }
.bsb-transition.is-visible { display: block; }
.bsb-transition-smoke, .bsb-transition-impact, .bsb-transition-breath { position: absolute; inset: 0; }
.bsb-transition-smoke { transition: background .08s linear, box-shadow .08s linear; }
.bsb-transition-impact { background: radial-gradient(ellipse at 50% -5%, rgba(184, 218, 224, .55), rgba(184, 218, 224, 0) 56%); opacity: 0; }
.bsb-transition-breath { background: radial-gradient(ellipse at 50% 49%, rgba(174, 217, 226, .2), rgba(174, 217, 226, 0) 48%); opacity: 0; }
.bsb-transition-debris { position: absolute; inset: 0; overflow: hidden; }
.bsb-transition-shard { position: absolute; display: none; background: #756b59; clip-path: polygon(50% 0, 0 100%, 88% 72%); filter: drop-shadow(0 1px 1px #000); }
.bsb-awakening-prompt { position: absolute; left: 50%; top: 69%; transform: translate(-50%, -50%); display: none; min-width: 240px; text-align: center; }
.bsb-awakening-prompt.is-visible { display: block; }
.bsb-awakening-prompt .bsb-keycap { display: inline-block; }
.bsb-breath-stages { display: flex; justify-content: center; gap: 8px; margin-top: 12px; }
.bsb-breath-stage { width: 18px; height: 2px; background: rgba(170, 181, 178, .28); }
.bsb-breath-stage.is-complete { background: #a9d4dd; box-shadow: 0 0 8px rgba(169, 212, 221, .34); }
.bsb-pause { display: none; overflow: hidden; background: rgba(2, 5, 7, .84); backdrop-filter: blur(3px); z-index: 20; }
.bsb-pause.is-visible { display: block; }
.bsb-entity-authoring .bsb-pause.is-visible,
.bsb-entity-authoring .bsb-tutorial.is-visible,
.bsb-entity-authoring .bsb-arena-banner.is-visible { display: none; }
.bsb-entity-authoring .bsb-tuning-overlay { display: none; }
.bsb-pause::before { content: ""; position: absolute; left: -12%; top: -30%; width: 58%; height: 62%; background: radial-gradient(ellipse, rgba(136, 84, 33, .13), rgba(0, 0, 0, 0) 70%); }
.bsb-pause-rule { position: absolute; left: 42px; top: 38px; width: min(520px, calc(100vw - 84px)); height: 1px; background: rgba(217, 151, 75, .42); }
.bsb-pause-title { position: absolute; left: 48px; top: 50px; font-size: 24px; }
.bsb-pause-state { position: absolute; right: 48px; top: 52px; color: var(--bsb-ash); font-size: 15px; }
.bsb-pause-control-key { position: absolute; min-width: 72px; padding: 5px 8px; border: 1px solid rgba(232, 223, 204, .62); color: var(--bsb-ivory); text-align: center; }
.bsb-pause-control-label { position: absolute; color: var(--bsb-ivory); font-weight: 600; }
.bsb-pause-control-detail { position: absolute; color: var(--bsb-ash); font-size: 9px; }
.bsb-pause-section { position: absolute; color: var(--bsb-ash); font-size: 14px; }
.bsb-pause-pointer-hint { position: absolute; color: #aa875d; font-size: 9px; text-align: right; }
.bsb-pause-selection { position: absolute; border-left: 2px solid var(--bsb-ember); background: linear-gradient(90deg, rgba(146, 91, 38, .17), rgba(146, 91, 38, 0)); }
.bsb-pause-setting-label, .bsb-pause-setting-value { position: absolute; font-size: 10px; }
.bsb-pause-setting-label { color: var(--bsb-ash); }
.bsb-pause-setting-value { color: var(--bsb-ivory); text-align: right; }
.bsb-pause-setting.is-selected .bsb-pause-setting-label { color: var(--bsb-ivory); }
.bsb-pause-setting.is-selected .bsb-pause-setting-value { color: var(--bsb-ember); }
.bsb-pause-mini { position: absolute; display: grid; place-items: center; border: 1px solid rgba(143, 154, 151, .72); background: rgba(12, 16, 17, .78); color: var(--bsb-ivory); }
.bsb-pause-setting.is-selected .bsb-pause-mini { border-color: var(--bsb-ember); color: #ffd49c; }
.bsb-pause-rail { position: absolute; background: rgba(81, 88, 85, .6); }
.bsb-pause-rail-fill { height: 100%; background: #b58a54; }
.bsb-pause-setting.is-selected .bsb-pause-rail-fill { background: var(--bsb-ember); }
.bsb-pause-rail::after { content: ""; position: absolute; inset: -2px 0; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), rgba(236, 222, 191, .28) calc(10% - 1px) 10%); }
.bsb-pause-knob { position: absolute; width: 5px; background: #c6aa7c; transform: translateX(-2px); }
.bsb-pause-setting.is-selected .bsb-pause-knob { background: #ffd49c; box-shadow: 0 0 8px rgba(217, 151, 75, .3); }
.bsb-pause-footer { position: absolute; color: var(--bsb-ash); }
.bsb-body-feedback { z-index: 1; transition: backdrop-filter .06s linear, background .06s linear; }
.bsb-lifecycle { z-index: 2; }
@media (max-width: 819px), (max-height: 619px) {
  .bsb-pause-title { top: 46px; font-size: 17px; }
  .bsb-pause-state { top: 48px; right: 32px; font-size: 11px; }
  .bsb-pause-control-key { min-width: 64px; padding: 3px 6px; font-size: 10px; }
  .bsb-pause-control-label { font-size: 11px; }
  .bsb-pause-control-detail { font-size: 8px; }
  .bsb-pause-section { font-size: 11px; }
  .bsb-arena-banner { padding-top: 54px; }
  .bsb-arena-title { font-size: 16px; }
  .bsb-tutorial-card { bottom: 15%; }
}
@media (prefers-reduced-motion: reduce) {
  .bsb-arena-card, .bsb-tutorial.is-entering .bsb-tutorial-card { animation: none; }
  .bsb-transition-smoke, .bsb-transition-breath, .bsb-body-feedback { transition: none; }
}
`;
