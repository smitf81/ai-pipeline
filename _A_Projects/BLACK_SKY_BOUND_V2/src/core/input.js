export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  const pointer = { x: 0, y: 0, deltaX: 0, deltaY: 0, down: false, clicked: false, button: -1, wheel: 0, hasPosition: false, inside: false };
  const clickedButtons = new Set();
  const pressedButtons = new Set();

  const onKeyDown = (event) => {
    const key = event.key.toLowerCase();
    if (key === 'tab' || key === 'escape') event.preventDefault();
    if (!keys.has(key)) justPressed.add(key);
    keys.add(key);
  };
  const onKeyUp = (event) => keys.delete(event.key.toLowerCase());
  const onMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const nextX = event.clientX - rect.left;
    const nextY = event.clientY - rect.top;
    pointer.deltaX += nextX - pointer.x;
    pointer.deltaY += nextY - pointer.y;
    pointer.x = nextX;
    pointer.y = nextY;
    pointer.hasPosition = true;
    pointer.inside = true;
  };
  const onDown = (event) => {
    pointer.down = true;
    pointer.clicked = true;
    pointer.button = event.button;
    clickedButtons.add(event.button);
    pressedButtons.add(event.button);
    if (event.button === 2) event.preventDefault();
    onMove(event);
  };
  const onUp = () => { pointer.down = false; pointer.button = -1; };
  const onWheel = (event) => { onMove(event); pointer.wheel += Math.sign(event.deltaY); event.preventDefault(); };
  const onLeave = () => { pointer.inside = false; };
  const onContextMenu = (event) => event.preventDefault();

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
  }

  return {
    keys,
    pointer,
    isDown(key) { return keys.has(key.toLowerCase()); },
    wasPressed(key) { return justPressed.has(key.toLowerCase()); },
    wasPointerPressed(button) { return pressedButtons.has(button); },
    consumePointerClick(button = null) {
      if (Number.isInteger(button)) {
        const value = clickedButtons.has(button);
        clickedButtons.delete(button);
        pointer.clicked = clickedButtons.size > 0;
        return value;
      }
      const value = pointer.clicked;
      pointer.clicked = false;
      clickedButtons.clear();
      return value;
    },
    consumeWheel() { const value = pointer.wheel; pointer.wheel = 0; return value; },
    afterUpdate() {
      pointer.wheel = 0;
      pointer.deltaX = 0;
      pointer.deltaY = 0;
      pointer.clicked = false;
      clickedButtons.clear();
      pressedButtons.clear();
      justPressed.clear();
    },
    destroy() {
      if (typeof window === 'undefined') return;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    }
  };
}
