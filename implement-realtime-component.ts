```typescript
// server.ts

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

```html
<!-- client.html -->

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebSocket Chat</title>
</head>
<body>
    <h1>WebSocket Chat</h1>
    <input id="messageInput" type="text" placeholder="Type a message...">
    <button onclick="sendMessage()">Send</button>
    <ul id="messages"></ul>

    <script>
        const socket = new WebSocket('ws://localhost:8080');

        socket.onopen = () => {
            console.log('Connected to the server');
        };

        socket.onmessage = (event) => {
            const messages = document.getElementById('messages');
            const messageItem = document.createElement('li');
            messageItem.textContent = event.data;
            messages.appendChild(messageItem);
        };

        socket.onclose = () => {
            console.log('Disconnected from the server');
        };

        function sendMessage() {
            const input = document.getElementById('messageInput');
            socket.send(input.value);
            input.value = '';
        }
    </script>
</body>
</html>
```

```json
// tsconfig.json

{
  "compilerOptions": {
    "target": "ES6",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist"
  },
  "include": ["server.ts"],
  "exclude": ["node_modules"]
}
```

```bash
# Install TypeScript and necessary types
npm install typescript @types/ws
```