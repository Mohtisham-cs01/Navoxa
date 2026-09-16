/**
 * dictionary.tsx
 *
 * "Wörterbuch" tab — LLM-powered German vocabulary builder.
 *
 * Features
 * --------
 *  • Generate N new words (with sentences) via LLM → saved to local DB
 *  • If a word already exists in DB, only new sentences are added
 *  • Browse all saved words, expand any word to read its sentences
 *  • "Get more sentences" button fetches more from LLM if needed and
 *    saves them so they're available offline next time
 *  • Clean, beautiful dark/light-aware UI with micro-animations
 */

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Platform,
    Alert,
} from 'react-native';

import { useFocusEffect } from 'expo-router';
import { useSettings } from '@/context/settings-context';
import { useTheme } from '@/hooks/use-theme';
import {
    generateDictionaryWords,
    generateMoreSentences,
    generateSpecificDictionaryWords,
    type LLMGeneratedWord,
} from '@/services/ai-service';
import {
    getAllGeneratedWords,
    getSentencesForWord,
    saveWordWithSentences,
    checkWordExists,
    deleteWord,
    type GeneratedWord,
    type GeneratedSentence,
} from '@/services/dictionary-service';
import { getPendingWords, clearPendingWords, type PendingWord } from '@/services/storage-service';

// ─── Tense badge colours ────────────────────────────────────────────────────

const TENSE_COLORS: Record<string, string> = {
    present:     '#4F9EFF',
    past:        '#A78BFA',
    future:      '#34D399',
    question:    '#F59E0B',
    conditional: '#F97316',
    imperative:  '#EC4899',
};

function tenseColor(tense: string): string {
    return TENSE_COLORS[tense.toLowerCase()] ?? '#6B7280';
}

// ─── Small reusable pieces ──────────────────────────────────────────────────

function TenseBadge({ tense }: { tense: string }) {
    const color = tenseColor(tense);
    return (
        <View style={[styles.tenseBadge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
            <Text style={[styles.tenseBadgeText, { color }]}>
                {tense.toUpperCase()}
            </Text>
        </View>
    );
}

function PosTag({ pos, article }: { pos: string; article: string | null }) {
    const label = article ? `${article} · ${pos}` : pos;
    return (
        <View style={styles.posTag}>
            <Text style={styles.posTagText}>{label}</Text>
        </View>
    );
}

// ─── Sentence row ────────────────────────────────────────────────────────────

interface SentenceRowProps {
    sentence: GeneratedSentence;
    theme: ReturnType<typeof useTheme>;
}

function SentenceRow({ sentence, theme }: SentenceRowProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={[styles.sentenceRow, { backgroundColor: theme.backgroundElement }]}
            accessibilityLabel={`Example sentence: ${sentence.sentence}`}
        >
            <View style={styles.sentenceTop}>
                <TenseBadge tense={sentence.tense} />
                <Text style={[styles.sentenceText, { color: theme.text }]}>
                    {sentence.sentence}
                </Text>
            </View>
            {expanded && (
                <Text style={[styles.sentenceTranslation, { color: theme.textSecondary }]}>
                    {sentence.translation}
                </Text>
            )}
            <Text style={[styles.sentenceTap, { color: theme.textSecondary }]}>
                {expanded ? '▲ hide translation' : '▼ tap for translation'}
            </Text>
        </Pressable>
    );
}

// ─── Word card ───────────────────────────────────────────────────────────────

interface WordCardProps {
    word: GeneratedWord;
    theme: ReturnType<typeof useTheme>;
    onLoadSentences: (wordId: number) => Promise<GeneratedSentence[]>;
    onMoreSentences: (word: GeneratedWord) => void;
    onDelete: (wordId: number) => void;
}

function WordCard({ word, theme, onLoadSentences, onMoreSentences, onDelete }: WordCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [sentences, setSentences] = useState<GeneratedSentence[]>([]);
    const [loading, setLoading] = useState(false);
    const heightAnim = useRef(new Animated.Value(0)).current;

    const handleExpand = useCallback(async () => {
        if (!expanded) {
            setLoading(true);
            const rows = await onLoadSentences(word.id);
            setSentences(rows);
            setLoading(false);
        }
        setExpanded((v) => !v);
        Animated.timing(heightAnim, {
            toValue: expanded ? 0 : 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [expanded, word.id, onLoadSentences, heightAnim]);

    return (
        <View style={[styles.wordCard, { backgroundColor: theme.backgroundElement }]}>
            {/* Header */}
            <Pressable
                onPress={handleExpand}
                style={styles.wordCardHeader}
                accessibilityLabel={`Word: ${word.word}, ${word.meaning}`}
            >
                <View style={styles.wordCardLeft}>
                    <Text style={[styles.wordText, { color: theme.text }]}>
                        {word.article ? `${word.article} ` : ''}
                        <Text style={{ fontWeight: '800' }}>{word.word}</Text>
                    </Text>
                    <View style={styles.wordMeta}>
                        <PosTag pos={word.pos} article={null} />
                        {word.level && (
                            <View style={[styles.levelChip, { backgroundColor: theme.backgroundSelected }]}>
                                <Text style={[styles.levelChipText, { color: theme.textSecondary }]}>
                                    {word.level}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={[styles.meaningText, { color: theme.textSecondary }]}>
                        {word.meaning}
                    </Text>
                </View>
                <Text style={[styles.chevron, { color: theme.textSecondary }]}>
                    {expanded ? '▲' : '▼'}
                </Text>
            </Pressable>

            {/* Expanded section */}
            {expanded && (
                <View style={styles.sentencesSection}>
                    {loading ? (
                        <ActivityIndicator
                            color={theme.text}
                            style={{ marginVertical: 12 }}
                        />
                    ) : sentences.length === 0 ? (
                        <Text style={[styles.noSentences, { color: theme.textSecondary }]}>
                            No sentences saved yet.
                        </Text>
                    ) : (
                        sentences.map((s) => (
                            <SentenceRow key={s.id} sentence={s} theme={theme} />
                        ))
                    )}

                    {/* Action buttons */}
                    <View style={styles.cardActions}>
                        <Pressable
                            onPress={() => onMoreSentences(word)}
                            style={[styles.actionBtn, { backgroundColor: '#4F9EFF22', borderColor: '#4F9EFF55' }]}
                            accessibilityLabel={`Get more sentences for ${word.word}`}
                        >
                            <Text style={[styles.actionBtnText, { color: '#4F9EFF' }]}>
                                ✨ More sentences
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={() => onDelete(word.id)}
                            style={[styles.actionBtn, { backgroundColor: '#FF453A22', borderColor: '#FF453A55' }]}
                            accessibilityLabel={`Delete ${word.word}`}
                        >
                            <Text style={[styles.actionBtnText, { color: '#FF453A' }]}>
                                🗑 Delete
                            </Text>
                        </Pressable>
                    </View>
                </View>
            )}
        </View>
    );
}

// ─── Generate config bar ─────────────────────────────────────────────────────

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const WORD_COUNTS = [5, 8, 10, 15] as const;

interface GeneratorBarProps {
    theme: ReturnType<typeof useTheme>;
    isGenerating: boolean;
    onGenerate: (count: number, level: string, topic: string) => void;
    onCancel: () => void;
}

function GeneratorBar({ theme, isGenerating, onGenerate, onCancel }: GeneratorBarProps) {
    const [count, setCount] = useState<number>(8);
    const [level, setLevel] = useState('B1');
    const [topic, setTopic] = useState('');

    const spinAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (isGenerating) {
            Animated.loop(
                Animated.timing(spinAnim, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
            ).start();
        } else {
            spinAnim.setValue(0);
        }
    }, [isGenerating, spinAnim]);
    const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    return (
        <View style={[styles.generatorBar, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.generatorTitle, { color: theme.text }]}>
                🧠 Generate Words
            </Text>

            {/* Word count */}
            <Text style={[styles.barLabel, { color: theme.textSecondary }]}>Words per batch</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {WORD_COUNTS.map((n) => (
                    <Pressable
                        key={n}
                        onPress={() => setCount(n)}
                        style={[
                            styles.chip,
                            { backgroundColor: n === count ? theme.text : theme.backgroundSelected },
                        ]}
                    >
                        <Text style={[styles.chipText, { color: n === count ? theme.background : theme.text }]}>
                            {n}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>

            {/* CEFR level */}
            <Text style={[styles.barLabel, { color: theme.textSecondary }]}>CEFR Level</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {CEFR_LEVELS.map((l) => (
                    <Pressable
                        key={l}
                        onPress={() => setLevel(l)}
                        style={[
                            styles.chip,
                            { backgroundColor: l === level ? theme.text : theme.backgroundSelected },
                        ]}
                    >
                        <Text style={[styles.chipText, { color: l === level ? theme.background : theme.text }]}>
                            {l}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>

            {/* Topic */}
            <Text style={[styles.barLabel, { color: theme.textSecondary }]}>Topic (optional)</Text>
            <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="e.g. cooking, travel, technology…"
                placeholderTextColor={theme.textSecondary}
                style={[styles.topicInput, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
                returnKeyType="done"
                accessibilityLabel="Topic input"
            />

            {/* Button */}
            {isGenerating ? (
                <View style={styles.generatingRow}>
                    <Animated.Text style={[styles.spinnerEmoji, { transform: [{ rotate: spin }] }]}>
                        ⏳
                    </Animated.Text>
                    <Text style={[styles.generatingText, { color: theme.textSecondary }]}>
                        Generating words…
                    </Text>
                    <Pressable onPress={onCancel} style={styles.cancelBtn}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                </View>
            ) : (
                <Pressable
                    onPress={() => onGenerate(count, level, topic.trim() || 'general vocabulary')}
                    style={({ pressed }) => [
                        styles.generateBtn,
                        { backgroundColor: pressed ? theme.backgroundSelected : theme.text },
                    ]}
                    accessibilityLabel="Generate vocabulary words"
                >
                    <Text style={[styles.generateBtnText, { color: theme.background }]}>
                        ✨ Generate
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DictionaryScreen() {
    const { settings } = useSettings();
    const theme = useTheme();

    const [words, setWords] = useState<GeneratedWord[]>([]);
    const [pendingWords, setPendingWords] = useState<PendingWord[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isProcessingPending, setIsProcessingPending] = useState(false);
    const [isFetchingMore, setIsFetchingMore] = useState<number | null>(null); // word id being processed
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // ── Load saved words on mount ──
    const loadWords = useCallback(async () => {
        const rows = await getAllGeneratedWords();
        setWords(rows);
    }, []);

    const loadPending = useCallback(async () => {
        setPendingWords(await getPendingWords());
    }, []);

    useEffect(() => {
        loadWords();
    }, [loadWords]);

    useFocusEffect(
        useCallback(() => {
            loadPending();
        }, [loadPending])
    );

    // ── Show a brief success banner ──
    const showSuccess = useCallback((msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 3000);
    }, []);

    // ── Generate batch of words ──
    const handleGenerate = useCallback(
        async (count: number, level: string, topic: string) => {
            if (!settings.apiKey && settings.provider !== 'pollinations') {
                setError('Please add your API key in Settings first.');
                return;
            }

            setError(null);
            setIsGenerating(true);
            abortRef.current = new AbortController();

            try {
                const config = {
                    provider: settings.provider,
                    model: settings.model,
                    apiKey: settings.apiKey,
                };

                const generated: LLMGeneratedWord[] = await generateDictionaryWords(
                    config,
                    count,
                    level,
                    topic,
                    abortRef.current.signal,
                );

                // Save to DB (skips duplicate words, only adds sentences)
                let newWords = 0;
                let addedSentences = 0;
                for (const w of generated) {
                    const existingId = await checkWordExists(w.word);
                    await saveWordWithSentences({
                        word: w.word,
                        article: w.article,
                        pos: w.pos,
                        meaning: w.meaning,
                        level,
                        sentences: w.sentences,
                    });
                    if (!existingId) newWords++;
                    else addedSentences += w.sentences.length;
                }

                await loadWords();
                showSuccess(
                    newWords > 0
                        ? `Added ${newWords} new words (${generated.length - newWords} already existed — sentences merged)`
                        : `All words already in your dictionary — ${addedSentences} new sentences added`,
                );
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
                setError(err?.message ?? 'Something went wrong. Please try again.');
            } finally {
                setIsGenerating(false);
                abortRef.current = null;
            }
        },
        [settings, loadWords, showSuccess],
    );

    const handleProcessPending = useCallback(async () => {
        if (!settings.apiKey && settings.provider !== 'pollinations') {
            setError('Please add your API key in Settings first.');
            return;
        }

        setError(null);
        setIsProcessingPending(true);
        abortRef.current = new AbortController();

        try {
            const config = {
                provider: settings.provider,
                model: settings.model,
                apiKey: settings.apiKey,
            };

            const generated = await generateSpecificDictionaryWords(
                config,
                pendingWords,
                abortRef.current.signal,
            );

            let newWords = 0;
            let addedSentences = 0;
            for (const w of generated) {
                const existingId = await checkWordExists(w.word);
                await saveWordWithSentences({
                    word: w.word,
                    article: w.article,
                    pos: w.pos,
                    meaning: w.meaning,
                    sentences: w.sentences,
                });
                if (!existingId) newWords++;
                else addedSentences += w.sentences.length;
            }

            await clearPendingWords();
            await loadPending();
            await loadWords();
            showSuccess(`Processed queued words: ${newWords} added, ${addedSentences} new sentences.`);
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            setError(err?.message ?? 'Failed to process pending words.');
        } finally {
            setIsProcessingPending(false);
            abortRef.current = null;
        }
    }, [settings, pendingWords, loadWords, loadPending, showSuccess]);

    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    // ── Load sentences on demand (called when card expands) ──
    const handleLoadSentences = useCallback(async (wordId: number) => {
        return getSentencesForWord(wordId);
    }, []);

    // ── Fetch more sentences for a word ──
    const handleMoreSentences = useCallback(
        async (word: GeneratedWord) => {
            if (!settings.apiKey && settings.provider !== 'pollinations') {
                setError('Please add your API key in Settings first.');
                return;
            }

            setIsFetchingMore(word.id);
            setError(null);

            try {
                const config = {
                    provider: settings.provider,
                    model: settings.model,
                    apiKey: settings.apiKey,
                };

                const sentences = await generateMoreSentences(config, word.word, word.meaning);
                if (sentences.length === 0) {
                    setError('No new sentences were generated. Please try again.');
                    return;
                }

                await saveWordWithSentences({
                    word: word.word,
                    article: word.article,
                    pos: word.pos,
                    meaning: word.meaning,
                    sentences,
                });

                showSuccess(`Added ${sentences.length} new sentences for "${word.word}"`);
            } catch (err: any) {
                setError(err?.message ?? 'Failed to fetch more sentences.');
            } finally {
                setIsFetchingMore(null);
            }
        },
        [settings, showSuccess],
    );

    // ── Delete word ──
    const handleDelete = useCallback(
        (wordId: number) => {
            Alert.alert(
                'Delete Word',
                'Are you sure? This will remove the word and all its sentences.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                            await deleteWord(wordId);
                            await loadWords();
                        },
                    },
                ],
            );
        },
        [loadWords],
    );

    // ── Memoized list renderer ──
    const renderWord = useCallback(
        ({ item }: { item: GeneratedWord }) => (
            <View style={isFetchingMore === item.id ? styles.dimmed : undefined}>
                <WordCard
                    word={item}
                    theme={theme}
                    onLoadSentences={handleLoadSentences}
                    onMoreSentences={handleMoreSentences}
                    onDelete={handleDelete}
                />
                {isFetchingMore === item.id && (
                    <View style={styles.fetchMoreOverlay}>
                        <ActivityIndicator color="#4F9EFF" />
                        <Text style={styles.fetchMoreText}>Fetching sentences…</Text>
                    </View>
                )}
            </View>
        ),
        [theme, handleLoadSentences, handleMoreSentences, handleDelete, isFetchingMore],
    );

    return (
        <View style={[styles.root, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.background }]}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Wörterbuch</Text>
                <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
                    {words.length} {words.length === 1 ? 'word' : 'words'} in your dictionary
                </Text>
            </View>

            {/* Error / success banners */}
            {error && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText}>⚠️ {error}</Text>
                    <Pressable onPress={() => setError(null)}>
                        <Text style={styles.errorBannerClose}>✕</Text>
                    </Pressable>
                </View>
            )}
            {successMsg && (
                <View style={styles.successBanner}>
                    <Text style={styles.successBannerText}>✅ {successMsg}</Text>
                </View>
            )}

            {/* Pending Words queue banner */}
            {pendingWords.length > 0 && (
                <View style={[styles.generatorBar, { backgroundColor: theme.backgroundElement, marginBottom: 12, marginHorizontal: 16 }]}>
                    <Text style={[styles.generatorTitle, { color: theme.text }]}>
                        📥 {pendingWords.length} {pendingWords.length === 1 ? 'word' : 'words'} queued
                    </Text>
                    <Text style={[styles.barLabel, { color: theme.textSecondary, marginBottom: 8 }]}>
                        You saved words while reading. Ready to fetch their forms?
                    </Text>
                    
                    {isProcessingPending ? (
                        <View style={styles.generatingRow}>
                            <ActivityIndicator size="small" color={theme.text} />
                            <Text style={[styles.generatingText, { color: theme.textSecondary, marginLeft: 8 }]}>
                                Processing words via AI…
                            </Text>
                            <Pressable onPress={handleCancel} style={styles.cancelBtn}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <Pressable
                            onPress={handleProcessPending}
                            style={({ pressed }) => [
                                styles.generateBtn,
                                { backgroundColor: pressed ? theme.backgroundSelected : theme.text },
                            ]}
                        >
                            <Text style={[styles.generateBtnText, { color: theme.background }]}>
                                ✨ Process Queued Words
                            </Text>
                        </Pressable>
                    )}
                </View>
            )}

            {/* Word list */}
            <FlatList
                data={words}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderWord}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <GeneratorBar
                        theme={theme}
                        isGenerating={isGenerating}
                        onGenerate={handleGenerate}
                        onCancel={handleCancel}
                    />
                }
                ListEmptyComponent={
                    !isGenerating ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyEmoji}>📖</Text>
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>
                                Your dictionary is empty
                            </Text>
                            <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
                                Hit Generate above to add your first words
                            </Text>
                        </View>
                    ) : null
                }
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },

    // Header
    header: {
        paddingTop: Platform.select({ ios: 60, android: 48, default: 24 }),
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    headerSub: {
        fontSize: 14,
        marginTop: 2,
    },

    // Banners
    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FF453A22',
        borderLeftWidth: 3,
        borderLeftColor: '#FF453A',
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 8,
        gap: 8,
    },
    errorBannerText: {
        color: '#FF453A',
        flex: 1,
        fontSize: 13,
    },
    errorBannerClose: {
        color: '#FF453A',
        fontWeight: '700',
        fontSize: 15,
    },
    successBanner: {
        backgroundColor: '#34D39922',
        borderLeftWidth: 3,
        borderLeftColor: '#34D399',
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 8,
    },
    successBannerText: {
        color: '#34D399',
        fontSize: 13,
    },

    // List
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 120,
        gap: 12,
    },

    // Generator bar
    generatorBar: {
        borderRadius: 16,
        padding: 16,
        gap: 8,
        marginBottom: 4,
    },
    generatorTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 4,
    },
    barLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.7,
        textTransform: 'uppercase',
    },
    chipRow: {
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 2,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    topicInput: {
        borderRadius: 10,
        paddingHorizontal: 13,
        paddingVertical: 9,
        fontSize: 14,
    },
    generateBtn: {
        marginTop: 6,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: 'center',
    },
    generateBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
    generatingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 8,
    },
    spinnerEmoji: {
        fontSize: 20,
    },
    generatingText: {
        fontSize: 14,
        flex: 1,
    },
    cancelBtn: {
        backgroundColor: '#FF453A',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    cancelBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },

    // Word card
    wordCard: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    wordCardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 14,
        gap: 8,
    },
    wordCardLeft: {
        flex: 1,
        gap: 4,
    },
    wordText: {
        fontSize: 20,
        fontWeight: '600',
        letterSpacing: -0.2,
    },
    wordMeta: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
    },
    posTag: {
        backgroundColor: '#4F9EFF22',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    posTagText: {
        color: '#4F9EFF',
        fontSize: 11,
        fontWeight: '600',
    },
    levelChip: {
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    levelChipText: {
        fontSize: 11,
        fontWeight: '600',
    },
    meaningText: {
        fontSize: 14,
        marginTop: 2,
    },
    chevron: {
        fontSize: 12,
        paddingTop: 4,
    },

    // Sentences section
    sentencesSection: {
        paddingHorizontal: 14,
        paddingBottom: 14,
        gap: 8,
    },
    sentenceRow: {
        borderRadius: 10,
        padding: 10,
        gap: 4,
    },
    sentenceTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        flexWrap: 'wrap',
    },
    sentenceText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
    sentenceTranslation: {
        fontSize: 13,
        fontStyle: 'italic',
        marginLeft: 4,
        marginTop: 2,
    },
    sentenceTap: {
        fontSize: 11,
        marginTop: 2,
        marginLeft: 4,
    },
    noSentences: {
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 8,
    },
    cardActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
    },
    actionBtn: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 9,
        alignItems: 'center',
    },
    actionBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },

    // Fetch more overlay
    dimmed: {
        opacity: 0.6,
    },
    fetchMoreOverlay: {
        position: 'absolute',
        inset: 0,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    } as any,
    fetchMoreText: {
        color: '#4F9EFF',
        fontWeight: '600',
        fontSize: 13,
    },

    // Tense badge
    tenseBadge: {
        borderWidth: 1,
        borderRadius: 5,
        paddingHorizontal: 6,
        paddingVertical: 2,
        alignSelf: 'flex-start',
    },
    tenseBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.4,
    },

    // Empty state
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
        gap: 8,
    },
    emptyEmoji: {
        fontSize: 48,
        marginBottom: 4,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    emptyHint: {
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
});
