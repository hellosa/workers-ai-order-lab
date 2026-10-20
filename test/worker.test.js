import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
const body = { order: '订单A，实付619元，送达11天，屏幕破裂。', policy: '30天内退款。' };
function request(data = body, token = 'test-secret', extra = {}) {
  return new Request('https://lab.example/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...extra }, body: JSON.stringify(data) });
}
test('authentication fails closed without making AI calls', async () => {
  const AI = { run() { assert.fail('AI must not run'); } };
  assert.equal((await worker.fetch(request(), { AI })).status, 503);
  assert.equal((await worker.fetch(request(body, 'wrong'), { AI, LAB_PASSWORD: 'test-secret' })).status, 401);
  assert.equal((await worker.fetch(request(body, 'test-secret', { Origin: 'https://attacker.example' }), { AI, LAB_PASSWORD: 'test-secret' })).status, 403);
});
test('rejects invalid and oversized input before inference', async () => {
  const env = { LAB_PASSWORD: 'test-secret', AI: { run() { assert.fail('AI must not run'); } } };
  for (const value of [null, {}, { ...body, order: ' ' }, { ...body, order: 'x'.repeat(6001) }]) {
    assert.equal((await worker.fetch(request(value), env)).status, 400);
  }
  assert.equal((await worker.fetch(request({ ...body, order: 'x'.repeat(25000) }), env)).status, 413);
});
test('sends identical facts, rules and questions to both models, preserving unknowns', async () => {
  const calls = [];
  const env = { LAB_PASSWORD: 'test-secret', AI: { async run(model, input) {
    calls.push({ model, input });
    return calls.length === 1 ? { answers: { total_paid: { value: 619, guess: 999 }, repair_cost: { value: null, guess: 200 } }, usage: { input_tokens: 10 } } : { answers: { resolution: { choice: 'refund', probabilities: { refund: 0.8, repair: 0.1, manual_review: 0.1 } } }, usage: { input_tokens: 20 } };
  } } };
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(call => call.model), ['@cf/cloudflare/clairic', '@cf/cloudflare/clef', 'typesafe/jev']);
  const state = JSON.parse(calls[1].input.state);
  assert.deepEqual(state.facts, { total_paid: 619, repair_cost: null });
  assert.equal(state.policy, body.policy);
  assert.equal(calls[1].input.state, calls[2].input.state);
  assert.deepEqual(calls[1].input.questions, calls[2].input.questions);
  const result = await response.json();
  for (const name of ['clef', 'jev']) {
    assert.equal(result.decisions[name].response.answers.resolution.choice, 'refund');
    assert.equal(result.decisions[name].response.usage.input_tokens, 20);
    assert.equal(typeof result.decisions[name].elapsed_ms, 'number');
  }
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('upstream error details are not exposed', async () => {
  const response = await worker.fetch(request(), { LAB_PASSWORD: 'test-secret', AI: { run() { throw new Error('secret diagnostic'); } } });
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('secret diagnostic'), false);
});
test('truncated extraction never reaches decision stage', async () => {
  let calls = 0;
  const response = await worker.fetch(request(), { LAB_PASSWORD: 'test-secret', AI: { async run() { calls++; return { answers: {}, truncated: true }; } } });
  assert.equal(response.status, 502); assert.equal(calls, 1);
});

test('runs decisions concurrently and retains Clef when Jev fails', async () => {
  let release;
  const bothStarted = new Promise(resolve => { release = resolve; });
  const response = await worker.fetch(request(), { LAB_PASSWORD: 'test-secret', AI: { async run(model) {
    if (model.includes('clairic')) return { answers: { total_paid: { value: 619 } } };
    if (model === 'typesafe/jev') { release(); throw new Error('sensitive upstream failure'); }
    await bothStarted;
    return { answers: { resolution: { choice: 'refund', probabilities: { refund: 1 } } }, usage: { input_tokens: 13, output_tokens: 0 } };
  } } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.decisions.clef.response.answers.resolution.choice, 'refund');
  assert.ok(result.decisions.jev.error);
  assert.ok(!JSON.stringify(result).includes('sensitive upstream failure'));
});
test('preserves Jev when Clef returns an incomplete answer and never invents usage', async () => {
  const response = await worker.fetch(request(), { LAB_PASSWORD: 'test-secret', AI: { async run(model) {
    if (model.includes('clairic')) return { answers: {} };
    if (model.includes('clef')) return { answers: {} };
    return { answers: { resolution: { choice: 'manual_review', probabilities: { manual_review: 1 } } } };
  } } });
  const result = await response.json();
  assert.ok(result.decisions.clef.error);
  assert.equal(result.decisions.jev.response.answers.resolution.choice, 'manual_review');
  assert.equal(result.decisions.jev.response.usage, undefined);
});

test('reports billing block without exposing raw upstream diagnostics', async () => {
  const response = await worker.fetch(request(), { LAB_PASSWORD: 'test-secret', AI: { async run(model) {
    if (model.includes('clairic')) return { answers: {} };
    throw new Error('Insufficient balance; add money to your gateway. private diagnostic');
  } } });
  const result = await response.json();
  assert.match(result.decisions.jev.error, /Gateway/);
  assert.ok(!JSON.stringify(result).includes('private diagnostic'));
  assert.equal(result.decisions.jev.response, undefined);
});
