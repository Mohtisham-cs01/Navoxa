/**
 * tts-service.ts
 *
 * Speaks German words using expo-speech, which wraps the device's
 * built-in TTS engine (iOS: AVSpeechSynthesizer, Android: TextToSpeech).
 * No API key or network request required — works completely offline.
 */

import * as Speech from 'expo-speech';

/**
 * Speaks the given German word with a German locale voice.
 * On most devices, 'de-DE' selects a German voice automatically.
 */
export async function speakGermanWord(word: string): Promise<void> {
    // Stop any currently playing speech first.
    await Speech.stop();

    Speech.speak(word, {
        language: 'de-DE',
        pitch: 1.0,
        rate: 0.85, // Slightly slower for learning purposes.
    });
}

/**
 * Returns whether the device has at least one German voice installed.
 * Useful to show/hide the speaker button gracefully.
 */
export async function isGermanTTSAvailable(): Promise<boolean> {
    try {
        const voices = await Speech.getAvailableVoicesAsync();
        // Check for any voice that supports German.
        return voices.some(
            (v) => v.language?.startsWith('de') || v.identifier?.includes('de'),
        );
    } catch {
        // If the API isn't available (old Android), assume TTS still works
        // via the default synthesis engine.
        return true;
    }
}
