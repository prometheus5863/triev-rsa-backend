// The HTTP API, separated from the database and socket wiring so it can be
// tested with a fake collection.
const express = require('express');
const cors = require('cors');
const { ObjectId } = require('mongodb');

const STATUSES = ['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
const TICKET_FIELDS = ['ticketId', 'riderMobile', 'callingMobileNo', 'chassis', 'region', 'location', 'issueCategory', 'issueNote'];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => typeof obj[k] === 'string' && obj[k].trim()).map((k) => [k, obj[k].trim().slice(0, 500)]));

function createApp({ getTickets, emit = () => {}, corsOrigin = '*' }) {
  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '50kb' }));

  // Every data route needs the database; answer 503 instead of crashing if it is not up yet.
  const withDb = (handler) => async (req, res) => {
    const tickets = getTickets();
    if (!tickets) return res.status(503).json({ error: 'Database not connected' });
    try { await handler(req, res, tickets); }
    catch (err) { console.error(`${req.method} ${req.path} failed:`, err.message); res.status(500).json({ error: 'Internal error' }); }
  };

  app.get('/health', (req, res) => res.json({ ok: true, db: !!getTickets() }));

  // Create a ticket. Only known fields are stored; anything else in the body is dropped.
  app.post('/api/tickets', withDb(async (req, res, tickets) => {
    const fields = pick(req.body || {}, TICKET_FIELDS);
    if (!fields.chassis || !fields.issueCategory) return res.status(400).json({ error: 'chassis and issueCategory are required' });
    const ticket = { ...fields, status: 'Open', createdAt: new Date() };
    const result = await tickets.insertOne(ticket);
    const saved = { _id: result.insertedId, ...ticket };
    emit('ticket:assigned', saved);
    res.status(201).json(saved);
  }));

  app.get('/api/tickets/open', withDb(async (req, res, tickets) => {
    res.json(await tickets.find({ status: 'Open' }).toArray());
  }));

  app.put('/api/tickets/:id/status', withDb(async (req, res, tickets) => {
    const { id } = req.params, { status } = req.body || {};
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ticket ID' });
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    const result = await tickets.updateOne({ _id: new ObjectId(id) }, { $set: { status, updatedAt: new Date() } });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Ticket not found' });
    emit('ticket:status', { id, status });
    res.json({ message: 'Ticket status updated', id, status });
  }));

  // Technician GPS ping. Not stored yet: it is validated and broadcast to dashboards.
  app.put('/technician/location', (req, res) => {
    const { lat, lng, technicianId } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'lat and lng must be valid numbers' });
    }
    emit('technician:location', { technicianId: technicianId ? String(technicianId).slice(0, 64) : null, lat, lng, at: new Date() });
    res.json({ message: 'Location updated', location: { lat, lng } });
  });

  return app;
}

module.exports = { createApp, STATUSES, TICKET_FIELDS };
