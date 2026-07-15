/**
 * paragraph-viewer.tsx
 *
 * Renders a German paragraph as inline tappable word tokens.
 * Words are looked up by their stripped form in the meanings map.
 * Unknown words (punctuation-only tokens) render as plain text.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

import type { GeneratedParagraph, WordMeaning } from '@/services/ai-service';
import { WordToken } from '@/components/word-token';
import { WordPopup } from '@/components/word-popup';

interface ParagraphViewerProps {
    data: GeneratedParagraph;
}

// Strip common punctuation around a word to match the meanings map.
function stripPunctuation(token: string): string {
    return token.replace(/^[^a-zA-ZÄÖÜäöüß]+|[^a-zA-ZÄÖÜäöüß]+$/g, '');
}

export function ParagraphViewer({ data }: ParagraphViewerProps) {
    const [selectedWord, setSelectedWord] = useState<WordMeaning | null>(null);

    // Build a case-insensitive lookup: word → meaning entry
    const meaningsMap = useMemo(() => {
        const map = new Map<string, WordMeaning>();
        for (const entry of data.words) {
            map.set(entry.word.toLowerCase(), entry);
        }
        return map;
    }, [data.words]);

    // Split paragraph into tokens while preserving spaces/punctuation.
    const tokens = useMemo(
        () => data.paragraph.split(/(\s+)/),
        [data.paragraph],
    );

    const handleWordPress = useCallback((wordData: WordMeaning) => {
        setSelectedWord(wordData);
    }, []);

    const handleClose = useCallback(() => {
        setSelectedWord(null);
    }, []);

    return (
        <View>
            {/* Inline-flex row that wraps naturally like a paragraph */}
            <View style={styles.paragraph}>
                {tokens.map((token, index) => {
                    // Pure whitespace tokens — render as a non-breaking space "glue"
                    if (/^\s+$/.test(token)) {
                        return null; // the WordToken already appends a trailing space
                    }

                    const stripped = stripPunctuation(token);
                    const meaningEntry = stripped
                        ? meaningsMap.get(stripped.toLowerCase())
                        : null;

                    if (meaningEntry) {
                        // Restore any trailing punctuation from the raw token
                        const trailing = token.slice(stripped.length + token.indexOf(stripped)).replace(stripped, '') + ' ';
                        return (
                            <WordToken
                                key={`${index}-${token}`}
                                wordData={meaningEntry}
                                onPress={handleWordPress}
                                trailing={trailing || ' '}
                            />
                        );
                    }

                    // Token not in meanings map (punctuation, numbers, unknown) — plain text
                    return (
                        <ThemedText key={`${index}-${token}`} style={styles.plainToken}>
                            {token + ' '}
                        </ThemedText>
                    );
                })}
            </View>

            <WordPopup word={selectedWord} onClose={handleClose} />
        </View>
    );
}

const styles = StyleSheet.create({
    paragraph: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 2,
    },
    plainToken: {
        fontSize: 16,
        lineHeight: 26,
    },
});
