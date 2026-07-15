/**
 * word-token.tsx
 *
 * An inline pressable word inside the paragraph.
 * Highlights with a subtle background on press.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { WordMeaning } from '@/services/ai-service';
import { useTheme } from '@/hooks/use-theme';

interface WordTokenProps {
    wordData: WordMeaning;
    onPress: (wordData: WordMeaning) => void;
    /** Trailing text appended after the word (e.g. space, comma). */
    trailing?: string;
}

export function WordToken({ wordData, onPress, trailing = ' ' }: WordTokenProps) {
    const theme = useTheme();

    return (
        <Pressable
            onPress={() => onPress(wordData)}
            style={({ pressed }) => [
                styles.token,
                pressed && { backgroundColor: theme.backgroundSelected },
            ]}
            hitSlop={2}
            accessibilityRole="button"
            accessibilityLabel={`Tap to see meaning of ${wordData.word}`}
        >
            <Text style={[styles.word, { color: theme.text }]}>
                {wordData.word}
                <Text style={{ color: theme.textSecondary }}>{trailing}</Text>
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    token: {
        borderRadius: 4,
        paddingHorizontal: 1,
        paddingVertical: 1,
    },
    word: {
        fontSize: 16,
        lineHeight: 26,
    },
});
