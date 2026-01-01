package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"p2p-fileshare/internal/models"
	"p2p-fileshare/internal/session"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	//we are not declaring buffer. uses default 4096 bytes
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// SignalingHandler handles WebSocket connections for signaling
type SignalingHandler struct {
	store *session.Store
}

// NewSignalingHandler creates a new signaling handler
func NewSignalingHandler(store *session.Store) *SignalingHandler {
	return &SignalingHandler{store: store}
}

// HandleWebSocket upgrades HTTP to WebSocket and handles signaling
func (sh *SignalingHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade failed:", err)
		return
	}
	defer conn.Close()

	log.Println("New WebSocket connection established")

	// Main message loop
	for {
		_, messageBytes, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			sh.handleDisconnect(conn)
			break
		}

		// Parse the message
		var msg models.SignalMessage
		if err := json.Unmarshal(messageBytes, &msg); err != nil {
			log.Println("Failed to parse message:", err)
			sh.sendError(conn, "", "Invalid message format")
			continue
		}

		// Route message based on type
		sh.routeMessage(conn, msg)
	}
}

// routeMessage handles different message types
func (sh *SignalingHandler) routeMessage(conn *websocket.Conn, msg models.SignalMessage) {
	switch msg.Type {
	case models.TypeCreate:
		sh.handleCreate(conn, msg)
	case models.TypeJoin:
		sh.handleJoin(conn, msg)
	case models.TypeAccept:
		sh.handleAccept(conn, msg)
	case models.TypeOffer, models.TypeAnswer, models.TypeIceCandidate:
		sh.handleRelay(conn, msg)
	case models.TypeClose:
		sh.handleClose(conn, msg)
	default:
		log.Println("Unknown message type:", msg.Type)
		sh.sendError(conn, msg.Code, "Unknown message type")
	}
}

// handleCreate processes a request to create a new sharing session
func (sh *SignalingHandler) handleCreate(conn *websocket.Conn, msg models.SignalMessage) {
	// Parse file metadata from payload
	var metadata models.FileMetadata
	if err := json.Unmarshal(msg.Payload, &metadata); err != nil {
		sh.sendError(conn, "", "Invalid file metadata")
		return
	}

	// Create session
	sess, err := sh.store.CreateSession(conn, metadata)
	if err != nil {
		sh.sendError(conn, "", "Failed to create session")
		return
	}

	log.Printf("Session created with code: %s for file: %s", sess.Code, metadata.Name)

	// Send back the code
	response := models.SignalMessage{
		Type:    models.TypeCreated,
		Code:    sess.Code,
		Payload: json.RawMessage(`{}`),
	}
	sh.sendMessage(conn, response)
}

// handleJoin processes a request to join an existing session
func (sh *SignalingHandler) handleJoin(conn *websocket.Conn, msg models.SignalMessage) {
	code := msg.Code
	if code == "" {
		sh.sendError(conn, "", "Code is required")
		return
	}

	// Join the session
	sess, err := sh.store.JoinSession(code, conn)
	if err != nil {
		sh.sendError(conn, code, err.Error())
		return
	}

	log.Printf("Receiver joined session: %s", code)

	// Send file metadata to receiver
	metadataBytes, _ := json.Marshal(sess.FileMetadata)
	joinedMsg := models.SignalMessage{
		Type:    models.TypeJoined,
		Code:    code,
		Payload: metadataBytes,
	}
	sh.sendMessage(conn, joinedMsg)

	// Notify sender that receiver joined
	notifyMsg := models.SignalMessage{
		Type:    models.TypeReceiverJoined,
		Code:    code,
		Payload: json.RawMessage(`{}`),
	}
	sh.sendMessage(sess.SenderConn, notifyMsg)
}

// handleAccept processes receiver's acceptance of the transfer
func (sh *SignalingHandler) handleAccept(conn *websocket.Conn, msg models.SignalMessage) {
	sess, exists := sh.store.GetSession(msg.Code)
	if !exists {
		sh.sendError(conn, msg.Code, "Session not found")
		return
	}

	// Forward accept to sender (sender will then create and send WebRTC offer)
	sh.sendMessage(sess.SenderConn, msg)
}

// handleRelay forwards WebRTC signaling messages to the peer
func (sh *SignalingHandler) handleRelay(conn *websocket.Conn, msg models.SignalMessage) {
	sess, exists := sh.store.GetSession(msg.Code)
	if !exists {
		sh.sendError(conn, msg.Code, "Session not found")
		return
	}

	// Determine which peer to send to
	var targetConn *websocket.Conn
	if conn == sess.SenderConn {
		targetConn = sess.ReceiverConn
	} else {
		targetConn = sess.SenderConn
	}

	if targetConn == nil {
		sh.sendError(conn, msg.Code, "Peer not connected")
		return
	}

	// Forward the message as-is
	sh.sendMessage(targetConn, msg)
}

// handleClose processes a session close request
func (sh *SignalingHandler) handleClose(conn *websocket.Conn, msg models.SignalMessage) {
	sess, exists := sh.store.GetSession(msg.Code)
	if !exists {
		return
	}

	// Notify the peer
	var targetConn *websocket.Conn
	if conn == sess.SenderConn {
		targetConn = sess.ReceiverConn
	} else {
		targetConn = sess.SenderConn
	}

	if targetConn != nil {
		closeMsg := models.SignalMessage{
			Type: models.TypeClose,
			Code: msg.Code,
		}
		sh.sendMessage(targetConn, closeMsg)
	}

	// Remove the session
	sh.store.RemoveSession(msg.Code)
	log.Printf("Session closed: %s", msg.Code)
}

// handleDisconnect cleans up when a connection is lost
func (sh *SignalingHandler) handleDisconnect(conn *websocket.Conn) {
	sess, exists := sh.store.GetSessionByConnection(conn)
	if !exists {
		return
	}

	// Notify the peer
	var targetConn *websocket.Conn
	if conn == sess.SenderConn {
		targetConn = sess.ReceiverConn
	} else {
		targetConn = sess.SenderConn
	}

	if targetConn != nil {
		closeMsg := models.SignalMessage{
			Type:  models.TypeClose,
			Code:  sess.Code,
			Error: "Peer disconnected",
		}
		sh.sendMessage(targetConn, closeMsg)
	}

	// Remove the session
	sh.store.RemoveSession(sess.Code)
	log.Printf("Session removed due to disconnect: %s", sess.Code)
}

// sendMessage sends a SignalMessage to a connection
func (sh *SignalingHandler) sendMessage(conn *websocket.Conn, msg models.SignalMessage) {
	if conn == nil {
		return
	}
	if err := conn.WriteJSON(msg); err != nil {
		log.Printf("Failed to send message: %v", err)
	}
}

// sendError sends an error message to a connection
func (sh *SignalingHandler) sendError(conn *websocket.Conn, code string, errMsg string) {
	sh.sendMessage(conn, models.NewErrorMessage(code, errMsg))
}
