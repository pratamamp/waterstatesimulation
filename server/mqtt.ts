import mqtt, { type MqttClient } from "mqtt";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { sensorRecords, type Simulation } from "./engine";

type RecordValue = ReturnType<typeof sensorRecords>[number];
export type MqttHealth = {
  enabled: boolean;
  connected: boolean;
  state: string;
  host: string;
  port: number;
  topicRoot: string;
  sent: number;
  failed: number;
  lastError: string | null;
  lastPublishedAt: string | null;
};

export class MqttTransport {
  private client: MqttClient | null = null;
  private last = new Map<number, number>();
  private inFlight = new Map<number, number>();
  private generation = 0;
  private health: MqttHealth;
  constructor(private sim: Simulation) {
    const enabled = process.env.MQTT_ENABLED === "true";
    const host = process.env.MQTT_HOST || "";
    const port = Number(process.env.MQTT_PORT || 8883);
    const topicRoot = process.env.MQTT_TOPIC_ROOT || "/wateresriid";
    this.health = {
      enabled,
      connected: false,
      state: enabled ? "connecting" : "disabled",
      host,
      port,
      topicRoot,
      sent: 0,
      failed: 0,
      lastError: null,
      lastPublishedAt: null,
    };
    if (!enabled) return;
    if (host.includes("://") || /[\s/]/.test(host)) {
      this.health.state = "error";
      this.health.lastError =
        "MQTT_HOST harus berupa hostname saja, tanpa ssl://, mqtts://, port, atau path.";
      return;
    }
    if (
      !host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !topicRoot ||
      /[+#\0]/.test(topicRoot)
    ) {
      this.health.state = "error";
      this.health.lastError = "Konfigurasi MQTT tidak valid.";
      return;
    }
    let ca: Buffer | undefined;
    try {
      if (process.env.MQTT_CA_FILE) ca = readFileSync(process.env.MQTT_CA_FILE);
    } catch {
      this.health.state = "error";
      this.health.lastError = "File CA MQTT tidak dapat dibaca.";
      return;
    }
    this.client = mqtt.connect({
      protocol: "mqtts",
      host,
      port,
      username: process.env.MQTT_USER || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
      ca,
      rejectUnauthorized: true,
      clientId: `water-state-${randomUUID().slice(0, 12)}`,
      reconnectPeriod: 5000,
      reconnectOnConnackError: true,
      connectTimeout: 10000,
      queueQoSZero: false,
    });
    this.client.on("connect", () => {
      this.generation++;
      this.last.clear();
      this.inFlight.clear();
      this.health.connected = true;
      this.health.state = "connected";
      this.health.lastError = null;
      this.publishChanged();
    });
    this.client.on("reconnect", () => {
      this.health.state = "connecting";
    });
    this.client.on("close", () => {
      this.generation++;
      this.inFlight.clear();
      this.health.connected = false;
      if (this.health.state !== "error") this.health.state = "offline";
    });
    this.client.on("error", (error) => {
      this.health.connected = false;
      this.health.state = "error";
      // Report safe diagnostic code only; broker errors may contain sensitive details.
      const code = String((error as NodeJS.ErrnoException).code || "");
      const messages: Record<string, string> = {
        ENOTFOUND:
          "Domain broker tidak ditemukan (ENOTFOUND). Periksa DNS dan nama domain.",
        EAI_AGAIN: "DNS tidak merespons (EAI_AGAIN). Periksa koneksi dan DNS.",
        ETIMEDOUT:
          "Koneksi broker timeout (ETIMEDOUT). Periksa port dan firewall.",
        ECONNREFUSED:
          "Koneksi broker ditolak (ECONNREFUSED). Periksa listener dan port.",
        CERT_HAS_EXPIRED:
          "Sertifikat TLS broker kedaluwarsa (CERT_HAS_EXPIRED).",
        UNABLE_TO_VERIFY_LEAF_SIGNATURE:
          "Sertifikat TLS broker tidak tepercaya (UNABLE_TO_VERIFY_LEAF_SIGNATURE).",
        SELF_SIGNED_CERT_IN_CHAIN:
          "Sertifikat TLS memerlukan CA tepercaya (SELF_SIGNED_CERT_IN_CHAIN).",
      };
      this.health.lastError =
        messages[code] ||
        (code && /^[A-Z0-9_]+$/.test(code)
          ? `Koneksi MQTT gagal (${code}). Periksa broker dan TLS.`
          : "Koneksi MQTT gagal atau timeout. Periksa broker, TLS, dan kredensial.");
    });
  }
  status(): MqttHealth {
    return { ...this.health };
  }
  publishChanged() {
    if (!this.client?.connected) return;
    for (const record of sensorRecords(this.sim)) this.publish(record);
  }
  private publish(record: RecordValue) {
    if (
      !this.client?.connected ||
      this.inFlight.has(record.id) ||
      this.last.get(record.id) === record.value
    )
      return;
    const generation = this.generation;
    this.inFlight.set(record.id, record.value);
    this.client.publish(
      this.health.topicRoot,
      JSON.stringify(record),
      { qos: 0, retain: false },
      (error) => {
        if (generation !== this.generation) return;
        this.inFlight.delete(record.id);
        if (error) {
          this.last.delete(record.id);
          this.health.failed++;
          this.health.lastError = "Publish MQTT gagal.";
        } else {
          this.last.set(record.id, record.value);
          this.health.sent++;
          this.health.lastPublishedAt = new Date().toISOString();
        }
      },
    );
  }
  close() {
    this.client?.end(true);
  }
}
