/**
 * database-service.ts
 *
 * Handles copying the bundled word.db into the writable document directory
 * and querying the 'Word of the Day' using expo-sqlite.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'word.db';

export interface Meaning {
    meaning: string;
}

export interface Example {
    example: string;
    translation?: string;
}

export interface WordForm {
    form: string;
    tags?: string[];
}

export interface DBWord {
    id: number;
    lemma: string;
    pos: string;
    gender: string | null;
    meanings: string[];
    forms: WordForm[];
    examples: string[];
}

/**
 * Initializes the database by copying it from the bundled assets
 * into the local SQlite directory folder if it doesn't already exist.
 */
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
    const dbDir = `${(FileSystem as any).documentDirectory}SQLite`;
    const dbPath = `${dbDir}/${DB_NAME}`;

    // Ensure SQLite directory exists
    const dirInfo = await FileSystem.getInfoAsync(dbDir);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
    }

    const fileInfo = await FileSystem.getInfoAsync(dbPath);
    if (!fileInfo.exists) {
        // Requires metro.config.js to have assetExts.push('db')
        const asset = require('@/assets/word.db');
        const assetObj = await Asset.fromModule(asset).downloadAsync();

        if (assetObj.localUri) {
            await FileSystem.copyAsync({
                from: assetObj.localUri,
                to: dbPath,
            });
        } else {
            throw new Error('Failed to download bundled database asset.');
        }
    }

    // Open the database sync/async (using the new SDK 50+ API)
    return await SQLite.openDatabaseAsync(DB_NAME);
}

/**
 * Retrieves a random word from the database.
 */
export async function getRandomWord(): Promise<DBWord | null> {
    try {
        const db = await initDatabase();

        const row = await db.getFirstAsync<any>('SELECT * FROM words ORDER BY RANDOM() LIMIT 1');
        if (!row) return null;

        // Parse JSON fields
        let meaningsRaw = [];
        let formsRaw = [];
        let examplesRaw = [];

        try { if (row.meanings) meaningsRaw = JSON.parse(row.meanings); } catch (e) { }
        try { if (row.forms) formsRaw = JSON.parse(row.forms); } catch (e) { }
        try { if (row.examples) examplesRaw = JSON.parse(row.examples); } catch (e) { }

        return {
            id: row.id,
            lemma: row.lemma,
            pos: row.pos,
            gender: row.gender,
            meanings: meaningsRaw,
            forms: formsRaw,
            examples: examplesRaw,
        };
    } catch (error) {
        console.error('Error fetching random word:', error);
        return null;
    }
}
