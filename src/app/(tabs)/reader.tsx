/**
 * reader.tsx – Main German reading practice tab.
 *
 * Layout:
 *   - GenerateForm at top (collapsible after generation)
 *   - Generated paragraph below (ParagraphViewer)
 *   - Error state with retry
 *   - Empty/prompt state
 *   - Free, on-device text-to-speech (via expo-speech) to read the
 *     paragraph aloud. No API key, no network call — uses the native
 *     OS TTS engine (AVSpeechSynthesizer / Android TextToSpeech / Web
 *     Speech API), so it's free and reliable across platforms.
 */

import * as Speech from 'expo-speech';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GenerateForm } from '@/components/generate-form';
import { ParagraphViewer } from '@/components/paragraph-viewer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSettings } from '@/context/settings-context';
import { useTheme } from '@/hooks/use-theme';
import {
    generateGermanParagraph,
    type GeneratedParagraph,
    type ParagraphLength,
} from '@/services/ai-service';
import { saveParagraph } from '@/services/storage-service';

// ── TTS helpers (inline, no separate service file) ───────────────────
const GERMAN_LOCALE = 'de-DE';
const DEFAULT_SPEECH_RATE = 0.85; // slightly slower, better for learners

/**
 * Pulls a flat, readable German string out of a GeneratedParagraph.
 * Tries `.text`, then `.sentences[]`, then `.words[]` as fallbacks —
 * adjust the fallback order here if your GeneratedParagraph shape
 * differs from these guesses.
 */
function extractGermanText(paragraph: GeneratedParagraph): string {
    const p = paragraph as any;
    if (typeof p.text === 'string' && p.text.trim()) return p.text;
    if (Array.isArray(p.sentences)) {
        return p.sentences
            .map((s: any) => (typeof s === 'string' ? s : s?.text ?? ''))
            .filter(Boolean)
            .join(' ');
    }
    if (Array.isArray(p.words)) {
        return p.words
            .map((w: any) => (typeof w === 'string' ? w : w?.word ?? w?.text ?? ''))
            .filter(Boolean)
            .join(' ');
    }
    return '';
}

function speakGerman(
    text: string,
    onStart: () => void,
    onEnd: () => void,
    rate: number = DEFAULT_SPEECH_RATE,
): void {
    if (!text.trim()) return;
    Speech.stop();
    Speech.speak(text, {
        language: GERMAN_LOCALE,
        pitch: 1.0,
        rate,
        onStart,
        onDone: onEnd,
        onStopped: onEnd,
        onError: onEnd,
    });
}
// ───────────────────────────────────────────────────────────────────

export default function ReaderScreen() {
    const theme = useTheme();
    const { settings } = useSettings();
    const safeAreaInsets = useSafeAreaInsets();

    const insets = {
        ...safeAreaInsets,
        bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
    };

    const contentPlatformStyle = Platform.select({
        android: {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
        },
        web: {
            paddingTop: Spacing.six,
            paddingBottom: Spacing.four,
        },
    });

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [paragraph, setParagraph] = useState<GeneratedParagraph | null>(null);
    const [formVisible, setFormVisible] = useState(true);
    const [lastMeta, setLastMeta] = useState<{
        cefr: string;
        topic: string;
    } | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Stop any in-flight speech if the screen unmounts.
    useEffect(() => {
        return () => {
            Speech.stop();
        };
    }, []);

    const handleGenerate = useCallback(
        async (cefrLevel: string, topic: string, length: ParagraphLength) => {
            if (!settings.apiKey) {
                setError('No API key set. Please add one in the ⚙ Settings tab.');
                return;
            }

            Speech.stop();
            setIsSpeaking(false);
            setIsLoading(true);
            setError(null);
            setSaveSuccess(false);

            try {
                const result = await generateGermanParagraph(
                    {
                        provider: settings.provider,
                        model: settings.model,
                        apiKey: settings.apiKey,
                    },
                    cefrLevel,
                    topic,
                    length,
                );
                setParagraph(result);
                setLastMeta({ cefr: cefrLevel, topic });
                setFormVisible(false); // collapse form to give more space to reading
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                setError(message);
            } finally {
                setIsLoading(false);
            }
        },
        [settings],
    );

    const handleSave = useCallback(async () => {
        if (!paragraph || !lastMeta) return;
        await saveParagraph({
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            cefrLevel: lastMeta.cefr,
            topic: lastMeta.topic,
            data: paragraph,
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    }, [paragraph, lastMeta]);

    const handleListen = useCallback(() => {
        if (!paragraph) return;

        if (isSpeaking) {
            Speech.stop();
            setIsSpeaking(false);
            return;
        }

        const text = extractGermanText(paragraph);
        if (!text) {
            setError('Nothing to read aloud.');
            return;
        }

        speakGerman(
            text,
            () => setIsSpeaking(true),
            () => setIsSpeaking(false),
        );
    }, [paragraph, isSpeaking]);

    return (
        <ScrollView
            style={[styles.scrollView, { backgroundColor: theme.background }]}
            contentInset={insets}
            contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
            keyboardShouldPersistTaps="handled"
        >
            <ThemedView style={styles.container}>
                {/* ── Header ── */}
                <ThemedView style={styles.header}>
                    <ThemedText type="subtitle">🇩🇪 Lesen</ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.headerSub}>
                        German Reading Practice
                    </ThemedText>
                </ThemedView>

                {/* ── Form (collapsible) ── */}
                <ThemedView
                    type="backgroundElement"
                    style={styles.formCard}
                >
                    <Pressable
                        onPress={() => setFormVisible((v) => !v)}
                        style={styles.formToggle}
                        accessibilityLabel={formVisible ? 'Collapse form' : 'Expand form'}
                    >
                        <ThemedText style={styles.formToggleLabel}>
                            {formVisible ? '▲ Generation Options.' : '▼ Generation Options'}
                        </ThemedText>
                    </Pressable>
                    {formVisible && (
                        <View style={styles.formBody}>
                            <GenerateForm isLoading={isLoading} onGenerate={handleGenerate} />
                        </View>
                    )}
                </ThemedView>

                {/* ── Error state ── */}
                {error && (
                    <ThemedView
                        style={[styles.errorCard, { backgroundColor: '#FF453A22' }]}
                    >
                        <Text style={[styles.errorText, { color: '#FF453A' }]}>
                            ⚠ {error}
                        </Text>
                    </ThemedView>
                )}

                {/* ── Empty / prompt state ── */}
                {!paragraph && !error && !isLoading && (
                    <ThemedView style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>📖</Text>
                        <ThemedText style={styles.emptyText} themeColor="textSecondary">
                            Configure your options above and tap{' '}
                            <ThemedText style={styles.emptyTextBold}>✨ Generate</ThemedText>{' '}
                            to create a reading passage.{'\n\n'}Tap any word to see its
                            meaning and hear it spoken.
                        </ThemedText>
                    </ThemedView>
                )}

                {/* ── Paragraph ── */}
                {paragraph && (
                    <ThemedView type="backgroundElement" style={styles.paragraphCard}>
                        {/* Meta row */}
                        <View style={styles.metaRow}>
                            {lastMeta && (
                                <>
                                    <View
                                        style={[
                                            styles.badge,
                                            { backgroundColor: theme.backgroundSelected },
                                        ]}
                                    >
                                        <Text style={[styles.badgeText, { color: theme.text }]}>
                                            {lastMeta.cefr}
                                        </Text>
                                    </View>
                                    <Text
                                        style={[styles.metaTopic, { color: theme.textSecondary }]}
                                        numberOfLines={1}
                                    >
                                        {lastMeta.topic}
                                    </Text>
                                </>
                            )}
                            <Pressable
                                onPress={handleListen}
                                style={({ pressed }) => [
                                    styles.saveBtn,
                                    {
                                        backgroundColor: isSpeaking
                                            ? theme.backgroundSelected
                                            : pressed
                                                ? theme.backgroundSelected
                                                : 'transparent',
                                    },
                                ]}
                                accessibilityLabel={
                                    isSpeaking ? 'Stop reading aloud' : 'Read paragraph aloud'
                                }
                            >
                                <Text
                                    style={[
                                        styles.saveBtnText,
                                        { color: isSpeaking ? theme.text : theme.textSecondary },
                                    ]}
                                >
                                    {isSpeaking ? '⏹ Stop' : '🔊 Listen'}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleSave}
                                style={({ pressed }) => [
                                    styles.saveBtn,
                                    {
                                        backgroundColor: saveSuccess
                                            ? '#34C75922'
                                            : pressed
                                                ? theme.backgroundSelected
                                                : 'transparent',
                                    },
                                ]}
                                accessibilityLabel="Save paragraph"
                            >
                                <Text
                                    style={[
                                        styles.saveBtnText,
                                        { color: saveSuccess ? '#34C759' : theme.textSecondary },
                                    ]}
                                >
                                    {saveSuccess ? '✓ Saved' : '🔖 Save'}
                                </Text>
                            </Pressable>
                        </View>

                        <ParagraphViewer data={paragraph} />
                    </ThemedView>
                )}
            </ThemedView>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollView: { flex: 1 },
    contentContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingHorizontal: Spacing.three,
    },
    container: {
        maxWidth: 800,
        flexGrow: 1,
        gap: Spacing.three,
        paddingTop: Spacing.four,
        paddingBottom: Spacing.five,
    },
    header: {
        gap: 4,
        paddingBottom: Spacing.one,
    },
    headerSub: {
        fontSize: 14,
    },
    formCard: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    formToggle: {
        paddingHorizontal: Spacing.three,
        paddingVertical: 12,
    },
    formToggleLabel: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    formBody: {
        paddingHorizontal: Spacing.three,
        paddingBottom: Spacing.three,
    },
    errorCard: {
        borderRadius: 12,
        padding: 14,
    },
    errorText: {
        fontSize: 14,
        lineHeight: 20,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: Spacing.six,
        gap: Spacing.three,
    },
    emptyEmoji: {
        fontSize: 48,
    },
    emptyText: {
        textAlign: 'center',
        fontSize: 15,
        lineHeight: 23,
        maxWidth: 300,
    },
    emptyTextBold: {
        fontWeight: '700',
    },
    paragraphCard: {
        borderRadius: 16,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    metaTopic: {
        fontSize: 13,
        flex: 1,
    },
    saveBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    saveBtnText: {
        fontSize: 13,
        fontWeight: '500',
    },
});

// /**
//  * reader.tsx – Main German reading practice tab.
//  *
//  * Layout:
//  *   - GenerateForm at top (collapsible after generation)
//  *   - Generated paragraph below (ParagraphViewer)
//  *   - Error state with retry
//  *   - Empty/prompt state
//  */

// import React, { useCallback, useState } from 'react';
// import {
//     Animated,
//     Platform,
//     Pressable,
//     ScrollView,
//     StyleSheet,
//     Text,
//     View,
// } from 'react-native';
// import { useSafeAreaInsets } from 'react-native-safe-area-context';

// import { GenerateForm } from '@/components/generate-form';
// import { ParagraphViewer } from '@/components/paragraph-viewer';
// import { ThemedText } from '@/components/themed-text';
// import { ThemedView } from '@/components/themed-view';
// import { BottomTabInset, Spacing } from '@/constants/theme';
// import { useTheme } from '@/hooks/use-theme';
// import { useSettings } from '@/context/settings-context';
// import {
//     generateGermanParagraph,
//     type GeneratedParagraph,
//     type ParagraphLength,
// } from '@/services/ai-service';
// import { saveParagraph } from '@/services/storage-service';

// export default function ReaderScreen() {
//     const theme = useTheme();
//     const { settings } = useSettings();
//     const safeAreaInsets = useSafeAreaInsets();

//     const insets = {
//         ...safeAreaInsets,
//         bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
//     };

//     const contentPlatformStyle = Platform.select({
//         android: {
//             paddingTop: insets.top,
//             paddingBottom: insets.bottom,
//         },
//         web: {
//             paddingTop: Spacing.six,
//             paddingBottom: Spacing.four,
//         },
//     });

//     const [isLoading, setIsLoading] = useState(false);
//     const [error, setError] = useState<string | null>(null);
//     const [paragraph, setParagraph] = useState<GeneratedParagraph | null>(null);
//     const [formVisible, setFormVisible] = useState(true);
//     const [lastMeta, setLastMeta] = useState<{
//         cefr: string;
//         topic: string;
//     } | null>(null);
//     const [saveSuccess, setSaveSuccess] = useState(false);

//     const handleGenerate = useCallback(
//         async (cefrLevel: string, topic: string, length: ParagraphLength) => {
//             if (!settings.apiKey) {
//                 setError('No API key set. Please add one in the ⚙ Settings tab.');
//                 return;
//             }

//             setIsLoading(true);
//             setError(null);
//             setSaveSuccess(false);

//             try {
//                 const result = await generateGermanParagraph(
//                     {
//                         provider: settings.provider,
//                         model: settings.model,
//                         apiKey: settings.apiKey,
//                     },
//                     cefrLevel,
//                     topic,
//                     length,
//                 );
//                 setParagraph(result);
//                 setLastMeta({ cefr: cefrLevel, topic });
//                 setFormVisible(false); // collapse form to give more space to reading
//             } catch (err: unknown) {
//                 const message = err instanceof Error ? err.message : String(err);
//                 setError(message);
//             } finally {
//                 setIsLoading(false);
//             }
//         },
//         [settings],
//     );

//     const handleSave = useCallback(async () => {
//         if (!paragraph || !lastMeta) return;
//         await saveParagraph({
//             id: Date.now().toString(),
//             createdAt: new Date().toISOString(),
//             cefrLevel: lastMeta.cefr,
//             topic: lastMeta.topic,
//             data: paragraph,
//         });
//         setSaveSuccess(true);
//         setTimeout(() => setSaveSuccess(false), 3000);
//     }, [paragraph, lastMeta]);

//     return (
//         <ScrollView
//             style={[styles.scrollView, { backgroundColor: theme.background }]}
//             contentInset={insets}
//             contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
//             keyboardShouldPersistTaps="handled"
//         >
//             <ThemedView style={styles.container}>
//                 {/* ── Header ── */}
//                 <ThemedView style={styles.header}>
//                     <ThemedText type="subtitle">🇩🇪 Lesen</ThemedText>
//                     <ThemedText themeColor="textSecondary" style={styles.headerSub}>
//                         German Reading Practice
//                     </ThemedText>
//                 </ThemedView>

//                 {/* ── Form (collapsible) ── */}
//                 <ThemedView
//                     type="backgroundElement"
//                     style={styles.formCard}
//                 >
//                     <Pressable
//                         onPress={() => setFormVisible((v) => !v)}
//                         style={styles.formToggle}
//                         accessibilityLabel={formVisible ? 'Collapse form' : 'Expand form'}
//                     >
//                         <ThemedText style={styles.formToggleLabel}>
//                             {formVisible ? '▲ Generation Options' : '▼ Generation Options'}
//                         </ThemedText>
//                     </Pressable>
//                     {formVisible && (
//                         <View style={styles.formBody}>
//                             <GenerateForm isLoading={isLoading} onGenerate={handleGenerate} />
//                         </View>
//                     )}
//                 </ThemedView>

//                 {/* ── Error state ── */}
//                 {error && (
//                     <ThemedView
//                         style={[styles.errorCard, { backgroundColor: '#FF453A22' }]}
//                     >
//                         <Text style={[styles.errorText, { color: '#FF453A' }]}>
//                             ⚠ {error}
//                         </Text>
//                     </ThemedView>
//                 )}

//                 {/* ── Empty / prompt state ── */}
//                 {!paragraph && !error && !isLoading && (
//                     <ThemedView style={styles.emptyState}>
//                         <Text style={styles.emptyEmoji}>📖</Text>
//                         <ThemedText style={styles.emptyText} themeColor="textSecondary">
//                             Configure your options above and tap{' '}
//                             <ThemedText style={styles.emptyTextBold}>✨ Generate</ThemedText>{' '}
//                             to create a reading passage.{'\n\n'}Tap any word to see its
//                             meaning and hear it spoken.
//                         </ThemedText>
//                     </ThemedView>
//                 )}

//                 {/* ── Paragraph ── */}
//                 {paragraph && (
//                     <ThemedView type="backgroundElement" style={styles.paragraphCard}>
//                         {/* Meta row */}
//                         <View style={styles.metaRow}>
//                             {lastMeta && (
//                                 <>
//                                     <View
//                                         style={[
//                                             styles.badge,
//                                             { backgroundColor: theme.backgroundSelected },
//                                         ]}
//                                     >
//                                         <Text style={[styles.badgeText, { color: theme.text }]}>
//                                             {lastMeta.cefr}
//                                         </Text>
//                                     </View>
//                                     <Text
//                                         style={[styles.metaTopic, { color: theme.textSecondary }]}
//                                         numberOfLines={1}
//                                     >
//                                         {lastMeta.topic}
//                                     </Text>
//                                 </>
//                             )}
//                             <Pressable
//                                 onPress={handleSave}
//                                 style={({ pressed }) => [
//                                     styles.saveBtn,
//                                     {
//                                         backgroundColor: saveSuccess
//                                             ? '#34C75922'
//                                             : pressed
//                                                 ? theme.backgroundSelected
//                                                 : 'transparent',
//                                     },
//                                 ]}
//                                 accessibilityLabel="Save paragraph"
//                             >
//                                 <Text
//                                     style={[
//                                         styles.saveBtnText,
//                                         { color: saveSuccess ? '#34C759' : theme.textSecondary },
//                                     ]}
//                                 >
//                                     {saveSuccess ? '✓ Saved' : '🔖 Save'}
//                                 </Text>
//                             </Pressable>
//                         </View>

//                         <ParagraphViewer data={paragraph} />
//                     </ThemedView>
//                 )}
//             </ThemedView>
//         </ScrollView>
//     );
// }

// const styles = StyleSheet.create({
//     scrollView: { flex: 1 },
//     contentContainer: {
//         flexDirection: 'row',
//         justifyContent: 'center',
//         paddingHorizontal: Spacing.three,
//     },
//     container: {
//         maxWidth: 800,
//         flexGrow: 1,
//         gap: Spacing.three,
//         paddingTop: Spacing.four,
//         paddingBottom: Spacing.five,
//     },
//     header: {
//         gap: 4,
//         paddingBottom: Spacing.one,
//     },
//     headerSub: {
//         fontSize: 14,
//     },
//     formCard: {
//         borderRadius: 16,
//         overflow: 'hidden',
//     },
//     formToggle: {
//         paddingHorizontal: Spacing.three,
//         paddingVertical: 12,
//     },
//     formToggleLabel: {
//         fontSize: 13,
//         fontWeight: '600',
//         letterSpacing: 0.3,
//     },
//     formBody: {
//         paddingHorizontal: Spacing.three,
//         paddingBottom: Spacing.three,
//     },
//     errorCard: {
//         borderRadius: 12,
//         padding: 14,
//     },
//     errorText: {
//         fontSize: 14,
//         lineHeight: 20,
//     },
//     emptyState: {
//         alignItems: 'center',
//         paddingVertical: Spacing.six,
//         gap: Spacing.three,
//     },
//     emptyEmoji: {
//         fontSize: 48,
//     },
//     emptyText: {
//         textAlign: 'center',
//         fontSize: 15,
//         lineHeight: 23,
//         maxWidth: 300,
//     },
//     emptyTextBold: {
//         fontWeight: '700',
//     },
//     paragraphCard: {
//         borderRadius: 16,
//         padding: Spacing.three,
//         gap: Spacing.two,
//     },
//     metaRow: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 8,
//         marginBottom: 4,
//     },
//     badge: {
//         paddingHorizontal: 10,
//         paddingVertical: 4,
//         borderRadius: 8,
//     },
//     badgeText: {
//         fontSize: 12,
//         fontWeight: '700',
//     },
//     metaTopic: {
//         fontSize: 13,
//         flex: 1,
//     },
//     saveBtn: {
//         paddingHorizontal: 10,
//         paddingVertical: 6,
//         borderRadius: 8,
//     },
//     saveBtnText: {
//         fontSize: 13,
//         fontWeight: '500',
//     },
// });
