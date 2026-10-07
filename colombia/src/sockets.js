const { Server } = require("socket.io");
const env = require("../config/env");
const { findValidSession } = require("./auth/session");
const { flagsFromRoles, hasAnyAccess, isMemberArea } = require("./utils/roles");

let io = null;

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.BASE_URL, credentials: true },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // مصادقة كل اتصال عبر الجلسة نفسها (شبكة أمان: لا توجد اتصالات مجهولة)
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookieHeader(socket.handshake.headers.cookie);
      const session = await findValidSession(cookies.sid);
      if (!session || !session.user) return next(new Error("unauthorized"));
      const flags = flagsFromRoles(session.user.discordRoles);
      if (!hasAnyAccess(flags)) return next(new Error("no_access"));
      socket.data.user = session.user;
      socket.data.flags = flags;
      next();
    } catch (e) {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    const flags = socket.data.flags;
    socket.join(`user:${user._id}`);
    if (isMemberArea(flags)) socket.join("area:members");
    if (isMemberArea(flags) || flags.shop) socket.join("area:shop");
    if (flags.ops || flags.admin) socket.join("area:ops");
    if (flags.admin) socket.join("area:admin");
  });

  return io;
}

function getIo() {
  return io;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${String(userId)}`).emit(event, payload);
}

function emitToArea(area, event, payload) {
  if (io) io.to(`area:${area}`).emit(event, payload);
}

module.exports = { initSockets, getIo, emitToUser, emitToArea };
