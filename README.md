# TriEV RSA Backend

A small real-time backend for roadside-assistance (RSA) tickets: a REST API over MongoDB, with Socket.io events so a technician app or dashboard sees new tickets the moment they are created.

Built during my time at TriEV (Nov 2025 – Feb 2026). It is the server half of the flow that starts in [`triev-whatsapp-crm`](https://github.com/prometheus5863/triev-whatsapp-crm), where a rider reports a breakdown over WhatsApp.

```
WhatsApp bot ──POST /api/tickets──► this server ──► MongoDB (triev_rsa.tickets)
                                        │
                                        └─ socket.io: ticket:assigned ─► technician app / dashboard
```

## API

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/health` | – | `{ ok, db }` |
| `POST` | `/api/tickets` | `chassis`*, `issueCategory`*, `ticketId`, `riderMobile`, `callingMobileNo`, `region`, `location`, `issueNote` | `201` with the stored ticket (`status: "Open"`) |
| `GET` | `/api/tickets/open` | – | all tickets with `status: "Open"` |
| `PUT` | `/api/tickets/:id/status` | `status`: `Open`, `Assigned`, `In Progress`, `Resolved` or `Closed` | `200`, `400` for a bad id or status, `404` if missing |
| `PUT` | `/technician/location` | `lat`, `lng`, optional `technicianId` | `200`; broadcast only, not stored |

\* required. Fields outside this list are dropped, so a client cannot set `status` or anything else on create.

### Socket.io events

| Event | Sent when | Payload |
| --- | --- | --- |
| `ticket:assigned` | a ticket is created | the ticket |
| `ticket:status` | a status changes | `{ id, status }` |
| `technician:location` | a technician pings | `{ technicianId, lat, lng, at }` |

## Run it

```bash
npm ci
cp .env.example .env    # set MONGODB_URI
npm start
npm test                # 5 tests, no database needed (in-memory fake collection)
```

Without `MONGODB_URI` the server still starts; data routes answer `503` and `/health` reports `db: false`.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | database name (default `triev_rsa`) |
| `CORS_ORIGIN` | allowed origin for HTTP and sockets (default `*`) |
| `PORT` | default `3000` |

## Layout

- `app.js`: the routes, built by `createApp({ getTickets, emit })` so they can be tested without MongoDB or sockets.
- `server.js`: connects MongoDB and Socket.io and starts listening.

## Known limits

- No authentication: anyone who can reach the server can create or close tickets. Put it behind an API key or a gateway before real use.
- Technician locations are broadcast, not persisted.
- No pagination on `/api/tickets/open`.
