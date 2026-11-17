# Product Requirements Document — Water State Simulator Web

| Atribut | Nilai |
|---|---|
| Produk | Water State Simulator Web |
| Versi dokumen | 0.1 — Draft review |
| Status | Menunggu persetujuan |
| Bahasa | Indonesia |
| Referensi | `/Users/mpratama/Documents/Coded/PlatformIO/Projects/WaterUtilities-HTTP-direct-Velocity/` |
| Target | Aplikasi web lokal atau server-hosted |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + TypeScript, REST API, SSE |
| Database | SQLite |

## 1. Ringkasan

Water State Simulator Web memindahkan simulasi water utility dari firmware ESP32 menjadi aplikasi web tanpa mengubah logic domain inti dan workflow operasionalnya.

Sistem mensimulasikan:

- satu reservoir `Strg-1`;
- satu fill pump;
- satu return/circulation pump;
- tiga branch distribusi A, B, dan C;
- satu isolation valve per branch;
- sembilan flow sensor;
- satu titik kebocoran terkontrol pada Branch B;
- workflow `IDLE`, `RUN`, dan `FILL`;
- telemetry HTTP menuju ArcGIS Velocity;
- telemetry MQTT menuju broker;
- dashboard real-time dan kontrol operator.

React menjadi presentation layer. Backend Node menjadi source of truth untuk simulation engine, scheduler, persistence, secret, serta transport HTTP/MQTT. SQLite menyimpan konfigurasi, riwayat simulation run, event, snapshot, dan antrean telemetry yang perlu dipulihkan setelah restart.

## 2. Latar belakang

Implementasi sumber berjalan pada ESP32 dan menyatukan simulation engine, dashboard, persistence, MQTT, serta HTTP Velocity dalam firmware.

Port web diperlukan untuk:

1. menjalankan demo tanpa board ESP32;
2. memberi dashboard lebih kaya dan responsif;
3. memudahkan test scenario normal dan leak;
4. menyimpan riwayat simulasi;
5. menjaga kontrak telemetry yang sama dengan firmware;
6. memisahkan domain, UI, persistence, dan transport secara jelas.

## 3. Tujuan produk

1. Mereplikasi state machine, parameter, sensor mapping, dan workflow firmware.
2. Menampilkan perubahan reservoir, flow, valve, leak, NRW, dan telemetry secara real-time.
3. Menyediakan kontrol operator untuk workflow, scenario, pump, dan valve.
4. Mengirim canonical sensor records yang sama ke ArcGIS Velocity dan MQTT.
5. Menjaga simulation engine tetap berjalan ketika transport eksternal gagal.
6. Menyimpan konfigurasi dan riwayat penting dalam SQLite.
7. Menyediakan struktur modular agar simulator dapat diuji tanpa UI atau koneksi transport eksternal.

## 4. Bukan tujuan produk

1. Mengendalikan pompa atau valve fisik.
2. Menjadi model hidraulik ilmiah atau pengganti EPANET.
3. Menjadi sistem billing air.
4. Mendukung multi-tenant pada versi pertama.
5. Mengubah topology tiga branch pada versi pertama.
6. Mengirim actuator, pump, valve, atau derived metric sebagai sensor ArcGIS Velocity.
7. Menjamin exactly-once delivery menuju sistem eksternal.

## 5. Pengguna

| Peran | Kebutuhan |
|---|---|
| Operator | Menjalankan, menghentikan, mengisi reservoir, mengubah valve dan scenario |
| Demo user | Melihat efek kebocoran secara visual dan real-time |
| IoT engineer | Mengatur HTTP Velocity, MQTT, auth, interval, dan TLS |
| GIS analyst | Menerima 10 sensor berkoordinat WGS84 dalam schema stabil |
| QA engineer | Menjalankan scenario deterministik dan memverifikasi transition/payload |
| Developer | Menguji domain engine terpisah dari UI dan transport |

## 6. Keputusan scope porting

### 6.1 Dipertahankan

- Domain model dan nilai default.
- Workflow `IDLE`, `RUN`, `FILL`.
- Guard start hanya saat reservoir penuh.
- Manual fill dan auto pump.
- Isolation valve A/B/C.
- Scenario `normal`, `leak_b`, dan status internal `manual`.
- Kebocoran Branch B di antara sensor 4 dan sensor 5.
- Sembilan flow sensor dan satu water level sensor.
- Simulation tick default 1 detik.
- HTTP Velocity snapshot default tiap 5 detik.
- MQTT publish saat nilai berubah.
- Retry/backoff dan status tiap transport secara independen.
- Canonical telemetry record dan koordinat sensor.

### 6.2 Diganti karena perbedaan platform

| Firmware | Aplikasi web |
|---|---|
| ESP32 event loop | Backend scheduler |
| NVS Preferences | SQLite dan environment variable |
| HTML di header C++ | React component |
| Polling dashboard 1 detik | SSE real-time dengan fallback polling |
| `millis()` | Monotonic clock backend |
| Static ring buffer RAM | Bounded queue di SQLite |

### 6.3 Database diperlukan

SQLite dipakai karena aplikasi web memerlukan:

- konfigurasi yang bertahan setelah restart;
- masking dan pengelolaan reference secret;
- riwayat simulation run;
- event audit operator;
- snapshot berkala untuk chart/replay;
- antrean HTTP telemetry yang dapat dipulihkan;
- counter delivery dan error transport.

State simulasi aktif tetap berada di memory agar tick cepat dan domain engine tidak bergantung pada database.

## 7. Arsitektur produk

```text
Browser
┌──────────────────────────────────────────────┐
│ React + TypeScript + Vite + Tailwind CSS    │
│ Dashboard · Controls · History · Settings   │
└───────────────────────┬──────────────────────┘
                        │ REST + SSE
                        v
Backend Node.js + TypeScript
┌──────────────────────────────────────────────┐
│ API / Validation / Auth                      │
├──────────────────────────────────────────────┤
│ Simulation Engine                           │
│ State Machine · Commands · Sensor Registry  │
├──────────────────────────────────────────────┤
│ Scheduler · Snapshot Service · Event Stream │
├───────────────────────┬──────────────────────┤
│ HTTP Velocity Adapter │ MQTT Adapter         │
└───────────────┬───────┴──────────┬───────────┘
                │                  │
                v                  v
          ArcGIS Velocity      MQTT Broker
                
                SQLite
     Config · Runs · Events · Snapshots · Queue
```

### 7.1 Prinsip arsitektur

1. Backend menjadi source of truth state.
2. React tidak menghitung domain state secara mandiri.
3. Semua mutasi melewati command service.
4. Domain engine tidak mengimpor HTTP, MQTT, SQLite, atau React.
5. Satu serializer dipakai oleh HTTP dan MQTT.
6. HTTP dan MQTT dapat aktif sendiri-sendiri atau bersamaan.
7. Kegagalan transport tidak menghentikan simulation tick.
8. Waktu monotonic mengatur scheduler; UTC mengisi timestamp payload.
9. Secret tidak pernah dikirim kembali utuh ke browser.

## 8. Stack teknis target

### 8.1 Frontend

- React dengan TypeScript.
- Vite sebagai dev server dan build tool.
- Tailwind CSS untuk styling.
- React Router untuk `Dashboard`, `History`, dan `Settings` bila routing dibutuhkan.
- SSE (`EventSource`) untuk snapshot real-time.
- REST API untuk command dan konfigurasi.
- Chart library bersifat opsional; keputusan saat desain teknis.

### 8.2 Backend

- Node.js dengan TypeScript.
- HTTP framework ringan; pilihan final dicatat pada technical design.
- Schema validation untuk request, response, dan environment config.
- MQTT client server-side.
- Native `fetch`/HTTP client server-side untuk ArcGIS Velocity.
- Structured logging tanpa credential.

### 8.3 Storage

- SQLite satu file untuk deployment lokal.
- Migration versioned.
- Foreign key aktif.
- WAL mode untuk read/write concurrent ringan.
- Secret sensitif diprioritaskan dari environment variable; nilai database hanya digunakan bila deployment mengizinkan.

## 9. Topologi bisnis

```text
Reservoir Strg-1
   |
   +-- Valve A -- Sensor 1 -- Sensor 2 (house) -- Sensor 3 (outlet)
   |
   +-- Valve B -- Sensor 4 -- Leak B -- Sensor 5 (house) -- Sensor 6 (outlet)
   |
   +-- Valve C -- Sensor 7 -- Sensor 8 (house) -- Sensor 9 (outlet)
```

Makna leak detection:

- Sensor 4 mengukur flow sebelum kebocoran.
- Leak B mengurangi flow setelah sensor 4.
- Sensor 5 dan 6 mengukur flow sesudah kebocoran.
- Indikator utama kebocoran adalah `sensor4 - sensor5`.

## 10. Domain model

### 10.1 State aktif

| Field | Tipe | Default | Aturan |
|---|---|---:|---|
| `workflow` | enum | `IDLE` | `IDLE`, `RUN`, `FILL` |
| `levelRatio` | number | `1.0` | Clamp `0..1` |
| `fillPump` | boolean | `false` | Status efektif pump |
| `returnPump` | boolean | `true` | Selalu aktif pada baseline |
| `manualFill` | boolean | `false` | Command manual pump |
| `autoPump` | boolean | `false` | Mengaktifkan auto-fill |
| `valveA` | boolean | `true` | Isolation valve A |
| `valveB` | boolean | `true` | Isolation valve B |
| `valveC` | boolean | `true` | Isolation valve C |
| `leakB` | boolean | `true` | Mengikuti default scenario |
| `scenario` | enum | `leak_b` | `normal`, `leak_b`, `manual` |
| `flowA` | number | `0` | L/s |
| `flowB` | number | `0` | L/s |
| `flowC` | number | `0` | L/s |
| `sensorFlows` | number[9] | semua `0` | Sensor 1–9 |
| `sensorTotals` | number[9] | semua `0` | Akumulasi liter |
| `leakRateB` | number | `0` | L/s |
| `leakCumulative` | number | `0` | Liter |
| `startedAt` | datetime | runtime | UTC |
| `tickNumber` | integer | `0` | Bertambah tiap tick |

### 10.2 Derived state

| Field | Rumus |
|---|---|
| `capacityPct` | `levelRatio × 100` |
| `volumeL` | `levelRatio × 500` |
| `levelCm` | `levelRatio × 200` |
| `distanceCm` | `200 - levelCm` |
| `revenueLps` | `flowA + flowB + flowC` saat `RUN`, selain itu `0` |
| `totalLeakLps` | `leakRateB` jika `RUN`, valve B terbuka, dan leak B aktif |
| `capacityLps` | `revenueLps + totalLeakLps` |
| `nrwLps` | `totalLeakLps` |
| `nrwPct` | `capacityLps > 0 ? nrwLps / capacityLps × 100 : 0` |
| `leakCumulativeL` | nilai sebelumnya `+ nrwLps × deltaSeconds` |
| `startEnabled` | `workflow == IDLE && levelRatio >= 1 - epsilon` |

## 11. Parameter simulasi baseline

| Parameter | Default | Unit |
|---|---:|---|
| Tick interval | `1000` | ms |
| HTTP telemetry interval | `5000` | ms |
| Reservoir capacity | `500` | L |
| Tank height | `200` | cm |
| Fill rate | `0.030` | level ratio/detik |
| Drain factor | `0.012` | level ratio/detik pada nominal outflow |
| Nominal outflow | `125` | L/s |
| Branch A base flow | `45` | L/s |
| Branch B base flow | `38` | L/s |
| Branch C base flow | `42` | L/s |
| Flow noise | `-1.0..+1.0` | L/s/tick |
| Leak B target preset | `25` | L/s |
| Manual leak target | `5` | L/s |
| Leak minimum | `1` | L/s |
| Leak maximum | `30` | L/s |
| Leak random-walk step | `0.4` | L/s/tick |
| Low-level threshold | `0.15` | ratio |
| Full threshold | `1.00` | ratio |
| Full epsilon | `0.005` | ratio |

Semua parameter tersedia dalam configuration object. UI konfigurasi parameter advanced berada di luar MVP; environment/config file dapat mengubah default.

## 12. State machine

### 12.1 `IDLE`

- Distribusi berhenti.
- Semua flow sensor `0`.
- Reservoir tidak berkurang akibat distribusi.
- `RUN` hanya dapat dimulai saat reservoir penuh dalam epsilon.
- Manual fill tetap dapat bekerja bila reservoir belum penuh.

### 12.2 `RUN`

- Branch dengan valve terbuka menghasilkan flow.
- Flow memakai base value ditambah noise.
- Reservoir berkurang menurut total outflow.
- Leak B aktif hanya ketika reservoir berisi air dan valve B terbuka.
- Reservoir kosong memindahkan workflow ke `IDLE`.
- Auto pump aktif dan level di bawah 15% memindahkan workflow ke `FILL`.

### 12.3 `FILL`

- Distribusi berhenti; seluruh branch flow `0`.
- Auto pump menyala pada atau di bawah threshold rendah.
- Manual pump dapat mengisi ketika auto mode mati.
- Reservoir penuh mematikan pump, membersihkan manual override, lalu berpindah ke `IDLE`.

### 12.4 Transition table

| Current | Trigger | Guard | Next | Side effect |
|---|---|---|---|---|
| `IDLE` | `START` / `RUN` | Level penuh | `RUN` | Mulai distribusi |
| `IDLE` | `FILL` | Selalu | `FILL` | Masuk workflow isi |
| `RUN` | Level `<= 0` | Selalu | `IDLE` | Flow menjadi 0 |
| `RUN` | Level `< 0.15` | `autoPump=true` | `FILL` | Auto-fill dimulai |
| `RUN` | `STOP` / `IDLE` | Selalu | `IDLE` | Safe stop |
| `FILL` | Level `>= 1-epsilon` | Selalu | `IDLE` | Pump mati |
| `FILL` | `RUN` | Level penuh | `RUN` | Mulai distribusi |
| Any | Unknown workflow command | Selalu | Tidak berubah | API mengembalikan `400` |

Perbedaan aman dari firmware: command workflow tidak dikenal tidak otomatis mengubah state menjadi `IDLE`; request ditolak agar typo tidak menyebabkan mutasi diam-diam.

## 13. Workflow utama

### 13.1 Boot/reset simulation

1. Backend memuat konfigurasi efektif.
2. Engine membuat state default: reservoir penuh, `IDLE`, valve A/B/C terbuka, return pump aktif.
3. Scenario default `leak_b` membuat leak B aktif.
4. Scheduler mulai tick 1 Hz.
5. UI menerima snapshot awal.
6. Transport aktif mencoba koneksi secara independen.

### 13.2 Scenario normal

1. Operator memilih `Normal`.
2. Leak B dinonaktifkan.
3. Operator menekan `Start` saat reservoir penuh.
4. Workflow berubah menjadi `RUN`.
5. Tiga sensor pada setiap branch menghasilkan nilai sama pada presisi payload.
6. Reservoir berkurang.
7. Reservoir kosong memindahkan workflow ke `IDLE`, kecuali auto-fill sudah memicu `FILL` pada threshold rendah.

### 13.3 Scenario Leak B

1. Operator memilih `Leak B`.
2. Leak B aktif.
3. Operator menjalankan workflow.
4. Sensor 4 membaca flow Branch B sebelum leak.
5. Leak rate mulai pada 25 L/s lalu bergerak dengan bounded random walk.
6. `sensor5 = max(flowB - leakRateB, 0)`.
7. `sensor6 = sensor5`.
8. NRW dan cumulative leak bertambah.
9. UI menyorot gap sensor 4 ke sensor 5.

### 13.4 Manual leak

1. Operator mengubah switch Leak B langsung.
2. Scenario menjadi `manual`.
3. State manual bertahan sampai operator memilih preset `normal` atau `leak_b`.
4. Target awal leak manual adalah 5 L/s.

### 13.5 Manual fill

1. Auto pump harus nonaktif.
2. Operator mengaktifkan manual fill.
3. Pump efektif aktif dan level naik 0.030 ratio/detik.
4. Saat penuh, pump mati dan manual override dihapus.

### 13.6 Auto fill

1. Operator mengaktifkan auto pump.
2. Manual override dihapus.
3. Saat `RUN` dan level turun di bawah 15%, workflow menjadi `FILL`.
4. Pump mengisi reservoir.
5. Saat penuh, pump mati dan workflow menjadi `IDLE`.
6. Operator harus menekan `Start` lagi untuk melanjutkan distribusi.

## 14. Algoritma simulation tick

Urutan normatif:

1. Hitung `deltaSeconds` dari monotonic clock.
2. Evaluasi automatic transition.
3. Tentukan status efektif fill pump.
4. Perbarui reservoir berdasarkan fill atau outflow.
5. Clamp level ke `0..1`.
6. Hitung satu nilai flow untuk tiap branch.
7. Perbarui leak rate.
8. Map branch flow ke sembilan sensor.
9. Integrasikan volume total tiap sensor.
10. Hitung derived metrics.
11. Simpan snapshot bila interval persistence tercapai.
12. Emit snapshot ke client SSE.
13. Tandai sensor berubah untuk MQTT.

```text
tick(deltaSeconds):
  transitionWorkflow()
  resolvePumpState()
  updateReservoir(deltaSeconds)
  clampReservoir()

  flowA = branchFlow(valveA, 45)
  flowB = branchFlow(valveB, 38)
  flowC = branchFlow(valveC, 42)

  leakRateB = updateLeakRate(leakB, workflow, levelRatio)

  sensors[1..3] = flowA
  sensors[4] = flowB
  sensors[5] = max(flowB - leakRateB, 0)
  sensors[6] = sensors[5]
  sensors[7..9] = flowC

  updateTotals(deltaSeconds)
  updateDerivedMetrics(deltaSeconds)
```

Satu nilai random flow dihitung per branch per tick lalu dipakai konsisten. Pemanggilan random tambahan saat menghitung drain tidak diperbolehkan karena dapat membuat outflow reservoir berbeda dari sensor yang terlihat.

## 15. Sensor registry

| ID | Nama | Posisi | Unit | Latitude | Longitude |
|---:|---|---|---|---:|---:|
| 0 | Water Level Sensor | Tower `Strg-1` | `m` | 32.4041753 | -117.0779670 |
| 1 | Flow Sensor 1 | Branch A inlet | `L/s` | 32.4050562 | -117.0790661 |
| 2 | Flow Sensor 2 | Branch A house | `L/s` | 32.4043391 | -117.0786295 |
| 3 | Flow Sensor 3 | Branch A outlet | `L/s` | 32.4038756 | -117.0784616 |
| 4 | Flow Sensor 4 | Branch B inlet/pre-leak | `L/s` | 32.4052254 | -117.0799734 |
| 5 | Flow Sensor 5 | Branch B house/post-leak | `L/s` | 32.4044668 | -117.0796803 |
| 6 | Flow Sensor 6 | Branch B outlet/post-leak | `L/s` | 32.4036501 | -117.0791684 |
| 7 | Flow Sensor 7 | Branch C inlet | `L/s` | 32.4051008 | -117.0806950 |
| 8 | Flow Sensor 8 | Branch C house | `L/s` | 32.4039885 | -117.0800285 |
| 9 | Flow Sensor 9 | Branch C outlet | `L/s` | 32.4034342 | -117.0798029 |

Koordinat memakai WGS84/EPSG:4326. Longitude selalu memakai field `lng`, bukan `lon`.

## 16. Canonical sensor record

| Field | Tipe | Wajib | Aturan |
|---|---|---|---|
| `device_id` | string | Ya | Default `WU-RES-001`, configurable |
| `id` | integer | Ya | Stabil `0..9` |
| `name` | string | Ya | Sesuai registry |
| `type` | string | Ya | Selalu `sensor` |
| `status` | integer | Ya | `1`; nilai flow `0` tetap valid |
| `value` | number | Ya | Quantized maksimal tiga desimal |
| `unit` | string | Ya | `m` atau `L/s` |
| `lat` | number | Ya | WGS84 |
| `lng` | number | Ya | WGS84 |
| `timestamp` | string | Ya | ISO 8601 UTC |

```json
{
  "device_id": "WU-RES-001",
  "id": 5,
  "name": "Flow Sensor 5",
  "type": "sensor",
  "status": 1,
  "value": 13.0,
  "unit": "L/s",
  "lat": 32.4044668,
  "lng": -117.0796803,
  "timestamp": "2026-11-16T08:30:00Z"
}
```

## 17. Functional requirements

### FR-01 — Dashboard real-time

Dashboard menampilkan:

- workflow aktif;
- reservoir level, capacity, volume, level cm, dan distance cm;
- fill pump, return pump, dan auto/manual mode;
- branch A/B/C dan status valve;
- sembilan flow sensor secara individual;
- posisi leak antara sensor 4 dan 5;
- leak rate, NRW rate, NRW percentage, dan cumulative leak;
- uptime dan simulation tick;
- status HTTP Velocity dan MQTT secara terpisah;
- HTTP last code, sent, queued, failed, dan dropped;
- status koneksi SSE.

### FR-02 — Workflow controls

Operator dapat:

- start `RUN` ketika `startEnabled=true`;
- stop ke `IDLE`;
- meminta `FILL`;
- reset simulation dengan confirmation;
- mengaktifkan atau mematikan auto pump;
- mengaktifkan atau mematikan manual fill ketika auto mode mati.

### FR-03 — Valve controls

- Operator dapat membuka/menutup valve A/B/C.
- Menutup valve membuat tiga sensor branch terkait menjadi `0` pada tick berikutnya.
- UI menampilkan pending state selama command diproses.
- Command gagal mengembalikan switch ke state server terakhir.

### FR-04 — Scenario controls

- Preset `Normal` menonaktifkan leak.
- Preset `Leak B` mengaktifkan leak B dengan target 25 L/s.
- Toggle manual Leak B mengubah scenario menjadi `manual`.
- Scenario aktif terlihat jelas.

### FR-05 — Real-time stream

- Browser membuka SSE stream setelah dashboard dimuat.
- Server mengirim snapshot setelah setiap tick.
- Server mengirim event command, transport, dan reset.
- Browser reconnect otomatis ketika stream putus.
- Fallback polling default 2 detik tersedia bila SSE gagal berulang.

### FR-06 — History

- Setiap start simulation membuat atau melanjutkan run aktif sesuai aturan lifecycle.
- User dapat melihat daftar run, waktu mulai/selesai, scenario, durasi, peak leak, total leaked volume, dan final state.
- Detail run menampilkan chart reservoir, branch flow, sensor 4/5 gap, dan NRW.
- Default retention snapshot configurable; baseline 30 hari.
- User dapat menghapus satu run dengan confirmation.

### FR-07 — Settings

Halaman Settings menyediakan:

- device ID;
- HTTP Velocity enabled;
- Velocity URL;
- auth type `Bearer` atau `Basic`;
- input token atau username/password;
- telemetry interval;
- tombol test HTTP;
- MQTT enabled;
- MQTT host, port, TLS, username, password, topic root;
- tombol test MQTT;
- status sumber konfigurasi: environment atau database.

Secret existing hanya ditampilkan sebagai `********`. Form kosong berarti mempertahankan secret existing, bukan menghapusnya. Penghapusan secret memakai action eksplisit.

### FR-08 — Simulation reset

Reset simulation:

- membutuhkan confirmation;
- mengakhiri run aktif;
- mengembalikan state domain ke default;
- tidak menghapus settings atau history;
- membuat audit event;
- tidak otomatis menghapus telemetry queue.

### FR-09 — Export

- Detail run dapat diekspor menjadi CSV.
- Export minimal berisi timestamp, workflow, level, sensor1–sensor9, leak rate, NRW, dan cumulative leak.
- Export canonical sensor snapshot JSON bersifat opsional untuk MVP.

## 18. UX dan information architecture

### 18.1 Route

| Route | Fungsi |
|---|---|
| `/` | Dashboard operasi real-time |
| `/history` | Daftar dan detail simulation run |
| `/settings` | Konfigurasi transport dan runtime |

### 18.2 Dashboard layout

Desktop:

1. Top bar: product, live/offline, workflow, uptime.
2. Hero reservoir: animated tank level, volume, pump state, Start/Stop.
3. Distribution topology: reservoir dan tiga jalur branch.
4. Sensor panels: 1–9 sesuai arah aliran.
5. Leak/NRW panel: scenario, sensor gap, rate, cumulative.
6. Transport health: HTTP Velocity dan MQTT.
7. Recent event log.

Mobile:

- layout satu kolom;
- kontrol utama tetap terlihat tanpa horizontal scroll;
- topology menjadi tiga stacked branch;
- tabel berubah menjadi card list;
- tombol kritis minimal tinggi 44 px.

### 18.3 Visual direction

- Dark operational dashboard, bukan generic admin template.
- Warna cyan/blue untuk air dan reservoir.
- Hijau untuk normal/open/connected.
- Amber untuk filling/warning.
- Merah hanya untuk leak, failure, dan destructive action.
- Angka telemetry memakai tabular numerals.
- Animasi halus; tidak boleh mengganggu pembacaan data.
- `prefers-reduced-motion` dihormati.

### 18.4 Accessibility

- Semua control dapat dipakai dengan keyboard.
- Toggle punya label programmatic.
- Status tidak dibedakan hanya lewat warna.
- Focus indicator terlihat.
- Kontras minimum WCAG AA untuk text utama.
- Live updates penting memakai `aria-live` yang tidak terlalu agresif.

## 19. REST API contract

Semua response memakai JSON. Error memakai bentuk:

```json
{
  "error": {
    "code": "INVALID_COMMAND",
    "message": "Reservoir harus penuh sebelum RUN",
    "details": {}
  }
}
```

### 19.1 State dan stream

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/v1/state` | Snapshot lengkap |
| `GET` | `/api/v1/sensors` | 10 canonical sensor records |
| `GET` | `/api/v1/events/stream` | SSE snapshot dan event |
| `GET` | `/api/v1/health` | Health backend, DB, scheduler, transport |

### 19.2 Commands

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/v1/commands/workflow` | `{ "state": "IDLE|RUN|FILL" }` |
| `POST` | `/api/v1/commands/auto-pump` | `{ "enabled": true }` |
| `POST` | `/api/v1/commands/fill-pump` | `{ "enabled": true }` |
| `POST` | `/api/v1/commands/valves/a` | `{ "open": true }` |
| `POST` | `/api/v1/commands/valves/b` | `{ "open": true }` |
| `POST` | `/api/v1/commands/valves/c` | `{ "open": true }` |
| `POST` | `/api/v1/commands/leak-b` | `{ "enabled": true }` |
| `POST` | `/api/v1/commands/scenario` | `{ "scenario": "normal|leak_b" }` |
| `POST` | `/api/v1/commands/reset` | `{ "confirm": true }` |

Command sukses mengembalikan snapshot state terbaru. Invalid transition memakai HTTP `409`. Invalid input memakai `400`.

### 19.3 Settings dan transport

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/v1/settings` | Config aman; secret dimasking |
| `PATCH` | `/api/v1/settings/http` | Ubah konfigurasi Velocity |
| `PATCH` | `/api/v1/settings/mqtt` | Ubah konfigurasi MQTT |
| `POST` | `/api/v1/transports/http/test` | Kirim satu sample water level |
| `POST` | `/api/v1/transports/mqtt/test` | Test connect/publish ke test topic |
| `GET` | `/api/v1/transports/status` | Health dan counter transport |

### 19.4 History

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/v1/runs` | Daftar run, pagination/filter |
| `GET` | `/api/v1/runs/:id` | Summary run |
| `GET` | `/api/v1/runs/:id/snapshots` | Time-series downsampled |
| `GET` | `/api/v1/runs/:id/events` | Audit event run |
| `GET` | `/api/v1/runs/:id/export.csv` | Export CSV |
| `DELETE` | `/api/v1/runs/:id` | Hapus run setelah confirmation UI |

## 20. SSE contract

Event minimum:

```text
event: snapshot
data: { ...SimulationSnapshot }

event: command
data: { "type":"VALVE_CHANGED", ... }

event: transport
data: { "transport":"http", "state":"error", ... }

event: heartbeat
data: { "timestamp":"..." }
```

Aturan:

- snapshot dikirim maksimal satu kali per tick;
- heartbeat tiap 15 detik jika tidak ada event;
- event memiliki incremental ID agar browser dapat mengirim `Last-Event-ID`;
- reconnect tidak menjamin replay tanpa batas; server selalu mengirim snapshot terbaru lebih dahulu.

## 21. HTTP Velocity transport

### 21.1 Request

```http
POST <velocity-url>
Content-Type: text/plain
Authorization: Bearer <token>
```

atau:

```http
Authorization: Basic <base64-user-password>
```

Body berupa root JSON array berisi tepat 10 canonical sensor records dengan ID `0..9`.

### 21.2 Delivery

- Default interval 5 detik.
- Setiap interval membuat snapshot seluruh 10 sensor.
- Success code: `200`, `201`, atau `202`.
- Failure menyimpan batch dalam bounded queue SQLite.
- Backoff baseline: 1, 2, 4 detik; cap 4 detik.
- Queue default maksimum 100 batch.
- Saat penuh, batch tertua dibuang dan counter `dropped` bertambah.
- Queue diproses urut FIFO.
- Setiap request punya connect dan response timeout.
- Test manual mengirim satu Water Level Sensor dan tetap memverifikasi TLS.

### 21.3 ArcGIS mapping

```text
Format: JSON
Root node: kosong
Location type: X/Y fields
X field: lng
Y field: lat
Spatial reference: WGS 1984 / WKID 4326
```

## 22. MQTT transport

### 22.1 Topic

```text
/esp32/waterutil/sensor/0
/esp32/waterutil/sensor/1
...
/esp32/waterutil/sensor/9
/esp32/waterutil/status
```

Topic root configurable. Default dipertahankan untuk kompatibilitas firmware.

### 22.2 Publish rules

- Payload sensor memakai canonical sensor record.
- Sensor message retained.
- Publish hanya ketika nilai quantized tiga desimal berubah.
- Perubahan timestamp saja tidak memicu publish.
- Reconnect mengirim ulang snapshot seluruh 10 sensor satu kali.
- Publish gagal meng-invalidasi cache nilai agar dicoba kembali.
- MQTT gagal tidak menghentikan HTTP atau simulation engine.
- Status connection dipublikasikan terpisah dan bukan bagian 10 sensor canonical.

### 22.3 TLS

- TLS dapat diaktifkan/dimatikan sesuai broker.
- Jika TLS aktif, certificate chain server wajib diverifikasi.
- Tidak ada fallback insecure.

## 23. Data model SQLite

### 23.1 `app_settings`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `key` | TEXT PK | Nama setting |
| `value_json` | TEXT | JSON value non-secret atau encrypted value bila didukung |
| `is_secret` | INTEGER | `0/1` |
| `updated_at` | TEXT | UTC |

### 23.2 `simulation_runs`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | TEXT PK | UUID |
| `started_at` | TEXT | UTC |
| `ended_at` | TEXT nullable | UTC |
| `initial_scenario` | TEXT | Scenario awal |
| `status` | TEXT | `active`, `completed`, `reset`, `crashed` |
| `final_level` | REAL nullable | Level akhir |
| `peak_leak_lps` | REAL | Peak leak |
| `total_leak_l` | REAL | Cumulative leak akhir |
| `metadata_json` | TEXT | Version/seed/config snapshot |

### 23.3 `simulation_snapshots`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INTEGER PK | Auto increment |
| `run_id` | TEXT FK | Simulation run |
| `captured_at` | TEXT | UTC |
| `tick_number` | INTEGER | Tick |
| `workflow` | TEXT | State |
| `level_ratio` | REAL | Reservoir |
| `sensor_flows_json` | TEXT | Array 9 nilai |
| `leak_rate_b` | REAL | L/s |
| `nrw_lps` | REAL | L/s |
| `nrw_pct` | REAL | Percent |
| `leak_cumulative_l` | REAL | Liter |
| `state_json` | TEXT | Snapshot tambahan/versioned |

Snapshot persistence baseline satu kali per detik untuk MVP. Retention dan downsampling wajib dipertimbangkan sebelum long-running production deployment.

### 23.4 `simulation_events`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INTEGER PK | Auto increment |
| `run_id` | TEXT nullable FK | Run terkait |
| `created_at` | TEXT | UTC |
| `event_type` | TEXT | Command/transition/transport/reset |
| `actor` | TEXT | User/system |
| `payload_json` | TEXT | Payload tanpa secret |

### 23.5 `telemetry_queue`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INTEGER PK | FIFO ID |
| `transport` | TEXT | Baseline `http_velocity` |
| `created_at` | TEXT | UTC |
| `payload_json` | TEXT | Batch canonical records |
| `attempt_count` | INTEGER | Jumlah attempt |
| `next_attempt_at` | TEXT | UTC |
| `last_error` | TEXT nullable | Error aman tanpa secret |

### 23.6 `transport_metrics`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `transport` | TEXT PK | `http_velocity` atau `mqtt` |
| `sent_count` | INTEGER | Sukses |
| `failed_count` | INTEGER | Gagal |
| `dropped_count` | INTEGER | Queue overflow |
| `last_status_code` | INTEGER nullable | HTTP code |
| `last_success_at` | TEXT nullable | UTC |
| `last_error_at` | TEXT nullable | UTC |
| `last_error` | TEXT nullable | Sanitized |

## 24. Configuration precedence

Urutan prioritas:

1. Environment secret/config eksplisit.
2. SQLite settings.
3. Application defaults.

Aturan:

- Environment value tidak boleh ditimpa UI.
- UI menandai field sebagai read-only bila dikunci environment.
- GET settings tidak mengembalikan plaintext secret.
- Credential tidak masuk log, event payload, SSE, atau export.

## 25. Security requirements

1. Deployment non-local harus memakai HTTPS.
2. Production command dan settings API wajib memakai authentication/authorization.
3. Bearer token, Basic password, dan MQTT password tidak boleh dikirim ke frontend setelah disimpan.
4. URL, enum, numeric range, host, port, dan string length divalidasi server-side.
5. Outbound URL harus mendapat perlindungan SSRF untuk deployment production.
6. TLS verification wajib untuk HTTPS dan MQTT TLS.
7. Tidak ada opsi `rejectUnauthorized=false` atau insecure fallback.
8. Log wajib melakukan redaction pada `authorization`, `token`, `password`, dan connection URL bercredential.
9. Reset simulation, delete run, dan clear secret membutuhkan confirmation.
10. API mutation memiliki CSRF protection bila auth memakai cookie.
11. Rate limit diterapkan pada login, test transport, dan mutation API.
12. SQLite file tidak boleh disajikan sebagai static asset.

## 26. Reliability requirements

- Simulation engine pulih setelah exception transport.
- Tick scheduler mencegah tick overlap.
- Delay event loop memakai `deltaSeconds`, bukan menganggap selalu tepat 1 detik.
- SQLite transaction dipakai untuk operasi queue dan lifecycle run.
- Shutdown signal menghentikan scheduler, menutup run aktif, flush write, dan disconnect MQTT.
- Startup menemukan run berstatus `active` lama lalu menandainya `crashed` sebelum membuat runtime baru.
- HTTP queue bounded dan memiliki overflow policy eksplisit.
- SSE client lambat tidak boleh menahan simulation loop.
- MQTT reconnect memakai bounded backoff.
- Health endpoint membedakan `healthy`, `degraded`, dan `unhealthy`.

## 27. Performance requirements

| Area | Target MVP |
|---|---|
| Simulation tick | 1 Hz stabil |
| Dashboard update latency | p95 < 1.5 detik pada deployment target |
| Command response | p95 < 300 ms, tidak termasuk test transport |
| Dashboard first load | < 3 detik pada koneksi broadband normal |
| Concurrent dashboard | Minimum 20 SSE clients per instance |
| State API | p95 < 200 ms |
| History query | p95 < 1 detik untuk 30 hari baseline |
| Memory | Queue dan event stream selalu bounded |

## 28. Observability

Log minimum:

| Area | Data |
|---|---|
| Runtime | startup, version, uptime, shutdown |
| Simulation | transition, scenario, command, reset, tick lag |
| SQLite | migration, transaction error, queue depth |
| HTTP Velocity | host/path aman, status, duration, queue, dropped |
| MQTT | connection state, reconnect, publish failure, topic tanpa credential |
| SSE | active client count, disconnect rate |

Health response minimum:

```json
{
  "status": "healthy",
  "database": "up",
  "scheduler": "running",
  "simulation": "IDLE",
  "httpVelocity": "disabled",
  "mqtt": "disabled",
  "uptimeSeconds": 120
}
```

## 29. Error handling UX

- Command gagal menampilkan toast dengan alasan jelas.
- Invalid transition menjelaskan guard, misalnya reservoir belum penuh.
- Transport error tidak menutupi dashboard dengan blocking modal.
- Status transport berubah menjadi degraded/offline dan menampilkan last error aman.
- SSE disconnect menampilkan `Reconnecting` dan mempertahankan snapshot terakhir.
- Settings gagal disimpan tidak menghapus input user.
- Test transport menampilkan status code, duration, dan sanitized response summary.

## 30. Acceptance criteria

### AC-01 — Startup

- Backend dapat mulai tanpa hardware sensor.
- Migration SQLite berjalan otomatis atau lewat command deployment yang terdokumentasi.
- Default state valid: penuh, `IDLE`, valve terbuka, scenario `leak_b`.
- Dashboard menampilkan snapshot pertama.

### AC-02 — Start guard

- `RUN` dari `IDLE` berhasil hanya saat level penuh dalam epsilon.
- Start ditolak dengan HTTP `409` ketika level belum penuh.
- Rejection tidak mengubah state sebagian.

### AC-03 — Normal flow

- Saat `RUN`, level > 0, dan valve terbuka, sensor branch bernilai > 0.
- Scenario normal menghasilkan sensor 1=2=3, 4=5=6, dan 7=8=9 pada presisi payload.

### AC-04 — Closed valve

- Menutup valve A membuat sensor 1–3 menjadi `0` maksimal pada tick berikutnya.
- Menutup valve B membuat sensor 4–6 dan effective leak B menjadi `0`.
- Nilai `0` tetap memakai `status=1`.

### AC-05 — Leak detection

- Pada `leak_b` dan `RUN`, sensor 4 > sensor 5 setelah leak aktif.
- Sensor 5 = sensor 6 pada presisi payload.
- Branch A dan C tidak berubah langsung karena leak B.

### AC-06 — Reservoir empty

- Level tidak pernah negatif.
- Saat level mencapai `0`, workflow menjadi `IDLE`.
- Semua flow menjadi `0`.

### AC-07 — Manual fill

- Auto pump mati dan manual fill aktif membuat level naik.
- Pump berhenti dan manual override dibersihkan saat penuh.

### AC-08 — Auto fill

- Auto pump aktif memicu `FILL` saat level di bawah 15%.
- Pump mengisi sampai penuh.
- Saat penuh workflow menjadi `IDLE`, bukan langsung `RUN`.

### AC-09 — Real-time UI

- Dashboard menerima snapshot tanpa reload halaman.
- Reconnect SSE mengambil state terbaru.
- Semua command UI mencerminkan state server, bukan optimistic state permanen.

### AC-10 — HTTP schema

- Batch normal berisi tepat 10 record unik ID `0..9`.
- Semua canonical field tersedia.
- Field longitude bernama `lng`.
- Timestamp valid UTC.
- Payload tidak mengandung valve, pump, actuator, atau derived metric.

### AC-11 — HTTP retry

- Receiver offline tidak menghentikan simulasi.
- Batch gagal masuk queue.
- Retry mengikuti backoff bounded.
- Queue overflow menghapus oldest dan menambah `dropped`.
- Queue masih tersedia setelah backend restart.

### AC-12 — MQTT

- Sensor tidak diterbitkan ulang bila value tiga desimal tidak berubah.
- Sensor berubah diterbitkan tanpa menunggu interval HTTP.
- Reconnect menerbitkan snapshot 10 sensor sekali.
- Sensor message retained.

### AC-13 — Dual transport

- HTTP dan MQTT dapat aktif bersama.
- Kegagalan HTTP tidak menghentikan MQTT.
- Kegagalan MQTT tidak menghentikan HTTP.

### AC-14 — Persistence

- Settings non-secret bertahan setelah restart.
- History run dan snapshot dapat dibaca setelah restart.
- Run aktif yang terputus ditandai `crashed` saat startup berikutnya.

### AC-15 — Secret handling

- GET settings hanya mengembalikan secret masked.
- Secret tidak muncul pada log, SSE, audit event, export, atau error response.
- Environment-locked secret tidak dapat diubah lewat UI.

### AC-16 — History

- User dapat melihat daftar run dan detail chart.
- CSV memuat field yang ditentukan.
- Delete run menghapus snapshot/event terkait dalam transaction setelah confirmation.

### AC-17 — Responsive dan accessible

- Dashboard usable pada viewport 360 px tanpa horizontal overflow.
- Kontrol dapat dipakai dengan keyboard.
- Status penting memiliki text, bukan warna saja.

## 31. Test matrix minimum

| Test | Setup | Expected |
|---|---|---|
| Boot default | DB baru | Full, IDLE, leak_b, flow 0 |
| Start full | Full + IDLE | RUN |
| Start not full | Level < 0.995 | 409, state tetap |
| Normal | RUN + valve open | Sensor tiap branch konsisten |
| Leak B | RUN + leak_b | S4 > S5 = S6 |
| Valve A closed | RUN | S1–S3 = 0 |
| Valve B closed | RUN + leak | S4–S6 = 0, NRW B = 0 |
| Manual fill | Auto off | Level naik |
| Auto fill | Auto on + low | FILL, pump on |
| Full stop | Filling | Pump off, IDLE |
| HTTP 200 | Receiver online | sent++, queue kosong |
| HTTP 401 | Credential salah | failed++, error sanitized |
| HTTP offline | Receiver down | Queue + retry |
| Queue overflow | Failure panjang | Oldest drop, dropped++ |
| MQTT unchanged | State stabil | Tidak publish ulang |
| MQTT changed | Sensor berubah | Sensor terkait publish |
| MQTT reconnect | Broker reconnect | Snapshot 10 sensor |
| SSE reconnect | Putus browser | Snapshot terbaru diterima |
| Restart server | Run aktif | Run lama `crashed` |
| Secret GET | Secret tersimpan | `********` |
| CSV export | Run selesai | CSV valid |

## 32. MVP scope

### Termasuk

- React/Vite/Tailwind dashboard responsif.
- Node backend dan domain engine.
- SQLite migration dan persistence.
- Workflow, pump, valve, scenario, leak, dan NRW.
- SSE real-time plus polling fallback.
- HTTP Velocity adapter.
- MQTT adapter.
- Settings dengan masked secret.
- Run history, basic chart data, dan CSV export.
- Unit, integration, dan browser smoke tests untuk acceptance criteria utama.

### Ditunda

- Multi-user role management lengkap.
- Multi-device dan multi-tenant.
- Topology editor.
- Replay run sebagai live animation.
- Sensor fault injection.
- PWA/offline control.
- Prometheus/OpenTelemetry exporter.
- PostgreSQL adapter.
- Docker orchestration production lengkap, kecuali dibutuhkan saat implementasi.

## 33. Tahap implementasi yang diusulkan

1. **Foundation** — workspace, TypeScript, Vite, Tailwind, backend, SQLite migration.
2. **Domain** — state machine, deterministic clock/random ports, sensor serializer, unit test.
3. **API** — state, commands, validation, SSE, health.
4. **Dashboard** — reservoir, topology, sensors, controls, responsive states.
5. **Persistence** — runs, events, snapshots, retention, CSV.
6. **Telemetry** — HTTP Velocity queue/retry dan MQTT change publishing.
7. **Settings/security** — config precedence, masking, TLS, SSRF guard, redaction.
8. **Hardening** — integration test, reconnect, graceful shutdown, performance check.

## 34. Definition of done

Produk dianggap selesai untuk MVP jika:

1. Seluruh AC-01 sampai AC-17 lulus.
2. Domain tests mencakup transition dan mapping sensor utama.
3. API contract terdokumentasi.
4. Fresh install dapat dijalankan dari README.
5. Migration dapat membuat database kosong sampai schema terbaru.
6. Production build frontend berhasil.
7. Backend dapat menjalankan frontend build atau didokumentasikan untuk reverse proxy.
8. Tidak ada credential pada source control atau log test.
9. HTTP dan MQTT dapat dimatikan tanpa error runtime.
10. Dashboard usable pada desktop dan mobile.

## 35. Pertanyaan review dan keputusan terbuka

Poin berikut perlu persetujuan sebelum implementasi:

1. **History MVP** — tetap masuk MVP atau ditunda agar versi pertama fokus live simulator?
2. **Telemetry** — HTTP Velocity dan MQTT langsung masuk MVP, atau tahap kedua?
3. **Authentication aplikasi** — local-only tanpa login, atau login operator sejak MVP?
4. **Default scenario** — pertahankan `leak_b` seperti firmware, atau ubah menjadi `normal` untuk startup lebih aman?
5. **Simulation lifecycle** — satu run dibuat saat backend start, atau baru saat operator menekan `Start`?
6. **Secret storage** — environment-only untuk production, atau izinkan SQLite dengan encryption key dari environment?
7. **Deployment** — target utama laptop lokal, server/VPS, atau Docker?
8. **Visual fidelity** — pertahankan tema dashboard firmware atau desain ulang topology-first?
9. **Deterministic simulation** — simpan random seed per run agar hasil dapat direproduksi?
10. **Compatibility API** — perlu endpoint alias lama seperti `/api/data`, atau cukup API `/api/v1` baru?

## 36. Source of truth

Urutan source of truth setelah PRD disetujui:

1. PRD ini untuk scope aplikasi web dan acceptance criteria.
2. PRD sumber firmware untuk business rule yang belum dipindahkan secara eksplisit.
3. Canonical sensor contract pada bagian 15–16 dokumen ini.
4. Automated tests.
5. Implementasi source code.

Perbedaan antara firmware dan PRD web harus dicatat sebagai keputusan produk, bukan diperbaiki diam-diam saat coding.
