import React, { useState } from 'react';
import { Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import BattleScreen from './screens/BattleScreen';
import MonstersScreen from './screens/MonstersScreen';
import type { Combatant } from './types/Combatant';

type MainTab = 'Monsters' | 'Battle' | 'Players';

const tabs: { label: MainTab; icon: string }[] = [
  { label: 'Monsters', icon: '♟' },
  { label: 'Battle', icon: '⚔' },
  { label: 'Players', icon: '♙' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('Monsters');
  const [incomingMonsters, setIncomingMonsters] = useState<Combatant[]>([]);
  const [monsterPickerOpen, setMonsterPickerOpen] = useState(false);

  const addMonsterToBattle = (monsters: Combatant | Combatant[]) => {
    const newMonsters = Array.isArray(monsters) ? monsters : [monsters];
    setIncomingMonsters((current) => [...current, ...newMonsters]);
    setMonsterPickerOpen(false);
    setActiveTab('Battle');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.header} />
        <View style={styles.appContent}>
          <View style={[styles.screen, activeTab !== 'Monsters' && styles.hiddenScreen]}>
            <MonstersScreen isActive={activeTab === 'Monsters'} onAddToBattle={addMonsterToBattle} />
          </View>
          <View style={[styles.screen, activeTab !== 'Battle' && styles.hiddenScreen]}>
            <BattleScreen incomingMonsters={incomingMonsters} onOpenMonsters={() => setMonsterPickerOpen(true)} />
          </View>
          <View style={[styles.screen, activeTab !== 'Players' && styles.hiddenScreen]}>
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>Players</Text>
              <Text style={styles.placeholderText}>Player list is the next section to build.</Text>
            </View>
          </View>
        </View>

        <Modal
          animationType="slide"
          onRequestClose={() => setMonsterPickerOpen(false)}
          visible={monsterPickerOpen}
        >
          <SafeAreaView edges={['top', 'bottom']} style={styles.pickerModal}>
            <MonstersScreen
              isActive={monsterPickerOpen}
              onAddToBattle={addMonsterToBattle}
              selectionMode
              onClosePicker={() => setMonsterPickerOpen(false)}
            />
          </SafeAreaView>
        </Modal>

        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.label;
            return (
              <Pressable
                key={tab.label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveTab(tab.label)}
                style={styles.tabItem}
              >
                <Text style={[styles.tabIcon, selected && styles.selectedTabText]}>{tab.icon}</Text>
                <Text style={[styles.tabLabel, selected && styles.selectedTabText]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const colors = { background: '#171729', header: '#292743', muted: '#9997B0', text: '#F7F6FC', amber: '#FFB000', border: '#3B3955' };

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.header },
  appContent: { flex: 1, backgroundColor: colors.background },
  pickerModal: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  hiddenScreen: { display: 'none' },
  tabBar: {
    minHeight: 50, paddingTop: 4, paddingBottom: 2, backgroundColor: colors.header,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    flexDirection: 'row', justifyContent: 'space-around',
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabIcon: { color: '#ACAABC', fontSize: 14, lineHeight: 17 },
  tabLabel: { color: '#ACAABC', fontSize: 9 },
  selectedTabText: { color: colors.amber },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholderTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  placeholderText: { color: colors.muted, marginTop: 6, fontSize: 13, textAlign: 'center' },
});
