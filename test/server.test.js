const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const conversationTypeCatalog = require('../config/conversation-types.json');
const { createApplication } = require('../app');
const { generateOpenAIReply } = require('../services/openai-responder');
const { TRANSCRIPTION_MODEL, transcribeAudio } = require('../services/openai-transcriber');
const { insertTextAtRange } = require('../public/text-insertion');

const aiCalls = [];
const transcriptionCalls = [];
const longAiResponse = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte';
const { app, resetStore } = createApplication({
  aiResponder: async (input) => {
    aiCalls.push(input);
    return longAiResponse;
  },
  audioTranscriber: async (input) => {
    transcriptionCalls.push(input);
    return 'Texto dictado correctamente.';
  }
});

let server;
let baseUrl;

async function createConversation(typeId) {
  const response = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(typeId ? { typeId } : {})
  });
  const payload = await response.json();
  return { response, conversation: payload.conversation };
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetStore();
  aiCalls.length = 0;
  transcriptionCalls.length = 0;
});

test('expone únicamente los tipos de conversación activos', async () => {
  const response = await fetch(`${baseUrl}/api/conversation-types`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.defaultTypeId, 'timestamp');
  assert.deepEqual(
    payload.conversationTypes.map((type) => type.id),
    ['timestamp', 'openai-brief']
  );
  assert.equal('instructions' in payload.conversationTypes[1], false);
  assert.equal('model' in payload.conversationTypes[1], false);
});

test('crea y lista conversaciones con el tipo predeterminado', async () => {
  const { response, conversation } = await createConversation();
  assert.equal(response.status, 201);
  assert.match(conversation.title, /^Nueva conversación 1$/);
  assert.equal(conversation.typeId, 'timestamp');

  const listResponse = await fetch(`${baseUrl}/api/conversations`);
  const list = await listResponse.json();
  assert.equal(list.conversations.length, 1);
  assert.equal(list.conversations[0].id, conversation.id);
  assert.equal(list.conversations[0].typeId, 'timestamp');
});

test('expone el estado de salud del servidor', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, 'ok');
  assert.equal(typeof payload.uptime, 'number');
});

test('mantiene el modo de código y timestamp sin usar OpenAI', async () => {
  const { conversation } = await createConversation('timestamp');
  const messageResponse = await fetch(`${baseUrl}/api/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Hola, esta es una prueba' })
  });
  assert.equal(messageResponse.status, 201);

  const payload = await messageResponse.json();
  assert.equal(payload.messages[0].role, 'user');
  assert.equal(payload.messages[1].role, 'assistant');
  assert.equal(payload.messages[1].typeId, 'timestamp');
  assert.match(payload.messages[1].content, /QG-\d{4}/);
  assert.match(payload.messages[1].content, /\d{4}-\d{2}-\d{2}T/);
  assert.equal(payload.conversation.title, 'Hola, esta es una prueba');
  assert.equal(aiCalls.length, 0);
});

test('permite seleccionar IA y garantiza menos de 20 palabras', async () => {
  const { conversation } = await createConversation('timestamp');
  const typeResponse = await fetch(`${baseUrl}/api/conversations/${conversation.id}/type`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ typeId: 'openai-brief' })
  });
  assert.equal(typeResponse.status, 200);

  const messageResponse = await fetch(`${baseUrl}/api/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '¿Qué es la geometría?' })
  });
  const payload = await messageResponse.json();

  assert.equal(messageResponse.status, 201);
  assert.equal(payload.messages[1].typeId, 'openai-brief');
  assert.equal(payload.messages[1].content.split(/\s+/).length, 19);
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].content, '¿Qué es la geometría?');
  assert.equal(aiCalls[0].type.id, 'openai-brief');
});

test('rechaza tipos de conversación desconocidos', async () => {
  const { response } = await createConversation('no-existe');
  assert.equal(response.status, 400);
});

test('construye una solicitud Responses para GPT-5.6 Sol', async () => {
  let capturedRequest;
  const type = conversationTypeCatalog.types.find((item) => item.id === 'openai-brief');
  const client = {
    responses: {
      create: async (request) => {
        capturedRequest = request;
        return { output_text: 'La geometría estudia formas, espacios y sus relaciones.' };
      }
    }
  };

  const output = await generateOpenAIReply({
    content: '¿Qué es la geometría?',
    type,
    client
  });

  assert.equal(output, 'La geometría estudia formas, espacios y sus relaciones.');
  assert.equal(capturedRequest.model, 'gpt-5.6-sol');
  assert.equal(capturedRequest.input, '¿Qué es la geometría?');
  assert.deepEqual(capturedRequest.reasoning, { effort: 'none' });
  assert.deepEqual(capturedRequest.text, { verbosity: 'low' });
  assert.equal(capturedRequest.store, false);
});

test('rechaza mensajes vacíos', async () => {
  const { conversation } = await createConversation();
  const response = await fetch(`${baseUrl}/api/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '   ' })
  });

  assert.equal(response.status, 400);
});

test('transcribe una grabación compatible mediante el backend', async () => {
  const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const response = await fetch(`${baseUrl}/api/transcriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/webm' },
    body: audio
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.text, 'Texto dictado correctamente.');
  assert.equal(transcriptionCalls.length, 1);
  assert.equal(transcriptionCalls[0].mimeType, 'audio/webm');
  assert.match(transcriptionCalls[0].filename, /^recording-\d+\.webm$/);
  assert.deepEqual(transcriptionCalls[0].buffer, audio);
});

test('rechaza formatos de grabación incompatibles', async () => {
  const response = await fetch(`${baseUrl}/api/transcriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('audio')
  });

  assert.equal(response.status, 415);
  assert.equal(transcriptionCalls.length, 0);
});

test('rechaza grabaciones vacías', async () => {
  const response = await fetch(`${baseUrl}/api/transcriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/webm' },
    body: Buffer.alloc(0)
  });

  assert.equal(response.status, 400);
  assert.equal(transcriptionCalls.length, 0);
});

test('construye una solicitud de transcripción con el modelo recomendado', async () => {
  let capturedRequest;
  const client = {
    audio: {
      transcriptions: {
        create: async (request) => {
          capturedRequest = request;
          return { text: '  Una transcripción de prueba.  ' };
        }
      }
    }
  };

  const output = await transcribeAudio({
    buffer: Buffer.from('audio simulado'),
    filename: 'recording.webm',
    mimeType: 'audio/webm',
    client
  });

  assert.equal(output, 'Una transcripción de prueba.');
  assert.equal(capturedRequest.model, TRANSCRIPTION_MODEL);
  assert.equal(capturedRequest.file.name, 'recording.webm');
  assert.equal(capturedRequest.file.type, 'audio/webm');
});

test('inserta la transcripción en la posición conservada del cursor', () => {
  const result = insertTextAtRange('Hola mundo', 'querido', 4, 4, 2000);

  assert.equal(result.value, 'Hola querido mundo');
  assert.equal(result.cursor, 12);
  assert.equal(result.truncated, false);
});

test('reemplaza una selección y respeta el límite del textarea', () => {
  const result = insertTextAtRange('Hola mundo', 'universo extenso', 5, 10, 12);

  assert.equal(result.value, 'Hola univers');
  assert.equal(result.cursor, 12);
  assert.equal(result.truncated, true);
});
