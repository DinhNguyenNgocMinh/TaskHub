// LIFE TERMINAL command UI. Only commands marked active in commands.json can run.
const terminal = document.querySelector("#terminal");
const terminalOutput = document.querySelector("#terminal-output");
const terminalScrollArea = document.querySelector("#terminal-scroll-area");
const commandLine = document.querySelector(".command-line");
const commandButton = document.querySelector("#command-button");
const commandButtonText = commandButton.querySelector("span");
const commandInput = document.querySelector("#command-input");
const commandControls = document.querySelector("#command-controls");
const separatorButton = document.querySelector("#separator-button");
const completeButton = document.querySelector("#complete-button");
const submitButton = document.querySelector("#submit-button");
const commandSuggestion = document.querySelector("#command-suggestion");
const commandRender = document.querySelector("#command-render");
const commandStatus = document.querySelector("#command-status");
const confirmationLabel = document.querySelector(".command-line__confirmation-label");

let isActive = false;
let commandDefinitions = [
  { name: "note", active: true },
  { name: "noteshow", active: true },
  { name: "noteclear", active: true },
  { name: "notedone", active: true },
  { name: "notedrop", active: true },
  { name: "msg", active: true },
  { name: "room", active: true },
  { name: "call", active: false },
  { name: "mail", active: false },
  { name: "reply", active: false },
  { name: "list", active: false },
  { name: "search", active: false },
  { name: "help", active: true },
  { name: "clear", active: true },
];
const noteShowFilters = ["all", "incomplete", "complete", "nodeadline", "overdue"];
const chatConfig = window.LIFE_TERMINAL_CHAT_CONFIG || {};
const chatClient = createChatClient();
const pendingChatMessages = new Set();
let activeChatRoom = null;
let chatSubscription = null;
let suggestedChatRooms = [];
const notesStorageKey = "taskhub.notes.v1";
let notes = [];
let isDataReady = false;
let touchStartX = 0;
let touchStartY = 0;
let awaitingNoteClearCode = false;
const noteClearCode = "xoahetghichu";
let awaitingNoteCode = false;
let pendingNote = null;
let awaitingNoteDropConfirmation = false;
let pendingNoteDropCode = "";
const noteDropConfirmationPrefix = "toichacxoa";

function createChatClient() {
  const { supabaseUrl, supabaseKey } = chatConfig;
  if (!supabaseUrl || !supabaseKey || !window.supabase?.createClient) return null;
  try {
    return window.supabase.createClient(supabaseUrl, supabaseKey);
  } catch {
    return null;
  }
}

async function loadCommands() {
  try {
    const response = await fetch("commands.json");
    if (!response.ok) throw new Error("Could not load commands.json");
    const data = await response.json();
    commandDefinitions = data.commands;
  } catch {
    // Opening index.html via file:// cannot always read JSON, so retain the safe fallback.
  }
}

async function loadSuggestedChatRooms() {
  if (!chatClient) return;

  try {
    const { data, error } = await chatClient
      .from("rooms")
      .select("name")
      .eq("enabled", true)
      .order("name");
    if (error) return;

    suggestedChatRooms = data.map((room) => room.name);
    updateCommandUi();
  } catch {
    // Suggestions are optional; room commands continue to work if loading them fails.
  }
}

async function loadNotes() {
  const savedNotes = localStorage.getItem(notesStorageKey);
  if (savedNotes) {
    try {
      const parsedNotes = JSON.parse(savedNotes);
      if (Array.isArray(parsedNotes)) {
        notes = parsedNotes;
        return;
      }
    } catch {
      // A malformed local value is replaced by the packaged seed below.
    }
  }

  const response = await fetch("notes.json");
  if (!response.ok) throw new Error("Could not load seed notes.");
  const seedNotes = await response.json();
  notes = Array.isArray(seedNotes) ? seedNotes : [seedNotes];
  localStorage.setItem(notesStorageKey, JSON.stringify(notes));
}

function persistNotes() {
  localStorage.setItem(notesStorageKey, JSON.stringify(notes));
}

async function initializeData() {
  try {
    await Promise.all([loadCommands(), loadNotes(), loadSuggestedChatRooms()]);
    isDataReady = true;
  } catch (error) {
    writeTerminalLine(`! ${error.message}`);
  }
}

function findSuggestion(value) {
  if (awaitingNoteClearCode || awaitingNoteCode || awaitingNoteDropConfirmation) return "";
  const rawValue = value.toLowerCase();
  const query = rawValue.trim();
  if (!query) return "";

  const chatRoomMatch = rawValue.match(/^(room|msg)([\s_]+)([^\s_]*)$/);
  if (chatRoomMatch) {
    const [, commandName, separator, roomQuery] = chatRoomMatch;
    const roomName = suggestedChatRooms.find(
      (name) => name.toLowerCase().startsWith(roomQuery) && name.toLowerCase() !== roomQuery,
    );
    return roomName ? `${commandName}${separator}${roomName}${commandName === "msg" ? " " : ""}` : "";
  }

  // /noteshow has a second suggestion layer for its fixed filter keywords.
  const noteShowMatch = rawValue.match(/^noteshow([\s_]+)([^\s_]*)$/);
  if (noteShowMatch) {
    const [, separator, filterQuery] = noteShowMatch;
    const filter = noteShowFilters.find(
      (item) => item.startsWith(filterQuery) && item !== filterQuery,
    ) || (filterQuery ? "" : "all");
    return filter ? `noteshow${separator}${filter}` : "";
  }

  // Any argument after other commands is free text, never another command suggestion.
  if (/[\s_]/.test(rawValue)) return "";
  if (query === "noteshow") return "noteshow all";

  return commandDefinitions.find(
    (command) => command.name.startsWith(query) && command.name !== query,
  )?.name || "";
}

function appendRenderedToken(text, tokenClass) {
  if (!text) return;
  const token = document.createElement("span");
  token.className = tokenClass;
  token.textContent = text;
  commandRender.append(token);
}

function scrollTerminalToEnd() {
  window.requestAnimationFrame(() => {
    terminalScrollArea.scrollTop = terminalScrollArea.scrollHeight;
  });
}

function scrollToNewTerminalLine(line) {
  window.requestAnimationFrame(() => {
    terminalScrollArea.scrollTop = terminalScrollArea.scrollHeight;
    terminalScrollArea.scrollLeft = line.scrollWidth > terminalScrollArea.clientWidth
      ? terminalScrollArea.scrollWidth
      : 0;
  });
}

function updateViewportHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
}

function hideKeyboard() {
  commandInput.blur();
}

function renderCommandText(value) {
  commandRender.replaceChildren();
  if (!value) return;

  if (awaitingNoteClearCode) {
    appendRenderedToken("*".repeat(value.length), "command-token--command");
    return;
  }

  if (awaitingNoteCode || awaitingNoteDropConfirmation) {
    appendRenderedToken(value, "command-token--command");
    return;
  }

  const match = value.match(/^([^\s_]+)([\s_]*)([\s\S]*)$/);
  if (!match) return;

  const [, commandName, separator, remainingText] = match;
  appendRenderedToken(commandName, "command-token--command");

  // Notes are user-entered task/deadline text, so they use the secondary green.
  if (commandName.toLowerCase() !== "noteshow") {
    appendRenderedToken(`${separator}${remainingText}`, "command-token--argument");
    return;
  }

  // /noteshow filter words are fixed keywords, so keep them in the primary green.
  const filterMatch = remainingText.match(/^([^\s_]+)([\s\S]*)$/);
  appendRenderedToken(separator, "command-token--command");
  if (!filterMatch) return;

  const [, filterName, extraText] = filterMatch;
  const isFilterPrefix = noteShowFilters.some((filter) => filter.startsWith(filterName.toLowerCase()));
  appendRenderedToken(
    filterName,
    isFilterPrefix ? "command-token--command" : "command-token--argument",
  );
  appendRenderedToken(extraText, "command-token--argument");
}

function updateCommandUi() {
  const typed = commandInput.value;
  const suggestion = findSuggestion(typed);
  const hasText = typed.trim().length > 0;
  commandControls.classList.toggle("has-command", isActive && hasText);
  commandSuggestion.replaceChildren();
  renderCommandText(typed);

  if (awaitingNoteClearCode) {
    commandStatus.textContent = "Confirmation code required to clear all notes.";
  } else if (awaitingNoteDropConfirmation) {
    commandStatus.textContent = "Enter the exact task-deletion confirmation code.";
  } else if (awaitingNoteCode) {
    commandStatus.textContent = "Enter a unique two-letter task code.";
  } else if (suggestion) {
    const typedPart = document.createElement("span");
    typedPart.className = "command-suggestion__typed";
    typedPart.textContent = typed;
    const suggestionSuffix = document.createElement("span");
    suggestionSuffix.className = "command-suggestion__suffix";
    suggestionSuffix.textContent = suggestion.slice(typed.length);
    commandSuggestion.append(typedPart, suggestionSuffix);
    commandStatus.textContent = `Suggestion: slash ${suggestion}`;
  } else {
    commandStatus.textContent = "";
  }

  // Keep the newest command line in view. Older terminal output scrolls up,
  // while the header and help hint remain fixed outside this scroll area.
  scrollTerminalToEnd();
}

function writeTerminalLine(message, className = "") {
  const line = document.createElement("p");
  line.className = className;
  line.textContent = message;
  terminalOutput.append(line);
  scrollToNewTerminalLine(line);
}

function writeCommandHistory(commandText) {
  const line = document.createElement("p");
  line.className = "terminal__history-command";
  line.textContent = `/${commandText}`;
  terminalOutput.append(line);
  scrollToNewTerminalLine(line);
}

function writeChatMessage(message) {
  writeTerminalLine(`Anonymous: ${message.body}`);
}

function stopChatSubscription() {
  if (chatSubscription && chatClient) void chatClient.removeChannel(chatSubscription);
  chatSubscription = null;
  activeChatRoom = null;
}

function addChatMessage(message) {
  if (!activeChatRoom || message.room_id !== activeChatRoom.id || activeChatRoom.messageIds.has(message.id)) return;
  activeChatRoom.messageIds.add(message.id);
  writeChatMessage(message);
}

function startChatSubscription(room) {
  if (!chatClient || !activeChatRoom) return;
  const subscription = chatClient
    .channel(`life-terminal-room-${room.id}-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${room.id}` },
      ({ new: message }) => addChatMessage(message),
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" && subscription === chatSubscription) {
        writeTerminalLine("! Could not connect to chat. Try again.");
      }
    });
  chatSubscription = subscription;
}

async function findEnabledRoom(roomName) {
  if (!chatClient) throw new Error("Chat is not configured.");
  const { data, error } = await chatClient
    .from("rooms")
    .select("id, name")
    .eq("name", roomName)
    .eq("enabled", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function parseChatArguments(argumentsText) {
  const match = argumentsText.trim().match(/^([^\s_]+)(?:[\s_]+([\s\S]*))?$/);
  return { roomName: match?.[1] || "", message: match?.[2]?.trim() || "" };
}

async function sendChatMessage(argumentsText) {
  const { roomName, message } = parseChatArguments(argumentsText);
  if (!roomName || !message) {
    writeTerminalLine("! Usage: /msg <room> <message>");
    return;
  }
  if (Array.from(message).length > 100) {
    writeTerminalLine("! Message must be 100 characters or fewer.");
    return;
  }
  try {
    const room = await findEnabledRoom(roomName);
    if (!room) {
      writeTerminalLine("! Room not found.");
      return;
    }
    const pendingKey = `${room.id}\u0000${message}`;
    if (pendingChatMessages.has(pendingKey)) return;
    pendingChatMessages.add(pendingKey);
    let data;
    let error;
    try {
      ({ data, error } = await chatClient
        .from("messages")
        .insert({ room_id: room.id, body: message })
        .select("id, room_id, body")
        .single());
    } finally {
      pendingChatMessages.delete(pendingKey);
    }
    if (error) throw error;
    addChatMessage(data);
    writeTerminalLine("✓ Message sent.");
  } catch {
    writeTerminalLine("! Could not connect to chat. Try again.");
  }
}

async function openChatRoom(argumentsText) {
  const roomName = argumentsText.trim().split(/\s+/)[0] || "";
  if (!roomName) {
    writeTerminalLine("! Usage: /room <room>");
    return false;
  }
  stopChatSubscription();
  try {
    const room = await findEnabledRoom(roomName);
    if (!room) {
      writeTerminalLine("! Room not found.");
      return false;
    }
    const { data, error } = await chatClient
      .from("messages")
      .select("id, room_id, body")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(10);
    if (error) throw error;
    activeChatRoom = { id: room.id, messageIds: new Set() };
    [...data].reverse().forEach(addChatMessage);
    if (data.length === 0) writeTerminalLine("(no messages)");
    startChatSubscription(room);
    return true;
  } catch {
    writeTerminalLine("! Could not connect to chat. Try again.");
    return false;
  }
}

function writeNoteRow(note) {
  const line = document.createElement("p");
  line.className = "terminal__csv-line";
  const code = String(note.code || "--").toUpperCase();
  line.append(`${note.id}, `);
  const codeToken = document.createElement("span");
  codeToken.className = "terminal__note-code";
  codeToken.textContent = code;
  line.append(codeToken, `, ${note.notes}, ${formatDeadline(note.date_deadline)}, ${note.status}`);
  terminalOutput.append(line);
  scrollToNewTerminalLine(line);
}

function clearTerminal() {
  stopChatSubscription();
  commandInput.value = "";
  terminalOutput.replaceChildren();
  updateCommandUi();
  commandInput.focus();
}

function resetNoteClearConfirmation() {
  awaitingNoteClearCode = false;
  terminal.classList.remove("is-confirming-note-clear");
  commandInput.type = "text";
  commandInput.setAttribute("aria-label", "Terminal command");
}

function resetNoteCodeEntry() {
  awaitingNoteCode = false;
  pendingNote = null;
  terminal.classList.remove("is-confirming-note-code");
  confirmationLabel.textContent = "ENTER CODE TO PURGE NOTES: ";
  commandInput.removeAttribute("maxlength");
}

function resetNoteDropConfirmation() {
  awaitingNoteDropConfirmation = false;
  pendingNoteDropCode = "";
  terminal.classList.remove("is-confirming-note-drop");
  confirmationLabel.textContent = "ENTER CODE TO PURGE NOTES: ";
  commandInput.removeAttribute("maxlength");
  commandInput.setAttribute("aria-label", "Terminal command");
}

function startNoteCodeEntry(note) {
  pendingNote = note;
  awaitingNoteCode = true;
  terminal.classList.add("is-confirming-note-code");
  confirmationLabel.textContent = "ENTER UNIQUE 2-LETTER TASK CODE: ";
  commandInput.value = "";
  commandInput.maxLength = 2;
  commandInput.setAttribute("aria-label", "Unique two-letter code for this task");
  writeTerminalLine("TASK STAGED. ASSIGN A UNIQUE TWO-LETTER CODE:");
  updateCommandUi();
  commandInput.focus();
}

function confirmNoteCode() {
  const code = commandInput.value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    writeTerminalLine("! CODE REJECTED: enter exactly two letters (A-Z).", "terminal__error");
    commandInput.value = "";
    updateCommandUi();
    commandInput.focus();
    return;
  }
  if (notes.some((note) => String(note.code || "").toUpperCase() === code)) {
    writeTerminalLine(`! CODE COLLISION: ${code} is already assigned. Choose another code.`, "terminal__error");
    commandInput.value = "";
    updateCommandUi();
    commandInput.focus();
    return;
  }

  const note = pendingNote;
  resetNoteCodeEntry();
  saveNote(note, code);
  prepareNextCommand();
}

function startNoteClearConfirmation() {
  writeTerminalLine("! WARNING: THIS WILL ERASE EVERY SAVED NOTE.", "terminal__error");
  awaitingNoteClearCode = true;
  terminal.classList.add("is-confirming-note-clear");
  commandInput.value = "";
  commandInput.type = "password";
  commandInput.setAttribute("aria-label", "Confirmation code for clearing notes");
  updateCommandUi();
  commandInput.focus();
}

function confirmNoteClear() {
  const isConfirmed = commandInput.value === noteClearCode;
  resetNoteClearConfirmation();

  if (isConfirmed) {
    const clearedCount = notes.length;
    notes = [];
    persistNotes();
    writeTerminalLine(`✓ NOTES PURGED: ${clearedCount} record(s) deleted.`);
  } else {
    writeTerminalLine("! ACCESS DENIED: confirmation code incorrect. Notes were not changed.", "terminal__error");
  }

  prepareNextCommand();
}

function startNoteDropConfirmation(code) {
  pendingNoteDropCode = code;
  awaitingNoteDropConfirmation = true;
  terminal.classList.add("is-confirming-note-drop");
  confirmationLabel.textContent = "CONFIRM TASK DELETE: ";
  commandInput.value = "";
  commandInput.maxLength = noteDropConfirmationPrefix.length + 2;
  commandInput.setAttribute("aria-label", `Confirmation code to delete task ${code}`);
  writeTerminalLine(
    `! DELETE TASK ${code}? TYPE ${noteDropConfirmationPrefix}${code} TO CONFIRM.`,
    "terminal__error",
  );
  updateCommandUi();
  commandInput.focus();
}

function confirmNoteDrop() {
  const code = pendingNoteDropCode;
  const expectedConfirmation = `${noteDropConfirmationPrefix}${code}`;
  const isConfirmed = commandInput.value === expectedConfirmation;
  resetNoteDropConfirmation();

  if (isConfirmed) {
    const noteIndex = notes.findIndex(
      (note) => String(note.code || "").toUpperCase() === code,
    );
    if (noteIndex >= 0) {
      notes.splice(noteIndex, 1);
      persistNotes();
      writeTerminalLine(`✓ TASK ${code} DROPPED: record deleted.`);
    } else {
      writeTerminalLine(`! TASK ${code} NOT FOUND: nothing was deleted.`, "terminal__error");
    }
  } else {
    writeTerminalLine("! DELETE ABORTED: confirmation code incorrect.", "terminal__error");
  }

  prepareNextCommand();
}

function openTerminal() {
  if (isActive) return;
  isActive = true;
  terminal.classList.add("is-active", "is-opening");
  commandButtonText.textContent = "X";
  commandButton.setAttribute("aria-label", "Close command input");
  commandButton.setAttribute("aria-expanded", "true");
  updateCommandUi();
  window.setTimeout(() => commandInput.focus(), 100);
  window.setTimeout(() => terminal.classList.remove("is-opening"), 200);
}

function closeTerminal({ preserveContent = false } = {}) {
  if (!isActive) return;
  stopChatSubscription();
  isActive = false;
  resetNoteClearConfirmation();
  resetNoteCodeEntry();
  resetNoteDropConfirmation();
  if (!preserveContent) {
    commandInput.value = "";
    commandSuggestion.replaceChildren();
    commandRender.replaceChildren();
    commandStatus.textContent = "";
  }
  commandControls.classList.remove("has-command");
  terminal.classList.remove("is-active", "is-opening");
  hideKeyboard();
  commandButtonText.textContent = "/";
  commandButton.setAttribute("aria-label", "Open command input");
  commandButton.setAttribute("aria-expanded", "false");
  commandButton.focus();
}

function toggleTerminal() {
  if (isActive) closeTerminal();
  else openTerminal();
}

function completeSuggestion() {
  const suggestion = findSuggestion(commandInput.value);
  if (!suggestion) return;
  const selectedCommand = commandDefinitions.find((command) => command.name === suggestion);
  commandInput.value = selectedCommand && selectedCommand.name !== "clear"
    ? `${suggestion} `
    : suggestion;
  updateCommandUi();
  commandInput.focus();
}

function insertSeparator() {
  if (awaitingNoteClearCode || awaitingNoteCode || awaitingNoteDropConfirmation) return;
  const cursorStart = commandInput.selectionStart ?? commandInput.value.length;
  const cursorEnd = commandInput.selectionEnd ?? cursorStart;
  const value = commandInput.value;
  commandInput.value = `${value.slice(0, cursorStart)}_${value.slice(cursorEnd)}`;
  updateCommandUi();
  commandInput.focus();
  commandInput.setSelectionRange(cursorStart + 1, cursorStart + 1);
}

function parseCommand(rawInput) {
  const input = rawInput.trim();
  const dividerIndex = input.search(/[\s_]/);
  const commandName = (dividerIndex === -1 ? input : input.slice(0, dividerIndex)).toLowerCase();
  const argumentsText = dividerIndex === -1 ? "" : input.slice(dividerIndex + 1).trim();
  return {
    command: commandDefinitions.find((item) => item.name === commandName),
    argumentsText,
  };
}

function parseNote(argumentsText) {
  const parts = argumentsText.split("_").map((part) => part.trim());
  return { notes: parts.shift() || "", date_deadline: parts.shift() || null };
}

function normalizeDeadline(value) {
  if (typeof value !== "string" || !value.trim()) return { value: null };
  const match = value.trim().match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{2}|\d{4})$/);
  if (!match) return { error: "deadline must use day, month, year (for example 28-09-2026)." };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { error: "deadline is not a valid calendar date." };
  }
  return { value: `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}` };
}

function saveNote(note, code) {

  const lastId = notes.reduce((highestId, savedNote) => {
    return Math.max(highestId, Number(savedNote.id) || 0);
  }, 0);
  const savedNote = {
    id: lastId + 1,
    code,
    notes: note.notes,
    category: null,
    date_created: new Date().toISOString(),
    date_deadline: note.date_deadline,
    status: "incomplete",
  };
  notes.push(savedNote);
  persistNotes();

  writeTerminalLine(`✓ TASK ${code} SAVED: Note #${savedNote.id} armed.`);
}

function parseDeadline(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  match = text.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return null;
}

function filterNotes(filter) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (filter) {
    case "all":
      return notes;
    case "incomplete":
    case "complete":
      return notes.filter((note) => note.status === "complete" || note.status === "done");
    case "nodeadline":
      return notes.filter((note) => !note.date_deadline);
    case "overdue":
      return notes.filter((note) => {
        const deadline = parseDeadline(note.date_deadline);
        return deadline && deadline < today && note.status !== "complete" && note.status !== "done";
      });
    default:
      return null;
  }
}

function formatDeadline(deadline) {
  if (!deadline) return "no deadline";
  const value = String(deadline).trim();
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;

  match = value.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/);
  if (match) return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`;
  return value;
}

async function showNotes(argumentsText) {
  const filter = argumentsText.toLowerCase().split(/[\s_]/)[0] || "all";
  const filteredNotes = filterNotes(filter);
  if (!filteredNotes) throw new Error("Invalid note filter.");

  if (filteredNotes.length === 0) {
    writeTerminalLine("(no notes)");
  } else {
    filteredNotes.forEach(writeNoteRow);
  }
  return true;
}

function showHelp() {
  const activeCommands = [
    ["/note", "Tạo ghi chú và đặt hạn"],
    ["/noteshow", "Xem ghi chú theo trạng thái"],
    ["/notedone", "Đánh dấu task đã hoàn thành"],
    ["/notedrop", "Xóa một task đã chọn"],
    ["/noteclear", "Xóa toàn bộ ghi chú đã lưu"],
    ["/room", "Mở phòng chat thời gian thực"],
    ["/msg", "Gửi tin nhắn vào phòng"],
    ["/clear", "Xóa lịch sử terminal đang xem"],
    ["/help", "Hiện các lệnh đang hoạt động"],
  ];

  writeTerminalLine("ACTIVE COMMANDS:", "terminal__history-command");
  activeCommands.forEach(([command, description]) => {
    writeTerminalLine(`${command} — ${description}`);
  });
  writeTerminalLine("Gõ lệnh; dùng _ để ngăn phần.");
  writeTerminalLine("Nhấn › để chạy. Nhấn Esc để đóng.");
}

function prepareNextCommand() {
  commandInput.value = "";
  updateCommandUi();
  closeTerminal({ preserveContent: true });
}

function validationError(command, argumentsText) {
  const input = commandInput.value.trim();
  if (!input) return "Syntax error: enter a command, for example /note mua dầu ăn.";
  if (!command) return `Syntax error: unknown command /${input.split(/[\s_]/)[0]}.`;

  // Commands marked inactive deliberately remain inert, as defined in commands.json.
  if (command.active !== true) return null;

  if (command.name === "note") {
    const note = parseNote(argumentsText);
    if (!note.notes) return "Syntax error: /note needs note text. Example: /note mua dầu ăn.";
    const deadline = normalizeDeadline(note.date_deadline);
    if (deadline.error) return `Syntax error: ${deadline.error}`;
  }

  if (command.name === "noteshow") {
    const filter = argumentsText.trim().toLowerCase();
    if (filter && !noteShowFilters.includes(filter)) {
      return "Syntax error: /noteshow accepts all, incomplete, complete, nodeadline, or overdue.";
    }
  }

  if (command.name === "clear" && argumentsText.trim()) {
    return "Syntax error: /clear does not accept additional text.";
  }

  if (command.name === "noteclear" && argumentsText.trim()) {
    return "Syntax error: /noteclear does not accept additional text.";
  }

  if (command.name === "notedone" && !/^[a-zA-Z]{2}$/.test(argumentsText.trim())) {
    return "Syntax error: /notedone needs a two-letter task code. Example: /notedone AB.";
  }

  if (command.name === "notedrop" && !/^[a-zA-Z]{2}$/.test(argumentsText.trim())) {
    return "Syntax error: /notedrop needs a two-letter task code. Example: /notedrop AB.";
  }

  return "";
}

async function submitCommand() {
  if (awaitingNoteClearCode) {
    confirmNoteClear();
    return;
  }
  if (awaitingNoteCode) {
    confirmNoteCode();
    return;
  }
  if (awaitingNoteDropConfirmation) {
    confirmNoteDrop();
    return;
  }

  const { command, argumentsText } = parseCommand(commandInput.value);
  const error = validationError(command, argumentsText);
  if (error === null) return;
  if (error) {
    if (commandInput.value.trim()) writeCommandHistory(commandInput.value.trim());
    writeTerminalLine(`! ${error}`, "terminal__error");
    prepareNextCommand();
    return;
  }
  if (!isDataReady) {
    writeTerminalLine("! Data is loading.");
    return;
  }

  try {
    if (command.name === "clear") {
      clearTerminal();
      closeTerminal({ preserveContent: true });
      return;
    }

    // Preserve the command itself in the terminal before writing its result.
    writeCommandHistory(commandInput.value.trim());

    if (command.name === "noteclear") {
      startNoteClearConfirmation();
      return;
    }

    if (command.name === "notedrop") {
      const code = argumentsText.trim().toUpperCase();
      const note = notes.find((item) => String(item.code || "").toUpperCase() === code);
      if (!note) {
        writeTerminalLine(`! TASK ${code} NOT FOUND: nothing was deleted.`, "terminal__error");
      } else {
        startNoteDropConfirmation(code);
        return;
      }
    }

    if (command.name === "note") {
      const note = parseNote(argumentsText);
      note.date_deadline = normalizeDeadline(note.date_deadline).value;
      startNoteCodeEntry(note);
      return;
    }
    if (command.name === "help") {
      showHelp();
      commandInput.value = "";
      updateCommandUi();
      return;
    }
    if (command.name === "noteshow") await showNotes(argumentsText);
    if (command.name === "msg") await sendChatMessage(argumentsText);
    if (command.name === "room") {
      const opened = await openChatRoom(argumentsText);
      if (opened) {
        commandInput.value = "";
        updateCommandUi();
        return;
      }
    }
    if (command.name === "notedone") {
      const code = argumentsText.trim().toUpperCase();
      const note = notes.find((item) => String(item.code || "").toUpperCase() === code);
      if (!note) {
        writeTerminalLine(`! TASK ${code} NOT FOUND: no status was changed.`, "terminal__error");
      } else if (note.status === "done") {
        writeTerminalLine(`! TASK ${code} IS ALREADY DONE.`, "terminal__error");
      } else {
        note.status = "done";
        persistNotes();
        writeTerminalLine(`✓ TASK ${code} STATUS UPDATED: DONE.`);
      }
    }

    prepareNextCommand();
  } catch (error) {
    writeTerminalLine(`! ${error.message}`);
    prepareNextCommand();
  }
}

commandButton.addEventListener("click", toggleTerminal);
separatorButton.addEventListener("click", () => {
  insertSeparator();
});
completeButton.addEventListener("click", () => {
  completeSuggestion();
  // Keep the input focused: accepting a suggestion should let the user type
  // the next command segment without reopening the Android keyboard.
  commandInput.focus();
});
submitButton.addEventListener("click", () => void submitCommand());

commandButton.addEventListener("pointerdown", () => commandButton.classList.add("is-holding"));
["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
  commandButton.addEventListener(eventName, () => commandButton.classList.remove("is-holding"));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isActive) {
    event.preventDefault();
    closeTerminal();
  }
});

commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (awaitingNoteClearCode || awaitingNoteCode || awaitingNoteDropConfirmation)) {
    event.preventDefault();
    void submitCommand();
    return;
  }
  // After a completed /noteshow, a filter's first letter can be typed directly.
  if (
    commandInput.value.trim().toLowerCase() === "noteshow"
    && /^[a-z]$/i.test(event.key)
    && noteShowFilters.some((filter) => filter.startsWith(event.key.toLowerCase()))
  ) {
    event.preventDefault();
    commandInput.value = `noteshow ${event.key}`;
    updateCommandUi();
  }

  if (event.key === "Tab" && findSuggestion(commandInput.value)) {
    event.preventDefault();
    completeSuggestion();
  }
  // Enter completes a command name only; the > button runs an active command.
  if (event.key === "Enter") {
    event.preventDefault();
    completeSuggestion();
  }
});

commandInput.addEventListener("input", () => {
  if (awaitingNoteCode) {
    commandInput.value = commandInput.value.replace(/[^a-z]/gi, "").toUpperCase();
  } else {
    const noteCodeMatch = commandInput.value.match(/^(note(?:done|drop)[\s_]+)(.*)$/i);
    if (noteCodeMatch) {
      commandInput.value = `${noteCodeMatch[1]}${noteCodeMatch[2].replace(/[^a-z]/gi, "").toUpperCase()}`;
    }
  }
  updateCommandUi();
});
terminal.addEventListener("transitionend", (event) => {
  if (event.propertyName === "height") scrollTerminalToEnd();
});
commandLine.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

commandLine.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  const horizontalDistance = touchStartX - touch.clientX;
  const verticalDistance = Math.abs(touchStartY - touch.clientY);
  if (horizontalDistance >= 42 && horizontalDistance > verticalDistance && findSuggestion(commandInput.value)) {
    completeSuggestion();
  }
}, { passive: true });

updateViewportHeight();
window.addEventListener("resize", updateViewportHeight);
window.visualViewport?.addEventListener("resize", updateViewportHeight);
window.addEventListener("beforeunload", stopChatSubscription);
initializeData();
