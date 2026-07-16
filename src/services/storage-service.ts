/**
 * storage-service.ts
 *
 * Thin wrapper around AsyncStorage for persisting user settings
 * and saved German reading paragraphs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Provider, GeneratedParagraph, ParagraphLength } from './ai-service';

// ─── Keys ──────────────────────────────────────────────────────────────────

const KEYS = {
    SETTINGS: '@german_app/settings',
    SAVED_PARAGRAPHS: '@german_app/saved_paragraphs',
    LAST_FORM: '@german_app/last_form',
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

export type WordFrequency = 'every_open' | 'hourly' | 'daily';

export interface AppSettings {
    provider: Provider;
    model: string;
    apiKey: string;
    wordFrequency: WordFrequency;
    lastWordTime: number;
    currentWordId: number | null;
}

export interface LastFormValues {
    cefrLevel: string;
    topic: string;
    length: ParagraphLength;
}

export interface SavedParagraph {
    id: string;
    createdAt: string;
    cefrLevel: string;
    topic: string;
    data: GeneratedParagraph;
}

// ─── Settings ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    apiKey: '',
    wordFrequency: 'hourly',
    lastWordTime: 0,
    currentWordId: null,
};

export async function loadSettings(): Promise<AppSettings> {
    try {
        const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
        if (!raw) return DEFAULT_SETTINGS;
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

// ─── Last Form Values ──────────────────────────────────────────────────────

const DEFAULT_FORM: LastFormValues = {
    cefrLevel: 'A2',
    topic: '',
    length: 'short',
};

export async function loadLastForm(): Promise<LastFormValues> {
    try {
        const raw = await AsyncStorage.getItem(KEYS.LAST_FORM);
        if (!raw) return DEFAULT_FORM;
        return { ...DEFAULT_FORM, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_FORM;
    }
}

export async function saveLastForm(values: LastFormValues): Promise<void> {
    await AsyncStorage.setItem(KEYS.LAST_FORM, JSON.stringify(values));
}

// ─── Saved Paragraphs ──────────────────────────────────────────────────────

export async function loadSavedParagraphs(): Promise<SavedParagraph[]> {
    try {
        const raw = await AsyncStorage.getItem(KEYS.SAVED_PARAGRAPHS);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

export async function saveParagraph(entry: SavedParagraph): Promise<void> {
    const existing = await loadSavedParagraphs();
    // Prepend new, keep only the 10 most recent
    const updated = [entry, ...existing].slice(0, 10);
    await AsyncStorage.setItem(KEYS.SAVED_PARAGRAPHS, JSON.stringify(updated));
}

export async function deleteSavedParagraph(id: string): Promise<void> {
    const existing = await loadSavedParagraphs();
    const updated = existing.filter((p) => p.id !== id);
    await AsyncStorage.setItem(KEYS.SAVED_PARAGRAPHS, JSON.stringify(updated));
}

export async function clearAllData(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
}
