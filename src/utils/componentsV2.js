const path = require("node:path");
const { AttachmentBuilder, MessageFlags } = require("discord.js");

function textDisplay(content) {
  return {
    type: 10,
    content,
  };
}

function separator(spacing = 1, divider = true) {
  return {
    type: 14,
    spacing,
    divider,
  };
}

function container(components, accentColor = 0x8b5cf6) {
  return {
    type: 17,
    accent_color: accentColor,
    components,
  };
}

function normalizeAttachment(file) {
  if (file instanceof AttachmentBuilder) {
    return file;
  }

  return new AttachmentBuilder(file);
}

function fileDisplayForAttachment(file) {
  const attachment = normalizeAttachment(file);
  const name = attachment.name || path.basename(attachment.attachment?.toString?.() || "dosya.txt");

  if (!attachment.name) {
    attachment.setName(name);
  }

  return {
    attachment,
    component: {
      type: 13,
      file: {
        url: `attachment://${name}`,
      },
    },
  };
}

function chunk(array, size) {
  const output = [];
  for (let index = 0; index < array.length; index += size) {
    output.push(array.slice(index, index + size));
  }
  return output;
}

function createComponentMessageOptions({
  text,
  components = [],
  files = [],
  ephemeral = false,
  allowedMentions,
  accentColor = 0x8b5cf6,
  fallbackContent,
  isWebhook = false,
}) {
  const innerComponents = [];

  // For webhooks, ensure we have some text content
  const effectiveText = isWebhook && !text && fallbackContent ? fallbackContent : text;

  if (effectiveText) {
    innerComponents.push(textDisplay(effectiveText));
  }

  if (components.length) {
    if (innerComponents.length) {
      innerComponents.push(separator());
    }
    innerComponents.push(...components);
  }

  const normalizedFiles = files.map(fileDisplayForAttachment);
  if (normalizedFiles.length) {
    if (innerComponents.length) {
      innerComponents.push(separator(2, false));
    }

    for (const file of normalizedFiles) {
      innerComponents.push(file.component);
    }
  }

  const topLevelComponents = chunk(innerComponents, 10).map((group) => container(group, accentColor));

  // For webhooks with components v2, don't use content field
  const hasComponentsV2 = topLevelComponents.length > 0;
  const content = (isWebhook && hasComponentsV2) ? undefined : fallbackContent;

  return {
    content,
    components: topLevelComponents,
    files: normalizedFiles.map((file) => file.attachment),
    flags: ephemeral
      ? (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
      : MessageFlags.IsComponentsV2,
    allowedMentions,
  };
}

module.exports = {
  createComponentMessageOptions,
  separator,
  textDisplay,
};
