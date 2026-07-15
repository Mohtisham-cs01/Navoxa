/**
 * reader-context.tsx
 *
 * Holds the currently generated German paragraph and per-word meanings.
 * Wrap screens that need it with <ReaderProvider>.
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useState,
} from 'react';

import type { GeneratedParagraph } from '@/services/ai-service';

interface ReaderContextValue {
    paragraph: GeneratedParagraph | null;
    isLoading: boolean;
    error: string | null;
    setParagraph: (p: GeneratedParagraph) => void;
    setLoading: (v: boolean) => void;
    setError: (e: string | null) => void;
    clearParagraph: () => void;
}

const ReaderContext = createContext<ReaderContextValue | null>(null);

export function ReaderProvider({ children }: { children: React.ReactNode }) {
    const [paragraph, setParagraphState] = useState<GeneratedParagraph | null>(null);
    const [isLoading, setLoadingState] = useState(false);
    const [error, setErrorState] = useState<string | null>(null);

    const setParagraph = useCallback((p: GeneratedParagraph) => {
        setParagraphState(p);
        setErrorState(null);
    }, []);

    const setLoading = useCallback((v: boolean) => {
        setLoadingState(v);
        if (v) setErrorState(null);
    }, []);

    const setError = useCallback((e: string | null) => {
        setErrorState(e);
        setLoadingState(false);
    }, []);

    const clearParagraph = useCallback(() => {
        setParagraphState(null);
        setErrorState(null);
    }, []);

    return (
        <ReaderContext.Provider
            value={{
                paragraph,
                isLoading,
                error,
                setParagraph,
                setLoading,
                setError,
                clearParagraph,
            }}
        >
            {children}
        </ReaderContext.Provider>
    );
}

export function useReader(): ReaderContextValue {
    const ctx = useContext(ReaderContext);
    if (!ctx) throw new Error('useReader must be used within ReaderProvider');
    return ctx;
}
