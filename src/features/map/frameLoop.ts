/**
 * One shared requestAnimationFrame loop for everything that moves on the map.
 * Tasks run in `order`, so puck interpolation (order 0) always finishes before
 * the camera (order 10) reads it — the puck never shivers against the camera.
 */

export type FrameTask = (now: number, dtMs: number) => void;

interface Entry {
  order: number;
  fn: FrameTask;
}

let entries: Entry[] = [];
let rafId: number | null = null;
let lastTime = 0;

function tick(now: number) {
  const dt = lastTime ? Math.min(now - lastTime, 100) : 16;
  lastTime = now;
  for (const entry of entries) {
    try {
      entry.fn(now, dt);
    } catch (err) {
      console.warn('Frame task failed:', err);
    }
  }
  rafId = entries.length ? requestAnimationFrame(tick) : null;
}

export function addFrameTask(order: number, fn: FrameTask): () => void {
  const entry: Entry = { order, fn };
  entries = [...entries, entry].sort((a, b) => a.order - b.order);
  if (rafId === null) {
    lastTime = 0;
    rafId = requestAnimationFrame(tick);
  }
  return () => {
    entries = entries.filter((e) => e !== entry);
    if (!entries.length && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
