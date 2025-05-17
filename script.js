// DOM Elements
const landingScreen = document.getElementById('landing');
const connectingScreen = document.getElementById('connecting');
const chatScreen = document.getElementById('chat');
const disconnectedScreen = document.getElementById('disconnected');
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const nextBtn = document.getElementById('nextBtn');
const reconnectBtn = document.getElementById('reconnectBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const reportBtn = document.getElementById('reportBtn');
const statusText = document.getElementById('statusText');
const disconnectReason = document.getElementById('disconnectReason');
const myGenderSelect = document.getElementById('myGender');
const targetGenderSelect = document.getElementById('targetGender');
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// App state
let socket;
let peerConnection;
let localStream;
let dataChannel;
let isVideoOn = true;
let isAudioOn = true;

// Initialize the app
function init() {
    setupEventListeners();
}

function setupEventListeners() {
    startBtn.addEventListener('click', startChatting);
    cancelBtn.addEventListener('click', cancelSearch);
    nextBtn.addEventListener('click', disconnectFromCurrentChat);
    reconnectBtn.addEventListener('click', reconnect);
    toggleVideoBtn.addEventListener('click', toggleVideo);
    toggleAudioBtn.addEventListener('click', toggleAudio);
    reportBtn.addEventListener('click', reportUser);
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

async function startChatting() {
    const myGender = myGenderSelect.value;
    const targetGender = targetGenderSelect.value;
    
    if (myGender === targetGender && targetGender !== 'any') {
        alert('For same-gender chats, please select "Any" as your target gender');
        return;
    }
    
    showScreen('connecting');
    statusText.textContent = 'Connecting to server...';
    
    try {
        // Connect to signaling server
        socket = io();
        
        socket.on('connect', () => {
            statusText.textContent = 'Finding a match...';
            
            // Request to join the chat pool
            socket.emit('join', {
                myGender: myGender,
                targetGender: targetGender
            });
        });
        
        socket.on('matched', async (data) => {
            statusText.textContent = 'Starting call...';
            await setupCall(data);
        });
        
        socket.on('offer', async (offer) => {
            await handleOffer(offer);
        });
        
        socket.on('answer', async (answer) => {
            await handleAnswer(answer);
        });
        
        socket.on('ice-candidate', async (candidate) => {
            await handleIceCandidate(candidate);
        });
        
        socket.on('message', (message) => {
            addMessage(message, 'remote');
        });
        
        socket.on('disconnected', (reason) => {
            handleDisconnect(reason || 'Your partner has left the chat');
        });
        
        socket.on('connect_error', () => {
            handleDisconnect('Connection error. Please try again.');
        });
        
        // Timeout after 30 seconds if no match found
        setTimeout(() => {
            if (document.getElementById('connecting') && !document.getElementById('connecting').classList.contains('hidden')) {
                handleDisconnect('Could not find a match. Please try again.');
            }
        }, 30000);
        
    } catch (err) {
        console.error('Error starting chat:', err);
        handleDisconnect('Error starting chat. Please try again.');
    }
}

async function setupCall(data) {
    try {
        // Get local media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Display local video
        localVideo.srcObject = localStream;
        
        // Create peer connection
        peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Add local stream to connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Set up remote stream
        const remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
        
        // Handle remote tracks
        peerConnection.ontrack = (event) => {
            event.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track);
            });
        };
        
        // Set up data channel for text chat
        if (data.isInitiator) {
            dataChannel = peerConnection.createDataChannel('chat');
            setupDataChannel(dataChannel);
        } else {
            peerConnection.ondatachannel = (event) => {
                dataChannel = event.channel;
                setupDataChannel(dataChannel);
            };
        }
        
        // ICE candidate handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    to: data.partnerId,
                    candidate: event.candidate
                });
            }
        };
        
        // Connection state changes
        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'disconnected' || 
                peerConnection.connectionState === 'failed') {
                handleDisconnect('Connection lost');
            }
        };
        
        // If we're the initiator, create an offer
        if (data.isInitiator) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', {
                to: data.partnerId,
                offer: offer
            });
        }
        
        // Show chat screen
        showScreen('chat');
        
    } catch (err) {
        console.error('Error setting up call:', err);
        handleDisconnect('Error setting up call. Please try again.');
    }
}

async function handleOffer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', {
            to: offer.from,
            answer: answer
        });
    } catch (err) {
        console.error('Error handling offer:', err);
        handleDisconnect('Error handling offer. Please try again.');
    }
}

async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
        handleDisconnect('Error handling answer. Please try again.');
    }
}

async function handleIceCandidate(candidate) {
    try {
        if (peerConnection.connectionState !== 'closed') {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
}

function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('Data channel opened');
    };
    
    channel.onclose = () => {
        console.log('Data channel closed');
    };
    
    channel.onmessage = (event) => {
        addMessage(event.data, 'remote');
    };
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(message);
        addMessage(message, 'local');
        messageInput.value = '';
    }
}

function addMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === 'local' ? 'local-message' : 'remote-message');
    messageElement.textContent = message;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function toggleVideo() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isVideoOn = !videoTracks[0].enabled;
            videoTracks[0].enabled = isVideoOn;
            toggleVideoBtn.textContent = `Video: ${isVideoOn ? 'ON' : 'OFF'}`;
        }
    }
}

function toggleAudio() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isAudioOn = !audioTracks[0].enabled;
            audioTracks[0].enabled = isAudioOn;
            toggleAudioBtn.textContent = `Mic: ${isAudioOn ? 'ON' : 'OFF'}`;
        }
    }
}

function reportUser() {
    alert('User reported. Thank you for helping keep our community safe.');
    disconnectFromCurrentChat();
}

function disconnectFromCurrentChat() {
    if (peerConnection) {
        peerConnection.close();
    }
    if (socket) {
        socket.emit('leave');
    }
    cleanupMedia();
    showScreen('connecting');
    statusText.textContent = 'Finding a new match...';
}

function cancelSearch() {
    if (socket) {
        socket.emit('leave');
        socket.disconnect();
    }
    cleanupMedia();
    showScreen('landing');
}

function reconnect() {
    cleanupMedia();
    showScreen('landing');
}

function handleDisconnect(reason) {
    if (peerConnection) {
        peerConnection.close();
    }
    if (socket) {
        socket.emit('leave');
        socket.disconnect();
    }
    cleanupMedia();
    disconnectReason.textContent = reason;
    showScreen('disconnected');
}

function cleanupMedia() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    if (localVideo.srcObject) {
        localVideo.srcObject = null;
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
