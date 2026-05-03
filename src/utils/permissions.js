const { createComponentMessageOptions } = require("./componentsV2");

function memberHasRole(member, roleId) {
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

function ensureManager(interaction, roleId) {
  if (memberHasRole(interaction.member, roleId)) {
    return true;
  }

  return interaction.reply(
    createComponentMessageOptions({
      text: "Bu işlemi yalnızca ticket sorumlu rolüne sahip kişiler kullanabilir.",
      ephemeral: true,
    })
  );
}

module.exports = {
  ensureManager,
  memberHasRole,
};
