import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, sensorRecords } from './engine';

test('start guard dan aliran normal', () => {
  const s = new Simulation(() => 0.5); s.state.level = 0.5;
  assert.throws(() => s.command('workflow', 'RUN'), /START_GUARD/);
  s.state.level = 1; s.command('scenario', 'normal'); s.command('workflow', 'RUN'); s.tick();
  assert.deepEqual(s.state.flows, [45,45,45,38,38,38,42,42,42]);
});
test('kebocoran dan valve B', () => {
  const s = new Simulation(() => 0.5); s.command('workflow', 'RUN'); s.tick();
  assert.equal(s.state.flows[3] - s.state.flows[4], 25);
  s.command('valve-b', false); s.tick(); assert.deepEqual(s.state.flows.slice(3, 6), [0,0,0]); assert.equal(s.state.leakRate, 0);
});
test('auto fill dan sensor contract', () => {
  const s = new Simulation(() => 0.5); s.command('workflow', 'RUN'); s.command('auto-pump', true); s.state.level = 0.14; s.tick();
  assert.equal(s.state.workflow, 'FILL'); assert.equal(s.state.fillPump, true);
  s.state.level = 0.99; s.tick(); assert.equal(s.state.workflow, 'IDLE'); assert.equal(s.state.fillPump, false);
  const records = sensorRecords(s); assert.equal(records.length, 10); assert.equal(records[9].id, 9); assert.ok('lng' in records[0]);
});
