# P2P File Share

Browser-to-browser file sharing using WebRTC. Server only handles signaling - file data transfers directly between peers.

## How It Works

1. **Sender** selects a file → gets a 6-digit share code
2. **Receiver** enters the code → sees file info → accepts
3. **Transfer** happens directly browser-to-browser (P2P)
4. **Server** facilitates the handshake, never sees file data

## Quick Start

```bash
# Run the server
go run cmd/server/main.go

# Open http://localhost:8080
```

## Architecture

```
┌─────────┐     WebSocket      ┌─────────┐     WebSocket      ┌─────────┐
│ Sender  │◄──────────────────►│   Go    │◄──────────────────►│Receiver │
│ Browser │   (signaling)      │ Server  │   (signaling)      │ Browser │
└────┬────┘                    └─────────┘                    └────┬────┘
     │                                                              │
     │              RTCDataChannel (file data)                      │
     └──────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Backend**: Go with gorilla/websocket, gorilla/mux
- **Frontend**: Vanilla JavaScript, WebRTC API
- **Signaling**: WebSocket for offer/answer/ICE candidate exchange

## Project Structure

```
p2p-fileshare/
├── cmd/server/main.go        # Entry point
├── internal/
│   ├── handlers/
│   │   └── signaling.go      # WebSocket handler
│   ├── models/
│   │   └── session.go        # Data structures
│   └── session/
│       └── store.go          # Session management
└── web/
    ├── index.html
    └── static/
        ├── app.js            # Client-side logic
        └── style.css
```

## Signaling Protocol

Messages are JSON with this structure:
```json
{
    "type": "create|join|offer|answer|ice-candidate|...",
    "code": "123456",
    "payload": { ... }
}
```

See `internal/models/session.go` for all message types.

## Status

🚧 Learning project in progress

## License

MIT
