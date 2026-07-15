/**
 * ai-service.ts
 *
 * Provider-agnostic chat completion and model listing.
 * All three providers expose an OpenAI-compatible REST API so a single
 * fetch-based implementation covers everything.
 */

export type Provider = 'pollinations' | 'openrouter' | 'gemini';

export interface AIConfig {
    provider: Provider;
    model: string;
    apiKey: string;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ModelInfo {
    id: string;
    name: string;
}

// ─── Provider base URLs ────────────────────────────────────────────────────

const BASE_URLS: Record<Provider, string> = {
    pollinations: 'https://gen.pollinations.ai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

// Hard-coded fallback model lists in case the network request fails.
const FALLBACK_MODELS: Record<Provider, ModelInfo[]> = {
    pollinations: [
        { id: 'openai', name: 'OpenAI (GPT-4o)' },
        { id: 'mistral', name: 'Mistral' },
        { id: 'claude', name: 'Claude' },
    ],
    openrouter: [
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)' },
    ],
    gemini: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ],
};

// ─── Model listing ─────────────────────────────────────────────────────────

/**
 * Fetches available models from the selected provider.
 * Falls back to a hardcoded list on any error.
 */
export async function fetchModels(
    provider: Provider,
    apiKey: string,
): Promise<ModelInfo[]> {
    try {
        const url = `${BASE_URLS[provider]}/models`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, { method: 'GET', headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const json = await response.json();
        // All three providers return { data: [{ id, ... }] }
        const rawModels: { id: string; name?: string }[] = json.data ?? [];

        return rawModels.map((m) => ({
            id: m.id,
            name: m.name ?? m.id,
        }));
    } catch {
        // Return fallbacks silently so the UI never breaks.
        return FALLBACK_MODELS[provider];
    }
}

// ─── Chat completion ───────────────────────────────────────────────────────

/**
 * Sends a chat completion request to the configured provider.
 * Returns the raw text of the assistant's reply.
 */
export async function generateCompletion(
    config: AIConfig,
    messages: ChatMessage[],
): Promise<string> {
    const url = `${BASE_URLS[config.provider]}/chat/completions`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
    };

    // OpenRouter requires an extra header to identify the app.
    if (config.provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://german-learner-app';
        headers['X-Title'] = 'German Learner';
    }

    const body = JSON.stringify({
        model: config.model,
        messages,
        // Ask the model to return JSON so we can reliably parse it.
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const response = await fetch(url, { method: 'POST', headers, body });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI request failed (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('Empty response from AI provider.');
    return content;
}

// ─── Paragraph generation ──────────────────────────────────────────────────

export type ParagraphLength = 'short' | 'medium' | 'long';

const LENGTH_WORDS: Record<ParagraphLength, string> = {
    short: '60–80',
    medium: '120–150',
    long: '220–260',
};

export interface WordMeaning {
    word: string;
    meaning: string;
}

export interface GeneratedParagraph {
    paragraph: string;
    words: WordMeaning[];
}

/**
 * Generates a German reading paragraph at the given CEFR level.
 *
 * The model is instructed to return a JSON object with:
 *   { "paragraph": "...", "words": [{ "word": "...", "meaning": "..." }] }
 *
 * Every word that appears in the paragraph gets a contextual English meaning.
 */
export async function generateGermanParagraph(
    config: AIConfig,
    cefrLevel: string,
    topic: string,
    length: ParagraphLength,
): Promise<GeneratedParagraph> {
    const wordCount = LENGTH_WORDS[length];

    const systemPrompt = `You are a German language teacher creating reading material for learners.
Always respond with a single valid JSON object — no markdown, no code fences.
The JSON must follow this exact structure:
{
  "paragraph": "<German paragraph text>",
  "words": [
    { "word": "<exact token as it appears in the paragraph>", "meaning": "<concise English meaning in this context>" }
  ]
}
Include EVERY distinct word from the paragraph (punctuation stripped) in the "words" array.
Do NOT include duplicate entries for the same word.`;

    const userPrompt = `Write a ${wordCount}-word German paragraph for a ${cefrLevel} learner about: "${topic}".
Return only the JSON object described in the system prompt.`;

    const raw = await generateCompletion(config, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);

    // Robustly parse JSON — strip possible markdown fences if the model adds them.
    const jsonStr = raw
        .replace(/^```(?:json)?/m, '')
        .replace(/```$/m, '')
        .trim();

    let parsed: GeneratedParagraph;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new Error('Could not parse AI response as JSON. Please try again.');
    }

    if (!parsed.paragraph || !Array.isArray(parsed.words)) {
        throw new Error('AI response is missing required fields. Please try again.');
    }

    return parsed;
}
