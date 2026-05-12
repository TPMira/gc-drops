export type AttackRankStats = {
  attack: number;
  critChancePct: number; // ex: 117.52
  critDamagePct: number; // ex: 968.02
  specialAttack: number;
  backAttackDamagePct: number; // ex: 86.90
  runeLevel?: number; // 0, 1 ou 2 (0% de bonus, 5% ou 10% de atk)
};

export type AttackRankEntry = {
  id: string;
  name: string; // nome do jogador
  character?: string;
  stats: AttackRankStats;
  updatedAt?: string;
};

export type AttackRankWeights = {
  specialAttackToAttack: number;
  backAttackWeight: number;
  critWeight: number;
  critChanceCapPct: number;
};

export const DEFAULT_ATTACK_RANK_WEIGHTS: AttackRankWeights = {
  // Como “Ataque Especial” não é 1:1 com Ataque base em muitos jogos,
  // convertemos uma fração dele para o “Ataque efetivo”. Ajuste conforme seu meta.
  specialAttackToAttack: 1, //0.25 significa que 4 de Atq Esp equivalem a 1 de Atq base. Ajuste conforme necessário.

  // Peso do bônus de costas (1.0 = usa 100% do valor informado)
  backAttackWeight: 1.0,

  // Peso do ganho de dano crítico no multiplicador esperado
  critWeight: 1.0,

  // Cap de chance crítica (em %). No seu caso: 120%.
  //Infinyte sem cap
  critChanceCapPct: 120,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Score “DPS-like” usando somente os 5 status que importam.
 *
 * Fórmula (intuição):
 * - Converte Atq Esp para um equivalente de Atk (peso ajustável)
 * - Aplica multiplicador de costas: (1 + back% * peso)
 * - Aplica multiplicador esperado de crítico: 1 + (critChance * (critDamage%))
 *
 * Onde critDamagePct é o “extra” em %, ex: 200% => +2.0 de multiplicador quando crita.
 */
export function computeAttackRankScore(
  stats: AttackRankStats,
  weights: AttackRankWeights = DEFAULT_ATTACK_RANK_WEIGHTS
) {
  const attack = Number(stats.attack) || 0;
  const specialAttack = Number(stats.specialAttack) || 0;
  const backPct = Number(stats.backAttackDamagePct) || 0;
  const critChancePct = Number(stats.critChancePct) || 0;
  const critDamagePct = Number(stats.critDamagePct) || 0;
  const runeLevel = Number(stats.runeLevel) || 0;

  // Bônus de runa de raiva: 0 = 0%, 1 = 5%, 2 = 10%
  const runeBonus = [0, 0.05, 0.1][runeLevel] || 0;

  // Ataque base + ataque especial convertido + bônus de runa
  const baseAttack = (attack + specialAttack * weights.specialAttackToAttack) * (1 + runeBonus);

  // Chance crítica em decimal (0-1), com cap aplicado
  const critRate = clamp(critChancePct, 0, weights.critChanceCapPct) / 100;

  // Dano crítico em decimal
  const critDamage = critDamagePct / 100;

  // Dano por trás em percentual
  const backAttack = backPct;

  // Valor esperado do crítico: prob_crit × bônus_crit
  // Ex: 85% crit + 300% critDmg → ×(1 + 0.85 × 3.0) = ×3.55
  const score = baseAttack * (1 + critRate * critDamage) * (1 + backAttack / 100);

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      baseAttack,
      critRate,
      critDamage,
      backAttack,
      runeBonus,
      critChanceCappedPct: clamp(critChancePct, 0, weights.critChanceCapPct),
    },
  };
}
