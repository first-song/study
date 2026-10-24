import test from 'node:test';
import assert from 'node:assert/strict';
import { createMouseLook } from '../src/mouse-look.js';

function dispatch(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
  return event;
}

function fixture(t) {
  const originals = new Map(['document', 'matchMedia'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  const document = new EventTarget();
  document.pointerLockElement = null;
  const canvas = new EventTarget();
  const calls = { turns: [], captures: [], states: [], requests: 0, exits: 0, unlocks: 0 };
  let playing = true;
  let completeRequest;
  canvas.setPointerCapture = id => calls.captures.push(id);
  canvas.requestPointerLock = () => {
    calls.requests++;
    return new Promise(resolve => { completeRequest = resolve; });
  };
  document.exitPointerLock = () => {
    calls.exits++;
    document.pointerLockElement = null;
    dispatch(document, 'pointerlockchange');
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: document });
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true, writable: true,
    value: query => ({ matches: query === '(pointer:fine)' }),
  });
  const look = createMouseLook(canvas, {
    isPlaying: () => playing,
    turn: (dx, dy) => calls.turns.push([dx, dy]),
    onUnlock: () => { calls.unlocks++; },
    onState: locked => calls.states.push(locked),
  });
  return {
    canvas, document, look, calls,
    setPlaying(value) { playing = value; },
    grantLock() {
      document.pointerLockElement = canvas;
      dispatch(document, 'pointerlockchange');
      completeRequest?.();
      completeRequest = undefined;
    },
  };
}

// Serialize the suites that temporarily provide browser globals. Every fixture
// restores the original property descriptors even when an assertion fails.
test('mouse-look input and pointer-lock lifecycle', { concurrency: false }, async t => {
  await t.test('a pending pointer-lock grant is released if gameplay has paused', async t => {
    const f = fixture(t);
    const pending = f.look.request();
    assert.equal(f.calls.requests, 1);
    f.setPlaying(false);
    f.grantLock();
    await pending;
    assert.equal(f.calls.exits, 1, 'A delayed lock must not trap the pointer over a paused dialog');
    assert.equal(f.look.locked, false);
    assert.equal(f.calls.unlocks, 0, 'Releasing a paused request must not toggle pause a second time');
    assert.equal(f.calls.states.at(-1), false);
  });

  await t.test('losing an active lock notifies the game once and stops relative mouse input', async t => {
    const f = fixture(t);
    const pending = f.look.request();
    f.grantLock();
    await pending;
    assert.equal(f.look.locked, true);
    dispatch(f.document, 'mousemove', { movementX: 13, movementY: -4 });
    assert.deepEqual(f.calls.turns, [[13, -4]]);
    f.document.exitPointerLock();
    assert.equal(f.look.locked, false);
    assert.equal(f.calls.unlocks, 1);
    dispatch(f.document, 'pointerlockchange');
    dispatch(f.document, 'mousemove', { movementX: 50, movementY: 50 });
    assert.equal(f.calls.unlocks, 1, 'Duplicate unlocked notifications must not toggle the game twice');
    assert.deepEqual(f.calls.turns, [[13, -4]]);
  });

  await t.test('mouse movement looks around without a button and respects pause', t => {
    const f = fixture(t);
    dispatch(f.canvas, 'pointerenter', { pointerType: 'mouse', clientX: 100, clientY: 80 });
    dispatch(f.canvas, 'pointermove', { pointerType: 'mouse', buttons: 0, clientX: 126, clientY: 71 });
    assert.deepEqual(f.calls.turns, [[26, -9]]);
    assert.deepEqual(f.calls.captures, [], 'Free mouse-look must not require pointer capture or dragging');
    f.setPlaying(false);
    dispatch(f.canvas, 'pointermove', { pointerType: 'mouse', buttons: 0, clientX: 150, clientY: 90 });
    assert.deepEqual(f.calls.turns, [[26, -9]], 'Menu pointer movement must not turn the game camera');
  });

  await t.test('touch camera input requires its captured finger and stops on touch end', t => {
    const f = fixture(t);
    const touch = { pointerType: 'touch', pointerId: 7 };
    dispatch(f.canvas, 'pointermove', { ...touch, clientX: 20, clientY: 30 });
    assert.deepEqual(f.calls.turns, []);
    const down = dispatch(f.canvas, 'pointerdown', { ...touch, clientX: 20, clientY: 30 });
    assert.equal(down.defaultPrevented, true);
    assert.deepEqual(f.calls.captures, [7]);
    dispatch(f.canvas, 'pointermove', { ...touch, pointerId: 8, clientX: 90, clientY: 80 });
    assert.deepEqual(f.calls.turns, [], 'A different finger must not hijack the camera drag');
    dispatch(f.canvas, 'pointermove', { ...touch, clientX: 45, clientY: 38 });
    assert.deepEqual(f.calls.turns, [[25, 8]]);
    dispatch(f.canvas, 'pointerup', touch);
    dispatch(f.canvas, 'pointermove', { ...touch, clientX: 90, clientY: 80 });
    dispatch(f.canvas, 'click', touch);
    assert.deepEqual(f.calls.turns, [[25, 8]], 'Touch movement after release must not rotate the camera');
    assert.equal(f.calls.requests, 0, 'A touch gesture must never request desktop pointer lock');
  });

  for (const reason of ['pointercancel', 'lostpointercapture']) {
    await t.test(`${reason} also clears a camera drag`, t => {
      const f = fixture(t);
      const touch = { pointerType: 'touch', pointerId: 3 };
      dispatch(f.canvas, 'pointerdown', { ...touch, clientX: 10, clientY: 20 });
      dispatch(f.canvas, reason, touch);
      dispatch(f.canvas, 'pointermove', { ...touch, clientX: 70, clientY: 80 });
      assert.deepEqual(f.calls.turns, []);
    });
  }
});
