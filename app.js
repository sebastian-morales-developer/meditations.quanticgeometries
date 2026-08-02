const express = require('express');
const path = require('node:path');
const { randomInt, randomUUID } = require('node:crypto');
const conversationTypeCatalog = require('./config/conversation-types.json');
const { generateOpenAIReply } = require('./services/openai-responder');
const { transcribeAudio } = require('./services/openai-transcriber');

const AUDIO_FORMATS = new Map([
  ['audio/webm', 'webm'],
  ['video/webm', 'webm'],
  ['audio/mp4', 'mp4'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/m4a', 'm4a'],
  ['audio/x-m4a', 'm4a']
]);

const activeConversationTypes = conversationTypeCatalog.types.filter((type) => type.active);
const conversationTypesById = new Map(activeConversationTypes.map((type) => [type.id, type]));

function getRequestMimeType(request) {
  return (request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
}

if (!conversationTypesById.has(conversationTypeCatalog.defaultTypeId)) {
  throw new Error('El tipo de conversación predeterminado debe existir y estar activo.');
}

function serializeConversationType(type) {
  return {
    id: type.id,
    name: type.name,
    shortName: type.shortName,
    description: type.description,
    usesAI: type.handler === 'openai'
  };
}

function limitWords(text, maxWords) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (!maxWords || words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ');
}

function createApplication({
  aiResponder = generateOpenAIReply,
  audioTranscriber = transcribeAudio
} = {}) {
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
      typeId: conversation.typeId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length,
      preview: lastMessage?.content ?? 'Conversación nueva'
    };
  }

  function createConversation(title, typeId = conversationTypeCatalog.defaultTypeId) {
    conversationCounter += 1;
    const now = new Date().toISOString();
    const conversation = {
      id: randomUUID(),
      title: title || `Nueva conversación ${conversationCounter}`,
      typeId,
      createdAt: now,
      updatedAt: now,
      messages: []
    };

    conversations.set(conversation.id, conversation);
    return conversation;
  }

  function createMessage(role, content, typeId) {
    return {
      id: randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
      ...(typeId ? { typeId } : {})
    };
  }

  function buildTimestampReply() {
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

  app.get('/api/conversation-types', (_request, response) => {
    response.json({
      defaultTypeId: conversationTypeCatalog.defaultTypeId,
      conversationTypes: activeConversationTypes.map(serializeConversationType)
    });
  });

  app.post(
    '/api/transcriptions',
    express.raw({
      type: (request) => {
        return AUDIO_FORMATS.has(getRequestMimeType(request));
      },
      limit: '25mb'
    }),
    async (request, response) => {
      const mimeType = getRequestMimeType(request);

      if (!AUDIO_FORMATS.has(mimeType)) {
        return response.status(415).json({
          error: 'El formato de audio no es compatible. Usa WebM, MP4, MP3, M4A o WAV.'
        });
      }

      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        return response.status(400).json({ error: 'La grabación de audio está vacía.' });
      }

      const extension = AUDIO_FORMATS.get(mimeType);

      try {
        const text = await audioTranscriber({
          buffer: request.body,
          filename: `recording-${Date.now()}.${extension}`,
          mimeType
        });
        return response.json({ text });
      } catch (error) {
        const missingKey = error.code === 'OPENAI_API_KEY_MISSING';
        console.error('No se pudo transcribir el audio.', {
          code: error.code,
          status: error.status,
          name: error.name
        });
        return response.status(missingKey ? 503 : 502).json({
          error: missingKey
            ? 'La transcripción de voz no está configurada en el servidor.'
            : 'No se pudo transcribir la grabación. Intenta nuevamente.'
        });
      }
    }
  );

  app.get('/api/conversations', (_request, response) => {
    const items = [...conversations.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(serializeSummary);

    response.json({ conversations: items });
  });

  app.post('/api/conversations', (request, response) => {
    const rawTitle = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
    const typeId = request.body?.typeId || conversationTypeCatalog.defaultTypeId;

    if (rawTitle.length > 80) {
      return response.status(400).json({ error: 'El título no puede superar 80 caracteres.' });
    }

    if (!conversationTypesById.has(typeId)) {
      return response.status(400).json({ error: 'El tipo de conversación no es válido o no está activo.' });
    }

    const conversation = createConversation(rawTitle, typeId);
    return response.status(201).json({ conversation });
  });

  app.get('/api/conversations/:id', (request, response) => {
    const conversation = conversations.get(request.params.id);

    if (!conversation) {
      return response.status(404).json({ error: 'Conversación no encontrada.' });
    }

    return response.json({ conversation });
  });

  app.patch('/api/conversations/:id/type', (request, response) => {
    const conversation = conversations.get(request.params.id);

    if (!conversation) {
      return response.status(404).json({ error: 'Conversación no encontrada.' });
    }

    const typeId = request.body?.typeId;

    if (!conversationTypesById.has(typeId)) {
      return response.status(400).json({ error: 'El tipo de conversación no es válido o no está activo.' });
    }

    conversation.typeId = typeId;
    conversation.updatedAt = new Date().toISOString();
    return response.json({ conversation });
  });

  app.post('/api/conversations/:id/messages', async (request, response) => {
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

    const type = conversationTypesById.get(conversation.typeId);
    let assistantContent;

    try {
      assistantContent = type.handler === 'openai'
        ? limitWords(await aiResponder({ content, type }), type.maxWords)
        : buildTimestampReply();
    } catch (error) {
      const missingKey = error.code === 'OPENAI_API_KEY_MISSING';
      console.error('No se pudo generar la respuesta de IA.', {
        code: error.code,
        status: error.status,
        name: error.name
      });
      return response.status(missingKey ? 503 : 502).json({
        error: missingKey
          ? 'La modalidad de IA no está configurada en el servidor.'
          : 'La inteligencia artificial no pudo responder. Intenta nuevamente.'
      });
    }

    const userMessage = createMessage('user', content);
    const assistantMessage = createMessage('assistant', assistantContent, type.id);
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
    if (error.type === 'entity.too.large') {
      return response.status(413).json({ error: 'La grabación supera el límite de 25 MB.' });
    }

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

  return { app, resetStore };
}

const defaultApplication = createApplication();

module.exports = {
  ...defaultApplication,
  createApplication,
  limitWords
};
