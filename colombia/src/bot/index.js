const { Client, GatewayIntentBits } = require("discord.js");
const env = require("../../config/env");
const { User } = require("../db/models");
const { flagsFromRoles, hasAnyAccess } = require("../utils/roles");
const { revokeUserSessions } = require("../auth/session");
const { emitToUser } = require("../sockets");

let client = null;
let botReady = false;

function relevantRoleIds() {
  return [env.ROLE_SHOP_ID, env.ROLE_MEMBER_ID, env.ROLE_OPS_ID, env.ROLE_ADMIN_ID].filter(Boolean);
}

/**
 * تطبيق الرولات الجديدة على المستخدم + إبطال الجلسات أو إرسال تحديث الصلاحيات.
 */
async function applyRoles(discordId, roles, inGuild, trigger) {
  const user = await User.findOne({ discordId });
  if (!user) return;
  const prevRoles = Array.isArray(user.discordRoles) ? user.discordRoles : [];
  user.discordRoles = roles;
  user.inGuild = inGuild;
  await user.save();

  const { Session } = require("../db/models");
  const flags = flagsFromRoles(roles);
  const hadSessions = await Session.exists({ user: user._id, revoked: false });

  if (!hasAnyAccess(flags)) {
    await revokeUserSessions(user._id, trigger || "role_removed");
    if (hadSessions) {
      emitToUser(user._id, "force-logout", { reason: trigger || "role_removed" });
    }
    return;
  }

  // رُقّي/خفضت الصلاحيات مع بقاء الوصول -> تحديث حي للجلسة بدون خروج
  const prevFlags = flagsFromRoles(prevRoles);
  await Session.updateMany({ user: user._id, revoked: false }, { $set: { flags } });
  if (hadSessions && JSON.stringify(prevFlags) !== JSON.stringify(flags)) {
    emitToUser(user._id, "permissions-updated", { flags });
  }
}

function handleGuildMemberUpdate(oldMember, newMember) {
  if (!newMember.guild || newMember.guild.id !== env.GUILD_ID) return;
  const newRoles = [...newMember.roles.cache.map((r) => r.id)];
  const oldRoles = oldMember && oldMember.roles && oldMember.roles.cache
    ? [...oldMember.roles.cache.map((r) => r.id)]
    : newRoles;
  const relevant = relevantRoleIds();
  const relevantChanged = relevant.some((id) => oldRoles.includes(id) !== newRoles.includes(id));
  if (!relevantChanged) return;
  return applyRoles(newMember.id, newRoles, true, "role_removed");
}

function handleGuildMemberRemove(member) {
  if (!member.guild || member.guild.id !== env.GUILD_ID) return;
  return applyRoles(member.id, [], false, "left_server");
}

function handleGuildBanAdd(ban) {
  if (!ban.guild || ban.guild.id !== env.GUILD_ID) return;
  return applyRoles(ban.user.id, [], false, "banned");
}

/** إعادة مزامنة كاملة عند إقلاع البوت */
async function resyncAll() {
  if (!client || !botReady) return;
  try {
    const guild = await client.guilds.fetch(env.GUILD_ID);
    const members = await guild.members.fetch();
    const rolesById = new Map();
    for (const [, m] of members) rolesById.set(m.id, [...m.roles.cache.map((r) => r.id)]);

    const { User: U, Session: S } = require("../db/models");
    const users = await U.find({});
    for (const user of users) {
      const roles = rolesById.has(user.discordId) ? rolesById.get(user.discordId) : [];
      const inGuild = rolesById.has(user.discordId);
      const prev = JSON.stringify(user.discordRoles || []);
      const next = JSON.stringify(roles);
      if (prev === next && user.inGuild === inGuild) continue;
      await applyRoles(user.discordId, roles, inGuild, "resync");
    }
    console.log(`[bot] resync done (${users.length} users)`);
  } catch (e) {
    console.error("[bot] resync failed:", e.message);
  }
}

/** جلب رولات مستخدم واحد من الديسكورد (اختيار السلامة) */
async function refreshUserRoles(discordId) {
  if (!client || !botReady) return false;
  try {
    const guild = await client.guilds.fetch(env.GUILD_ID);
    let member = null;
    try {
      member = await guild.members.fetch(discordId);
    } catch (e) {
      member = null;
    }
    const roles = member ? [...member.roles.cache.map((r) => r.id)] : [];
    await applyRoles(discordId, roles, !!member, "reconcile");
    return true;
  } catch (e) {
    console.error("[bot] refreshUserRoles failed:", e.message);
    return false;
  }
}

async function startBot() {
  try {
    client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    client.on("ready", () => {
      botReady = true;
      console.log(`[bot] logged in as ${client.user.tag}`);
      resyncAll();
    });
    client.on("guildMemberUpdate", (o, n) => safe(handleGuildMemberUpdate(o, n)));
    client.on("guildMemberRemove", (m) => safe(handleGuildMemberRemove(m)));
    client.on("guildBanAdd", (b) => safe(handleGuildBanAdd(b)));
    client.on("error", (e) => console.error("[bot] error:", e.message));
    client.on("shardError", (e) => console.error("[bot] shard error:", e.message));

    await client.login(env.DISCORD_BOT_TOKEN);
  } catch (e) {
    console.error("[bot] login failed:", e.message);
    console.error("[bot] السيرفر يستمر بالعمل بدون بوت - تحقق من DISCORD_BOT_TOKEN");
  }
}

function safe(p) {
  if (p && typeof p.catch === "function") p.catch((e) => console.error("[bot] handler error:", e.message));
}

function isBotReady() {
  return botReady;
}

module.exports = { startBot, isBotReady, resyncAll, refreshUserRoles };
