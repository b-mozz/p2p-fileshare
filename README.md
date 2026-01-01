# P2P File Share

Browser-to-browser file sharing using WebRTC. Server only handles signaling - file data transfers directly between peers.

## How It Works

1. **Sender** selects a file → gets a 6-digit share code
2. **Receiver** enters the code → sees file info → accepts
3. **Transfer** happens directly browser-to-browser (P2P)
4. **Server** facilitates the handshake, never sees file data

## Quick Start

### Option 1: Using Go Directly

```bash
# Run the server
go run cmd/server/main.go

# Open http://localhost:8080
```

### Option 2: Using Docker

```bash
# Build the image
docker build -t peerdrop .

# Run the container
docker run -p 8080:8080 peerdrop

# Open http://localhost:8080
```

## Usage Guide

### Sharing Files Across Devices (Mac ↔ Android/iOS, Mac ↔ Windows)

**Prerequisites:**
- Both devices on the **same WiFi network**
- Docker installed (or Go if running directly)

**Steps:**

1. **On your computer:** Start the server

   **Using Docker (Recommended):**
   ```bash
   docker run -p 8080:8080 peerdrop
   ```

   **Or using Go:**
   ```bash
   go run cmd/server/main.go
   ```

2. **Find your computer's hostname:**
   ```bash
   hostname
   # Output: YourMacName.local (or YourComputerName.local)
   ```

3. **On computer browser:** Open `http://localhost:8080`
   - Click "Send a File"
   - Select your file
   - Click "Create Share Code"
   - Copy the 6-digit code

4. **On phone browser:** Open `http://YourComputerName.local:8080`
   - Click "Receive a File"
   - Enter the 6-digit code
   - Click "Accept"
   - File transfers directly P2P!
   - Download when complete

**Alternative:** Instead of `.local`, you can use your computer's IP address:
```bash
# Find IP
ipconfig getifaddr en0        # macOS
ip addr show | grep inet      # Linux

# Then on phone: http://192.168.x.x:8080
```

### Troubleshooting

**Connection Issues:**
- Ensure both devices are on the same WiFi
- Check Mac firewall settings (System Settings → Network → Firewall)
- Try `http://` not `https://`

**Transfer Fails:**
- Currently using STUN servers only (works best on same network)
- For different networks, TURN servers may be needed

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
