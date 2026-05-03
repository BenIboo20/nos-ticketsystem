const {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
} = require("discord.js");
const {
  buildCloseConfirmComponents,
  buildPanelComponents,
  buildRatingComponents,
  buildTicketComponents,
  ensureWebhook,
  sanitizeChannelName,
} = require("../utils/discord");
const {
  diffMinutes,
  formatDateTime,
  futureMinutesLabel,
  humanDurationFromMinutes,
  relativeMinutesLabel,
} = require("../utils/time");
const { createTranscript, fetchChannelMessages } = require("../utils/transcript");
const { createComponentMessageOptions } = require("../utils/componentsV2");

class TicketService {
  constructor(database, config) {
    this.database = database;
    this.config = config;
    this.closeTimeouts = new Map();
  }

  ensureGuild(data, guildId) {
    if (!data.guilds[guildId]) {
      data.guilds[guildId] = {
        config: {
          ticketCategoryId: null,
          archiveCategoryId: null,
          logChannelId: null,
          managerRoleId: null,
          panelChannelId: null,
          panelMessageId: null,
          categories: [
            {
              value: "genel-sorunlar",
              label: "Genel Sorunlar",
              description: "Genel destek ve yardım talepleri",
            },
            {
              value: "diger-kategoriler",
              label: "Diğer Kategoriler",
              description: "Genel dışındaki tüm talepler",
            },
          ],
        },
        stats: {
          opened: 0,
          closed: 0,
        },
        tickets: {},
        staffStats: {},
      };
    }

    return data.guilds[guildId];
  }

  getGuildState(guildId) {
    const data = this.database.read();
    return this.ensureGuild(data, guildId);
  }

  saveGuildState(guildId, updater) {
    let guildState;
    this.database.update((data) => {
      guildState = this.ensureGuild(data, guildId);
      updater(guildState, data);
      return data;
    });
    return guildState;
  }

  getConfig(guildId) {
    return this.getGuildState(guildId).config;
  }

  configureTicketSystem(guildId, configPatch) {
    return this.saveGuildState(guildId, (guildState) => {
      guildState.config = {
        ...guildState.config,
        ...configPatch,
      };
    }).config;
  }

  addCategory(guildId, label, description = null, emoji = "") {
    const value = sanitizeChannelName(label);
    return this.saveGuildState(guildId, (guildState) => {
      const exists = guildState.config.categories.some((category) => category.value === value);
      if (!exists) {
        guildState.config.categories.push({
          label,
          value,
          description: description || `${label} ticket kategorisi`,
          emoji,
        });
      }
    }).config.categories;
  }

  removeCategory(guildId, value) {
    return this.saveGuildState(guildId, (guildState) => {
      guildState.config.categories = guildState.config.categories.filter((category) => category.value !== value);
    }).config.categories;
  }

  createPanelText(guild, config) {
    const categoryLines = config.categories
      .map((category) => `• ${category.emoji ? category.emoji + " " : ""}${category.label}${category.description ? ` — ${category.description}` : ""}`)
      .join("\n");

    return [
      "# NosCode Ticket Sistemi",
      "",
      "Bir destek kategorisi seçerek yeni ticket oluşturabilirsiniz.",
      "",
      "Kategoriler:",
      categoryLines,
      "",
      `Sunucu: ${guild.name}`,
    ].join("\n");
  }

  buildPanelEmbed(guild, config) {
    const categoryLines = config.categories
      .map((category) => `• ${category.emoji ? category.emoji + " " : ""}${category.label}${category.description ? ` — ${category.description}` : ""}`)
      .join("\n") || "Henüz kategori yok.";

    return new EmbedBuilder()
      .setTitle("🎫 NosCode Ticket Sistemi")
      .setDescription([
        "Aşağıdaki menüden bir kategori seçerek yeni bir ticket oluşturabilirsiniz.",
        "",
        categoryLines,
      ].join("\n"))
      .setColor(0x8b5cf6)
      .setFooter({ text: "NosCode • Ticket Sistemi" });
  }

  buildTicketEmbed(ticket, guildState) {
    const category = guildState.config.categories.find((item) => item.value === ticket.categoryValue);
    const categoryLabel = category ? `${category.emoji ? category.emoji + " " : ""}${category.label}` : ticket.categoryLabel;
    const openerTag = `<@${ticket.openerId}>`;
    const ownerLine = ticket.claimedById ? `<@${ticket.claimedById}>` : "Sahiplenilmesi bekleniyor...";
    const managerRoleTag = guildState.config.managerRoleId ? `<@&${guildState.config.managerRoleId}>` : "Ayarlanmamış";

    return new EmbedBuilder()
      .setTitle("📋 Destek Talebiniz Oluşturuldu")
      .setDescription([
        `Merhaba ${openerTag},`,
        "",
        "Destek talebiniz başarıyla oluşturuldu.",
        "Bu kanal yalnızca siz ve yetkili ekip tarafından görüntülenebilir.",
        "",
        "Sorununuzu veya talebinizi detaylı şekilde açıklarsanız ekibimiz size en kısa sürede yardımcı olacaktır.",
        "",
        "📋 Nasıl Destek Alabilirsiniz?",
        "• Sorununuzu tek mesajda ve açık şekilde anlatın.",
        "• Varsa ekran görüntüsü veya kanıt paylaşın.",
        "• Yetkililerin cevap vermesini bekleyin.",
        "",
        "⚠️ Ticket Kuralları",
        "• Saygılı ve düz gün bir dil kullanın.",
        "• Spam veya gereksiz mesaj göndermeyin.",
        "• Reklam veya alakasız konular paylaşmayın.",
        "• Kişisel bilgilerinizi paylaşmayın.",
      ].join("\n"))
      .addFields(
        { name: "👤 Ticket Açan Kullanıcı", value: openerTag, inline: true },
        { name: "🏷️ Ticket Türü", value: categoryLabel, inline: true },
        { name: "📅 Açılma Tarihi", value: formatDateTime(ticket.createdAt), inline: false },
        { name: "📢 Sorumlu Yetkili", value: ownerLine, inline: true },
        { name: "💪 Yetkili Ekibi", value: managerRoleTag, inline: true }
      )
      .setThumbnail(ticket.openerAvatar || "")
      .setFooter({ text: "NosCode • Ticket Sistemi" })
      .setColor(0x8b5cf6);
  }

  async publishPanel(channel) {
    const config = this.getConfig(channel.guild.id);
    const embed = this.buildPanelEmbed(channel.guild, config);
    const message = await channel.send({
      embeds: [embed],
      components: buildPanelComponents(config.categories),
    });

    this.configureTicketSystem(channel.guild.id, {
      panelChannelId: channel.id,
      panelMessageId: message.id,
    });

    return message;
  }

  buildTicketContent(ticket, guildState) {
    const managerRoleTag = guildState.config.managerRoleId ? `<@&${guildState.config.managerRoleId}>` : "Rol ayarlanmamış";
    const openerTag = `<@${ticket.openerId}>`;
    const ownerLine = ticket.claimedById ? `<@${ticket.claimedById}>` : "Sahiplenilmesi bekleniyor...";

    return [
      `${openerTag} ${managerRoleTag}`,
      "",
      "# NosCode Ticket Sistemi",
      `${ticket.categoryLabel} │ Ticket #${ticket.sequence}`,
      "",
      `Merhaba ${openerTag},`,
      "",
      "Destek talebiniz başarıyla oluşturuldu.",
      "Bu kanal yalnızca siz ve yetkili ekip tarafından görüntülenebilir.",
      "",
      "Sorununuzu veya talebinizi detaylı şekilde açıklarsanız ekibimiz size en kısa sürede yardımcı olacaktır.",
      "",
      "📋 Nasıl Destek Alabilirsiniz?",
      "• Sorununuzu tek mesajda ve açık şekilde anlatın.",
      "• Varsa ekran görüntüsü veya kanıt paylaşın.",
      "• Yetkililerin cevap vermesini bekleyin.",
      "",
      "⚠️ Ticket Kuralları",
      "• Saygılı ve düzgün bir dil kullanın.",
      "• Spam veya gereksiz mesaj göndermeyin.",
      "• Reklam veya alakasız konular paylaşmayın.",
      "• Kişisel bilgilerinizi paylaşmayın.",
      "",
      `👤 Ticket Açan Kullanıcı : ${openerTag}`,
      `🏷️ Ticket Türü : ${ticket.categoryLabel}`,
      `📅 Açılma Tarihi : ${formatDateTime(ticket.createdAt)}`,
      `👮‍♂️ Sorumlu Yetkili : ${ownerLine}`,
    ].join("\n");
  }

  buildOpenLog(ticket, channelUrl) {
    return [
      "🎫 # Bir Ticket Açıldı",
      `👤 Ticket Açan Kullanıcı : <@${ticket.openerId}>`,
      `📅 Ticket Açılma Tarihi : ${formatDateTime(ticket.createdAt)}`,
      `⏱️ Ticket Açılma Zamanı : ${relativeMinutesLabel(ticket.createdAt)}`,
      `🔗 Ticket Kanalı Bağlantısı : ${channelUrl}`,
      "📌 Ticket Açılma Sebebi :",
      `\`\`\`${ticket.categoryLabel}\`\`\``,
    ].join("\n");
  }

  ensureStaffStats(guildState, userId) {
    if (!guildState.staffStats[userId]) {
      guildState.staffStats[userId] = {
        claimed: 0,
        closed: 0,
        transferredIn: 0,
        transferredOut: 0,
        ratingTotal: 0,
        ratingCount: 0,
      };
    }

    return guildState.staffStats[userId];
  }

  async createTicketFromPanel(interaction, categoryValue) {
    const guildId = interaction.guild.id;
    const guildState = this.getGuildState(guildId);
    const config = guildState.config;
    const category = config.categories.find((item) => item.value === categoryValue);

    if (!category) {
      await interaction.reply(createComponentMessageOptions({
        text: "Seçilen kategori bulunamadı.",
        ephemeral: true,
      }));
      return null;
    }

    if (!config.ticketCategoryId || !config.managerRoleId) {
      await interaction.reply(createComponentMessageOptions({
        text: "Ticket sistemi henüz tam kurulmamış. Önce /kurulum-ticket komutunu kullanın.",
        ephemeral: true,
      }));
      return null;
    }

    const sequence = guildState.stats.opened + 1;
    const paddedSequence = String(sequence).padStart(4, "0");
    const channelName = `│${paddedSequence}│${sanitizeChannelName(interaction.user.username)}`;
    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
          ],
        },
        {
          id: config.managerRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels,
          ],
        },
      ],
    });

    const ticket = {
      id: `ticket-${channel.id}`,
      channelId: channel.id,
      channelName,
      openerId: interaction.user.id,
      openerAvatar: interaction.user.displayAvatarURL({ extension: "png", size: 128 }),
      categoryValue: category.value,
      categoryLabel: category.label,
      sequence,
      status: "open",
      createdAt: new Date().toISOString(),
      claimedById: null,
      closeRequestedById: null,
      closeReason: null,
      closeRequestedAt: null,
      closingMessageId: null,
      panelMessageId: null,
      addedUsers: [],
      rating: null,
    };

    this.saveGuildState(guildId, (state) => {
      state.stats.opened += 1;
      state.tickets[ticket.id] = ticket;
    });

    const panelMessage = await channel.send({
      embeds: [this.buildTicketEmbed(ticket, this.getGuildState(guildId))],
      components: buildTicketComponents(ticket.id),
    });

    ticket.panelMessageId = panelMessage.id;

    await interaction.reply(createComponentMessageOptions({
      text: `Ticketiniz oluşturuldu: ${channel}`,
      ephemeral: true,
    }));

    await this.sendLog(channel.guild, this.buildOpenLog(ticket, channel.url));
    return ticket;
  }

  getTicketById(guildId, ticketId) {
    return this.getGuildState(guildId).tickets[ticketId] || null;
  }

  getTicketAcrossGuilds(ticketId) {
    const data = this.database.read();
    for (const [guildId, guildState] of Object.entries(data.guilds)) {
      if (guildState.tickets[ticketId]) {
        return { guildId, ticket: guildState.tickets[ticketId] };
      }
    }
    return null;
  }

  getTicketByChannelId(guildId, channelId) {
    return Object.values(this.getGuildState(guildId).tickets).find((ticket) => ticket.channelId === channelId) || null;
  }

  async getTicketMessages(client, guildId, ticketId) {
    const ticket = this.getTicketById(guildId, ticketId);
    if (!ticket) {
      return null;
    }

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return null;
    }

    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return { ticket, channel: null, messages: [], guild };
    }

    const messages = await fetchChannelMessages(channel, 100).catch(() => []);
    return { ticket, channel, messages, guild };
  }

  async claimTicket(interaction, ticket) {
    if (ticket.claimedById) {
      await interaction.reply(createComponentMessageOptions({
        text: "Bu ticket zaten sahiplenildi.",
        ephemeral: true,
      }));
      return;
    }

    this.saveGuildState(interaction.guild.id, (guildState) => {
      guildState.tickets[ticket.id].claimedById = interaction.user.id;
      this.ensureStaffStats(guildState, interaction.user.id).claimed += 1;
    });

    const savedTicket = this.getTicketById(interaction.guild.id, ticket.id);
    const panelMessage = savedTicket.panelMessageId
      ? await interaction.channel.messages.fetch(savedTicket.panelMessageId).catch(() => null)
      : null;

    await interaction.channel.send({
      content: `Merhaba <@${savedTicket.openerId}>, ben <@${interaction.user.id}> size nasıl yardımcı olabilirim? 🙋‍♂️`,
    });

    if (panelMessage) {
      await panelMessage.edit({
        embeds: [this.buildTicketEmbed(savedTicket, this.getGuildState(interaction.guild.id))],
        components: buildTicketComponents(savedTicket.id),
      }).catch(() => null);
    }

    const opener = await interaction.client.users.fetch(savedTicket.openerId).catch(() => null);
    if (opener) {
      await opener.send({
        content: [
          `Merhaba <@${savedTicket.openerId}>,`,
          "Ticketinizi bir yetkili sahiplendi.",
          "",
          `Ticket Türü : ${savedTicket.categoryLabel}`,
          `Sahiplenen Yetkili : <@${interaction.user.id}>`,
          `Ticket Kanalı : ${interaction.channel.url}`,
        ].join("\n"),
      }).catch(() => null);
    }

    await interaction.reply({
      content: "Ticket başarıyla sahiplenildi.",
      ephemeral: true,
    });

    await this.sendLog(interaction.guild, [
      "✅ # Bir Ticket Sahiplenildi",
      `👮‍♂️ Sahiplenen Yetkili : <@${interaction.user.id}>`,
      `👤 Ticket Açan Kullanıcı : <@${savedTicket.openerId}>`,
      `📅 Ticket Açılma Tarihi : ${formatDateTime(savedTicket.createdAt)}`,
      `⏱️ Ticket Açılma Zamanı : ${relativeMinutesLabel(savedTicket.createdAt)}`,
      `⏳ Sahiplenme Süresi : ${diffMinutes(savedTicket.createdAt)} dakika`,
      `🔗 Ticket Kanalı : ${interaction.channel.url}`,
      "📌 Ticket Türü :",
      `\`\`\`${savedTicket.categoryLabel}\`\`\``,
    ].join("\n"));
  }

  async addUserToTicket(interaction, ticket, userId) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await interaction.reply(createComponentMessageOptions({
        text: "Bu ID ile bir kullanıcı bulunamadı.",
        ephemeral: true,
      }));
      return;
    }

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    this.saveGuildState(interaction.guild.id, (guildState) => {
      const target = guildState.tickets[ticket.id];
      if (!target.addedUsers.includes(member.id)) {
        target.addedUsers.push(member.id);
      }
    });

    await interaction.reply(createComponentMessageOptions({
      text: "Kullanıcı ticket kanalına eklendi.",
      ephemeral: true,
    }));

    await interaction.channel.send(createComponentMessageOptions({
      text: `<@${interaction.user.id}> tarafından ${member} ticket kanalına eklendi!`,
    }));

    await this.sendLog(interaction.guild, [
      "👥 # Ticket Kanalına Kullanıcı Eklendi",
      `👮‍♂️ Yetkili : <@${interaction.user.id}>`,
      `👤 Eklenen Kullanıcı : <@${member.id}>`,
      `🧾 Ticket Açan Kullanıcı : <@${ticket.openerId}>`,
      `⏰ İşlem Zamanı : ${relativeMinutesLabel(new Date())}`,
      `🔗 Ticket Kanalı : ${interaction.channel.url}`,
      "📌 Ticket Türü :",
      `\`\`\`${ticket.categoryLabel}\`\`\``,
    ].join("\n"));
  }

  async removeUserFromTicket(interaction, ticket, userId) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await interaction.reply(createComponentMessageOptions({
        text: "Bu ID ile bir kullanıcı bulunamadı.",
        ephemeral: true,
      }));
      return;
    }

    await interaction.channel.permissionOverwrites.delete(member.id).catch(() => null);

    this.saveGuildState(interaction.guild.id, (guildState) => {
      guildState.tickets[ticket.id].addedUsers = guildState.tickets[ticket.id].addedUsers.filter((id) => id !== member.id);
    });

    await interaction.reply(createComponentMessageOptions({
      text: "Kullanıcı ticket kanalından çıkarıldı.",
      ephemeral: true,
    }));

    await interaction.channel.send(createComponentMessageOptions({
      text: `<@${interaction.user.id}> tarafından ${member} ticket kanalından çıkarıldı!`,
    }));

    await this.sendLog(interaction.guild, [
      "🚫 # Tickettan Kullanıcı Çıkartıldı",
      `👮‍♂️ Yetkili : <@${interaction.user.id}>`,
      `👤 Çıkarılan Kullanıcı : <@${member.id}>`,
      `🧾 Ticket Açan Kullanıcı : <@${ticket.openerId}>`,
      `⏰ İşlem Zamanı : ${relativeMinutesLabel(new Date())}`,
      `🔗 Ticket Kanalı : ${interaction.channel.url}`,
      "📌 Ticket Türü :",
      `\`\`\`${ticket.categoryLabel}\`\`\``,
    ].join("\n"));
  }

  async renameTicket(interaction, ticket, newName) {
    const oldName = interaction.channel.name;
    const safeName = sanitizeChannelName(newName);
    await interaction.channel.setName(safeName);

    await interaction.reply(createComponentMessageOptions({
      text: `Ticket ismi güncellendi: ${safeName}`,
      ephemeral: true,
    }));

    await this.sendLog(interaction.guild, [
      "✏️ # Ticket Kanal İsmi Güncellendi",
      `👮‍♂️ Yetkili : <@${interaction.user.id}>`,
      `📛 Eski İsim : ${oldName}`,
      `✅ Yeni İsim : ${safeName}`,
      `🔗 Ticket Kanalı : ${interaction.channel.url}`,
    ].join("\n"));
  }

  async transferTicket(interaction, ticket, member) {
    if (!ticket.claimedById) {
      await interaction.reply(createComponentMessageOptions({
        text: "Devretmeden önce bu ticketin sahiplenilmiş olması gerekiyor.",
        ephemeral: true,
      }));
      return;
    }

    if (ticket.claimedById === member.id) {
      await interaction.reply(createComponentMessageOptions({
        text: "Bu kullanıcı zaten ticket sahibi.",
        ephemeral: true,
      }));
      return;
    }

    const previousOwner = ticket.claimedById;
    this.saveGuildState(interaction.guild.id, (guildState) => {
      guildState.tickets[ticket.id].claimedById = member.id;
      this.ensureStaffStats(guildState, member.id).transferredIn += 1;
      this.ensureStaffStats(guildState, previousOwner).transferredOut += 1;
    });

    await interaction.reply(createComponentMessageOptions({
      text: `Ticket başarıyla ${member} kullanıcısına devredildi.`,
      ephemeral: true,
    }));

    await this.sendLog(interaction.guild, [
      "🔄 # Ticket Devredildi",
      `👮‍♂️ Eski Sahip : <@${previousOwner}>`,
      `👤 Yeni Sahip : <@${member.id}>`,
      `🎫 Ticket Açan Kullanıcı : <@${ticket.openerId}>`,
      `📅 Açılma Tarihi : ${formatDateTime(ticket.createdAt)}`,
      `⏱️ Açılma Zamanı : ${relativeMinutesLabel(ticket.createdAt)}`,
      `🔗 Ticket Kanalı : ${interaction.channel.url}`,
      "📌 Ticket Türü :",
      `\`\`\`${ticket.categoryLabel}\`\`\``,
    ].join("\n"));
  }

  async scheduleClose(interaction, ticket, reason) {
    const closeAt = Date.now() + 5 * 60000;

    this.saveGuildState(interaction.guild.id, (guildState) => {
      const target = guildState.tickets[ticket.id];
      target.closeRequestedById = interaction.user.id;
      target.closeRequestedAt = new Date().toISOString();
      target.closeReason = reason;
    });

    const content = [
      `Sunucu: ${interaction.guild.name}`,
      "# 🗑️ Ticket Kapatma Talebi",
      "",
      "Bu ticket 5 dakika içinde kapatılacaktır.",
      "Kapatma işlemini iptal etmek için aşağıdaki butona basabilirsiniz.",
      "",
      `👤 Kapatan Yetkili : <@${interaction.user.id}>`,
      `⏰ Kapatma Süresi : ${futureMinutesLabel(closeAt - Date.now())}`,
      "",
      "📌 Kapatma Sebebi :",
      `\`\`\`${reason}\`\`\``,
    ].join("\n");

    const message = await interaction.channel.send(
      createComponentMessageOptions({
        text: content,
        components: buildCloseConfirmComponents(ticket.id),
      })
    );

    this.saveGuildState(interaction.guild.id, (guildState) => {
      guildState.tickets[ticket.id].closingMessageId = message.id;
    });

    const timeout = setTimeout(async () => {
      const latest = this.getTicketById(interaction.guild.id, ticket.id);
      if (!latest || latest.status !== "open" || !latest.closeReason) {
        return;
      }

      const channel = await interaction.guild.channels.fetch(latest.channelId).catch(() => null);
      if (channel) {
        await channel.send(createComponentMessageOptions({
          text: "Ticket başarılı bir şekilde kapatıldı!",
        }));
      }
      await this.finalizeClose(interaction.guild, latest);
    }, 5 * 60000);

    this.closeTimeouts.set(ticket.id, timeout);

    await interaction.reply(createComponentMessageOptions({
      text: "Ticket için otomatik kapatma başlatıldı.",
      ephemeral: true,
    }));
  }

  async cancelClose(interaction, ticket) {
    const timeout = this.closeTimeouts.get(ticket.id);
    if (timeout) {
      clearTimeout(timeout);
      this.closeTimeouts.delete(ticket.id);
    }

    this.saveGuildState(interaction.guild.id, (guildState) => {
      const target = guildState.tickets[ticket.id];
      target.closeRequestedById = null;
      target.closeRequestedAt = null;
      target.closeReason = null;
      target.closingMessageId = null;
    });

    await interaction.message.delete().catch(() => null);
    const roleMention = this.getConfig(interaction.guild.id).managerRoleId
      ? `<@&${this.getConfig(interaction.guild.id).managerRoleId}>`
      : "";

    await interaction.channel.send(createComponentMessageOptions({
      text: `❌ Ticket kapatma işlemi iptal edildi.${roleMention ? ` ${roleMention}` : ""}`,
    }));

    await interaction.reply(createComponentMessageOptions({
      text: "Kapatma işlemi iptal edildi.",
      ephemeral: true,
    }));
  }

  async confirmClose(interaction, ticket) {
    await interaction.message.delete().catch(() => null);
    await interaction.channel.send(createComponentMessageOptions({
      text: "✅ Ticket başarılı bir şekilde kapatıldı!",
    }));
    await interaction.reply(createComponentMessageOptions({
      text: "Ticket kapatma işlemi onaylandı.",
      ephemeral: true,
    }));
    await this.finalizeClose(interaction.guild, this.getTicketById(interaction.guild.id, ticket.id));
  }

  async finalizeClose(guild, ticket) {
    if (!ticket || ticket.status !== "open") {
      return;
    }

    const config = this.getConfig(guild.id);
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) {
      return;
    }

    const closedAt = new Date().toISOString();
    const resolutionMinutes = diffMinutes(ticket.createdAt, closedAt);
    const transcriptPath = await createTranscript(channel, this.config.dataDir, ticket.sequence);
    const transcriptLogAttachment = new AttachmentBuilder(transcriptPath);

    this.saveGuildState(guild.id, (guildState) => {
      const target = guildState.tickets[ticket.id];
      target.status = "closed";
      target.closedAt = closedAt;
      guildState.stats.closed += 1;
      if (target.claimedById) {
        this.ensureStaffStats(guildState, target.claimedById).closed += 1;
      }
    });

    const latest = this.getTicketById(guild.id, ticket.id);
    const ownerLine = latest.claimedById ? `<@${latest.claimedById}>` : "Sahiplenilmedi";

    await this.sendLog(guild, [
      "🗑️ # Ticket Kapatıldı",
      "(Ticket transcript eki ile birlikte gönderildi)",
      `👮‍♂️ Sahiplenen Yetkili : ${ownerLine}`,
      `👤 Ticket Açan Kullanıcı : <@${latest.openerId}>`,
      `📅 Açılma Tarihi : ${formatDateTime(latest.createdAt)}`,
      `⏱️ Kapanış Zamanı : ${relativeMinutesLabel(latest.createdAt)}`,
      `🔗 Ticket Kanalı : ${channel.url}`,
      `⏳ Kapanış Süresi : ${resolutionMinutes} dakika`,
      "📌 Ticket Türü :",
      `\`\`\`${latest.categoryLabel}\`\`\``,
      "📝 Kapanış Sebebi :",
      `\`\`\`${latest.closeReason || "Belirtilmedi"}\`\`\``,
    ].join("\n"), [transcriptLogAttachment]);

    const opener = await guild.client.users.fetch(latest.openerId).catch(() => null);
    if (opener) {
      await opener.send({
        content: [
          "✅ # Ticketiniz Başarılı Bir Şekilde Kapatıldı",
          "",
          `👤 Ticketi Sahiplenen Yetkili : ${ownerLine}`,
          `🎫 Ticket Açan Kullanıcı : <@${latest.openerId}>`,
          `📅 Ticket Açılma Tarihi : ${formatDateTime(latest.createdAt)}`,
          `🕛 Ticket Açılma Saati : ${new Date(latest.createdAt).toLocaleTimeString("tr-TR")}`,
          `⏰ Kapanış Süresi : ${resolutionMinutes} dakika`,
          "",
          "📌 Ticket Türü :",
          `\`\`\`${latest.categoryLabel}\`\`\``,
          "",
          "📝 Kapanış Sebebi :",
          `\`\`\`${latest.closeReason || "Belirtilmedi"}\`\`\``,
        ].join("\n"),
        files: [new AttachmentBuilder(transcriptPath)],
        components: buildRatingComponents(latest.id),
      }).catch(() => null);
    }

    if (config.archiveCategoryId) {
      await channel.setParent(config.archiveCategoryId).catch(() => null);
    }
    await channel.setName(`🗂️│${channel.name}`).catch(() => null);

    setTimeout(async () => {
      const targetChannel = await guild.channels.fetch(channel.id).catch(() => null);
      if (targetChannel) {
        await targetChannel.delete("Arşivde 24 saatini dolduran ticket otomatik silindi").catch(() => null);
      }
    }, 24 * 60 * 60000);
  }

  async rateTicket(interaction, guildId, ticket, stars) {
    if (ticket.rating) {
      await interaction.reply(createComponentMessageOptions({
        text: "Bu ticket için puan zaten verilmiş.",
        ephemeral: true,
      }));
      return;
    }

    if (interaction.user.id !== ticket.openerId) {
      await interaction.reply(createComponentMessageOptions({
        text: "Bu puanlamayı yalnızca ticketi açan kullanıcı yapabilir.",
        ephemeral: true,
      }));
      return;
    }

    this.saveGuildState(guildId, (guildState) => {
      const target = guildState.tickets[ticket.id];
      target.rating = stars;
      if (target.claimedById) {
        const stats = this.ensureStaffStats(guildState, target.claimedById);
        stats.ratingTotal += stars;
        stats.ratingCount += 1;
      }
    });

    await interaction.reply(createComponentMessageOptions({
      text: `Puanınız kaydedildi: ${stars} yıldız`,
      ephemeral: true,
    }));
  }

  async sendLog(guild, content, files = []) {
    const { logChannelId } = this.getConfig(guild.id);
    if (!logChannelId) {
      return;
    }

    const channel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel) {
      return;
    }

    await channel.send(createComponentMessageOptions({
      text: content,
      files,
    })).catch(() => null);
  }

  listStaffRankings(guildId) {
    const guildState = this.getGuildState(guildId);
    const entries = Object.entries(guildState.staffStats);

    return {
      mostHandled: [...entries].sort((a, b) => b[1].closed - a[1].closed),
      mostRated: [...entries].sort((a, b) => {
        const avgA = a[1].ratingCount ? a[1].ratingTotal / a[1].ratingCount : 0;
        const avgB = b[1].ratingCount ? b[1].ratingTotal / b[1].ratingCount : 0;
        return avgB - avgA;
      }),
    };
  }

  resetStatistics(guildId) {
    this.saveGuildState(guildId, (guildState) => {
      guildState.staffStats = {};
      guildState.stats = { opened: 0, closed: 0 };
    });
  }

  async resetGuildTickets(guildId, client) {
    const guildState = this.getGuildState(guildId);
    const config = guildState.config;
    const guild = await client.guilds.fetch(guildId).catch(() => null);

    if (guild) {
      const openTickets = Object.values(guildState.tickets).filter((ticket) => ticket.status === "open");
      for (const ticket of openTickets) {
        const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
        if (channel && channel.type === ChannelType.GuildText) {
          await channel.send({
            content: "⚠️ Yönetici panelinden gelen sıfırlama nedeniyle bu ticket kapatılıyor.",
          }).catch(() => null);

          if (config.archiveCategoryId) {
            await channel.setParent(config.archiveCategoryId).catch(() => null);
          }

          await channel.setName(`🗂️│${channel.name}`).catch(() => null);
        }
      }
    }

    this.saveGuildState(guildId, (guildState) => {
      guildState.tickets = {};
      guildState.stats = { opened: 0, closed: 0 };
      guildState.staffStats = {};
    });
  }

  buildTicketStatistics(guildId, userId) {
    const guildState = this.getGuildState(guildId);
    const stats = guildState.staffStats[userId] || {
      claimed: 0,
      closed: 0,
      transferredIn: 0,
      transferredOut: 0,
      ratingTotal: 0,
      ratingCount: 0,
    };

    const averageRating = stats.ratingCount ? (stats.ratingTotal / stats.ratingCount).toFixed(2) : "0.00";

    return [
      `Yetkili : <@${userId}>`,
      `Sahiplenilen Ticket : ${stats.claimed}`,
      `Kapatılan Ticket : ${stats.closed}`,
      `Devralınan Ticket : ${stats.transferredIn}`,
      `Devredilen Ticket : ${stats.transferredOut}`,
      `Ortalama Puan : ${averageRating}`,
      `Toplam Puan Sayısı : ${stats.ratingCount}`,
    ].join("\n");
  }

  async buildDashboardState(client) {
    const data = this.database.read();
    const guildEntries = Object.entries(data.guilds);

    const totals = guildEntries.reduce(
      (acc, [, guildState]) => {
        const tickets = Object.values(guildState.tickets);
        acc.opened += guildState.stats.opened;
        acc.closed += guildState.stats.closed;
        acc.active += tickets.filter((ticket) => ticket.status === "open").length;
        acc.totalTickets += tickets.length;
        return acc;
      },
      { opened: 0, closed: 0, active: 0, totalTickets: 0 }
    );

    const guilds = await Promise.all(
      guildEntries.map(async ([guildId, guildState]) => {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        const tickets = Object.values(guildState.tickets);
        const activeTickets = tickets.filter((ticket) => ticket.status === "open");
        const managerRoleId = guildState.config.managerRoleId;

        if (guild) {
          await guild.members.fetch().catch(() => null);
        }

        const members = guild ? [...guild.members.cache.values()] : [];
        const humans = members.filter((member) => !member.user.bot);
        const bots = members.filter((member) => member.user.bot);
        const online = humans.filter((member) => member.presence?.status === "online").length;
        const idle = humans.filter((member) => member.presence?.status === "idle").length;
        const dnd = humans.filter((member) => member.presence?.status === "dnd").length;
        const offline = humans.length - online - idle - dnd;
        const managerRole = guild && managerRoleId ? guild.roles.cache.get(managerRoleId) : null;
        const managerMembers = managerRole ? [...managerRole.members.values()] : [];

        return {
          guildId,
          guildName: guild?.name || guildId,
          iconUrl: guild?.iconURL({ extension: "png", size: 256 }) || null,
          config: guildState.config,
          stats: guildState.stats,
          overview: {
            memberCount: guild?.memberCount || members.length,
            humanCount: humans.length,
            botCount: bots.length,
            online,
            idle,
            dnd,
            offline: Math.max(offline, 0),
            textChannels: guild ? guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText).size : 0,
            voiceChannels: guild ? guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildVoice).size : 0,
            roleCount: guild?.roles.cache.size || 0,
          },
          managerRole: managerRole
            ? {
                id: managerRole.id,
                name: managerRole.name,
                memberCount: managerMembers.length,
                members: managerMembers.map((member) => ({
                  id: member.id,
                  displayName: member.displayName,
                  username: member.user.username,
                  avatar: member.displayAvatarURL({ extension: "png", size: 128 }),
                  status: member.presence?.status || "offline",
                  joinedAt: member.joinedAt ? formatDateTime(member.joinedAt) : "Bilinmiyor",
                })),
              }
            : null,
          allTickets: tickets
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map((ticket) => ({
              id: ticket.id,
              channelId: ticket.channelId,
              openerId: ticket.openerId,
              openerName: guild?.members.cache.get(ticket.openerId)?.user?.username || ticket.openerId,
              claimedById: ticket.claimedById,
              claimedByName: ticket.claimedById
                ? guild?.members.cache.get(ticket.claimedById)?.displayName || ticket.claimedById
                : null,
              categoryLabel: ticket.categoryLabel,
              createdAt: formatDateTime(ticket.createdAt),
              waited: humanDurationFromMinutes(diffMinutes(ticket.createdAt)),
              status: ticket.status === "open" ? "Açık" : "Kapalı",
              closeReason: ticket.closeReason || "Belirtilmedi",
              rating: ticket.rating || null,
            })),
          activeTickets: activeTickets.map((ticket) => ({
            id: ticket.id,
            channelName: ticket.channelName || ticket.id,
            channelId: ticket.channelId,
            openerId: ticket.openerId,
            openerName: guild?.members.cache.get(ticket.openerId)?.user?.username || ticket.openerId,
            claimedById: ticket.claimedById,
            claimedByName: ticket.claimedById
              ? guild?.members.cache.get(ticket.claimedById)?.displayName || ticket.claimedById
              : "Bekliyor",
            categoryLabel: ticket.categoryLabel,
            createdAt: formatDateTime(ticket.createdAt),
            waited: humanDurationFromMinutes(diffMinutes(ticket.createdAt)),
          })),
          staffStats: Object.entries(guildState.staffStats).map(([userId, stats]) => ({
            userId,
            displayName: guild?.members.cache.get(userId)?.displayName || userId,
            claimed: stats.claimed,
            closed: stats.closed,
            transferredIn: stats.transferredIn,
            transferredOut: stats.transferredOut,
            averageRating: stats.ratingCount ? (stats.ratingTotal / stats.ratingCount).toFixed(2) : "0.00",
            ratingCount: stats.ratingCount,
          })),
        };
      })
    );

    return { totals, guilds };
  }
}

module.exports = { TicketService };
