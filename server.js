require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const { createApp } = require('./app');

const corsOrigin = process.env.CORS_ORIGIN || '*';
let tickets = null;
let io;

const app = createApp({ getTickets: () => tickets, emit: (event, payload) => io.emit(event, payload), corsOrigin });
const server = http.createServer(app);
io = new Server(server, { cors: { origin: corsOrigin } });

io.on('connection', (socket) => {
  console.log('client connected:', socket.id);
  socket.on('disconnect', () => console.log('client disconnected:', socket.id));
});

async function connectDB() {
  if (!process.env.MONGODB_URI) { console.warn('MONGODB_URI is not set: data routes will answer 503.'); return; }
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    tickets = client.db(process.env.MONGODB_DB || 'triev_rsa').collection('tickets');
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
connectDB().then(() => server.listen(PORT, () => console.log(`Server listening on port ${PORT}`)));
