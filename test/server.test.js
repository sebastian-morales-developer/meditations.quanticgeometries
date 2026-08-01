const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { app, resetStore } = require('../app');

let server;
let baseUrl;

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
});

test('crea y lista conversaciones', async () => {
  const createdResponse = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(createdResponse.status, 201);

  const { conversation } = await createdResponse.json();
  assert.match(conversation.title, /^Nueva conversación 1$/);

  const listResponse = await fetch(`${baseUrl}/api/conversations`);
  const list = await listResponse.json();
  assert.equal(list.conversations.length, 1);
  assert.equal(list.conversations[0].id, conversation.id);
});

test('expone el estado de salud del servidor', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, 'ok');
  assert.equal(typeof payload.uptime, 'number');
});

test('responde a cada mensaje con código y timestamp', async () => {
  const createdResponse = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const { conversation } = await createdResponse.json();

  const messageResponse = await fetch(`${baseUrl}/api/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Hola, esta es una prueba' })
  });
  assert.equal(messageResponse.status, 201);

  const payload = await messageResponse.json();
  assert.equal(payload.messages[0].role, 'user');
  assert.equal(payload.messages[1].role, 'assistant');
  assert.match(payload.messages[1].content, /QG-\d{4}/);
  assert.match(payload.messages[1].content, /\d{4}-\d{2}-\d{2}T/);
  assert.equal(payload.conversation.title, 'Hola, esta es una prueba');
});

test('rechaza mensajes vacíos', async () => {
  const createdResponse = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const { conversation } = await createdResponse.json();

  const response = await fetch(`${baseUrl}/api/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '   ' })
  });

  assert.equal(response.status, 400);
});
