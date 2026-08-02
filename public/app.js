const DEFAULT_COMPOSER_STATUS = 'Enter para enviar · Shift + Enter para una nueva línea';
const MAX_RECORDING_MS = 2 * 60 * 1000;
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const PREFERRED_AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

const state = {
  conversations: [],
  conversationTypes: [],
  defaultTypeId: null,
  activeConversation: null,
  sending: false,
  changingMode: false,
  voiceSupported: true,
  voiceStarting: false,
  recording: false,
  transcribing: false,
  mediaRecorder: null,
  mediaStream: null,
  audioChunks: [],
  recordingMimeType: '',
  recordingStartedAt: 0,
  recordingInterval: null,
  maxRecordingTimeout: null,
  insertionRange: { start: 0, end: 0 }
};

const elements = {
  activeTitle: document.querySelector('#activeConversationTitle'),
  composerStatus: document.querySelector('#composerStatus'),
  conversationCount: document.querySelector('#conversationCount'),
  conversationList: document.querySelector('#conversationList'),
  conversationTypeSelect: document.querySelector('#conversationTypeSelect'),
  errorMessage: document.querySelector('#errorMessage'),
  errorToast: document.querySelector('#errorToast'),
  form: document.querySelector('#messageForm'),
  input: document.querySelector('#messageInput'),
  messageList: document.querySelector('#messageList'),
  messageStage: document.querySelector('#messageStage'),
  newConversationButton: document.querySelector('#newConversationButton'),
  sendButton: document.querySelector('#sendButton'),
  sidebar: document.querySelector('#conversationSidebar'),
  voiceButton: document.querySelector('#voiceButton'),
  voiceIcon: document.querySelector('#voiceIcon')
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No pudimos completar la solicitud.');
  }

  return data;
}

function formatTime(value) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function getConversationType(typeId) {
  return state.conversationTypes.find((type) => type.id === typeId);
}

function getAssistantName(typeId) {
  return getConversationType(typeId)?.usesAI ? 'GPT-5.6 Sol' : 'Meditations Bot';
}

function showError(error) {
  elements.errorMessage.textContent = error.message;
  bootstrap.Toast.getOrCreateInstance(elements.errorToast).show();
}

function isVoiceBusy() {
  return state.voiceStarting || state.recording || state.transcribing;
}

function rememberInsertionRange() {
  state.insertionRange = {
    start: elements.input.selectionStart ?? elements.input.value.length,
    end: elements.input.selectionEnd ?? elements.input.value.length
  };
}

function formatRecordingDuration() {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.recordingStartedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function renderComposerState() {
  const voiceBusy = isVoiceBusy();

  elements.input.disabled = state.sending;
  elements.input.readOnly = voiceBusy;
  elements.sendButton.disabled = state.sending || voiceBusy;
  elements.voiceButton.disabled = (
    !state.voiceSupported ||
    state.sending ||
    state.voiceStarting ||
    state.transcribing
  );
  elements.newConversationButton.disabled = state.sending || voiceBusy;

  elements.voiceButton.classList.toggle('is-recording', state.recording);
  elements.voiceButton.classList.toggle('is-transcribing', state.transcribing || state.voiceStarting);
  elements.voiceButton.setAttribute('aria-pressed', String(state.recording));
  elements.composerStatus.classList.toggle('is-recording', state.recording);
  elements.composerStatus.classList.toggle('is-transcribing', state.transcribing || state.voiceStarting);

  if (state.recording) {
    elements.voiceButton.disabled = false;
    elements.voiceButton.title = 'Detener grabación';
    elements.voiceButton.setAttribute('aria-label', 'Detener grabación de voz');
    elements.voiceIcon.className = 'bi bi-stop-fill';
    elements.composerStatus.textContent = `Grabando ${formatRecordingDuration()} · Presiona el botón para detener`;
  } else if (state.transcribing) {
    elements.voiceButton.title = 'Transcribiendo audio';
    elements.voiceButton.setAttribute('aria-label', 'Transcribiendo audio');
    elements.voiceIcon.className = 'spinner-border spinner-border-sm';
    elements.composerStatus.textContent = 'Transcribiendo con OpenAI…';
  } else if (state.voiceStarting) {
    elements.voiceButton.title = 'Solicitando acceso al micrófono';
    elements.voiceButton.setAttribute('aria-label', 'Solicitando acceso al micrófono');
    elements.voiceIcon.className = 'spinner-border spinner-border-sm';
    elements.composerStatus.textContent = 'Esperando permiso para usar el micrófono…';
  } else {
    elements.voiceButton.title = state.voiceSupported
      ? 'Dictar por voz'
      : 'La grabación de voz no está disponible en este navegador';
    elements.voiceButton.setAttribute('aria-label', 'Iniciar grabación de voz');
    elements.voiceIcon.className = 'bi bi-mic';
    elements.composerStatus.textContent = DEFAULT_COMPOSER_STATUS;
  }

  renderConversationMode();
}

function renderConversationTypeOptions() {
  const options = state.conversationTypes.map((type) => {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = type.shortName || type.name;
    option.title = type.description;
    return option;
  });

  elements.conversationTypeSelect.replaceChildren(...options);
  renderConversationMode();
}

function renderConversationMode() {
  const activeTypeId = state.activeConversation?.typeId || state.defaultTypeId;

  if (activeTypeId) elements.conversationTypeSelect.value = activeTypeId;
  elements.conversationTypeSelect.disabled = (
    !state.activeConversation ||
    state.sending ||
    state.changingMode ||
    isVoiceBusy() ||
    state.conversationTypes.length === 0
  );

  const activeType = getConversationType(activeTypeId);
  elements.conversationTypeSelect.title = activeType?.description || 'Modo de respuesta';
}

function createConversationItem(conversation) {
  const button = document.createElement('button');
  const title = document.createElement('div');
  const preview = document.createElement('div');

  button.type = 'button';
  button.className = `conversation-item${conversation.id === state.activeConversation?.id ? ' active' : ''}`;
  button.dataset.id = conversation.id;
  button.setAttribute('aria-current', conversation.id === state.activeConversation?.id ? 'true' : 'false');

  title.className = 'conversation-title';
  title.textContent = conversation.title;
  preview.className = 'conversation-preview';
  preview.textContent = conversation.preview;

  button.append(title, preview);
  button.addEventListener('click', () => selectConversation(conversation.id));
  return button;
}

function renderConversationList() {
  elements.conversationList.replaceChildren(...state.conversations.map(createConversationItem));
  elements.conversationCount.textContent = state.conversations.length;
}

function createWelcomeState() {
  const type = getConversationType(state.activeConversation?.typeId);
  const wrapper = document.createElement('div');
  const symbol = document.createElement('div');
  const title = document.createElement('h3');
  const copy = document.createElement('p');

  wrapper.className = 'welcome-state';
  symbol.className = 'welcome-symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.innerHTML = '<i class="bi bi-stars"></i>';
  title.className = 'welcome-title';
  title.textContent = 'Inicia una nueva reflexión';
  copy.className = 'welcome-copy';
  copy.textContent = type?.description || 'Escribe tu primer mensaje para comenzar.';

  wrapper.append(symbol, title, copy);
  return wrapper;
}

function createMessageElement(message) {
  const isUser = message.role === 'user';
  const row = document.createElement('article');
  const avatar = document.createElement('div');
  const content = document.createElement('div');
  const meta = document.createElement('div');
  const bubble = document.createElement('div');

  row.className = `message-row ${message.role}`;
  avatar.className = 'message-avatar';
  avatar.innerHTML = `<i class="bi ${isUser ? 'bi-person' : 'bi-stars'}" aria-hidden="true"></i>`;
  content.className = 'message-content';
  meta.className = 'message-meta';
  meta.textContent = `${isUser ? 'Tú' : getAssistantName(message.typeId || state.activeConversation?.typeId)} · ${formatTime(message.createdAt)}`;
  bubble.className = 'message-bubble';
  bubble.textContent = message.content;

  content.append(meta, bubble);
  row.append(avatar, content);
  return row;
}

function createTypingElement() {
  const row = document.createElement('article');
  row.className = 'message-row assistant';
  row.id = 'typingIndicator';
  row.innerHTML = `
    <div class="message-avatar"><i class="bi bi-stars" aria-hidden="true"></i></div>
    <div class="message-content">
      <div class="message-meta">${getAssistantName(state.activeConversation?.typeId)}</div>
      <div class="message-bubble typing-bubble" aria-label="El asistente está respondiendo">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  return row;
}

function renderMessages() {
  const messages = state.activeConversation?.messages || [];

  if (messages.length === 0) {
    elements.messageList.replaceChildren(createWelcomeState());
  } else {
    elements.messageList.replaceChildren(...messages.map(createMessageElement));
  }

  elements.activeTitle.textContent = state.activeConversation?.title || 'Nueva conversación';
  renderConversationMode();
  requestAnimationFrame(scrollToLatest);
}

function scrollToLatest() {
  elements.messageStage.scrollTop = elements.messageStage.scrollHeight;
}

function closeMobileSidebar() {
  if (window.innerWidth < 992) {
    bootstrap.Offcanvas.getOrCreateInstance(elements.sidebar).hide();
  }
}

async function loadConversationTypes() {
  const data = await request('/api/conversation-types');
  state.conversationTypes = data.conversationTypes;
  state.defaultTypeId = data.defaultTypeId;
  renderConversationTypeOptions();
}

async function loadConversations() {
  const data = await request('/api/conversations');
  state.conversations = data.conversations;

  if (state.conversations.length === 0) {
    await createNewConversation();
    return;
  }

  await selectConversation(state.conversations[0].id);
}

async function createNewConversation() {
  if (isVoiceBusy()) return;

  try {
    elements.newConversationButton.disabled = true;
    const data = await request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ typeId: state.defaultTypeId })
    });

    const summary = {
      ...data.conversation,
      messageCount: 0,
      preview: 'Conversación nueva'
    };
    state.conversations = [summary, ...state.conversations];
    state.activeConversation = data.conversation;
    renderConversationList();
    renderMessages();
    closeMobileSidebar();
    elements.input.focus();
  } catch (error) {
    showError(error);
  } finally {
    elements.newConversationButton.disabled = false;
  }
}

async function selectConversation(id) {
  if (isVoiceBusy()) return;

  if (state.activeConversation?.id === id) {
    closeMobileSidebar();
    return;
  }

  try {
    const data = await request(`/api/conversations/${id}`);
    state.activeConversation = data.conversation;
    renderConversationList();
    renderMessages();
    closeMobileSidebar();
  } catch (error) {
    showError(error);
  }
}

async function changeConversationType() {
  if (!state.activeConversation || state.changingMode || isVoiceBusy()) return;

  const previousTypeId = state.activeConversation.typeId;
  const typeId = elements.conversationTypeSelect.value;

  if (typeId === previousTypeId) return;

  state.changingMode = true;
  renderConversationMode();

  try {
    const data = await request(`/api/conversations/${state.activeConversation.id}/type`, {
      method: 'PATCH',
      body: JSON.stringify({ typeId })
    });
    state.activeConversation = data.conversation;

    const refreshed = await request('/api/conversations');
    state.conversations = refreshed.conversations;
    renderConversationList();
    renderMessages();
  } catch (error) {
    elements.conversationTypeSelect.value = previousTypeId;
    showError(error);
  } finally {
    state.changingMode = false;
    renderConversationMode();
  }
}

function setSending(value) {
  state.sending = value;
  renderComposerState();
}

function resizeInput() {
  elements.input.style.height = 'auto';
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 130)}px`;
}

function getSupportedAudioType() {
  return PREFERRED_AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function releaseMicrophone() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
  }
  state.mediaStream = null;
}

function clearRecordingTimers() {
  clearInterval(state.recordingInterval);
  clearTimeout(state.maxRecordingTimeout);
  state.recordingInterval = null;
  state.maxRecordingTimeout = null;
}

function describeMicrophoneError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return 'No se concedió acceso al micrófono. Habilítalo en los permisos del navegador e intenta nuevamente.';
  }
  if (error.name === 'NotFoundError') {
    return 'No se encontró un micrófono disponible en este dispositivo.';
  }
  if (error.name === 'NotReadableError') {
    return 'El micrófono está siendo usado por otra aplicación o no se puede leer.';
  }
  return error.message || 'No se pudo iniciar la grabación de voz.';
}

function insertTranscription(text) {
  const maxLength = Number(elements.input.maxLength) || 2000;
  const result = TextInsertion.insertTextAtRange(
    elements.input.value,
    text,
    state.insertionRange.start,
    state.insertionRange.end,
    maxLength
  );

  elements.input.value = result.value;
  resizeInput();
  elements.input.focus();
  elements.input.setSelectionRange(result.cursor, result.cursor);
  rememberInsertionRange();

  if (result.truncated) {
    showError(new Error('La transcripción se recortó para respetar el límite de 2000 caracteres.'));
  }
}

async function sendAudioForTranscription(blob) {
  const mimeType = (blob.type || state.recordingMimeType || 'audio/webm').split(';')[0];
  const response = await fetch('/api/transcriptions', {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: blob
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo transcribir la grabación.');
  }

  if (typeof data.text !== 'string' || !data.text.trim()) {
    throw new Error('La transcripción no contiene texto.');
  }

  return data.text;
}

async function finalizeVoiceRecording() {
  clearRecordingTimers();
  releaseMicrophone();

  const blob = new Blob(state.audioChunks, {
    type: state.recordingMimeType || 'audio/webm'
  });
  state.audioChunks = [];
  state.mediaRecorder = null;

  try {
    if (blob.size === 0) {
      throw new Error('La grabación está vacía. Intenta hablar durante unos segundos.');
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      throw new Error('La grabación es demasiado grande. Intenta con un audio más corto.');
    }

    const text = await sendAudioForTranscription(blob);
    insertTranscription(text);
  } catch (error) {
    showError(error);
  } finally {
    state.transcribing = false;
    renderComposerState();
    elements.input.focus();
  }
}

function stopVoiceRecording() {
  if (!state.recording || !state.mediaRecorder) return;

  state.recording = false;
  state.transcribing = true;
  clearRecordingTimers();
  renderComposerState();

  if (state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
}

async function startVoiceRecording() {
  if (!state.voiceSupported || state.sending || isVoiceBusy()) return;

  rememberInsertionRange();
  state.voiceStarting = true;
  renderComposerState();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    const preferredType = getSupportedAudioType();
    const recorder = preferredType
      ? new MediaRecorder(stream, { mimeType: preferredType })
      : new MediaRecorder(stream);

    state.mediaStream = stream;
    state.mediaRecorder = recorder;
    state.audioChunks = [];
    state.recordingMimeType = recorder.mimeType || preferredType || 'audio/webm';

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) state.audioChunks.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      void finalizeVoiceRecording();
    }, { once: true });

    recorder.start(1000);
    state.voiceStarting = false;
    state.recording = true;
    state.recordingStartedAt = Date.now();
    state.recordingInterval = setInterval(renderComposerState, 1000);
    state.maxRecordingTimeout = setTimeout(stopVoiceRecording, MAX_RECORDING_MS);
    renderComposerState();
  } catch (error) {
    releaseMicrophone();
    state.mediaRecorder = null;
    state.audioChunks = [];
    state.voiceStarting = false;
    state.recording = false;
    state.transcribing = false;
    renderComposerState();
    showError(new Error(describeMicrophoneError(error)));
  }
}

function toggleVoiceRecording() {
  if (state.recording) {
    stopVoiceRecording();
  } else {
    void startVoiceRecording();
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const content = elements.input.value.trim();

  if (!content || state.sending || isVoiceBusy() || !state.activeConversation) return;

  const optimisticMessage = {
    id: `pending-${Date.now()}`,
    role: 'user',
    content,
    createdAt: new Date().toISOString()
  };

  elements.input.value = '';
  state.insertionRange = { start: 0, end: 0 };
  resizeInput();
  setSending(true);
  elements.messageList.replaceChildren(
    ...(state.activeConversation.messages || []).map(createMessageElement),
    createMessageElement(optimisticMessage),
    createTypingElement()
  );
  scrollToLatest();

  try {
    const data = await request(`/api/conversations/${state.activeConversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    state.activeConversation = data.conversation;

    const refreshed = await request('/api/conversations');
    state.conversations = refreshed.conversations;
    renderConversationList();
    renderMessages();
  } catch (error) {
    renderMessages();
    elements.input.value = content;
    resizeInput();
    elements.input.setSelectionRange(content.length, content.length);
    rememberInsertionRange();
    showError(error);
  } finally {
    setSending(false);
    elements.input.focus();
  }
}

function initializeVoiceInput() {
  state.voiceSupported = Boolean(
    navigator.mediaDevices?.getUserMedia &&
    window.MediaRecorder &&
    window.TextInsertion
  );
  renderComposerState();
}

elements.newConversationButton.addEventListener('click', createNewConversation);
elements.conversationTypeSelect.addEventListener('change', changeConversationType);
elements.form.addEventListener('submit', sendMessage);
elements.voiceButton.addEventListener('pointerdown', () => {
  if (!isVoiceBusy()) rememberInsertionRange();
});
elements.voiceButton.addEventListener('click', toggleVoiceRecording);
elements.input.addEventListener('input', () => {
  resizeInput();
  rememberInsertionRange();
});
['click', 'keyup', 'select'].forEach((eventName) => {
  elements.input.addEventListener(eventName, rememberInsertionRange);
});
elements.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});

async function initialize() {
  initializeVoiceInput();
  await loadConversationTypes();
  await loadConversations();
}

initialize().catch(showError);
