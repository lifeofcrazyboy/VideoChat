// DOM Elements
const screens = {
  landing: document.getElementById('landing'),
  connecting: document.getElementById('connecting'),
  chat: document.getElementById('chat'),
  disconnected: document.getElementById('disconnected')
};

const elements = {
  startBtn: document.getElementById('startBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  nextBtn: document.getElementById('nextBtn'),
  reconnectBtn: document.getElementById('reconnectBtn'),
  toggleVideoBtn: document.getElementById('toggleVideoBtn'),
  toggleAudioBtn: document.getElementById('toggleAudioBtn'),
  reportBtn: document.getElementById('reportBtn'),
  statusText: document.getElementById('statusText'),
  disconnectReason: document.getElementById('disconnectReason'),
  myGenderSelect: document.getElementById('myGender'),
  targetGenderSelect: document.getElementById('targetGender'),
  remoteVideo: document.getElementById('remoteVideo'),
  localVideo: document.getElementById('localVideo'),
  messagesContainer: document.getElementById('messages'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn')
};

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
  showScreen('landing');
}

function setupEventListeners() {
  elements.startBtn.addEventListener('click', startChatting);
  elements.cancelBtn.addEventListener('click', cancelSearch);
  elements.nextBtn.addEventListener('click', disconnectFromCurrentChat);
  elements.reconnectBtn.addEventListener('click', reconnect);
  elements.toggleVideoBtn.addEventListener('click', toggleVideo);
  elements.toggleAudioBtn.addEventListener('click', toggleAudio);
  elements.reportBtn.addEventListener('click', reportUser);
  elements.sendBtn.addEventListener('click', sendMessage);
  elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

async function startChatting() {
  const myGender = elements.myGenderSelect.value;
  const targetGender = elements.targetGenderSelect.value;
  
  if (myGender === targetGender && targetGender !== 'any') {
    alert('For same-gender chats, please select "Any" as your target gender');
    return;
  }
  
  showScreen('connecting');
  elements.statusText.textContent = 'Connecting to server...';
  
  try {
    // Connect to signaling server (Glitch uses HTTPS)
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    socket = io(`${protocol}://${host}`, { transports: ['websocket'] });
    
    socket.on('connect', () => {
      elements.statusText.textContent = 'Finding a match...';
      socket.emit('join', {
        myGender: myGender,
        targetGender: targetGender
      });
    });
    
    socket.on('status', (status) => {
      elements.statusText.textContent = status;
    });
    
    socket.on('matched', async (data) => {
      elements.statusText.textContent = 'Starting call...';
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
    
    // Timeout after 30 seconds if no match found
    setTimeout(() => {
      if (!screens.connecting.classList.contains('hidden')) {
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
    elements.localVideo.srcObject = localStream;
    
    // Create peer connection with STUN servers
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream to connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    
    // Set up remote stream
    const remoteStream = new MediaStream();
    elements.remoteVideo.srcObject = remoteStream;
    
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
      console.log('Connection state:', peerConnection.connectionState);
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
    if (peerConnection && peerConnection.connectionState !== 'closed') {
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
  const message = elements.messageInput.value.trim();
  if (message && dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(message);
    addMessage(message, 'local');
    elements.messageInput.value = '';
    elements.messageInput.focus();
  }
}

function addMessage(message, sender) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.classList.add(sender === 'local' ? 'local-message' : 'remote-message');
  messageElement.textContent = message;
  elements.messagesContainer.appendChild(messageElement);
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function toggleVideo() {
  if (localStream) {
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
      isVideoOn = !videoTracks[0].enabled;
      videoTracks[0].enabled = isVideoOn;
      elements.toggleVideoBtn.textContent = `Video: ${isVideoOn ? 'ON' : 'OFF'}`;
    }
  }
}

function toggleAudio() {
  if (localStream) {
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      isAudioOn = !audioTracks[0].enabled;
      audioTracks[0].enabled = isAudioOn;
      elements.toggleAudioBtn.textContent = `Mic: ${isAudioOn ? 'ON' : 'OFF'}`;
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
  elements.statusText.textContent = 'Finding a new match...';
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
  elements.disconnectReason.textContent = reason;
  showScreen('disconnected');
}

function cleanupMedia() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (elements.remoteVideo.srcObject) {
    elements.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    elements.remoteVideo.srcObject = null;
  }
  if (elements.localVideo.srcObject) {
    elements.localVideo.srcObject = null;
  }
}

function showScreen(screenId) {
  Object.values(screens).forEach(screen => {
    screen.classList.add('hidden');
  });
  screens[screenId].classList.remove('hidden');
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
