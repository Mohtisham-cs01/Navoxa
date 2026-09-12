/**
 * app-tabs.tsx
 *
 * Tab navigator configuration.
 * Four tabs: Home, Reader (German learning), Explore, Settings.
 * Reader and Settings use text-based emoji icons to avoid adding new image assets.
 */

import { Tabs } from 'expo-router';
import { Image } from 'expo-image';
import { Text, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

function EmojiTabIcon({ emoji, size }: { emoji: string; size: number }) {
  return (
    <Text style={{ fontSize: size * 0.9, lineHeight: size * 1.2 }}>
      {emoji}
    </Text>
  );
}

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme ?? 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Image
              source={require('@/assets/images/tabIcons/home.png')}
              style={{ width: size, height: size, tintColor: color }}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="reader"
        options={{
          title: 'Lesen',
          tabBarIcon: ({ size }) => (
            <EmojiTabIcon emoji="🇩🇪" size={size} />
          ),
        }}
      />



      <Tabs.Screen
        name="quiz"
        options={{
          title: 'Artikel',
          tabBarIcon: ({ size }) => (
            <EmojiTabIcon emoji="🎯" size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="meaning-quiz"
        options={{
          title: 'Bedeutung',
          tabBarIcon: ({ size }) => (
            <EmojiTabIcon emoji="📝" size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="dictionary"
        options={{
          title: 'Wörterbuch',
          tabBarIcon: ({ size }) => (
            <EmojiTabIcon emoji="📚" size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size }) => (
            <EmojiTabIcon emoji="⚙️" size={size} />
          ),
        }}
      />

    </Tabs>
  );
}
