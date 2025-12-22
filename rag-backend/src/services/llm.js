/**
 * LLM Service
 * Generates answers using Groq API with context from retrieved chunks.
 * 
 * TODO: Implement streaming responses for real-time output
 * TODO: Add conversation history support
 * TODO: Implement prompt templates and versioning
 * TODO: Add response caching for identical queries
 * TODO: Implement fallback to alternative LLM providers
 */

const Groq = require('groq-sdk');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize Groq client
const groq = new Groq({
    apiKey: config.groq.apiKey
});

/**
 * System prompt for RAG responses
 * TODO: Make this configurable and support prompt templates
 */
const SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context.

INSTRUCTIONS:
1. Only use information from the provided context to answer the question.
2. If the context doesn't contain enough information to answer, say so clearly.
3. Cite specific parts of the context when relevant.
4. Be concise and direct in your responses.
5. If asked about something not in the context, acknowledge the limitation.

Do not make up information or use knowledge outside of the provided context.`;

/**
 * Generate an answer using the LLM with context
 * 
 * @param {string} question - User's question
 * @param {Array<Object>} [history=[]] - Conversation history
 * @returns {Promise<{answer: string, usage: Object}>}
 * 
 * TODO: Add support for different prompt templates
 * TODO: Implement chain-of-thought reasoning option
 */
async function generateAnswer(question, context, history = []) {
    const startTime = Date.now();

    if (!question || question.trim().length === 0) {
        throw new Error('Question cannot be empty');
    }

    // Format context for the prompt
    // TODO: Consider better formatting (numbering, source attribution)
    const contextText = context
        .map((chunk, i) => `[Chunk ${i + 1}] (Similarity: ${(chunk.similarity * 100).toFixed(1)}%)\n${chunk.content}`)
        .join('\n\n---\n\n');

    // Build user prompt with context and question
    let instruction = 'Please answer the question based only on the context provided above.';

    // Dynamic instruction for Flashcards and Quiz
    const lowerQ = question.toLowerCase();
    const isFlashcard = lowerQ.includes('flashcard');
    const isQuiz = lowerQ.includes('quiz');

    if (isFlashcard) {
        instruction += `
        
        IMPORTANT: The user wants flashcards. You MUST return the response in valid JSON format.
        The flashcard deck should include:
        1. A few cards that summarize key concepts using bullet points.
        2. Cards with specific questions and answers to test knowledge.

        IMPORTANT: The user wants flashcards. You MUST return the response in valid JSON format.
        The flashcard deck should include:
        1. A few cards that summarize key concepts using bullet points.
        2. Cards with specific questions and answers to test knowledge.

        CRITICAL: 
        - The response must be valid parseable JSON.
        - Escape all newlines in strings as \\n. 
        - Do NOT use real newlines inside string values.

        Structure:
        {
            "type": "flashcards",
            "data": [
                { "question": "Key Concept: [Topic]", "answer": "- Point 1\\n- Point 2\\n- Point 3" },
                { "question": "What is...?", "answer": "It is..." }
            ]
        }
        Do not include any markdown formatting (like \`\`\`json) outside the JSON. Return ONLY the raw JSON string.`;
    } else if (isQuiz) {
        instruction += `
        
        IMPORTANT: The user wants a quiz. You MUST return the response in valid JSON format.
        Structure:
        {
            "type": "quiz",
            "data": [
                { "question": "Question 1", "answer": "Answer 1" },
                { "question": "Question 2", "answer": "Answer 2" }
            ]
        }
        Do not include any markdown formatting (like \`\`\`json) outside the JSON. Return ONLY the raw JSON string.`;
    }

    const userPrompt = `CONTEXT:
${contextText}

---

QUESTION: ${question}

${instruction}`;

    logger.debug('Generating LLM response', {
        questionLength: question.length,
        contextChunks: context.length,
        totalContextLength: contextText.length
    });

    try {
        const response = await groq.chat.completions.create({
            model: config.groq.llmModel,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history, // Insert conversation history
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.2, // Lower temperature for more focused answers
            max_tokens: 1024, // TODO: Make configurable
            // TODO: Enable streaming for real-time responses
            // stream: true
        });

        const answer = response.choices[0].message.content;
        const usage = response.usage;

        const latency = Date.now() - startTime;

        logger.info('LLM response generated', {
            latencyMs: latency,
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens
        });

        return {
            answer,
            usage: {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens
            }
        };

    } catch (error) {
        logger.error('LLM generation failed', {
            error: error.message,
            questionLength: question.length
        });
        throw new Error(`LLM generation failed: ${error.message}`);
    }
}

/**
 * Generate a streaming answer (for real-time output)
 * TODO: Implement this for production use
 * 
 * @param {string} question - User's question
 * @param {Array} context - Retrieved chunks
 * @returns {AsyncGenerator<string>} Stream of answer chunks
 */
async function* generateAnswerStream(question, context) {
    // TODO: Implement streaming response
    throw new Error('Streaming not yet implemented');
}

module.exports = {
    generateAnswer,
    generateAnswerStream
};
