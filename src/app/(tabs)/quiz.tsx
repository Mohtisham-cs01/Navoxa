/**
 * quiz.tsx – "Guess the Article" quiz.
 *
 * After the user taps a button:
 *   • Correct button → GREEN
 *   • Wrong button   → RED  (the correct answer also turns GREEN so the user knows)
 *   • Other buttons  → dimmed / neutral
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
import { getNextNoun, markNounFailed, markNounPassed, type DBWord } from '@/services/database-service';

const ARTICLES = ['der', 'die', 'das'] as const;
const GREEN = '#22c55e';
const RED = '#ef4444';

function isCorrectArticle(guessed: string, correctArticleRaw: string | null | undefined): boolean {
    if (!correctArticleRaw) return false;
    const validArticles = correctArticleRaw.toLowerCase().split(/[\s/,]+/).map(a => a.trim()).filter(Boolean);
    return validArticles.includes(guessed.toLowerCase());
}

export default function QuizScreen() {
    const theme = useTheme();

    const [noun, setNoun] = useState<DBWord | null>(null);
    const [loading, setLoading] = useState(true);
    const [chosen, setChosen] = useState<string | null>(null);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [total, setTotal] = useState(0);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const loadNoun = useCallback(async () => {
        setLoading(true);
        setChosen(null);
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(
            async () => {
                const w = await getNextNoun();
                setNoun(w);
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
        loadNoun();
        return () => {
            Speech.stop();
        };
    }, []);

    const speakWord = useCallback(() => {
        if (!noun) return;
        const textToSpeak = (noun.word || '').replace(/^(der|die|das)\s+/i, '');
        Speech.stop();
        Speech.speak(textToSpeak, { language: 'de-DE' });
    }, [noun]);

    const triggerShake = useCallback(() => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 7, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -7, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 35, useNativeDriver: true }),
        ]).start();
    }, [shakeAnim]);

    const handleGuess = useCallback((article: string) => {
        if (chosen || !noun) return;
        const correct = isCorrectArticle(article, noun.article);
        setChosen(article);
        setTotal(t => t + 1);
        if (correct) { 
            setScore(s => s + 1); 
            setStreak(s => s + 1); 
            markNounPassed(noun.id);
        } else { 
            setStreak(0); 
            triggerShake(); 
            markNounFailed(noun);
        }
    }, [chosen, noun, triggerShake]);

    /**
     * Button colour rules (simple & clear):
     *   - Before guess: neutral bg
     *   - The CORRECT answer: GREEN (always shown after a guess)
     *   - The WRONG tapped answer: RED
     *   - Other buttons: dimmed neutral
     */
    const btnStyle = useCallback((art: string) => {
        if (!chosen) return { bg: theme.backgroundElement, text: theme.text };
        const isCorrect = isCorrectArticle(art, noun?.article);
        const isPicked = chosen === art;
        if (isCorrect) return { bg: GREEN, text: '#fff' };
        if (isPicked && !isCorrect) return { bg: RED, text: '#fff' };
        return { bg: theme.backgroundSelected, text: theme.textSecondary };
    }, [chosen, noun, theme]);

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
                        <Text style={[styles.title, { color: theme.text }]}>Artikel Quiz</Text>
                        <Text style={[styles.sub, { color: theme.textSecondary }]}>
                            Which article does the noun take?
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
                    ) : noun ? (
                        <Animated.View style={[
                            styles.card,
                            {
                                backgroundColor: theme.backgroundElement,
                                opacity: fadeAnim,
                                transform: [{ scale: scaleAnim }, { translateX: shakeAnim }]
                            },
                        ]}>
                            <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
                                <Text style={[styles.chipText, { color: theme.textSecondary }]}>Nomen · noun</Text>
                            </View>
                            {/* Word WITHOUT article */}
                            <View style={styles.wordRow}>
                                <Text style={[styles.word, { color: theme.text }]} adjustsFontSizeToFit numberOfLines={2}>
                                    {(noun.word || '').replace(/^(der|die|das)\s+/i, '')}
                                </Text>
                                <Pressable
                                    onPress={speakWord}
                                    style={({ pressed }) => [styles.speakBtn, { opacity: pressed ? 0.6 : 1 }]}
                                    accessibilityLabel="Hear word spoken"
                                >
                                    <Text style={styles.speakIcon}>🔊</Text>
                                </Pressable>
                            </View>
                            {noun.meaning ? (
                                <Text style={[styles.hint, { color: theme.textSecondary }]}>{noun.meaning}</Text>
                            ) : null}

                            {/* Result banner */}
                            {chosen && (
                                <View style={[
                                    styles.banner,
                                    { backgroundColor: isCorrectArticle(chosen, noun.article) ? '#dcfce7' : '#fee2e2' },
                                ]}>
                                    <Text style={[
                                        styles.bannerText,
                                        { color: isCorrectArticle(chosen, noun.article) ? '#15803d' : '#b91c1c' },
                                    ]}>
                                        {isCorrectArticle(chosen, noun.article)
                                            ? `✓  Richtig! — ${noun.article}`
                                            : `✗  Falsch — it's "${noun.article}"`}
                                    </Text>
                                </View>
                            )}
                        </Animated.View>
                    ) : (
                        <View style={[styles.card, { backgroundColor: theme.backgroundElement }, styles.cardCenter]}>
                            <Text style={{ color: theme.textSecondary }}>No noun found.</Text>
                        </View>
                    )}

                    {/* Article buttons */}
                    <View style={styles.row}>
                        {ARTICLES.map(art => {
                            const s = btnStyle(art);
                            return (
                                <Pressable
                                    key={art}
                                    onPress={() => handleGuess(art)}
                                    disabled={!!chosen || loading}
                                    style={({ pressed }) => [
                                        styles.artBtn,
                                        { backgroundColor: s.bg, opacity: pressed ? 0.75 : 1 },
                                    ]}
                                >
                                    <Text style={[styles.artBtnText, { color: s.text }]}>{art}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {/* Next */}
                    {chosen && (
                        <Pressable
                            onPress={loadNoun}
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
    content: { flexGrow: 1, width: '100%', maxWidth: MaxContentWidth, paddingTop: Spacing.four, gap: Spacing.four },
    title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
    sub: { fontSize: 14, marginTop: 4 },
    stats: { flexDirection: 'row', borderRadius: 16, paddingVertical: 14, paddingHorizontal: Spacing.three, alignItems: 'center' },
    statBox: { alignItems: 'center', flex: 1 },
    statVal: { fontSize: 20, fontWeight: '800' },
    statLbl: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, marginTop: 2 },
    statSep: { width: 1, height: 28, opacity: 0.2 },
    card: { borderRadius: 24, padding: Spacing.five, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, gap: Spacing.three },
    cardCenter: { alignItems: 'center', justifyContent: 'center', minHeight: 160 },
    chip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
    chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
    speakBtn: { padding: Spacing.one },
    speakIcon: { fontSize: 28 },
    word: { fontSize: 38, fontWeight: '900', letterSpacing: -0.5 },
    hint: { fontSize: 16, lineHeight: 24 },
    banner: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
    bannerText: { fontSize: 15, fontWeight: '700' },
    row: { flexDirection: 'row', gap: Spacing.two },
    artBtn: { flex: 1, paddingVertical: Spacing.three, borderRadius: 18, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4 },
    artBtnText: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
    nextBtn: { borderRadius: 16, paddingVertical: Spacing.three, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
    nextText: { fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
});
