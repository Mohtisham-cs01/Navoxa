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

const modelCache: Record<string, { timestamp: number; models: ModelInfo[] }> = {};
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Fetches available models from the selected provider.
 * Falls back to a hardcoded list on any error.
 * Results are cached in memory for 1 hour.
 */
export async function fetchModels(
    provider: Provider,
    apiKey: string,
): Promise<ModelInfo[]> {
    const cacheKey = `${provider}-${apiKey}`;
    const cached = modelCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.models;
    }

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
        let rawModels: any[] = json.data ?? [];

        // Ensure we only list language models (LLMs) that output text.
        // Providers like Pollinations include image/video models in their list.
        rawModels = rawModels.filter((m: any) => {
            if (Array.isArray(m.output_modalities) && !m.output_modalities.includes('text')) {
                return false;
            }
            if (Array.isArray(m.input_modalities) && !m.input_modalities.includes('text')) {
                return false;
            }
            return true;
        });

        const models = rawModels
            .map((m) => ({
                id: m.id,
                name: m.name ?? m.id,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
            
        modelCache[cacheKey] = { timestamp: Date.now(), models };
        
        return models;
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
    signal?: AbortSignal,
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
        // Pollinations caches responses by prompt content (deterministic by default).
        // Sending a unique seed on every call busts that cache and forces a fresh response.
        // Other providers ignore this field safely.
        seed: Math.floor(Math.random() * 2_147_483_647),
    });

    const response = await fetch(url, { method: 'POST', headers, body, signal });

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
    signal?: AbortSignal,
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
    ], signal);

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

// ─── Dictionary word generation ────────────────────────────────────────────

/**
 * Raw shape we expect from the LLM for each word.
 * Validated structurally before any DB writes.
 */
export interface LLMGeneratedWord {
    word: string;
    article: string | null;
    pos: string;
    meaning: string;
    sentences: Array<{
        sentence: string;
        tense: string;       // "present" | "past" | "future" | "question" | "conditional" | "imperative"
        translation: string;
    }>;
}

// Tenses we ask the model to cover for every word
const WORD_TENSES = ['present', 'past', 'future', 'question', 'conditional', 'imperative'];

/**
 * Asks the LLM to generate `count` German vocabulary words at the given
 * CEFR level on the given topic, each with example sentences in multiple tenses.
 */
export async function generateDictionaryWords(
    config: AIConfig,
    count: number = 8,
    cefrLevel: string = 'B1',
    topic: string = 'general vocabulary',
    signal?: AbortSignal,
): Promise<LLMGeneratedWord[]> {
    const systemPrompt = `You are a German language teacher creating vocabulary for learners.
Always respond with a SINGLE valid JSON object — no markdown, no code fences.
The object must have this exact shape:
{
  "words": [
    {
      "word": "<German word>",
      "article": "<der|die|das or null>",
      "pos": "<noun|verb|adjective|adverb|other>",
      "meaning": "<concise English translation>",
      "sentences": [
        { "sentence": "<German example>", "tense": "<tense name>", "translation": "<English>" }
      ]
    }
  ]
}
Rules:
- Generate exactly ${count} unique words suitable for a ${cefrLevel} learner.
- For each word include one sentence per tense from: ${WORD_TENSES.join(', ')}.
- Sentences must be natural, everyday German — not textbook robotic.
- For nouns always set the article (der/die/das). For verbs/adjectives set article to null.`;

    const userPrompt = `Generate ${count} German vocabulary words related to: "${topic}".
Return only the JSON object described by the system prompt.`;

    const raw = await generateCompletion(
        config,
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        signal,
    );

    const jsonStr = raw.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();

    let parsed: { words: any[] };
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new Error('Could not parse word generation response as JSON. Please try again.');
    }

    if (!Array.isArray(parsed?.words) || parsed.words.length === 0) {
        throw new Error('AI returned an empty or malformed word list. Please try again.');
    }

    const validated: LLMGeneratedWord[] = [];
    for (const w of parsed.words) {
        if (!w.word || !w.meaning || !Array.isArray(w.sentences)) continue;
        const cleanedSentences = w.sentences.filter(
            (s: any) => s.sentence && s.tense && s.translation,
        );
        if (cleanedSentences.length === 0) continue;
        validated.push({
            word: String(w.word).trim(),
            article: w.article ? String(w.article).trim() : null,
            pos: String(w.pos ?? 'other').trim(),
            meaning: String(w.meaning).trim(),
            sentences: cleanedSentences.map((s: any) => ({
                sentence: String(s.sentence).trim(),
                tense: String(s.tense).trim().toLowerCase(),
                translation: String(s.translation).trim(),
            })),
        });
    }

    if (validated.length === 0) {
        throw new Error('None of the generated words passed validation. Please try again.');
    }

    return validated;
}

/**
 * Asks the LLM to generate additional example sentences for a specific
 * German word the user already has in their dictionary.
 */
export async function generateMoreSentences(
    config: AIConfig,
    word: string,
    meaning: string,
    signal?: AbortSignal,
): Promise<Array<{ sentence: string; tense: string; translation: string }>> {
    const systemPrompt = `You are a German language teacher.
Always respond with a SINGLE valid JSON object — no markdown, no code fences.
The object must have this shape:
{
  "sentences": [
    { "sentence": "<German sentence>", "tense": "<tense name>", "translation": "<English>" }
  ]
}`;

    const userPrompt = `Generate 6 new example sentences for the German word "${word}" (meaning: ${meaning}).
Cover these tenses: ${WORD_TENSES.join(', ')}.
Make sentences vivid and varied. Return only the JSON object.`;

    const raw = await generateCompletion(
        config,
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        signal,
    );

    const jsonStr = raw.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();

    let parsed: { sentences: any[] };
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new Error('Could not parse sentences response as JSON. Please try again.');
    }

    if (!Array.isArray(parsed?.sentences)) {
        throw new Error('AI returned a malformed sentences list. Please try again.');
    }

    return parsed.sentences
        .filter((s: any) => s.sentence && s.tense && s.translation)
        .map((s: any) => ({
            sentence: String(s.sentence).trim(),
            tense: String(s.tense).trim().toLowerCase(),
            translation: String(s.translation).trim(),
        }));
}

/**
 * Asks the LLM to generate example sentences for a BATCH of words at once.
 * Useful to save API calls when populating multiple dictionary words.
 * Returns a map of word -> array of sentences.
 */
export async function generateBatchSentences(
    config: AIConfig,
    words: Array<{ word: string; meaning: string }>,
    signal?: AbortSignal,
): Promise<Record<string, Array<{ sentence: string; tense: string; translation: string }>>> {
    if (words.length === 0) return {};

    const systemPrompt = `You are a German language teacher.
Always respond with a SINGLE valid JSON object — no markdown, no code fences.
The object must have this shape, where the keys are the exact German words requested:
{
  "<German Word>": [
    { "sentence": "<German sentence>", "tense": "<tense name>", "translation": "<English>" }
  ]
}`;

    const wordsListStr = words.map(w => `- ${w.word} (meaning: ${w.meaning})`).join('\n');
    const userPrompt = `Generate 6 example sentences for EACH of the following German words.
Cover these tenses for each word: ${WORD_TENSES.join(', ')}.
Make sentences vivid and varied. Return only the JSON object.

Words:
${wordsListStr}`;

    const raw = await generateCompletion(
        config,
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        signal,
    );

    const jsonStr = raw.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();

    let parsed: Record<string, any[]>;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new Error('Could not parse batch sentences response as JSON. Please try again.');
    }

    const result: Record<string, Array<{ sentence: string; tense: string; translation: string }>> = {};

    for (const [wordKey, sentences] of Object.entries(parsed)) {
        if (!Array.isArray(sentences)) continue;
        const validSentences = sentences
            .filter((s: any) => s.sentence && s.tense && s.translation)
            .map((s: any) => ({
                sentence: String(s.sentence).trim(),
                tense: String(s.tense).trim().toLowerCase(),
                translation: String(s.translation).trim(),
            }));
        if (validSentences.length > 0) {
            result[wordKey] = validSentences;
        }
    }

    return result;
}

