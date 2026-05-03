const fs = require("node:fs");
const path = require("node:path");
const { formatDateTime } = require("./time");

function extractComponentText(components = []) {
  const lines = [];

  for (const component of components) {
    if (!component) {
      continue;
    }

    if (component.type === 10 && component.content) {
      lines.push(component.content);
      continue;
    }

    if (Array.isArray(component.components) && component.components.length) {
      const nested = extractComponentText(component.components);
      if (nested) {
        lines.push(nested);
      }
    }
  }

  return lines.join("\n").trim();
}

function extractMessageText(message) {
  const directContent = (message.content || "").trim();
  if (directContent) {
    return directContent;
  }

  const componentText = extractComponentText(message.components || []);
  if (componentText) {
    return componentText;
  }

  return "[İçerik yok]";
}

async function fetchChannelMessages(channel, limit = 100) {
  const messages = await channel.messages.fetch({ limit });
  return [...messages.values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => ({
      id: message.id,
      authorTag: message.author?.tag || "Bilinmeyen Kullanıcı",
      authorName: message.author?.username || "Bilinmeyen Kullanıcı",
      authorId: message.author?.id,
      authorAvatar: message.author?.displayAvatarURL({ extension: "png", size: 64 }),
      createdAt: message.createdAt,
      formattedDate: formatDateTime(message.createdAt),
      content: extractMessageText(message),
      attachments: message.attachments?.map(att => ({
        name: att.name,
        url: att.url,
        contentType: att.contentType,
        size: att.size
      })) || [],
      embeds: message.embeds?.length || 0,
      type: message.type,
      isBot: message.author?.bot || false,
      isWebhook: message.webhookId !== null,
    }));
}

async function createTranscript(channel, dataDir, sequence = null) {
  const rows = await fetchChannelMessages(channel, 100);
  const transcriptDir = path.join(dataDir, "transcripts");
  fs.mkdirSync(transcriptDir, { recursive: true });

  const fileName = sequence 
    ? `NosCode-Ticket-${String(sequence).padStart(4, "0")}.txt`
    : `${channel.id}.txt`;
  const filePath = path.join(transcriptDir, fileName);
  
  const header = sequence
    ? [
        "═══════════════════════════════════════════════════════════",
        `NosCode Ticket Transcript #${String(sequence).padStart(4, "0")}`,
        `Channel: ${channel.name}`,
        `Channel ID: ${channel.id}`,
        `Guild: ${channel.guild.name}`,
        `Generated: ${new Date().toISOString()}`,
        "═══════════════════════════════════════════════════════════",
        "",
      ].join("\n")
    : "";

  const content = header + rows.map((row) => `[${row.formattedDate}] ${row.authorTag}: ${row.content}`).join("\n");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

module.exports = {
  createTranscript,
  extractMessageText,
  fetchChannelMessages,
};
