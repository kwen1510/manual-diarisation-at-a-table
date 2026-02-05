
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
const CIRCLE_SIZE = 150;
const RECT_SIZE = { width: 220, height: 130 };
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
  guests: [],
  membersData: [],
  photoMap: new Map(),
  photoUrls: [],
};

const elements = {
  currentDate: document.getElementById("currentDate"),
  canvas: document.getElementById("canvas"),
  canvasHint: document.getElementById("canvasHint"),
  addTableBtn: document.getElementById("addTableBtn"),
  addCircleBtn: document.getElementById("addCircleBtn"),
  addRectBtn: document.getElementById("addRectBtn"),
  clearTablesBtn: document.getElementById("clearTablesBtn"),
  peopleList: document.getElementById("peopleList"),
  peopleHint: document.getElementById("peopleHint"),
  dataImport: document.getElementById("dataImport"),
  guestAdd: document.getElementById("guestAdd"),
  guestNameInput: document.getElementById("guestNameInput"),
  addGuestBtn: document.getElementById("addGuestBtn"),
  csvInput: document.getElementById("csvInput"),
  csvPickBtn: document.getElementById("csvPickBtn"),
  csvTemplateLink: document.getElementById("csvTemplateLink"),
  csvStatus: document.getElementById("csvStatus"),
  photosInput: document.getElementById("photosInput"),
  photosPickBtn: document.getElementById("photosPickBtn"),
  photosStatus: document.getElementById("photosStatus"),
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

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function createPerson(name, options = {}) {
  const isGuest = Boolean(options.isGuest);
  const avatar = options.avatar || svgAvatar(name);
  return {
    id:
      options.id ||
      `p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    avatar,
    placement: null,
    absent: false,
    isGuest,
    alias: options.alias ?? "",
    photoFilename: options.photoFilename ?? "",
  };
}

function setPersonImage(img, person) {
  img.src = person.avatar;
  img.alt = person.name;
  img.onerror = () => {
    img.onerror = null;
    img.src = svgAvatar(person.name);
  };
}

function clearGuestStorage() {
  localStorage.removeItem("minutesGuests");
}

function clearPhotoUrls() {
  state.photoUrls.forEach((url) => URL.revokeObjectURL(url));
  state.photoUrls = [];
}

function setPhotoMapFromFiles(files) {
  clearPhotoUrls();
  state.photoMap = new Map();
  Array.from(files).forEach((file) => {
    const url = URL.createObjectURL(file);
    state.photoUrls.push(url);
    state.photoMap.set(file.name, url);
  });
}

function applyRoster(records, { showAlerts = true, extraWarnings = [] } = {}) {
  const errors = [];
  const warnings = [];
  const people = [];
  const seenNames = new Set();

  records.forEach((record, index) => {
    const row = index + 2;
    const name = normalizeName(record.name || "");
    if (!name) {
      errors.push(`Row ${row}: missing name.`);
      return;
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      errors.push(`Row ${row}: duplicate name "${name}".`);
      return;
    }
    seenNames.add(key);

    const photoFilename = (record.photo_filename || "").trim();
    if (!photoFilename) {
      errors.push(`Row ${row}: missing photo_filename.`);
      return;
    }
    let avatar = svgAvatar(name);
    if (photoFilename) {
      const match = state.photoMap.get(photoFilename);
      if (match) {
        avatar = match;
      } else {
        warnings.push(`Missing image for "${name}": ${photoFilename}`);
      }
    }

    people.push(
      createPerson(name, {
        id: `p-${index}`,
        isGuest: false,
        alias: record.alias ?? "",
        photoFilename,
        avatar,
      })
    );
  });

  if (people.length === 0) {
    errors.push("No valid rows found in the CSV.");
  } else {
    const guestPeople = state.people.filter((p) => p.isGuest);
    const existingNames = new Set(people.map((p) => p.name.toLowerCase()));
    const guestsToAppend = guestPeople.filter(
      (guest) => !existingNames.has(guest.name.toLowerCase())
    );
    state.people = people.concat(guestsToAppend);
    renderPeopleList();
    renderAbsentList();
    renderCanvas();
  }

  const mergedWarnings = warnings.concat(extraWarnings);
  if (showAlerts) {
    if (errors.length) {
      showAlertModal("CSV Import Errors", errors, "error");
    } else if (mergedWarnings.length) {
      showAlertModal("CSV Imported With Warnings", mergedWarnings, "warning");
    } else {
      showAlertModal("CSV Imported", ["Roster loaded successfully."], "success");
    }
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }
  return rows;
}

function parseMemberCSV(text) {
  const rows = parseCSV(text);
  if (rows.length === 0) {
    return { records: [], errors: ["CSV is empty."] };
  }
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const nameIndex = headers.indexOf("name");
  const photoIndex = headers.indexOf("photo_filename");
  const aliasIndex = headers.indexOf("alias");
  const errors = [];

  if (nameIndex === -1) errors.push('Missing "name" column.');
  if (photoIndex === -1) errors.push('Missing "photo_filename" column.');

  if (errors.length) {
    return { records: [], errors };
  }

  const records = [];
  const warnings = [];
  rows.slice(1).forEach((row) => {
    const name = row[nameIndex] ?? "";
    const photo_filename = row[photoIndex] ?? "";
    const alias = aliasIndex === -1 ? "" : row[aliasIndex] ?? "";
    const isExample =
      String(name).trim().toLowerCase() === "example name" &&
      String(photo_filename).trim().toLowerCase() === "example.jpg";
    if (isExample) {
      warnings.push("Removed template example row.");
      return;
    }
    records.push({ name, photo_filename, alias });
  });

  return { records, errors: [], warnings };
}

function downloadCsvTemplate() {
  const template = [
    "name,photo_filename,alias",
  ].join("\n");
  const blob = new Blob([template], { type: "text/csv" });
  triggerDownload(blob, "members_template.csv");
}

function findPersonByName(name) {
  const needle = name.toLowerCase();
  return state.people.find((person) => person.name.toLowerCase() === needle);
}

function addGuestToState(rawName) {
  const name = normalizeName(rawName);
  if (!name) {
    return false;
  }
  if (findPersonByName(name)) {
    return false;
  }
  const person = createPerson(name, { isGuest: true });
  state.people.push(person);
  return true;
}

function removeGuest(personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person || !person.isGuest) {
    return;
  }
  state.people = state.people.filter((p) => p.id !== personId);
  if (state.currentSpeakerId === personId) {
    setCurrentSpeaker(null);
  }
  renderPeopleList();
  renderAbsentList();
  renderCanvas();
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
  if (elements.dataImport) {
    elements.dataImport.hidden = !isStage1;
  }
  if (elements.guestAdd) {
    elements.guestAdd.hidden = !isStage1;
  }

  if (!isStage1) {
    const name = elements.sessionName.value.trim();
    if (name) {
      state.currentSessionName = name;
    }
    clearTableSelection();
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
    setPersonImage(img, person);

    const label = document.createElement("span");
    label.textContent = person.name;

    button.appendChild(img);
    button.appendChild(label);
    if (person.isGuest && state.stage === 1) {
      const remove = document.createElement("span");
      remove.className = "guest-delete";
      remove.setAttribute("role", "button");
      remove.setAttribute("aria-label", `Remove ${person.name}`);
      remove.innerHTML = '<i data-lucide="x"></i>';
      remove.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        removeGuest(person.id);
      });
      button.appendChild(remove);
    }

    attachPersonHandlers(button, person);
    elements.peopleList.appendChild(button);
  });
  refreshIcons();
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
      setPersonImage(img, person);
      const label = document.createElement("span");
      label.textContent = person.name;
      item.appendChild(img);
      item.appendChild(label);
      if (person.isGuest && state.stage === 1) {
        const remove = document.createElement("span");
        remove.className = "guest-delete";
        remove.setAttribute("role", "button");
        remove.setAttribute("aria-label", `Remove ${person.name}`);
        remove.innerHTML = '<i data-lucide="x"></i>';
        remove.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
        });
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          event.preventDefault();
          removeGuest(person.id);
        });
        item.appendChild(remove);
      }
      attachPersonHandlers(item, person);
      elements.absentList.appendChild(item);
    });
  refreshIcons();
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
  setPersonImage(img, person);
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
  const front = document.createElement("div");
  front.className = "front-label";
  front.textContent = "Front";
  elements.canvas.appendChild(front);

  state.tables.forEach((table) => {
    const node = document.createElement("div");
    node.className = `table table-${table.shape || "oval"}`;
    if (state.stage !== 1) {
      node.classList.add("table-locked");
    }
    if (selectedTableId && table.id === selectedTableId) {
      node.classList.add("table-selected");
    }
    node.dataset.id = table.id;
    node.style.left = `${table.x}px`;
    node.style.top = `${table.y}px`;
    node.style.width = `${table.width || TABLE_SIZE.width}px`;
    node.style.height = `${table.height || TABLE_SIZE.height}px`;
    node.textContent = table.label;
    node.addEventListener("pointerdown", (event) =>
      handleTablePointerDown(event, table)
    );
    if (state.stage === 1) {
      node.appendChild(createTableDelete(table.id));
      node.appendChild(createResizeHandle("e"));
      node.appendChild(createResizeHandle("s"));
      node.appendChild(createResizeHandle("se"));
    }
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
    setPersonImage(img, person);
    const label = document.createElement("span");
    label.textContent = person.name;
    chip.appendChild(img);
    chip.appendChild(label);
    if (person.isGuest && state.stage === 1) {
      const remove = document.createElement("span");
      remove.className = "guest-delete";
      remove.setAttribute("role", "button");
      remove.setAttribute("aria-label", `Remove ${person.name}`);
      remove.innerHTML = '<i data-lucide="x"></i>';
      remove.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        removeGuest(person.id);
      });
      chip.appendChild(remove);
    }
    chip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      beginPersonDrag(person, event);
    });
    elements.canvas.appendChild(chip);
  });
  refreshIcons();
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
  addTableWithShape("oval");
}

function addTableWithShape(shape) {
  const id = `t-${Date.now()}`;
  const offset = state.tables.length * 18;
  const size =
    shape === "circle"
      ? { width: CIRCLE_SIZE, height: CIRCLE_SIZE }
      : shape === "rect"
        ? { width: RECT_SIZE.width, height: RECT_SIZE.height }
        : { width: TABLE_SIZE.width, height: TABLE_SIZE.height };
  state.tables.push({
    id,
    label: `Table ${state.tables.length + 1}`,
    x: 40 + offset,
    y: 40 + offset,
    width: size.width,
    height: size.height,
    shape,
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
let tableResize = null;
let selectedTableId = null;

function handleTablePointerDown(event, table) {
  if (state.drag && state.drag.type === "person") {
    return;
  }
  if (state.stage !== 1) {
    return;
  }
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  if (event.target && event.target.classList.contains("resize-handle")) {
    return;
  }
  selectedTableId = table.id;
  event.currentTarget.classList.add("table-selected");
  const rect = event.currentTarget.getBoundingClientRect();
  tableDrag = {
    tableId: table.id,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    pointerId: event.pointerId,
  };
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch (err) {
    console.warn("Unable to set pointer capture for table drag:", err);
  }
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
  const width = table.width || TABLE_SIZE.width;
  const height = table.height || TABLE_SIZE.height;
  const x = Math.min(
    Math.max(0, event.clientX - bounds.left - tableDrag.offsetX),
    bounds.width - width
  );
  const y = Math.min(
    Math.max(0, event.clientY - bounds.top - tableDrag.offsetY),
    bounds.height - height
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

function clearTableSelection() {
  selectedTableId = null;
  renderCanvas();
}

function createResizeHandle(direction) {
  const handle = document.createElement("span");
  handle.className = `resize-handle resize-${direction}`;
  handle.addEventListener("pointerdown", (event) =>
    startResize(event, direction)
  );
  return handle;
}

function startResize(event, direction) {
  event.stopPropagation();
  if (state.stage !== 1) {
    return;
  }
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  const tableEl = event.currentTarget.closest(".table");
  if (!tableEl) return;
  const tableId = tableEl.dataset.id;
  const table = state.tables.find((t) => t.id === tableId);
  if (!table) return;
  const rect = tableEl.getBoundingClientRect();
  tableResize = {
    tableId,
    direction,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
  };
  try {
    tableEl.setPointerCapture(event.pointerId);
  } catch (err) {
    console.warn("Unable to set pointer capture for table resize:", err);
  }
  tableEl.addEventListener("pointermove", handleResizeMove);
  tableEl.addEventListener("pointerup", handleResizeUp, { once: true });
}

function handleResizeMove(event) {
  if (!tableResize) return;
  const table = state.tables.find((t) => t.id === tableResize.tableId);
  if (!table) return;
  const bounds = elements.canvas.getBoundingClientRect();
  const dx = event.clientX - tableResize.startX;
  const dy = event.clientY - tableResize.startY;
  const minSize = 80;
  let width = tableResize.startWidth;
  let height = tableResize.startHeight;

  if (tableResize.direction.includes("e")) {
    width = Math.max(minSize, tableResize.startWidth + dx);
  }
  if (tableResize.direction.includes("s")) {
    height = Math.max(minSize, tableResize.startHeight + dy);
  }
  if ((table.shape || "oval") === "circle") {
    const size = Math.max(width, height);
    width = size;
    height = size;
  }

  width = Math.min(width, bounds.width - table.x);
  height = Math.min(height, bounds.height - table.y);

  table.width = width;
  table.height = height;
  const el = event.currentTarget;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
}

function handleResizeUp(event) {
  if (tableResize) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.removeEventListener("pointermove", handleResizeMove);
  }
  tableResize = null;
  renderCanvas();
}

function createTableDelete(tableId) {
  const btn = document.createElement("span");
  btn.className = "table-delete";
  btn.setAttribute("role", "button");
  btn.setAttribute("aria-label", "Delete table");
  btn.innerHTML = '<i data-lucide="x"></i>';
  btn.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    state.tables = state.tables.filter((t) => t.id !== tableId);
    renderCanvas();
  });
  return btn;
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
    alias: person.alias ?? "",
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

async function stopRecording() {
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
  await saveCurrentSession();
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
  if (!state.currentSessionName.trim()) {
    showAlertModal("Session Name Required", ["Please enter a session name."], "warning");
    return null;
  }
  const sessionId = `session-${Date.now()}`;
  const hasAudio = !!state.lastRecordingBlob;

  const session = {
    id: sessionId,
    name: state.currentSessionName.trim(),
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
          <p>${session.date} • ${session.time} • ${session.duration || "No recording"} • ${speakerCount} speaker${speakerCount !== 1 ? 's' : ''}</p>
        </div>
        <div class="history-item-actions">
          <div class="history-item-status">
            ${hasAudio ? '<span class="has-audio" aria-label="Has audio"><i data-lucide="play"></i></span>' : '<span class="no-audio">No audio</span>'}
          </div>
          <button class="history-delete" data-id="${session.id}" title="Delete session" aria-label="Delete session">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  refreshIcons();

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

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
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
  elements.addCircleBtn.addEventListener("click", () =>
    addTableWithShape("circle")
  );
  elements.addRectBtn.addEventListener("click", () =>
    addTableWithShape("rect")
  );
  elements.clearTablesBtn.addEventListener("click", clearTables);
  elements.confirmSetupBtn.addEventListener("click", () => {
    const name = elements.sessionName.value.trim();
    if (!name) {
      showAlertModal("Session Name Required", ["Please enter a session name."], "warning");
      return;
    }
    state.currentSessionName = name;
    setStage(2);
  });
  elements.startBtn.addEventListener("click", startRecording);
  elements.stopBtn.addEventListener("click", stopRecording);
  elements.exportBtn.addEventListener("click", exportSession);
  elements.replayBtn.addEventListener("click", replayRecording);
  elements.closeModalBtn.addEventListener("click", closeReplayModal);
  elements.addGuestBtn.addEventListener("click", handleAddGuest);
  elements.guestNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddGuest();
    }
  });
  elements.csvPickBtn.addEventListener("click", () => elements.csvInput.click());
  elements.photosPickBtn.addEventListener("click", () =>
    elements.photosInput.click()
  );
  elements.csvTemplateLink.addEventListener("click", (event) => {
    event.preventDefault();
    downloadCsvTemplate();
  });
  elements.csvInput.addEventListener("change", handleCsvUpload);
  elements.photosInput.addEventListener("change", handlePhotoUpload);
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
  const alertModal = document.getElementById("alertModal");
  if (alertModal) {
    const closeAlertBtn = document.getElementById("closeAlertBtn");
    closeAlertBtn?.addEventListener("click", closeAlertModal);
    alertModal.addEventListener("click", (e) => {
      if (e.target === alertModal) {
        closeAlertModal();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!elements.replayModal.hidden) closeReplayModal();
      if (!elements.historyModal.hidden) closeHistoryModal();
      closeAlertModal();
    }
  });
}

function handleCsvUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const csvText = String(reader.result || "");
    const { records, errors, warnings } = parseMemberCSV(csvText);
    if (errors.length) {
      showAlertModal("CSV Import Error", errors, "error");
      return;
    }
    state.membersData = records;
    elements.csvStatus.textContent = `${records.length} members loaded`;
    applyRoster(records, { extraWarnings: warnings });
  };
  reader.onerror = () => {
    showAlertModal("CSV Import Error", ["Failed to read CSV file."], "error");
  };
  reader.readAsText(file);
}

function handlePhotoUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  setPhotoMapFromFiles(files);
  elements.photosStatus.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} loaded`;

  if (!state.membersData || state.membersData.length === 0) {
    showAlertModal(
      "Photos Uploaded",
      ["Photos loaded. Upload a CSV to map them to members."],
      "warning"
    );
    return;
  }
  applyRoster(state.membersData);
}

function handleAddGuest() {
  const rawName = elements.guestNameInput.value;
  const added = addGuestToState(rawName);
  if (!added) {
    showAlertModal("Guest Not Added", ["Guest already exists or name is empty."], "warning");
    return;
  }
  elements.guestNameInput.value = "";
  renderPeopleList();
  renderAbsentList();
  renderCanvas();
}

function showAlertModal(title, messages, tone = "info") {
  const modal = document.getElementById("alertModal");
  const titleEl = document.getElementById("alertTitle");
  const listEl = document.getElementById("alertMessages");
  const badge = document.getElementById("alertBadge");
  if (!modal || !titleEl || !listEl || !badge) {
    alert(messages.join("\n"));
    return;
  }
  titleEl.textContent = title;
  listEl.innerHTML = messages.map((msg) => `<li>${msg}</li>`).join("");
  modal.dataset.tone = tone;
  badge.textContent =
    tone === "success"
      ? "Success"
      : tone === "warning"
        ? "Warning"
        : tone === "error"
          ? "Error"
          : "Info";
  modal.hidden = false;
}

function closeAlertModal() {
  const modal = document.getElementById("alertModal");
  if (modal) modal.hidden = true;
}

async function init() {
  state.membersData = [];
  state.people = [];
  localStorage.removeItem("minutesMembersCsv");
  clearGuestStorage();
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
  refreshIcons();
}

init();
