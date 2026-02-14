```typescript
import WebSocket, { WebSocketServer } from 'ws';

const server = new WebSocketServer({ port: 8080 });

server.on('connection', (socket: WebSocket) => {
  console.log('A new client connected!');

  // Broadcast incoming messages to all clients
  socket.on('message', (message: string) => {
    console.log(`Received: ${message}`);
    server.clients.forEach((client) => {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  // Handle client disconnection
  socket.on('close', () => {
    console.log('A client disconnected.');
  });
});

console.log('WebSocket server is running on ws://localhost:8080');
```