/**
 * meaning-quiz.tsx – "Guess the Meaning" quiz.
 *
 * Shows a German word; the user picks the correct English meaning
 * from 4 options (1 correct + 3 random distractors).
 *
 * Feedback colours (simple):
 *   • Correct choice:      GREEN
 *   • Wrong choice tapped: RED  (correct one also turns GREEN)
 *   • Others:              dimmed neutral
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as Speech from 'expo-speech';

import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getNextWord, getFourOptions, markWordFailed, markWordPassed, type DBWord } from '@/services/database-service';

const GREEN = '#22c55e';
const RED = '#ef4444';

interface Option { id: number; meaning: string; }

export default function MeaningQuizScreen() {
    const theme = useTheme();

    const [word, setWord] = useState<DBWord | null>(null);
    const [options, setOptions] = useState<Option[]>([]);
    const [loading, setLoading] = useState(true);
    const [chosen, setChosen] = useState<number | null>(null); // id of option picked
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [total, setTotal] = useState(0);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const loadQuestion = useCallback(async () => {
        setLoading(true);
        setChosen(null);
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(
            async () => {
                try {
                    const correct = await getNextWord();
                    if (!correct) { setLoading(false); return; }
                    const opts = await getFourOptions(correct);
                    setWord(correct);
                    setOptions(opts);
                } catch { /* leave loading=true, shown as error */ }
                setLoading(false);
                scaleAnim.setValue(0.92);
                Animated.parallel([
                    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
                    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
                ]).start();
            }
        );
    }, [fadeAnim, scaleAnim]);

    useEffect(() => {
        loadQuestion();
        return () => {
            Speech.stop();
        };
    }, []);

    const speakWord = useCallback(() => {
        if (!word) return;
        Speech.stop();
        Speech.speak(word.word, { language: 'de-DE' });
    }, [word]);

    const triggerShake = useCallback(() => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 7, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -7, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 35, useNativeDriver: true }),
        ]).start();
    }, [shakeAnim]);

    const handleGuess = useCallback((optId: number) => {
        if (chosen !== null || !word) return;
        const correct = optId === word.id;
        setChosen(optId);
        setTotal(t => t + 1);
        if (correct) { 
            setScore(s => s + 1); 
            setStreak(s => s + 1); 
            markWordPassed(word.id);
        } else { 
            setStreak(0); 
            triggerShake(); 
            markWordFailed(word);
        }
    }, [chosen, word, triggerShake]);

    /** Green for correct option, Red for wrong pick, dimmed for rest */
    const btnStyle = useCallback((opt: Option) => {
        if (chosen === null) return { bg: theme.backgroundElement, text: theme.text };
        const isCorrect = opt.id === word?.id;
        const isPicked = opt.id === chosen;
        if (isCorrect) return { bg: GREEN, text: '#fff' };
        if (isPicked && !isCorrect) return { bg: RED, text: '#fff' };
        return { bg: theme.backgroundSelected, text: theme.textSecondary };
    }, [chosen, word, theme]);

    const isCorrect = chosen !== null && word !== null && chosen === word.id;
    const accuracy = total === 0 ? 0 : Math.round((score / total) * 100);

    return (
        <ThemedView style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={[styles.content, { paddingBottom: BottomTabInset + Spacing.six }]}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View>
                        <Text style={[styles.title, { color: theme.text }]}>Bedeutung Quiz</Text>
                        <Text style={[styles.sub, { color: theme.textSecondary }]}>
                            What does the German word mean?
                        </Text>
                    </View>

                    {/* Stats */}
                    <View style={[styles.stats, { backgroundColor: theme.backgroundElement }]}>
                        {[
                            { label: 'Correct', value: score },
                            { label: 'Total', value: total },
                            { label: 'Accuracy', value: `${accuracy}%` },
                            ...(streak >= 2 ? [{ label: 'Streak 🔥', value: streak }] : []),
                        ].map((s, i, arr) => (
                            <React.Fragment key={s.label}>
                                <View style={styles.statBox}>
                                    <Text style={[styles.statVal, { color: theme.text }]}>{s.value}</Text>
                                    <Text style={[styles.statLbl, { color: theme.textSecondary }]}>{s.label}</Text>
                                </View>
                                {i < arr.length - 1 && (
                                    <View style={[styles.statSep, { backgroundColor: theme.textSecondary }]} />
                                )}
                            </React.Fragment>
                        ))}
                    </View>

                    {/* Word card */}
                    {loading ? (
                        <View style={[styles.card, { backgroundColor: theme.backgroundElement }, styles.cardCenter]}>
                            <ActivityIndicator size="large" color={theme.text} />
                        </View>
                    ) : word ? (
                        <Animated.View style={[
                            styles.card,
                            {
                                backgroundColor: theme.backgroundElement,
                                opacity: fadeAnim,
                                transform: [{ scale: scaleAnim }, { translateX: shakeAnim }]
                            },
                        ]}>
                            {/* POS chip */}
                            <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
                                <Text style={[styles.chipText, { color: theme.textSecondary }]}>
                                    {word.pos || 'word'}
                                </Text>
                            </View>

                            {/* The German word */}
                            <View style={styles.wordRow}>
                                <Text style={[styles.word, { color: theme.text }]} adjustsFontSizeToFit numberOfLines={2}>
                                    {word.word}
                                </Text>
                                <Pressable
                                    onPress={speakWord}
                                    style={({ pressed }) => [styles.speakBtn, { opacity: pressed ? 0.6 : 1 }]}
                                    accessibilityLabel="Hear word spoken"
                                >
                                    <Text style={styles.speakIcon}>🔊</Text>
                                </Pressable>
                            </View>

                            {/* Example if available */}
                            {word.examples ? (
                                <Text style={[styles.example, { color: theme.textSecondary }]} numberOfLines={3}>
                                    z.B. {word.examples.replace(/\\n/g, ' ')}
                                </Text>
                            ) : null}

                            {/* Result banner */}
                            {chosen !== null && (
                                <View style={[
                                    styles.banner,
                                    { backgroundColor: isCorrect ? '#dcfce7' : '#fee2e2' },
                                ]}>
                                    <Text style={[styles.bannerText, { color: isCorrect ? '#15803d' : '#b91c1c' }]}>
                                        {isCorrect ? '✓  Richtig!' : `✗  Falsch — "${word.meaning}"`}
                                    </Text>
                                </View>
                            )}
                        </Animated.View>
                    ) : (
                        <View style={[styles.card, { backgroundColor: theme.backgroundElement }, styles.cardCenter]}>
                            <Text style={{ color: theme.textSecondary }}>No word found.</Text>
                        </View>
                    )}

                    {/* Choice buttons */}
                    {options.map(opt => {
                        const s = btnStyle(opt);
                        return (
                            <Pressable
                                key={opt.id}
                                onPress={() => handleGuess(opt.id)}
                                disabled={chosen !== null || loading}
                                style={({ pressed }) => [
                                    styles.choiceBtn,
                                    { backgroundColor: s.bg, opacity: pressed ? 0.75 : 1 },
                                ]}
                            >
                                <Text style={[styles.choiceText, { color: s.text }]} numberOfLines={2}>
                                    {opt.meaning}
                                </Text>
                            </Pressable>
                        );
                    })}

                    {/* Next */}
                    {chosen !== null && (
                        <Pressable
                            onPress={loadQuestion}
                            style={({ pressed }) => [styles.nextBtn, { backgroundColor: theme.text, opacity: pressed ? 0.8 : 1 }]}
                        >
                            <Text style={[styles.nextText, { color: theme.background }]}>Next Word →</Text>
                        </Pressable>
                    )}
                </ScrollView>
            </SafeAreaView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1, paddingHorizontal: Spacing.four, alignItems: 'center' },
    scroll: { flex: 1, width: '100%' },
    content: { flexGrow: 1, width: '100%', maxWidth: MaxContentWidth, paddingTop: Spacing.four, gap: Spacing.three },
    title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
    sub: { fontSize: 14, marginTop: 4 },
    stats: { flexDirection: 'row', borderRadius: 16, paddingVertical: 14, paddingHorizontal: Spacing.three, alignItems: 'center' },
    statBox: { alignItems: 'center', flex: 1 },
    statVal: { fontSize: 20, fontWeight: '800' },
    statLbl: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, marginTop: 2 },
    statSep: { width: 1, height: 28, opacity: 0.2 },
    card: { borderRadius: 24, padding: Spacing.five, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, gap: Spacing.three },
    cardCenter: { alignItems: 'center', justifyContent: 'center', minHeight: 140 },
    chip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
    chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
    speakBtn: { padding: Spacing.one },
    speakIcon: { fontSize: 28 },
    word: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
    example: { fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
    banner: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
    bannerText: { fontSize: 15, fontWeight: '700' },
    choiceBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: Spacing.three, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3 },
    choiceText: { fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
    nextBtn: { borderRadius: 16, paddingVertical: Spacing.three, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
    nextText: { fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
});
