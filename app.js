const express = require('express');
const path = require('node:path');
const { randomInt, randomUUID } = require('node:crypto');

const app = express();
const conversations = new Map();
let conversationCounter = 0;

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function serializeSummary(conversation) {
  const lastMessage = conversation.messages.at(-1);

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    preview: lastMessage?.content ?? 'Conversación nueva'
  };
}

function createConversation(title) {
  conversationCounter += 1;
  const now = new Date().toISOString();
  const conversation = {
    id: randomUUID(),
    title: title || `Nueva conversación ${conversationCounter}`,
    createdAt: now,
    updatedAt: now,
    messages: []
  };

  conversations.set(conversation.id, conversation);
  return conversation;
}

function createMessage(role, content) {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function buildAssistantReply() {
  const code = `QG-${randomInt(1000, 10000)}`;
  const timestamp = new Date().toISOString();

  return `Mensaje recibido correctamente. Código ${code} · ${timestamp}`;
}

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/conversations', (_request, response) => {
  const items = [...conversations.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(serializeSummary);

  response.json({ conversations: items });
});

app.post('/api/conversations', (request, response) => {
  const rawTitle = typeof request.body?.title === 'string' ? request.body.title.trim() : '';

  if (rawTitle.length > 80) {
    return response.status(400).json({ error: 'El título no puede superar 80 caracteres.' });
  }

  const conversation = createConversation(rawTitle);
  return response.status(201).json({ conversation });
});

app.get('/api/conversations/:id', (request, response) => {
  const conversation = conversations.get(request.params.id);

  if (!conversation) {
    return response.status(404).json({ error: 'Conversación no encontrada.' });
  }

  return response.json({ conversation });
});

app.post('/api/conversations/:id/messages', (request, response) => {
  const conversation = conversations.get(request.params.id);

  if (!conversation) {
    return response.status(404).json({ error: 'Conversación no encontrada.' });
  }

  const content = typeof request.body?.content === 'string' ? request.body.content.trim() : '';

  if (!content) {
    return response.status(400).json({ error: 'El mensaje no puede estar vacío.' });
  }

  if (content.length > 2000) {
    return response.status(400).json({ error: 'El mensaje no puede superar 2000 caracteres.' });
  }

  const userMessage = createMessage('user', content);
  const assistantMessage = createMessage('assistant', buildAssistantReply());
  conversation.messages.push(userMessage, assistantMessage);
  conversation.updatedAt = assistantMessage.createdAt;

  if (conversation.messages.length === 2 && conversation.title.startsWith('Nueva conversación')) {
    conversation.title = content.length > 42 ? `${content.slice(0, 39)}…` : content;
  }

  return response.status(201).json({
    conversation,
    messages: [userMessage, assistantMessage]
  });
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'El contenido JSON no es válido.' });
  }

  console.error(error);
  return response.status(500).json({ error: 'Ocurrió un error inesperado.' });
});

function resetStore() {
  conversations.clear();
  conversationCounter = 0;
}

module.exports = { app, resetStore };

