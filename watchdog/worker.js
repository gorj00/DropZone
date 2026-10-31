const ERROR_LIMIT = 10;
const ERROR_ALERT_EVERY_MS = 60 * 60 * 1000;
const RETRY_MS = 20_000;

export async function watch(env, { fetch, send, sleep, now = () => new Date() }) {
  const healthy = (await up(env, fetch)) || (await sleep(RETRY_MS), await up(env, fetch));
  const downSince = await env.STATE.get('down');
  if (!healthy) {
    if (!downSince) {
      await send('DropZone server is down', `${env.HEALTH_URL} did not answer OK twice in a row (${now().toISOString()}).`);
      await env.STATE.put('down', now().toISOString());
    }
    return;
  }
  if (downSince) {
    await send('DropZone server is back up', `The server answers again. It was down since ${downSince}.`);
    await env.STATE.delete('down');
  }

  const status = await readStatus(env, fetch);
  const statusProblem = await env.STATE.get('status-problem');
  if (status.problem) {
    if (statusProblem !== status.problem) {
      await send('DropZone status check is not working', `${env.STATUS_URL}: ${status.problem}. Failed jobs and errors are not checked until this is fixed.`);
      await env.STATE.put('status-problem', status.problem);
    }
    return;
  }
  if (statusProblem) await env.STATE.delete('status-problem');

  const failed = status.body.failedJobs ?? [];
  const keys = failed.map(f => `${f.job}@${f.failedAt}`);
  const alerted = JSON.parse((await env.STATE.get('jobs')) ?? '[]');
  const fresh = failed.filter((f, i) => !alerted.includes(keys[i]));
  if (fresh.length) {
    await send(`DropZone job failed: ${fresh.map(f => f.job).join(', ')}`, fresh.map(f => `${f.job} failed at ${f.failedAt}: ${f.error ?? 'no message'}`).join('\n'));
  }
  if (keys.join() !== alerted.join()) await env.STATE.put('jobs', JSON.stringify(keys));

  const errors = status.body.errorsLast5Minutes ?? 0;
  const lastErrorAlert = await env.STATE.get('errors');
  if (errors > ERROR_LIMIT && (!lastErrorAlert || now() - new Date(lastErrorAlert) >= ERROR_ALERT_EVERY_MS)) {
    await send('DropZone server errors', `${errors} server errors in the last 5 minutes. Details are in the Cloud Run logs.`);
    await env.STATE.put('errors', now().toISOString());
  }
}

async function up(env, fetch) {
  try {
    const res = await fetch(env.HEALTH_URL, { signal: AbortSignal.timeout(10_000) });
    return res.ok && (await res.json()).status === 'UP';
  } catch {
    return false;
  }
}

async function readStatus(env, fetch) {
  try {
    const res = await fetch(env.STATUS_URL, { headers: { Authorization: `Bearer ${env.STATUS_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { problem: `HTTP ${res.status}` };
    return { body: await res.json() };
  } catch (e) {
    return { problem: String(e?.message ?? e) };
  }
}

async function email(env, subject, text) {
  const { EmailMessage } = await import('cloudflare:email');
  const raw = [
    `From: DropZone alerts <${env.FROM}>`,
    `To: ${env.TO}`,
    `Subject: ${subject}`,
    `Message-ID: <${crypto.randomUUID()}@${env.FROM.split('@')[1]}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    text
  ].join('\r\n');
  await env.ALERT.send(new EmailMessage(env.FROM, env.TO, raw));
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(watch(env, {
      fetch: (url, init) => fetch(url, init),
      send: (subject, text) => email(env, subject, text),
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
    }));
  }
};
