/**
 * database-service.ts
 *
 * Handles copying the bundled word.db into the writable document directory
 * and querying the 'Word of the Day' using expo-sqlite.
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'word.db';

export interface DBWord {
    id: number;
    word: string;        // Full word for display (includes article for nouns)
    article: string | null;  // Article for nouns (der/die/das)
    pos: string;         // Part of speech (noun, verb, pronoun, etc.)
    meaning: string;     // English meaning
    examples: string | null;  // Example/notes (may be null)
}

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Initializes the database by always copying the bundled asset into
 * the writable SQLite directory. Re-copies on every cold start to
 * guarantee data always comes from assets/word.db.
 */
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (_db) return _db;

    const dbDir = `${(FileSystem as any).documentDirectory}SQLite`;
    const dbPath = `${dbDir}/${DB_NAME}`;

    // Ensure SQLite directory exists
    const dirInfo = await FileSystem.getInfoAsync(dbDir);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
    }

    // Always delete any stale copy and re-copy from the bundled asset.
    // This guarantees we read from assets/word.db and never from a
    // previously-corrupted or wrong file.
    const fileInfo = await FileSystem.getInfoAsync(dbPath);
    if (fileInfo.exists) {
        await FileSystem.deleteAsync(dbPath, { idempotent: true });
    }

    // Use an explicit relative path (src/services/ → project-root/assets/)
    // to avoid Metro alias ambiguity (@/* resolves to src/* and could shadow @/assets/*).
    const asset = require('../../assets/word.db');
    const assetObj = await Asset.fromModule(asset).downloadAsync();

    if (!assetObj.localUri) {
        throw new Error('Failed to locate bundled word.db asset.');
    }

    await FileSystem.copyAsync({ from: assetObj.localUri, to: dbPath });

    _db = await SQLite.openDatabaseAsync(DB_NAME);
    return _db;
}

/**
 * Retrieves a random word from the database.
 */
export async function getRandomWord(): Promise<DBWord | null> {
    try {
        const db = await initDatabase();

        const row = await db.getFirstAsync<any>('SELECT * FROM words ORDER BY RANDOM() LIMIT 1');
        if (!row) return null;

        // Ensure all fields have safe defaults
        return {
            id: row.id || 0,
            word: row.word || '',
            article: row.article || null,
            pos: row.pos || '',
            meaning: row.meaning || '',
            examples: row.examples || null,
        };
    } catch (error) {
        console.error('Error fetching random word:', error);
        return null;
    }
}

/**
 * Returns 4 shuffled meaning options for the meaning quiz:
 * 1 correct answer + 3 random distractors (different word, different meaning).
 */
export async function getFourOptions(correct: DBWord): Promise<{ id: number; meaning: string }[]> {
    try {
        const db = await initDatabase();
        const rows = await db.getAllAsync<any>(
            `SELECT id, meaning FROM words WHERE id != ? AND meaning IS NOT NULL AND meaning != '' ORDER BY RANDOM() LIMIT 3`,
            [correct.id]
        );
        const opts = [
            { id: correct.id, meaning: correct.meaning },
            ...rows.map((r: any) => ({ id: r.id as number, meaning: r.meaning as string })),
        ];
        // Fisher-Yates shuffle
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return opts;
    } catch {
        return [{ id: correct.id, meaning: correct.meaning }];
    }
}

/**
 * Retrieves a random noun that has a non-null article (der/die/das).
 * Used by the Article Quiz tab.
 */
export async function getRandomNoun(): Promise<DBWord | null> {
    try {
        const db = await initDatabase();

        const row = await db.getFirstAsync<any>(
            `SELECT * FROM words WHERE pos = 'noun' AND article IS NOT NULL AND article != '' ORDER BY RANDOM() LIMIT 1`
        );
        if (!row) return null;

        return {
            id: row.id || 0,
            word: row.word || '',
            article: row.article || null,
            pos: row.pos || '',
            meaning: row.meaning || '',
            examples: row.examples || null,
        };
    } catch (error) {
        console.error('Error fetching random noun:', error);
        return null;
    }
}

// ─── Spaced Repetition (Retry Queue) ───────────────────────────────────────

interface RetryItem {
    word: DBWord;
    delay: number;
}

let nounRetryQueue: RetryItem[] = [];
let wordRetryQueue: RetryItem[] = [];

function getRandomDelay() {
    return Math.floor(Math.random() * 6) + 5; // 5 to 10
}

// -- Noun (Artikel) Quiz --

export function markNounFailed(noun: DBWord) {
    const existing = nounRetryQueue.find(item => item.word.id === noun.id);
    if (existing) {
        existing.delay = getRandomDelay();
    } else {
        nounRetryQueue.push({ word: noun, delay: getRandomDelay() });
    }
}

export function markNounPassed(id: number) {
    nounRetryQueue = nounRetryQueue.filter(item => item.word.id !== id);
}

export async function getNextNoun(): Promise<DBWord | null> {
    // Decrement delay for all items
    nounRetryQueue.forEach(item => { if (item.delay > 0) item.delay--; });

    // Find first item ready to be reviewed
    const readyItem = nounRetryQueue.find(item => item.delay <= 0);
    if (readyItem) {
        readyItem.delay = getRandomDelay(); // Reset delay in case they skip/unmount
        return readyItem.word;
    }

    return getRandomNoun();
}

// -- Meaning (Bedeutung) Quiz --

export function markWordFailed(word: DBWord) {
    const existing = wordRetryQueue.find(item => item.word.id === word.id);
    if (existing) {
        existing.delay = getRandomDelay();
    } else {
        wordRetryQueue.push({ word, delay: getRandomDelay() });
    }
}

export function markWordPassed(id: number) {
    wordRetryQueue = wordRetryQueue.filter(item => item.word.id !== id);
}

export async function getNextWord(): Promise<DBWord | null> {
    wordRetryQueue.forEach(item => { if (item.delay > 0) item.delay--; });

    const readyItem = wordRetryQueue.find(item => item.delay <= 0);
    if (readyItem) {
        readyItem.delay = getRandomDelay();
        return readyItem.word;
    }

    return getRandomWord();
}


