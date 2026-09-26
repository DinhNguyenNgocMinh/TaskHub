// LIFE TERMINAL command UI. Only commands marked active in commands.json can run.
const terminal = document.querySelector("#terminal");
const terminalOutput = document.querySelector("#terminal-output");
const terminalScrollArea = document.querySelector("#terminal-scroll-area");
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

let isActive = false;
let commandDefinitions = [
  { name: "note", active: true },
  { name: "noteshow", active: true },
  { name: "msg", active: true },
  { name: "room", active: true },
  { name: "call", active: false },
  { name: "mail", active: false },
  { name: "reply", active: false },
  { name: "list", active: false },
  { name: "search", active: false },
  { name: "help", active: false },
  { name: "clear", active: true },
];
const noteShowFilters = ["all", "incomplete", "complete", "nodeadline", "overdue"];
// Web notes intentionally live only for the current page session. A reload, hard reload,
// or closing the tab discards this in-memory cache; chat remains in Supabase.
let sessionNotes = [];
const chatConfig = window.LIFE_TERMINAL_CHAT_CONFIG || {};
const chatClient = createChatClient();
const pendingChatMessages = new Set();
let activeChatRoom = null;
let chatSubscription = null;

function createChatClient() {
  const { supabaseUrl, supabaseAnonKey } = chatConfig;
  if (!supabaseUrl || !supabaseAnonKey || !window.supabase?.createClient) return null;

  try {
    return window.supabase.createClient(supabaseUrl, supabaseAnonKey);
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

function findSuggestion(value) {
  const rawValue = value.toLowerCase();
  const query = rawValue.trim();
  if (!query) return "";

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

function renderCommandText(value) {
  commandRender.replaceChildren();
  if (!value) return;

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

  if (suggestion) {
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
}

function writeTerminalLine(message, className = "") {
  const line = document.createElement("p");
  line.className = className;
  line.textContent = message;
  terminalOutput.append(line);
  scrollTerminalToEnd();
}

function writeCommandHistory(commandText) {
  const line = document.createElement("p");
  line.className = "terminal__history-command";
  line.textContent = `/${commandText}`;
  terminalOutput.append(line);
  scrollTerminalToEnd();
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
  return {
    roomName: match?.[1] || "",
    message: match?.[2]?.trim() || "",
  };
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

function clearTerminal() {
  stopChatSubscription();
  commandInput.value = "";
  terminalOutput.replaceChildren();
  updateCommandUi();
  commandInput.focus();
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
  if (!preserveContent) {
    commandInput.value = "";
    commandSuggestion.replaceChildren();
    commandRender.replaceChildren();
    commandStatus.textContent = "";
  }
  commandControls.classList.remove("has-command");
  terminal.classList.remove("is-active", "is-opening");
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
  commandInput.value = suggestion;
  updateCommandUi();
  commandInput.focus();
}

function insertSeparator() {
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

async function saveNote(argumentsText) {
  const note = parseNote(argumentsText);
  if (!note.notes) {
    writeTerminalLine("! Note content is required.");
    return false;
  }

  const lastId = sessionNotes.reduce((highestId, savedNote) => {
    return Math.max(highestId, Number(savedNote.id) || 0);
  }, 0);
  const savedNote = {
    id: lastId + 1,
    notes: note.notes,
    category: null,
    date_created: new Date().toISOString(),
    date_deadline: note.date_deadline,
    status: "incomplete",
  };
  sessionNotes.push(savedNote);
  writeTerminalLine(`✓ Note #${savedNote.id} saved.`);
  return true;
}

function parseDeadline(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return null;
}

function filterSessionNotes(filter) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (filter) {
    case "all":
      return sessionNotes;
    case "incomplete":
    case "complete":
      return sessionNotes.filter((note) => note.status === filter);
    case "nodeadline":
      return sessionNotes.filter((note) => !note.date_deadline);
    case "overdue":
      return sessionNotes.filter((note) => {
        const deadline = parseDeadline(note.date_deadline);
        return deadline && deadline < today && note.status !== "complete";
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

  match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`;
  return value;
}

async function showNotes(argumentsText) {
  const filter = argumentsText.toLowerCase().split(/[\s_]/)[0] || "all";
  const notes = filterSessionNotes(filter);
  if (!notes) throw new Error("Invalid note filter.");

  if (notes.length === 0) {
    writeTerminalLine("(no notes)");
  } else {
    notes.forEach((note) => {
      writeTerminalLine(
        `${note.id}, ${note.notes}, ${formatDeadline(note.date_deadline)}, ${note.status}`,
        "terminal__csv-line",
      );
    });
  }
  return true;
}

function prepareNextCommand() {
  commandInput.value = "";
  updateCommandUi();
  closeTerminal({ preserveContent: true });
}

async function submitCommand() {
  const { command, argumentsText } = parseCommand(commandInput.value);
  // Inactive and unknown commands intentionally do nothing.
  if (!command || command.active !== true) return;

  try {
    if (command.name === "clear") {
      clearTerminal();
      closeTerminal({ preserveContent: true });
      return;
    }

    // Preserve the command itself in the terminal before writing its result.
    writeCommandHistory(commandInput.value.trim());

    if (command.name === "note") await saveNote(argumentsText);
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

    prepareNextCommand();
  } catch (error) {
    writeTerminalLine(`! ${error.message}`);
    prepareNextCommand();
  }
}

commandButton.addEventListener("click", toggleTerminal);
separatorButton.addEventListener("click", insertSeparator);
completeButton.addEventListener("click", completeSuggestion);
submitButton.addEventListener("click", () => void submitCommand());

commandButton.addEventListener("pointerdown", () => commandButton.classList.add("is-holding"));
["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
  commandButton.addEventListener(eventName, () => commandButton.classList.remove("is-holding"));
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "/"
    && !isActive
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
  ) {
    event.preventDefault();
    openTerminal();
    return;
  }

  if (event.key === "Escape" && isActive) {
    event.preventDefault();
    closeTerminal();
  }
});

commandInput.addEventListener("keydown", (event) => {
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
  // Tab accepts a suggestion; Enter runs the command currently in the input.
  if (event.key === "Enter") {
    event.preventDefault();
    void submitCommand();
  }
});

commandInput.addEventListener("input", updateCommandUi);
window.addEventListener("beforeunload", stopChatSubscription);
loadCommands();
