const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { ObjectId } = require('mongodb');
const { createApp } = require('../app');

// Minimal in-memory stand-in for the MongoDB collection.
function fakeCollection() {
  const rows = [];
  return {
    rows,
    async insertOne(doc) { const _id = new ObjectId(); rows.push({ _id, ...doc }); return { insertedId: _id }; },
    find(q) { return { toArray: async () => rows.filter((r) => r.status === q.status) }; },
    async updateOne(q, u) { const r = rows.find((x) => x._id.equals(q._id)); if (r) Object.assign(r, u.$set); return { matchedCount: r ? 1 : 0 }; },
  };
}

async function withServer(opts, fn) {
  const server = http.createServer(createApp(opts));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try { await fn(call); } finally { server.close(); }
}

test('answers 503 while the database is down', async () => {
  await withServer({ getTickets: () => null }, async (call) => {
    assert.strictEqual((await call('GET', '/api/tickets/open')).status, 503);
    assert.deepStrictEqual((await call('GET', '/health')).body, { ok: true, db: false });
  });
});

test('creates a ticket, drops unknown fields, emits an event', async () => {
  const col = fakeCollection(), events = [];
  await withServer({ getTickets: () => col, emit: (e, p) => events.push([e, p]) }, async (call) => {
    const res = await call('POST', '/api/tickets', { chassis: ' EV-1 ', issueCategory: 'Battery', status: 'Closed', isAdmin: true });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, 'Open');
    assert.strictEqual(res.body.chassis, 'EV-1');
    assert.strictEqual('isAdmin' in res.body, false);
    assert.strictEqual(events[0][0], 'ticket:assigned');
    assert.strictEqual((await call('GET', '/api/tickets/open')).body.length, 1);
  });
});

test('rejects a ticket with no chassis', async () => {
  await withServer({ getTickets: fakeCollection }, async (call) => {
    assert.strictEqual((await call('POST', '/api/tickets', { issueCategory: 'Motor' })).status, 400);
  });
});

test('status update validates id and status, then updates', async () => {
  const col = fakeCollection();
  await withServer({ getTickets: () => col }, async (call) => {
    const { body } = await call('POST', '/api/tickets', { chassis: 'EV-2', issueCategory: 'Tires' });
    assert.strictEqual((await call('PUT', '/api/tickets/nope/status', { status: 'Resolved' })).status, 400);
    assert.strictEqual((await call('PUT', `/api/tickets/${body._id}/status`, { status: 'Exploded' })).status, 400);
    assert.strictEqual((await call('PUT', `/api/tickets/${new ObjectId()}/status`, { status: 'Resolved' })).status, 404);
    assert.strictEqual((await call('PUT', `/api/tickets/${body._id}/status`, { status: 'Resolved' })).status, 200);
    assert.strictEqual((await call('GET', '/api/tickets/open')).body.length, 0);
  });
});

test('technician location needs real coordinates', async () => {
  const events = [];
  await withServer({ getTickets: () => null, emit: (e, p) => events.push(e) }, async (call) => {
    assert.strictEqual((await call('PUT', '/technician/location', { lat: 'x', lng: 1 })).status, 400);
    assert.strictEqual((await call('PUT', '/technician/location', { lat: 25.26, lng: 82.99 })).status, 200);
    assert.deepStrictEqual(events, ['technician:location']);
  });
});
