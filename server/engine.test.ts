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
  assert.equal(records[0].value, 500); assert.equal(records[0].unit, 'L'); assert.equal(records[0].status, 0);
  s.state.level = 0.5; assert.equal(sensorRecords(s)[0].value, 250); assert.equal(sensorRecords(s)[0].status, 1);
  s.state.level = 0; assert.equal(sensorRecords(s)[0].value, 0); assert.equal(sensorRecords(s)[0].status, 0);
  s.state.level = 1; assert.equal(sensorRecords(s)[0].value, 500); assert.equal(sensorRecords(s)[0].status, 0);
});
test('kontrol manual workflow dan pompa', () => {
  const s = new Simulation(() => 0.5);
  s.tick(); assert.equal(s.state.workflow, 'IDLE');
  s.command('workflow', 'RUN'); s.tick(); assert.equal(s.state.workflow, 'RUN');
  s.command('workflow', 'IDLE'); s.tick(); assert.deepEqual(s.state.flows, Array(9).fill(0));
  s.state.level = 0.5; s.command('fill-pump', true); s.tick(); assert.equal(s.state.fillPump, true);
  s.command('fill-pump', false); s.tick(); assert.equal(s.state.fillPump, false);
  s.command('auto-pump', true); assert.throws(() => s.command('fill-pump', true), /AUTO_PUMP_ACTIVE/);
});
test('workflow otomatis mengulang pengisian dan distribusi sampai dihentikan', () => {
  const s = new Simulation(() => 0.5);
  s.state.level = 0.5; s.command('auto-workflow', true); s.tick();
  assert.equal(s.state.workflow, 'FILL'); assert.equal(s.state.fillPump, true);
  s.state.level = 0.994; s.tick(0.001); assert.equal(s.state.workflow, 'FILL');
  s.tick(1); assert.equal(s.state.workflow, 'IDLE');
  s.tick(); assert.equal(s.state.workflow, 'RUN');
  s.state.level = 0.15; s.tick(); assert.equal(s.state.workflow, 'FILL'); assert.equal(s.state.fillPump, true);
  s.command('workflow', 'IDLE'); assert.equal(s.state.autoWorkflow, false);
  s.tick(); assert.equal(s.state.workflow, 'IDLE'); assert.equal(s.state.fillPump, false);
});
test('workflow otomatis dapat dinonaktifkan tanpa memulai distribusi', () => {
  const s = new Simulation(() => 0.5); s.state.level = 0.5;
  s.command('auto-workflow', true); s.tick(); s.command('auto-workflow', false); s.tick();
  assert.equal(s.state.workflow, 'IDLE'); assert.equal(s.state.fillPump, false);
  assert.throws(() => s.command('workflow', 'RUN'), /START_GUARD/);
});
test('bukaan valve mengatur debit linear dan membatasi kebocoran', () => {
  const s = new Simulation(() => 0.5); s.command('workflow', 'RUN');
  s.command('valve-a-opening', 50); s.command('valve-b-opening', 10); s.tick();
  assert.equal(s.state.flows[0], 22.5); assert.equal(s.state.flows[3], 3.8);
  assert.equal(s.state.leakRate, 3.8); assert.equal(s.state.flows[4], 0);
  s.command('valve-a', false); s.tick(); assert.equal(s.state.flows[0], 0);
  s.command('valve-a', true); s.tick(); assert.equal(s.state.flows[0], 22.5);
  s.command('valve-a-opening', 0); assert.equal(s.state.valves[0], false);
  s.tick(); assert.equal(s.state.flows[0], 0); assert.equal(s.state.flows[1], 0); assert.equal(s.state.flows[2], 0);
  s.command('valve-a', true); assert.equal(s.state.valveOpenings[0], 100);
  for (const value of [-1, 101, 0.5, '50']) assert.throws(() => s.command('valve-a-opening', value), /INVALID_INPUT/);
});
