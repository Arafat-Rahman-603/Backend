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

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

// --- Middlewares ---
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:62',      // your React dev
    'https://chatterly-puce.vercel.app' // production frontend
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// --- MongoDB connection ---
mongoose.set('strictQuery', false);
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// --- REST endpoints ---
// Get last 100 messages
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

// Post a new message
app.post('/messages', async (req, res) => {
  const { user = 'Anonymous', text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

  try {
    const message = new Message({ user, text: text.trim() });
    await message.save();

    // Emit via Socket.IO
    io && io.emit('new_message', message);

    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Socket.IO setup ---
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:62',
      'https:https://chatterly-puce.vercel.app'
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization'],
  },
});

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('join_global', () => {
    socket.join('global');
  });

  socket.on('send_message', async (payload) => {
    try {
      if (!payload?.text?.trim()) return;

      const msg = new Message({
        user: payload.user || 'Anonymous',
        text: payload.text.trim(),
      });
      await msg.save();

      io.to('global').emit('new_message', msg); // room
      io.emit('new_message', msg);               // global
    } catch (err) {
      console.error('Error saving message:', err);
      socket.emit('error', { message: 'Message save failed' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, reason);
  });
});

// --- Start server ---
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
