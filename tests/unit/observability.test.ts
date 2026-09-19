import { expect, it } from 'vitest';
import { FrameMetrics } from '../../src/debug/FrameMetrics';
import { RealtimeMetrics } from '../../src/network/RealtimeMetrics';
import { getSpaceSmokeState } from '../../src/debug/SpaceSmokeState';

it('reports long wall-clock frames honestly and bounds the sampling window', () => {
  const metrics = new FrameMetrics();
  metrics.record(0);
  metrics.record(NaN);
  expect(metrics.snapshot().sampleFrames).toBe(0);
  metrics.record(0.2);
  expect(metrics.snapshot().fps).toBe(5);
  expect(metrics.snapshot().p95FrameTimeMs).toBe(200);
  for (let i = 0; i < 180; i++) metrics.record(1 / 60);
  expect(metrics.snapshot().sampleFrames).toBe(180);
  expect(metrics.snapshot().fps).toBeCloseTo(60);
});

it('counts events without retaining messages or exposing mutable counters', () => {
  const metrics = new RealtimeMetrics();
  metrics.recordSent('position');
  metrics.recordReceived('position');
  metrics.recordReceived('chat');
  const state = metrics.snapshot();
  expect(state.sendAttempts).toBe(1);
  expect(state.received).toBe(2);
  state.byEvent.position.sendAttempts = 999;
  expect(metrics.snapshot().byEvent.position.sendAttempts).toBe(1);
});

it('accepts only named opt-in smoke fixtures', () => {
  expect(getSpaceSmokeState('')).toBeNull();
  expect(getSpaceSmokeState('?spaceSmoke=unknown')).toBeNull();
  expect(getSpaceSmokeState('?spaceSmoke=near-base')).toBe('near-base');
  expect(getSpaceSmokeState('?spaceSmoke=planet-showcase')).toBe('planet-showcase');
});
