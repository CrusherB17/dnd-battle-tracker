export type Combatant = {
  id: string;
  name: string;
  kind: 'Monster' | 'Player';
  ac: number;
  hp: number;
  maxHp: number;
  initiative: number;
  conditions: string[];
  resistances: string[];
  vulnerabilities: string[];
  immunities: string[];
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  isDead: boolean;
};
