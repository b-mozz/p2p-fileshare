package models

import (
	"encoding/json"
	"time"

	"github.com/gorilla/websocket"
)

// FileMetadata contains information about the file being shared
//we need to convert to json for browser(JS) to understand our server(Go)
type FileMetadata struct {
	Name string `json:"name"`//abc.jpeg
	Size int64  `json:"size"`//smth kiB
	Type string `json:"type"` // MIME type //image/jpeg
}

// Session represents an active file sharing session
type Session struct {
	Code         string          `json:"code"` 
	SenderConn   *websocket.Conn `json:"-"` // "-" excludes from JSON
	ReceiverConn *websocket.Conn `json:"-"`//same. Excluded from json
	FileMetadata FileMetadata    `json:"fileMetadata"`
	CreatedAt    time.Time       `json:"createdAt"`
}

// SignalMessage is the envelope for all WebSocket communication
// Type determines how Payload should be interpreted
type SignalMessage struct {
	Type    string          `json:"type"`    // Message type (see constants below)
	Code    string          `json:"code"`    // Share code (when applicable)
	Payload json.RawMessage `json:"payload"` // Flexible payload, parsed based on Type
	Error   string          `json:"error"`   // Error message (when applicable)
}

// Message types - sender actions
const (
	// Client -> Server: Sender creates a new session
	// Payload: FileMetadata
	TypeCreate = "create"

	// Server -> Client: Session created successfully
	// Payload: { "code": "123456" }
	TypeCreated = "created"

	// Client -> Server: Receiver joins with a code
	// Payload: none (code is in Code field)
	TypeJoin = "join"

	// Server -> Client: Receiver successfully joined
	// Payload: FileMetadata
	TypeJoined = "joined"

	// Server -> Client: Notify sender that receiver joined
	// Payload: none
	TypeReceiverJoined = "receiver-joined"

	// Client -> Server -> Client: Receiver accepts the transfer
	// Payload: none
	TypeAccept = "accept"

	// Client -> Server -> Client: WebRTC offer
	// Payload: RTCSessionDescription
	TypeOffer = "offer"

	// Client -> Server -> Client: WebRTC answer
	// Payload: RTCSessionDescription
	TypeAnswer = "answer"

	// Client -> Server -> Client: ICE candidate
	// Payload: RTCIceCandidate
	TypeIceCandidate = "ice-candidate"

	// Server -> Client: Error occurred
	// Payload: none (error is in Error field)
	TypeError = "error"

	// Client -> Server: Cancel/close session
	// Server -> Client: Notify peer of disconnection
	TypeClose = "close"
)

// Helper to create an error message
func NewErrorMessage(code string, errMsg string) SignalMessage {
	return SignalMessage{
		Type:  TypeError,
		Code:  code,
		Error: errMsg,
	}
}
