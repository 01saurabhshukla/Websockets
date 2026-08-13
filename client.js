'use strict';

const WS_URL = `ws://${window.location.hostname}:4000`;

let socket = null;
let currentMode = 'echo';
let myRooms = [];
let echoCount = 0;
let roomsCount = 0;
let dmCount = 0;
let sentFrameCount = 0;
let recvFrameCount = 0;

/* ── refs: header / connection ── */
const openBtn = document.getElementById('open-btn');
const closeBtn = document.getElementById('close-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const connIdBadge = document.getElementById('conn-id-badge');
const sessionConnId = document.getElementById('session-conn-id');
const sessionSentCount = document.getElementById('session-sent');
const sessionRecvCount = document.getElementById('session-recv');

const btnEchoMode = document.getElementById('btn-echo-mode');
const btnRoomsMode = document.getElementById('btn-rooms-mode');
const btnTttMode = document.getElementById('btn-ttt-mode');
const echoUi = document.getElementById('echo-ui');
const roomsUi = document.getElementById('rooms-ui');
const tttUi = document.getElementById('ttt-ui');
const echoBanner = document.getElementById('echo-banner');
const roomsBanner = document.getElementById('rooms-banner');
const tttBanner = document.getElementById('ttt-banner');

const directTargetInput = document.getElementById('dm-target');
const directMessageInput = document.getElementById('dm-message');
const dmSendBtn = document.getElementById('dm-send-btn');

/* ── refs: tic-tac-toe ── */
const tttCreateBtn = document.getElementById('ttt-create-btn');
const tttRefreshBtn = document.getElementById('ttt-refresh-btn');
const tttMatchList = document.getElementById('ttt-match-list');
const tttMatchTitle = document.getElementById('ttt-match-title');
const tttRoleBadge = document.getElementById('ttt-role-badge');
const tttLeaveBtn = document.getElementById('ttt-leave-btn');
const tttGameBody = document.getElementById('ttt-game-body');
const tttStatusBanner = document.getElementById('ttt-status-banner');
const tttBoard = document.getElementById('ttt-board');
const tttEmptyState = document.getElementById('ttt-empty-state');

/* ── refs: echo ── */
const echoLog = document.getElementById('echo-log');
const echoMessage = document.getElementById('echo-message');
const echoSendBtn = document.getElementById('echo-send-btn');
const echoClearBtn = document.getElementById('echo-clear-btn');
const populateBtn = document.getElementById('populate-btn');
const echoFrameCount = document.getElementById('echo-frame-count');

/* ── refs: rooms ── */
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

const usersList = document.getElementById('users-list');
const usersCount = document.getElementById('users-count');
const refreshUsersBtn = document.getElementById('refresh-users-btn');
const allRoomsList = document.getElementById('all-rooms-list');
const allRoomsCount = document.getElementById('all-rooms-count');
const refreshAllRoomsBtn = document.getElementById('refresh-all-rooms-btn');

const dmLog = document.getElementById('dm-log');
const dmClearBtn = document.getElementById('dm-clear-btn');
const dmTypingStrip = document.getElementById('dm-typing-strip');

let myConnectionId = null;
const typingTimers = {};
let typingSendTimer = null;

/* ── typing indicator ── */
directMessageInput.addEventListener('input', () => {
    const to = directTargetInput.value.trim();
    if (!to || !isConnected() || to === myConnectionId) return;
    if (!typingSendTimer) {
        sendJSON({ action: 'typing', to });
        typingSendTimer = setTimeout(() => { typingSendTimer = null; }, 3000);
    }
});

function showTypingIndicator(connId) {
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
    let nameStr;
    if (typers.length === 1) nameStr = typers[0];
    else if (typers.length === 2) nameStr = `${typers[0]} and ${typers[1]}`;
    else nameStr = typers.slice(0, -1).join(', ') + ' and ' + typers[typers.length - 1];
    dmTypingStrip.innerHTML =
        `${escapeHtml(nameStr)} ${typers.length === 1 ? 'is' : 'are'} typing
         <span class="typing-dots"><span></span><span></span><span></span></span>`;
    dmTypingStrip.classList.add('visible');
}

/* ── mode switching ── */
btnEchoMode.addEventListener('click', () => switchMode('echo'));
btnRoomsMode.addEventListener('click', () => switchMode('rooms'));
btnTttMode.addEventListener('click', () => switchMode('ttt'));

function switchMode(mode) {
    currentMode = mode;
    const isEcho = mode === 'echo', isRooms = mode === 'rooms', isTtt = mode === 'ttt';

    btnEchoMode.classList.toggle('active', isEcho);
    btnRoomsMode.classList.toggle('active', isRooms);
    btnTttMode.classList.toggle('active', isTtt);

    btnEchoMode.setAttribute('aria-selected', isEcho);
    btnRoomsMode.setAttribute('aria-selected', isRooms);
    btnTttMode.setAttribute('aria-selected', isTtt);

    echoUi.style.display = isEcho ? 'flex' : 'none';
    roomsUi.style.display = isRooms ? 'flex' : 'none';
    tttUi.style.display = isTtt ? 'flex' : 'none';

    echoBanner.style.display = isEcho ? 'block' : 'none';
    roomsBanner.style.display = isRooms ? 'block' : 'none';
    tttBanner.style.display = isTtt ? 'block' : 'none';

    if (isTtt && isConnected()) sendJSON({ action: 'ttt_list' });
}

/* ── status ── */
function setStatus(state, msg) {
    statusDot.className = 'status-dot ' + state;
    statusText.className = 'status-text ' + state;
    statusText.textContent = msg;
}

function setConnected(url) {
    setStatus('connected', 'Connected');
    openBtn.disabled = true;
    closeBtn.disabled = false;

    echoMessage.disabled = false;
    echoSendBtn.disabled = false;

    joinInput.disabled = false;
    joinBtn.disabled = false;
    roomsMessage.disabled = false;
    roomsSendBtn.disabled = false;
    listRoomsBtn.disabled = false;
    roomSelectSend.disabled = false;

    directTargetInput.disabled = false;
    directMessageInput.disabled = false;
    dmSendBtn.disabled = false;

    refreshUsersBtn.disabled = false;
    refreshAllRoomsBtn.disabled = false;

    tttCreateBtn.disabled = false;
    tttRefreshBtn.disabled = false;
    if (currentMode === 'ttt') sendJSON({ action: 'ttt_list' });
}

function setDisconnected(msg) {
    setStatus('disconnected', msg || 'Not connected');
    openBtn.disabled = false;
    closeBtn.disabled = true;
    connIdBadge.style.display = 'none';
    sessionConnId.textContent = '—';

    echoMessage.disabled = true;
    echoSendBtn.disabled = true;

    joinInput.disabled = true;
    joinBtn.disabled = true;
    roomsMessage.disabled = true;
    roomsSendBtn.disabled = true;
    listRoomsBtn.disabled = true;
    roomSelectSend.disabled = true;

    directTargetInput.disabled = true;
    directMessageInput.disabled = true;
    dmSendBtn.disabled = true;

    refreshUsersBtn.disabled = true;
    refreshAllRoomsBtn.disabled = true;

    tttCreateBtn.disabled = true;
    tttRefreshBtn.disabled = true;
    resetTttState();

    myRooms = [];
    refreshRoomList();
}

/* ── server overview ── */
refreshUsersBtn.addEventListener('click', () => sendJSON({ action: 'list_all_users' }));
refreshAllRoomsBtn.addEventListener('click', () => sendJSON({ action: 'list_all_rooms' }));

function renderUsers(users) {
    usersList.innerHTML = '';
    usersCount.textContent = `${users.length} online`;
    if (users.length === 0) {
        usersList.innerHTML = '<li class="overview-empty">no users online</li>';
        return;
    }
    users.forEach(id => {
        const li = document.createElement('li');
        li.className = 'user-pill' + (id === myConnectionId ? ' is-me' : '');
        li.innerHTML = `<span class="uid">${escapeHtml(id)}</span>
                        <span class="dm-cta">${id !== myConnectionId ? 'DM' : ''}</span>`;
        if (id !== myConnectionId) {
            li.addEventListener('click', () => {
                directTargetInput.value = id;
                directMessageInput.focus();   // [fix] focus instead of scrollIntoView
            });
        }
        usersList.appendChild(li);
    });
}

function renderAllRooms(rooms) {
    allRoomsList.innerHTML = '';
    allRoomsCount.textContent = `${rooms.length} room${rooms.length !== 1 ? 's' : ''}`;
    if (rooms.length === 0) {
        allRoomsList.innerHTML = '<li class="overview-empty">no rooms yet</li>';
        return;
    }
    rooms.forEach(name => {
        const li = document.createElement('li');
        li.className = 'room-pill';
        li.textContent = `# ${name}`;
        li.addEventListener('click', () => { joinInput.value = name; joinInput.focus(); });
        allRoomsList.appendChild(li);
    });
}

/* ── logging ── */
function createEntry(type, label, text) {
    const el = document.createElement('div');
    el.className = `log-entry ${type}`;
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    el.innerHTML =
        `<span class="log-label">${escapeHtml(label)}</span>` +
        `<span class="log-ts">${ts}</span>` +
        `<span>${escapeHtml(text)}</span>`;
    return el;
}

function appendToEcho(type, label, text) {
    const empty = echoLog.querySelector('.log-empty');
    if (empty) empty.remove();
    echoLog.appendChild(createEntry(type, label, text));
    echoLog.scrollTop = echoLog.scrollHeight;
    echoCount++;
    echoFrameCount.textContent = `${echoCount} frame${echoCount !== 1 ? 's' : ''}`;
    if (type === 'sent') sessionSentCount.textContent = ++sentFrameCount;
    else if (type === 'recv') sessionRecvCount.textContent = ++recvFrameCount;
}

function appendToRooms(type, label, text) {
    const empty = roomsLog.querySelector('.log-empty');
    if (empty) empty.remove();
    roomsLog.appendChild(createEntry(type, label, text));
    roomsLog.scrollTop = roomsLog.scrollHeight;
    roomsCount++;
    roomsEventCount.textContent = `${roomsCount} event${roomsCount !== 1 ? 's' : ''}`;
}

function appendToDm(type, label, text) {
    const empty = dmLog.querySelector('.log-empty');
    if (empty) empty.remove();
    dmLog.appendChild(createEntry(type, label, text));
    dmLog.scrollTop = dmLog.scrollHeight;
    dmCount++;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ── room list UI ── */
function refreshRoomList() {
    roomList.querySelectorAll('.room-item').forEach(el => el.remove());
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

        const opt = document.createElement('option');
        opt.value = room;
        opt.textContent = `# ${room}`;
        roomSelectSend.appendChild(opt);
    });
}

/* ── websocket ── */
openBtn.addEventListener('click', () => {
    console.log("clicked:")
    if (socket && socket.readyState < 2) return;

    setStatus('connecting', 'Connecting…');
    openBtn.disabled = true;
    console.log(WS_URL);
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        setConnected(WS_URL);
        appendToEcho('system', 'sys', `Connection opened → ${WS_URL}`);
        appendToRooms('system', 'sys', `Connection opened → ${WS_URL}`);
    };

    socket.onmessage = (event) => {
        const raw = event.data;

        if (raw instanceof Blob) {
            raw.text().then(text => {
                appendToEcho('recv', 'bin', `[${text.length} bytes] ${text.substring(0, 200)}${text.length > 200 ? '…' : ''}`);
            });
            return;
        }

        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) { }

        if (parsed && parsed.action) {
            if (parsed.action.startsWith('ttt_')) handleTttMessage(parsed);
            else handleRoomsMessage(parsed);
            appendToEcho('recv', 'recv', raw.length > 200 ? raw.substring(0, 200) + '…' : raw);
        } else {
            appendToEcho('recv', 'recv', raw.length > 300 ? raw.substring(0, 300) + `… [${raw.length} bytes total]` : raw);
            appendToRooms('recv', 'recv', raw);
        }
    };

    socket.onclose = (ev) => {
        const reason = ev.reason ? ev.reason : `code ${ev.code}`;
        appendToEcho('system', 'sys', `Connection closed — ${reason}`);
        appendToRooms('system', 'sys', `Connection closed — ${reason}`);
        setDisconnected('Disconnected');
    };

    socket.onerror = () => {
        appendToEcho('error', 'err', 'WebSocket error — is the server running on port 4000?');
        appendToRooms('error', 'err', 'WebSocket error — is the server running on port 4000?');
        setDisconnected('Connection error');
    };
});

closeBtn.addEventListener('click', () => { if (socket) socket.close(1000, 'Client disconnected'); });

/* ── echo ── */
echoSendBtn.addEventListener('click', sendEchoMessage);
echoMessage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEchoMessage(); }
});

function sendEchoMessage() {
    const text = echoMessage.value.trim();
    if (!text || !isConnected()) return;
    socket.send(text);
    const preview = text.length > 200 ? text.substring(0, 200) + `… [${text.length} bytes]` : text;
    appendToEcho('sent', 'sent', preview);
    echoMessage.value = '';
}

populateBtn.addEventListener('click', () => {
    echoMessage.value = 'A'.repeat(150000);
    echoMessage.focus();
});

echoClearBtn.addEventListener('click', () => {
    echoLog.innerHTML = '<div class="log-empty">log cleared</div>';
    echoCount = 0;
    echoFrameCount.textContent = '0 frames';
});

/* ── direct messages ── */
dmSendBtn.addEventListener('click', sendDirect);
directMessageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDirect(); }
});

function sendDirect() {
    const to = directTargetInput.value.trim();
    const text = directMessageInput.value.trim();
    if (!to || !text) return;
    sendJSON({ action: 'direct', to, text });
    appendToDm('sent', `→ ${to}`, text);   // [fix] DMs render in the DM panel, not the room log
    directMessageInput.value = '';
}

/* ── rooms ── */
function sendJSON(obj) { if (isConnected()) socket.send(JSON.stringify(obj)); }
function isConnected() { return socket && socket.readyState === WebSocket.OPEN; }

joinBtn.addEventListener('click', joinCurrentRoom);
joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCurrentRoom(); });

function joinCurrentRoom() {
    const room = joinInput.value.trim();
    if (!room) return;
    sendJSON({ action: 'join', room });
    appendToRooms('sent', 'send', `→ join "${room}"`);
    joinInput.value = '';
    joinInput.focus();
}

function leaveRoom(room) {
    sendJSON({ action: 'leave', room });
    appendToRooms('sent', 'send', `→ leave "${room}"`);
}

roomsSendBtn.addEventListener('click', sendRoomMessage);
roomsMessage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRoomMessage(); }
});

function sendRoomMessage() {
    const room = roomSelectSend.value;
    const text = roomsMessage.value.trim();
    if (!room || !text) return;
    sendJSON({ action: 'message', room, text });
    appendToRooms('sent', 'me', `[#${room}] ${text}`);
    roomsMessage.value = '';
}

listRoomsBtn.addEventListener('click', () => {
    sendJSON({ action: 'list_rooms' });
    appendToRooms('system', 'send', '→ list_rooms');
});

roomsClearBtn.addEventListener('click', () => {
    roomsLog.innerHTML = '<div class="log-empty">log cleared</div>';
    roomsCount = 0;
    roomsEventCount.textContent = '0 events';
});

dmClearBtn.addEventListener('click', () => {
    dmLog.innerHTML = '<div class="log-empty">log cleared</div>';
    dmCount = 0;
});

/* ── incoming: rooms ── */
function handleRoomsMessage(msg) {
    switch (msg.action) {
        case 'joined':
            if (!myRooms.includes(msg.room)) myRooms.push(msg.room);
            refreshRoomList();
            appendToRooms('join', 'joined', `You joined #${msg.room} — ${msg.members} member${msg.members !== 1 ? 's' : ''}`);
            break;

        case 'left':
            myRooms = myRooms.filter(r => r !== msg.room);
            refreshRoomList();
            appendToRooms('leave', 'left', `You left #${msg.room}`);
            break;

        case 'message':
            appendToRooms('recv', 'msg', `[#${msg.room}] ${msg.from}: ${msg.text}`);
            break;

        case 'user_joined':
            appendToRooms('join', 'join', `${msg.userId} joined #${msg.room} (${msg.members} members)`);
            break;

        case 'user_left':
            appendToRooms('leave', 'left', `${msg.userId} left #${msg.room} (${msg.members} remaining)`);
            break;

        case 'room_list':
            appendToRooms('system', 'rooms', `Your rooms: ${msg.rooms.length ? msg.rooms.map(r => '#' + r).join(', ') : '(none)'}`);
            break;

        case 'all_rooms_list':
            renderAllRooms(msg.rooms);
            appendToRooms('system', 'rooms', `All server rooms: ${msg.rooms.length ? msg.rooms.map(r => '#' + r).join(', ') : '(none)'}`);
            break;

        case 'welcome':
            myConnectionId = msg.connectionId;
            connIdBadge.textContent = `ID: ${msg.connectionId}`;
            connIdBadge.style.display = 'inline';
            sessionConnId.textContent = msg.connectionId;
            appendToRooms('system', 'sys', `Your connection ID: ${msg.connectionId}`);
            appendToEcho('system', 'sys', `Your connection ID: ${msg.connectionId}`);
            break;

        case 'all_users':
            renderUsers(msg.users);
            break;

        case 'direct':
            appendToDm('dm', msg.from, msg.text);   // [fix] into the DM panel
            break;

        case 'direct_sent':
            appendToDm('system', 'ok', `Delivered to ${msg.to}`);
            break;

        case 'error':
            appendToRooms('error', 'err', msg.message);
            break;

        case 'typing':
            showTypingIndicator(msg.from);
            break;

        default:
            appendToRooms('system', 'recv', JSON.stringify(msg));
    }
}

/* ── tic-tac-toe ── */
const Ttt = { matchId: null, role: null, mark: null, state: null };

function resetTttState() {
    Ttt.matchId = null; Ttt.role = null; Ttt.mark = null; Ttt.state = null;
    tttMatchTitle.textContent = 'No match selected';
    tttRoleBadge.style.display = 'none';
    tttLeaveBtn.style.display = 'none';
    tttGameBody.style.display = 'none';
    tttEmptyState.style.display = 'block';
    tttMatchList.innerHTML = '<div class="log-empty">no active matches</div>';
}

tttCreateBtn.addEventListener('click', () => { if (isConnected()) sendJSON({ action: 'ttt_create' }); });
tttRefreshBtn.addEventListener('click', () => { if (isConnected()) sendJSON({ action: 'ttt_list' }); });
tttLeaveBtn.addEventListener('click', () => {
    if (isConnected() && Ttt.matchId) sendJSON({ action: 'ttt_leave', matchId: Ttt.matchId });
});

function handleTttMessage(msg) {
    switch (msg.action) {
        case 'ttt_created':
            sendJSON({ action: 'ttt_join', matchId: msg.matchId, role: 'player' });
            sendJSON({ action: 'ttt_list' });
            break;

        case 'ttt_state':
            Ttt.matchId = msg.matchId;
            if (msg.yourRole) Ttt.role = msg.yourRole;
            if (msg.yourMark) Ttt.mark = msg.yourMark;
            Ttt.state = msg.state;
            tttRenderMatchHeader();
            tttRenderStatus();
            tttRenderBoard();
            break;

        case 'ttt_list':
            tttRenderMatchList(msg.matches);
            break;

        case 'ttt_left':
            resetTttState();
            sendJSON({ action: 'ttt_list' });
            break;

        case 'ttt_opponent_left':
            if (msg.matchId === Ttt.matchId) {
                tttStatusBanner.textContent = `Opponent (${msg.mark}) disconnected — game abandoned`;
                tttStatusBanner.style.color = 'var(--red)';
                Array.from(tttBoard.children).forEach(cell => cell.classList.add('disabled'));
            }
            break;

        default:
            console.warn('Unknown ttt message action:', msg);
    }
}

function tttRenderMatchHeader() {
    tttMatchTitle.textContent = Ttt.matchId;
    tttRoleBadge.style.display = 'inline-block';
    tttRoleBadge.textContent = Ttt.role === 'player' ? `Player ${Ttt.mark}` : 'Spectator';
    tttLeaveBtn.style.display = 'inline-flex';
    tttGameBody.style.display = 'block';
    tttEmptyState.style.display = 'none';
}

function tttRenderStatus() {
    if (!Ttt.state) return;
    const { turn, winner, status } = Ttt.state;

    if (status === 'finished') {
        if (winner === 'draw') {
            tttStatusBanner.textContent = 'Draw — board full';
            tttStatusBanner.style.color = 'var(--muted)';
        } else if (Ttt.role === 'player' && winner === Ttt.mark) {
            tttStatusBanner.textContent = 'You won';
            tttStatusBanner.style.color = 'var(--green)';
        } else if (Ttt.role === 'player') {
            tttStatusBanner.textContent = 'You lost';
            tttStatusBanner.style.color = 'var(--red)';
        } else {
            tttStatusBanner.textContent = `Player ${winner} won`;
            tttStatusBanner.style.color = 'var(--ink)';
        }
    } else if (Ttt.role === 'player') {
        if (turn === Ttt.mark) {
            tttStatusBanner.textContent = `Your turn (${Ttt.mark}) — pick a cell`;
            tttStatusBanner.style.color = 'var(--ink)';
        } else {
            tttStatusBanner.textContent = `Opponent's turn (${turn})…`;
            tttStatusBanner.style.color = 'var(--muted)';
        }
    } else {
        tttStatusBanner.textContent = `Spectating — ${turn} to move`;
        tttStatusBanner.style.color = 'var(--purple)';
    }
}

function tttRenderBoard() {
    if (!Ttt.state) return;
    tttBoard.innerHTML = '';

    const isMyTurn = Ttt.role === 'player' && Ttt.mark === Ttt.state.turn && Ttt.state.status === 'in_progress';

    Ttt.state.board.forEach((cellVal, index) => {
        const cell = document.createElement('div');
        cell.className = 'ttt-cell';

        if (cellVal === 'X' || cellVal === 'O') {
            cell.textContent = cellVal;
            cell.classList.add(cellVal === 'X' ? 'mark-x' : 'mark-o', 'disabled');
        } else if (!isMyTurn) {
            cell.classList.add('disabled');
        } else {
            cell.addEventListener('click', () => {
                sendJSON({ action: 'ttt_move', matchId: Ttt.matchId, cell: index });
            });
        }
        tttBoard.appendChild(cell);
    });
}

function tttRenderMatchList(matches) {
    tttMatchList.innerHTML = '';
    if (!matches || matches.length === 0) {
        tttMatchList.innerHTML = '<div class="log-empty">no active matches</div>';
        return;
    }

    matches.forEach(m => {
        const div = document.createElement('div');
        div.className = 'room-item';

        const info = document.createElement('div');
        info.className = 'room-header-info';
        info.innerHTML = `<span>${escapeHtml(m.matchId)}</span>` +
            `<span class="counter-badge">${escapeHtml(m.status)} · ${m.spectatorCount} spec</span>`;

        const actions = document.createElement('div');
        actions.className = 'ttt-match-actions';

        const isPlayerInMatch = (Ttt.matchId === m.matchId && Ttt.role === 'player');

        if (!isPlayerInMatch && (!m.players.X || !m.players.O)) {
            const playBtn = document.createElement('button');
            playBtn.className = 'btn btn-sm btn-primary';
            playBtn.textContent = 'Play';
            playBtn.addEventListener('click', () => {
                sendJSON({ action: 'ttt_join', matchId: m.matchId, role: 'player' });
            });
            actions.appendChild(playBtn);
        }

        const watchBtn = document.createElement('button');
        watchBtn.className = 'btn btn-sm btn-ghost';
        watchBtn.textContent = Ttt.matchId === m.matchId ? 'Viewing' : 'Watch';
        if (Ttt.matchId === m.matchId) watchBtn.disabled = true;
        watchBtn.addEventListener('click', () => {
            sendJSON({ action: 'ttt_join', matchId: m.matchId, role: 'spectator' });
        });
        actions.appendChild(watchBtn);

        div.appendChild(info);
        div.appendChild(actions);
        tttMatchList.appendChild(div);
    });
}

/* ── init ── */
switchMode('echo');
setDisconnected('Not connected');
