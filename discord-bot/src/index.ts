import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";

import { readJson, writeJson } from "./db.js";
import { computeAttackRankScore, type AttackRankEntry } from "./attackRank.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot online como ${c.user.tag}`);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number) {
  return Math.round(n).toLocaleString("pt-BR");
}

function getCharacterEmoji(char?: string): string {
  const emojis: Record<string, string> = {
    "Lupus": "<:emoji_10:1269108359332757575>",
    "Kallia": "<:emoji_1:1269108179728338995>",
    "Holy": "<:emoji_7:1269108303351255101>",
    "Veigas": "<:emoji_5:1269108259101347953>",
    "Rey": "<:emoji_11:1269108378215649301>",
    "Edel": "<:emoji_6:1269108283172458559>",
    "Amy": "<:emoji_17:1269108499799867393>",
    "Arme": "<:emoji_21:1269108598710075533>",
    "Lire": "<:emoji_22:1269108618289221703>",
    "Elesis": "<:emoji_23:1269108634680299600>",
    "Ronan": "<:emoji_18:1269108521329496094>",
    "Lass": "<:emoji_20:1269108572889812992>",
    "Ryan": "<:emoji_19:1269108549024354448>",
    "Jin": "<:emoji_16:1269108477092040817>",
    "Sieghart": "<:emoji_15:1269108458683371612>",
    "Mari": "<:emoji_14:1269108441910345830>",
    "Dio": "<:emoji_13:1269108421307797547>",
    "Zero": "<:emoji_12:1269108395701698702>",
    "Lin": "<:emoji_9:1269108344111763537>",
    "Azin": "<:emoji_8:1269108325434265611>",
    "Iris": "<:iris:1417214462481662053>",
    "Uno": "<:emoji_4:1269108241166766111>",
    "Ai": "<:emoji_2:1269108199756267692>",
    "Decane": "<:emoji_3:1269108219909767289>",
  };
  if (!char) return "👤";
  const normalized = char.charAt(0).toUpperCase() + char.slice(1).toLowerCase();
  return emojis[normalized] ?? "👤";
}

// Carrega a lista de personagens do arquivo JSON
async function loadCharacterList(): Promise<string[]> {
  const chars = ((await readJson("characters.json")) ?? []) as { id: string; name: string }[];
  return chars.map((c) => c.name);
}

function getRankBadge(pos: number): string {
  if (pos === 1) return "👑";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  if (pos <= 5) return "⭐";
  if (pos <= 10) return "🔹";
  return "▫️";
}

type ScoredEntry = AttackRankEntry & { score: number };

function isValidUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function filterBestPerUser(entries: ScoredEntry[]): ScoredEntry[] {
  const bestPerUser = new Map<string, ScoredEntry>();
  for (const entry of entries) {
    const uid = entry.discordUserId || entry.id;
    if (!bestPerUser.has(uid) || entry.score > bestPerUser.get(uid)!.score) {
      bestPerUser.set(uid, entry);
    }
  }
  return Array.from(bestPerUser.values()).sort((a, b) => b.score - a.score);
}

function buildEditModal(entry: AttackRankEntry): ModalBuilder {
  const currentAttacks = `${entry.stats.attackTotal || 0} | ${entry.stats.attackNormal || 0} | ${entry.stats.attackSpecial || 0}`;
  const currentCrits = `${entry.stats.critRate || 0} | ${entry.stats.critDamage || 0}`;
  const currentOthers = `${entry.stats.backAttack || 0} | ${entry.stats.mpPct || 0}`;

  const modal = new ModalBuilder()
    .setCustomId(`rank_modal_edit_${entry.character}_${entry.id}`)
    .setTitle(`Editar: ${entry.character}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("attacks")
        .setLabel("Atk Total | Atk Normal | Atk Especial")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(currentAttacks)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("crits")
        .setLabel("Acerto Crítico % | Dano Crítico %")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(currentCrits)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("others")
        .setLabel("Dano nas Costas % | MP %")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(currentOthers)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("imageUrl")
        .setLabel("URL da Imagem do Personagem")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(entry.characterImageUrl ?? "")
    )
  );

  return modal;
}

function buildRankEmbed(
  entries: (AttackRankEntry & { score: number })[],
  page: number,
  perPage = 5,
  sortBy: string = "score",
  characterFilter?: string,
) {
  const total = entries.length;
  const start = page * perPage;
  const slice = entries.slice(start, start + perPage);

  const color = 0x5865F2;
  let title = `⚔️ RANKING DE ATAQUE`;

  // Adiciona tipo de ordenação ao título
  const sortLabels: Record<string, string> = {
    score: "Score",
    critRate: "Acerto Crítico",
    critDamage: "Dano Crítico",
    backAttack: "Dano nas Costas",
    attackNormal: "Atk Normal",
    attackSpecial: "Atk Especial",
    attackTotal: "Atk Total",
    mpPct: "MP%",
    scoreTotal: "Score Total",
  };
  if (sortBy !== "score" || characterFilter) {
    const parts = [];
    if (sortBy !== "score") parts.push(sortLabels[sortBy] || sortBy);
    if (characterFilter) parts.push(characterFilter);
    title += ` (${parts.join(" | ")})`;
  }

  // Stats gerais
  const topScore = entries[0]?.score ?? 0;
  const avgScore = entries.length > 0 ? entries.reduce((a, b) => a + b.score, 0) / entries.length : 0;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();

  // Header com estatísticas
  const sortInfo = sortBy !== "score" ? `\n📈 Ordenado por: **${sortLabels[sortBy]}**` : "";
  const filterInfo = characterFilter ? `\n🔍 Filtro: **${characterFilter}**` : "";
  const headerStats = [
    `📊 **Estatísticas Gerais**`,
    `┌ 👥 Jogadores: **${total}**`,
    `├ 🏆 Top Score: **${formatNumber(topScore)}**`,
    `└ 📈 Média: **${formatNumber(avgScore)}**`,
    sortInfo + filterInfo,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n");

  // Lista de jogadores
  let playerList = "";
  slice.forEach((e, i) => {
    const pos = start + i + 1;
    const badge = getRankBadge(pos);
    
    const posStr = pos.toString().padStart(2, " ");
    
    // Mostra menção do Discord se tiver
    const discordMention = e.discordUserId ? `<@${e.discordUserId}>` : `**${e.name}**`;
    
    if (sortBy === "scoreTotal") {
      // Score Total: mostra chars do user e score somado
      const chars = (e.character ?? "").split(", ").filter(Boolean);
      const charEmojis = chars.map(c => getCharacterEmoji(c)).join(" ");
      playerList += `\n${badge} **#${posStr}** │ ${discordMention}\n`;
      playerList += `┌ 🎮 Chars (${chars.length}): ${charEmojis}\n`;
      playerList += `├ 📝 ${chars.join(", ")}\n`;
      playerList += `└ 📊 Score Total: **${formatNumber(e.score)}**\n`;
    } else {
      const charEmoji = getCharacterEmoji(e.character);
      playerList += `\n${badge} **#${posStr}** │ ${charEmoji} ${discordMention}\n`;
      playerList += `┌ 🎮 Char: \`${e.character ?? "N/A"}\`\n`;
      playerList += `├ ⚔️ Atk: \`${formatNumber(e.stats.attackTotal)}\` (N: \`${formatNumber(e.stats.attackNormal || 0)}\` | E: \`${formatNumber(e.stats.attackSpecial || 0)}\`)\n`;
      playerList += `├ 🎯 Crit: \`${(e.stats.critRate || 0).toFixed(2)}%\` | Dano: \`${(e.stats.critDamage || 0).toFixed(2)}%\`\n`;
      playerList += `├ 🗡️ Costas: \`${(e.stats.backAttack || 0).toFixed(2)}%\` | MP: \`${(e.stats.mpPct || 0).toFixed(2)}%\`\n`;
      playerList += `└ 📊 Score: **${formatNumber(e.score)}**\n`;
    }
  });

  if (!playerList) playerList = "\n_🕳️ Nenhuma entrada cadastrada ainda._\n";

  embed.setDescription(headerStats + playerList);

  embed.setFooter({ text: "🕐 Atualizado" });

  if (page === 0 && entries.length > 0) {
    const playerForImage = entries[0];
    if (isValidUrl(playerForImage.characterImageUrl)) {
      embed.setImage(playerForImage.characterImageUrl!);
    } else if (isValidUrl(playerForImage.discordAvatarUrl)) {
      embed.setImage(playerForImage.discordAvatarUrl!);
    }
  }

  return embed;
}

async function loadRankEntries(sortBy: string = "score") {
  const raw = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];
  const entries = raw.map((e) => {
    const { score } = computeAttackRankScore(e.stats);
    return { ...e, score };
  });
  
  // Ordenar pelo campo selecionado
  entries.sort((a, b) => {
    switch (sortBy) {
      case "critRate":
        return (b.stats.critRate || 0) - (a.stats.critRate || 0);
      case "critDamage":
        return (b.stats.critDamage || 0) - (a.stats.critDamage || 0);
      case "backAttack":
        return (b.stats.backAttack || 0) - (a.stats.backAttack || 0);
      case "attackNormal":
        return (b.stats.attackNormal || 0) - (a.stats.attackNormal || 0);
      case "attackSpecial":
        return (b.stats.attackSpecial || 0) - (a.stats.attackSpecial || 0);
      case "attackTotal":
        return (b.stats.attackTotal || 0) - (a.stats.attackTotal || 0);
      case "mpPct":
        return (b.stats.mpPct || 0) - (a.stats.mpPct || 0);
      case "score":
      default:
        return b.score - a.score;
    }
  });

  // Se scoreTotal, agrupa por user e retorna entries sintéticas
  if (sortBy === "scoreTotal") {
    const userMap = new Map<string, { entries: typeof entries; totalScore: number }>();
    for (const e of entries) {
      const uid = e.discordUserId || e.id;
      if (!userMap.has(uid)) userMap.set(uid, { entries: [], totalScore: 0 });
      const agg = userMap.get(uid)!;
      agg.entries.push(e);
      agg.totalScore += e.score;
    }

    const aggregated = Array.from(userMap.values()).map((agg) => {
      const best = agg.entries.sort((x, y) => y.score - x.score)[0];
      const charNames = agg.entries.map((e) => e.character).filter(Boolean).join(", ");
      return {
        ...best,
        character: charNames || "N/A",
        score: agg.totalScore,
      };
    });

    return aggregated.sort((a, b) => b.score - a.score);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Helper para gerar componentes (botões + filtro)
// ---------------------------------------------------------------------------

// Componentes para a mensagem pública (sem filtros) - apenas top 10, sem paginação
async function buildRankComponentsPublic() {
  // Linha 1: Botões de ações (sem navegação)
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rank_add`)
      .setLabel("➕ Cadastrar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rank_edit`)
      .setLabel("✏️ Editar")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rank_openfilter`)
      .setLabel("🔍 Filtrar")
      .setStyle(ButtonStyle.Primary)
  );

  return [buttonRow];
}

// Componentes para a mensagem ephemeral (com filtros)
async function buildRankComponentsFiltered(page: number, totalPages: number, sortBy: string = "score", characterFilter?: string, showAll: boolean = true) {
  const characterList = await loadCharacterList();
  
  // Linha 1: Botões de navegação e ações
  // Usa prefixo "rankf_" para indicar que é a view filtrada (ephemeral)
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rankf_prev_${page}_${sortBy}_${characterFilter ?? ""}_${showAll ? "all" : "best"}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`rankf_next_${page}_${sortBy}_${characterFilter ?? ""}_${showAll ? "all" : "best"}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`rankf_toggleview_${sortBy}_${characterFilter ?? ""}_${showAll ? "best" : "all"}`)
      .setLabel(showAll ? "👤 Melhor/Conta" : "👥 Todos")
      .setStyle(showAll ? ButtonStyle.Primary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rank_edit`)
      .setLabel("✏️ Editar")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rank_viewimages`)
      .setLabel("📷 Imagem")
      .setStyle(ButtonStyle.Secondary)
  );

  // Linha 2: Select de ordenação
  const sortOptions = [
    { label: "📊 Score (Padrão)", value: "score", default: sortBy === "score" },
    { label: "🎯 Maior Acerto Crítico", value: "critRate", default: sortBy === "critRate" },
    { label: "💥 Maior Dano Crítico", value: "critDamage", default: sortBy === "critDamage" },
    { label: "🗡️ Maior Dano nas Costas", value: "backAttack", default: sortBy === "backAttack" },
    { label: "⚔️ Maior Atk Normal", value: "attackNormal", default: sortBy === "attackNormal" },
    { label: "✨ Maior Atk Especial", value: "attackSpecial", default: sortBy === "attackSpecial" },
    { label: "⚡ Maior Atk Total", value: "attackTotal", default: sortBy === "attackTotal" },
    { label: "💧 Maior MP%", value: "mpPct", default: sortBy === "mpPct" },
    { label: "🏆 Score Total (Conta)", value: "scoreTotal", default: sortBy === "scoreTotal" },
  ];

  const sortRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rank_sort_${characterFilter ?? ""}_${showAll ? "all" : "best"}`)
      .setPlaceholder("📈 Ordenar por...")
      .addOptions(sortOptions)
  );

  // Linha 3: Select de filtro por personagem
  const filterOptions = [
    { label: "🌐 Todos os Personagens", value: "all", default: !characterFilter },
    ...characterList.map((char) => ({
      label: char,
      value: char.toLowerCase(),
      emoji: getCharacterEmoji(char),
      default: characterFilter === char.toLowerCase(),
    })),
  ];

  const filterRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rank_filter_${sortBy}_${showAll ? "all" : "best"}`)
      .setPlaceholder("🔍 Filtrar por personagem")
      .addOptions(filterOptions.slice(0, 25))
  );

  return [buttonRow, sortRow, filterRow];
}



// ---------------------------------------------------------------------------
// Auto-atualização do embed público
// ---------------------------------------------------------------------------

async function refreshPublicRankMessage(client: Client): Promise<void> {
  const ref = await readJson<{ channelId: string; messageId: string }>("rankMessage.json");
  if (!ref) return;
  try {
    const channel = await client.channels.fetch(ref.channelId);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(ref.messageId);
    const allEntries = await loadRankEntries("score");
    const entries = filterBestPerUser(allEntries);
    const embed = buildRankEmbed(entries, 0, 10, "score");
    const components = await buildRankComponentsPublic();
    await message.edit({ embeds: [embed], components });
  } catch {
    // Mensagem pode ter sido apagada ou bot sem permissão
  }
}

// ---------------------------------------------------------------------------
// Slash Command: /rank
// ---------------------------------------------------------------------------

async function handleRankCommand(interaction: ChatInputCommandInteraction) {
  const allEntries = await loadRankEntries("score");
  const entries = filterBestPerUser(allEntries);
  const embed = buildRankEmbed(entries, 0, 10, "score");
  const components = await buildRankComponentsPublic();

  await interaction.reply({ embeds: [embed], components });

  // Armazena referência da mensagem para auto-atualização
  try {
    const message = await interaction.fetchReply();
    await writeJson("rankMessage.json", { channelId: interaction.channelId, messageId: message.id });
  } catch {
    // Non-critical
  }
}
// ---------------------------------------------------------------------------
// Button handlers
// ---------------------------------------------------------------------------

async function handleRankButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split("_");
  const prefix = parts[0]; // "rank" ou "rankf"
  const action = parts[1];
  let page = parseInt(parts[2] ?? "0", 10) || 0;
  let sortBy = parts[3] || "score";
  let characterFilter: string | undefined = parts[4] || undefined;
  if (characterFilter === "") characterFilter = undefined;

  // Verifica se é a view filtrada (ephemeral)
  const isFilteredView = prefix === "rankf";

  // Extrai showAll do customId para views filtradas
  let showAll = true;
  if (isFilteredView && (action === "prev" || action === "next")) {
    const viewMode = parts[5]; // "all" ou "best"
    showAll = viewMode !== "best";
  }

  if (action === "prev") {
    page = Math.max(0, page - 1);
  } else if (action === "next") {
    page = page + 1;
  } else if (action === "openfilter") {
    // Abrir a versão com filtros (ephemeral) - começa mostrando TODOS
    const entries = await loadRankEntries("score");
    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
    const embed = buildRankEmbed(entries, 0, perPage, "score");
    const components = await buildRankComponentsFiltered(0, totalPages, "score", undefined, true);
    
    await interaction.reply({ 
      content: "🔍 **Modo Filtro** - Mostrando todos os personagens:",
      embeds: [embed], 
      components, 
      ephemeral: true 
    });
    return;
  } else if (action === "toggleview") {
    // Alternar entre mostrar todos ou apenas melhor por conta
    const toggleSortBy = parts[2] || "score";
    const toggleCharFilter = parts[3] || undefined;
    const newViewMode = parts[4]; // "all" ou "best"
    const showAll = newViewMode === "all";
    
    let entries = await loadRankEntries(toggleSortBy);
    
    if (!showAll) {
      entries = filterBestPerUser(entries);
    }
    
    // Aplicar filtro de personagem se existir
    if (toggleCharFilter) {
      entries = entries.filter((e) => e.character?.toLowerCase() === toggleCharFilter);
    }
    
    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
    const embed = buildRankEmbed(entries, 0, perPage, toggleSortBy, toggleCharFilter);
    const components = await buildRankComponentsFiltered(0, totalPages, toggleSortBy, toggleCharFilter, showAll);
    
    const viewText = showAll ? "todos os personagens" : "melhor personagem por conta";
    await interaction.update({ 
      content: `🔍 **Modo Filtro** - Mostrando ${viewText}:`,
      embeds: [embed], 
      components 
    });
    return;
  } else if (action === "viewimages") {
    // Mostrar select menu com jogadores para ver imagem (com paginação)
    // Mostra TODOS os personagens (não filtra por conta) pois está no modo filtro
    const imgPage = parseInt(parts[2] ?? "0", 10) || 0;
    const perPageImg = 25;
    
    const allSorted = await loadRankEntries("score");
    const totalPagesImg = Math.max(1, Math.ceil(allSorted.length / perPageImg));
    const startIdx = imgPage * perPageImg;
    const entries = allSorted.slice(startIdx, startIdx + perPageImg);
    
    if (allSorted.length === 0) {
      await interaction.reply({ content: "❌ Nenhum jogador cadastrado.", ephemeral: true });
      return;
    }
    
    const options = entries.map((e, i) => {
      const globalPos = startIdx + i + 1;
      return {
        label: `#${globalPos} ${e.name}`,
        description: `${e.character} • Score: ${formatNumber(e.score)}`,
        value: e.id,
        emoji: getCharacterEmoji(e.character),
      };
    });

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rank_select_viewimg`)
        .setPlaceholder("📷 Selecione um jogador para ver a imagem")
        .addOptions(options)
    );
    
    // Botões de navegação se tiver mais de 25 jogadores
    const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [selectRow];
    
    if (totalPagesImg > 1) {
      const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`rank_viewimages_${imgPage - 1}`)
          .setLabel("◀ Anterior")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(imgPage === 0),
        new ButtonBuilder()
          .setCustomId(`rank_viewimages_${imgPage + 1}`)
          .setLabel("Próximo ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(imgPage >= totalPagesImg - 1)
      );
      components.push(navRow as any);
    }

    const pageInfo = totalPagesImg > 1 ? `\n📄 Página ${imgPage + 1}/${totalPagesImg} (${allSorted.length} jogadores)` : "";
    
    // Se veio de botão de navegação, usa update; se é primeira vez, usa reply
    if (parts[2] !== undefined) {
      await interaction.update({ 
        content: `📷 **Selecione um jogador para ver a imagem:**${pageInfo}`, 
        components: components as any
      });
    } else {
      await interaction.reply({ 
        content: `📷 **Selecione um jogador para ver a imagem:**${pageInfo}`, 
        components: components as any, 
        ephemeral: true 
      });
    }
    return;
  } else if (action === "add") {
    // Mostrar select menu de personagens
    const characterList = await loadCharacterList();
    const options = characterList.map((char) => ({
      label: char,
      value: char,
      emoji: getCharacterEmoji(char),
    }));

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rank_select_char_add`)
        .setPlaceholder("Escolha o personagem")
        .addOptions(options)
    );

    await interaction.reply({ 
      content: "🎮 **Selecione o personagem para cadastrar:**", 
      components: [selectRow], 
      ephemeral: true 
    });
    return;
  } else if (action === "edit") {
    // Mostrar select menu com os jogadores que O USUÁRIO cadastrou
    const entries = await loadRankEntries();
    const userId = interaction.user.id;
    
    // Filtra só as entradas do usuário
    const userEntries = entries.filter((e) => e.discordUserId === userId);
    
    if (userEntries.length === 0) {
      await interaction.reply({ 
        content: "❌ Você não tem nenhuma entrada cadastrada.\n💡 Use **➕ Cadastrar** para criar a sua!", 
        ephemeral: true 
      });
      return;
    }

    // Se só tem 1 entrada, vai direto pro modal
    if (userEntries.length === 1) {
      await interaction.showModal(buildEditModal(userEntries[0]));
      return;
    }

    // Múltiplas entradas - mostra select para escolher qual editar, depois vai direto pro modal
    const options = userEntries.slice(0, 25).map((e) => {
      // Achar a posição global no ranking
      const globalPos = entries.findIndex((g) => g.id === e.id) + 1;
      return {
        label: `#${globalPos} ${e.character ?? "?"}`,
        description: `Score: ${formatNumber(e.score)}`,
        value: e.id,
        emoji: getCharacterEmoji(e.character),
      };
    });

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rank_select_edit_direct`)
        .setPlaceholder("Selecione sua entrada para editar")
        .addOptions(options)
    );

    await interaction.reply({ 
      content: `✏️ **Suas entradas no ranking (${userEntries.length}):**\nSelecione qual deseja editar:`, 
      components: [selectRow], 
      ephemeral: true 
    });
    return;
  }

  let entries = await loadRankEntries(sortBy);
  
  // Aplicar filtro de personagem se existir
  if (characterFilter) {
    entries = entries.filter((e) => 
      e.character?.toLowerCase() === characterFilter
    );
  }

  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  page = Math.min(page, totalPages - 1);

  const embed = buildRankEmbed(entries, page, perPage, sortBy, characterFilter);

  // Se é a view filtrada (ephemeral) ou tem filtro/ordenação, usa update na ephemeral
  // Se é a mensagem pública (rank_ sem filtros), usa update na pública
  if (isFilteredView || characterFilter || sortBy !== "score") {
    // Se showAll = false, filtra para melhor por conta
    if (!showAll) {
      entries = filterBestPerUser(entries);

      // Aplicar filtro de personagem novamente se existir
      if (characterFilter) {
        entries = entries.filter((e) => e.character?.toLowerCase() === characterFilter);
      }
    }
    
    const filteredTotalPages = Math.max(1, Math.ceil(entries.length / perPage));
    page = Math.min(page, filteredTotalPages - 1);
    const filteredEmbed = buildRankEmbed(entries, page, perPage, sortBy, characterFilter);
    
    const components = await buildRankComponentsFiltered(page, filteredTotalPages, sortBy, characterFilter, showAll);
    const viewText = showAll ? "todos os personagens" : "melhor personagem por conta";
    // Usa update para manter na mesma mensagem ephemeral (paginação funciona)
    await interaction.update({ content: `🔍 **Modo Filtro** - Mostrando ${viewText}:`, embeds: [filteredEmbed], components });
  } else {
    // Mensagem pública - mostra top 10 sem paginação (apenas melhor de cada conta)
    const allEntriesPublic = await loadRankEntries("score");
    const entriesPublic = filterBestPerUser(allEntriesPublic);
    const embedPublic = buildRankEmbed(entriesPublic, 0, 10, "score");
    const components = await buildRankComponentsPublic();
    await interaction.update({ embeds: [embedPublic], components });
  }
}

// ---------------------------------------------------------------------------
// Select menu handler - Ordenação
// ---------------------------------------------------------------------------

async function handleRankSort(interaction: StringSelectMenuInteraction) {
  // customId: rank_sort_CHARACTERFILTER_VIEWMODE
  const parts = interaction.customId.split("_");
  const characterFilter = parts[2] || undefined;
  const viewMode = parts[3] || "all";
  const showAll = viewMode !== "best";
  const sortBy = interaction.values[0];

  let entries = await loadRankEntries(sortBy);
  
  if (!showAll) {
    entries = filterBestPerUser(entries);
  }
  
  // Aplicar filtro de personagem se existir
  if (characterFilter) {
    entries = entries.filter((e) => e.character?.toLowerCase() === characterFilter);
  }

  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));

  const embed = buildRankEmbed(entries, 0, perPage, sortBy, characterFilter);
  const components = await buildRankComponentsFiltered(0, totalPages, sortBy, characterFilter, showAll);

  const viewText = showAll ? "todos os personagens" : "melhor personagem por conta";
  await interaction.update({ content: `🔍 **Modo Filtro** - Mostrando ${viewText}:`, embeds: [embed], components });
}

// ---------------------------------------------------------------------------
// Select menu handler - Filtro por personagem
// ---------------------------------------------------------------------------

async function handleRankFilter(interaction: StringSelectMenuInteraction) {
  // customId: rank_filter_SORTBY_VIEWMODE
  const parts = interaction.customId.split("_");
  const sortBy = parts[2] || "score";
  const viewMode = parts[3] || "all";
  const showAll = viewMode !== "best";
  const selectedValue = interaction.values[0];
  const characterFilter = selectedValue === "all" ? undefined : selectedValue;

  let entries = await loadRankEntries(sortBy);
  
  if (!showAll) {
    entries = filterBestPerUser(entries);
  }
  
  // Aplicar filtro de personagem se existir
  if (characterFilter) {
    entries = entries.filter((e) => e.character?.toLowerCase() === characterFilter);
  }

  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));

  const embed = buildRankEmbed(entries, 0, perPage, sortBy, characterFilter);
  const components = await buildRankComponentsFiltered(0, totalPages, sortBy, characterFilter, showAll);

  const viewText = showAll ? "todos os personagens" : "melhor personagem por conta";
  await interaction.update({ content: `🔍 **Modo Filtro** - Mostrando ${viewText}:`, embeds: [embed], components });
}

// ---------------------------------------------------------------------------
// Select menu handler (escolher personagem ou entrada pra editar)
// ---------------------------------------------------------------------------

async function handleRankSelect(interaction: StringSelectMenuInteraction) {
  const parts = interaction.customId.split("_"); // rank_select_char_add ou rank_select_edit
  const selectType = parts[2]; // "char", "edit" ou "viewimg"
  const selectedValue = interaction.values[0];
  const userId = interaction.user.id;

  if (selectType === "viewimg") {
    // Ver imagem de um jogador específico
    const entries = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];
    const entry = entries.find((e) => e.id === selectedValue);
    
    if (!entry) {
      await interaction.reply({ content: "❌ Jogador não encontrado.", ephemeral: true });
      return;
    }
    
    const imgUrl = entry.characterImageUrl || entry.discordAvatarUrl;
    
    if (!isValidUrl(imgUrl)) {
      await interaction.reply({ 
        content: `❌ **${entry.name}** (${entry.character}) não tem imagem cadastrada.`, 
        ephemeral: true 
      });
      return;
    }
    
    const { score } = computeAttackRankScore(entry.stats);
    
    const embed = new EmbedBuilder()
      .setTitle(`📷 ${entry.name} - ${entry.character}`)
      .setColor(0x5865F2)
      .setDescription([
        `⚔️ Atk: **${formatNumber(entry.stats.attackTotal)}**`,
        `🎯 Crit: **${(entry.stats.critRate || 0).toFixed(2)}%** | Dano: **${(entry.stats.critDamage || 0).toFixed(2)}%**`,
        `🗡️ Costas: **${(entry.stats.backAttack || 0).toFixed(2)}%**`,
        `📊 Score: **${formatNumber(score)}**`,
      ].join("\n"))
      .setImage(imgUrl!)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (selectType === "char") {
    // Selecionou personagem para cadastrar - abre modal
    const character = selectedValue;
    
    // Verificar se já tem esse personagem cadastrado
    const entries = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];
    const duplicate = entries.find((e) => 
      e.discordUserId === userId && 
      e.character?.toLowerCase() === character.toLowerCase()
    );
    
    if (duplicate) {
      await interaction.reply({ 
        content: `❌ Você já tem **${character}** cadastrado! Use o botão **✏️ Editar** para atualizar.`, 
        ephemeral: true 
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`rank_modal_add_${character}`)
      .setTitle(`Cadastrar: ${character}`);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("attacks")
          .setLabel("Atk Total | Atk Normal | Atk Especial")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue("0 | 0 | 0")
          .setPlaceholder("Ex: 11568658 | 5000000 | 6500000")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("crits")
          .setLabel("Acerto Crítico % | Dano Crítico %")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue("0 | 0")
          .setPlaceholder("Ex: 85.50 | 250.75")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("others")
          .setLabel("Dano nas Costas % | MP %")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue("0 | 0")
          .setPlaceholder("Ex: 120.00 | 73.56")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("imageUrl")
          .setLabel("URL da Imagem do Personagem")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("Cole o link da imagem (discord, imgur...)")
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // selectType === "edit" - Edição direta (vai direto pro modal)
  const selectedId = selectedValue;
  const entries = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];
  const entry = entries.find((e) => e.id === selectedId);

  if (!entry) {
    await interaction.reply({ content: "❌ Entrada não encontrada.", ephemeral: true });
    return;
  }

  // Verificar se o usuário é o dono da entrada
  if (entry.discordUserId && entry.discordUserId !== userId) {
    await interaction.reply({ 
      content: "❌ Você só pode editar suas próprias entradas!", 
      ephemeral: true 
    });
    return;
  }

  // Vai direto pro modal com os dados atuais
  await interaction.showModal(buildEditModal(entry));
}

// ---------------------------------------------------------------------------
// Modal submit (cadastrar/editar rank)
// ---------------------------------------------------------------------------

async function handleRankModal(interaction: ModalSubmitInteraction) {
  // rank_modal_add_Mari ou rank_modal_edit_Mari_atk120_123456_789
  const parts = interaction.customId.split("_");
  const action = parts[2]; // "add" ou "edit"
  const character = parts[3]; // Nome do personagem
  // O editId pode conter underscores, então pegamos tudo após parts[3]
  const editId = action === "edit" ? parts.slice(4).join("_") : undefined;

  // Dados do usuário do Discord
  const discordUser = interaction.user;
  const discordUserId = discordUser.id;
  const discordUsername = discordUser.globalName ?? discordUser.username;
  const discordAvatarUrl = discordUser.displayAvatarURL({ size: 256 });

  const name = discordUsername; // Usa o nome do Discord
  
  // Parse campos combinados
  // Campo 1: Atk Total | Atk Normal | Atk Especial
  const attacksRaw = interaction.fields.getTextInputValue("attacks").replace(/,/g, ".");
  const attacksParts = attacksRaw.split("|").map(s => parseFloat(s.trim()) || 0);
  const attackTotal = attacksParts[0] || 0;
  const attackNormal = attacksParts[1] || 0;
  const attackSpecial = attacksParts[2] || 0;
  
  // Campo 2: Acerto Crítico | Dano Crítico
  const critsRaw = interaction.fields.getTextInputValue("crits").replace(/,/g, ".");
  const critsParts = critsRaw.split("|").map(s => parseFloat(s.trim()) || 0);
  const critRate = critsParts[0] || 0;
  const critDamage = critsParts[1] || 0;
  
  // Campo 3: Dano nas Costas | MP
  const othersRaw = interaction.fields.getTextInputValue("others").replace(/,/g, ".");
  const othersParts = othersRaw.split("|").map(s => parseFloat(s.trim()) || 0);
  const backAttack = othersParts[0] || 0;
  const mpPct = othersParts[1] || 0;
  
  // URL da imagem
  let characterImageUrl: string | undefined;
  try {
    characterImageUrl = interaction.fields.getTextInputValue("imageUrl").trim() || undefined;
  } catch { /* campo não existe */ }

  if (characterImageUrl && !isValidUrl(characterImageUrl)) {
    await interaction.reply({
      content: "❌ URL da imagem inválida. Use um link http/https válido (ex: https://i.imgur.com/...).",
      ephemeral: true,
    });
    return;
  }

  if (attackTotal <= 0) {
    await interaction.reply({ content: "❌ Ataque Total é obrigatório (Ataque > 0).", ephemeral: true });
    return;
  }

  const existing = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];

  const stats = { attackTotal, attackNormal, attackSpecial, critRate, critDamage, backAttack, mpPct };
  const { score } = computeAttackRankScore(stats);

  if (action === "edit" && editId) {
    // Editar entrada existente
    const idx = existing.findIndex((e) => e.id === editId);
    if (idx === -1) {
      await interaction.reply({ content: "❌ Entrada não encontrada.", ephemeral: true });
      return;
    }

    // Verificar se o usuário é o dono
    if (existing[idx].discordUserId && existing[idx].discordUserId !== discordUserId) {
      await interaction.reply({ content: "❌ Você só pode editar suas próprias entradas!", ephemeral: true });
      return;
    }

    // Verificar se já tem outro personagem igual (exceto o atual)
    const duplicateChar = existing.find((e) => 
      e.discordUserId === discordUserId && 
      e.character?.toLowerCase() === character.toLowerCase() &&
      e.id !== editId
    );
    if (duplicateChar) {
      await interaction.reply({ 
        content: `❌ Você já tem **${character}** cadastrado! Edite a entrada existente.`, 
        ephemeral: true 
      });
      return;
    }

    existing[idx] = {
      ...existing[idx],
      name,
      character,
      stats,
      updatedAt: new Date().toISOString(),
      discordAvatarUrl,
      // Atualiza imagem se foi fornecida
      ...(characterImageUrl && { characterImageUrl }),
    };

    await writeJson("attackRanks.json", existing);
    refreshPublicRankMessage(interaction.client).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle("✅ Atualizado com sucesso!")
      .setColor(0x57F287)
      .setDescription([
        `**${name}** foi atualizado no ranking!`,
        "",
        `🎮 Personagem: **${character}**`,
        `⚔️ Atk: **${formatNumber(attackTotal)}** (N: ${formatNumber(attackNormal)} | E: ${formatNumber(attackSpecial)})`,
        `🎯 Crit: **${critRate.toFixed(2)}%** | Dano: **${critDamage.toFixed(2)}%**`,
        `🗡️ Costas: **${backAttack.toFixed(2)}%** | MP: **${mpPct.toFixed(2)}%**`,
        "",
        `📊 Score: **${formatNumber(score)}**`,
      ].join("\n"))
      .setTimestamp();

    if (characterImageUrl) {
      embed.setImage(characterImageUrl);
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else {
    // Novo cadastro - verificar se já tem esse personagem
    const duplicateChar = existing.find((e) => 
      e.discordUserId === discordUserId && 
      e.character?.toLowerCase() === character.toLowerCase()
    );
    if (duplicateChar) {
      await interaction.reply({ 
        content: `❌ Você já tem **${character}** cadastrado! Use o botão **✏️ Editar** para atualizar.`, 
        ephemeral: true 
      });
      return;
    }

    // Novo cadastro - vincula ao usuário do Discord
    const entry: AttackRankEntry = {
      id: `atk_${randomUUID()}`,
      name,
      character,
      stats,
      updatedAt: new Date().toISOString(),
      discordUserId,
      discordUsername: name,
      discordAvatarUrl,
      ...(characterImageUrl && { characterImageUrl }),
    };

    existing.push(entry);
    await writeJson("attackRanks.json", existing);
    refreshPublicRankMessage(interaction.client).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle("✅ Cadastrado com sucesso!")
      .setColor(0x57F287)
      .setDescription([
        `**${name}** (${character}) foi adicionado ao ranking!`,
        "",
        `🎮 Personagem: **${character}**`,
        `⚔️ Atk: **${formatNumber(attackTotal)}** (N: ${formatNumber(attackNormal)} | E: ${formatNumber(attackSpecial)})`,
        `🎯 Crit: **${critRate.toFixed(2)}%** | Dano: **${critDamage.toFixed(2)}%**`,
        `🗡️ Costas: **${backAttack.toFixed(2)}%** | MP: **${mpPct.toFixed(2)}%**`,
        "",
        `📊 Score: **${formatNumber(score)}**`,
      ].join("\n"))
      .setFooter({ text: `Vinculado a @${discordUser.username}`, iconURL: discordAvatarUrl })
      .setTimestamp();

    // Se tem imagem, mostra no embed
    if (characterImageUrl) {
      embed.setImage(characterImageUrl);
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

// ---------------------------------------------------------------------------
// Slash Command: /duo
// ---------------------------------------------------------------------------

async function handleDuoCommand(interaction: ChatInputCommandInteraction) {
  const queues = ((await readJson("duoQueues.json")) ?? []) as any[];

  const embed = new EmbedBuilder()
    .setTitle("🎮 FILAS DE DUO — Grand Chase")
    .setColor(0x9B59B6)
    .setTimestamp();

  if (queues.length === 0) {
    embed.setDescription([
      "```",
      "╔════════════════════════════════════╗",
      "║                                    ║",
      "║    📭 Nenhuma fila aberta         ║",
      "║                                    ║",
      "║    Use o site para criar uma!     ║",
      "║                                    ║",
      "╚════════════════════════════════════╝",
      "```",
    ].join("\n"));
    
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const roleEmoji: Record<string, string> = {
    "DPS": "⚔️",
    "SUP": "💚",
    "ANY": "🔄",
  };

  const mapEmoji: Record<string, string> = {
    "Kounat": "🏰",
    "Underworld": "👿",
    "Wizard's Labyrinth": "🔮",
    "Xenia": "⛰️",
    "Alcubra": "🌋",
    "Archimedia": "🏛️",
  };

  // Header
  let desc = [
    "```",
    "╔════════════════════════════════════╗",
    "║     🎯 Encontre seu parceiro!      ║",
    "╚════════════════════════════════════╝",
    "```",
    "",
    `📊 **${queues.length} fila(s) disponível(is)**`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

  // Lista de filas
  queues.slice(0, 8).forEach((q, i) => {
    const roleIcon = roleEmoji[q.lookingFor] ?? "❓";
    const mapIcon = mapEmoji[q.map] ?? "🗺️";
    const charIcon = getCharacterEmoji(q.leader?.character);
    
    desc += `\n\n**${i + 1}. ${q.title}**\n`;
    desc += `┌ ${mapIcon} Mapa: \`${q.map}\`\n`;
    desc += `├ ${charIcon} Líder: **${q.leader?.name ?? "?"}** (${q.leader?.character ?? "?"})\n`;
    desc += `├ ${roleIcon} Procurando: **${q.lookingFor}**\n`;
    if (q.note) {
      desc += `└ 💬 _"${q.note}"_`;
    } else {
      desc += `└ 💬 _Sem observações_`;
    }
  });

  if (queues.length > 8) {
    desc += `\n\n_... e mais ${queues.length - 8} fila(s)_`;
  }

  embed.setDescription(desc);
  
  embed.addFields(
    { name: "⚔️ DPS", value: `${queues.filter(q => q.lookingFor === "DPS").length} filas`, inline: true },
    { name: "💚 SUP", value: `${queues.filter(q => q.lookingFor === "SUP").length} filas`, inline: true },
    { name: "🔄 ANY", value: `${queues.filter(q => q.lookingFor === "ANY").length} filas`, inline: true }
  );

  embed.setFooter({ 
    text: "Acesse o site para criar ou entrar em uma fila",
    iconURL: "https://i.imgur.com/AfFp7pu.png" 
  });

  await interaction.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Event dispatcher
// ---------------------------------------------------------------------------

const REQUIRED_ROLE_ID = "1261427981105106974";

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Verificar se o usuário tem o cargo necessário
    if (interaction.inGuild() && interaction.member) {
      const memberRoles = interaction.member.roles;
      const hasRole = Array.isArray(memberRoles) 
        ? memberRoles.includes(REQUIRED_ROLE_ID)
        : memberRoles.cache.has(REQUIRED_ROLE_ID);
      
      if (!hasRole) {
        if (interaction.isRepliable()) {
          await interaction.reply({ 
            content: "❌ Você não tem permissão para usar este bot.\n🔒 É necessário ter o cargo <@&1261427981105106974> para interagir.", 
            ephemeral: true 
          });
        }
        return;
      }
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "rank") {
        await handleRankCommand(interaction);
      } else if (interaction.commandName === "duo") {
        await handleDuoCommand(interaction);
      }
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith("rank_") || interaction.customId.startsWith("rankf_")) {
        await handleRankButton(interaction);
      }
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("rank_sort")) {
        await handleRankSort(interaction);
      } else if (interaction.customId.startsWith("rank_filter")) {
        await handleRankFilter(interaction);
      } else if (interaction.customId.startsWith("rank_select_")) {
        await handleRankSelect(interaction);
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("rank_modal_")) {
        await handleRankModal(interaction);
      }
    }
  } catch (err) {
    console.error("Erro no handler:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Ocorreu um erro.", ephemeral: true }).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

client.login(process.env.DISCORD_TOKEN);
