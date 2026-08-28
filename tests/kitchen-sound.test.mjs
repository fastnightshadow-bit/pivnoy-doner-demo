import test from 'node:test';
import assert from 'node:assert/strict';
import * as kitchen from '../kitchen.js';

const createAudioHarness = () => {
  const oscillators = [];
  const gains = [];
  const destination = {};

  return {
    context: {
      currentTime: 10,
      destination,
      createOscillator() {
        const oscillator = {
          type: '',
          frequencyEvents: [],
          connections: [],
          startedAt: null,
          stoppedAt: null,
          frequency: {
            setValueAtTime(value, at) {
              oscillator.frequencyEvents.push({ value, at });
            },
          },
          connect(target) {
            oscillator.connections.push(target);
          },
          start(at) {
            oscillator.startedAt = at;
          },
          stop(at) {
            oscillator.stoppedAt = at;
          },
        };
        oscillators.push(oscillator);
        return oscillator;
      },
      createGain() {
        const gain = {
          events: [],
          connections: [],
          gain: {
            setValueAtTime(value, at) {
              gain.events.push({ method: 'set', value, at });
            },
            exponentialRampToValueAtTime(value, at) {
              gain.events.push({ method: 'ramp', value, at });
            },
          },
          connect(target) {
            gain.connections.push(target);
          },
        };
        gains.push(gain);
        return gain;
      },
    },
    destination,
    oscillators,
    gains,
  };
};

test('new kitchen orders play four loud alternating alert pulses', () => {
  const harness = createAudioHarness();

  const played = kitchen.playKitchenNewOrderAlert?.(harness.context);

  assert.equal(played, true);
  assert.equal(harness.oscillators.length, 4);
  assert.deepEqual(
    harness.oscillators.map((oscillator) => oscillator.type),
    ['square', 'square', 'square', 'square'],
  );
  assert.deepEqual(
    harness.oscillators.map((oscillator) => oscillator.frequencyEvents[0].value),
    [880, 1175, 880, 1175],
  );
  assert.deepEqual(
    harness.gains.map((gain) => gain.events[1].value),
    [0.75, 0.75, 0.75, 0.75],
  );
  assert.ok(harness.oscillators.at(-1).stoppedAt >= 10.9);
  assert.ok(
    harness.gains.every((gain) => gain.connections.includes(harness.destination)),
  );
});
