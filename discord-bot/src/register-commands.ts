import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Mostra o ranking de ataque da Genesis")
    .addStringOption((opt) =>
      opt.setName("personagem").setDescription("Filtrar por personagem").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("duo")
    .setDescription("Mostra as filas de duo abertas"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log("Registrando comandos...");

    const clientId = process.env.DISCORD_CLIENT_ID!;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (guildId) {
      // Registro instantâneo em um server de teste
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Comandos registrados no guild ${guildId}`);
    } else {
      // Registro global (pode demorar até 1h)
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log("✅ Comandos registrados globalmente");
    }
  } catch (err) {
    console.error(err);
  }
})();
