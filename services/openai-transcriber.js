const { toFile } = require('openai');
const { getOpenAIClient } = require('./openai-client');

const TRANSCRIPTION_MODEL = 'gpt-transcribe';

async function transcribeAudio({ buffer, filename, mimeType, client }) {
  const activeClient = client || getOpenAIClient();
  const file = await toFile(buffer, filename, { type: mimeType });
  const transcription = await activeClient.audio.transcriptions.create({
    file,
    model: TRANSCRIPTION_MODEL
  });
  const text = transcription.text?.trim();

  if (!text) {
    const error = new Error('OpenAI devolvió una transcripción vacía.');
    error.code = 'OPENAI_EMPTY_TRANSCRIPTION';
    throw error;
  }

  return text;
}

module.exports = { TRANSCRIPTION_MODEL, transcribeAudio };
