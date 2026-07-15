/**
 * settings-context.tsx
 *
 * Global settings (provider, model, API key) loaded from storage on mount.
 * Wrap the app root with <SettingsProvider> to use useSettings() anywhere.
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';

import type { Provider } from '@/services/ai-service';
import {
    loadSettings,
    saveSettings,
    type AppSettings,
} from '@/services/storage-service';

interface SettingsContextValue {
    settings: AppSettings;
    isLoaded: boolean;
    updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>({
        provider: 'openrouter',
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        apiKey: '',
        wordFrequency: 'daily',
        lastWordTime: 0,
        currentWordId: null,
    });
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        loadSettings().then((stored) => {
            setSettings(stored);
            setIsLoaded(true);
        });
    }, []);

    const updateSettings = useCallback(
        async (patch: Partial<AppSettings>) => {
            const next = { ...settings, ...patch };
            setSettings(next);
            await saveSettings(next);
        },
        [settings],
    );

    return (
        <SettingsContext.Provider value={{ settings, isLoaded, updateSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings(): SettingsContextValue {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
    return ctx;
}
