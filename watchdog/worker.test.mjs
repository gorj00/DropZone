import assert from 'node:assert/strict';
import { test } from 'node:test';
import { watch } from './worker.js';

const HEALTH = 'https://api.test/actuator/health';
const STATUS = 'https://api.test/internal/status';

function setup() {
  const store = new Map();
  const sent = [];
  const server = { up: true, status: 200, body: { failedJobs: [], errorsLast5Minutes: 0 } };
  let time = new Date('2026-10-30T12:00:00Z');
  const env = {
    HEALTH_URL: HEALTH, STATUS_URL: STATUS, STATUS_TOKEN: 'secret',
    STATE: {
      get: async k => store.get(k) ?? null,
      put: async (k, v) => void store.set(k, v),
      delete: async k => void store.delete(k)
    }
  };
  const fetch = async (url, init) => {
    if (url === HEALTH) {
      if (!server.up) throw new Error('timeout');
      return { ok: true, json: async () => ({ status: 'UP' }) };
    }
    assert.equal(init.headers.Authorization, 'Bearer secret');
    return { ok: server.status === 200, status: server.status, json: async () => server.body };
  };
  const deps = { fetch, send: async (subject, text) => void sent.push({ subject, text }), sleep: async () => {}, now: () => time };
  return { env, deps, server, sent, store, run: () => watch(env, deps), later: ms => (time = new Date(time.getTime() + ms)) };
}

test('stays quiet while everything is fine', async () => {
  const { run, sent } = setup();
  await run();
  await run();
  assert.deepEqual(sent, []);
});

test('emails once when the server is down and once when it is back', async () => {
  const { run, sent, server } = setup();
  server.up = false;
  await run();
  await run();
  assert.deepEqual(sent.map(s => s.subject), ['DropZone server is down']);

  server.up = true;
  await run();
  await run();
  assert.deepEqual(sent.map(s => s.subject), ['DropZone server is down', 'DropZone server is back up']);
});

test('emails each new job failure once', async () => {
  const { run, sent, server } = setup();
  server.body.failedJobs = [{ job: 'daily-reminders', failedAt: '2026-10-30T11:00:00Z', error: 'boom' }];
  await run();
  await run();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, 'DropZone job failed: daily-reminders');
  assert.match(sent[0].text, /boom/);

  server.body.failedJobs = [{ job: 'daily-reminders', failedAt: '2026-10-30T12:00:00Z', error: 'again' }];
  await run();
  assert.equal(sent.length, 2);

  server.body.failedJobs = [];
  await run();
  assert.equal(sent.length, 2);
});

test('emails about server errors at most once an hour', async () => {
  const { run, sent, server, later } = setup();
  server.body.errorsLast5Minutes = 11;
  await run();
  later(30 * 60 * 1000);
  await run();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, 'DropZone server errors');

  later(31 * 60 * 1000);
  await run();
  assert.equal(sent.length, 2);

  server.body.errorsLast5Minutes = 10;
  later(2 * 60 * 60 * 1000);
  await run();
  assert.equal(sent.length, 2);
});

test('says once when the status check itself fails', async () => {
  const { run, sent, server } = setup();
  server.status = 401;
  await run();
  await run();
  assert.deepEqual(sent.map(s => s.subject), ['DropZone status check is not working']);
  assert.match(sent[0].text, /HTTP 401/);
});
