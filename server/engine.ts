export type Workflow = 'IDLE' | 'RUN' | 'FILL';
export type Scenario = 'normal' | 'leak_b' | 'manual';

export interface State {
  workflow: Workflow; level: number; autoPump: boolean; manualFill: boolean; fillPump: boolean;
  valves: boolean[]; leakB: boolean; scenario: Scenario; flows: number[]; sensorTotals: number[];
  leakRate: number; leakTotal: number; tick: number;
}

export class Simulation {
  state: State = this.initial();
  constructor(private random: () => number = Math.random) {}
  initial(): State {
    return { workflow: 'IDLE', level: 1, autoPump: false, manualFill: false, fillPump: false,
      valves: [true, true, true], leakB: true, scenario: 'leak_b', flows: Array(9).fill(0),
      sensorTotals: Array(9).fill(0), leakRate: 0, leakTotal: 0, tick: 0 };
  }
  reset() { this.state = this.initial(); }
  command(type: string, value: unknown) {
    const s = this.state;
    if (type === 'workflow') {
      if (!['IDLE', 'RUN', 'FILL'].includes(String(value))) throw new Error('INVALID_INPUT');
      if (value === 'RUN' && (s.workflow !== 'IDLE' || s.level < 0.995)) throw new Error('START_GUARD');
      s.workflow = value as Workflow;
    } else if (type === 'scenario') {
      if (value !== 'normal' && value !== 'leak_b') throw new Error('INVALID_INPUT');
      s.scenario = value; s.leakB = value === 'leak_b';
    } else if (type === 'auto-pump') {
      if (typeof value !== 'boolean') throw new Error('INVALID_INPUT');
      s.autoPump = value; s.manualFill = false;
    } else if (type === 'fill-pump') {
      if (typeof value !== 'boolean') throw new Error('INVALID_INPUT');
      if (s.autoPump) throw new Error('AUTO_PUMP_ACTIVE');
      s.manualFill = value;
    } else if (type === 'leak-b') {
      if (typeof value !== 'boolean') throw new Error('INVALID_INPUT');
      s.leakB = value; s.scenario = 'manual';
    } else if (/^valve-[abc]$/.test(type)) {
      if (typeof value !== 'boolean') throw new Error('INVALID_INPUT');
      s.valves['abc'.indexOf(type.slice(-1))] = value;
    } else throw new Error('INVALID_INPUT');
  }
  tick(dt = 1) {
    const s = this.state;
    if (s.workflow === 'RUN' && s.level <= 0) s.workflow = 'IDLE';
    else if (s.workflow === 'RUN' && s.level < 0.15 && s.autoPump) s.workflow = 'FILL';
    else if (s.workflow === 'FILL' && s.level >= 0.995) s.workflow = 'IDLE';
    if (s.autoPump) {
      if (s.level <= 0.15) s.fillPump = true;
      if (s.level >= 0.995) s.fillPump = false;
    } else s.fillPump = s.manualFill;
    if (s.level >= 0.995) { s.fillPump = false; s.manualFill = false; }
    const running = s.workflow === 'RUN' && s.level > 0;
    const branch = [45, 38, 42].map((base, i) => running && s.valves[i] ? base + this.random() * 2 - 1 : 0);
    if (running && s.valves[1] && s.leakB) {
      if (!s.leakRate) s.leakRate = s.scenario === 'leak_b' ? 25 : 5;
      else s.leakRate = Math.max(1, Math.min(30, s.leakRate + (Math.floor(this.random() * 3) - 1) * 0.4));
    } else s.leakRate = 0;
    const outflow = branch.reduce((a, b) => a + b, 0) + s.leakRate;
    s.level = Math.max(0, Math.min(1, s.level + (s.fillPump ? 0.03 * dt : running ? -0.012 * outflow / 125 * dt : 0)));
    if (s.level <= 0) { s.workflow = 'IDLE'; branch.fill(0); s.leakRate = 0; }
    if (s.level >= 0.995 && s.fillPump) { s.fillPump = false; s.manualFill = false; if (s.workflow === 'FILL') s.workflow = 'IDLE'; }
    const postLeak = Math.max(0, branch[1] - s.leakRate);
    s.flows = [branch[0], branch[0], branch[0], branch[1], postLeak, postLeak, branch[2], branch[2], branch[2]];
    s.sensorTotals = s.sensorTotals.map((total, i) => total + s.flows[i] * dt);
    s.leakTotal += s.leakRate * dt; s.tick++;
  }
  snapshot() {
    const s = this.state;
    const revenue = s.flows[0] + s.flows[3] + s.flows[6];
    return { ...s, volume: s.level * 500, levelCm: s.level * 200, distanceCm: (1 - s.level) * 200,
      nrwPct: revenue + s.leakRate > 0 ? s.leakRate / (revenue + s.leakRate) * 100 : 0,
      startEnabled: s.workflow === 'IDLE' && s.level >= 0.995, returnPump: true };
  }
}

const positions = [[32.4041753,-117.0779670],[32.4050562,-117.0790661],[32.4043391,-117.0786295],[32.4038756,-117.0784616],[32.4052254,-117.0799734],[32.4044668,-117.0796803],[32.4036501,-117.0791684],[32.4051008,-117.0806950],[32.4039885,-117.0800285],[32.4034342,-117.0798029]];
export function sensorRecords(sim: Simulation) {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return positions.map(([lat, lng], id) => {
    const isWaterLevel = id === 0;
    const value = isWaterLevel ? sim.state.level * 500 : sim.state.flows[id - 1];
    return {
      device_id: 'WU-RES-001', id,
      name: isWaterLevel ? 'Water Level Sensor' : `Flow Sensor ${id}`,
      type: 'sensor',
      status: isWaterLevel && (sim.state.level <= 0 || sim.state.level >= 1) ? 0 : 1,
      value: Number(value.toFixed(3)), unit: isWaterLevel ? 'L' : 'L/s',
      lat, lng, timestamp,
    };
  });
}
