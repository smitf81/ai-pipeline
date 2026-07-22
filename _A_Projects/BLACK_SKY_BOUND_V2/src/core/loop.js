export function createFixedStepLoop({ stepMs, update, render, now = () => performance.now(), raf = requestAnimationFrame }) {
  let running = false;
  let last = 0;
  let accumulator = 0;
  const maxFrameMs = 250;

  function frame(t) {
    if (!running) return;
    if (!last) last = t;
    const elapsed = Math.min(maxFrameMs, t - last);
    last = t;
    accumulator += elapsed;

    while (accumulator >= stepMs) {
      update(stepMs / 1000);
      accumulator -= stepMs;
    }
    render(accumulator / stepMs);
    raf(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = now();
      raf(frame);
    },
    stop() { running = false; },
    tickForTest(ms) {
      accumulator += ms;
      let steps = 0;
      while (accumulator >= stepMs) {
        update(stepMs / 1000);
        accumulator -= stepMs;
        steps += 1;
      }
      render(accumulator / stepMs);
      return steps;
    },
    isRunning() { return running; }
  };
}
