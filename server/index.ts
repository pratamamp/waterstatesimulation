import 'dotenv/config';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Simulation, sensorRecords } from './engine';
import { MqttTransport } from './mqtt';

mkdirSync('data', { recursive: true });
const db = new DatabaseSync('data/water-state.sqlite');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL, scenario TEXT NOT NULL, total_leak REAL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, captured_at TEXT NOT NULL, state_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, run_id TEXT REFERENCES runs(id) ON DELETE CASCADE, created_at TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL);
 UPDATE runs SET status='crashed', ended_at=datetime('now') WHERE status='active';`);
const sim = new Simulation();
const mqttTransport = new MqttTransport(sim);
let runId: string | null = null;
const app = express();
app.use(express.json({ limit: '16kb' }));
const clients = new Set<express.Response>();
const started = Date.now();
function snapshot() { return { ...sim.snapshot(), uptime: Math.floor((Date.now() - started) / 1000), runId, mqtt: mqttTransport.status() }; }
function broadcast() { const data = `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`; for (const res of clients) if (!res.write(data)) { res.end(); clients.delete(res); } }
function finishRun(status: string) {
  if (runId) db.prepare('UPDATE runs SET ended_at=?, status=?, total_leak=? WHERE id=?').run(new Date().toISOString(), status, sim.state.leakTotal, runId);
  runId = null;
}
function event(type: string, detail: string) { db.prepare('INSERT INTO events(run_id,created_at,type,detail) VALUES(?,?,?,?)').run(runId, new Date().toISOString(), type, detail); }
app.get('/api/v1/state', (_req, res) => res.json(snapshot()));
app.get('/api/v1/sensors', (_req, res) => res.json(sensorRecords(sim)));
app.get('/api/v1/health', (_req, res) => res.json({ status: mqttTransport.status().enabled && !mqttTransport.status().connected ? 'degraded' : 'healthy', database: 'up', scheduler: 'running', simulation: sim.state.workflow, mqtt: mqttTransport.status() }));
app.get('/api/v1/transports/status', (_req, res) => res.json({ mqtt: mqttTransport.status() }));
app.get('/api/v1/events/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`); clients.add(res);
  req.on('close', () => clients.delete(res));
});
app.post('/api/v1/commands/reset', (req, res) => {
  if (req.body?.confirm !== true) { res.status(400).json({ error: { message: 'Konfirmasi reset diperlukan.' } }); return; }
  event('reset', 'Simulasi direset'); finishRun('reset'); sim.reset(); broadcast(); res.json(snapshot());
});
app.post('/api/v1/commands/:type', (req, res) => {
  const type = req.params.type;
  const value = type === 'workflow' ? req.body?.state : type === 'scenario' ? req.body?.scenario : req.body?.enabled;
  try {
    sim.command(type, value);
    if (type === 'workflow' && value === 'RUN' && !runId) {
      runId = randomUUID(); db.prepare('INSERT INTO runs(id,started_at,status,scenario) VALUES(?,?,?,?)').run(runId, new Date().toISOString(), 'active', sim.state.scenario);
    }
    event(type, String(value)); broadcast(); res.json(snapshot());
  } catch (e) {
    const code = (e as Error).message;
    res.status(code === 'INVALID_INPUT' ? 400 : 409).json({ error: { code, message: code === 'START_GUARD' ? 'Reservoir harus penuh dan dalam kondisi IDLE untuk memulai.' : code === 'AUTO_PUMP_ACTIVE' ? 'Matikan pompa otomatis untuk mengatur pompa manual.' : 'Perintah tidak valid.' } });
  }
});
app.get('/api/v1/runs', (_req, res) => res.json(db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT 100').all()));
app.get('/api/v1/runs/:id/snapshots', (req, res) => res.json(db.prepare('SELECT captured_at, state_json FROM snapshots WHERE run_id=? ORDER BY id').all(req.params.id)));
app.get('/api/v1/events', (_req, res) => res.json(db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 30').all()));
if (existsSync('dist/index.html')) { app.use(express.static('dist')); app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: 'dist' })); }
const server = app.listen(3001, '127.0.0.1', () => console.log('Backend: http://localhost:3001'));
let last = performance.now();
const timer = setInterval(() => {
  const now = performance.now(); const dt = (now - last) / 1000; last = now;
  sim.tick(dt);
  mqttTransport.publishChanged();
  if (runId) db.prepare('INSERT INTO snapshots(run_id,captured_at,state_json) VALUES(?,?,?)').run(runId, new Date().toISOString(), JSON.stringify(snapshot()));
  broadcast();
}, 1000);
function shutdown() { clearInterval(timer); mqttTransport.close(); finishRun('completed'); for (const c of clients) c.end(); server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
