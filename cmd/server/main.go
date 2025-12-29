package main

import (
	"log"
	"net/http"

	"p2p-fileshare/internal/handlers"
	"p2p-fileshare/internal/session"

	"github.com/gorilla/mux"
)

func main() {
	// Initialize session store
	store := session.NewStore()

	// Initialize handlers
	signalingHandler := handlers.NewSignalingHandler(store)

	r := mux.NewRouter()

	// CORS middleware
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	// WebSocket endpoint for signaling
	r.HandleFunc("/ws", signalingHandler.HandleWebSocket)

	// Serve static files
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/",
		http.FileServer(http.Dir("./web/static/"))))

	// Serve index.html for root
	r.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./web/index.html")
	})

	log.Println("P2P File Share server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
