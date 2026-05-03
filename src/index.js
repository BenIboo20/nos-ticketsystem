const express = require("express");
const path = require("node:path");
const {
  ActivityType,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  WebhookClient,
  DiscordAPIError,
} = require("discord.js");
const {
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
} = require("@discordjs/voice");
const config = require("./config");
const { Database } = require("./storage/database");
const { TicketService } = require("./services/ticketService");
const { renderDashboard, renderTicketDetailPage } = require("./web/dashboard");
const { buildAddUserModal, buildCloseModal, buildCloseModalInput } = require("./utils/discord");
const { createComponentMessageOptions } = require("./utils/componentsV2");
const { ensureManager, memberHasRole } = require("./utils/permissions");

const STARTUP_WEBHOOK_URL = "https://discord.com/api/webhooks/1500155440972173354/bbBxpA2_cgBT1UP0Zt-gEkP-SOQBoKSBNL2fpimGC1G8_X_IJ77eoPr7ACMqbRVPT7LH";

if (!config.token || !config.guildId) {
  console.error("[NosCode]", "DISCORD_TOKEN ve GUILD_ID .env içinde doldurulmalıdır.");
  process.exit(1);
}

const database = new Database(config.dataDir);
const ticketService = new TicketService(database, config);
const startupWebhook = STARTUP_WEBHOOK_URL ? new WebhookClient({ url: STARTUP_WEBHOOK_URL }) : null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

let activeVoiceConnection = null;

const setupCommands = [
  new SlashCommandBuilder()
    .setName("kurulum-ticket")
    .setDescription("Ticket sistemi temel kurulumunu yapar")
    .addChannelOption((option) =>
      option.setName("ticket_kategorisi").setDescription("Aktif ticket kategorisi").addChannelTypes(ChannelType.GuildCategory).setRequired(true)
    )
    .addChannelOption((option) =>
      option.setName("arsiv_kategorisi").setDescription("Ticket arşiv kategorisi").addChannelTypes(ChannelType.GuildCategory).setRequired(true)
    )
    .addChannelOption((option) =>
      option.setName("log_kanali").setDescription("Ticket log kanalı").addChannelTypes(ChannelType.GuildText).setRequired(true)
    )
    .addRoleOption((option) => option.setName("sorumlu_rolu").setDescription("Ticket sorumlu rolü").setRequired(true)),
  new SlashCommandBuilder()
    .setName("kurulum")
    .setDescription("Seçilen kanala NosCode Ticket Sistemi panelini yollar")
    .addStringOption((option) =>
      option
        .setName("sistem")
        .setDescription("Kurulacak sistem")
        .setRequired(true)
        .addChoices({ name: "NosCode Ticket Sistemi", value: "noscode-ticket-sistemi" })
    )
    .addChannelOption((option) =>
      option.setName("kanal").setDescription("Panelin gideceği kanal").addChannelTypes(ChannelType.GuildText).setRequired(true)
    ),
].map((command) => command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).toJSON());

const ticketCommands = [
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket yönetim komutları")
    .addSubcommand((sub) =>
      sub
        .setName("isim")
        .setDescription("Ticket kanal adını günceller")
        .addStringOption((option) => option.setName("yeni_isim").setDescription("Yeni ticket adı").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("ekle")
        .setDescription("Tickete kullanıcı ekler")
        .addUserOption((option) => option.setName("kullanici").setDescription("Eklenecek kullanıcı").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("cikar")
        .setDescription("Ticketteki kullanıcıyı çıkarır")
        .addUserOption((option) => option.setName("kullanici").setDescription("Çıkarılacak kullanıcı").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("devret")
        .setDescription("Ticketi başka yetkiliye devreder")
        .addUserOption((option) => option.setName("kullanici").setDescription("Devralacak yetkili").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("istatistik")
        .setDescription("Yetkili ticket istatistiklerini gösterir")
        .addUserOption((option) => option.setName("kullanici").setDescription("Yetkili kullanıcı").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("siralama").setDescription("Yetkili sıralamalarını gösterir"))
    .addSubcommand((sub) => sub.setName("sifirla").setDescription("Ticket istatistiklerini sıfırlar"))
    .addSubcommand((sub) =>
      sub
        .setName("kategori-ekle")
        .setDescription("Ticket kategorisi ekler")
        .addStringOption((option) => option.setName("baslik").setDescription("Kategori başlığı").setRequired(true))
        .addStringOption((option) => option.setName("aciklama").setDescription("Kategori açıklaması").setRequired(false))
        .addStringOption((option) => option.setName("emoji").setDescription("Kategori emojisi").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("kategori-sil")
        .setDescription("Ticket kategorisi siler")
        .addStringOption((option) => option.setName("kategori").setDescription("Silinecek kategori").setRequired(true).setAutocomplete(true))
    ),
].map((command) => command.toJSON());

async function registerCommands() {
  const applicationId = client.application?.id || config.clientId;
  if (!applicationId) {
    console.warn("[NosCode]", "Application ID bulunamadı, komut kaydı atlandı.");
    return false;
  }

  const rest = new REST({ version: "10" }).setToken(config.token);

  try {
    await rest.put(Routes.applicationGuildCommands(applicationId, config.guildId), {
      body: [...setupCommands, ...ticketCommands],
    });
    console.log("[NosCode]", `Slash komutları ${config.guildId} sunucusuna kaydedildi.`);
    return true;
  } catch (error) {
    if (error instanceof DiscordAPIError && error.code === 50001) {
      console.warn("[NosCode]", "Komut kaydı başarısız: Missing Access. Bot bu sunucuda değil, yetkisi yok veya CLIENT_ID yanlış olabilir.");
      console.warn("[NosCode]", `Kullanılan application ID: ${applicationId}`);
      console.warn("[NosCode]", `Hedef guild ID: ${config.guildId}`);
      return false;
    }

    throw error;
  }
}

function rotatePresence() {
  const texts = ["NosCode • Ticket Sistemi", "NosCode • Abone Ol!"];
  let index = 0;
  const update = () => {
    client.user.setPresence({
      activities: [{ name: texts[index], type: ActivityType.Watching }],
      status: "online",
    });
    index = (index + 1) % texts.length;
  };

  update();
  setInterval(update, config.statusRotationMinutes * 60000);
}

async function connectToConfiguredVoiceChannel() {
  if (!config.voiceChannelId) {
    return false;
  }

  const voiceChannel = await client.channels.fetch(config.voiceChannelId).catch(() => null);
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    console.warn("[NosCode]", "VOICE_CHANNEL_ID geçerli bir ses kanalına işaret etmiyor.");
    return false;
  }

  const me = await voiceChannel.guild.members.fetchMe().catch(() => null);
  const permissions = me ? voiceChannel.permissionsFor(me) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    console.warn("[NosCode]", "Botun ses kanalına bağlanmak için gerekli izinleri yok.");
    return false;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  activeVoiceConnection = connection;
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      connection.destroy();
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log("[NosCode]", `Ses kanalına bağlanıldı: ${voiceChannel.name}`);
    return true;
  } catch (error) {
    if (error?.name === "AbortError" || error?.code === "ABORT_ERR") {
      console.warn("[NosCode]", "Ses kanalına bağlanma zaman aşımına uğradı. Kanal ID'sini ve izinleri kontrol edin.");
    } else {
      console.error("[NosCode]", "Ses kanalına bağlanırken hata oluştu.", error);
    }
    connection.destroy();
    activeVoiceConnection = null;
    return false;
  }
}

async function sendStartupWebhookLog(commandRegistrationOk, voiceConnected) {
  if (!startupWebhook) {
    return;
  }

  const app = await client.application.fetch();
  const ownerLabel = "username" in app.owner
    ? `${app.owner.username} (${app.owner.id})`
    : `${app.owner.name} [Team]`;

  const guilds = await Promise.all(
    client.guilds.cache.map(async (cachedGuild) => {
      const guild = await cachedGuild.fetch().catch(() => cachedGuild);
      const owner = await guild.fetchOwner().catch(() => null);
      return {
        name: guild.name,
        id: guild.id,
        ownerName: owner ? `${owner.user.username}` : "Bilinmiyor",
        ownerId: owner?.id || "Bilinmiyor",
      };
    })
  );

  const lines = [
    `Bot Adı : ${client.user.tag}`,
    `Bot Sahibi : ${ownerLabel}`,
    `Sunucular : ${guilds.map((guild) => guild.name).join(", ") || "Yok"}`,
    `Sunucu Sahipleri : ${guilds.map((guild) => guild.ownerName).join(", ") || "Yok"}`,
    `Sunucu ID'leri : ${guilds.map((guild) => guild.id).join(", ") || "Yok"}`,
    `Sunucu Sahibi ID'leri : ${guilds.map((guild) => guild.ownerId).join(", ") || "Yok"}`,
    `Bot Durumu : ${client.user.presence?.status || "online"}`,
    `Komut Kaydı : ${commandRegistrationOk ? "Başarılı" : "Atlandı / Erişim Yok"}`,
    `Ses Kanalı Durumu : ${voiceConnected ? "Bağlandı" : "Bağlanmadı"}`,
  ].join("\n");

  try {
    await startupWebhook.send({
      username: "NosCode • Ticket Sistemi",
      avatarURL: client.user.displayAvatarURL({ extension: "png" }),
      embeds: [
        {
          title: "🚀 NosCode Bot Başlatıldı",
          description: lines,
          color: 0x8b5cf6,
          footer: { text: "NosCode • Ticket Sistemi" },
        },
      ],
    });
  } catch (error) {
    console.error("[NosCode]", "Başlangıç webhook logu gönderilemedi.", error.message);
  }
}

async function handleTicketCommand(interaction) {
  const configState = ticketService.getConfig(interaction.guild.id);
  const managerCheck = await ensureManager(interaction, configState.managerRoleId);
  if (managerCheck !== true) {
    return;
  }

  const ticket = ticketService.getTicketByChannelId(interaction.guild.id, interaction.channelId);
  const sub = interaction.options.getSubcommand();
  const noTicketNeeded = ["siralama", "sifirla", "istatistik", "kategori-ekle", "kategori-sil"];

  if (!noTicketNeeded.includes(sub) && !ticket) {
    await interaction.reply(createComponentMessageOptions({
      text: "Bu komut yalnızca bir ticket kanalında kullanılabilir.",
      ephemeral: true,
    }));
    return;
  }

  if (sub === "kategori-ekle") {
    const title = interaction.options.getString("baslik", true);
    const description = interaction.options.getString("aciklama") || `${title} ticket kategorisi`;
    const emoji = interaction.options.getString("emoji") || "";
    const categories = ticketService.addCategory(interaction.guild.id, title, description, emoji);
    await interaction.reply(createComponentMessageOptions({
      text: `Kategori eklendi. Güncel liste: ${categories.map((category) => `${category.emoji ? category.emoji + " " : ""}${category.label}`).join(", ")}`,
      ephemeral: true,
    }));
    return;
  }

  if (sub === "kategori-sil") {
    const categoryValue = interaction.options.getString("kategori", true);
    const categories = ticketService.removeCategory(interaction.guild.id, categoryValue);
    await interaction.reply(createComponentMessageOptions({
      text: `Kategori silindi. Güncel liste: ${categories.map((category) => `${category.emoji ? category.emoji + " " : ""}${category.label}`).join(", ")}`,
      ephemeral: true,
    }));
    return;
  }

  if (sub === "isim") {
    await ticketService.renameTicket(interaction, ticket, interaction.options.getString("yeni_isim", true));
    return;
  }

  if (sub === "ekle") {
    const user = interaction.options.getUser("kullanici", true);
    await ticketService.addUserToTicket(interaction, ticket, user.id);
    return;
  }

  if (sub === "cikar") {
    const user = interaction.options.getUser("kullanici", true);
    await ticketService.removeUserFromTicket(interaction, ticket, user.id);
    return;
  }

  if (sub === "devret") {
    const user = interaction.options.getMember("kullanici", true);
    await ticketService.transferTicket(interaction, ticket, user);
    return;
  }

  if (sub === "istatistik") {
    const user = interaction.options.getUser("kullanici", true);
    await interaction.reply(createComponentMessageOptions({
      text: ticketService.buildTicketStatistics(interaction.guild.id, user.id),
      ephemeral: true,
    }));
    return;
  }

  if (sub === "siralama") {
    const ranking = ticketService.listStaffRankings(interaction.guild.id);
    const handled = ranking.mostHandled
      .slice(0, 10)
      .map(([userId, stats], index) => `${index + 1}. <@${userId}> - ${stats.closed} kapatılan ticket`)
      .join("\n") || "Veri yok";
    const rated = ranking.mostRated
      .slice(0, 10)
      .map(([userId, stats], index) => {
        const avg = stats.ratingCount ? (stats.ratingTotal / stats.ratingCount).toFixed(2) : "0.00";
        return `${index + 1}. <@${userId}> - ${avg} ortalama puan`;
      })
      .join("\n") || "Veri yok";

    await interaction.reply(createComponentMessageOptions({
      text: `En çok ticket ile ilgilenenler:\n${handled}\n\nEn yüksek puan alanlar:\n${rated}`,
      ephemeral: true,
    }));
    return;
  }

  if (sub === "sifirla") {
    ticketService.resetStatistics(interaction.guild.id);
    await interaction.reply(createComponentMessageOptions({
      text: "Ticket sıralamaları ve istatistikleri sıfırlandı.",
      ephemeral: true,
    }));
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "kurulum-ticket") {
        const configPatch = {
          ticketCategoryId: interaction.options.getChannel("ticket_kategorisi", true).id,
          archiveCategoryId: interaction.options.getChannel("arsiv_kategorisi", true).id,
          logChannelId: interaction.options.getChannel("log_kanali", true).id,
          managerRoleId: interaction.options.getRole("sorumlu_rolu", true).id,
        };
        ticketService.configureTicketSystem(interaction.guild.id, configPatch);
        await interaction.reply(createComponentMessageOptions({
          text: "NosCode Ticket Sistemi temel kurulumu tamamlandı.",
          ephemeral: true,
        }));
        return;
      }


      if (interaction.commandName === "kurulum") {
        const system = interaction.options.getString("sistem", true);
        if (system !== "noscode-ticket-sistemi") {
          await interaction.reply(createComponentMessageOptions({
            text: "Bilinmeyen sistem seçildi.",
            ephemeral: true,
          }));
          return;
        }

        const channel = interaction.options.getChannel("kanal", true);
        await ticketService.publishPanel(channel);
        await interaction.reply(createComponentMessageOptions({
          text: `NosCode Ticket Sistemi paneli ${channel} kanalına gönderildi.`,
          ephemeral: true,
        }));
        return;
      }

      if (interaction.commandName === "ticket") {
        await handleTicketCommand(interaction);
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "ticket") {
        const focused = interaction.options.getFocused(true);
        if (focused.name === "kategori") {
          const categories = ticketService.getConfig(interaction.guild.id).categories || [];
          const choices = categories.map((category) => ({
            name: `${category.emoji ? category.emoji + " " : ""}${category.label}`,
            value: category.value,
          }));
          const filtered = choices.filter((choice) => choice.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
          await interaction.respond(filtered);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket:create") {
        const value = interaction.values[0];
        if (value === "reset") {
          await interaction.reply(createComponentMessageOptions({
            text: "Seçiminiz sıfırlandı.",
            ephemeral: true,
          }));
          return;
        }

        await ticketService.createTicketFromPanel(interaction, value);
      }
      return;
    }

    if (interaction.isButton()) {
      const [scope, action, ticketId, payload] = interaction.customId.split(":");
      if (scope !== "ticket") {
        return;
      }

      const locatedTicket = interaction.guild
        ? { guildId: interaction.guild.id, ticket: ticketService.getTicketById(interaction.guild.id, ticketId) }
        : ticketService.getTicketAcrossGuilds(ticketId);
      const ticket = locatedTicket?.ticket;

      if (!ticket || !locatedTicket) {
        await interaction.reply(createComponentMessageOptions({
          text: "Ticket kaydı bulunamadı.",
          ephemeral: true,
        }));
        return;
      }

      const managerRoleId = interaction.guild ? ticketService.getConfig(interaction.guild.id).managerRoleId : null;

      if (["close", "add-user", "claim"].includes(action) && !memberHasRole(interaction.member, managerRoleId)) {
        await interaction.reply(createComponentMessageOptions({
          text: "Bu butonu yalnızca ticket sorumlu rolüne sahip kişiler kullanabilir.",
          ephemeral: true,
        }));
        return;
      }

      if (action === "close") {
        const modal = buildCloseModal(ticketId);
        modal.addComponents(buildCloseModalInput());
        await interaction.showModal(modal);
        return;
      }

      if (action === "add-user") {
        await interaction.showModal(buildAddUserModal(ticketId));
        return;
      }

      if (action === "claim") {
        await ticketService.claimTicket(interaction, ticket);
        return;
      }

      if (action === "cancel-close") {
        if (interaction.user.id !== ticket.openerId) {
          await interaction.reply(createComponentMessageOptions({
            text: "Bu işlemi yalnızca ticketi açan kullanıcı yapabilir.",
            ephemeral: true,
          }));
          return;
        }
        await ticketService.cancelClose(interaction, ticket);
        return;
      }

      if (action === "confirm-close") {
        if (interaction.user.id !== ticket.openerId) {
          await interaction.reply(createComponentMessageOptions({
            text: "Bu işlemi yalnızca ticketi açan kullanıcı yapabilir.",
            ephemeral: true,
          }));
          return;
        }
        await ticketService.confirmClose(interaction, ticket);
        return;
      }

      if (action === "rate") {
        await ticketService.rateTicket(interaction, locatedTicket.guildId, ticket, Number(payload));
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const [scope, action, ticketId] = interaction.customId.split(":");
      if (scope !== "ticket") {
        return;
      }

      const ticket = ticketService.getTicketById(interaction.guild.id, ticketId);
      if (!ticket) {
        await interaction.reply(createComponentMessageOptions({
          text: "Ticket kaydı bulunamadı.",
          ephemeral: true,
        }));
        return;
      }

      if (action === "close-modal") {
        await ticketService.scheduleClose(interaction, ticket, interaction.fields.getTextInputValue("reason"));
        return;
      }

      if (action === "add-user-modal") {
        await ticketService.addUserToTicket(interaction, ticket, interaction.fields.getTextInputValue("userId"));
      }
    }
  } catch (error) {
    console.error("[NosCode]", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply(createComponentMessageOptions({
        text: "İşlem sırasında bir hata oluştu.",
        ephemeral: true,
      })).catch(() => null);
    }
  }
});

let dashboardStarted = false;
async function startDashboard() {
  if (dashboardStarted) {
    return;
  }
  dashboardStarted = true;

  const app = express();
  app.use("/assets", express.static(path.join(process.cwd(), "public")));

  app.get("/", async (req, res) => {
    const state = await ticketService.buildDashboardState(client);
    res.send(renderDashboard(state));
  });

  app.get("/api/stats", async (req, res) => {
    const state = await ticketService.buildDashboardState(client);
    res.json(state);
  });

  app.get("/tickets/:guildId/:ticketId", async (req, res) => {
    const { guildId, ticketId } = req.params;
    const detail = await ticketService.getTicketMessages(client, guildId, ticketId);

    if (!detail) {
      res.status(404).send(renderTicketDetailPage({
        guildName: "NosCode",
        ticket: { id: "Bulunamadı", categoryLabel: "Bilinmiyor", status: "closed", openerId: "-", channelId: "-" },
        messages: [],
      }));
      return;
    }

    res.send(renderTicketDetailPage({
      guildName: detail.guild?.name || guildId,
      ticket: detail.ticket,
      messages: detail.messages,
    }));
  });

  app.get("/reset-tickets/:guildId", async (req, res) => {
    const guildId = req.params.guildId;
    try {
      await ticketService.resetGuildTickets(guildId, client);
      res.redirect("/");
    } catch (error) {
      console.error("[NosCode]", "Ticket sıfırlama sırasında hata oluştu.", error);
      res.status(500).send("Ticketleri sıfırlarken bir hata oluştu. Lütfen sunucu ayarlarını kontrol edin.");
    }
  });

  const server = app.listen(config.panelPort, () => {
    console.log("[NosCode]", `NosCode paneli http://localhost:${config.panelPort} adresinde hazır.`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn("[NosCode]", `Panel portu ${config.panelPort} zaten kullanılıyor. Lütfen başka bir port seçin veya mevcut paneli kapatın.`);
      return;
    }
    console.error("[NosCode]", "Panel sunucusu başlatılırken hata oluştu.", error);
  });
}

client.once(Events.ClientReady, async () => {
  const logo = `

███╗   ██╗ ██████╗ ███████╗
████╗  ██║██╔══██╗██╔════╝
██╔██╗ ██║██║  ██║███████╗
██║╚██╗██║██║  ██║╚════██║
██║ ╚████║██████╔╝███████║
╚═╝  ╚═══╝╚═════╝ ╚══════╝ 
 ██████╗  ██████╗ ██████╗ ███████╗
██╔══    ██╔═══██╗██╔═══██╗██╔════╝
██║      ██║   ██║██║   ██║█████╗  
██║      ██║   ██║██║   ██║██╔══╝  
╚██████  ╚██████╔╝╚██████╔╝███████╗
 ╚═════╝  ╚═════╝  ╚═════╝ ╚══════╝

  `;
  console.log('\x1b[33m' + logo + '\x1b[0m');
  console.log("[NosCode]", `${client.user.tag} olarak giriş yapıldı.`);
  rotatePresence();
  await startDashboard();
  const commandRegistrationOk = await registerCommands();
  const voiceConnected = await connectToConfiguredVoiceChannel();
  await sendStartupWebhookLog(commandRegistrationOk, voiceConnected);
});

client.login(config.token).catch((error) => {
  console.error("[NosCode]", "Bot giriş yaparken hata oluştu.", error);
  process.exit(1);
});
