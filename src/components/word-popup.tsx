/**
 * word-popup.tsx
 *
 * Modal that appears when the user taps a word in the paragraph.
 * Shows the German word, its contextual English meaning, and a
 * speak button that uses the device's built-in TTS engine.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    ActivityIndicator,
} from 'react-native';

import type { WordMeaning } from '@/services/ai-service';
import { speakGermanWord } from '@/services/tts-service';
import { useTheme } from '@/hooks/use-theme';

interface WordPopupProps {
    word: WordMeaning | null;
    onClose: () => void;
}

export function WordPopup({ word, onClose }: WordPopupProps) {
    const theme = useTheme();
    const scaleAnim = useRef(new Animated.Value(0.85)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const [isSpeaking, setIsSpeaking] = React.useState(false);

    const visible = word !== null;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    damping: 15,
                    stiffness: 200,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            scaleAnim.setValue(0.85);
            opacityAnim.setValue(0);
        }
    }, [visible, scaleAnim, opacityAnim]);

    const handleSpeak = useCallback(async () => {
        if (!word || isSpeaking) return;
        setIsSpeaking(true);
        try {
            await speakGermanWord(word.word);
        } finally {
            // expo-speech fires and forgets — reset after a brief delay
            setTimeout(() => setIsSpeaking(false), 2000);
        }
    }, [word, isSpeaking]);

    if (!word) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            {/* Backdrop */}
            <Pressable
                style={styles.backdrop}
                onPress={onClose}
                accessibilityLabel="Close word popup"
            >
                {/* Card */}
                <Pressable onPress={(e) => e.stopPropagation()}>
                    <Animated.View
                        style={[
                            styles.card,
                            {
                                backgroundColor: theme.backgroundElement,
                                transform: [{ scale: scaleAnim }],
                                opacity: opacityAnim,
                                shadowColor: '#000',
                            },
                        ]}
                    >
                        {/* Header row */}
                        <View style={styles.header}>
                            <Text style={[styles.germanWord, { color: theme.text }]}>
                                {word.word}
                            </Text>
                            <Pressable
                                onPress={onClose}
                                style={[
                                    styles.closeBtn,
                                    { backgroundColor: theme.backgroundSelected },
                                ]}
                                hitSlop={8}
                                accessibilityLabel="Close"
                            >
                                <Text style={[styles.closeBtnText, { color: theme.textSecondary }]}>
                                    ✕
                                </Text>
                            </Pressable>
                        </View>

                        {/* Meaning */}
                        <Text style={[styles.meaning, { color: theme.textSecondary }]}>
                            {word.meaning}
                        </Text>

                        {/* Speak button */}
                        <Pressable
                            onPress={handleSpeak}
                            style={({ pressed }) => [
                                styles.speakBtn,
                                { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                                styles.speakBtnBorder,
                            ]}
                            accessibilityLabel={`Pronounce ${word.word}`}
                        >
                            {isSpeaking ? (
                                <ActivityIndicator size="small" color={theme.text} />
                            ) : (
                                <Text style={styles.speakBtnIcon}>🔊</Text>
                            )}
                            <Text style={[styles.speakBtnLabel, { color: theme.text }]}>
                                {isSpeaking ? 'Speaking…' : 'Pronounce'}
                            </Text>
                        </Pressable>
                    </Animated.View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 20,
        padding: 24,
        gap: 12,
        // iOS shadow
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        // Android shadow
        elevation: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    germanWord: {
        fontSize: 26,
        fontWeight: '700',
        letterSpacing: 0.3,
        flexShrink: 1,
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    closeBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
    meaning: {
        fontSize: 15,
        lineHeight: 22,
    },
    speakBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        alignSelf: 'flex-start',
    },
    speakBtnBorder: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(128,128,128,0.25)',
    },
    speakBtnIcon: {
        fontSize: 18,
    },
    speakBtnLabel: {
        fontSize: 14,
        fontWeight: '500',
    },
});
