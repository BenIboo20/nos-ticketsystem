function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusLabel(status) {
  const map = {
    online: "Çevrimiçi",
    idle: "Boşta",
    dnd: "Rahatsız Etmeyin",
    offline: "Çevrimdışı",
  };
  return map[status] || "Çevrimdışı";
}

function statusClass(status) {
  return `status-${status || "offline"}`;
}

function getMessageTypeClass(message) {
  if (message.isWebhook) return 'message-webhook';
  if (message.isBot) return 'message-bot';
  return 'message-user';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderOverviewCards(state) {
  return `
    <div class="overview-grid">
      <article class="overview-card"><span>Aktif Ticket</span><strong>${state.totals.active}</strong></article>
      <article class="overview-card"><span>Toplam Ticket</span><strong>${state.totals.totalTickets}</strong></article>
      <article class="overview-card"><span>Toplam Açılan</span><strong>${state.totals.opened}</strong></article>
      <article class="overview-card"><span>Toplam Kapanan</span><strong>${state.totals.closed}</strong></article>
    </div>
  `;
}

function layout(title, body) {
  return `<!doctype html>
  <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root {
          --bg: #07040d;
          --panel: rgba(19, 11, 31, 0.9);
          --panel-soft: rgba(33, 20, 53, 0.95);
          --border: rgba(167, 118, 255, 0.16);
          --text: #f7f1ff;
          --muted: #baa8db;
          --accent: #8b5cf6;
          --accent-2: #c084fc;
          --green: #4ade80;
          --yellow: #facc15;
          --red: #fb7185;
          --gray: #94a3b8;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Segoe UI", Tahoma, sans-serif;
          color: var(--text);
          background:
            radial-gradient(circle at top left, rgba(139, 92, 246, 0.25), transparent 25%),
            radial-gradient(circle at top right, rgba(192, 132, 252, 0.18), transparent 22%),
            linear-gradient(180deg, #160d25, #0c0715 38%, #05030a);
        }
        a { color: inherit; text-decoration: none; }
        .shell { width: min(1280px, calc(100% - 24px)); margin: 18px auto 30px; }
        .hero, .guild-panel, .card, .message-card {
          background: linear-gradient(180deg, rgba(28, 17, 45, 0.94), rgba(12, 8, 20, 0.95));
          border: 1px solid var(--border);
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.34);
          backdrop-filter: blur(16px);
        }
        .hero { border-radius: 28px; padding: 24px; margin-bottom: 18px; display: grid; gap: 18px; }
        .hero-top, .guild-header, .card-head, .ticket-header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
        .hero img { width: min(280px, 100%); height: auto; }
        .label { margin: 0 0 8px; color: var(--accent-2); letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.72rem; }
        h1, h2, h3, p, pre { margin: 0; }
        .hero h1 { font-size: clamp(2rem, 4vw, 3.4rem); }
        .hero-copy { max-width: 760px; }
        .hero-copy p:last-child { margin-top: 10px; color: var(--muted); }
        .overview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
        .overview-card { padding: 16px 18px; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); border: 1px solid rgba(255,255,255,0.06); }
        .overview-card span { display: block; color: var(--muted); font-size: 0.9rem; }
        .overview-card strong { display: block; margin-top: 6px; font-size: 1.9rem; }
        .guild-panel { border-radius: 26px; padding: 20px; margin-bottom: 18px; }
        .guild-title { display: flex; gap: 14px; align-items: center; }
        .guild-icon { width: 64px; height: 64px; border-radius: 20px; object-fit: cover; background: rgba(255,255,255,0.08); }
        .guild-icon.fallback { display: grid; place-items: center; font-weight: 700; background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
        .server-stats, .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .server-stats span, .chip, .ticket-state {
          padding: 8px 12px; border-radius: 999px; background: rgba(139, 92, 246, 0.14);
          border: 1px solid rgba(192, 132, 252, 0.16); color: #efe7ff; font-size: 0.88rem;
        }
        .guild-layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .card { border-radius: 22px; padding: 18px; }
        .card-head { margin-bottom: 14px; }
        .card-head p { color: var(--muted); font-size: 0.92rem; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 11px 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.07); color: var(--muted); vertical-align: top; }
        th { color: var(--text); font-size: 0.92rem; }
        .row-link { color: #efe7ff; text-decoration: underline; text-underline-offset: 3px; }
        .staff-grid, .ticket-grid, .message-list { display: grid; gap: 12px; }
        .staff-grid, .ticket-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .staff-card, .ticket-card, .empty-box, .message-card {
          border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.07);
        }
        .staff-card { padding: 14px; display: flex; gap: 12px; align-items: center; }
        .staff-card img { width: 48px; height: 48px; border-radius: 14px; object-fit: cover; }
        .staff-card p, .staff-card small, .ticket-card p, .ticket-card small, .empty-box, .message-meta, .message-content { color: var(--muted); }
        .ticket-card { padding: 14px; }
        .ticket-card-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 8px; }
        .ticket-open { background: rgba(74, 222, 128, 0.14); border-color: rgba(74, 222, 128, 0.22); }
        .ticket-closed { background: rgba(251, 113, 133, 0.14); border-color: rgba(251, 113, 133, 0.22); }
        .empty-box { padding: 16px; }
        .dot { display: inline-block; width: 10px; height: 10px; border-radius: 999px; margin-right: 8px; }
        .status-online { background: var(--green); }
        .status-idle { background: var(--yellow); }
        .status-dnd { background: var(--red); }
        .status-offline { background: var(--gray); }
        .back-link { display: inline-flex; margin-bottom: 14px; color: #efe7ff; }
        .ticket-detail-grid { display: grid; gap: 16px; }
        .message-card { padding: 16px; }
        .message-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
        .message-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
        .message-avatar-fallback { width: 40px; height: 40px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 18px; }
        .message-meta { flex: 1; }
        .message-author { color: var(--text); font-weight: 600; }
        .message-date { color: var(--muted); font-size: 0.85rem; margin-left: 8px; }
        .message-content { white-space: pre-wrap; line-height: 1.5; margin-bottom: 8px; }
        .message-attachments { margin-top: 8px; }
        .attachment-link { display: inline-block; padding: 6px 10px; margin: 2px; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 6px; color: var(--accent-2); text-decoration: none; font-size: 0.9rem; }
        .attachment-link:hover { background: rgba(139, 92, 246, 0.2); }
        .message-embeds { margin-top: 8px; color: var(--muted); font-size: 0.9rem; }
        .message-user { border-left: 4px solid var(--accent); }
        .message-bot { border-left: 4px solid var(--green); }
        .message-webhook { border-left: 4px solid var(--yellow); }
        @media (max-width: 980px) { .guild-layout { grid-template-columns: 1fr; } }
        @media (max-width: 720px) {
          .shell { width: min(100% - 14px, 1280px); margin: 12px auto 18px; }
          .hero, .guild-panel, .card, .message-card { border-radius: 20px; }
          table { display: block; overflow-x: auto; }
        }
        /* Footer Styles */
        .footer { background: linear-gradient(180deg, rgba(12, 8, 20, 0.95), rgba(5, 3, 10, 0.98)); border-top: 1px solid var(--border); padding: 24px 0; margin-top: 40px; }
        .footer-content { width: min(1280px, calc(100% - 24px)); margin: 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; }
        .footer-links { display: flex; gap: 24px; flex-wrap: wrap; }
        .footer-link { color: var(--muted); text-decoration: none; font-size: 0.9rem; transition: color 0.2s; }
        .footer-link:hover { color: var(--accent-2); }
        .reset-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          border-radius: 999px;
          background: rgba(251, 113, 133, 0.16);
          border: 1px solid rgba(251, 113, 133, 0.24);
          color: #fff;
          text-decoration: none;
          font-weight: 600;
          transition: background 0.2s, transform 0.2s;
        }
        .reset-button:hover {
          background: rgba(251, 113, 133, 0.28);
          transform: translateY(-1px);
        }
        .footer-copyright { color: var(--muted); font-size: 0.85rem; text-align: center; }
        @media (max-width: 720px) {
          .footer-content { grid-template-columns: 1fr; gap: 16px; text-align: center; }
          .footer-links { justify-content: center; }
        }
      </style>
    </head>
    <body>
      <main class="shell">${body}</main>
      <footer class="footer">
        <div class="footer-content">
          <div class="footer-links">
            <a href="https://discord.gg/nos" class="footer-link">Nos Store</a>
            <a href="https://discord.gg/nosscripts" class="footer-link">Nos Scripts</a>
            <a href="https://discord.gg/egVBfCgpfp" class="footer-link">NosCode</a>
            <a href="https://www.youtube.com/channel/UCBoOQ5Kb3oOqszS0nQ90znA" class="footer-link">NosCode YouTube</a>
          </div>
          <div class="footer-copyright">
            © 2026 NosCode. Tüm hakları saklıdır.
          </div>
        </div>
      </footer>
    </body>
  </html>`;
}

function renderGuild(guild) {
  const activeRows = guild.activeTickets.length
    ? guild.activeTickets.map((ticket) => `
      <tr>
        <td><a class="row-link" href="/tickets/${escapeHtml(guild.guildId)}/${escapeHtml(ticket.id)}">${escapeHtml(ticket.id)}</a></td>
        <td>${escapeHtml(ticket.categoryLabel)}</td>
        <td>${escapeHtml(ticket.openerName)}</td>
        <td>${escapeHtml(ticket.claimedByName)}</td>
        <td>${escapeHtml(ticket.waited)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Aktif ticket bulunmuyor.</td></tr>`;

  const recentTicketCards = guild.allTickets.slice(0, 8).map((ticket) => `
    <a href="/tickets/${escapeHtml(guild.guildId)}/${escapeHtml(ticket.id)}" class="ticket-card">
      <div class="ticket-card-head">
        <strong>${escapeHtml(ticket.id)}</strong>
        <span class="ticket-state ${ticket.status === "Açık" ? "ticket-open" : "ticket-closed"}">${escapeHtml(ticket.status)}</span>
      </div>
      <p>${escapeHtml(ticket.categoryLabel)}</p>
      <small>${escapeHtml(ticket.openerName)} • ${escapeHtml(ticket.createdAt)}</small>
    </a>
  `).join("") || `<div class="empty-box">Ticket verisi bulunmuyor.</div>`;

  const managerCards = guild.managerRole?.members?.length
    ? guild.managerRole.members.map((member) => `
      <article class="staff-card">
        <img src="${escapeHtml(member.avatar)}" alt="${escapeHtml(member.displayName)}" />
        <div>
          <strong>${escapeHtml(member.displayName)}</strong>
          <p>@${escapeHtml(member.username)}</p>
          <small><span class="dot ${statusClass(member.status)}"></span>${statusLabel(member.status)}</small>
        </div>
      </article>
    `).join("")
    : `<div class="empty-box">Sorumlu rolde üye bulunmuyor.</div>`;

  const staffRows = guild.staffStats.length
    ? guild.staffStats.map((staff) => `
      <tr>
        <td>${escapeHtml(staff.displayName)}</td>
        <td>${escapeHtml(staff.claimed)}</td>
        <td>${escapeHtml(staff.closed)}</td>
        <td>${escapeHtml(staff.averageRating)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4">Yetkili istatistiği bulunmuyor.</td></tr>`;

  const categories = guild.config.categories.map((category) => `<span class="chip">${escapeHtml(category.label)}</span>`).join("");

  return `
    <section class="guild-panel">
      <header class="guild-header">
        <div class="guild-title">
          ${guild.iconUrl ? `<img class="guild-icon" src="${escapeHtml(guild.iconUrl)}" alt="${escapeHtml(guild.guildName)}" />` : '<div class="guild-icon fallback">NC</div>'}
          <div>
            <p class="label">Sunucu</p>
            <h2>${escapeHtml(guild.guildName)}</h2>
            <div class="chips">${categories}</div>
          </div>
        </div>
        <div class="server-stats">
          <span>Üye ${guild.overview.memberCount}</span>
          <span>Çevrimiçi ${guild.overview.online}</span>
          <span>Çevrimdışı ${guild.overview.offline}</span>
          <span>Metin ${guild.overview.textChannels}</span>
          <span>Ses ${guild.overview.voiceChannels}</span>
        </div>
        <div class="guild-actions">
          <a class="reset-button" href="/reset-tickets/${escapeHtml(guild.guildId)}">Tüm Ticketleri Sıfırla</a>
        </div>
      </header>
      <div class="guild-layout">
        <section class="card">
          <div class="card-head"><h3>Aktif Ticketler</h3><p>${guild.activeTickets.length} açık kayıt</p></div>
          <table>
            <thead><tr><th>ID</th><th>Kategori</th><th>Açan</th><th>Sahiplenen</th><th>Bekleme</th></tr></thead>
            <tbody>${activeRows}</tbody>
          </table>
        </section>
        <section class="card">
          <div class="card-head"><h3>Sorumlu Rolü</h3><p>${guild.managerRole ? `${escapeHtml(guild.managerRole.name)} • ${guild.managerRole.memberCount} kişi` : "Rol ayarlanmamış"}</p></div>
          <div class="staff-grid">${managerCards}</div>
        </section>
        <section class="card">
          <div class="card-head"><h3>Son Ticketler</h3><p>Mesajları görüntülemek için tıklayın</p></div>
          <div class="ticket-grid">${recentTicketCards}</div>
        </section>
        <section class="card">
          <div class="card-head"><h3>Yetkili İstatistikleri</h3><p>Performans özeti</p></div>
          <table>
            <thead><tr><th>Yetkili</th><th>Sahiplenilen</th><th>Kapatılan</th><th>Ort. Puan</th></tr></thead>
            <tbody>${staffRows}</tbody>
          </table>
        </section>
      </div>
    </section>
  `;
}

function renderDashboard(state) {
  const guildMarkup = state.guilds.length
    ? state.guilds.map(renderGuild).join("")
    : `<section class="guild-panel"><div class="empty-box">Bot henüz bir sunucuda kurulu değil.</div></section>`;

  return layout(
    "NosCode • Ticket Sistemi",
    `
      <section class="hero">
        <div class="hero-top">
          <div class="hero-copy">
            <p class="label">NosCode • Ticket Sistemi</p>
            <h1>NosCode • Ticket Sistemi</h1>
            <p>NosCode Youtube Kanalına Abone Ol!</p>
          </div>
          <img src="/assets/logo.svg" alt="NosCode Ticket Sistemi logosu" />
        </div>
        ${renderOverviewCards(state)}
      </section>
      ${guildMarkup}
    `
  );
}

function renderTicketDetailPage({ guildName, ticket, messages }) {
  const messageMarkup = messages.length
    ? messages.map((message) => {
        const messageTypeClass = getMessageTypeClass(message);
        const attachmentsHtml = message.attachments.length
          ? `<div class="message-attachments">
              ${message.attachments.map(att => `
                <a href="${att.url}" target="_blank" class="attachment-link">
                  📎 ${escapeHtml(att.name)} (${formatFileSize(att.size)})
                </a>
              `).join('')}
             </div>`
          : '';

        const embedsHtml = message.embeds > 0
          ? `<div class="message-embeds">📄 ${message.embeds} embed${message.embeds > 1 ? 's' : ''}</div>`
          : '';

        return `
          <article class="message-card ${messageTypeClass}">
            <div class="message-header">
              ${message.authorAvatar ? `<img src="${message.authorAvatar}" alt="Avatar" class="message-avatar">` : '<div class="message-avatar-fallback">👤</div>'}
              <div class="message-meta">
                <strong class="message-author">${escapeHtml(message.authorName)}${message.isBot ? ' 🤖' : ''}${message.isWebhook ? ' 🔗' : ''}</strong>
                <span class="message-date">${escapeHtml(message.formattedDate)}</span>
              </div>
            </div>
            <div class="message-content">${escapeHtml(message.content)}</div>
            ${attachmentsHtml}
            ${embedsHtml}
          </article>
        `;
      }).join("")
    : `<div class="empty-box">Bu ticket içinde görüntülenecek mesaj bulunamadı.</div>`;

  return layout(
    `${guildName} • ${ticket.id}`,
    `
      <a class="back-link" href="/">← Panele dön</a>
      <section class="hero">
        <div class="ticket-header">
          <div>
            <p class="label">Ticket Detayı</p>
            <h1>${escapeHtml(ticket.id)}</h1>
            <p>${escapeHtml(ticket.categoryLabel)} • ${ticket.status === "open" ? "Açık" : "Kapalı"}</p>
          </div>
          <div class="server-stats">
            <span>Açan ${escapeHtml(ticket.openerId)}</span>
            <span>Kanal ${escapeHtml(ticket.channelId)}</span>
          </div>
        </div>
      </section>
      <section class="ticket-detail-grid">${messageMarkup}</section>
    `
  );
}

module.exports = {
  renderDashboard,
  renderTicketDetailPage,
};
