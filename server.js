const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Pool of users waiting to be matched
const userPool = {
  male: { male: [], female: [], any: [] },
  female: { male: [], female: [], any: [] }
};

// Active connections
const activeConnections = {};

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  socket.on('join', (data) => {
    const { myGender, targetGender } = data;
    socket.myGender = myGender;
    socket.targetGender = targetGender;
    
    // Add to user pool
    userPool[myGender][targetGender].push(socket.id);
    console.log(`User ${socket.id} (${myGender}) looking for ${targetGender}`);
    
    // Try to find a match
    findMatch(socket);
  });
  
  socket.on('offer', (data) => {
    io.to(data.to).emit('offer', {
      from: socket.id,
      offer: data.offer
    });
  });
  
  socket.on('answer', (data) => {
    io.to(data.to).emit('answer', {
      from: socket.id,
      answer: data.answer
    });
  });
  
  socket.on('ice-candidate', (data) => {
    io.to(data.to).emit('ice-candidate', data.candidate);
  });
  
  socket.on('message', (data) => {
    if (activeConnections[socket.id]) {
      const partnerId = activeConnections[socket.id];
      io.to(partnerId).emit('message', data);
    }
  });
  
  socket.on('leave', () => {
    handleDisconnect(socket, 'Your partner has left the chat');
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    handleDisconnect(socket, 'Your partner has disconnected');
  });
});

function findMatch(socket) {
  const { myGender, targetGender } = socket;
  
  // Check reciprocal pools
  const reciprocalPool = userPool[targetGender][myGender];
  const anyPool = userPool[targetGender]['any'];
  const potentialMatches = [...reciprocalPool, ...anyPool];
  
  // Remove current user from all pools
  removeFromPool(socket.id);
  
  if (potentialMatches.length > 0) {
    const partnerId = potentialMatches.find(id => id !== socket.id);
    
    if (partnerId) {
      // Remove partner from all pools
      removeFromPool(partnerId);
      
      // Create connection
      activeConnections[socket.id] = partnerId;
      activeConnections[partnerId] = socket.id;
      
      console.log(`Matched ${socket.id} with ${partnerId}`);
      
      // Notify both users
      io.to(socket.id).emit('matched', {
        partnerId: partnerId,
        isInitiator: true
      });
      
      io.to(partnerId).emit('matched', {
        partnerId: socket.id,
        isInitiator: false
      });
      
      return;
    }
  }
  
  // No match found, add back to pool
  userPool[myGender][targetGender].push(socket.id);
  io.to(socket.id).emit('status', 'Waiting for a match...');
}

function handleDisconnect(socket, message) {
  const partnerId = activeConnections[socket.id];
  if (partnerId) {
    io.to(partnerId).emit('disconnected', message);
    delete activeConnections[partnerId];
  }
  removeFromPool(socket.id);
  delete activeConnections[socket.id];
}

function removeFromPool(socketId) {
  for (const myGender in userPool) {
    for (const targetGender in userPool[myGender]) {
      const index = userPool[myGender][targetGender].indexOf(socketId);
      if (index !== -1) {
        userPool[myGender][targetGender].splice(index, 1);
      }
    }
  }
}

// Glitch requires process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
