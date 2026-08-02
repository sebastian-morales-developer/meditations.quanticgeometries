const OpenAI = require('openai');

let openaiClient;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY no está configurada.');
    error.code = 'OPENAI_API_KEY_MISSING';
    throw error;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
}

module.exports = { getOpenAIClient };
