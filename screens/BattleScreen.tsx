import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Combatant } from '../types/Combatant';

type DamageType =
  | 'Acid' | 'Bludgeoning' | 'Cold' | 'Fire' | 'Force' | 'Lightning'
  | 'Necrotic' | 'Piercing' | 'Poison' | 'Psychic' | 'Radiant'
  | 'Slashing' | 'Thunder';


type HealthAction = 'damage' | 'heal';

const damageTypes: DamageType[] = [
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic',
  'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder',
];

const conditionOptions = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated',
  'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained',
  'Stunned', 'Unconscious',
];

const BATTLE_STATE_KEY = '@dnd-battle-tracker/active-battle-v1';
const SAVED_PLAYERS_KEY = '@dnd-battle-tracker/players-v1';

type SavedPlayer = { id: string; name: string; ac: number; maxHp: number };

function adjustedDamage(target: Combatant, amount: number, type: DamageType | null) {
  if (!type) return amount;
  const matches = (traits: string[]) => traits.some((trait) => trait.toLowerCase().includes(type.toLowerCase()));
  if (matches(target.immunities)) return 0;
  const resistant = matches(target.resistances);
  const vulnerable = matches(target.vulnerabilities);
  if (resistant && vulnerable) return amount;
  if (resistant) return Math.floor(amount / 2);
  if (vulnerable) return amount * 2;
  return amount;
}

function rollDiceFormula(formula: string): number | null {
  const match = formula.trim().match(/^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i);
  if (!match) return null;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = Number(match[4] ?? 0) * (match[3] === '-' ? -1 : 1);
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
  let total = modifier;
  for (let die = 0; die < count; die += 1) total += Math.floor(Math.random() * sides) + 1;
  return Math.max(0, total);
}

export default function BattleScreen({ incomingMonsters, onOpenMonsters }: { incomingMonsters: Combatant[]; onOpenMonsters: () => void }) {
  const [combatants, setCombatants] = useState<Combatant[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [battleLoaded, setBattleLoaded] = useState(false);
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedSavedPlayer, setSelectedSavedPlayer] = useState<SavedPlayer | null>(null);
  const [savedPlayerInitiative, setSavedPlayerInitiative] = useState('');
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerAc, setPlayerAc] = useState('');
  const [playerHp, setPlayerHp] = useState('');
  const [playerInitiative, setPlayerInitiative] = useState('');
  const [healthTargetId, setHealthTargetId] = useState<string | null>(null);
  const [healthAction, setHealthAction] = useState<HealthAction>('damage');
  const [healthAmount, setHealthAmount] = useState('');
  const [diceFormula, setDiceFormula] = useState('');
  const [diceRollResult, setDiceRollResult] = useState<number | null>(null);
  const [damageType, setDamageType] = useState<DamageType | null>(null);
  const [conditionTargetId, setConditionTargetId] = useState<string | null>(null);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);

  const orderedCombatants = useMemo(
    () => [...combatants].sort((a, b) => b.initiative - a.initiative),
    [combatants],
  );

  useEffect(() => {
    let mounted = true;
    const restoreBattle = async () => {
      try {
        const saved = await AsyncStorage.getItem(BATTLE_STATE_KEY);
        if (!mounted || !saved) return;
        const battle = JSON.parse(saved) as { combatants?: Combatant[]; round?: number; activeId?: string };
        if (Array.isArray(battle.combatants)) setCombatants(battle.combatants);
        if (Number.isInteger(battle.round) && (battle.round ?? 0) > 0) setRound(battle.round as number);
        if (battle.activeId) {
          const index = [...(battle.combatants ?? [])].sort((a, b) => b.initiative - a.initiative).findIndex((item) => item.id === battle.activeId);
          if (index >= 0) setActiveIndex(index);
        }
      } catch (error) {
        console.warn('Unable to restore battle state', error);
      } finally {
        if (mounted) setBattleLoaded(true);
      }
    };
    void restoreBattle();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(SAVED_PLAYERS_KEY).then((saved) => {
      if (!mounted) return;
      if (saved) {
        const parsed = JSON.parse(saved) as SavedPlayer[];
        if (Array.isArray(parsed)) setSavedPlayers(parsed);
      }
    }).catch((error) => console.warn('Unable to restore saved players', error))
      .finally(() => { if (mounted) setPlayersLoaded(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!playersLoaded) return;
    void AsyncStorage.setItem(SAVED_PLAYERS_KEY, JSON.stringify(savedPlayers))
      .catch((error) => console.warn('Unable to save players', error));
  }, [playersLoaded, savedPlayers]);

  useEffect(() => {
    if (!battleLoaded) return;
    const activeId = orderedCombatants[activeIndex]?.id;
    void AsyncStorage.setItem(BATTLE_STATE_KEY, JSON.stringify({ combatants, round, activeId }))
      .catch((error) => console.warn('Unable to save battle state', error));
  }, [battleLoaded, combatants, round, activeIndex, orderedCombatants]);

  useEffect(() => {
    if (!battleLoaded) return;
    const additions = incomingMonsters.filter((incoming) => !combatants.some((item) => item.id === incoming.id));
    if (additions.length === 0) return;
    const activeId = orderedCombatants[activeIndex]?.id;
    const updatedCombatants = [...combatants, ...additions];
    const updatedOrder = [...updatedCombatants].sort((a, b) => b.initiative - a.initiative);
    setCombatants(updatedCombatants);
    const preservedActiveIndex = activeId
      ? updatedOrder.findIndex((item) => item.id === activeId)
      : 0;
    setActiveIndex(Math.max(0, preservedActiveIndex));
  }, [battleLoaded, incomingMonsters, combatants, orderedCombatants, activeIndex]);

  const healthTarget = combatants.find((combatant) => combatant.id === healthTargetId);
  const conditionTarget = combatants.find((combatant) => combatant.id === conditionTargetId);
  const filteredSavedPlayers = useMemo(() => {
    const normalized = playerSearch.trim().toLocaleLowerCase();
    return savedPlayers.filter((player) => !normalized || player.name.toLocaleLowerCase().includes(normalized));
  }, [savedPlayers, playerSearch]);

  const addPlayerCombatant = (player: SavedPlayer, initiative: number) => {
    const combatant: Combatant = {
      id: `player-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: player.name, kind: 'Player', ac: player.ac, hp: player.maxHp, maxHp: player.maxHp, initiative,
      conditions: [], resistances: [], vulnerabilities: [], immunities: [],
      deathSaveSuccesses: 0, deathSaveFailures: 0, isDead: false,
    };
    const activeId = orderedCombatants[activeIndex]?.id;
    const updated = [...combatants, combatant];
    const updatedOrder = [...updated].sort((a, b) => b.initiative - a.initiative);
    setCombatants(updated);
    setActiveIndex(activeId ? Math.max(0, updatedOrder.findIndex((item) => item.id === activeId)) : 0);
  };

  const addSelectedPlayer = () => {
    const initiative = Number.parseInt(savedPlayerInitiative, 10);
    if (!selectedSavedPlayer || !Number.isInteger(initiative)) {
      Alert.alert('Enter initiative', 'Enter the initiative this player rolled.');
      return;
    }
    addPlayerCombatant(selectedSavedPlayer, initiative);
    setSelectedSavedPlayer(null);
    setSavedPlayerInitiative('');
    setPlayerPickerOpen(false);
  };

  const updateHealth = () => {
    const amount = Number.parseInt(healthAmount, 10);
    if (!healthTarget || !Number.isFinite(amount) || amount < 0) {
      Alert.alert('Enter a valid amount', 'Use a whole number of hit points.');
      return;
    }
    const effectiveAmount = healthAction === 'damage'
      ? adjustedDamage(healthTarget, amount, damageType)
      : amount;
    setCombatants((current) => current.map((combatant) => {
      if (combatant.id !== healthTarget.id) return combatant;
      const hp = healthAction === 'damage'
        ? Math.max(0, combatant.hp - effectiveAmount)
        : Math.min(combatant.maxHp, combatant.hp + effectiveAmount);
      const revived = healthAction === 'heal' && combatant.hp === 0 && hp > 0;
      const newlyDown = healthAction === 'damage' && combatant.hp > 0 && hp === 0;
      return {
        ...combatant,
        hp,
        ...(revived || newlyDown ? { deathSaveSuccesses: 0, deathSaveFailures: 0, isDead: false } : {}),
      };
    }));
    setHealthTargetId(null);
    setHealthAmount('');
    setDiceFormula(''); setDiceRollResult(null);
    setDamageType(null);
  };

  const rollDeathSave = (combatant: Combatant) => {
    const roll = Math.floor(Math.random() * 20) + 1;
    setCombatants((current) => current.map((item) => {
      if (item.id !== combatant.id) return item;
      if (roll === 20) {
        return { ...item, hp: 1, deathSaveSuccesses: 0, deathSaveFailures: 0, isDead: false };
      }
      const successes = roll >= 10 ? item.deathSaveSuccesses + 1 : item.deathSaveSuccesses;
      const failures = roll === 1
        ? item.deathSaveFailures + 2
        : roll < 10 ? item.deathSaveFailures + 1 : item.deathSaveFailures;
      return {
        ...item,
        deathSaveSuccesses: Math.min(3, successes),
        deathSaveFailures: Math.min(3, failures),
        isDead: item.deathSaveFailures + (roll === 1 ? 2 : roll < 10 ? 1 : 0) >= 3,
      };
    }));
    const result = roll === 20
      ? 'Natural 20 — you regain 1 hit point.'
      : roll === 1
        ? 'Natural 1 — mark two failures.'
        : roll >= 10 ? 'Success.' : 'Failure.';
    Alert.alert(`Death save: ${roll}`, result);
  };

  const openHealthAction = (combatant: Combatant, action: HealthAction) => {
    setHealthTargetId(combatant.id);
    setHealthAction(action);
    setHealthAmount('');
    setDiceFormula(''); setDiceRollResult(null);
    setDamageType(null);
  };

  const openConditions = (combatant: Combatant) => {
    setConditionTargetId(combatant.id);
    setSelectedConditions(combatant.conditions);
  };

  const saveConditions = () => {
    if (!conditionTarget) return;
    setCombatants((current) => current.map((combatant) => (
      combatant.id === conditionTarget.id
        ? { ...combatant, conditions: selectedConditions }
        : combatant
    )));
    setConditionTargetId(null);
  };

  const savePlayer = () => {
    const name = playerName.trim();
    const ac = Number.parseInt(playerAc, 10);
    const hp = Number.parseInt(playerHp, 10);
    const initiative = Number.parseInt(playerInitiative, 10);
    if (!name || !Number.isInteger(ac) || ac < 0 || !Number.isInteger(hp) || hp < 1 || !Number.isInteger(initiative)) {
      Alert.alert('Complete the required fields', 'Enter the player name, AC, maximum HP, and initiative roll.');
      return;
    }
    const player = { id: `saved-player-${Date.now()}`, name, ac, maxHp: hp };
    setSavedPlayers((current) => [...current, player]);
    addPlayerCombatant(player, initiative);
    setAddPlayerOpen(false);
    setPlayerName(''); setPlayerAc(''); setPlayerHp(''); setPlayerInitiative('');
    setPlayerPickerOpen(false);
  };

  const moveTurn = (direction: -1 | 1) => {
    if (orderedCombatants.length === 0) return;
    const nextIndex = activeIndex + direction;
    if (nextIndex >= orderedCombatants.length) {
      setActiveIndex(0);
      setRound((current) => current + 1);
    } else if (nextIndex < 0) {
      setActiveIndex(orderedCombatants.length - 1);
      setRound((current) => Math.max(1, current - 1));
    } else {
      setActiveIndex(nextIndex);
    }
  };

  const endBattle = () => {
    Alert.alert('End battle?', 'This will clear the combatants and reset the round.', [
      { text: 'Keep battling', style: 'cancel' },
      {
        text: 'End battle', style: 'destructive',
        onPress: () => { setCombatants([]); setRound(1); setActiveIndex(0); },
      },
    ]);
  };

  const openAddMenu = () => Alert.alert('Add to Battle', 'Choose what to add.', [
    { text: 'Monster', onPress: onOpenMonsters },
    { text: 'Player', onPress: () => setPlayerPickerOpen(true) },
    { text: 'Cancel', style: 'cancel' },
  ]);

  const removeCombatant = (combatant: Combatant) => {
    Alert.alert(`Remove ${combatant.name}?`, 'This combatant will leave the encounter.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => {
          setCombatants((current) => current.filter((item) => item.id !== combatant.id));
          setActiveIndex((current) => Math.max(0, Math.min(current, orderedCombatants.length - 2)));
        },
      },
    ]);
  };

  return (
    <View style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Battle</Text>
          <Pressable accessibilityRole="button" disabled={!battleLoaded} onPress={openAddMenu} style={styles.addPlayerButton}>
            <Text style={styles.addPlayerButtonText}>+ Add</Text>
          </Pressable>
        </View>

        <>
            <View style={styles.roundHeader}>
              <View>
                <Text style={styles.roundTitle}>Round {round}</Text>
                <Text style={styles.subtleText}>{orderedCombatants.length} combatants</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={endBattle} style={styles.endButton}>
                <Text style={styles.endButtonText}>End</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.listContent}>
              {orderedCombatants.map((combatant, index) => {
                const isActive = index === activeIndex;
                const hpPercent = combatant.maxHp > 0
                  ? Math.max(0, Math.min(100, (combatant.hp / combatant.maxHp) * 100))
                  : 0;
                return (
                  <View
                    key={combatant.id}
                    style={[styles.combatantCard, isActive && styles.activeCard]}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={styles.acBadge}>
                        <Text style={styles.acBadgeLabel}>AC</Text>
                        <Text style={styles.acBadgeValue}>{combatant.ac}</Text>
                      </View>
                      <View style={styles.combatantDetails}>
                        <Text numberOfLines={1} style={styles.combatantName}>{combatant.name}</Text>
                <Text style={styles.combatantMeta}>{combatant.kind} · Init {combatant.initiative}</Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`Remove ${combatant.name}`}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => removeCombatant(combatant)}
                        style={styles.removeButton}
                      >
                        <Text style={styles.removeText}>×</Text>
                      </Pressable>
                    </View>

                    <View style={styles.hpRow}>
                      <View style={styles.hpTrack}>
                        <View style={[styles.hpFill, { width: `${hpPercent}%` }]} />
                      </View>
                      <Text style={styles.hpText}>{combatant.hp} / {combatant.maxHp}</Text>
                    </View>

                    <View style={styles.actionsRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openHealthAction(combatant, 'damage')}
                        style={[styles.actionButton, styles.damageButton]}
                      >
                        <Text style={styles.actionText}>Damage</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openHealthAction(combatant, 'heal')}
                        style={[styles.actionButton, styles.healButton]}
                      >
                        <Text style={styles.actionText}>Heal</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openConditions(combatant)}
                        style={[styles.actionButton, styles.conditionButton]}
                      >
                        <Text numberOfLines={1} style={styles.conditionButtonText}>Add Condition</Text>
                      </Pressable>
                    </View>

                    {combatant.conditions.length > 0 && (
                      <View style={styles.conditionTags}>
                        {combatant.conditions.map((condition) => (
                          <Text key={condition} style={styles.conditionTag}>{condition}</Text>
                        ))}
                      </View>
                    )}
                    {combatant.kind === 'Player' && combatant.hp === 0 && combatant.deathSaveSuccesses >= 3 && !combatant.isDead && (
                      <Text style={styles.stableText}>Stable · 3 successful death saves</Text>
                    )}
                    {combatant.kind === 'Player' && combatant.hp === 0 && combatant.deathSaveSuccesses < 3 && !combatant.isDead && (
                      <View style={styles.deathSavePanel}>
                        <View style={styles.deathSaveHeader}>
                          <Text style={styles.deathSaveTitle}>Death saves</Text>
                          <Text style={styles.deathSaveCount}>
                            <Text style={styles.successCount}>✓ {combatant.deathSaveSuccesses}</Text>
                            {'   '}
                            <Text style={styles.failureCount}>× {combatant.deathSaveFailures}</Text>
                          </Text>
                        </View>
                        <Pressable onPress={() => rollDeathSave(combatant)} style={styles.rollSaveButton}>
                          <Text style={styles.rollSaveText}>Roll Death Save (DC 10)</Text>
                        </Pressable>
                      </View>
                    )}
                    {combatant.isDead && <Text style={styles.deadText}>Dead · 3 failed death saves</Text>}
                  </View>
                );
              })}
              {orderedCombatants.length === 0 && (
                <View style={styles.emptyPanel}>
                  <Text style={styles.emptyTitle}>{battleLoaded ? 'Ready when you are' : 'Loading battle…'}</Text>
                  {battleLoaded ? <Text style={styles.emptyText}>Tap + Add to search saved players or monsters and add them to the encounter.</Text> : null}
                </View>
              )}
            </ScrollView>

            <View style={styles.turnControls}>
              <Pressable onPress={() => moveTurn(-1)} style={styles.previousButton}>
                <Text style={styles.previousText}>‹ Prev</Text>
              </Pressable>
              <Pressable onPress={() => moveTurn(1)} style={styles.nextButton}>
                <Text style={styles.nextText}>Next Turn ›</Text>
              </Pressable>
            </View>
        </>

      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => { setPlayerPickerOpen(false); setPlayerSearch(''); }}
        transparent
        visible={playerPickerOpen}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Player</Text>
            <Text style={styles.modalSubtitle}>Search your saved players, then enter their initiative roll.</Text>
            <TextInput
              accessibilityLabel="Search saved players"
              autoFocus
              onChangeText={setPlayerSearch}
              placeholder="Search players"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={styles.playerSearchInput}
              value={playerSearch}
            />
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.playerPickerList}>
              {filteredSavedPlayers.map((player) => (
                <Pressable
                  key={player.id}
                  onPress={() => { setSelectedSavedPlayer(player); setSavedPlayerInitiative(''); }}
                  style={styles.playerPickerRow}
                >
                  <View style={styles.playerPickerInfo}>
                    <Text style={styles.playerPickerName}>{player.name}</Text>
                    <Text style={styles.playerPickerMeta}>AC {player.ac} · {player.maxHp} HP</Text>
                  </View>
                  <Text style={styles.playerPickerChevron}>›</Text>
                </Pressable>
              ))}
              {filteredSavedPlayers.length === 0 && (
                <Text style={styles.playerPickerEmpty}>
                  {savedPlayers.length === 0 ? 'No saved players yet. Create one to reuse it in future battles.' : 'No players match your search.'}
                </Text>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => { setPlayerPickerOpen(false); setPlayerSearch(''); }} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => setAddPlayerOpen(true)} style={styles.confirmButton}>
                <Text style={styles.confirmText}>+ Create Player</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedSavedPlayer(null)}
        transparent
        visible={selectedSavedPlayer !== null}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedSavedPlayer?.name}</Text>
            <Text style={styles.modalSubtitle}>AC {selectedSavedPlayer?.ac} · {selectedSavedPlayer?.maxHp} HP</Text>
            <Text style={styles.fieldLabel}>Initiative roll *</Text>
            <TextInput
              autoFocus
              keyboardType="numbers-and-punctuation"
              onChangeText={setSavedPlayerInitiative}
              placeholder="Enter their total initiative"
              placeholderTextColor={colors.muted}
              style={styles.formInput}
              value={savedPlayerInitiative}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setSelectedSavedPlayer(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Back</Text></Pressable>
              <Pressable onPress={addSelectedPlayer} style={styles.confirmButton}><Text style={styles.confirmText}>Add to Battle</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setAddPlayerOpen(false)}
        transparent
        visible={addPlayerOpen}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Player</Text>
            <Text style={styles.modalSubtitle}>Save this player for future battles and add them now.</Text>
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput autoFocus onChangeText={setPlayerName} placeholder="Player name" placeholderTextColor={colors.muted} style={styles.formInput} value={playerName} />
            <View style={styles.playerNumberRow}>
              <View style={styles.playerNumberField}>
                <Text style={styles.fieldLabel}>Armor class *</Text>
                <TextInput keyboardType="number-pad" onChangeText={setPlayerAc} placeholder="15" placeholderTextColor={colors.muted} style={styles.formInput} value={playerAc} />
              </View>
              <View style={styles.playerNumberField}>
                <Text style={styles.fieldLabel}>Maximum HP *</Text>
                <TextInput keyboardType="number-pad" onChangeText={setPlayerHp} placeholder="24" placeholderTextColor={colors.muted} style={styles.formInput} value={playerHp} />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Initiative roll *</Text>
            <TextInput keyboardType="numbers-and-punctuation" onChangeText={setPlayerInitiative} placeholder="Enter their total initiative" placeholderTextColor={colors.muted} style={styles.formInput} value={playerInitiative} />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddPlayerOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={savePlayer} style={styles.confirmButton}><Text style={styles.confirmText}>Save & Add</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setHealthTargetId(null)}
        transparent
        visible={healthTargetId !== null}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {healthAction === 'damage' ? 'Deal damage' : 'Restore hit points'}
            </Text>
            <Text style={styles.modalSubtitle}>{healthTarget?.name}</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setHealthAmount}
              placeholder="Amount"
              placeholderTextColor={colors.muted}
              style={styles.amountInput}
              value={healthAmount}
            />
            <View style={styles.diceRollRow}>
              <TextInput
                accessibilityLabel="Dice formula"
                onChangeText={(value) => { setDiceFormula(value); setDiceRollResult(null); }}
                placeholder="Roll dice, e.g. 2d6+3"
                placeholderTextColor={colors.muted}
                style={[styles.amountInput, styles.diceFormulaInput]}
                value={diceFormula}
              />
              <Pressable onPress={() => {
                const result = rollDiceFormula(diceFormula);
                if (result === null) {
                  Alert.alert('Invalid dice formula', 'Use a formula such as 2d6+3 or 1d8-1.');
                  return;
                }
                setHealthAmount(String(result)); setDiceRollResult(result);
              }} style={styles.rollDiceButton}>
                <Text style={styles.rollDiceText}>Roll</Text>
              </Pressable>
            </View>
            {diceRollResult !== null ? <Text style={styles.damageNote}>Rolled total: {diceRollResult}</Text> : null}
            {healthAction === 'damage' && (
              <>
                <Text style={styles.fieldLabel}>Damage type (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                  <Pressable
                    onPress={() => setDamageType(null)}
                    style={[styles.typeChip, damageType === null && styles.selectedTypeChip]}
                  >
                    <Text style={styles.typeChipText}>None</Text>
                  </Pressable>
                  {damageTypes.map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setDamageType(type)}
                      style={[styles.typeChip, damageType === type && styles.selectedTypeChip]}
                    >
                      <Text style={styles.typeChipText}>{type}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.damageNote}>
                  Recorded immunities, resistances, and vulnerabilities apply automatically.
                </Text>
              </>
            )}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setHealthTargetId(null)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={updateHealth} style={styles.confirmButton}>
                <Text style={styles.confirmText}>{healthAction === 'damage' ? 'Apply' : 'Heal'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setConditionTargetId(null)}
        transparent
        visible={conditionTargetId !== null}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Conditions</Text>
            <Text style={styles.modalSubtitle}>{conditionTarget?.name} · select all that apply</Text>
            <ScrollView style={styles.conditionChoices}>
              {conditionOptions.map((condition) => {
                const selected = selectedConditions.includes(condition);
                return (
                  <Pressable
                    key={condition}
                    onPress={() => setSelectedConditions((current) => selected
                      ? current.filter((item) => item !== condition)
                      : [...current, condition])}
                    style={[styles.conditionChoice, selected && styles.selectedConditionChoice]}
                  >
                    <Text style={styles.conditionChoiceText}>{condition}</Text>
                    <Text style={styles.conditionCheck}>{selected ? '✓' : '+'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setConditionTargetId(null)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveConditions} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const colors = {
  background: '#171729',
  header: '#292743',
  card: '#29283F',
  border: '#3B3955',
  text: '#F7F6FC',
  muted: '#9997B0',
  pink: '#FF2C67',
  green: '#00B854',
  red: '#FF292F',
  amber: '#FFB000',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.header },
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 43, alignItems: 'center', justifyContent: 'center', position: 'relative',
    backgroundColor: colors.header,
  },
  headerTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  addPlayerButton: { position: 'absolute', top: 8, right: 10, height: 27, paddingHorizontal: 10, borderRadius: 6, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  addPlayerButtonText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  roundHeader: {
    minHeight: 61, paddingHorizontal: 12, paddingVertical: 9,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  roundTitle: { color: colors.text, fontSize: 19, lineHeight: 23, fontWeight: '700' },
  subtleText: { color: colors.muted, fontSize: 11 },
  endButton: {
    backgroundColor: colors.red, borderRadius: 5, paddingHorizontal: 15,
    paddingVertical: 7, minWidth: 44, alignItems: 'center',
  },
  endButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  listContent: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 8, gap: 8 },
  combatantCard: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1,
    borderColor: 'transparent', paddingHorizontal: 10, paddingTop: 9, paddingBottom: 8,
  },
  activeCard: { borderColor: colors.amber },
  cardTopRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7 },
  acBadge: {
    width: 34, height: 34, borderRadius: 9, backgroundColor: '#403E5D',
    alignItems: 'center', justifyContent: 'center',
    borderBottomLeftRadius: 13, borderBottomRightRadius: 13,
  },
  acBadgeLabel: { color: '#B7B4CE', fontSize: 7, lineHeight: 9, fontWeight: '700' },
  acBadgeValue: { color: '#fff', fontSize: 13, lineHeight: 15, fontWeight: '800' },
  combatantDetails: { flex: 1, minWidth: 0, justifyContent: 'center' },
  combatantName: { color: colors.text, fontSize: 12, fontWeight: '600' },
  combatantMeta: { color: colors.muted, fontSize: 9, marginTop: 1 },
  removeButton: { width: 22, height: 27, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.red, fontSize: 22, lineHeight: 25, fontWeight: '300' },
  hpRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4, marginBottom: 6 },
  hpTrack: { height: 7, flex: 1, borderRadius: 6, backgroundColor: '#46445D', overflow: 'hidden' },
  hpFill: { height: '100%', borderRadius: 6, backgroundColor: colors.green },
  hpText: { color: '#C5C3D5', fontSize: 8, minWidth: 49, textAlign: 'right' },
  actionsRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  actionButton: {
    minHeight: 23, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6, borderRadius: 4,
  },
  damageButton: { backgroundColor: colors.red, flex: 1 },
  healButton: { backgroundColor: colors.green, flex: 1 },
  conditionButton: { backgroundColor: '#34324E', flex: 1.2 },
  actionText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  conditionButtonText: { color: '#fff', fontSize: 8, fontWeight: '500' },
  conditionTags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 6 },
  conditionTag: {
    color: '#241B05', backgroundColor: colors.amber, overflow: 'hidden',
    borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2, fontSize: 8, fontWeight: '600',
  },
  turnControls: { flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
  previousButton: {
    width: '34%', minHeight: 38, borderRadius: 8, backgroundColor: '#302F4D',
    alignItems: 'center', justifyContent: 'center',
  },
  previousText: { color: '#E0DEED', fontSize: 12, fontWeight: '600' },
  nextButton: {
    flex: 1, minHeight: 38, borderRadius: 8, backgroundColor: colors.pink,
    alignItems: 'center', justifyContent: 'center',
  },
  nextText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  deathSavePanel: { marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: '#1C1B30' },
  deathSaveHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  deathSaveTitle: { color: colors.text, fontSize: 10, fontWeight: '700' },
  deathSaveCount: { fontSize: 10, fontWeight: '700' },
  successCount: { color: colors.green },
  failureCount: { color: colors.red },
  rollSaveButton: { minHeight: 28, borderRadius: 5, backgroundColor: '#403E5D', alignItems: 'center', justifyContent: 'center' },
  rollSaveText: { color: colors.text, fontSize: 10, fontWeight: '600' },
  deadText: { color: colors.red, marginTop: 7, fontSize: 10, fontWeight: '700' },
  emptyText: { color: colors.muted, textAlign: 'center', padding: 24 },
  emptyPanel: { marginTop: 24, alignItems: 'center', paddingHorizontal: 20, gap: 5 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  stableText: { color: colors.green, marginTop: 7, fontSize: 10, fontWeight: '700' },
  modalScrim: { flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 20 },
  modalCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, maxHeight: '82%',
  },
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  modalSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3, marginBottom: 13 },
  playerSearchInput: { backgroundColor: '#1D1C31', borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontSize: 14, paddingHorizontal: 11, paddingVertical: 9 },
  playerPickerList: { maxHeight: 300, marginTop: 8 },
  playerPickerRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 4 },
  playerPickerInfo: { flex: 1, gap: 3 },
  playerPickerName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  playerPickerMeta: { color: colors.muted, fontSize: 10 },
  playerPickerChevron: { color: colors.pink, fontSize: 24, paddingHorizontal: 6 },
  playerPickerEmpty: { color: colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 18, padding: 18 },
  amountInput: {
    backgroundColor: '#1D1C31', borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, color: colors.text, fontSize: 18, paddingHorizontal: 12, paddingVertical: 10,
  },
  diceRollRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  diceFormulaInput: { flex: 1, fontSize: 13, paddingVertical: 8 },
  rollDiceButton: { borderRadius: 7, backgroundColor: colors.pink, paddingHorizontal: 14, paddingVertical: 10 },
  rollDiceText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  formInput: { backgroundColor: '#1D1C31', borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontSize: 14, paddingHorizontal: 11, paddingVertical: 9 },
  playerNumberRow: { flexDirection: 'row', gap: 9 },
  playerNumberField: { flex: 1 },
  fieldLabel: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  typeScroll: { flexGrow: 0 },
  typeChip: {
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 10, paddingVertical: 6, marginRight: 6,
  },
  selectedTypeChip: { backgroundColor: colors.pink, borderColor: colors.pink },
  typeChipText: { color: colors.text, fontSize: 11 },
  damageNote: { color: colors.muted, fontSize: 10, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  cancelButton: { borderRadius: 7, paddingHorizontal: 15, paddingVertical: 10 },
  cancelText: { color: colors.muted, fontWeight: '600' },
  confirmButton: { borderRadius: 7, backgroundColor: colors.green, paddingHorizontal: 18, paddingVertical: 10 },
  confirmText: { color: '#fff', fontWeight: '700' },
  conditionChoices: { maxHeight: 330 },
  conditionChoice: {
    minHeight: 40, paddingHorizontal: 11, marginVertical: 3, borderRadius: 7,
    backgroundColor: '#1D1C31', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  selectedConditionChoice: { backgroundColor: '#35334F', borderWidth: 1, borderColor: colors.pink },
  conditionChoiceText: { color: colors.text, fontSize: 13 },
  conditionCheck: { color: colors.amber, fontWeight: '800', fontSize: 16 },
});
