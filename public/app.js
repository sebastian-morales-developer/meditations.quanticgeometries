const state = {
  conversations: [],
  activeConversation: null,
  sending: false
};

const elements = {
  activeTitle: document.querySelector('#activeConversationTitle'),
  conversationCount: document.querySelector('#conversationCount'),
  conversationList: document.querySelector('#conversationList'),
  errorMessage: document.querySelector('#errorMessage'),
  errorToast: document.querySelector('#errorToast'),
  form: document.querySelector('#messageForm'),
  input: document.querySelector('#messageInput'),
  messageList: document.querySelector('#messageList'),
  messageStage: document.querySelector('#messageStage'),
  newConversationButton: document.querySelector('#newConversationButton'),
  sendButton: document.querySelector('#sendButton'),
  sidebar: document.querySelector('#conversationSidebar')
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

function showError(error) {
  elements.errorMessage.textContent = error.message;
  bootstrap.Toast.getOrCreateInstance(elements.errorToast).show();
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
  const wrapper = document.createElement('div');
  wrapper.className = 'welcome-state';
  wrapper.innerHTML = `
    <div class="welcome-symbol" aria-hidden="true"><i class="bi bi-stars"></i></div>
    <h3 class="welcome-title">Inicia una nueva reflexión</h3>
    <p class="welcome-copy">Escribe tu primer mensaje. Esta demostración responderá con un código único y una marca de tiempo para confirmar cada intercambio.</p>
  `;
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
  meta.textContent = `${isUser ? 'Tú' : 'Meditations Bot'} · ${formatTime(message.createdAt)}`;
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
      <div class="message-meta">Meditations Bot</div>
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
  try {
    elements.newConversationButton.disabled = true;
    const data = await request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({})
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

function setSending(value) {
  state.sending = value;
  elements.input.disabled = value;
  elements.sendButton.disabled = value;
}

function resizeInput() {
  elements.input.style.height = 'auto';
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 130)}px`;
}

async function sendMessage(event) {
  event.preventDefault();
  const content = elements.input.value.trim();

  if (!content || state.sending || !state.activeConversation) return;

  const optimisticMessage = {
    id: `pending-${Date.now()}`,
    role: 'user',
    content,
    createdAt: new Date().toISOString()
  };

  elements.input.value = '';
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
    showError(error);
  } finally {
    setSending(false);
    elements.input.focus();
  }
}

elements.newConversationButton.addEventListener('click', createNewConversation);
elements.form.addEventListener('submit', sendMessage);
elements.input.addEventListener('input', resizeInput);
elements.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});

loadConversations().catch(showError);

