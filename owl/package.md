# Package Configuration

Build and dependency configuration for the dashboard.

## package.json

```json
{
  "name": "agentchat-dashboard",
  "version": "1.0.0",
  "description": "Real-time web dashboard for AgentChat monitoring",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:web\"",
    "dev:server": "nodemon server/index.js",
    "dev:web": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "tweetnacl": "^1.0.3",
    "tweetnacl-util": "^0.15.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "concurrently": "^8.2.2",
    "nodemon": "^3.0.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "vite": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## vite.config.js

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'web',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      },
      '/api': {
        target: 'http://localhost:3000'
      }
    }
  }
});
```

## Directory Structure After Build

```
agentchat-dashboard/
├── dist/                  # Built frontend (generated)
│   ├── index.html
│   └── assets/
│       ├── index-[hash].js
│       └── index-[hash].css
├── server/
│   ├── index.js          # Entry point
│   ├── agentchat.js      # AgentChat client
│   ├── bridge.js         # WebSocket bridge
│   └── state.js          # State management
├── web/
│   ├── index.html
│   └── src/
│       └── ...
├── owl/                   # Specs
├── .dashboard-identity.json  # Generated on first run
├── package.json
├── vite.config.js
└── README.md
```

## Scripts

### npm start
Production mode:
1. Serves built frontend from `dist/`
2. Connects to AgentChat server
3. Runs WebSocket bridge

### npm run dev
Development mode:
1. Vite dev server on :5173 with HMR
2. Nodemon watches server changes
3. Proxy forwards /ws and /api to :3000

### npm run build
1. Runs Vite build
2. Outputs to `dist/`
3. Ready for `npm start`

## Environment

Create `.env` for local overrides:
```
AGENTCHAT_URL=wss://agentchat-server.fly.dev
PORT=3000
NODE_ENV=development
```

## Installation

```bash
cd agentchat-dashboard
npm install
npm run build
npm start
```

Open http://localhost:3000

## Development

```bash
npm run dev
```

Open http://localhost:5173 (Vite dev server with HMR)
