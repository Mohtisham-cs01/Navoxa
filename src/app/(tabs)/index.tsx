import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSettings } from '@/context/settings-context';
import { useTheme } from '@/hooks/use-theme';
import { getRandomWord, initDatabase, type DBWord } from '@/services/database-service';
import { speakGermanWord } from '@/services/tts-service';

export default function HomeScreen() {
  const theme = useTheme();
  const { settings, isLoaded, updateSettings } = useSettings();
  const [word, setWord] = useState<DBWord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const lastWordTimeRef = useRef(settings.lastWordTime);
  lastWordTimeRef.current = settings.lastWordTime;

  const loadNewWord = useCallback(async () => {
    setLoading(true);
    const newWord = await getRandomWord();
    if (newWord) {
      setWord(newWord);
      await updateSettings({
        currentWordId: newWord.id,
        lastWordTime: Date.now()
      });
    }
    setLoading(false);
  }, [updateSettings]);

  const checkAndLoadWord = useCallback(async (forceNew = false) => {
    try {
      const db = await initDatabase();
      const now = Date.now();
      const lastTime = settings.lastWordTime || 0;
      let shouldFetchNew = forceNew;

      if (!shouldFetchNew) {
        if (!settings.currentWordId) {
          shouldFetchNew = true;
        } else if (settings.wordFrequency === 'every_open') {
          if (now - lastTime > 5 * 60 * 1000) shouldFetchNew = true;
        } else if (settings.wordFrequency === 'hourly') {
          if (now - lastTime > 60 * 60 * 1000) shouldFetchNew = true;
        } else if (settings.wordFrequency === 'daily') {
          if (now - lastTime > 24 * 60 * 60 * 1000) shouldFetchNew = true;
        }
      }

      if (shouldFetchNew) {
        await loadNewWord();
      } else if (!word) {
        if (settings.currentWordId) {
          try {
            const row = await db.getFirstAsync<any>('SELECT * FROM words WHERE id = ?', [settings.currentWordId]);
            if (row) {
              setWord({
                id: row.id,
                word: row.word,
                article: row.article,
                pos: row.pos,
                meaning: row.meaning,
                examples: row.examples,
              });
            } else {
              await loadNewWord();
            }
          } catch (e) {
            await loadNewWord();
          }
        }
      }
    } catch (err) {
      console.error("Failed to load DB or word:", err);
    } finally {
      setLoading(false);
    }
  }, [settings.currentWordId, settings.wordFrequency, settings.lastWordTime, word, loadNewWord]);

  // Initial load
  useEffect(() => {
    if (!isLoaded) return;
    checkAndLoadWord();
  }, [isLoaded, settings.wordFrequency]);

  // AppState listener for 'every_open' frequency
  useEffect(() => {
    if (!isLoaded || settings.wordFrequency !== 'every_open') return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        const now = Date.now();
        const lastTime = lastWordTimeRef.current || 0;
        if (now - lastTime > 5 * 60 * 1000) {
          loadNewWord();
        }
      }
    });

    return () => subscription.remove();
  }, [isLoaded, settings.wordFrequency, loadNewWord]);

  const handleSpeak = useCallback(async () => {
    if (!word || isSpeaking) return;
    setIsSpeaking(true);
    try {
      // Speak the word (without article for pronunciation)
      let wordToSpeak = word.word;
      if (word.article && word.word.includes(`${word.article} `)) {
        wordToSpeak = word.word.replace(`${word.article} `, '');
      }
      await speakGermanWord(wordToSpeak);
    } catch (error) {
      console.error('Error speaking word:', error);
    } finally {
      setTimeout(() => setIsSpeaking(false), 2000);
    }
  }, [word, isSpeaking]);

  if (loading || !isLoaded) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={theme.text} />
      </ThemedView>
    );
  }

  if (!word) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ThemedText>Error loading word.</ThemedText>
        <Pressable
          onPress={() => checkAndLoadWord(true)}
          style={[styles.retryBtn, { backgroundColor: theme.backgroundSelected }]}
        >
          <Text style={{ color: theme.text }}>Retry</Text>
        </Pressable>
      </ThemedView>
    );
  }

  // Render article badge for nouns
  const renderArticleBadge = () => {
    if (!word.article || word.pos !== 'noun') return null;

    // Safety check - ensure article exists before using it
    const article = word.article.toLowerCase();

    const getBadgeColor = () => {
      switch (article) {
        case 'der': return theme.text; // Blue for der
        case 'die': return '#ff6b6b'; // Red for die
        case 'das': return '#51a0dc'; // Green for das
        default: return theme.textSecondary;
      }
    };

    const badgeColor = getBadgeColor();
    const isDer = article === 'der';

    return (
      <View style={[
        styles.articleBadge,
        {
          backgroundColor: isDer ? '#2196f3' : (article === 'die' ? '#f44336' : '#4caf50'),
          borderColor: badgeColor
        }
      ]}>
        <Text style={[styles.articleBadgeText, { color: '#fff' }]}>
          {word.article}
        </Text>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* ScrollView now flex:1 to fill height, content container uses flexGrow:1 for bottom alignment */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: BottomTabInset + Spacing.six }
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle">Word of the Day</ThemedText>
            <Pressable
              onPress={() => checkAndLoadWord(true)}
              style={({ pressed }) => [
                styles.refreshBtn,
                {
                  backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                  opacity: pressed ? 0.7 : 1
                }
              ]}
            >
              <Text style={styles.refreshIcon}>🔄</Text>
            </Pressable>
          </ThemedView>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, shadowColor: theme.text }]}>
            {/* Word row */}
            <View style={styles.wordHeader}>
              <View style={styles.wordContainer}>
                {renderArticleBadge()}
                <Text
                  style={[styles.lemma, { color: theme.text }]}
                  adjustsFontSizeToFit
                  numberOfLines={2}
                // minWidth: 0 crucial for flex shrinking below content width
                >
                  {word.word}
                </Text>
              </View>
              <Pressable
                onPress={handleSpeak}
                style={({ pressed }) => [
                  styles.speakBtn,
                  { backgroundColor: pressed ? theme.backgroundSelected : theme.background }
                ]}
              >
                {isSpeaking ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Text style={styles.speakIcon}>🔊</Text>
                )}
              </Pressable>
            </View>

            {word.pos && (
              <Text style={[styles.grammarInfo, { color: theme.textSecondary }]}>
                {word.pos}
              </Text>
            )}

            <View style={[styles.divider, { backgroundColor: theme.textSecondary, opacity: 0.2 }]} />

            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>MEANINGS</Text>
            <View style={styles.meaningsList}>
              {word.meaning ? (
                <Text style={[styles.meaningItem, { color: theme.text }]}>
                  <Text style={{ fontWeight: '800' }}>•</Text> {word.meaning}
                </Text>
              ) : (
                <Text style={[styles.meaningItem, { color: theme.textSecondary }]}>No meaning available</Text>
              )}
            </View>

            {word.examples && word.examples !== '' && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.textSecondary, opacity: 0.2 }]} />
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>EXAMPLE</Text>
                <Text style={[styles.exampleText, { color: theme.text }]}>
                  "{word.examples.replace(/\\n/g, '\n')}"
                </Text>
              </>
            )}
          </View>

          {/* Next Random Word – now stretched to bottom when content is short */}
          <Pressable
            onPress={() => loadNewWord()}
            style={({ pressed }) => [
              styles.mainActionBtn,
              {
                backgroundColor: theme.text,
                opacity: pressed ? 0.8 : 1
              }
            ]}
          >
            <Text style={[styles.mainActionBtnText, { color: theme.background }]}>
              Next Random Word
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  // Give ScrollView flex:1 to occupy full height
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,                   // pushes button to bottom when content is shorter than screen
    width: '100%',
    maxWidth: MaxContentWidth,     // use your constant (600) for consistency
    paddingTop: Spacing.four,
    gap: Spacing.five,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshIcon: {
    fontSize: 16,
  },
  card: {
    borderRadius: 24,
    padding: Spacing.five,
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  wordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  wordContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
  },
  lemma: {
    fontSize: 30,
    fontWeight: '900',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,                  // essential for text to shrink below its intrinsic width
    letterSpacing: -0.5,
    marginRight: Spacing.three,   // replace unsupported 'gap' with margin for compatibility
  },
  speakBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  speakIcon: {
    fontSize: 24,
  },
  articleBadge: {
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: Spacing.two,
    borderWidth: 1,
    minWidth: 40,
    alignItems: 'center',
  },
  articleBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  grammarInfo: {
    fontSize: 16,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: Spacing.one,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.four,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
    opacity: 0.8,
  },
  meaningsList: {
    gap: 8,
  },
  meaningItem: {
    fontSize: 18,
    lineHeight: 28,
  },
  exampleText: {
    fontSize: 18,
    fontStyle: 'italic',
    lineHeight: 28,
  },
  retryBtn: {
    marginTop: Spacing.three,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  mainActionBtn: {
    borderRadius: 16,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',            // pushed to bottom by flexGrow on content container
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  mainActionBtnText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
