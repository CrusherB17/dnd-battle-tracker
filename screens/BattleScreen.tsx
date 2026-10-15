import React, { useEffect, useMemo, useState } from 'react';
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

const startingCombatants: Combatant[] = [
  {
    id: 'brass-dragon', name: 'Adult Brass Dragon 1', kind: 'Monster', ac: 18,
    hp: 145, maxHp: 145, initiative: 15, conditions: [],
    resistances: [], vulnerabilities: [], immunities: [],
    deathSaveSuccesses: 0, deathSaveFailures: 0, isDead: false,
  },
  {
    id: 'sonny', name: 'Sonny', kind: 'Player', ac: 15,
    hp: 15, maxHp: 15, initiative: 12, conditions: ['Charmed', 'Blinded'],
    resistances: [], vulnerabilities: [], immunities: [],
    deathSaveSuccesses: 0, deathSaveFailures: 0, isDead: false,
  },
  {
    id: 'black-dragon', name: 'Adult Black Dragon 1', kind: 'Monster', ac: 19,
    hp: 182, maxHp: 182, initiative: 10, conditions: [],
    resistances: [], vulnerabilities: [], immunities: [],
    deathSaveSuccesses: 0, deathSaveFailures: 0, isDead: false,
  },
];

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

export default function BattleScreen({ incomingMonster }: { incomingMonster: Combatant | null }) {
  const [combatants, setCombatants] = useState(startingCombatants);
  const [activeIndex, setActiveIndex] = useState(2);
  const [round, setRound] = useState(1);
  const [healthTargetId, setHealthTargetId] = useState<string | null>(null);
  const [healthAction, setHealthAction] = useState<HealthAction>('damage');
  const [healthAmount, setHealthAmount] = useState('');
  const [damageType, setDamageType] = useState<DamageType | null>(null);
  const [conditionTargetId, setConditionTargetId] = useState<string | null>(null);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);

  const orderedCombatants = useMemo(
    () => [...combatants].sort((a, b) => b.initiative - a.initiative),
    [combatants],
  );

  useEffect(() => {
    if (!incomingMonster || combatants.some((item) => item.id === incomingMonster.id)) return;
    const activeId = orderedCombatants[activeIndex]?.id;
    const updatedCombatants = [...combatants, incomingMonster];
    const updatedOrder = [...updatedCombatants].sort((a, b) => b.initiative - a.initiative);
    setCombatants(updatedCombatants);
    const preservedActiveIndex = activeId
      ? updatedOrder.findIndex((item) => item.id === activeId)
      : 0;
    setActiveIndex(Math.max(0, preservedActiveIndex));
  }, [incomingMonster, combatants, orderedCombatants, activeIndex]);

  const healthTarget = combatants.find((combatant) => combatant.id === healthTargetId);
  const conditionTarget = combatants.find((combatant) => combatant.id === conditionTargetId);

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
      return {
        ...combatant,
        hp: healthAction === 'damage'
          ? Math.max(0, combatant.hp - effectiveAmount)
          : Math.min(combatant.maxHp, combatant.hp + effectiveAmount),
      };
    }));
    setHealthTargetId(null);
    setHealthAmount('');
    setDamageType(null);
    if (healthAction === 'damage' && healthTarget.kind === 'Player' && healthTarget.hp > 0 && healthTarget.hp - effectiveAmount <= 0) {
      setCombatants((current) => current.map((combatant) => combatant.id === healthTarget.id
        ? { ...combatant, deathSaveSuccesses: 0, deathSaveFailures: 0, isDead: false }
        : combatant));
    }
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
        isDead: failures >= 3,
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
    Alert.alert('End battle?', 'This will reset the round and turn order.', [
      { text: 'Keep battling', style: 'cancel' },
      {
        text: 'End battle', style: 'destructive',
        onPress: () => { setRound(1); setActiveIndex(0); },
      },
    ]);
  };

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
                        <Text style={styles.combatantMeta}>{combatant.kind}</Text>
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
                    {combatant.kind === 'Player' && combatant.hp === 0 && !combatant.isDead && (
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
                <Text style={styles.emptyText}>Add combatants to begin a battle.</Text>
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
              autoFocus
              keyboardType="number-pad"
              onChangeText={setHealthAmount}
              placeholder="Amount"
              placeholderTextColor={colors.muted}
              style={styles.amountInput}
              value={healthAmount}
            />
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
    height: 43, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.header,
  },
  headerTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
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
  modalScrim: { flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 20 },
  modalCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, maxHeight: '82%',
  },
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  modalSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3, marginBottom: 13 },
  amountInput: {
    backgroundColor: '#1D1C31', borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, color: colors.text, fontSize: 18, paddingHorizontal: 12, paddingVertical: 10,
  },
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
