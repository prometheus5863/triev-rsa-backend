const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db, ticketsCollection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db('triev_rsa');
    ticketsCollection = db.collection('tickets');
    console.log('Connected to MongoDB Atlas');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}
connectDB();

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Endpoint 1: POST /api/tickets (Inserts a new ticket)
app.post('/api/tickets', async (req, res) => {
  try {
    const newTicket = {
      ...req.body,
      status: 'Open',
      createdAt: new Date(),
    };
    
    const result = await ticketsCollection.insertOne(newTicket);
    const insertedTicket = { _id: result.insertedId, ...newTicket };

    // Emit event to connected clients
    io.emit('ticket:assigned', insertedTicket);

    res.status(201).json(insertedTicket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Endpoint 2: GET /api/tickets/open (Fetches all tickets where status is 'Open')
app.get('/api/tickets/open', async (req, res) => {
  try {
    const openTickets = await ticketsCollection.find({ status: 'Open' }).toArray();
    res.status(200).json(openTickets);
  } catch (error) {
    console.error('Error fetching open tickets:', error);
    res.status(500).json({ error: 'Failed to fetch open tickets' });
  }
});

// Endpoint 3: PUT /api/tickets/:id/status (Updates a ticket's status)
app.put('/api/tickets/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const result = await ticketsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Emit an event for status change if needed later, e.g., io.emit('ticket:status_change', { id, status });

    res.status(200).json({ message: 'Ticket status updated successfully' });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

// Endpoint 4: PUT /technician/location (Updates the tech's GPS coordinates)
app.put('/technician/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    // In a real app we'd update a technicians collection.
    // Here we'll just log it or handle it as required.
    // We could emit this location via socket if needed.
    res.status(200).json({ message: 'Location updated successfully', location: { lat, lng } });
  } catch (error) {
    console.error('Error updating technician location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
