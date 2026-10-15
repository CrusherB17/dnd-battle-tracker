import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Combatant } from '../types/Combatant';

type MonsterSummary = {
  index: string;
  name: string;
  url: string;
};

type ArmorClass = number | { type?: string; value: number; desc?: string }[];

type MonsterDetails = MonsterSummary & {
  size?: string;
  type?: string;
  challenge_rating?: number;
  armor_class?: ArmorClass;
  hit_points?: number;
  hit_points_roll?: string;
  alignment?: string;
  damage_resistances?: string[];
  damage_vulnerabilities?: string[];
  damage_immunities?: string[];
  condition_immunities?: { index?: string; name: string; url?: string }[];
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  strength_save?: number;
  dexterity_save?: number;
  constitution_save?: number;
  intelligence_save?: number;
  wisdom_save?: number;
  charisma_save?: number;
  proficiencies?: { proficiency: { name: string }; value: number }[];
  speed?: Record<string, string | number>;
  senses?: Record<string, string | number>;
  languages?: string;
  traits?: MonsterFeature[];
  actions?: MonsterFeature[];
  legendary_actions?: MonsterFeature[];
  reactions?: MonsterFeature[];
  special_abilities?: MonsterFeature[];
  spellcasting?: Record<string, unknown>;
  xp?: number;
  forms?: { name: string; index?: string; url?: string }[];
  image?: string;
  environment?: string[];
  [key: string]: unknown;
  isCustom?: boolean;
};

type MonsterFeature = {
  name: string;
  desc?: string;
  attack_bonus?: number;
  damage?: { damage_type?: { name?: string }; damage_dice?: string }[];
  usage?: { type?: string; times?: number; rest_types?: string[] };
  dc?: { dc_type?: { name?: string }; dc_value?: number; success_type?: string };
  options?: unknown;
  actions?: MonsterFeature[];
  [key: string]: unknown;
};

type CustomMonster = MonsterDetails & {
  id: string;
  isCustom: true;
  url: '';
};

type CatalogMonster = MonsterSummary & { isCustom?: false };
type CatalogEntry = CatalogMonster | CustomMonster;
type RouteName = 'list' | 'details' | 'add';

type MonsterListResponse = { count: number; results: MonsterSummary[] };

const API_ROOT = 'https://www.dnd5eapi.co/api/2014';
const API_HOST = 'https://www.dnd5eapi.co';
const CUSTOM_MONSTERS_KEY = '@dnd-battle-tracker/custom-monsters-v1';
const MONSTER_INDEX_KEY = '@dnd-battle-tracker/monster-index-v1';
const DETAILS_CACHE_KEY = '@dnd-battle-tracker/monster-details-v1';

const toAbsoluteUrl = (url: string) => (
  url.startsWith('http') ? url : `${API_HOST}${url.startsWith('/') ? '' : '/'}${url}`
);

const formatChallengeRating = (rating?: number) => {
  if (rating === undefined || rating === null) return '—';
  const fractions: Record<string, string> = {
    '0.125': '⅛', '0.25': '¼', '0.5': '½',
  };
  return fractions[String(rating)] ?? String(rating);
};

const getArmorClass = (armorClass?: ArmorClass) => {
  if (typeof armorClass === 'number') return armorClass;
  return armorClass?.[0]?.value;
};

const toTraitText = (traits: string[]) => traits.join(', ');
const fromTraitText = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const rollHitPoints = (formula: string): number | null => {
  const match = formula.trim().match(/^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i);
  if (!match) return null;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = Number(match[4] ?? 0) * (match[3] === '-' ? -1 : 1);
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
  let total = modifier;
  for (let die = 0; die < count; die += 1) total += Math.floor(Math.random() * sides) + 1;
  return Math.max(1, total);
};

const parseChallengeRating = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.includes('/')) {
    const [numerator, denominator] = trimmed.split('/').map(Number);
    return denominator ? numerator / denominator : Number.NaN;
  }
  return Number.parseFloat(trimmed);
};

export default function MonstersScreen({ onAddToBattle, isActive }: { onAddToBattle: (monster: Combatant) => void; isActive: boolean }) {
  const [route, setRoute] = useState<RouteName>('list');
  const [monsters, setMonsters] = useState<MonsterSummary[]>([]);
  const [customMonsters, setCustomMonsters] = useState<CustomMonster[]>([]);
  const [detailCache, setDetailCache] = useState<Record<string, MonsterDetails>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMonster, setSelectedMonster] = useState<MonsterDetails | CustomMonster | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [battleModalOpen, setBattleModalOpen] = useState(false);
  const [hpMode, setHpMode] = useState<'default' | 'random'>('default');
  const [battleInitiative, setBattleInitiative] = useState('');

  const [name, setName] = useState('');
  const [size, setSize] = useState('Medium');
  const [type, setType] = useState('');
  const [challengeRating, setChallengeRating] = useState('');
  const [armorClass, setArmorClass] = useState('');
  const [hitPoints, setHitPoints] = useState('');
  const [hitPointsRoll, setHitPointsRoll] = useState('');
  const [resistances, setResistances] = useState('');
  const [vulnerabilities, setVulnerabilities] = useState('');
  const [immunities, setImmunities] = useState('');
  const [optionalData, setOptionalData] = useState<Record<string, string>>({});
  const [traitsDraft, setTraitsDraft] = useState<MonsterFeature[]>([]);
  const [actionsDraft, setActionsDraft] = useState<MonsterFeature[]>([]);
  const [reactionsDraft, setReactionsDraft] = useState<MonsterFeature[]>([]);
  const [legendaryDraft, setLegendaryDraft] = useState<MonsterFeature[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ basics: true });

  useEffect(() => {
    let mounted = true;
    const loadSavedData = async () => {
      try {
        const [savedCustom, savedDetails, savedIndex] = await Promise.all([
          AsyncStorage.getItem(CUSTOM_MONSTERS_KEY),
          AsyncStorage.getItem(DETAILS_CACHE_KEY),
          AsyncStorage.getItem(MONSTER_INDEX_KEY),
        ]);
        if (!mounted) return;
        if (savedCustom) {
          const parsed = JSON.parse(savedCustom) as CustomMonster[];
          if (Array.isArray(parsed)) setCustomMonsters(parsed);
        }
        if (savedDetails) {
          const parsed = JSON.parse(savedDetails) as Record<string, MonsterDetails>;
          if (parsed && typeof parsed === 'object') setDetailCache(parsed);
        }
        if (savedIndex) {
          const parsed = JSON.parse(savedIndex) as MonsterSummary[];
          if (Array.isArray(parsed)) setMonsters(parsed);
        }
      } catch (error) {
        console.warn('Unable to load saved monster data', error);
      }
    };
    void loadSavedData();
    return () => { mounted = false; };
  }, []);

  const loadMonsterList = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_ROOT}/monsters`);
      if (!response.ok) throw new Error(`Monster request failed (${response.status})`);
      const data = await response.json() as MonsterListResponse;
      const results = data.results ?? [];
      setMonsters(results);
      void AsyncStorage.setItem(MONSTER_INDEX_KEY, JSON.stringify(results));
    } catch (error) {
      console.error('Unable to load monsters', error);
      setLoadError('Could not load the D&D 5e SRD catalog. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadMonsterList(); }, []);

  useEffect(() => {
    if (Object.keys(detailCache).length > 0) {
      void AsyncStorage.setItem(DETAILS_CACHE_KEY, JSON.stringify(detailCache));
    }
  }, [detailCache]);

  const cacheDetails = useCallback((index: string, details: MonsterDetails) => {
    setDetailCache((current) => current[index] ? current : { ...current, [index]: details });
  }, []);

  useEffect(() => {
    if (!isActive || route === 'list') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === 'details') {
        setRoute('list');
      } else {
        confirmDiscardAdd();
      }
      return true;
    });
    return () => subscription.remove();
  }, [isActive, route, name, size, type, challengeRating, armorClass, hitPoints, hitPointsRoll, resistances, vulnerabilities, immunities]);

  const entries = useMemo<CatalogEntry[]>(() => [
    ...monsters.map((monster) => ({ ...monster, isCustom: false as const })),
    ...customMonsters,
  ].sort((a, b) => a.name.localeCompare(b.name)), [monsters, customMonsters]);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return entries;
    return entries.filter((monster) => monster.name.toLocaleLowerCase().includes(normalized));
  }, [entries, query]);

  const openMonster = async (entry: CatalogEntry) => {
    setRoute('details');
    setDetailsLoading(!entry.isCustom);
    if (entry.isCustom) {
      setSelectedMonster(entry);
      setDetailsLoading(false);
      return;
    }
    const cached = detailCache[entry.index];
    if (cached) {
      setSelectedMonster(cached);
      setDetailsLoading(false);
      return;
    }
    try {
      const response = await fetch(toAbsoluteUrl(entry.url || `${API_ROOT}/monsters/${entry.index}`));
      if (!response.ok) throw new Error(`Monster detail request failed (${response.status})`);
      const details = await response.json() as MonsterDetails;
      setSelectedMonster(details);
      cacheDetails(entry.index, details);
    } catch (error) {
      console.error('Unable to load monster details', error);
      setSelectedMonster(entry);
      Alert.alert('Could not load monster details', 'Check your connection and try opening this monster again.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const clearAddDraft = () => {
    setName(''); setSize('Medium'); setType(''); setChallengeRating('');
    setArmorClass(''); setHitPoints(''); setHitPointsRoll('');
    setResistances(''); setVulnerabilities(''); setImmunities('');
    setOptionalData({}); setTraitsDraft([]); setActionsDraft([]); setReactionsDraft([]); setLegendaryDraft([]);
    setExpandedSections({ basics: true });
  };

  const confirmDiscardAdd = () => {
    Alert.alert(
      'Leave Add Monster?',
      'Are you sure you want to leave this screen? You will lose all entered data.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => { clearAddDraft(); setRoute('list'); } },
      ],
    );
  };

  const saveCustomMonster = async () => {
    const trimmedName = name.trim();
    const hp = Number.parseInt(hitPoints, 10);
    const ac = Number.parseInt(armorClass, 10);
    const cr = parseChallengeRating(challengeRating);
    if (!trimmedName || !size.trim() || !type.trim() || !Number.isFinite(hp) || hp < 1 || !Number.isFinite(ac) || ac < 0) {
      Alert.alert('Complete the required fields', 'Enter a name, size, type, armor class, and hit points.');
      return;
    }
    let extraApiFields: Record<string, unknown> = {};
    const extraJson = optionalData.additional_json?.trim();
    if (extraJson) {
      try {
        const parsed = JSON.parse(extraJson) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object');
        const protectedKeys = new Set(['index', 'id', 'name', 'url', 'isCustom', 'size', 'type', 'armor_class', 'hit_points']);
        extraApiFields = Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([key]) => !protectedKeys.has(key)));
      } catch {
        Alert.alert('Check additional API data', 'Enter valid JSON as an object, for example: {"environment":["forest"]}.');
        return;
      }
    }
    let spellcasting: Record<string, unknown> | undefined;
    if (optionalData.spellcasting?.trim()) {
      try {
        const parsed = JSON.parse(optionalData.spellcasting) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object');
        spellcasting = parsed as Record<string, unknown>;
      } catch {
        Alert.alert('Check spellcasting data', 'Enter valid JSON as an object, or leave this field blank.');
        return;
      }
    }
    const optionalNumber = (key: string) => optionalData[key]?.trim() ? Number(optionalData[key]) : undefined;
    const parsePairs = (value: string | undefined, numeric = false) => Object.fromEntries(
      (value ?? '').split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
        const [rawKey, ...rawValue] = part.split(':');
        const key = rawKey.trim(); const text = rawValue.join(':').trim();
        return [key, numeric && text && Number.isFinite(Number(text)) ? Number(text) : text];
      }),
    );
    const featureArray = (features: MonsterFeature[]) => features.filter((feature) => feature.name.trim()).map((feature) => ({
      name: feature.name.trim(), desc: feature.desc?.trim() || '',
    }));
    const savePairs = parsePairs(optionalData.saves, true);
    const id = `custom-${Date.now()}`;
    const record: CustomMonster = {
      id, index: id, name: trimmedName, url: '', isCustom: true,
      size: size.trim() || 'Medium', type: type.trim(),
      challenge_rating: Number.isFinite(cr) ? cr : undefined,
      xp: optionalNumber('xp'),
      armor_class: optionalData.armor_type?.trim() ? [{ type: optionalData.armor_type.trim(), value: ac }] : ac,
      hit_points: hp,
      hit_points_roll: hitPointsRoll.trim() || undefined,
      alignment: optionalData.alignment?.trim() || undefined,
      ...Object.fromEntries(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'strength_save', 'dexterity_save', 'constitution_save', 'intelligence_save', 'wisdom_save', 'charisma_save'].map((key) => [key, optionalNumber(key)])),
      ...Object.fromEntries(Object.entries(savePairs).map(([ability, value]) => [`${ability.toLowerCase()}_save`, typeof value === 'number' ? value : Number(value)])),
      speed: parsePairs(optionalData.speed),
      senses: parsePairs(optionalData.senses, true),
      languages: optionalData.languages?.trim() || undefined,
      proficiencies: (optionalData.proficiencies ?? '').split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
        const [proficiencyName, value] = part.split(':').map((item) => item.trim());
        return { proficiency: { name: proficiencyName }, value: Number(value) || 0 };
      }),
      damage_resistances: fromTraitText(resistances), damage_vulnerabilities: fromTraitText(vulnerabilities),
      damage_immunities: fromTraitText(immunities),
      condition_immunities: fromTraitText(optionalData.condition_immunities ?? '').map((label) => ({ index: label.toLowerCase().replace(/\s+/g, '-'), name: label, url: '' })),
      special_abilities: featureArray(traitsDraft), actions: featureArray(actionsDraft),
      reactions: featureArray(reactionsDraft), legendary_actions: featureArray(legendaryDraft),
      ...(spellcasting ? { spellcasting } : {}),
      ...extraApiFields,
    };
    const updated = [...customMonsters, record].sort((a, b) => a.name.localeCompare(b.name));
    try {
      await AsyncStorage.setItem(CUSTOM_MONSTERS_KEY, JSON.stringify(updated));
      setCustomMonsters(updated);
      clearAddDraft();
      setRoute('list');
    } catch (error) {
      console.error('Unable to save custom monster', error);
      Alert.alert('Could not save monster', 'Please try again.');
    }
  };

  const beginAdd = () => {
    clearAddDraft();
    setRoute('add');
  };

  const armorValue = getArmorClass(selectedMonster?.armor_class);
  const abilityScores = selectedMonster ? [
    ['STR', selectedMonster.strength], ['DEX', selectedMonster.dexterity],
    ['CON', selectedMonster.constitution], ['INT', selectedMonster.intelligence],
    ['WIS', selectedMonster.wisdom], ['CHA', selectedMonster.charisma],
  ] as [string, unknown][] : [];
  const openAddToBattle = () => {
    setHpMode('default');
    setBattleInitiative('');
    setBattleModalOpen(true);
  };

  const addSelectedMonsterToBattle = () => {
    if (!selectedMonster) return;
    const initiative = Number.parseInt(battleInitiative, 10);
    const ac = getArmorClass(selectedMonster.armor_class);
    const defaultHp = selectedMonster.hit_points;
    if (!Number.isFinite(initiative) || ac === undefined || defaultHp === undefined) {
      Alert.alert('More monster information needed', 'Enter armor class and hit points before adding this monster to battle.');
      return;
    }
    const hp = hpMode === 'random'
      ? rollHitPoints(selectedMonster.hit_points_roll ?? '')
      : defaultHp;
    if (hp === null) {
      Alert.alert('Hit dice are missing', 'This monster has no hit dice formula, so randomized hit points are unavailable.');
      return;
    }
    const id = `${selectedMonster.index}-${Date.now()}`;
    onAddToBattle({
      id, name: selectedMonster.name, kind: 'Monster', ac, hp, maxHp: hp, initiative,
      conditions: [],
      resistances: selectedMonster.damage_resistances ?? [],
      vulnerabilities: selectedMonster.damage_vulnerabilities ?? [],
      immunities: selectedMonster.damage_immunities ?? [],
      deathSaveSuccesses: 0, deathSaveFailures: 0, isDead: false,
    });
    setBattleModalOpen(false);
    setBattleInitiative('');
    setRoute('list');
  };

  const title = route === 'list' ? 'Monsters' : route === 'details' ? 'Monster Details' : 'Add Monster';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {route !== 'list' ? (
          <Pressable onPress={() => route === 'details' ? setRoute('list') : confirmDiscardAdd()} style={styles.headerSide}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
        ) : <View style={styles.headerSide} />}
        <Text style={styles.headerTitle}>{title}</Text>
        {route === 'list' ? (
          <Pressable accessibilityLabel="Add monster" onPress={beginAdd} style={styles.addIconButton}>
            <Text style={styles.addIcon}>+</Text>
          </Pressable>
        ) : <View style={styles.headerSide} />}
      </View>

      {route === 'list' && (
        <>
          <View style={styles.searchArea}>
            <TextInput
              accessibilityLabel="Search monsters"
              onChangeText={setQuery}
              placeholder="Search monsters"
              placeholderTextColor={palette.muted}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
            <Text style={styles.resultCount}>{filteredEntries.length} monsters</Text>
          </View>
          {loadError && (
            <View style={styles.errorBanner}>
              <Text style={styles.stateText}>{loadError}</Text>
              <Pressable onPress={() => void loadMonsterList()} style={styles.retryButton}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          )}
          {loading && entries.length === 0 ? (
            <View style={styles.statePanel}><Text style={styles.stateText}>Loading monsters…</Text></View>
          ) : (
            <FlatList
              contentContainerStyle={styles.listContent}
              data={filteredEntries}
              keyExtractor={(item) => item.isCustom ? item.id : item.index}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={(
                <View style={styles.statePanel}>
                  <Text style={styles.stateText}>No monsters match “{query}”.</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <MonsterCard
                  entry={item}
                  cachedDetails={item.isCustom ? item : detailCache[item.index]}
                  onDetailsLoaded={cacheDetails}
                  onPress={() => void openMonster(item)}
                />
              )}
            />
          )}
        </>
      )}

      {route === 'details' && (
        <ScrollView contentContainerStyle={styles.detailContent}>
          {detailsLoading ? (
            <View style={styles.statePanel}><Text style={styles.stateText}>Loading monster details…</Text></View>
          ) : selectedMonster ? (
            <>
              <Text style={styles.detailName}>{selectedMonster.name}</Text>
              <Text style={styles.detailClassification}>
                {[selectedMonster.size, selectedMonster.type, selectedMonster.alignment].filter(Boolean).join(' · ') || 'Custom monster'}
              </Text>
              <View style={styles.statGrid}>
                <Stat label="Challenge" value={formatChallengeRating(selectedMonster.challenge_rating)} />
                <Stat label="Armor class" value={armorValue === undefined ? '—' : String(armorValue)} />
                <Stat label="Default HP" value={selectedMonster.hit_points === undefined ? '—' : String(selectedMonster.hit_points)} />
              </View>
              {selectedMonster.xp !== undefined ? <InfoRow label="Experience points" value={String(selectedMonster.xp)} /> : null}
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Ability Scores</Text>
                <View style={styles.abilityGrid}>{abilityScores.map(([label, score]) => (
                  <View key={label} style={styles.abilityCard}>
                    <Text style={styles.abilityLabel}>{label}</Text>
                    <Text style={styles.abilityValue}>{typeof score === 'number' ? score : '—'}</Text>
                    {typeof score === 'number' ? <Text style={styles.abilityMod}>{formatModifier(Math.floor((score - 10) / 2))}</Text> : null}
                  </View>
                ))}</View>
              </View>
              <InfoRow label="Hit dice" value={selectedMonster.hit_points_roll ?? '—'} />
              <InfoRow label="Armor details" value={formatArmorDetails(selectedMonster.armor_class)} />
              <InfoRow label="Speed" value={formatRecord(selectedMonster.speed)} />
              <InfoRow label="Senses" value={formatRecord(selectedMonster.senses)} />
              <InfoRow label="Languages" value={selectedMonster.languages || '—'} />
              <InfoRow label="Saving throws" value={formatSaves(selectedMonster)} />
              <InfoRow label="Skills and proficiencies" value={formatProficiencies(selectedMonster.proficiencies)} />
              <DefenseBlock title="Damage resistances" values={selectedMonster.damage_resistances ?? []} />
              <DefenseBlock title="Damage vulnerabilities" values={selectedMonster.damage_vulnerabilities ?? []} />
              <DefenseBlock title="Damage immunities" values={selectedMonster.damage_immunities ?? []} />
              <DefenseBlock title="Condition immunities" values={(selectedMonster.condition_immunities ?? []).map((item) => item.name)} />
              <FeatureSection title="Traits" features={selectedMonster.special_abilities ?? selectedMonster.traits ?? []} />
              <FeatureSection title="Actions" features={selectedMonster.actions ?? []} />
              <FeatureSection title="Reactions" features={selectedMonster.reactions ?? []} />
              <FeatureSection title="Legendary Actions" features={selectedMonster.legendary_actions ?? []} />
              {selectedMonster.spellcasting ? <DataSection title="Spellcasting" value={selectedMonster.spellcasting} /> : null}
              {selectedMonster.forms?.length ? <InfoRow label="Forms" value={selectedMonster.forms.map((form) => form.name).join(', ')} /> : null}
              {selectedMonster.environment?.length ? <InfoRow label="Environment" value={selectedMonster.environment.join(', ')} /> : null}
              <OtherApiFields monster={selectedMonster} />
              {!selectedMonster.isCustom && (
                <Text style={styles.sourceNote}>D&D 5e System Reference Document</Text>
              )}
              <Pressable onPress={openAddToBattle} style={styles.addToBattleButton}>
                <Text style={styles.saveButtonText}>Add to Battle</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.statePanel}><Text style={styles.stateText}>Monster details are unavailable.</Text></View>
          )}
        </ScrollView>
      )}

      {route === 'add' && (
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.formIntro}>Fields marked * are required. Add a quick combat-ready creature or fill in as much of its stat block as you like.</Text>
          <FormSection title="Basics" expanded={!!expandedSections.basics} onToggle={() => setExpandedSections((current) => ({ ...current, basics: !current.basics }))}>
            <FormField label="Name *" value={name} onChangeText={setName} placeholder="Goblin scout" />
            <FormField label="Size *" value={size} onChangeText={setSize} placeholder="Medium" />
            <FormField label="Creature type *" value={type} onChangeText={setType} placeholder="Humanoid" />
            <FormField label="Alignment" value={optionalData.alignment ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, alignment: value }))} placeholder="Neutral evil" />
            <View style={styles.formRow}>
              <View style={styles.formHalf}><FormField label="Challenge rating" value={challengeRating} onChangeText={setChallengeRating} placeholder="1/4 or 2" keyboardType="decimal-pad" /></View>
              <View style={styles.formHalf}><FormField label="Experience points" value={optionalData.xp ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, xp: value }))} placeholder="50" keyboardType="number-pad" /></View>
            </View>
            <View style={styles.formRow}>
              <View style={styles.formHalf}><FormField label="Armor class *" value={armorClass} onChangeText={setArmorClass} placeholder="15" keyboardType="number-pad" /></View>
              <View style={styles.formHalf}><FormField label="Default HP *" value={hitPoints} onChangeText={setHitPoints} placeholder="7" keyboardType="number-pad" /></View>
            </View>
            <FormField label="Hit dice" value={hitPointsRoll} onChangeText={setHitPointsRoll} placeholder="2d6" />
            <FormField label="Armor class type/details" value={optionalData.armor_type ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, armor_type: value }))} placeholder="Natural armor" />
          </FormSection>

          <FormSection title="Ability Scores and Saves" expanded={!!expandedSections.abilities} onToggle={() => setExpandedSections((current) => ({ ...current, abilities: !current.abilities }))}>
            <View style={styles.formRow}>
              {(['strength', 'dexterity', 'constitution'] as const).map((key) => <View key={key} style={styles.formHalf}><FormField label={`${key.slice(0, 3).toUpperCase()} score`} value={optionalData[key] ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, [key]: value }))} placeholder="10" keyboardType="number-pad" /></View>)}
            </View>
            <View style={styles.formRow}>
              {(['intelligence', 'wisdom', 'charisma'] as const).map((key) => <View key={key} style={styles.formHalf}><FormField label={`${key.slice(0, 3).toUpperCase()} score`} value={optionalData[key] ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, [key]: value }))} placeholder="10" keyboardType="number-pad" /></View>)}
            </View>
            <FormField label="Saving throws (ability: bonus, comma separated)" value={optionalData.saves ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, saves: value }))} placeholder="Dexterity: 5, Wisdom: 3" />
          </FormSection>

          <FormSection title="Movement, Senses and Languages" expanded={!!expandedSections.senses} onToggle={() => setExpandedSections((current) => ({ ...current, senses: !current.senses }))}>
            <FormField label="Speed (type: distance)" value={optionalData.speed ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, speed: value }))} placeholder="walk: 30, fly: 60" />
            <FormField label="Senses (name: value)" value={optionalData.senses ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, senses: value }))} placeholder="darkvision: 60 ft., passive_perception: 12" />
            <FormField label="Languages" value={optionalData.languages ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, languages: value }))} placeholder="Common, Goblin" />
            <FormField label="Skills and proficiencies (name: bonus)" value={optionalData.proficiencies ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, proficiencies: value }))} placeholder="Perception: 4, Stealth: 6" />
          </FormSection>

          <FormSection title="Defenses" expanded={!!expandedSections.defenses} onToggle={() => setExpandedSections((current) => ({ ...current, defenses: !current.defenses }))}>
            <FormField label="Damage resistances" value={resistances} onChangeText={setResistances} placeholder="Fire, Cold" />
            <FormField label="Damage vulnerabilities" value={vulnerabilities} onChangeText={setVulnerabilities} placeholder="Radiant" />
            <FormField label="Damage immunities" value={immunities} onChangeText={setImmunities} placeholder="Poison" />
            <FormField label="Condition immunities" value={optionalData.condition_immunities ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, condition_immunities: value }))} placeholder="Charmed, Frightened" />
          </FormSection>

          <FormSection title="Traits and Actions" expanded={!!expandedSections.features} onToggle={() => setExpandedSections((current) => ({ ...current, features: !current.features }))}>
            <FeatureEditor title="Traits" entries={traitsDraft} onChange={setTraitsDraft} />
            <FeatureEditor title="Actions" entries={actionsDraft} onChange={setActionsDraft} />
            <FeatureEditor title="Reactions" entries={reactionsDraft} onChange={setReactionsDraft} />
            <FeatureEditor title="Legendary actions" entries={legendaryDraft} onChange={setLegendaryDraft} />
          </FormSection>

          <FormSection title="Spellcasting and Other API Data" expanded={!!expandedSections.extra} onToggle={() => setExpandedSections((current) => ({ ...current, extra: !current.extra }))}>
            <FormField label="Spellcasting data (JSON object)" value={optionalData.spellcasting ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, spellcasting: value }))} placeholder={'{"level": 5, "ability": {"name": "Wisdom"}}'} multiline />
            <Text style={styles.apiDataHint}>For advanced or less common fields, add them using the API field names. This can include nested action data such as attack bonuses, damage, and saving throws.</Text>
            <FormField label="Additional API fields (JSON object)" value={optionalData.additional_json ?? ''} onChangeText={(value) => setOptionalData((current) => ({ ...current, additional_json: value }))} placeholder={'{"environment": ["forest"], "proficiency_bonus": 2}'} multiline />
          </FormSection>
          <Pressable onPress={() => void saveCustomMonster()} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save Monster</Text>
          </Pressable>
        </ScrollView>
      )}
      <Modal
        animationType="fade"
        onRequestClose={() => setBattleModalOpen(false)}
        transparent
        visible={battleModalOpen}
      >
        <View style={styles.modalScrim}>
          <View style={styles.battleModal}>
            <Text style={styles.modalTitle}>Add to Battle</Text>
            <Text style={styles.modalSubtitle}>{selectedMonster?.name}</Text>
            <Text style={styles.fieldLabel}>Hit points</Text>
            <Pressable onPress={() => setHpMode('default')} style={styles.choiceRow}>
              <Text style={styles.choiceText}>Use default ({selectedMonster?.hit_points ?? '—'} HP)</Text>
              <Text style={styles.choiceMark}>{hpMode === 'default' ? '●' : '○'}</Text>
            </Pressable>
            {selectedMonster?.hit_points_roll ? (
              <Pressable onPress={() => setHpMode('random')} style={styles.choiceRow}>
                <Text style={styles.choiceText}>Roll hit dice ({selectedMonster.hit_points_roll})</Text>
                <Text style={styles.choiceMark}>{hpMode === 'random' ? '●' : '○'}</Text>
              </Pressable>
            ) : (
              <Text style={styles.modalHint}>No hit dice formula is available for random HP.</Text>
            )}
            <Text style={[styles.fieldLabel, styles.initiativeLabel]}>Initiative *</Text>
            <TextInput
              autoFocus
              keyboardType="number-pad"
              onChangeText={setBattleInitiative}
              placeholder="Enter the initiative roll"
              placeholderTextColor={palette.muted}
              style={styles.fieldInput}
              value={battleInitiative}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setBattleModalOpen(false)} style={styles.cancelModalButton}>
                <Text style={styles.cancelModalText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addSelectedMonsterToBattle} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>Add Monster</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}


function MonsterCard({
  entry, cachedDetails, onDetailsLoaded, onPress,
}: {
  entry: CatalogEntry;
  cachedDetails?: MonsterDetails;
  onDetailsLoaded: (index: string, details: MonsterDetails) => void;
  onPress: () => void;
}) {
  useEffect(() => {
    if (entry.isCustom || cachedDetails) return undefined;
    let active = true;
    const loadSummary = async () => {
      try {
        const response = await fetch(toAbsoluteUrl(entry.url || `${API_ROOT}/monsters/${entry.index}`));
        if (!response.ok) return;
        const details = await response.json() as MonsterDetails;
        if (active) onDetailsLoaded(entry.index, details);
      } catch {
        // The name list stays usable; details can load when the monster is opened.
      }
    };
    void loadSummary();
    return () => { active = false; };
  }, [entry.index, entry.isCustom, entry.url, cachedDetails, onDetailsLoaded]);

  const details = entry.isCustom ? entry : cachedDetails;
  const meta = details
    ? [details.size, details.type, details.challenge_rating !== undefined ? `CR ${formatChallengeRating(details.challenge_rating)}` : null].filter(Boolean).join(' · ')
    : entry.isCustom ? 'Custom monster' : 'D&D 5e SRD';

  return (
    <Pressable onPress={onPress} style={styles.monsterCard}>
      <View style={styles.monsterMark}><Text style={styles.monsterMarkText}>{entry.name.slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.monsterCardText}>
        <Text numberOfLines={1} style={styles.monsterName}>{entry.name}</Text>
        <Text numberOfLines={1} style={styles.monsterMeta}>{meta}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function FormField({
  label, value, onChangeText, placeholder, keyboardType, multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={[styles.fieldInput, multiline && styles.multilineInput]}
        value={value}
      />
    </View>
  );
}

function FormSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.formSection}>
      <Pressable onPress={onToggle} style={styles.formSectionHeader}>
        <Text style={styles.formSectionTitle}>{title}</Text>
        <Text style={styles.formSectionChevron}>{expanded ? '−' : '+'}</Text>
      </Pressable>
      {expanded ? <View style={styles.formSectionContent}>{children}</View> : null}
    </View>
  );
}

function FeatureEditor({ title, entries, onChange }: { title: string; entries: MonsterFeature[]; onChange: (entries: MonsterFeature[]) => void }) {
  const addEntry = () => onChange([...entries, { name: '', desc: '' }]);
  const updateEntry = (index: number, field: 'name' | 'desc', value: string) => onChange(entries.map((entry, itemIndex) => itemIndex === index ? { ...entry, [field]: value } : entry));
  const removeEntry = (index: number) => onChange(entries.filter((_, itemIndex) => itemIndex !== index));
  return (
    <View style={styles.featureEditor}>
      <Text style={styles.fieldLabel}>{title}</Text>
      {entries.map((entry, index) => (
        <View key={`${title}-${index}`} style={styles.featureDraft}>
          <FormField label="Name" value={entry.name} onChangeText={(value) => updateEntry(index, 'name', value)} placeholder="Multiattack" />
          <FormField label="Description" value={entry.desc ?? ''} onChangeText={(value) => updateEntry(index, 'desc', value)} placeholder="Describe the feature" multiline />
          <Pressable accessibilityRole="button" onPress={() => removeEntry(index)} style={styles.removeFeatureButton}><Text style={styles.removeFeatureText}>Remove {title.toLowerCase().replace(/s$/, '')}</Text></Pressable>
        </View>
      ))}
      <Pressable onPress={addEntry} style={styles.addFeatureButton}><Text style={styles.addFeatureText}>+ Add {title.toLowerCase().replace(/s$/, '')}</Text></Pressable>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function DefenseBlock({ title, values }: { title: string; values: string[] }) {
  return (
    <View style={styles.defenseBlock}>
      <Text style={styles.infoLabel}>{title}</Text>
      <Text style={styles.infoValue}>{values.length ? toTraitText(values) : 'None'}</Text>
    </View>
  );
}

function formatModifier(value: number) { return value >= 0 ? `+${value}` : String(value); }

function formatArmorDetails(value?: ArmorClass) {
  if (typeof value === 'number') return String(value);
  if (!value?.length) return '—';
  return value.map((entry) => [entry.value, entry.type, entry.desc].filter(Boolean).join(' · ')).join('; ');
}

function formatRecord(value?: Record<string, unknown>) {
  if (!value || Object.keys(value).length === 0) return '—';
  return Object.entries(value).map(([key, item]) => `${humanize(key)} ${String(item)}`).join(' · ');
}

function formatSaves(monster: MonsterDetails) {
  const saves = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
    .map((ability) => [ability, monster[`${ability}_save`]] as [string, unknown])
    .filter(([, value]) => typeof value === 'number');
  return saves.length ? saves.map(([ability, value]) => `${ability.slice(0, 3).toUpperCase()} ${formatModifier(value as number)}`).join(' · ') : '—';
}

function formatProficiencies(proficiencies?: MonsterDetails['proficiencies']) {
  return proficiencies?.length
    ? proficiencies.map(({ proficiency, value }) => `${proficiency.name} ${formatModifier(value)}`).join(' · ')
    : '—';
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FeatureSection({ title, features }: { title: string; features: MonsterFeature[] }) {
  if (!features.length) return null;
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {features.map((feature, index) => (
        <View key={`${feature.name}-${index}`} style={styles.featureCard}>
          <Text style={styles.featureName}>{feature.name}</Text>
          {feature.desc ? <Text style={styles.featureDescription}>{feature.desc}</Text> : null}
          {feature.attack_bonus !== undefined ? <InfoRow label="Attack bonus" value={formatModifier(feature.attack_bonus)} /> : null}
          {feature.damage?.map((damage, damageIndex) => (
            <InfoRow key={`${feature.name}-damage-${damageIndex}`} label="Damage" value={[damage.damage_dice, damage.damage_type?.name].filter(Boolean).join(' ')} />
          ))}
          {feature.dc ? <InfoRow label="Saving throw" value={`${feature.dc.dc_type?.name ?? 'Ability'} DC ${feature.dc.dc_value ?? '—'}${feature.dc.success_type ? ` (${feature.dc.success_type})` : ''}`} /> : null}
          {feature.usage ? <InfoRow label="Usage" value={`${feature.usage.times ?? ''} ${feature.usage.type ?? ''}${feature.usage.rest_types?.length ? ` (${feature.usage.rest_types.join(', ')})` : ''}`.trim()} /> : null}
          {feature.actions?.length ? feature.actions.map((action, actionIndex) => (
            <View key={`${feature.name}-action-${actionIndex}`} style={styles.nestedFeature}>
              <Text style={styles.featureName}>{action.name}</Text>
              {action.desc ? <Text style={styles.featureDescription}>{action.desc}</Text> : null}
            </View>
          )) : null}
          {feature.options ? <DataSection title="Options" value={feature.options} compact /> : null}
        </View>
      ))}
    </View>
  );
}

function DataSection({ title, value, compact = false }: { title: string; value: unknown; compact?: boolean }) {
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <View style={[styles.sectionBlock, compact && styles.compactSection]}>
      <Text style={styles.infoLabel}>{title}</Text>
      <Text style={styles.rawData}>{content}</Text>
    </View>
  );
}

function OtherApiFields({ monster }: { monster: MonsterDetails }) {
  const knownFields = new Set([
    'index', 'name', 'url', 'isCustom', 'size', 'type', 'alignment', 'challenge_rating', 'armor_class',
    'hit_points', 'hit_points_roll', 'xp', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom',
    'charisma', 'strength_save', 'dexterity_save', 'constitution_save', 'intelligence_save', 'wisdom_save',
    'charisma_save', 'proficiencies', 'speed', 'senses', 'languages', 'damage_resistances',
    'damage_vulnerabilities', 'damage_immunities', 'condition_immunities', 'traits', 'special_abilities',
    'actions', 'reactions', 'legendary_actions', 'spellcasting', 'forms', 'environment',
  ]);
  const fields = Object.entries(monster).filter(([key, value]) => !knownFields.has(key) && value !== undefined && value !== null && value !== '');
  if (!fields.length) return null;
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>Other Details</Text>
      {fields.map(([key, value]) => <DataSection key={key} title={humanize(key)} value={value} compact />)}
    </View>
  );
}

const palette = {
  background: '#171729', header: '#292743', card: '#29283F', border: '#3B3955',
  text: '#F7F6FC', muted: '#9997B0', pink: '#FF2C67', green: '#00B854',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    height: 47, paddingHorizontal: 12, backgroundColor: palette.header,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerSide: { width: 68, justifyContent: 'center' },
  headerTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
  backText: { color: palette.text, fontSize: 13 },
  addIconButton: { width: 36, alignItems: 'flex-end', justifyContent: 'center' },
  addIcon: { color: palette.text, fontSize: 29, fontWeight: '300', lineHeight: 32 },
  searchArea: { paddingHorizontal: 12, paddingTop: 11, paddingBottom: 7 },
  searchInput: {
    minHeight: 40, backgroundColor: '#222137', borderRadius: 9, borderWidth: 1,
    borderColor: palette.border, color: palette.text, paddingHorizontal: 12, fontSize: 14,
  },
  resultCount: { color: palette.muted, fontSize: 10, marginTop: 6 },
  listContent: { paddingHorizontal: 10, paddingBottom: 12, gap: 7 },
  monsterCard: {
    minHeight: 62, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: palette.card, flexDirection: 'row', alignItems: 'center', gap: 9,
  },
  monsterMark: {
    width: 37, height: 37, borderRadius: 10, backgroundColor: '#403E5D',
    alignItems: 'center', justifyContent: 'center',
  },
  monsterMarkText: { color: palette.text, fontSize: 16, fontWeight: '800' },
  monsterCardText: { flex: 1, gap: 3 },
  monsterName: { color: palette.text, fontSize: 13, fontWeight: '700' },
  monsterMeta: { color: palette.muted, fontSize: 10 },
  chevron: { color: palette.muted, fontSize: 24, marginLeft: 3 },
  statePanel: { padding: 22, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateText: { color: palette.muted, fontSize: 13, textAlign: 'center' },
  errorBanner: { marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: '#332737', gap: 8 },
  retryButton: { backgroundColor: palette.pink, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 7 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  detailContent: { padding: 15, paddingBottom: 24, gap: 10 },
  detailName: { color: palette.text, fontSize: 23, fontWeight: '800', marginTop: 4 },
  detailClassification: { color: palette.muted, fontSize: 12, textTransform: 'capitalize' },
  sectionBlock: { marginTop: 5, gap: 7 },
  sectionTitle: { color: palette.text, fontSize: 15, fontWeight: '800', marginTop: 6, borderBottomWidth: 1, borderBottomColor: palette.pink, paddingBottom: 5 },
  abilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  abilityCard: { flexGrow: 1, flexBasis: '30%', alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: palette.card },
  abilityLabel: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  abilityValue: { color: palette.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  abilityMod: { color: palette.pink, fontSize: 11, fontWeight: '700' },
  featureCard: { padding: 10, borderRadius: 9, backgroundColor: palette.card, gap: 4 },
  featureName: { color: palette.text, fontSize: 13, fontWeight: '800' },
  featureDescription: { color: palette.text, fontSize: 12, lineHeight: 18 },
  nestedFeature: { marginTop: 6, paddingLeft: 9, borderLeftWidth: 2, borderLeftColor: palette.pink, gap: 4 },
  rawData: { color: palette.text, fontSize: 11, lineHeight: 16 },
  compactSection: { marginTop: 3, paddingVertical: 4 },
  statGrid: { flexDirection: 'row', gap: 7, marginVertical: 3 },
  statCard: {
    flex: 1, minHeight: 67, padding: 9, borderRadius: 9, backgroundColor: palette.card,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { color: palette.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: palette.muted, fontSize: 9, marginTop: 4, textAlign: 'center' },
  infoRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  infoLabel: { color: palette.muted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  infoValue: { color: palette.text, fontSize: 13, textTransform: 'capitalize' },
  defenseBlock: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  sourceNote: { color: palette.muted, fontSize: 9, marginTop: 12 },
  formContent: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 25 },
  formIntro: { color: palette.muted, fontSize: 12, marginBottom: 7 },
  apiDataHint: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 9 },
  formSection: { marginTop: 9, borderRadius: 9, backgroundColor: '#211F35', borderWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  formSectionHeader: { minHeight: 43, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formSectionTitle: { color: palette.text, fontSize: 13, fontWeight: '800' },
  formSectionChevron: { color: palette.pink, fontSize: 22, fontWeight: '700' },
  formSectionContent: { paddingHorizontal: 10, paddingBottom: 11 },
  featureEditor: { marginTop: 10 },
  featureDraft: { padding: 8, marginTop: 7, borderRadius: 8, backgroundColor: palette.card },
  addFeatureButton: { marginTop: 7, paddingVertical: 9, alignItems: 'center', borderRadius: 7, borderWidth: 1, borderColor: palette.border },
  addFeatureText: { color: palette.pink, fontSize: 12, fontWeight: '700' },
  removeFeatureButton: { alignSelf: 'flex-end', paddingVertical: 5, paddingHorizontal: 7 },
  removeFeatureText: { color: palette.pink, fontSize: 10, fontWeight: '700' },
  fieldGroup: { marginTop: 9 },
  fieldLabel: { color: palette.text, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  fieldInput: {
    minHeight: 40, backgroundColor: '#222137', borderRadius: 8, borderWidth: 1,
    borderColor: palette.border, color: palette.text, paddingHorizontal: 10, fontSize: 13,
  },
  multilineInput: { minHeight: 82, textAlignVertical: 'top', paddingTop: 9 },
  formRow: { flexDirection: 'row', gap: 9 },
  formHalf: { flex: 1 },
  saveButton: { marginTop: 18, minHeight: 43, borderRadius: 8, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  addToBattleButton: { marginTop: 10, minHeight: 43, borderRadius: 8, backgroundColor: palette.pink, alignItems: 'center', justifyContent: 'center' },
  modalScrim: { flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 18 },
  battleModal: { padding: 16, borderRadius: 13, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
  modalTitle: { color: palette.text, fontSize: 18, fontWeight: '800' },
  modalSubtitle: { color: palette.muted, fontSize: 12, marginTop: 3, marginBottom: 13 },
  choiceRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  choiceText: { color: palette.text, fontSize: 12 },
  choiceMark: { color: palette.pink, fontSize: 17 },
  modalHint: { color: palette.muted, fontSize: 10, marginTop: 7 },
  initiativeLabel: { marginTop: 14 },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
  cancelModalButton: { paddingHorizontal: 10, paddingVertical: 10 },
  cancelModalText: { color: palette.muted, fontWeight: '600' },
  saveButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
