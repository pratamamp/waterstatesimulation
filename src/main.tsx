import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Droplets,
  Gauge,
  History,
  Pause,
  Play,
  Power,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Waves,
  Zap,
} from "lucide-react";
import "./style.css";

type Snapshot = {
  workflow: "IDLE" | "RUN" | "FILL";
  level: number;
  volume: number;
  levelCm: number;
  distanceCm: number;
  autoWorkflow: boolean;
  autoPump: boolean;
  valveOpenings: number[];
  manualFill: boolean;
  fillPump: boolean;
  returnPump: boolean;
  valves: boolean[];
  leakB: boolean;
  scenario: "normal" | "leak_b" | "manual";
  flows: number[];
  leakRate: number;
  leakTotal: number;
  nrwPct: number;
  tick: number;
  uptime: number;
  startEnabled: boolean;
  runId: string | null;
  mqtt?: {
    enabled: boolean;
    connected: boolean;
    state: string;
    host: string;
    port: number;
    topicRoot: string;
    sent: number;
    failed: number;
    lastError: string | null;
  };
};
type Run = {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  scenario: string;
  total_leak: number;
};
const format = (n: number, digits = 1) => n.toFixed(digits);
const uptime = (seconds: number) =>
  `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function App() {
  const [s, setS] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState<"overview" | "history">("overview");
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => {
    const stream = new EventSource("/api/v1/events/stream");
    stream.addEventListener("snapshot", (event) => {
      setS(JSON.parse((event as MessageEvent).data));
      setConnected(true);
    });
    stream.onerror = () => setConnected(false);
    const poll = setInterval(() => {
      if (stream.readyState !== EventSource.OPEN)
        fetch("/api/v1/state")
          .then((r) => r.json())
          .then(setS)
          .catch(() => {});
    }, 2000);
    return () => {
      stream.close();
      clearInterval(poll);
    };
  }, []);
  useEffect(() => {
    if (page === "history")
      fetch("/api/v1/runs")
        .then((r) => r.json())
        .then(setRuns)
        .catch(() => setError("Riwayat tidak dapat dimuat."));
  }, [page]);
  async function command(type: string, body: object) {
    setPending(true);
    setError("");
    try {
      const r = await fetch(`/api/v1/commands/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || "Perintah gagal.");
      setS(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  if (!s)
    return (
      <div className="loading">
        <Droplets size={28} />
        <span>Menghubungkan ke simulator...</span>
      </div>
    );
  const isRunning = s.workflow === "RUN";
  const mqtt = s.mqtt;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Waves size={23} />
          </div>
          <div>
            <strong>
              water<span>state</span>
            </strong>
            <small>SIMULATION SYSTEM</small>
          </div>
        </div>
        <div className="side-caption">WORKSPACE</div>
        <nav aria-label="Navigasi utama">
          <button
            aria-label="Overview"
            aria-current={page === "overview" ? "page" : undefined}
            className={page === "overview" ? "nav-active" : ""}
            onClick={() => setPage("overview")}
          >
            <Gauge size={18} /> Overview{" "}
            <ChevronRight size={15} className="nav-arrow" />
          </button>
          <button
            aria-label="Riwayat"
            aria-current={page === "history" ? "page" : undefined}
            className={page === "history" ? "nav-active" : ""}
            onClick={() => setPage("history")}
          >
            <History size={18} /> Riwayat
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="side-status">
            <span className={`status-dot ${connected ? "" : "offline"}`} />
            <div>
              <b>{connected ? "Sistem terhubung" : "Menghubungkan ulang"}</b>
              <small>Simulasi lokal</small>
            </div>
          </div>
          <div className="side-version">
            WATER UTILITIES <span>V 0.1</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <strong>{page === "overview" ? "Overview" : "Riwayat"}</strong>
          </div>
          <div className="top-right">
            <span className="live-label">
              <span className={`status-dot ${connected ? "" : "offline"}`} />
              {connected ? "LIVE SIMULATION" : "RECONNECTING"}
            </span>
            <span className="top-divider" />
            <span className="clock">
              UPTIME <b>{uptime(s.uptime)}</b>
            </span>
          </div>
        </header>
        <div className="content">
          {page === "history" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">REKAM SIMULASI</div>
                  <h1>
                    Riwayat simulasi<span>.</span>
                  </h1>
                  <p>
                    Daftar sesi distribusi yang tersimpan pada perangkat ini.
                  </p>
                </div>
              </div>
              <section className="panel history-panel">
                <div className="section-title">
                  <div>
                    <span className="section-kicker">SIMULATION LOG</span>
                    <h2>Semua sesi</h2>
                  </div>
                  <span className="count-pill">{runs.length} sesi</span>
                </div>
                {runs.length === 0 ? (
                  <div className="empty">
                    Belum ada sesi. Mulai distribusi untuk mencatat simulasi.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>WAKTU MULAI</th>
                          <th>SCENARIO</th>
                          <th>STATUS</th>
                          <th>TOTAL KEBOCORAN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((run) => (
                          <tr key={run.id}>
                            <td>
                              {new Date(run.started_at).toLocaleString("id-ID")}
                            </td>
                            <td>
                              {run.scenario === "leak_b"
                                ? "Leak B"
                                : run.scenario}
                            </td>
                            <td>{run.status}</td>
                            <td>{format(run.total_leak)} L</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <h1>SIMULATOR</h1>
                </div>
                <button
                  className="reset-button"
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset simulasi? Sesi aktif akan diakhiri.",
                      )
                    )
                      command("reset", { confirm: true });
                  }}
                >
                  <RotateCcw size={15} /> Reset simulasi
                </button>
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                  <button onClick={() => setError("")}>Tutup</button>
                </div>
              )}
              {mqtt?.enabled && !mqtt.connected && mqtt.lastError && (
                <div className="error-banner" role="alert">
                  <span>
                    <strong>MQTT belum terhubung.</strong> {mqtt.lastError}{" "}
                    Sistem akan mencoba kembali otomatis.
                  </span>
                </div>
              )}
              <div className="dashboard-layout">
                <div className="insight-layout">
                  <div className="network-insight">
                    <div className="section-heading network-heading">
                      <div className="network-heading-copy">
                        <div className="section-kicker">
                          DISTRIBUTION NETWORK
                        </div>
                        <h2>Jalur distribusi</h2>
                        <p>Pantau aliran air dan kondisi setiap jalur.</p>
                      </div>
                      <div className="legend">
                        <span className="valve-count">
                          {s.valves.filter(Boolean).length} VALVE TERBUKA
                        </span>
                        <span>
                          <i className="legend-dot flowing" /> Valve terbuka
                        </span>
                        <span>
                          <i className="legend-dot leak" /> Titik kebocoran
                        </span>
                      </div>
                    </div>
                    <div className="branches">
                      {["A", "B", "C"].map((branch, i) => (
                        <section
                          className={`panel branch-card branch-${branch.toLowerCase()} ${s.valves[i] && isRunning ? "is-flowing" : "is-stopped"} ${i === 1 && s.leakB ? "has-leak" : ""}`}
                          key={branch}
                        >
                          <div className="branch-header">
                            <div className="branch-id">{branch}</div>
                            <div>
                              <h3>Branch {branch}</h3>
                              <span>JALUR DISTRIBUSI {branch}</span>
                            </div>
                            <div className="branch-toggle">
                              <span>{s.valves[i] ? "OPEN" : "CLOSED"}</span>
                              <Switch
                                label={`Valve ${branch}`}
                                checked={s.valves[i]}
                                disabled={pending}
                                onChange={(v) =>
                                  command(`valve-${branch.toLowerCase()}`, {
                                    enabled: v,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <div className="flow-path">
                            <div className="flow-line" />
                            {[0, 1, 2].map((j) => (
                              <div className="sensor-node" key={j}>
                                <div
                                  className={`node-dot ${i === 1 && j === 1 && s.leakB ? "warning" : ""}`}
                                >
                                  {i === 1 && j === 1 && s.leakB ? "!" : ""}
                                </div>
                                <span>SENSOR {i * 3 + j + 1}</span>
                                <strong>
                                  {format(s.flows[i * 3 + j])}
                                  <small> L/s</small>
                                </strong>
                                <em>
                                  {j === 0
                                    ? "Inlet"
                                    : j === 1
                                      ? "House"
                                      : "Outlet"}
                                </em>
                              </div>
                            ))}
                          </div>
                          <div className="branch-footer">
                            <span>
                              {i === 1 && s.leakB ? (
                                <>
                                  <span className="leak-indicator" /> Leak
                                  sebelum sensor 5
                                </>
                              ) : (
                                <>
                                  <Check size={13} />{" "}
                                  {s.valves[i]
                                    ? isRunning
                                      ? "Aliran terpantau"
                                      : "Distribusi berhenti"
                                    : "Valve tertutup"}
                                </>
                              )}
                            </span>
                            <ArrowRight size={15} />
                          </div>
                          <ValveOpening branch={branch} opening={s.valveOpenings[i]} open={s.valves[i]} disabled={pending} onApply={(opening) => command(`valve-${branch.toLowerCase()}-opening`, { opening })} />
                        </section>
                      ))}
                    </div>
                  </div>
                  <div className="insight-sidebar">
                    <section className="panel control-panel">
                      <div className="panel-heading">
                        <div>
                          <div className="section-kicker">
                            SIMULATION CONTROL
                          </div>
                          <h2>Kontrol sistem</h2>
                        </div>
                        <span className="icon-box">
                          <Settings2 size={18} />
                        </span>
                      </div>
                      <div className="workflow-status">
                        <div
                          className={`workflow-icon ${isRunning ? "running" : ""}`}
                        >
                          <Activity size={23} />
                        </div>
                        <div>
                          <span>STATUS WORKFLOW</span>
                          <strong>
                            {s.workflow === "RUN"
                              ? "Distribusi berjalan"
                              : s.workflow === "FILL"
                                ? "Pengisian reservoir"
                                : "Menunggu perintah"}
                          </strong>
                          <small>
                            {s.workflow === "RUN"
                              ? "Air mengalir ke branch aktif"
                              : s.workflow === "FILL"
                                ? "Distribusi sedang dihentikan"
                                : "Sistem dalam kondisi idle"}
                          </small>
                        </div>
                        <span
                          className={`state-pill ${isRunning ? "active" : ""}`}
                        >
                          {s.workflow}
                        </span>
                      </div>
                      <div className="control-actions">
                        <button
                          className="primary-btn"
                          disabled={pending || (!s.autoWorkflow && !isRunning && !s.startEnabled)}
                          onClick={() =>
                            command("workflow", {
                              state: isRunning || s.autoWorkflow ? "IDLE" : "RUN",
                            })
                          }
                        >
                          {isRunning || s.autoWorkflow ? (
                            <Pause size={16} />
                          ) : (
                            <Play size={16} fill="currentColor" />
                          )}
                          {isRunning || s.autoWorkflow
                            ? "Hentikan distribusi"
                            : "Mulai distribusi"}
                        </button>
                        <p>
                          {s.autoWorkflow
                            ? "Siklus otomatis aktif. Hentikan untuk mengakhiri."
                            : s.startEnabled
                            ? "Reservoir penuh dan siap untuk distribusi."
                            : isRunning
                              ? "Distribusi sedang berjalan."
                              : "Isi reservoir hingga penuh untuk memulai."}
                        </p>
                      </div>
                      <div className="control-list">
                        <div className="switch-row">
                          <div className="control-icon"><Activity size={16} /></div>
                          <div className="switch-copy"><b>Workflow otomatis</b><small>Isi ulang pada 15%, mulai distribusi saat penuh</small></div>
                          <Switch label="Workflow otomatis" checked={s.autoWorkflow} disabled={pending} onChange={(v) => command("auto-workflow", { enabled: v })} />
                        </div>
                        <div className="switch-row">
                          <div className="control-icon">
                            <Zap size={16} />
                          </div>
                          <div className="switch-copy">
                            <b>Pompa otomatis</b>
                            <small>Aktif saat level di bawah 15%</small>
                          </div>
                          <Switch
                            label="Pompa otomatis"
                            checked={s.autoPump}
                            disabled={pending}
                            onChange={(v) =>
                              command("auto-pump", { enabled: v })
                            }
                          />
                        </div>
                        <div className="switch-row">
                          <div className="control-icon">
                            <Power size={16} />
                          </div>
                          <div className="switch-copy">
                            <b>Pompa manual</b>
                            <small>
                              {s.autoPump || s.autoWorkflow
                                ? "Tidak tersedia saat otomatis aktif"
                                : "Isi reservoir secara manual"}
                            </small>
                          </div>
                          <Switch
                            label="Pompa manual"
                            checked={s.manualFill}
                            disabled={pending || s.autoPump || s.autoWorkflow}
                            onChange={(v) =>
                              command("fill-pump", { enabled: v })
                            }
                          />
                        </div>
                      </div>
                    </section>
                    <section className={`panel metrics-panel ${s.leakB ? "metrics-leak-active" : ""}`}>
                      <div className="panel-heading">
                        <div>
                          <div className="section-kicker">
                            WATER LOSS ANALYSIS
                          </div>
                          <h2>Non-revenue water</h2>
                        </div>
                        <span className="icon-box">
                          <ArrowDownRight size={18} />
                        </span>
                      </div>
                      <p className="panel-sub">
                        Ringkasan kehilangan air selama simulasi berjalan.
                      </p>
                      <div className="metrics-grid">
                        <div>
                          <span>NRW RATE</span>
                          <strong>
                            {format(s.leakRate)}
                            <small> L/s</small>
                          </strong>
                          <em>Debit kebocoran</em>
                        </div>
                        <div>
                          <span>NRW PERCENTAGE</span>
                          <strong>
                            {format(s.nrwPct, 2)}
                            <small> %</small>
                          </strong>
                          <em>Dari total debit</em>
                        </div>
                        <div>
                          <span>TOTAL KEBOCORAN</span>
                          <strong>
                            {format(s.leakTotal)}
                            <small> L</small>
                          </strong>
                          <em>Terakumulasi</em>
                        </div>
                      </div>
                      <div className="metric-note">
                        <CircleHelp size={14} /> NRW dihitung dari kebocoran
                        aktif pada branch distribusi.
                      </div>
                    </section>
                  </div>
                </div>
                <div className="operations-section">
                  <div className="operations-heading">
                    <div className="section-kicker">OPERASI SISTEM</div>
                    <h2>Reservoir & simulasi</h2>
                    <p>Kelola pasokan dan skenario simulasi.</p>
                  </div>
                  <div className="overview-grid">
                    <section className="panel reservoir-panel">
                      <div className="panel-heading">
                        <div>
                          <div className="section-kicker">
                            RESERVOIR / STRG-1
                          </div>
                          <h2>Level air</h2>
                        </div>
                        <span className="icon-box">
                          <Droplets size={18} />
                        </span>
                      </div>
                      <div className="tank-layout">
                        <div className="tank-assembly">
                          <div className="tank-ruler">
                            <span>100</span>
                            <span>75</span>
                            <span>50</span>
                            <span>25</span>
                            <span>0</span>
                          </div>
                          <div className="tank">
                            <div className="tank-grid" />
                            <div
                              className="tank-water"
                              style={{ height: `${s.level * 100}%` }}
                            >
                              <div className="water-surface" />
                            </div>
                            <div className="tank-value">
                              <strong>
                                {format(s.level * 100, 0)}
                                <small>%</small>
                              </strong>
                              <span>KAPASITAS</span>
                            </div>
                          </div>
                          <div className="tank-foot" />
                        </div>
                        <div className="reservoir-data">
                          <div className="big-reading">
                            {format(s.volume)} <span>L</span>
                          </div>
                          <div className="reading-caption">
                            dari 500 L kapasitas
                          </div>
                          <div className="mini-progress">
                            <div style={{ width: `${s.level * 100}%` }} />
                          </div>
                          <div className="detail-row">
                            <span>Level air</span>
                            <b>{format(s.levelCm)} cm</b>
                          </div>
                          <div className="detail-row">
                            <span>Jarak sensor</span>
                            <b>{format(s.distanceCm)} cm</b>
                          </div>
                          <div className="detail-row">
                            <span>Status pompa</span>
                            <b className={s.fillPump ? "text-cyan" : ""}>
                              {s.fillPump ? "Mengisi" : "Tidak aktif"}
                            </b>
                          </div>
                        </div>
                      </div>
                      <div className="reservoir-footer">
                        <div>
                          <span className="foot-icon">
                            <Activity size={15} />
                          </span>
                          <span>
                            STATUS RESERVOIR
                            <small>
                              {s.fillPump
                                ? "Sedang mengisi"
                                : isRunning
                                  ? "Distribusi aktif"
                                  : "Siap digunakan"}
                            </small>
                          </span>
                        </div>
                        <span className="outline-badge">{s.workflow}</span>
                      </div>
                    </section>
                    <section className="panel leak-panel">
                      <div className="panel-heading">
                        <div>
                          <div className="section-kicker">
                            LEAK SIMULATION / BRANCH B
                          </div>
                          <h2>Simulasi kebocoran</h2>
                        </div>
                        <span className={`leak-badge ${s.leakB ? "on" : ""}`}>
                          <span /> {s.leakB ? "LEAK AKTIF" : "NORMAL"}
                        </span>
                      </div>
                      <p className="panel-sub">
                        Bandingkan sensor sebelum dan sesudah titik kebocoran.
                      </p>
                      <div className="scenario-label">PILIH SCENARIO</div>
                      <div className="scenario-buttons">
                        <button
                          disabled={pending}
                          className={s.scenario === "normal" ? "selected" : ""}
                          onClick={() =>
                            command("scenario", { scenario: "normal" })
                          }
                        >
                          <ShieldCheck size={17} />
                          <span>
                            <b>Normal</b>
                            <small>Tanpa kebocoran</small>
                          </span>
                          {s.scenario === "normal" && <Check size={14} />}
                        </button>
                        <button
                          disabled={pending}
                          className={
                            s.scenario === "leak_b"
                              ? "selected leak-selected"
                              : ""
                          }
                          onClick={() =>
                            command("scenario", { scenario: "leak_b" })
                          }
                        >
                          <Droplets size={17} />
                          <span>
                            <b>Leak B</b>
                            <small>Simulasi kebocoran</small>
                          </span>
                          {s.scenario === "leak_b" && <Check size={14} />}
                        </button>
                      </div>
                      <div className="manual-leak">
                        <div>
                          <b>Leak valve B</b>
                          <small>
                            Kontrol manual · sebelum sensor 5{" "}
                            {s.scenario === "manual" && "· Manual"}
                          </small>
                        </div>
                        <Switch
                          label="Leak valve B"
                          checked={s.leakB}
                          disabled={pending}
                          onChange={(v) => command("leak-b", { enabled: v })}
                        />
                      </div>
                    </section>
                  </div>
                </div>
              </div>
              <section className="panel mqtt-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">TELEMETRY / MQTT</div>
                    <h2>Broker MQTT</h2>
                  </div>
                  <span
                    className={`leak-badge ${!mqtt || (mqtt.enabled && !mqtt.connected) ? "on" : ""}`}
                  >
                    <span />{" "}
                    {!mqtt
                      ? "STATUS TIDAK TERSEDIA"
                      : mqtt.connected
                        ? "TERHUBUNG"
                        : mqtt.enabled
                          ? "TIDAK TERHUBUNG"
                          : "NONAKTIF"}
                  </span>
                </div>
                <p className="panel-sub">
                  Sensor diterbitkan saat nilai berubah, dan dikirim ulang
                  setelah koneksi pulih.
                </p>
                {mqtt ? (
                  <>
                    <div className="mqtt-info">
                      <div>
                        <span>BROKER</span>
                        <b>
                          {mqtt.host || "Belum dikonfigurasi"}
                          {mqtt.host ? `:${mqtt.port}` : ""}
                        </b>
                      </div>
                      <div>
                        <span>TOPIC SENSOR</span>
                        <b>{mqtt.topicRoot}</b>
                      </div>
                      <div>
                        <span>TERKIRIM / GAGAL</span>
                        <b>
                          {mqtt.sent} / {mqtt.failed}
                        </b>
                      </div>
                    </div>
                    {mqtt.lastError && (
                      <p className="mqtt-error" role="status">
                        {mqtt.lastError}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mqtt-error" role="status">
                    Status MQTT tidak tersedia. Restart backend dengan versi
                    terbaru.
                  </p>
                )}
              </section>
              <footer>
                <span>
                  WATER STATE SIMULATOR <span className="footer-dot">·</span>{" "}
                  SIMULASI TANPA PERANGKAT FISIK
                </span>
                <span>
                  LAST TICK <b>#{String(s.tick).padStart(5, "0")}</b>
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
function ValveOpening({ branch, opening, open, disabled, onApply }: { branch: string; opening: number; open: boolean; disabled: boolean; onApply: (value: number) => Promise<void> }) {
  const [draft, setDraft] = useState(open ? opening : 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setDraft(open ? opening : 0); }, [opening, open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <div className="valve-opening">
    <label htmlFor={`opening-${branch}`}>Bukaan valve <strong>{draft}%</strong></label>
    <input id={`opening-${branch}`} type="range" min="0" max="100" step="1" value={draft} disabled={disabled} onChange={(event) => {
      const value = Number(event.target.value);
      setDraft(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; void onApply(value); }, 250);
    }} />
    <small>Diterapkan otomatis</small>
  </div>;
}
function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`switch ${checked ? "checked" : ""}`}
    >
      <span />
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
