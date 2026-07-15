/**
 * settings.tsx – API Key & Provider configuration tab.
 *
 * Lets the user choose their AI provider, enter API keys,
 * select a model, and clear stored data.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSettings } from '@/context/settings-context';
import { useTheme } from '@/hooks/use-theme';
import {
    fetchModels,
    type ModelInfo,
    type Provider,
} from '@/services/ai-service';
import { clearAllData, type WordFrequency } from '@/services/storage-service';

const PROVIDERS: { key: Provider; label: string; placeholder: string }[] = [
    {
        key: 'pollinations',
        label: 'Pollinations AI',
        placeholder: 'pk_... or sk_... (from enter.pollinations.ai)',
    },
    {
        key: 'openrouter',
        label: 'OpenRouter',
        placeholder: 'sk-or-... (from openrouter.ai)',
    },
    {
        key: 'gemini',
        label: 'Gemini',
        placeholder: 'AIza... (from aistudio.google.com)',
    },
];

const FREQUENCIES: { key: WordFrequency; label: string }[] = [
    { key: 'every_open', label: 'Every Open' },
    { key: 'hourly', label: 'Hourly' },
    { key: 'daily', label: 'Daily' },
];

export default function SettingsScreen() {
    const theme = useTheme();
    const { settings, updateSettings } = useSettings();
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

    const [localApiKey, setLocalApiKey] = useState(settings.apiKey);
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [saved, setSaved] = useState(false);
    const [modelsExpanded, setModelsExpanded] = useState(false); // collapsed by default

    // Cache for fetched models: key = "provider:apiKey"
    const modelsCache = useRef<Map<string, ModelInfo[]>>(new Map());

    // When settings load from storage, sync the local text field.
    useEffect(() => {
        setLocalApiKey(settings.apiKey);
    }, [settings.apiKey]);

    // Fetch models whenever provider or apiKey changes, using cache.
    useEffect(() => {
        const cacheKey = `${settings.provider}:${settings.apiKey}`;
        const cached = modelsCache.current.get(cacheKey);

        if (cached) {
            // Use cached models, no loading indicator
            setModels(cached);
            setLoadingModels(false);
        } else {
            setLoadingModels(true);
            fetchModels(settings.provider, settings.apiKey)
                .then((list) => {
                    setModels(list);
                    modelsCache.current.set(cacheKey, list);
                })
                .catch(() => {
                    setModels([]);
                })
                .finally(() => setLoadingModels(false));
        }
    }, [settings.provider, settings.apiKey]);

    const handleProviderChange = useCallback(
        (provider: Provider) => {
            updateSettings({ provider, model: '' }); // reset model on provider change
        },
        [updateSettings],
    );

    const handleSave = useCallback(async () => {
        await updateSettings({ apiKey: localApiKey.trim() });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }, [localApiKey, updateSettings]);

    const handleClearData = useCallback(() => {
        Alert.alert(
            'Clear All Data',
            'This will delete your saved paragraphs and reset all settings. Are you sure?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        await clearAllData();
                        await updateSettings({
                            provider: 'openrouter',
                            model: 'meta-llama/llama-3.1-8b-instruct:free',
                            apiKey: '',
                        });
                        setLocalApiKey('');
                    },
                },
            ],
        );
    }, [updateSettings]);

    const inputStyle = {
        backgroundColor: theme.backgroundElement,
        color: theme.text,
    };

    const currentProvider = PROVIDERS.find((p) => p.key === settings.provider);
    // Get the selected model's display name (if any)
    const selectedModel = models.find((m) => m.id === settings.model);

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
                    <ThemedText type="subtitle">⚙ Settings</ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.headerSub}>
                        Configure your AI provider and model
                    </ThemedText>
                </ThemedView>

                {/* ── Provider picker ── */}
                <ThemedView type="backgroundElement" style={styles.card}>
                    <ThemedText style={styles.sectionTitle}>Provider</ThemedText>
                    <View style={styles.providerRow}>
                        {PROVIDERS.map(({ key, label }) => {
                            const active = key === settings.provider;
                            return (
                                <Pressable
                                    key={key}
                                    onPress={() => handleProviderChange(key)}
                                    style={[
                                        styles.providerBtn,
                                        {
                                            backgroundColor: active
                                                ? theme.text
                                                : theme.backgroundSelected,
                                            flex: 1,
                                        },
                                    ]}
                                    accessibilityLabel={label}
                                >
                                    <Text
                                        style={[
                                            styles.providerBtnText,
                                            { color: active ? theme.background : theme.textSecondary },
                                        ]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                    >
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </ThemedView>

                {/* ── API Key ── */}
                <ThemedView type="backgroundElement" style={styles.card}>
                    <ThemedText style={styles.sectionTitle}>
                        API Key — {currentProvider?.label}
                    </ThemedText>
                    <TextInput
                        value={localApiKey}
                        onChangeText={setLocalApiKey}
                        placeholder={currentProvider?.placeholder ?? 'Enter API key…'}
                        placeholderTextColor={theme.textSecondary}
                        style={[styles.input, inputStyle]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        returnKeyType="done"
                        accessibilityLabel="API Key input"
                    />
                    <Pressable
                        onPress={handleSave}
                        style={({ pressed }) => [
                            styles.saveBtn,
                            {
                                backgroundColor: saved
                                    ? '#34C75922'
                                    : pressed
                                        ? theme.backgroundSelected
                                        : theme.text,
                            },
                        ]}
                        accessibilityLabel="Save API key"
                    >
                        <Text
                            style={[
                                styles.saveBtnText,
                                { color: saved ? '#34C759' : theme.background },
                            ]}
                        >
                            {saved ? '✓ Saved' : 'Save Key'}
                        </Text>
                    </Pressable>
                </ThemedView>

                {/* ── Collapsible Model picker ── */}
                <ThemedView type="backgroundElement" style={styles.card}>
                    <Pressable
                        onPress={() => setModelsExpanded((prev) => !prev)}
                        style={styles.sectionHeader}
                        accessibilityLabel={modelsExpanded ? 'Collapse model list' : 'Expand model list'}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <ThemedText style={styles.sectionTitle}>Model</ThemedText>
                            {loadingModels && (
                                <ActivityIndicator size="small" color={theme.textSecondary} />
                            )}
                        </View>
                        <Text style={[styles.chevron, { color: theme.textSecondary }]}>
                            {modelsExpanded ? '▲' : '▼'}
                        </Text>
                    </Pressable>

                    {/* Selected model name always visible */}
                    <ThemedText themeColor="textSecondary" style={styles.modelHint}>
                        {selectedModel
                            ? `${selectedModel.name} (${selectedModel.id})`
                            : settings.model || 'No model selected'}
                    </ThemedText>

                    {modelsExpanded && (
                        <View style={styles.modelList}>
                            {models.map((m) => {
                                const active = m.id === settings.model;
                                return (
                                    <Pressable
                                        key={m.id}
                                        onPress={() => updateSettings({ model: m.id })}
                                        style={[
                                            styles.modelRow,
                                            {
                                                backgroundColor: active
                                                    ? theme.backgroundSelected
                                                    : 'transparent',
                                            },
                                        ]}
                                        accessibilityLabel={m.name}
                                    >
                                        <View style={styles.modelRadio}>
                                            {active && (
                                                <View
                                                    style={[
                                                        styles.modelRadioInner,
                                                        { backgroundColor: theme.text },
                                                    ]}
                                                />
                                            )}
                                        </View>
                                        <View style={styles.modelTextWrap}>
                                            <Text
                                                style={[styles.modelName, { color: theme.text }]}
                                                numberOfLines={1}
                                            >
                                                {m.name}
                                            </Text>
                                            {m.name !== m.id && (
                                                <Text
                                                    style={[styles.modelId, { color: theme.textSecondary }]}
                                                    numberOfLines={1}
                                                >
                                                    {m.id}
                                                </Text>
                                            )}
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                </ThemedView>

                {/* ── Word of the Day Frequency ── */}
                <ThemedView type="backgroundElement" style={styles.card}>
                    <ThemedText style={styles.sectionTitle}>Word of the Day Refresh</ThemedText>
                    <View style={styles.providerRow}>
                        {FREQUENCIES.map(({ key, label }) => {
                            const active = key === settings.wordFrequency;
                            return (
                                <Pressable
                                    key={key}
                                    onPress={() => updateSettings({ wordFrequency: key })}
                                    style={[
                                        styles.providerBtn,
                                        {
                                            backgroundColor: active
                                                ? theme.text
                                                : theme.backgroundSelected,
                                            flex: 1,
                                        },
                                    ]}
                                    accessibilityLabel={label}
                                >
                                    <Text
                                        style={[
                                            styles.providerBtnText,
                                            { color: active ? theme.background : theme.textSecondary },
                                        ]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                    >
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </ThemedView>

                {/* ── Danger zone ── */}
                <Pressable
                    onPress={handleClearData}
                    style={({ pressed }) => [
                        styles.dangerBtn,
                        { opacity: pressed ? 0.7 : 1 },
                    ]}
                    accessibilityLabel="Clear all data"
                >
                    <Text style={styles.dangerBtnText}>🗑 Clear All Data</Text>
                </Pressable>
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
    card: {
        borderRadius: 16,
        padding: Spacing.three,
        gap: 12,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    chevron: {
        fontSize: 14,
        marginLeft: 8,
    },
    modelHint: {
        fontSize: 12,
        marginTop: -6,
        marginBottom: 4,
    },
    modelList: {
        gap: 2,
        marginTop: 4,
    },
    modelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 10,
    },
    modelRadio: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
        borderColor: '#888',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modelRadioInner: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
    },
    modelTextWrap: {
        flex: 1,
        gap: 2,
    },
    modelName: {
        fontSize: 14,
        fontWeight: '500',
    },
    modelId: {
        fontSize: 11,
    },
    providerRow: {
        flexDirection: 'row',
        gap: 8,
    },
    providerBtn: {
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderRadius: 10,
        alignItems: 'center',
    },
    providerBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },
    input: {
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
    },
    saveBtn: {
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
    },
    saveBtnText: {
        fontWeight: '700',
        fontSize: 15,
    },
    dangerBtn: {
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FF453A55',
        backgroundColor: '#FF453A11',
    },
    dangerBtnText: {
        color: '#FF453A',
        fontWeight: '600',
        fontSize: 15,
    },
});

// /**
//  * settings.tsx – API Key & Provider configuration tab.
//  *
//  * Lets the user choose their AI provider, enter API keys,
//  * select a model, and clear stored data.
//  */

// import React, { useCallback, useEffect, useState } from 'react';
// import {
//     ActivityIndicator,
//     Alert,
//     Platform,
//     Pressable,
//     ScrollView,
//     StyleSheet,
//     Text,
//     TextInput,
//     View,
// } from 'react-native';
// import { useSafeAreaInsets } from 'react-native-safe-area-context';

// import { ThemedText } from '@/components/themed-text';
// import { ThemedView } from '@/components/themed-view';
// import { BottomTabInset, Spacing } from '@/constants/theme';
// import { useTheme } from '@/hooks/use-theme';
// import { useSettings } from '@/context/settings-context';
// import {
//     fetchModels,
//     type ModelInfo,
//     type Provider,
// } from '@/services/ai-service';
// import { clearAllData, type WordFrequency } from '@/services/storage-service';

// const PROVIDERS: { key: Provider; label: string; placeholder: string }[] = [
//     {
//         key: 'pollinations',
//         label: 'Pollinations AI',
//         placeholder: 'pk_... or sk_... (from enter.pollinations.ai)',
//     },
//     {
//         key: 'openrouter',
//         label: 'OpenRouter',
//         placeholder: 'sk-or-... (from openrouter.ai)',
//     },
//     {
//         key: 'gemini',
//         label: 'Gemini',
//         placeholder: 'AIza... (from aistudio.google.com)',
//     },
// ];

// const FREQUENCIES: { key: WordFrequency; label: string }[] = [
//     { key: 'every_open', label: 'Every Open' },
//     { key: 'hourly', label: 'Hourly' },
//     { key: 'daily', label: 'Daily' },
// ];

// export default function SettingsScreen() {
//     const theme = useTheme();
//     const { settings, updateSettings } = useSettings();
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

//     const [localApiKey, setLocalApiKey] = useState(settings.apiKey);
//     const [models, setModels] = useState<ModelInfo[]>([]);
//     const [loadingModels, setLoadingModels] = useState(false);
//     const [saved, setSaved] = useState(false);

//     // When settings load from storage, sync the local text field.
//     useEffect(() => {
//         setLocalApiKey(settings.apiKey);
//     }, [settings.apiKey]);

//     // Fetch models whenever provider changes.
//     useEffect(() => {
//         setLoadingModels(true);
//         fetchModels(settings.provider, settings.apiKey).then((list) => {
//             setModels(list);
//             setLoadingModels(false);
//         });
//     }, [settings.provider, settings.apiKey]);

//     const handleProviderChange = useCallback(
//         (provider: Provider) => {
//             updateSettings({ provider, model: '' }); // reset model on provider change
//         },
//         [updateSettings],
//     );

//     const handleSave = useCallback(async () => {
//         await updateSettings({ apiKey: localApiKey.trim() });
//         setSaved(true);
//         setTimeout(() => setSaved(false), 2500);
//     }, [localApiKey, updateSettings]);

//     const handleClearData = useCallback(() => {
//         Alert.alert(
//             'Clear All Data',
//             'This will delete your saved paragraphs and reset all settings. Are you sure?',
//             [
//                 { text: 'Cancel', style: 'cancel' },
//                 {
//                     text: 'Clear',
//                     style: 'destructive',
//                     onPress: async () => {
//                         await clearAllData();
//                         await updateSettings({
//                             provider: 'openrouter',
//                             model: 'meta-llama/llama-3.1-8b-instruct:free',
//                             apiKey: '',
//                         });
//                         setLocalApiKey('');
//                     },
//                 },
//             ],
//         );
//     }, [updateSettings]);

//     const inputStyle = {
//         backgroundColor: theme.backgroundElement,
//         color: theme.text,
//     };

//     const currentProvider = PROVIDERS.find((p) => p.key === settings.provider);

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
//                     <ThemedText type="subtitle">⚙ Settings</ThemedText>
//                     <ThemedText themeColor="textSecondary" style={styles.headerSub}>
//                         Configure your AI provider and model
//                     </ThemedText>
//                 </ThemedView>

//                 {/* ── Provider picker ── */}
//                 <ThemedView type="backgroundElement" style={styles.card}>
//                     <ThemedText style={styles.sectionTitle}>Provider</ThemedText>
//                     <View style={styles.providerRow}>
//                         {PROVIDERS.map(({ key, label }) => {
//                             const active = key === settings.provider;
//                             return (
//                                 <Pressable
//                                     key={key}
//                                     onPress={() => handleProviderChange(key)}
//                                     style={[
//                                         styles.providerBtn,
//                                         {
//                                             backgroundColor: active
//                                                 ? theme.text
//                                                 : theme.backgroundSelected,
//                                             flex: 1,
//                                         },
//                                     ]}
//                                     accessibilityLabel={label}
//                                 >
//                                     <Text
//                                         style={[
//                                             styles.providerBtnText,
//                                             { color: active ? theme.background : theme.textSecondary },
//                                         ]}
//                                         numberOfLines={1}
//                                         adjustsFontSizeToFit
//                                     >
//                                         {label}
//                                     </Text>
//                                 </Pressable>
//                             );
//                         })}
//                     </View>
//                 </ThemedView>

//                 {/* ── API Key ── */}
//                 <ThemedView type="backgroundElement" style={styles.card}>
//                     <ThemedText style={styles.sectionTitle}>
//                         API Key — {currentProvider?.label}
//                     </ThemedText>
//                     <TextInput
//                         value={localApiKey}
//                         onChangeText={setLocalApiKey}
//                         placeholder={currentProvider?.placeholder ?? 'Enter API key…'}
//                         placeholderTextColor={theme.textSecondary}
//                         style={[styles.input, inputStyle]}
//                         autoCapitalize="none"
//                         autoCorrect={false}
//                         secureTextEntry
//                         returnKeyType="done"
//                         accessibilityLabel="API Key input"
//                     />
//                     <Pressable
//                         onPress={handleSave}
//                         style={({ pressed }) => [
//                             styles.saveBtn,
//                             {
//                                 backgroundColor: saved
//                                     ? '#34C75922'
//                                     : pressed
//                                         ? theme.backgroundSelected
//                                         : theme.text,
//                             },
//                         ]}
//                         accessibilityLabel="Save API key"
//                     >
//                         <Text
//                             style={[
//                                 styles.saveBtnText,
//                                 { color: saved ? '#34C759' : theme.background },
//                             ]}
//                         >
//                             {saved ? '✓ Saved' : 'Save Key'}
//                         </Text>
//                     </Pressable>
//                 </ThemedView>

//                 {/* ── Model picker ── */}
//                 <ThemedView type="backgroundElement" style={styles.card}>
//                     <View style={styles.sectionHeader}>
//                         <ThemedText style={styles.sectionTitle}>Model</ThemedText>
//                         {loadingModels && <ActivityIndicator size="small" color={theme.textSecondary} />}
//                     </View>
//                     <ThemedText themeColor="textSecondary" style={styles.modelHint}>
//                         {settings.model || 'No model selected'}
//                     </ThemedText>
//                     <View style={styles.modelList}>
//                         {models.map((m) => {
//                             const active = m.id === settings.model;
//                             return (
//                                 <Pressable
//                                     key={m.id}
//                                     onPress={() => updateSettings({ model: m.id })}
//                                     style={[
//                                         styles.modelRow,
//                                         {
//                                             backgroundColor: active
//                                                 ? theme.backgroundSelected
//                                                 : 'transparent',
//                                         },
//                                     ]}
//                                     accessibilityLabel={m.name}
//                                 >
//                                     <View style={styles.modelRadio}>
//                                         {active && (
//                                             <View
//                                                 style={[
//                                                     styles.modelRadioInner,
//                                                     { backgroundColor: theme.text },
//                                                 ]}
//                                             />
//                                         )}
//                                     </View>
//                                     <View style={styles.modelTextWrap}>
//                                         <Text
//                                             style={[styles.modelName, { color: theme.text }]}
//                                             numberOfLines={1}
//                                         >
//                                             {m.name}
//                                         </Text>
//                                         {m.name !== m.id && (
//                                             <Text
//                                                 style={[styles.modelId, { color: theme.textSecondary }]}
//                                                 numberOfLines={1}
//                                             >
//                                                 {m.id}
//                                             </Text>
//                                         )}
//                                     </View>
//                                 </Pressable>
//                             );
//                         })}
//                     </View>
//                 </ThemedView>

//                 {/* ── Word of the Day Frequency ── */}
//                 <ThemedView type="backgroundElement" style={styles.card}>
//                     <ThemedText style={styles.sectionTitle}>Word of the Day Refresh</ThemedText>
//                     <View style={styles.providerRow}>
//                         {FREQUENCIES.map(({ key, label }) => {
//                             const active = key === settings.wordFrequency;
//                             return (
//                                 <Pressable
//                                     key={key}
//                                     onPress={() => updateSettings({ wordFrequency: key })}
//                                     style={[
//                                         styles.providerBtn,
//                                         {
//                                             backgroundColor: active
//                                                 ? theme.text
//                                                 : theme.backgroundSelected,
//                                             flex: 1,
//                                         },
//                                     ]}
//                                     accessibilityLabel={label}
//                                 >
//                                     <Text
//                                         style={[
//                                             styles.providerBtnText,
//                                             { color: active ? theme.background : theme.textSecondary },
//                                         ]}
//                                         numberOfLines={1}
//                                         adjustsFontSizeToFit
//                                     >
//                                         {label}
//                                     </Text>
//                                 </Pressable>
//                             );
//                         })}
//                     </View>
//                 </ThemedView>

//                 {/* ── Danger zone ── */}
//                 <Pressable
//                     onPress={handleClearData}
//                     style={({ pressed }) => [
//                         styles.dangerBtn,
//                         { opacity: pressed ? 0.7 : 1 },
//                     ]}
//                     accessibilityLabel="Clear all data"
//                 >
//                     <Text style={styles.dangerBtnText}>🗑 Clear All Data</Text>
//                 </Pressable>
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
//     card: {
//         borderRadius: 16,
//         padding: Spacing.three,
//         gap: 12,
//     },
//     sectionHeader: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 8,
//     },
//     sectionTitle: {
//         fontSize: 13,
//         fontWeight: '600',
//         letterSpacing: 0.5,
//         textTransform: 'uppercase',
//     },
//     providerRow: {
//         flexDirection: 'row',
//         gap: 8,
//     },
//     providerBtn: {
//         paddingVertical: 10,
//         paddingHorizontal: 4,
//         borderRadius: 10,
//         alignItems: 'center',
//     },
//     providerBtnText: {
//         fontSize: 12,
//         fontWeight: '600',
//     },
//     input: {
//         borderRadius: 10,
//         paddingHorizontal: 14,
//         paddingVertical: 10,
//         fontSize: 15,
//     },
//     saveBtn: {
//         borderRadius: 10,
//         paddingVertical: 12,
//         alignItems: 'center',
//     },
//     saveBtnText: {
//         fontWeight: '700',
//         fontSize: 15,
//     },
//     modelHint: {
//         fontSize: 12,
//         marginTop: -6,
//     },
//     modelList: {
//         gap: 2,
//     },
//     modelRow: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 10,
//         paddingVertical: 10,
//         paddingHorizontal: 10,
//         borderRadius: 10,
//     },
//     modelRadio: {
//         width: 18,
//         height: 18,
//         borderRadius: 9,
//         borderWidth: 2,
//         borderColor: '#888',
//         justifyContent: 'center',
//         alignItems: 'center',
//     },
//     modelRadioInner: {
//         width: 9,
//         height: 9,
//         borderRadius: 4.5,
//     },
//     modelTextWrap: {
//         flex: 1,
//         gap: 2,
//     },
//     modelName: {
//         fontSize: 14,
//         fontWeight: '500',
//     },
//     modelId: {
//         fontSize: 11,
//     },
//     dangerBtn: {
//         borderRadius: 12,
//         paddingVertical: 14,
//         alignItems: 'center',
//         borderWidth: 1,
//         borderColor: '#FF453A55',
//         backgroundColor: '#FF453A11',
//     },
//     dangerBtnText: {
//         color: '#FF453A',
//         fontWeight: '600',
//         fontSize: 15,
//     },
// });
