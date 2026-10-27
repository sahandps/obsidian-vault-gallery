import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPan, containRect, flipTransform, rubberBand, shouldDismiss, swipeDirection, zoomAround } from '../../src/frontend/lightbox/geometry';

const box = { left: 0, top: 0, width: 1000, height: 600 };

test('a picture is fitted inside its box without distortion', () => {
  assert.deepEqual(containRect(box, { width: 2000, height: 1000 }), { left: 0, top: 50, width: 1000, height: 500 });
  assert.deepEqual(containRect(box, { width: 600, height: 1200 }), { left: 350, top: 0, width: 300, height: 600 });
  assert.deepEqual(containRect(box, { width: 0, height: 0 }), box);
});

test('zooming keeps the point under the fingers in place', () => {
  const view = zoomAround({ scale: 1, x: 0, y: 0 }, { x: 100, y: 50 }, 2);
  assert.deepEqual(view, { scale: 2, x: -100, y: -50 });
  // The same screen point maps to the same picture point before and after.
  assert.equal(100 - 0, (100 - view.x) / 2);
  assert.equal(zoomAround({ scale: 1, x: 0, y: 0 }, { x: 0, y: 0 }, 99).scale, 6);
  assert.equal(zoomAround({ scale: 2, x: 5, y: 5 }, { x: 0, y: 0 }, 0.1).scale, 1);
});

test('a zoomed picture cannot be dragged past its edges', () => {
  const content = { width: 1000, height: 500 };
  const viewport = { width: 1000, height: 600 };
  assert.deepEqual(clampPan({ scale: 2, x: 900, y: -900 }, content, viewport), { scale: 2, x: 500, y: -200 });
  assert.deepEqual(clampPan({ scale: 1, x: 50, y: 50 }, content, viewport), { scale: 1, x: 0, y: 0 });
});

test('swipes need distance or speed, and go the way the finger moved', () => {
  assert.equal(swipeDirection(-300, 0, 1000), 1);
  assert.equal(swipeDirection(300, 0, 1000), -1);
  assert.equal(swipeDirection(-60, -0.8, 1000), 1);
  assert.equal(swipeDirection(-60, -0.1, 1000), 0);
  assert.equal(swipeDirection(10, 2, 1000), 0);
});

test('dragging far or fast enough closes the viewer', () => {
  assert.equal(shouldDismiss(150, 0, 600), true);
  assert.equal(shouldDismiss(60, 0.9, 600), true);
  assert.equal(shouldDismiss(60, 0.1, 600), false);
  assert.ok(rubberBand(100) < 100);
});

test('the open animation starts from the thumbnail and ends at the picture', () => {
  const thumbnail = { left: 100, top: 100, width: 200, height: 150 };
  const picture = { left: 0, top: 50, width: 1000, height: 500 };
  const flip = flipTransform(thumbnail, picture);
  assert.equal(flip.x, 200 - 500);
  assert.equal(flip.y, 175 - 300);
  assert.equal(flip.scale, 0.3);
});
