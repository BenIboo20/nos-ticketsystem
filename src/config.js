const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config();

let privateConfig = {};
try {
  privateConfig = require("./private");
} catch {
  privateConfig = {};
}

module.exports = {
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",
  panelPort: Number(process.env.PANEL_PORT || 3001),
  statusRotationMinutes: Math.max(1, Number(process.env.STATUS_ROTATION_MINUTES || 1)),
  voiceChannelId: process.env.VOICE_CHANNEL_ID || "",
  // startupWebhookUrl removed - now loaded inline from private config
  dataDir: path.join(process.cwd(), "data"),
};
