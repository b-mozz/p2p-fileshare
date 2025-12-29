package session

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"

	"p2p-fileshare/internal/models"

	"github.com/gorilla/websocket"
)

// Store manages all active sharing sessions
type Store struct {
	sessions map[string]*models.Session
	mutex    sync.RWMutex
}

// NewStore creates a new session store
func NewStore() *Store {
	return &Store{
		sessions: make(map[string]*models.Session),
	}
}

// generateCode creates a random 6-digit code
func (s *Store) generateCode() (string, error) {
	// Generate a random number between 100000 and 999999
	max := big.NewInt(900000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	code := fmt.Sprintf("%06d", n.Int64()+100000)
	return code, nil
}

// CreateSession creates a new session with the sender's connection
func (s *Store) CreateSession(senderConn *websocket.Conn, metadata models.FileMetadata) (*models.Session, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Generate unique code (retry if collision)
	var code string
	var err error
	for i := 0; i < 10; i++ {
		code, err = s.generateCode()
		if err != nil {
			return nil, fmt.Errorf("failed to generate code: %w", err)
		}
		if _, exists := s.sessions[code]; !exists {
			break
		}
	}

	session := &models.Session{
		Code:         code,
		SenderConn:   senderConn,
		ReceiverConn: nil,
		FileMetadata: metadata,
		CreatedAt:    time.Now(),
	}

	s.sessions[code] = session
	return session, nil
}

// GetSession retrieves a session by code
func (s *Store) GetSession(code string) (*models.Session, bool) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	session, exists := s.sessions[code]
	return session, exists
}

// JoinSession adds the receiver to an existing session
func (s *Store) JoinSession(code string, receiverConn *websocket.Conn) (*models.Session, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	session, exists := s.sessions[code]
	if !exists {
		return nil, fmt.Errorf("session not found")
	}

	if session.ReceiverConn != nil {
		return nil, fmt.Errorf("session already has a receiver")
	}

	session.ReceiverConn = receiverConn
	return session, nil
}

// RemoveSession deletes a session
func (s *Store) RemoveSession(code string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	delete(s.sessions, code)
}

// GetSessionByConnection finds a session by either sender or receiver connection
func (s *Store) GetSessionByConnection(conn *websocket.Conn) (*models.Session, bool) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	for _, session := range s.sessions {
		if session.SenderConn == conn || session.ReceiverConn == conn {
			return session, true
		}
	}
	return nil, false
}

// CleanupOldSessions removes sessions older than the given duration
// Call this periodically to prevent memory leaks
func (s *Store) CleanupOldSessions(maxAge time.Duration) int {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	cutoff := time.Now().Add(-maxAge)
	removed := 0

	for code, session := range s.sessions {
		if session.CreatedAt.Before(cutoff) {
			delete(s.sessions, code)
			removed++
		}
	}

	return removed
}
