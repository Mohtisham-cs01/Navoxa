/**
 * generate-form.tsx
 *
 * Form for configuring and triggering German paragraph generation.
 * All selections are persisted so the user doesn't have to re-enter them.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { ParagraphLength } from '@/services/ai-service';
import { loadLastForm, saveLastForm } from '@/services/storage-service';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const LENGTHS: { key: ParagraphLength; label: string }[] = [
    { key: 'short', label: 'Short' },
    { key: 'medium', label: 'Medium' },
    { key: 'long', label: 'Long' },
];

// Expanded list with more diverse, everyday topics
const SUGGESTED_TOPICS = [
    'Essen & Trinken',
    'Familie',
    'Reisen',
    'Arbeit',
    'Natur',
    'Technologie',
    'Sport',
    'Geschichte',
    'Hobbys',
    'Gesundheit',
    'Umwelt',
    'Kultur',
    'Medien',
    'Wissenschaft',
    'Zukunft',
    'Mode',
    'Musik',
    'Freundschaft',
    'Einkaufen',
    'Tiere',
];

interface GenerateFormProps {
    isLoading: boolean;
    onGenerate: (cefrLevel: string, topic: string, length: ParagraphLength) => void;
}

export function GenerateForm({ isLoading, onGenerate }: GenerateFormProps) {
    const theme = useTheme();

    const [cefrLevel, setCefrLevel] = useState<string>('A2');
    const [topic, setTopic] = useState('');
    const [length, setLength] = useState<ParagraphLength>('short');

    // Restore last used values from storage.
    useEffect(() => {
        loadLastForm().then((saved) => {
            setCefrLevel(saved.cefrLevel);
            setTopic(saved.topic);
            setLength(saved.length);
        });
    }, []);

    const handleGenerate = useCallback(async () => {
        const effectiveTopic = topic.trim() || 'Alltag';
        await saveLastForm({ cefrLevel, topic: effectiveTopic, length });
        onGenerate(cefrLevel, effectiveTopic, length);
    }, [cefrLevel, topic, length, onGenerate]);

    const handleTopicChip = useCallback((t: string) => {
        setTopic(t);
    }, []);

    // ── Cool loading animation ──
    const spinAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isLoading) {
            // Continuous rotation
            Animated.loop(
                Animated.timing(spinAnim, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();

            // Subtle pulse on the icon
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.15,
                        duration: 600,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 600,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            spinAnim.setValue(0);
            pulseAnim.setValue(1);
        }
    }, [isLoading, spinAnim, pulseAnim]);

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const inputStyle = {
        backgroundColor: theme.backgroundElement,
        color: theme.text,
        borderColor: 'transparent',
    };

    return (
        <View style={styles.root}>
            {/* ── CEFR level ── */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>CEFR Level</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
            >
                {CEFR_LEVELS.map((level) => {
                    const active = level === cefrLevel;
                    return (
                        <Pressable
                            key={level}
                            onPress={() => setCefrLevel(level)}
                            style={[
                                styles.chip,
                                {
                                    backgroundColor: active
                                        ? theme.text
                                        : theme.backgroundElement,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.chipText,
                                    { color: active ? theme.background : theme.text },
                                ]}
                            >
                                {level}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* ── Topic ── */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Topic</Text>
            <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="Type your own topic…"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, inputStyle]}
                returnKeyType="done"
                accessibilityLabel="Topic input"
            />
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
            >
                {SUGGESTED_TOPICS.map((t) => (
                    <Pressable
                        key={t}
                        onPress={() => handleTopicChip(t)}
                        style={[
                            styles.chip,
                            {
                                backgroundColor:
                                    topic === t ? theme.text : theme.backgroundElement,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.chipText,
                                { color: topic === t ? theme.background : theme.text },
                            ]}
                        >
                            {t}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>

            {/* ── Length ── */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Length</Text>
            <View style={styles.lengthRow}>
                {LENGTHS.map(({ key, label }) => {
                    const active = key === length;
                    return (
                        <Pressable
                            key={key}
                            onPress={() => setLength(key)}
                            style={[
                                styles.lengthBtn,
                                {
                                    backgroundColor: active
                                        ? theme.text
                                        : theme.backgroundElement,
                                    flex: 1,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.chipText,
                                    { color: active ? theme.background : theme.text },
                                ]}
                            >
                                {label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* ── Generate button with animated loader ── */}
            <Pressable
                onPress={handleGenerate}
                disabled={isLoading}
                style={({ pressed }) => [
                    styles.generateBtn,
                    {
                        backgroundColor: isLoading
                            ? theme.backgroundElement
                            : pressed
                                ? theme.backgroundSelected
                                : theme.text,
                        opacity: isLoading ? 0.85 : 1,
                    },
                ]}
                accessibilityLabel="Generate paragraph"
            >
                {isLoading ? (
                    <View style={styles.loaderContainer}>
                        <Animated.View
                            style={{
                                transform: [
                                    { rotate: spin },
                                    { scale: pulseAnim },
                                ],
                            }}
                        >
                            <Text style={styles.loaderIcon}>⏳</Text>
                        </Animated.View>
                        <Text style={[styles.loaderText, { color: theme.background }]}>
                            Generating...
                        </Text>
                    </View>
                ) : (
                    <Text style={[styles.generateBtnText, { color: theme.background }]}>
                        ✨ Generate
                    </Text>
                )}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        gap: 10,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: -4,
    },
    chipRow: {
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 2,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '500',
    },
    input: {
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        borderWidth: 1,
    },
    lengthRow: {
        flexDirection: 'row',
        gap: 8,
    },
    lengthBtn: {
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
    },
    generateBtn: {
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,          // ensures consistent height during load
        marginTop: 4,
    },
    generateBtnText: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    loaderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    loaderIcon: {
        fontSize: 24,
    },
    loaderText: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
});

// /**
//  * generate-form.tsx
//  *
//  * Form for configuring and triggering German paragraph generation.
//  * All selections are persisted so the user doesn't have to re-enter them.
//  */

// import React, { useCallback, useEffect, useState } from 'react';
// import {
//     ActivityIndicator,
//     Pressable,
//     ScrollView,
//     StyleSheet,
//     Text,
//     TextInput,
//     View,
// } from 'react-native';

// import type { ParagraphLength } from '@/services/ai-service';
// import { loadLastForm, saveLastForm } from '@/services/storage-service';
// import { useTheme } from '@/hooks/use-theme';

// const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
// const LENGTHS: { key: ParagraphLength; label: string }[] = [
//     { key: 'short', label: 'Short' },
//     { key: 'medium', label: 'Medium' },
//     { key: 'long', label: 'Long' },
// ];
// const SUGGESTED_TOPICS = [
//     'Essen & Trinken',
//     'Familie',
//     'Reisen',
//     'Arbeit',
//     'Natur',
//     'Technologie',
//     'Sport',
//     'Geschichte',
// ];

// interface GenerateFormProps {
//     isLoading: boolean;
//     onGenerate: (cefrLevel: string, topic: string, length: ParagraphLength) => void;
// }

// export function GenerateForm({ isLoading, onGenerate }: GenerateFormProps) {
//     const theme = useTheme();

//     const [cefrLevel, setCefrLevel] = useState<string>('A2');
//     const [topic, setTopic] = useState('');
//     const [length, setLength] = useState<ParagraphLength>('short');

//     // Restore last used values from storage.
//     useEffect(() => {
//         loadLastForm().then((saved) => {
//             setCefrLevel(saved.cefrLevel);
//             setTopic(saved.topic);
//             setLength(saved.length);
//         });
//     }, []);

//     const handleGenerate = useCallback(async () => {
//         const effectiveTopic = topic.trim() || 'Alltag';
//         await saveLastForm({ cefrLevel, topic: effectiveTopic, length });
//         onGenerate(cefrLevel, effectiveTopic, length);
//     }, [cefrLevel, topic, length, onGenerate]);

//     const handleTopicChip = useCallback((t: string) => {
//         setTopic(t);
//     }, []);

//     const inputStyle = {
//         backgroundColor: theme.backgroundElement,
//         color: theme.text,
//         borderColor: 'transparent',
//     };

//     return (
//         <View style={styles.root}>
//             {/* ── CEFR level ── */}
//             <Text style={[styles.label, { color: theme.textSecondary }]}>CEFR Level</Text>
//             <ScrollView
//                 horizontal
//                 showsHorizontalScrollIndicator={false}
//                 contentContainerStyle={styles.chipRow}
//             >
//                 {CEFR_LEVELS.map((level) => {
//                     const active = level === cefrLevel;
//                     return (
//                         <Pressable
//                             key={level}
//                             onPress={() => setCefrLevel(level)}
//                             style={[
//                                 styles.chip,
//                                 {
//                                     backgroundColor: active
//                                         ? theme.text
//                                         : theme.backgroundElement,
//                                 },
//                             ]}
//                         >
//                             <Text
//                                 style={[
//                                     styles.chipText,
//                                     { color: active ? theme.background : theme.text },
//                                 ]}
//                             >
//                                 {level}
//                             </Text>
//                         </Pressable>
//                     );
//                 })}
//             </ScrollView>

//             {/* ── Topic ── */}
//             <Text style={[styles.label, { color: theme.textSecondary }]}>Topic</Text>
//             <TextInput
//                 value={topic}
//                 onChangeText={setTopic}
//                 placeholder="Type a topic or pick one below…"
//                 placeholderTextColor={theme.textSecondary}
//                 style={[styles.input, inputStyle]}
//                 returnKeyType="done"
//                 accessibilityLabel="Topic input"
//             />
//             <ScrollView
//                 horizontal
//                 showsHorizontalScrollIndicator={false}
//                 contentContainerStyle={styles.chipRow}
//             >
//                 {SUGGESTED_TOPICS.map((t) => (
//                     <Pressable
//                         key={t}
//                         onPress={() => handleTopicChip(t)}
//                         style={[
//                             styles.chip,
//                             {
//                                 backgroundColor:
//                                     topic === t ? theme.text : theme.backgroundElement,
//                             },
//                         ]}
//                     >
//                         <Text
//                             style={[
//                                 styles.chipText,
//                                 { color: topic === t ? theme.background : theme.text },
//                             ]}
//                         >
//                             {t}
//                         </Text>
//                     </Pressable>
//                 ))}
//             </ScrollView>

//             {/* ── Length ── */}
//             <Text style={[styles.label, { color: theme.textSecondary }]}>Length</Text>
//             <View style={styles.lengthRow}>
//                 {LENGTHS.map(({ key, label }) => {
//                     const active = key === length;
//                     return (
//                         <Pressable
//                             key={key}
//                             onPress={() => setLength(key)}
//                             style={[
//                                 styles.lengthBtn,
//                                 {
//                                     backgroundColor: active
//                                         ? theme.text
//                                         : theme.backgroundElement,
//                                     flex: 1,
//                                 },
//                             ]}
//                         >
//                             <Text
//                                 style={[
//                                     styles.chipText,
//                                     { color: active ? theme.background : theme.text },
//                                 ]}
//                             >
//                                 {label}
//                             </Text>
//                         </Pressable>
//                     );
//                 })}
//             </View>

//             {/* ── Generate button ── */}
//             <Pressable
//                 onPress={handleGenerate}
//                 disabled={isLoading}
//                 style={({ pressed }) => [
//                     styles.generateBtn,
//                     {
//                         backgroundColor: isLoading
//                             ? theme.backgroundElement
//                             : pressed
//                                 ? theme.backgroundSelected
//                                 : theme.text,
//                         opacity: isLoading ? 0.7 : 1,
//                     },
//                 ]}
//                 accessibilityLabel="Generate paragraph"
//             >
//                 {isLoading ? (
//                     <ActivityIndicator color={theme.background} />
//                 ) : (
//                     <Text style={[styles.generateBtnText, { color: theme.background }]}>
//                         ✨ Generate
//                     </Text>
//                 )}
//             </Pressable>
//         </View>
//     );
// }

// const styles = StyleSheet.create({
//     root: {
//         gap: 10,
//     },
//     label: {
//         fontSize: 12,
//         fontWeight: '600',
//         letterSpacing: 0.8,
//         textTransform: 'uppercase',
//         marginBottom: -4,
//     },
//     chipRow: {
//         flexDirection: 'row',
//         gap: 8,
//         paddingVertical: 2,
//     },
//     chip: {
//         paddingHorizontal: 14,
//         paddingVertical: 8,
//         borderRadius: 20,
//     },
//     chipText: {
//         fontSize: 13,
//         fontWeight: '500',
//     },
//     input: {
//         borderRadius: 12,
//         paddingHorizontal: 14,
//         paddingVertical: 10,
//         fontSize: 15,
//         borderWidth: 1,
//     },
//     lengthRow: {
//         flexDirection: 'row',
//         gap: 8,
//     },
//     lengthBtn: {
//         paddingVertical: 10,
//         borderRadius: 12,
//         alignItems: 'center',
//     },
//     generateBtn: {
//         borderRadius: 14,
//         paddingVertical: 14,
//         alignItems: 'center',
//         marginTop: 4,
//     },
//     generateBtnText: {
//         fontSize: 16,
//         fontWeight: '700',
//         letterSpacing: 0.3,
//     },
// });
