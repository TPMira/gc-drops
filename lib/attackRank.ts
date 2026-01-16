export type AttackRankStats = {
  attack: number;
  critChancePct: number; // ex: 117.52
  critDamagePct: number; // ex: 968.02
  specialAttack: number;
  backAttackDamagePct: number; // ex: 86.90
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
  specialAttackToAttack: 0.25,

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

  const effectiveAttack = attack + specialAttack * weights.specialAttackToAttack;

  const backMultiplier = 1 + (backPct / 100) * weights.backAttackWeight;

  const critChance =
    clamp(critChancePct, 0, weights.critChanceCapPct) / 100;

  // Multiplicador esperado: 1 + chanceCrit * (critDamage%/100)
  // Ex: 100% crit, 200% => 1 + 1*2 = 3x
  const critExpectedMultiplier = 1 + critChance * (critDamagePct / 100) * weights.critWeight;

  const score = effectiveAttack * backMultiplier * critExpectedMultiplier;

  return {
    score,
    breakdown: {
      effectiveAttack,
      backMultiplier,
      critExpectedMultiplier,
      critChanceCappedPct: clamp(critChancePct, 0, weights.critChanceCapPct),
    },
  };
}
