# Water State Simulator

Simulator distribusi air berbasis React, Vite, Tailwind CSS, Node.js dan SQLite. Tidak memerlukan ESP32.

## Menjalankan

Persyaratan: Node.js 24 atau lebih baru dan npm.

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Backend berjalan pada `http://localhost:3001`, terikat ke localhost. Database dibuat di `data/water-state.sqlite`.

Untuk build dan menjalankan hasil build:

```bash
npm run build
npm start
```

Buka `http://localhost:3001`. Jalankan pengujian dengan `npm test`.

## Cakupan saat ini

- Simulasi reservoir, tiga branch, sembilan flow sensor, valve, skenario kebocoran, pompa manual dan otomatis.
- Dashboard real-time melalui SSE, API command, dan riwayat sesi dasar di SQLite.
- Endpoint `/api/v1/sensors` menyediakan 10 canonical sensor records.
- MQTT menggunakan TLS, publish sensor saat nilai berubah, dan mengirim ulang seluruh sensor saat reconnect.

## Konfigurasi MQTT

Kredensial berada di `.env` terpisah dan tidak masuk Git. Lihat `.env.example` untuk daftar konfigurasi. Ubah nilai dan restart backend setelah mengubah file. Password yang mengandung `#` harus diapit tanda kutip. Gunakan `MQTT_CA_FILE` bila broker menggunakan CA privat; verifikasi TLS selalu aktif.

Seperti firmware ESP32, seluruh sensor dikirim ke satu topic `MQTT_TOPIC_ROOT` (default `/wateresriid`), tanpa tambahan `/sensor/{id}`. Setiap pesan berisi satu canonical sensor record, QoS 0, tanpa retain. Slash awal atau akhir merupakan bagian dari topic dan dipertahankan. Counter berhasil berarti publish dikirim oleh client, bukan konfirmasi penerimaan broker. Dashboard dan `/api/v1/transports/status` menampilkan status tanpa membuka kredensial. Topic status perangkat firmware belum diimplementasikan.

HTTP Velocity, halaman konfigurasi telemetry, detail riwayat, ekspor, dan autentikasi belum diimplementasikan. Aplikasi hanya ditujukan untuk penggunaan lokal; jangan expose ke jaringan publik tanpa autentikasi, proteksi CSRF, dan hardening tambahan. Nilai simulasi bukan model hidraulik untuk kontrol perangkat fisik.
