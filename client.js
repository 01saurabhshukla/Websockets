'use strict';

const WS_URL = `ws://${window.location.hostname}:4000`;

let socket = null;
let currentMode = 'echo';
let myRooms = [];
let echoCount = 0;
let roomsCount = 0;

/* ──────────────────────────────────────────────
   ELEMENT REFS — header / connection
────────────────────────────────────────────── */
const openBtn = document.getElementById('open-btn');
const closeBtn = document.getElementById('close-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const connIdBadge = document.getElementById('conn-id-badge');

const btnEchoMode = document.getElementById('btn-echo-mode');
const btnRoomsMode = document.getElementById('btn-rooms-mode');
const echoUi = document.getElementById('echo-ui');
const roomsUi = document.getElementById('rooms-ui');
const echoBanner = document.getElementById('echo-banner');
const roomsBanner = document.getElementById('rooms-banner');

const directTargetInput = document.getElementById('dm-target');
const directMessageInput = document.getElementById('dm-message');
const dmSendBtn = document.getElementById('dm-send-btn');


const testBtn = document.getElementById('test-button');


/* ──────────────────────────────────────────────
   ELEMENT REFS — echo mode
────────────────────────────────────────────── */
const echoLog = document.getElementById('echo-log');
const echoMessage = document.getElementById('echo-message');
const echoSendBtn = document.getElementById('echo-send-btn');
const echoClearBtn = document.getElementById('echo-clear-btn');
const populateBtn = document.getElementById('populate-btn');
const echoFrameCount = document.getElementById('echo-frame-count');

/* ──────────────────────────────────────────────
   ELEMENT REFS — rooms mode
────────────────────────────────────────────── */
const roomsLog = document.getElementById('rooms-log');
const joinInput = document.getElementById('join-room-input');
const joinBtn = document.getElementById('join-btn');
const roomList = document.getElementById('room-list');
const noRoomsMsg = document.getElementById('no-rooms-msg');
const roomSelectSend = document.getElementById('room-select-send');
const roomsMessage = document.getElementById('rooms-message');
const roomsSendBtn = document.getElementById('rooms-send-btn');
const listRoomsBtn = document.getElementById('list-rooms-btn');
const roomsClearBtn = document.getElementById('rooms-clear-btn');
const roomsEventCount = document.getElementById('rooms-event-count');



const usersList          = document.getElementById('users-list');
const usersCount         = document.getElementById('users-count');
const refreshUsersBtn    = document.getElementById('refresh-users-btn');
const allRoomsList       = document.getElementById('all-rooms-list');
const allRoomsCount      = document.getElementById('all-rooms-count');
const refreshAllRoomsBtn = document.getElementById('refresh-all-rooms-btn');

let myConnectionId = null;   // set on 'welcome'

const dmLog      = document.getElementById('dm-log');
const dmClearBtn = document.getElementById('dm-clear-btn');

const dmTypingStrip = document.getElementById('dm-typing-strip');

const typingTimers = {};       // { connId: clearTimeoutId }
let   typingSendTimer = null;  // throttle: one send per 1.5 s max


directMessageInput.addEventListener('input', () => {
    const to = directTargetInput.value.trim();
    if (!to || !isConnected() || to === myConnectionId) return;
    if (!typingSendTimer) {
        sendJSON({ action: 'typing', to });
        typingSendTimer = setTimeout(() => { typingSendTimer = null; }, 3000);
    }
});

function showTypingIndicator(connId) {
    // Reset (or start) the 3-second auto-clear for this typer
    clearTimeout(typingTimers[connId]);
    typingTimers[connId] = setTimeout(() => {
        delete typingTimers[connId];
        renderTypingStrip();
    }, 3000);
    renderTypingStrip();
}


function renderTypingStrip() {
    const typers = Object.keys(typingTimers);
    if (typers.length === 0) {
        dmTypingStrip.innerHTML = '';
        dmTypingStrip.classList.remove('visible');
        return;
    }
    // "conn_1", "conn_1 and conn_2", "conn_1, conn_2 and conn_3"
    let nameStr;
    if (typers.length === 1)      nameStr = typers[0];
    else if (typers.length === 2) nameStr = `${typers[0]} and ${typers[1]}`;
    else nameStr = typers.slice(0, -1).map(escapeHtml).join(', ') +
                   ' and ' + escapeHtml(typers[typers.length - 1]);
    dmTypingStrip.innerHTML =
        `${escapeHtml(nameStr)} ${typers.length === 1 ? 'is' : 'are'} typing
         <span class="typing-dots"><span></span><span></span><span></span></span>`;
    dmTypingStrip.classList.add('visible');
}


/* ──────────────────────────────────────────────
   MODE SWITCHING
────────────────────────────────────────────── */
btnEchoMode.addEventListener('click', () => switchMode('echo'));
btnRoomsMode.addEventListener('click', () => switchMode('rooms'));

function switchMode(mode) {
    currentMode = mode;

    const isEcho = mode === 'echo';

    btnEchoMode.classList.toggle('active', isEcho);
    btnRoomsMode.classList.toggle('active', !isEcho);
    btnEchoMode.setAttribute('aria-selected', isEcho);
    btnRoomsMode.setAttribute('aria-selected', !isEcho);

    echoUi.style.display = isEcho ? 'flex' : 'none';
    roomsUi.style.display = isEcho ? 'none' : 'flex';
    echoBanner.style.display = isEcho ? 'block' : 'none';
    roomsBanner.style.display = isEcho ? 'none' : 'block';
}

/* ──────────────────────────────────────────────
   STATUS HELPERS
────────────────────────────────────────────── */
function setStatus(state, msg) {
    statusDot.className = 'status-dot ' + state;
    statusText.className = 'status-text ' + state;
    statusText.textContent = msg;
}

function setConnected(url) {
    setStatus('connected', `Connected → ${url}`);
    openBtn.disabled = true;
    closeBtn.disabled = false;

    // echo
    echoMessage.disabled = false;
    echoSendBtn.disabled = false;

    // rooms
    joinInput.disabled = false;
    joinBtn.disabled = false;
    roomsMessage.disabled = false;
    roomsSendBtn.disabled = false;
    listRoomsBtn.disabled = false;
    roomSelectSend.disabled = false;

    // DM
    directTargetInput.disabled = false;
    directMessageInput.disabled = false;
    dmSendBtn.disabled = false;

    refreshUsersBtn.disabled = false; 
    refreshAllRoomsBtn.disabled = false;
}

function setDisconnected(msg) {
    setStatus('disconnected', msg || 'Disconnected');
    openBtn.disabled = false;
    closeBtn.disabled = true;
    connIdBadge.style.display = 'none';

    // echo
    echoMessage.disabled = true;
    echoSendBtn.disabled = true;

    // rooms
    joinInput.disabled = true;
    joinBtn.disabled = true;
    roomsMessage.disabled = true;
    roomsSendBtn.disabled = true;
    listRoomsBtn.disabled = true;
    roomSelectSend.disabled = true;

    // DM
    directTargetInput.disabled = true;
    directMessageInput.disabled = true;
    dmSendBtn.disabled = true;

    refreshUsersBtn.disabled = true;  
    refreshAllRoomsBtn.disabled = true;

    // clear room UI state
    myRooms = [];
    refreshRoomList();
}


/* 
    New Features
*/


// ── Refresh buttons ──
refreshUsersBtn.addEventListener('click', () => sendJSON({ action: 'list_all_users' }));
refreshAllRoomsBtn.addEventListener('click', () => sendJSON({ action: 'list_all_rooms' }));

function renderUsers(users) {
    usersList.innerHTML = '';
    usersCount.textContent = `${users.length} online`;
    if (users.length === 0) {
        usersList.innerHTML = '<li class="overview-empty">No users online</li>';
        return;
    }
    users.forEach(id => {
        const li = document.createElement('li');
        li.className = 'user-pill' + (id === myConnectionId ? ' is-me' : '');
        li.innerHTML = `<span class="uid">${escapeHtml(id)}</span>
                        <span class="dm-cta">${id !== myConnectionId ? '→ DM' : ''}</span>`;
        if (id !== myConnectionId) {
            li.addEventListener('click', () => {
                directTargetInput.value = id;
                directMessageInput.focus();
                document.getElementById('dm-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }
        usersList.appendChild(li);
    });
}

function renderAllRooms(rooms) {
    allRoomsList.innerHTML = '';
    allRoomsCount.textContent = `${rooms.length} room${rooms.length !== 1 ? 's' : ''}`;
    if (rooms.length === 0) {
        allRoomsList.innerHTML = '<li class="overview-empty">No rooms yet</li>';
        return;
    }
    rooms.forEach(name => {
        const li = document.createElement('li');
        li.className = 'room-pill';
        li.textContent = `# ${name}`;
        li.addEventListener('click', () => {
            joinInput.value = name;
            joinInput.focus();
        });
        allRoomsList.appendChild(li);
    });
}



/* ──────────────────────────────────────────────
   LOGGING HELPERS
────────────────────────────────────────────── */
function createEntry(type, label, text) {
    const el = document.createElement('div');
    el.className = `log-entry ${type}`;
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    el.innerHTML =
        `<span class="log-label">${label}</span>` +
        `<span class="log-ts">${ts}</span>` +
        escapeHtml(text);
    return el;
}

function appendToEcho(type, label, text) {
    // Remove the empty placeholder if present
    const empty = echoLog.querySelector('.log-empty');
    if (empty) empty.remove();

    echoLog.appendChild(createEntry(type, label, text));
    echoLog.scrollTop = echoLog.scrollHeight;
    echoCount++;
    echoFrameCount.textContent = `${echoCount} frame${echoCount !== 1 ? 's' : ''}`;
}

function appendToRooms(type, label, text) {
    const empty = roomsLog.querySelector('.log-empty');
    if (empty) empty.remove();

    roomsLog.appendChild(createEntry(type, label, text));
    roomsLog.scrollTop = roomsLog.scrollHeight;
    roomsCount++;
    roomsEventCount.textContent = `${roomsCount} event${roomsCount !== 1 ? 's' : ''}`;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ──────────────────────────────────────────────
   ROOM LIST UI
────────────────────────────────────────────── */
function refreshRoomList() {
    // Remove all room items (keep the no-rooms-msg node)
    const items = roomList.querySelectorAll('.room-item');
    items.forEach(el => el.remove());

    // Rebuild the select dropdown
    roomSelectSend.innerHTML = '';

    if (myRooms.length === 0) {
        noRoomsMsg.style.display = 'block';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— join a room first —';
        roomSelectSend.appendChild(opt);
        return;
    }

    noRoomsMsg.style.display = 'none';

    myRooms.forEach(room => {
        // Sidebar list item
        const li = document.createElement('li');
        li.className = 'room-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'room-name';
        nameSpan.textContent = `# ${room}`;

        const leaveBtn = document.createElement('button');
        leaveBtn.className = 'room-leave-btn';
        leaveBtn.textContent = 'Leave';
        leaveBtn.setAttribute('aria-label', `Leave room ${room}`);
        leaveBtn.addEventListener('click', () => leaveRoom(room));

        li.appendChild(nameSpan);
        li.appendChild(leaveBtn);
        roomList.appendChild(li);

        // Select option
        const opt = document.createElement('option');
        opt.value = room;
        opt.textContent = `# ${room}`;
        roomSelectSend.appendChild(opt);
    });
}

/* ──────────────────────────────────────────────
   WEBSOCKET
────────────────────────────────────────────── */
openBtn.addEventListener('click', () => {
    if (socket && socket.readyState < 2) return;

    setStatus('connecting', 'Connecting…');
    openBtn.disabled = true;

    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        setConnected(WS_URL);
        appendToEcho('system', 'SYS', `Connection opened → ${WS_URL}`);
        appendToRooms('system', 'SYS', `Connection opened → ${WS_URL}`);
    };

    socket.onmessage = (event) => {
        const raw = event.data;

        if (raw instanceof Blob) {
            // Binary frame — show in echo log
            raw.text().then(text => {
                appendToEcho('recv', 'RECV (binary)', `[${text.length} bytes] ${text.substring(0, 200)}${text.length > 200 ? '…' : ''}`);
            });
            return;
        }

        // Try JSON — all rooms messages are JSON
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) { }
        console.log("parsed", parsed);
        if (parsed && parsed.action) {
            // Route to rooms log
            handleRoomsMessage(parsed);
            // Also show raw in echo log (so echo mode users can observe the protocol)
            appendToEcho('recv', 'RECV', raw.length > 200 ? raw.substring(0, 200) + '…' : raw);
        } else {
            // Plain echo
            appendToEcho('recv', 'RECV', raw.length > 300 ? raw.substring(0, 300) + `… [${raw.length} bytes total]` : raw);
            appendToRooms('recv', 'RECV', raw);
        }
    };

    socket.onclose = (ev) => {
        const reason = ev.reason ? ev.reason : `code ${ev.code}`;
        appendToEcho('system', 'SYS', `Connection closed — ${reason}`);
        appendToRooms('system', 'SYS', `Connection closed — ${reason}`);
        setDisconnected(`Disconnected (${reason})`);
    };

    socket.onerror = () => {
        appendToEcho('error', 'ERR', 'WebSocket error — is the server running on port 4000?');
        appendToRooms('error', 'ERR', 'WebSocket error — is the server running on port 4000?');
        setDisconnected('Connection error');
    };
});

closeBtn.addEventListener('click', () => {
    if (socket) socket.close(1000, 'Client disconnected');
});

/* ──────────────────────────────────────────────
   ECHO MODE — SEND
────────────────────────────────────────────── */
echoSendBtn.addEventListener('click', sendEchoMessage);

echoMessage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendEchoMessage();
    }
});

function sendEchoMessage() {
    const text = echoMessage.value.trim();
    if (!text || !isConnected()) return;
    socket.send(text);
    const preview = text.length > 200 ? text.substring(0, 200) + `… [${text.length} bytes]` : text;
    appendToEcho('sent', 'SENT', preview);
    echoMessage.value = '';
}

populateBtn.addEventListener('click', () => {
    echoMessage.value = 'A'.repeat(150_000);
    echoMessage.focus();
});

echoClearBtn.addEventListener('click', () => {
    echoLog.innerHTML = '<div class="log-empty">Log cleared</div>';
    echoCount = 0;
    echoFrameCount.textContent = '0 frames';
});

/* ──────────────────────────────────────────────
   DIRECT MESSAGING
────────────────────────────────────────────── */
dmSendBtn.addEventListener('click', sendDirect);

directMessageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendDirect();
    }
});

function sendDirect() {
    const to = directTargetInput.value.trim();
    const text = directMessageInput.value.trim();
    if (!to || !text) return;
    sendJSON({ action: 'direct', to, text });
    appendToRooms('sent', 'DM', `→ [${to}] ${text}`);
    directMessageInput.value = '';
}

/* ──────────────────────────────────────────────
   ROOMS MODE — ACTIONS
────────────────────────────────────────────── */
function sendJSON(obj) {
    if (isConnected()) socket.send(JSON.stringify(obj));
}

function isConnected() {
    return socket && socket.readyState === WebSocket.OPEN;
}

// ── Join ──
joinBtn.addEventListener('click', joinCurrentRoom);
joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCurrentRoom(); });

function joinCurrentRoom() {
    const room = joinInput.value.trim();
    if (!room) return;
    sendJSON({ action: 'join', room });
    appendToRooms('sent', 'SEND', `→ join "${room}"`);
    joinInput.value = '';
    joinInput.focus();
}

// ── Leave (from sidebar button) ──
function leaveRoom(room) {
    sendJSON({ action: 'leave', room });
    appendToRooms('sent', 'SEND', `→ leave "${room}"`);
}

// ── Broadcast ──
roomsSendBtn.addEventListener('click', sendRoomMessage);
roomsMessage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendRoomMessage();
    }
});

function sendRoomMessage() {
    const room = roomSelectSend.value;
    const text = roomsMessage.value.trim();
    if (!room || !text) return;
    sendJSON({ action: 'message', room, text });
    appendToRooms('sent', 'ME', `[#${room}] ${text}`);
    roomsMessage.value = '';
}

testBtn.addEventListener('click', () => {
    sendJSON({ action: 'list_all_rooms' });
});

// ── List rooms ──
listRoomsBtn.addEventListener('click', () => {
    sendJSON({ action: 'list_rooms' });
    appendToRooms('system', 'SEND', '→ list_rooms');
});

// ── Clear log ──
roomsClearBtn.addEventListener('click', () => {
    roomsLog.innerHTML = '<div class="log-empty">Log cleared</div>';
    roomsCount = 0;
    roomsEventCount.textContent = '0 events';
});

function appendToDm(type, label, text) {
    const empty = dmLog.querySelector('.log-empty');
    if (empty) empty.remove();
    dmLog.appendChild(createEntry(type, label, text));
    dmLog.scrollTop = dmLog.scrollHeight;
    dmCount++;
}

dmClearBtn.addEventListener('click', () => {
    dmLog.innerHTML = '<div class="log-empty">Log cleared</div>';
    dmCount = 0;
});


/* ──────────────────────────────────────────────
   ROOMS — INCOMING MESSAGE HANDLER
────────────────────────────────────────────── */
function handleRoomsMessage(msg) {
    console.log("console message : ", msg.action);
    switch (msg.action) {

        case 'joined':
            if (!myRooms.includes(msg.room)) myRooms.push(msg.room);
            refreshRoomList();
            appendToRooms('join', 'JOINED', `You joined #${msg.room} — ${msg.members} member${msg.members !== 1 ? 's' : ''}`);
            break;

        case 'left':
            myRooms = myRooms.filter(r => r !== msg.room);
            refreshRoomList();
            appendToRooms('leave', 'LEFT', `You left #${msg.room}`);
            break;

        case 'message':
            appendToRooms('recv', 'MSG', `[#${msg.room}] ${msg.from}: ${msg.text}`);
            break;

        case 'user_joined':
            appendToRooms('join', 'JOIN', `${msg.userId} joined #${msg.room} (${msg.members} members)`);
            break;

        case 'user_left':
            appendToRooms('leave', 'LEFT', `${msg.userId} left #${msg.room} (${msg.members} remaining)`);
            break;

        case 'room_list': {
            const list = msg.rooms.length
                ? msg.rooms.map(r => '#' + r).join(', ')
                : '(none)';
            appendToRooms('system', 'ROOMS', `Your rooms: ${list}`);
            break;
        }

        case 'all_rooms_list': {
            const all = msg.rooms.length
                ? msg.rooms.map(r => '#' + r).join(', ')
                : '(none — no rooms exist on server yet)';
            renderAllRooms(msg.rooms);
            appendToRooms('system', 'ALL-ROOMS', `All server rooms: ${all}`);
            break;
        }

        case 'welcome':
            myConnectionId = msg.connectionId;
            connIdBadge.textContent = `ID: ${msg.connectionId}`;
            connIdBadge.style.display = 'inline';
            appendToRooms('system', 'SYS', `Your connection ID: ${msg.connectionId}`);
            appendToEcho('system', 'SYS', `Your connection ID: ${msg.connectionId}`);
            break;

        case 'all_users':
            renderUsers(msg.users);
            break;

        case 'all_rooms_list':
            
            break;

        case 'direct':
            // When we receive a direct message from anyone
            appendToRooms('recv', 'DM', `${msg.from}: ${msg.text}`);
            break;

        // Delievery Recipt from server
        case 'direct_sent':
            appendToRooms('sent', 'DM', `Delivered to ${msg.to}`);
            break;

        case 'error':
            appendToRooms('error', 'ERR', msg.message);
            break;

        case 'typing':
            showTypingIndicator(msg.from);
            break;

        default:
            appendToRooms('system', 'RECV', JSON.stringify(msg));
    }
}

/* ──────────────────────────────────────────────
   INIT
────────────────────────────────────────────── */
switchMode('echo');
setDisconnected('Not connected');
