// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set. Set it in .env or your host provider (Render).');
  process.exit(1);
}

// Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*', // change to your client origin in production
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Connect to MongoDB
mongoose.set('strictQuery', false);
mongoose.connect(MONGODB_URI, {
  // options are inferred by mongoose 7+, keep minimal
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Basic REST endpoints
// Get last 100 messages (most recent last)
app.get('/messages', async (req, res) => {
  try {
    const msgs = await Message.find({})
      .sort({ createdAt: 1 }) // chronological
      .limit(100);
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Post a message (optional — Socket.IO will usually handle sending)
app.post('/messages', async (req, res) => {
  const { user = 'Anonymous', text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  try {
    const message = new Message({ user, text: text.trim() });
    await message.save();
    // emit via io if needed (we will set io below)
    io && io.emit('new_message', message);
    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Client asks to join global room (optional)
  socket.on('join_global', () => {
    socket.join('global');
  });

  // When a client sends a message
  socket.on('send_message', async (payload) => {
    // payload: { user, text }
    try {
      if (!payload || !payload.text || !payload.text.trim()) return;
      const msg = new Message({
        user: payload.user || 'Anonymous',
        text: payload.text.trim(),
      });
      await msg.save();

      // broadcast to all connected clients
      io.to('global').emit('new_message', msg); // if you use rooms
      io.emit('new_message', msg); // and also emit globally to be safe
    } catch (err) {
      console.error('Error saving message:', err);
      socket.emit('error', { message: 'Message save failed' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, reason);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
