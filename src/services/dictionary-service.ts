/**
 * dictionary-service.ts
 *
 * Manages LLM-generated vocabulary words and their example sentences.
 *
 * Architecture note
 * -----------------
 * We open a SEPARATE database file ("navoxa_dictionary.db") so that the
 * existing, read-only "word.db" (bundled asset) is never touched.
 * Migrations run once on first open; subsequent opens are instant.
 *
 * Schema
 * ------
 *   generated_words
 *     id          INTEGER  PK
 *     word        TEXT     NOT NULL  (the German word / phrase)
 *     article     TEXT              (der/die/das – null for verbs etc.)
 *     pos         TEXT              (noun/verb/adjective/…)
 *     meaning     TEXT     NOT NULL  (English translation)
 *     level       TEXT              (CEFR level it was generated for)
 *     created_at  INTEGER           (Unix ms)
 *
 *   generated_sentences
 *     id          INTEGER  PK
 *     word_id     INTEGER  FK → generated_words.id
 *     sentence    TEXT     NOT NULL  (German example sentence)
 *     tense       TEXT              (present/past/future/question/…)
 *     translation TEXT              (English translation)
 *     created_at  INTEGER
 */

import * as SQLite from 'expo-sqlite';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeneratedWord {
    id: number;
    word: string;
    article: string | null;
    pos: string;
    meaning: string;
    level: string | null;
    created_at: number;
}

export interface GeneratedSentence {
    id: number;
    word_id: number;
    sentence: string;
    tense: string;
    translation: string;
    created_at: number;
}

export interface WordWithSentences extends GeneratedWord {
    sentences: GeneratedSentence[];
}

// ─── DB singleton ────────────────────────────────────────────────────────────

const DICT_DB_NAME = 'navoxa_dictionary.db';
let _db: SQLite.SQLiteDatabase | null = null;

/** Opens the dictionary database and runs migrations exactly once per session. */
async function getDb(): Promise<SQLite.SQLiteDatabase> {
    if (_db) return _db;
    _db = await SQLite.openDatabaseAsync(DICT_DB_NAME);
    await runMigrations(_db);
    return _db;
}

/** Idempotent schema setup – safe to call on every app start. */
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS generated_words (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            word       TEXT    NOT NULL,
            article    TEXT,
            pos        TEXT    NOT NULL DEFAULT '',
            meaning    TEXT    NOT NULL,
            level      TEXT,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
        );

        CREATE TABLE IF NOT EXISTS generated_sentences (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            word_id     INTEGER NOT NULL REFERENCES generated_words(id) ON DELETE CASCADE,
            sentence    TEXT    NOT NULL,
            tense       TEXT    NOT NULL DEFAULT '',
            translation TEXT    NOT NULL DEFAULT '',
            created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
        );

        CREATE INDEX IF NOT EXISTS idx_sentences_word_id
            ON generated_sentences(word_id);
    `);
}

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/** Returns the existing word row, or null if it doesn't exist yet. */
async function findWordByText(
    db: SQLite.SQLiteDatabase,
    word: string,
): Promise<GeneratedWord | null> {
    const row = await db.getFirstAsync<GeneratedWord>(
        `SELECT * FROM generated_words WHERE LOWER(word) = LOWER(?) LIMIT 1`,
        [word.trim()],
    );
    return row ?? null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Inserts a new word into the DB.
 * If the word already exists, skips the word insert and only adds the
 * provided sentences (de-duplicating by sentence text).
 *
 * Returns the word's id (whether new or existing).
 */
export async function saveWordWithSentences(input: {
    word: string;
    article?: string | null;
    pos?: string;
    meaning: string;
    level?: string | null;
    sentences: Array<{ sentence: string; tense: string; translation: string }>;
}): Promise<number> {
    const db = await getDb();

    let wordId: number;
    const existing = await findWordByText(db, input.word);

    if (existing) {
        // Word already exists – reuse its id
        wordId = existing.id;
    } else {
        // Insert the new word
        const result = await db.runAsync(
            `INSERT INTO generated_words (word, article, pos, meaning, level)
             VALUES (?, ?, ?, ?, ?)`,
            [
                input.word.trim(),
                input.article ?? null,
                input.pos ?? '',
                input.meaning,
                input.level ?? null,
            ],
        );
        wordId = result.lastInsertRowId as number;
    }

    // Insert sentences, skipping exact duplicates
    for (const s of input.sentences) {
        const dup = await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM generated_sentences
             WHERE word_id = ? AND LOWER(sentence) = LOWER(?) LIMIT 1`,
            [wordId, s.sentence.trim()],
        );
        if (!dup) {
            await db.runAsync(
                `INSERT INTO generated_sentences (word_id, sentence, tense, translation)
                 VALUES (?, ?, ?, ?)`,
                [wordId, s.sentence.trim(), s.tense, s.translation],
            );
        }
    }

    return wordId;
}

/**
 * Returns all generated words, ordered newest first.
 * Does NOT include sentences (use `getSentencesForWord` for that).
 */
export async function getAllGeneratedWords(): Promise<GeneratedWord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<GeneratedWord>(
        `SELECT * FROM generated_words ORDER BY created_at DESC`,
    );
    return rows;
}

/**
 * Fetches all sentences for a given word_id, ordered by tense then id.
 */
export async function getSentencesForWord(
    wordId: number,
): Promise<GeneratedSentence[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<GeneratedSentence>(
        `SELECT * FROM generated_sentences
         WHERE word_id = ?
         ORDER BY tense, id`,
        [wordId],
    );
    return rows;
}

/**
 * Returns a word + all its sentences, or null if not found.
 */
export async function getWordWithSentences(
    wordId: number,
): Promise<WordWithSentences | null> {
    const db = await getDb();
    const word = await db.getFirstAsync<GeneratedWord>(
        `SELECT * FROM generated_words WHERE id = ?`,
        [wordId],
    );
    if (!word) return null;
    const sentences = await getSentencesForWord(wordId);
    return { ...word, sentences };
}

/**
 * Checks whether a word already exists (case-insensitive) and returns its id,
 * or null if it is new.
 */
export async function checkWordExists(word: string): Promise<number | null> {
    const db = await getDb();
    const row = await findWordByText(db, word);
    return row ? row.id : null;
}

/**
 * Deletes a word and all its sentences (cascade).
 */
export async function deleteWord(wordId: number): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM generated_words WHERE id = ?`, [wordId]);
}

/**
 * Returns a list of words that have the fewest sentences (prioritizing those with 0).
 */
export async function getWordsNeedingSentences(limit: number): Promise<GeneratedWord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<GeneratedWord>(
        `SELECT w.*, COUNT(s.id) as sentence_count
         FROM generated_words w
         LEFT JOIN generated_sentences s ON w.id = s.word_id
         GROUP BY w.id
         ORDER BY sentence_count ASC, w.created_at ASC
         LIMIT ?`,
        [limit]
    );
    return rows;
}
