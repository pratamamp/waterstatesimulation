import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from './engine';
import { MqttTransport } from './mqtt';

test('sensor dikirim ke satu topic tanpa retain, hanya saat berubah', () => {
  const previousEnabled = process.env.MQTT_ENABLED;
  const previousTopic = process.env.MQTT_TOPIC_ROOT;
  process.env.MQTT_ENABLED = 'false';
  process.env.MQTT_TOPIC_ROOT = '/wateresriid';
  try {
    const transport = new MqttTransport(new Simulation(() => 0.5));
    const messages: { topic: string; payload: string; options: { qos: number; retain: boolean } }[] = [];
    const client = { connected: true, publish(topic: string, payload: string, options: { qos: number; retain: boolean }, callback: (error?: Error) => void) {
      messages.push({ topic, payload, options }); callback();
    } };
    (transport as unknown as { client: typeof client }).client = client;
    transport.publishChanged();
    transport.publishChanged();
    assert.equal(messages.length, 10);
    assert.deepEqual(messages.map(message => JSON.parse(message.payload).id), [0,1,2,3,4,5,6,7,8,9]);
    for (const message of messages) {
      assert.equal(message.topic, '/wateresriid');
      assert.deepEqual(message.options, { qos: 0, retain: false });
    }
  } finally {
    if (previousEnabled === undefined) delete process.env.MQTT_ENABLED; else process.env.MQTT_ENABLED = previousEnabled;
    if (previousTopic === undefined) delete process.env.MQTT_TOPIC_ROOT; else process.env.MQTT_TOPIC_ROOT = previousTopic;
  }
});
