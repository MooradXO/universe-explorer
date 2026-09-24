import { afterEach, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Group } from 'three';
import { mobileFlightInput } from '../../src/core/MobileFlightInput';

afterEach(() => vi.unstubAllGlobals());

it('one held thumb supplies forward thrust with a quiet centre and bounded two-axis steering', () => {
  expect(mobileFlightInput(0, 0, true)).toEqual({ thrust: 1, yaw: 0, pitch: 0 });
  expect(mobileFlightInput(.04, -.04, true).yaw).toBe(0);
  const diagonal = mobileFlightInput(1, -1, true);
  expect(diagonal.thrust).toBe(1); expect(diagonal.yaw).toBeLessThan(0); expect(diagonal.pitch).toBeGreaterThan(0);
  expect(Math.hypot(diagonal.yaw, diagonal.pitch)).toBeCloseTo(.72);
  expect(mobileFlightInput(-1, 0, true).yaw).toBeGreaterThan(0);
  expect(mobileFlightInput(.3, 0, true).yaw).toBeGreaterThan(mobileFlightInput(.8, 0, true).yaw);
  expect(mobileFlightInput(1, -1, false)).toEqual({ thrust: 0, yaw: 0, pitch: 0 });
  expect(mobileFlightInput(NaN, 0, true)).toEqual({ thrust: 0, yaw: 0, pitch: 0 });
});

it('held mobile steering survives network sampling and fire releases independently', async () => {
  const events = new EventTarget();
  vi.stubGlobal('window', events); vi.stubGlobal('document', { hidden: false });
  const { ShipController } = await import('../../src/core/ShipController');
  const controller = new ShipController(new PerspectiveCamera()); controller.setShip(new Group());
  const emit = (type: string, detail?: unknown) => events.dispatchEvent(new CustomEvent(type, { detail }));
  emit('TouchFlightInput', { x: .8, y: -.4, active: true }); emit('TouchFireStart');
  const first = controller.readPilotInput(1, 1 / 60);
  for (let frame = 2; frame < 121; frame++) {
    const input = controller.readPilotInput(frame, 1 / 60);
    expect(input.z).toBe(1); expect(input.x).toBe(0);
    expect(input.yaw).toBe(first.yaw); expect(input.pitch).toBe(first.pitch);
  }
  expect(controller.mobileInput.firing).toBe(true);
  emit('TouchFireEnd'); expect(controller.mobileInput.firing).toBe(false);
  expect(controller.readPilotInput(121, 1 / 60).z).toBe(1);
  emit('TouchFireStart'); emit('TouchFlightInput', { x: 0, y: 0, active: false });
  expect(controller.mobileInput).toEqual({ thrust: 0, yaw: 0, pitch: 0, firing: true });
  for (const reset of [() => controller.setInputBlocked('panel', true), () => events.dispatchEvent(new Event('blur')), () => controller.clearShip()]) {
    controller.setInputBlocked('panel', false);
    emit('TouchFlightInput', { x: 1, y: 1, active: true }); emit('TouchFireStart'); emit('TouchBoostOn');
    reset();
    expect(controller.mobileInput).toEqual({ thrust: 0, yaw: 0, pitch: 0, firing: false });
    expect(controller.touchBoost).toBe(false);
  }
});
