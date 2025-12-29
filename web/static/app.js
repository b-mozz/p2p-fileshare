// ============================================
// P2P File Share - Client Application
// ============================================

// ============================================
// GLOBAL STATE
// ============================================

var ws = null;                    // WebSocket connection
var currentCode = null;           // Active share code
var selectedFile = null;          // File selected for sending
var peerConnection = null;        // WebRTC peer connection
var dataChannel = null;           // WebRTC data channel for file transfer

// WebRTC configuration
var rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('P2P File Share initialized');
    setupEventListeners();
    connectWebSocket();
});

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = protocol + '//' + window.location.host + '/ws';
    
    console.log('Connecting to WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = function() {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
    };

    ws.onclose = function() {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        // Attempt reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };

    ws.onmessage = function(event) {
        var msg = JSON.parse(event.data);
        console.log('Received:', msg.type, msg);
        handleMessage(msg);
    };
}

function sendMessage(type, code, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showNotification('Not connected to server', 'error');
        return;
    }

    var msg = {
        type: type,
        code: code || '',
        payload: payload || {}
    };

    console.log('Sending:', type, msg);
    ws.send(JSON.stringify(msg));
}

// ============================================
// MESSAGE HANDLING
// ============================================

function handleMessage(msg) {
    switch (msg.type) {
        case 'created':
            handleSessionCreated(msg);
            break;
        case 'joined':
            handleJoined(msg);
            break;
        case 'receiver-joined':
            handleReceiverJoined(msg);
            break;
        case 'accept':
            handleAccepted(msg);
            break;
        case 'offer':
            handleOffer(msg);
            break;
        case 'answer':
            handleAnswer(msg);
            break;
        case 'ice-candidate':
            handleIceCandidate(msg);
            break;
        case 'close':
            handleClose(msg);
            break;
        case 'error':
            showNotification(msg.error, 'error');
            break;
        default:
            console.log('Unknown message type:', msg.type);
    }
}

// ============================================
// SENDER FLOW
// ============================================

function createSession() {
    if (!selectedFile) {
        showNotification('Please select a file first', 'error');
        return;
    }

    var metadata = {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type || 'application/octet-stream'
    };

    sendMessage('create', '', metadata);
}

function handleSessionCreated(msg) {
    currentCode = msg.code;
    document.getElementById('shareCode').textContent = msg.code;
    
    // Show waiting state
    hide('fileReady');
    show('waitingState');
}

function handleReceiverJoined(msg) {
    console.log('Receiver joined, waiting for them to accept...');
    showNotification('Receiver connected! Waiting for them to accept...', 'success');
}

function handleAccepted(msg) {
    console.log('Receiver accepted, starting WebRTC connection...');
    showNotification('Transfer accepted! Establishing connection...', 'success');
    
    // Show transfer state
    hide('waitingState');
    show('senderTransferState');
    
    // Sender creates the WebRTC offer
    startWebRTCConnection(true);
}

// ============================================
// RECEIVER FLOW
// ============================================

function joinSession() {
    var codeInput = document.getElementById('codeInput');
    var code = codeInput.value.trim();
    
    if (code.length !== 6) {
        showNotification('Please enter a 6-digit code', 'error');
        return;
    }

    currentCode = code;
    sendMessage('join', code, {});
}

function handleJoined(msg) {
    currentCode = msg.code;
    var metadata = msg.payload;
    
    // Display file offer
    document.getElementById('offerFileName').textContent = metadata.name;
    document.getElementById('offerFileSize').textContent = formatFileSize(metadata.size);
    
    // Store metadata for later
    window.incomingFileMetadata = metadata;
    
    hide('codeEntry');
    show('fileOffer');
}

function acceptTransfer() {
    sendMessage('accept', currentCode, {});
    
    hide('fileOffer');
    show('receiverTransferState');
}

function declineTransfer() {
    sendMessage('close', currentCode, {});
    resetToModeSelection();
}

// ============================================
// WEBRTC CONNECTION
// ============================================

function startWebRTCConnection(isInitiator) {
    console.log('Starting WebRTC connection, isInitiator:', isInitiator);
    
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    // Handle ICE candidates
    peerConnection.onicecandidate = function(event) {
        if (event.candidate) {
            sendMessage('ice-candidate', currentCode, event.candidate);
        }
    };

    peerConnection.oniceconnectionstatechange = function() {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
    };

    if (isInitiator) {
        // Sender creates data channel
        dataChannel = peerConnection.createDataChannel('fileTransfer', {
            ordered: true
        });
        setupDataChannel(dataChannel);
        
        // Create and send offer
        peerConnection.createOffer()
            .then(function(offer) {
                return peerConnection.setLocalDescription(offer);
            })
            .then(function() {
                sendMessage('offer', currentCode, peerConnection.localDescription);
            })
            .catch(function(error) {
                console.error('Error creating offer:', error);
                showNotification('Failed to create connection', 'error');
            });
    } else {
        // Receiver waits for data channel
        peerConnection.ondatachannel = function(event) {
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
        };
    }
}

function handleOffer(msg) {
    console.log('Received offer');
    
    // Receiver starts WebRTC and handles offer
    startWebRTCConnection(false);
    
    peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload))
        .then(function() {
            return peerConnection.createAnswer();
        })
        .then(function(answer) {
            return peerConnection.setLocalDescription(answer);
        })
        .then(function() {
            sendMessage('answer', currentCode, peerConnection.localDescription);
        })
        .catch(function(error) {
            console.error('Error handling offer:', error);
            showNotification('Failed to establish connection', 'error');
        });
}

function handleAnswer(msg) {
    console.log('Received answer');
    
    peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload))
        .catch(function(error) {
            console.error('Error setting remote description:', error);
        });
}

function handleIceCandidate(msg) {
    if (peerConnection && msg.payload) {
        peerConnection.addIceCandidate(new RTCIceCandidate(msg.payload))
            .catch(function(error) {
                console.error('Error adding ICE candidate:', error);
            });
    }
}

// ============================================
// DATA CHANNEL & FILE TRANSFER
// ============================================

function setupDataChannel(channel) {
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = function() {
        console.log('Data channel open');
        showNotification('Connection established!', 'success');
        
        // If sender, start sending file
        if (selectedFile) {
            sendFile();
        }
    };

    channel.onclose = function() {
        console.log('Data channel closed');
    };

    channel.onerror = function(error) {
        console.error('Data channel error:', error);
        showNotification('Transfer error', 'error');
    };

    channel.onmessage = function(event) {
        receiveData(event.data);
    };
}

// File sending
var CHUNK_SIZE = 16384; // 16KB chunks
var sendProgress = 0;

function sendFile() {
    var file = selectedFile;
    var offset = 0;
    var fileReader = new FileReader();
    
    // First send metadata as JSON
    dataChannel.send(JSON.stringify({
        type: 'metadata',
        name: file.name,
        size: file.size,
        mimeType: file.type
    }));

    fileReader.onload = function(e) {
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;
        
        // Update progress
        sendProgress = (offset / file.size) * 100;
        updateSenderProgress(sendProgress);
        
        if (offset < file.size) {
            readNextChunk();
        } else {
            // Send completion message
            dataChannel.send(JSON.stringify({ type: 'complete' }));
            showSenderComplete();
        }
    };

    function readNextChunk() {
        var slice = file.slice(offset, offset + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    }

    readNextChunk();
}

// File receiving
var receivedChunks = [];
var receivedSize = 0;
var incomingMetadata = null;

function receiveData(data) {
    // Check if it's a string (JSON message) or binary (file chunk)
    if (typeof data === 'string') {
        var msg = JSON.parse(data);
        
        if (msg.type === 'metadata') {
            incomingMetadata = msg;
            receivedChunks = [];
            receivedSize = 0;
            console.log('Receiving file:', msg.name, formatFileSize(msg.size));
        } else if (msg.type === 'complete') {
            completeReceive();
        }
    } else {
        // Binary chunk
        receivedChunks.push(data);
        receivedSize += data.byteLength;
        
        if (incomingMetadata) {
            var progress = (receivedSize / incomingMetadata.size) * 100;
            updateReceiverProgress(progress);
        }
    }
}

function completeReceive() {
    console.log('File transfer complete');
    
    // Combine chunks into blob
    var blob = new Blob(receivedChunks, { type: incomingMetadata.mimeType });
    var url = URL.createObjectURL(blob);
    
    // Set up download link
    var downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.href = url;
    downloadBtn.download = incomingMetadata.name;
    
    showReceiverComplete();
}

// ============================================
// UI UPDATES
// ============================================

function updateSenderProgress(percent) {
    document.getElementById('senderProgressFill').style.width = percent + '%';
    document.getElementById('senderProgressText').textContent = Math.round(percent) + '%';
}

function updateReceiverProgress(percent) {
    document.getElementById('receiverProgressFill').style.width = percent + '%';
    document.getElementById('receiverProgressText').textContent = Math.round(percent) + '%';
}

function showSenderComplete() {
    hide('senderTransferState');
    show('senderCompleteState');
}

function showReceiverComplete() {
    hide('receiverTransferState');
    show('receiverCompleteState');
}

function updateConnectionStatus(connected) {
    var status = document.getElementById('connectionStatus');
    var dot = status.querySelector('.status-dot');
    var text = status.querySelector('.status-text');
    
    if (connected) {
        dot.classList.add('connected');
        text.textContent = 'Connected';
    } else {
        dot.classList.remove('connected');
        text.textContent = 'Disconnected';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Mode selection
    document.getElementById('sendMode').addEventListener('click', function() {
        hide('modeSelection');
        show('sendSection');
    });

    document.getElementById('receiveMode').addEventListener('click', function() {
        hide('modeSelection');
        show('receiveSection');
    });

    // Back buttons
    document.getElementById('backFromSend').addEventListener('click', function() {
        resetToModeSelection();
    });

    document.getElementById('backFromReceive').addEventListener('click', function() {
        resetToModeSelection();
    });

    // File selection
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var browseBtn = document.getElementById('browseBtn');

    browseBtn.addEventListener('click', function() {
        fileInput.click();
    });

    fileInput.addEventListener('change', function() {
        if (fileInput.files.length > 0) {
            selectFile(fileInput.files[0]);
        }
    });

    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            selectFile(e.dataTransfer.files[0]);
        }
    });

    // Clear file button
    document.getElementById('clearFile').addEventListener('click', function() {
        selectedFile = null;
        fileInput.value = '';
        hide('fileReady');
        show('dropZone');
    });

    // Create share button
    document.getElementById('createShareBtn').addEventListener('click', createSession);

    // Copy code button
    document.getElementById('copyCodeBtn').addEventListener('click', function() {
        var code = document.getElementById('shareCode').textContent;
        navigator.clipboard.writeText(code).then(function() {
            showNotification('Code copied!', 'success');
        });
    });

    // Join button
    document.getElementById('joinBtn').addEventListener('click', joinSession);
    
    // Code input - allow Enter key
    document.getElementById('codeInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinSession();
        }
    });

    // Accept/Decline buttons
    document.getElementById('acceptBtn').addEventListener('click', acceptTransfer);
    document.getElementById('declineBtn').addEventListener('click', declineTransfer);

    // Send/Receive another buttons
    document.getElementById('sendAnotherBtn').addEventListener('click', function() {
        resetSendSection();
    });

    document.getElementById('receiveAnotherBtn').addEventListener('click', function() {
        resetReceiveSection();
    });

    // Notification close
    document.getElementById('notificationClose').addEventListener('click', function() {
        hide('notification');
    });
}

// ============================================
// FILE HANDLING
// ============================================

function selectFile(file) {
    selectedFile = file;
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFileSize').textContent = formatFileSize(file.size);
    
    hide('dropZone');
    show('fileReady');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= sizes.length) i = sizes.length - 1;
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function show(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function hide(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function showNotification(message, type) {
    var notification = document.getElementById('notification');
    var text = document.getElementById('notificationText');
    
    text.textContent = message;
    notification.className = 'notification ' + (type || 'info');
    
    if (type === 'success') {
        setTimeout(function() {
            hide('notification');
        }, 3000);
    }
}

function resetToModeSelection() {
    // Clean up WebRTC
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Close session
    if (currentCode) {
        sendMessage('close', currentCode, {});
        currentCode = null;
    }
    
    // Reset UI
    hide('sendSection');
    hide('receiveSection');
    show('modeSelection');
    
    resetSendSection();
    resetReceiveSection();
}

function resetSendSection() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    
    show('dropZone');
    hide('fileReady');
    hide('waitingState');
    hide('senderTransferState');
    hide('senderCompleteState');
    
    document.getElementById('senderProgressFill').style.width = '0%';
    document.getElementById('senderProgressText').textContent = '0%';
}

function resetReceiveSection() {
    show('codeEntry');
    hide('fileOffer');
    hide('receiverTransferState');
    hide('receiverCompleteState');
    
    document.getElementById('codeInput').value = '';
    document.getElementById('receiverProgressFill').style.width = '0%';
    document.getElementById('receiverProgressText').textContent = '0%';
    
    receivedChunks = [];
    receivedSize = 0;
    incomingMetadata = null;
}

function handleClose(msg) {
    showNotification('Connection closed' + (msg.error ? ': ' + msg.error : ''), 'error');
    resetToModeSelection();
}
