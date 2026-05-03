const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

function buildPanelComponents(categories) {
  const options = categories.map((category) => ({
    label: category.label,
    value: category.value,
    description: category.description || `${category.label} ticket kategorisi`,
  }));

  options.push({
    label: "Seçimi Sıfırla",
    value: "reset",
    description: "Yaptığınız seçimi sıfırlar",
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket:create")
    .setPlaceholder("Bir ticket kategorisi seçin")
    .addOptions(options);

  return [new ActionRowBuilder().addComponents(select)];
}

function buildTicketComponents(ticketId, hasCloserControls = true) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel("Kapat")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket:add-user:${ticketId}`)
      .setLabel("Kullanıcı Ekle")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket:claim:${ticketId}`)
      .setLabel("Sahiplen")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel("Streamable (Kanıt Yükle)")
      .setStyle(ButtonStyle.Link)
      .setURL("https://streamable.com/")
  );

  return hasCloserControls ? [row] : [];
}

function buildCloseConfirmComponents(ticketId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:cancel-close:${ticketId}`)
        .setLabel("İptal Et")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket:confirm-close:${ticketId}`)
        .setLabel("Kapat")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildRatingComponents(ticketId) {
  const row = new ActionRowBuilder();
  for (let stars = 1; stars <= 5; stars += 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:rate:${ticketId}:${stars}`)
        .setLabel("⭐".repeat(stars))
        .setStyle(ButtonStyle.Secondary)
    );
  }
  return [row];
}

function buildCloseModal(ticketId) {
  return new ModalBuilder()
    .setCustomId(`ticket:close-modal:${ticketId}`)
    .setTitle("Ticket Kapatma");
}

function buildCloseModalInput() {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Kapatma sebebi")
      .setPlaceholder("En az 3 karakter girin")
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(3)
      .setRequired(true)
  );
}

function buildAddUserModal(ticketId) {
  return new ModalBuilder()
    .setCustomId(`ticket:add-user-modal:${ticketId}`)
    .setTitle("Tickete Kullanıcı Ekle")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("userId")
          .setLabel("Kullanıcı ID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function sanitizeChannelName(input) {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9ğüşöçıİ]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureWebhook(channel, name) {
  const hooks = await channel.fetchWebhooks();
  const existing = hooks.find((hook) => hook.name === name);
  if (existing) {
    return existing;
  }

  return channel.createWebhook({
    name,
    avatar: channel.guild.iconURL({ extension: "png" }) || undefined,
  });
}

function isTextChannel(channel) {
  return channel?.type === ChannelType.GuildText;
}

module.exports = {
  buildAddUserModal,
  buildCloseConfirmComponents,
  buildCloseModal,
  buildCloseModalInput,
  buildPanelComponents,
  buildRatingComponents,
  buildTicketComponents,
  ensureWebhook,
  isTextChannel,
  sanitizeChannelName,
};
