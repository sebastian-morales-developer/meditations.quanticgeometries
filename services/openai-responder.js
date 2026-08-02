const { getOpenAIClient } = require('./openai-client');

async function generateOpenAIReply({ content, type, client }) {
  const activeClient = client || getOpenAIClient();
  const response = await activeClient.responses.create({
    model: type.model,
    instructions: type.instructions,
    input: content,
    reasoning: { effort: 'none' },
    text: { verbosity: 'low' },
    max_output_tokens: 80,
    store: false
  });
  const output = response.output_text?.trim();

  if (!output) {
    const error = new Error('OpenAI devolvió una respuesta vacía.');
    error.code = 'OPENAI_EMPTY_RESPONSE';
    throw error;
  }

  return output;
}

module.exports = { generateOpenAIReply };
