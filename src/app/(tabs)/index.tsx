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
import { generateBatchSentences } from '@/services/ai-service';
import { getWordsNeedingSentences, saveWordWithSentences, getSentencesForWord, checkWordExists, type GeneratedSentence } from '@/services/dictionary-service';

export default function HomeScreen() {
  const theme = useTheme();
  const { settings, isLoaded, updateSettings } = useSettings();
  const [word, setWord] = useState<DBWord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Generated sentences state
  const [isGeneratingSentences, setIsGeneratingSentences] = useState(false);
  const [sentences, setSentences] = useState<GeneratedSentence[]>([]);

  const lastWordTimeRef = useRef(settings.lastWordTime);
  lastWordTimeRef.current = settings.lastWordTime;

  const loadNewWord = useCallback(async () => {
    setLoading(true);
    const newWord = await getRandomWord();
    if (newWord) {
      setWord(newWord);
      
      // Check if we already have sentences for this word
      const dictWordId = await checkWordExists(newWord.word);
      if (dictWordId) {
        const existing = await getSentencesForWord(dictWordId);
        setSentences(existing);
      } else {
        setSentences([]);
      }

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

              // Check if we already have sentences for this word
              const dictWordId = await checkWordExists(row.word);
              if (dictWordId) {
                const existing = await getSentencesForWord(dictWordId);
                setSentences(existing);
              } else {
                setSentences([]);
              }
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

  const handleGenerateSentences = useCallback(async () => {
    if (!word) return;
    if (!settings.apiKey && settings.provider !== 'pollinations') {
      alert('Please add your API key in Settings first.');
      return;
    }

    setIsGeneratingSentences(true);
    try {
      // Fetch up to 3 other words needing sentences
      const otherWords = await getWordsNeedingSentences(3);
      
      const config = {
        provider: settings.provider,
        model: settings.model,
        apiKey: settings.apiKey,
      };

      // Prepare batch list (current word + others)
      const batchList = [
        { word: word.word, meaning: word.meaning },
        ...otherWords.map(w => ({ word: w.word, meaning: w.meaning }))
      ];

      // De-duplicate by word in case the current word is already in the dictionary needing sentences
      const uniqueBatch = Array.from(new Map(batchList.map(item => [item.word, item])).values());

      const batchResult = await generateBatchSentences(config, uniqueBatch);

      let newlyGeneratedForCurrent = 0;

      // Save to dictionary
      for (const [wKey, genSentences] of Object.entries(batchResult)) {
        const item = uniqueBatch.find(i => i.word === wKey);
        if (!item) continue;

        const wordId = await saveWordWithSentences({
          word: wKey,
          meaning: item.meaning,
          sentences: genSentences,
        });

        // If this is the current word, update UI state
        if (wKey.toLowerCase() === word.word.toLowerCase()) {
          const updatedSentences = await getSentencesForWord(wordId);
          setSentences(updatedSentences);
          newlyGeneratedForCurrent = genSentences.length;
        }
      }

      if (newlyGeneratedForCurrent === 0 && Object.keys(batchResult).length === 0) {
        alert('Could not generate sentences. Please try again.');
      }
    } catch (err: any) {
      alert(err?.message ?? 'Failed to generate sentences.');
    } finally {
      setIsGeneratingSentences(false);
    }
  }, [word, settings]);

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

            {sentences.length > 0 && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.textSecondary, opacity: 0.2 }]} />
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>GENERATED SENTENCES</Text>
                <View style={styles.sentencesList}>
                  {sentences.map((s, idx) => (
                    <View key={s.id || idx} style={[styles.sentenceRow, { backgroundColor: theme.background }]}>
                      <View style={styles.sentenceTop}>
                        <View style={[styles.tenseBadge, { backgroundColor: theme.backgroundSelected }]}>
                          <Text style={[styles.tenseText, { color: theme.textSecondary }]}>{s.tense.toUpperCase()}</Text>
                        </View>
                        <Text style={[styles.sentenceText, { color: theme.text }]}>{s.sentence}</Text>
                      </View>
                      <Text style={[styles.translationText, { color: theme.textSecondary }]}>{s.translation}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Pressable
              onPress={handleGenerateSentences}
              disabled={isGeneratingSentences}
              style={({ pressed }) => [
                styles.practiceBtn,
                { backgroundColor: isGeneratingSentences ? theme.backgroundElement : '#4F9EFF1A', borderColor: '#4F9EFF55' },
                pressed && { opacity: 0.8 }
              ]}
            >
              {isGeneratingSentences ? (
                <View style={styles.practiceBtnContent}>
                  <ActivityIndicator size="small" color="#4F9EFF" />
                  <Text style={[styles.practiceBtnText, { color: '#4F9EFF' }]}>Generating...</Text>
                </View>
              ) : (
                <View style={styles.practiceBtnContent}>
                  <Text style={styles.practiceBtnEmoji}>✨</Text>
                  <Text style={[styles.practiceBtnText, { color: '#4F9EFF' }]}>
                    {sentences.length > 0 ? "Add More Sentences" : "Generate Sentences"}
                  </Text>
                </View>
              )}
            </Pressable>
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
  practiceBtn: {
    marginTop: Spacing.five,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  practiceBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  practiceBtnEmoji: {
    fontSize: 20,
  },
  practiceBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  sentencesList: {
    gap: 12,
  },
  sentenceRow: {
    padding: 12,
    borderRadius: 12,
  },
  sentenceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  tenseBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tenseText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sentenceText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  translationText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 2,
    paddingLeft: 4,
  },
});
