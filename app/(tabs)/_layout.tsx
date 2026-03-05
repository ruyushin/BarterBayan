import { Link, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const TabsAny: any = Tabs;

  return (
    <View style={{ flex: 1 }}>
      <TabsAny
        screenOptions={{
          tabBarActiveTintColor: '#2F2F6F',
          headerShown: false,
          tabBarButton: HapticTab,
          tabBar: CustomTabBar,
        }}
      >
        <TabsAny.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }: { color: string }) => <Ionicons size={28} name="home" color={color} />,
            headerRight: () => (
              <Link href="/modal" asChild>
                <Pressable>
                  {({ pressed }) => (
                    <Text
                      style={{ marginRight: 15, opacity: pressed ? 0.5 : 1, fontSize: 18 }}
                    >
                      ⚙️
                    </Text>
                  )}
                </Pressable>
              </Link>
            ),
          }}
        />
        <TabsAny.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color }: { color: string }) => <Ionicons size={28} name="search" color={color} />,
          }}
        />
        <TabsAny.Screen
          name="trade"
          options={{
            title: 'Trade',
            tabBarIcon: ({ color }: { color: string }) => <Ionicons size={28} name="swap-horizontal" color={color} />,
          }}
        />
        <TabsAny.Screen
          name="inbox"
          options={{
            title: 'Inbox',
            tabBarIcon: ({ color }: { color: string }) => <Ionicons size={28} name="mail" color={color} />,
          }}
        />
        <TabsAny.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }: { color: string }) => <Ionicons size={28} name="person" color={color} />,
          }}
        />
      </TabsAny>
    </View>
  );
}
// custom bottom nav component used by all tabs
function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const active = state.routes[state.index].name;
  const tabs: Array<{ icon: string; label: string; route: string }> = [
    { icon: 'home', label: 'Home', route: 'index' },
    { icon: 'search', label: 'Explore', route: 'explore' },
    { icon: 'swap-horizontal', label: 'Trade', route: 'trade' },
    { icon: 'mail', label: 'Inbox', route: 'inbox' },
    { icon: 'person', label: 'Account', route: 'profile' },
  ];

  return (
    <View style={layoutStyles.bottomNav}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.route}
          onPress={() => navigation.navigate(t.route)}
          style={layoutStyles.navItemWrapper}
        >
          <Ionicons
            name={t.icon as any}
            size={28}
            color={active === t.route ? '#2F2F6F' : '#999'}
          />
          <Text
            style={{
              color: active === t.route ? '#2F2F6F' : '#999',
              fontSize: 12,
            }}
          >
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const layoutStyles = StyleSheet.create({
  bottomNav: {
    height: 80,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  navItemWrapper: {
    alignItems: 'center',
  },
});
