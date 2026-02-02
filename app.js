const peopleSeed = [
  "Ava Carter",
  "Noah Brooks",
  "Mia Rivera",
  "Liam Patel",
  "Evelyn Chen",
  "Lucas Kim",
  "Sophia Reyes",
  "Ethan Blake",
  "Isla Morgan",
  "Mason Ortiz",
  "Aria Singh",
  "Leo Foster",
  "Zoe Bennett",
  "James Ward",
  "Amelia Price",
  "Elijah Stone",
  "Harper Scott",
  "Henry Walsh",
  "Nora Diaz",
  "Owen Hunt",
];

// IndexedDB for persistent audio storage
const DB_NAME = "MinutesTakerDB";
const DB_VERSION = 1;
const AUDIO_STORE = "audioBlobs";

let db = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(AUDIO_STORE)) {
        database.createObjectStore(AUDIO_STORE, { keyPath: "id" });
      }
    };
  });
}

function saveAudioToIndexedDB(sessionId, blob) {
  return new Promise((resolve, reject) => {
    const run = () => {
      const transaction = db.transaction([AUDIO_STORE], "readwrite");
      const store = transaction.objectStore(AUDIO_STORE);
      const request = store.put({ id: sessionId, blob: blob });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    };

    if (!db) {
      openDatabase()
        .then(run)
        .catch(reject);
      return;
    }
    run();
  });
}

function getAudioFromIndexedDB(sessionId) {
  return new Promise((resolve, reject) => {
    const run = () => {
      const transaction = db.transaction([AUDIO_STORE], "readonly");
      const store = transaction.objectStore(AUDIO_STORE);
      const request = store.get(sessionId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.blob : null);
      };
      request.onerror = () => reject(request.error);
    };

    if (!db) {
      openDatabase()
        .then(run)
        .catch(reject);
      return;
    }
    run();
  });
}

function deleteAudioFromIndexedDB(sessionId) {
  return new Promise((resolve, reject) => {
    const run = () => {
      const transaction = db.transaction([AUDIO_STORE], "readwrite");
      const store = transaction.objectStore(AUDIO_STORE);
      const request = store.delete(sessionId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    };

    if (!db) {
      openDatabase()
        .then(run)
        .catch(reject);
      return;
    }
    run();
  });
}

const TABLE_SIZE = { width: 240, height: 150 };
const PERSON_SIZE = 72;

const state = {
  stage: 1,
  tables: [],
  people: [],
  drag: null,
  currentSpeakerId: null,
  recorder: null,
  recording: false,
  startTime: null,
  timerInterval: null,
  recordingMime: "",
  lastRecordingBlob: null,
  chunks: [],
  speakerLog: [],
  sessionHistory: [],
  currentSessionName: "",
};

const elements = {
  currentDate: document.getElementById("currentDate"),
  canvas: document.getElementById("canvas"),
  canvasHint: document.getElementById("canvasHint"),
  addTableBtn: document.getElementById("addTableBtn"),
  clearTablesBtn: document.getElementById("clearTablesBtn"),
  peopleList: document.getElementById("peopleList"),
  peopleHint: document.getElementById("peopleHint"),
  absentBox: document.getElementById("absentBox"),
  absentList: document.getElementById("absentList"),
  stage1Controls: document.getElementById("stage1Controls"),
  stage2Controls: document.getElementById("stage2Controls"),
  confirmSetupBtn: document.getElementById("confirmSetupBtn"),
  sessionName: document.getElementById("sessionName"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  recStatus: document.getElementById("recStatus"),
  recTimer: document.getElementById("recTimer"),
  currentSpeaker: document.getElementById("currentSpeaker"),
  exportBtn: document.getElementById("exportBtn"),
  replayBtn: document.getElementById("replayBtn"),
  replayModal: document.getElementById("replayModal"),
  replayAudioModal: document.getElementById("replayAudioModal"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  modalCurrentSpeaker: document.getElementById("modalCurrentSpeaker"),
  timelineLog: document.getElementById("timelineLog"),
  newSessionBtn: document.getElementById("newSessionBtn"),
  historyBtn: document.getElementById("historyBtn"),
  historyModal: document.getElementById("historyModal"),
  closeHistoryBtn: document.getElementById("closeHistoryBtn"),
  historyList: document.getElementById("historyList"),
};

function svgAvatar(name) {
  const hue = Math.floor(Math.random() * 360);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="hsl(${hue}, 70%, 70%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 40) % 360}, 70%, 55%)"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="36" fill="url(#g)" />
      <text x="50%" y="55%" text-anchor="middle" fill="#ffffff" font-size="64" font-family="Arial" font-weight="600">${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function seedPeople() {
  state.people = peopleSeed.map((name, index) => ({
    id: `p-${index}`,
    name,
    avatar: svgAvatar(name),
    placement: null,
    absent: false,
  }));
}

function updateDateTime() {
  const now = new Date();
  const dateString = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  elements.currentDate.textContent = dateString;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function setStage(stage) {
  state.stage = stage;
  const isStage1 = stage === 1;
  elements.stage1Controls.hidden = !isStage1;
  elements.stage2Controls.hidden = isStage1;

  if (!isStage1) {
    state.currentSessionName = elements.sessionName.value || "Untitled Session";
  }

  elements.canvasHint.textContent = isStage1
    ? "Drag a person onto the board to place them."
    : "Drag to place. Click a person to log speaker.";
  elements.peopleHint.textContent = isStage1
    ? "Drag onto the board. Drop into Absent to mark absent."
    : "Drag to place. Click to log speaker.";
}

function renderPeopleList() {
  elements.peopleList.innerHTML = "";
  state.people
    .filter((person) => !person.placement && !person.absent)
    .forEach((person) => {
    const button = document.createElement("button");
    button.className = "person-button";
    button.type = "button";
    if (state.currentSpeakerId === person.id) {
      button.classList.add("speaker-active");
    }

    const img = document.createElement("img");
    img.src = person.avatar;
    img.alt = person.name;

    const label = document.createElement("span");
    label.textContent = person.name;

    button.appendChild(img);
    button.appendChild(label);

    attachPersonHandlers(button, person);
    elements.peopleList.appendChild(button);
  });
}

function renderAbsentList() {
  elements.absentList.innerHTML = "";
  state.people
    .filter((person) => person.absent)
    .forEach((person) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "absent-item";
      if (state.currentSpeakerId === person.id) {
        item.classList.add("speaker-active");
      }
      const img = document.createElement("img");
      img.src = person.avatar;
      img.alt = person.name;
      const label = document.createElement("span");
      label.textContent = person.name;
      item.appendChild(img);
      item.appendChild(label);
      attachPersonHandlers(item, person);
      elements.absentList.appendChild(item);
    });
}

function attachPersonHandlers(button, person) {
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    beginPersonDrag(person, event);
  });
}

function beginPersonDrag(person, event) {
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  const origin = person.absent ? "absent" : person.placement ? "canvas" : "list";

  state.drag = {
    type: "person",
    personId: person.id,
    pointerId,
    startX,
    startY,
    dragging: false,
    ghost: null,
    origin,
    overCanvas: false,
    overAbsent: false,
  };

  const handleMove = (moveEvent) => {
    if (!state.drag || state.drag.pointerId !== pointerId) {
      return;
    }
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (!state.drag.dragging && Math.hypot(dx, dy) > 6) {
      state.drag.dragging = true;
      state.drag.ghost = createDragGhost(person);
    }
    if (state.drag.dragging) {
      moveGhost(state.drag.ghost, moveEvent.clientX, moveEvent.clientY);
      const overCanvas = isOverCanvas(moveEvent.clientX, moveEvent.clientY);
      const overAbsent = isOverAbsent(moveEvent.clientX, moveEvent.clientY);
      setCanvasHover(overCanvas);
      setAbsentHover(overAbsent);
      state.drag.overCanvas = overCanvas;
      state.drag.overAbsent = overAbsent;
    }
  };

  const handleUp = (upEvent) => {
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleUp);
    if (!state.drag || state.drag.pointerId !== pointerId) {
      return;
    }

    if (state.drag.dragging) {
      if (state.drag.overAbsent) {
        markAbsent(person.id);
      } else if (state.drag.overCanvas) {
        const coords = canvasCoords(upEvent.clientX, upEvent.clientY);
        placePersonAt(person.id, coords.x, coords.y);
      } else if (state.drag.origin === "canvas") {
        // Keep them where they were if dropped outside.
      } else {
        // Return to list by clearing placement/absent.
        clearPersonStatus(person.id);
      }
    } else if (state.stage === 2) {
      setCurrentSpeaker(person);
      if (state.recording) {
        addSpeakerLog(person);
      }
    }

    cleanupDrag();
  };

  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleUp);
}

function createDragGhost(person) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  const img = document.createElement("img");
  img.src = person.avatar;
  img.alt = person.name;
  ghost.appendChild(img);
  document.body.appendChild(ghost);
  return ghost;
}

function moveGhost(ghost, x, y) {
  if (!ghost) {
    return;
  }
  const offset = PERSON_SIZE / 2;
  ghost.style.transform = `translate3d(${x - offset}px, ${y - offset}px, 0)`;
}

function cleanupDrag() {
  if (state.drag && state.drag.ghost) {
    state.drag.ghost.remove();
  }
  setCanvasHover(false);
  setAbsentHover(false);
  state.drag = null;
}

function isOverCanvas(x, y) {
  const rect = elements.canvas.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function canvasCoords(x, y) {
  const rect = elements.canvas.getBoundingClientRect();
  const offset = PERSON_SIZE / 2;
  const rawX = x - rect.left - offset;
  const rawY = y - rect.top - offset;
  return {
    x: Math.min(Math.max(0, rawX), rect.width - PERSON_SIZE),
    y: Math.min(Math.max(0, rawY), rect.height - PERSON_SIZE),
  };
}

function setCanvasHover(active) {
  elements.canvas.classList.toggle("drop-target", active);
}

function isOverAbsent(x, y) {
  const rect = elements.absentBox.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function setAbsentHover(active) {
  elements.absentBox.classList.toggle("drop-target", active);
}

function renderCanvas() {
  elements.canvas.innerHTML = "";

  state.tables.forEach((table) => {
    const node = document.createElement("div");
    node.className = "table";
    node.dataset.id = table.id;
    node.style.left = `${table.x}px`;
    node.style.top = `${table.y}px`;
    node.textContent = table.label;
    node.addEventListener("pointerdown", (event) =>
      handleTablePointerDown(event, table)
    );
    elements.canvas.appendChild(node);
  });

  state.people.forEach((person) => {
    if (!person.placement) {
      return;
    }
    const chip = document.createElement("button");
    chip.className = "seat-person";
    chip.type = "button";
    if (state.currentSpeakerId === person.id) {
      chip.classList.add("speaker-active");
    }
    chip.dataset.id = person.id;
    chip.style.left = `${person.placement.x}px`;
    chip.style.top = `${person.placement.y}px`;
    const img = document.createElement("img");
    img.src = person.avatar;
    img.alt = person.name;
    const label = document.createElement("span");
    label.textContent = person.name;
    chip.appendChild(img);
    chip.appendChild(label);
    chip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      beginPersonDrag(person, event);
    });
    elements.canvas.appendChild(chip);
  });
}

function placePersonAt(personId, x, y) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) {
    return;
  }
  person.placement = { x, y };
  person.absent = false;
  renderCanvas();
  renderPeopleList();
  renderAbsentList();
}

function markAbsent(personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) {
    return;
  }
  person.absent = true;
  person.placement = null;
  renderCanvas();
  renderPeopleList();
  renderAbsentList();
}

function clearPersonStatus(personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) {
    return;
  }
  person.absent = false;
  person.placement = null;
  renderCanvas();
  renderPeopleList();
  renderAbsentList();
}

function addTable() {
  const id = `t-${Date.now()}`;
  const offset = state.tables.length * 18;
  state.tables.push({
    id,
    label: `Table ${state.tables.length + 1}`,
    x: 40 + offset,
    y: 40 + offset,
  });
  renderCanvas();
}

function clearTables() {
  state.tables = [];
  state.people.forEach((person) => {
    person.placement = null;
    person.absent = false;
  });
  renderCanvas();
  renderPeopleList();
  renderAbsentList();
}

let tableDrag = null;

function handleTablePointerDown(event, table) {
  if (state.drag && state.drag.type === "person") {
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  tableDrag = {
    tableId: table.id,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    pointerId: event.pointerId,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.addEventListener("pointermove", handleTablePointerMove);
  event.currentTarget.addEventListener("pointerup", handleTablePointerUp, {
    once: true,
  });
}

function handleTablePointerMove(event) {
  if (!tableDrag) {
    return;
  }
  const table = state.tables.find((t) => t.id === tableDrag.tableId);
  if (!table) {
    return;
  }
  const bounds = elements.canvas.getBoundingClientRect();
  const x = Math.min(
    Math.max(0, event.clientX - bounds.left - tableDrag.offsetX),
    bounds.width - TABLE_SIZE.width
  );
  const y = Math.min(
    Math.max(0, event.clientY - bounds.top - tableDrag.offsetY),
    bounds.height - TABLE_SIZE.height
  );
  table.x = x;
  table.y = y;
  event.currentTarget.style.left = `${x}px`;
  event.currentTarget.style.top = `${y}px`;
}

function handleTablePointerUp(event) {
  if (tableDrag) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.removeEventListener("pointermove", handleTablePointerMove);
  }
  tableDrag = null;
  renderCanvas();
}

function setCurrentSpeaker(person) {
  state.currentSpeakerId = person ? person.id : null;
  elements.currentSpeaker.textContent = person ? person.name : "None";
  renderPeopleList();
  renderAbsentList();
  renderCanvas();
}

function addSpeakerLog(person) {
  const timestamp = Date.now() - state.startTime;
  state.speakerLog.unshift({
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: person.name,
    time: formatDuration(timestamp),
  });
}


async function startRecording() {
  if (!navigator.mediaDevices) {
    alert("Audio recording is not supported in this browser.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredTypes = [
      "audio/mpeg",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
    let selectedType = "";
    if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
      selectedType =
        preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    }
    const options = selectedType ? { mimeType: selectedType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    state.recorder = recorder;
    state.chunks = [];
    state.lastRecordingBlob = null;
    state.recording = true;
    state.startTime = Date.now();
    state.recordingMime = recorder.mimeType || selectedType || "";
    elements.recStatus.textContent = "Recording";
    elements.recStatus.classList.add("recording");
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
    elements.exportBtn.disabled = true;
    elements.replayBtn.disabled = true;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start(1000);
    updateTimer();
    state.timerInterval = setInterval(updateTimer, 1000);
  } catch (error) {
    alert("Microphone access denied or unavailable.");
  }
}

function updateTimer() {
  if (!state.recording) {
    return;
  }
  const elapsed = Date.now() - state.startTime;
  elements.recTimer.textContent = formatDuration(elapsed);
}

function stopRecording() {
  if (!state.recorder) {
    return;
  }
  state.recorder.stop();
  state.recording = false;
  clearInterval(state.timerInterval);
  elements.recStatus.textContent = "Stopped";
  elements.recStatus.classList.remove("recording");
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  elements.exportBtn.disabled = false;
  state.lastRecordingBlob = buildAudioBlob();
  if (state.lastRecordingBlob) {
    elements.replayBtn.disabled = false;
  }
}

function exportSession() {
  if (!state.chunks.length) {
    alert("No audio recorded yet.");
    return;
  }
  const audioBlob = state.lastRecordingBlob || buildAudioBlob();
  if (!audioBlob) {
    alert("Unable to export audio.");
    return;
  }
  const metadata = {
    sessionName: state.currentSessionName || "Untitled Session",
    date: new Date().toLocaleDateString(),
    log: state.speakerLog,
  };
  const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], {
    type: "application/json",
  });
  triggerDownload(metaBlob, `minutes-${Date.now()}.json`);
  triggerDownload(audioBlob, `audio-${Date.now()}.${extensionForMime(audioBlob.type)}`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildAudioBlob() {
  if (!state.chunks.length) {
    return null;
  }
  const mime = state.recordingMime || "audio/webm";
  return new Blob(state.chunks, { type: mime });
}

function extensionForMime(mime) {
  if (mime.includes("mpeg")) {
    return "mp3";
  }
  if (mime.includes("ogg")) {
    return "ogg";
  }
  if (mime.includes("webm")) {
    return "webm";
  }
  return "webm";
}

function replayRecording() {
  const blob = state.lastRecordingBlob || buildAudioBlob();
  if (!blob) {
    alert("Nothing to replay yet.");
    return;
  }
  const url = URL.createObjectURL(blob);
  elements.replayAudioModal.src = url;
  renderTimelineLog();

  elements.replayAudioModal.ontimeupdate = updateModalSpeaker;
  elements.replayAudioModal.onseeked = updateModalSpeaker;
  elements.replayAudioModal.onseeking = updateModalSpeaker;

  elements.replayModal.hidden = false;
  elements.replayAudioModal.play().catch(() => {});
}

function closeReplayModal() {
  elements.replayModal.hidden = true;
  elements.replayAudioModal.pause();
  elements.replayAudioModal.currentTime = 0;
  elements.replayAudioModal.ontimeupdate = null;
  elements.replayAudioModal.onseeked = null;
  elements.replayAudioModal.onseeking = null;
}

async function saveCurrentSession() {
  if (!state.lastRecordingBlob && state.speakerLog.length === 0) {
    return null;
  }
  const sessionId = `session-${Date.now()}`;
  const hasAudio = !!state.lastRecordingBlob;

  const session = {
    id: sessionId,
    name: state.currentSessionName || "Untitled Session",
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    speakerLog: [...state.speakerLog],
    hasAudio: hasAudio,
    duration: elements.recTimer.textContent,
  };

  // Save audio blob to IndexedDB if present
  if (state.lastRecordingBlob) {
    try {
      await saveAudioToIndexedDB(sessionId, state.lastRecordingBlob);
    } catch (err) {
      console.error("Failed to save audio to IndexedDB:", err);
    }
  }

  state.sessionHistory.unshift(session);
  saveHistoryToStorage();
  return session;
}

function saveHistoryToStorage() {
  const historyMeta = state.sessionHistory.map(s => ({
    id: s.id,
    name: s.name,
    date: s.date,
    time: s.time,
    duration: s.duration,
    hasAudio: s.hasAudio,
    speakerLog: s.speakerLog,
  }));
  localStorage.setItem("minutesHistory", JSON.stringify(historyMeta));
}

function loadHistoryFromStorage() {
  const stored = localStorage.getItem("minutesHistory");
  if (stored) {
    const historyMeta = JSON.parse(stored);
    state.sessionHistory = historyMeta.map(m => ({
      ...m,
      speakerLog: m.speakerLog || [],
    }));
  }
}

function startNewSession() {
  if (state.recording) {
    alert("Please stop recording first.");
    return;
  }

  const hasData = state.lastRecordingBlob || state.speakerLog.length > 0;
  if (hasData) {
    const confirmed = confirm("Save current session and start a new one?");
    if (!confirmed) return;
    saveCurrentSession();
  }

  resetSessionState();
  setStage(1);
}

function resetSessionState() {
  state.currentSpeakerId = null;
  state.recorder = null;
  state.recording = false;
  state.startTime = null;
  state.lastRecordingBlob = null;
  state.chunks = [];
  state.speakerLog = [];
  state.currentSessionName = "";

  elements.recStatus.textContent = "Idle";
  elements.recStatus.classList.remove("recording");
  elements.recTimer.textContent = "00:00";
  elements.currentSpeaker.textContent = "None";
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  elements.replayBtn.disabled = true;
  elements.exportBtn.disabled = true;
  elements.sessionName.value = "";

  state.people.forEach(p => {
    p.placement = null;
    p.absent = false;
  });
  state.tables = [];

  renderCanvas();
  renderPeopleList();
  renderAbsentList();
}

function openHistoryModal() {
  renderHistoryList();
  elements.historyModal.hidden = false;
}

function closeHistoryModal() {
  elements.historyModal.hidden = true;
}

function renderHistoryList() {
  if (state.sessionHistory.length === 0) {
    elements.historyList.innerHTML = '<p class="empty-state">No saved sessions yet.</p>';
    return;
  }

  elements.historyList.innerHTML = state.sessionHistory.map(session => {
    const hasAudio = session.hasAudio;
    const speakerCount = session.speakerLog?.length || 0;
    return `
      <div class="history-item" data-id="${session.id}">
        <div class="history-item-info">
          <h3>${session.name}</h3>
          <p>${session.date} • ${session.duration || "No recording"} • ${speakerCount} speaker${speakerCount !== 1 ? 's' : ''}</p>
        </div>
        <div class="history-item-actions">
          <div class="history-item-status">
            ${hasAudio ? '<span class="has-audio">▶</span>' : '<span class="no-audio">No audio</span>'}
          </div>
          <button class="history-delete" data-id="${session.id}" title="Delete session">🗑</button>
        </div>
      </div>
    `;
  }).join("");

  elements.historyList.querySelectorAll(".history-item").forEach(item => {
    item.addEventListener("click", () => {
      const sessionId = item.dataset.id;
      playHistorySession(sessionId);
    });
  });

  elements.historyList.querySelectorAll(".history-delete").forEach(button => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const sessionId = button.dataset.id;
      deleteSession(sessionId);
    });
  });
}

async function deleteSession(sessionId) {
  const session = state.sessionHistory.find(s => s.id === sessionId);
  if (!session) return;
  const confirmed = confirm(`Delete "${session.name}"? This cannot be undone.`);
  if (!confirmed) return;

  if (session.hasAudio) {
    try {
      await deleteAudioFromIndexedDB(sessionId);
    } catch (err) {
      console.error("Failed to delete audio from IndexedDB:", err);
    }
  }

  state.sessionHistory = state.sessionHistory.filter(s => s.id !== sessionId);
  saveHistoryToStorage();
  renderHistoryList();
}

async function playHistorySession(sessionId) {
  const session = state.sessionHistory.find(s => s.id === sessionId);
  if (!session) return;

  if (!session.hasAudio) {
    alert("No audio was recorded for this session.");
    return;
  }

  // Load audio from IndexedDB
  let audioBlob;
  try {
    audioBlob = await getAudioFromIndexedDB(sessionId);
  } catch (err) {
    console.error("Failed to load audio from IndexedDB:", err);
    alert("Failed to load audio.");
    return;
  }

  if (!audioBlob) {
    alert("Audio not found in storage.");
    return;
  }

  if (session.speakerLog.length === 0) {
    alert("No speaker log for this session.");
    return;
  }

  closeHistoryModal();

  const url = URL.createObjectURL(audioBlob);
  elements.replayAudioModal.src = url;

  elements.timelineLog.innerHTML = "";
  const sortedLog = [...session.speakerLog].reverse();
  sortedLog.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "timeline-entry";
    row.dataset.index = index;
    row.innerHTML = `<span>${entry.name}</span><span class="time">${entry.time}</span>`;
    row.addEventListener("click", () => {
      const parts = entry.time.split(":").map(Number);
      const seconds = parts[0] * 60 + parts[1];
      elements.replayAudioModal.currentTime = seconds;
      updateHistorySpeaker(sortedLog);
      elements.replayAudioModal.play().catch(() => {});
    });
    elements.timelineLog.appendChild(row);
  });

  elements.replayAudioModal.onended = null;
  elements.replayAudioModal.ontimeupdate = () => updateHistorySpeaker(sortedLog);
  elements.replayAudioModal.onseeked = () => updateHistorySpeaker(sortedLog);
  elements.replayAudioModal.onseeking = () => updateHistorySpeaker(sortedLog);

  elements.replayModal.hidden = false;
  elements.replayAudioModal.play().catch(() => {});
}

function updateHistorySpeaker(sortedLog) {
  const currentTime = elements.replayAudioModal.currentTime * 1000;
  let activeSpeaker = "—";
  let activeIndex = -1;

  for (let i = sortedLog.length - 1; i >= 0; i--) {
    const entry = sortedLog[i];
    const parts = entry.time.split(":").map(Number);
    const entryMs = (parts[0] * 60 + parts[1]) * 1000;
    if (currentTime >= entryMs) {
      activeSpeaker = entry.name;
      activeIndex = i;
      break;
    }
  }

  elements.modalCurrentSpeaker.textContent = activeSpeaker;

  const entries = elements.timelineLog.querySelectorAll(".timeline-entry");
  const isPlaying = !elements.replayAudioModal.paused;

  entries.forEach((el, i) => {
    const wasActive = el.classList.contains("active");
    const isNowActive = i === activeIndex;
    el.classList.toggle("active", isNowActive);

    if (!wasActive && isNowActive && isPlaying) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

function renderTimelineLog() {
  elements.timelineLog.innerHTML = "";
  const sortedLog = [...state.speakerLog].reverse();
  sortedLog.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "timeline-entry";
    row.dataset.index = index;
    row.innerHTML = `<span>${entry.name}</span><span class="time">${entry.time}</span>`;
    row.addEventListener("click", () => {
      const parts = entry.time.split(":").map(Number);
      const seconds = parts[0] * 60 + parts[1];
      elements.replayAudioModal.currentTime = seconds;
      updateModalSpeaker();
      elements.replayAudioModal.play().catch(() => {});
    });
    elements.timelineLog.appendChild(row);
  });
}

function updateModalSpeaker() {
  const currentTime = elements.replayAudioModal.currentTime * 1000;
  const sortedLog = [...state.speakerLog].reverse();
  let activeSpeaker = "—";
  let activeIndex = -1;

  for (let i = sortedLog.length - 1; i >= 0; i--) {
    const entry = sortedLog[i];
    const parts = entry.time.split(":").map(Number);
    const entryMs = (parts[0] * 60 + parts[1]) * 1000;
    if (currentTime >= entryMs) {
      activeSpeaker = entry.name;
      activeIndex = i;
      break;
    }
  }

  elements.modalCurrentSpeaker.textContent = activeSpeaker;

  const entries = elements.timelineLog.querySelectorAll(".timeline-entry");
  const isPlaying = !elements.replayAudioModal.paused;

  entries.forEach((el, i) => {
    const wasActive = el.classList.contains("active");
    const isNowActive = i === activeIndex;
    el.classList.toggle("active", isNowActive);

    if (!wasActive && isNowActive && isPlaying) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

function setupEvents() {
  elements.addTableBtn.addEventListener("click", addTable);
  elements.clearTablesBtn.addEventListener("click", clearTables);
  elements.confirmSetupBtn.addEventListener("click", () => setStage(2));
  elements.startBtn.addEventListener("click", startRecording);
  elements.stopBtn.addEventListener("click", stopRecording);
  elements.exportBtn.addEventListener("click", exportSession);
  elements.replayBtn.addEventListener("click", replayRecording);
  elements.closeModalBtn.addEventListener("click", closeReplayModal);
  elements.replayModal.addEventListener("click", (e) => {
    if (e.target === elements.replayModal) {
      closeReplayModal();
    }
  });
  elements.newSessionBtn.addEventListener("click", startNewSession);
  elements.historyBtn.addEventListener("click", openHistoryModal);
  elements.closeHistoryBtn.addEventListener("click", closeHistoryModal);
  elements.historyModal.addEventListener("click", (e) => {
    if (e.target === elements.historyModal) {
      closeHistoryModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!elements.replayModal.hidden) closeReplayModal();
      if (!elements.historyModal.hidden) closeHistoryModal();
    }
  });
}

async function init() {
  seedPeople();
  updateDateTime();
  setInterval(updateDateTime, 30000);
  try {
    await openDatabase();
  } catch (err) {
    console.error("Failed to open IndexedDB:", err);
  }
  loadHistoryFromStorage();
  renderPeopleList();
  renderAbsentList();
  renderCanvas();
  setStage(1);
  setupEvents();
}

init();
