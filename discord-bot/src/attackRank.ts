/**
 * Cópia da lógica de attackRank.ts para o bot Discord.
 */

export type AttackRankStats = {
  attackTotal: number;
  attackNormal: number;
  attackSpecial: number;
  critRate: number;
  critDamage: number;
  backAttack: number;
  mpPct: number;
};

export type AttackRankEntry = {
  id: string;
  name: string;
  character?: string;
  stats: AttackRankStats;
  updatedAt?: string;
  // Discord integration
  discordUserId?: string;
  discordUsername?: string;
  discordAvatarUrl?: string;
  // Imagem do personagem
  characterImageUrl?: string;
};

/**
 * Calcula o score baseado nos multiplicadores de dano
 * Fórmula: ((AtkNormal + AtkEspecial) × 0.25) × (1 + CritRate/100) × (1 + CritDmg/100) × (1 + BackAtk/100)
 * OBS: CritRate é limitado a 120% para o cálculo do score
 */
export function computeAttackRankScore(stats: AttackRankStats): { score: number } {
  const attackNormal = Number(stats.attackNormal) || 0;
  const attackSpecial = Number(stats.attackSpecial) || 0;
  const critRateRaw = Number(stats.critRate) || 0;
  const critDamage = Number(stats.critDamage) || 0;
  const backAttack = Number(stats.backAttack) || 0;
  
  // // CritRate limitado a 120% para o score
  // const critRate = Math.min(critRateRaw, 120);

  const critRate = Math.min(critRateRaw, 100); // Não limitar o CritRate para o cálculo do score, conforme feedback dos usuários
  
  // Score = (AtkNormal + AtkEspecial) × 0.25 × multiplicadores
  const baseAttack = (attackNormal + attackSpecial) * 0.25;
  const score = baseAttack 
    * (1 + critRate / 100) 
    * (1 + critDamage / 100) 
    * (1 + backAttack / 100);
  
  return {
    score: Math.round(score * 100) / 100, // 2 casas decimais
  };
}

