import React from "react";
import { Link } from "react-router-dom";
import { Bell, X, ExternalLink } from "lucide-react";
import { resolveImageUrl } from "../../lib/images";
import { resolveStorefrontPath } from "../../lib/paths";

function getNotificationIcon(type) {
  switch (type) {
    case "order":
      return "📦";
    case "promotion":
      return "🏷️";
    case "system":
      return "🔔";
    case "message":
      return "💬";
    default:
      return "📌";
  }
}

function inferMediaType(url, fallback = "") {
  if (fallback) return fallback;
  if (!url) return "";
  const lower = url.toLowerCase();
  if (lower.startsWith("data:video")) return "video";
  if (lower.startsWith("data:image")) return "image";
  if (lower.match(/\.(mp4|webm|ogg)(\?|#|$)/)) return "video";
  if (lower.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?|#|$)/)) return "image";
  return "";
}

function resolveMediaUrl(url) {
  if (!url) return "";
  return url.startsWith("http") ? url : resolveImageUrl(url);
}

function getItemMedia(item) {
  const mediaUrl = item.media_url ? resolveMediaUrl(item.media_url) : "";
  const mediaType = inferMediaType(item.media_url, item.media_type);
  return { mediaUrl, mediaType };
}

function NotificationIconThumb({ type }) {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-2xl">
      {getNotificationIcon(type)}
    </div>
  );
}

function NotificationMediaHero({ mediaUrl, mediaType }) {
  if (mediaType === "video") {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900">
        <video
          src={mediaUrl}
          className="h-full w-full object-cover opacity-90"
          muted
          playsInline
        />
        <span className="absolute inset-0 flex items-center justify-center text-base font-semibold text-white">
          ▶
        </span>
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
      <img
        src={mediaUrl}
        alt=""
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function NotificationRowBody({ item, storefrontPath, formatTime }) {
  const { mediaUrl, mediaType } = getItemMedia(item);
  const hasMedia = Boolean(mediaUrl && (mediaType === "image" || mediaType === "video"));

  if (hasMedia) {
    return (
      <div className="w-full">
        <NotificationMediaHero mediaUrl={mediaUrl} mediaType={mediaType} />
        <div className="mt-3 px-0.5">
          <p
            className={`text-sm leading-snug ${
              item.is_read ? "font-medium text-zinc-700" : "font-semibold text-zinc-900"
            }`}
          >
            {item.title || "Notification"}
          </p>
          {item.message ? (
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-500">{item.message}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {formatTime ? (
              <span className="text-[11px] text-zinc-400">{formatTime(item.created_at)}</span>
            ) : null}
            {storefrontPath ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#6F8B7F]">
                View
                <ExternalLink className="h-3 w-3" aria-hidden />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <NotificationIconThumb type={item.type} />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-snug ${
            item.is_read ? "font-medium text-zinc-700" : "font-semibold text-zinc-900"
          }`}
        >
          {item.title || "Notification"}
        </p>
        {item.message ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{item.message}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {formatTime ? (
            <span className="text-[11px] text-zinc-400">{formatTime(item.created_at)}</span>
          ) : null}
          {storefrontPath ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#6F8B7F]">
              View
              <ExternalLink className="h-3 w-3" aria-hidden />
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function NotificationDrawer({
  open,
  onClose,
  notifications = [],
  loading = false,
  unreadCount = 0,
  onMarkRead = () => {},
  onMarkAllRead = () => {},
  user = null,
  formatTime = () => "",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" aria-hidden={!open}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />
      <div
        className="absolute right-0 top-0 flex h-full w-full max-w-[min(100vw,24rem)] flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300 sm:max-w-lg"
        role="dialog"
        aria-label="Notifications"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6F8B7F]/10 text-[#6F8B7F]">
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Notifications</h2>
              {unreadCount > 0 ? (
                <p className="text-[11px] text-zinc-500">{unreadCount} unread</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {user && unreadCount > 0 ? (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#6F8B7F] transition-colors hover:bg-[#6F8B7F]/10"
              >
                Mark all read
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-200 border-t-[#6F8B7F]" />
              <p className="text-sm text-zinc-500">Loading…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
                <Bell className="h-6 w-6 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-900">No notifications</p>
              <p className="mt-1 text-xs text-zinc-500">
                We&apos;ll notify you when something new arrives.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {notifications.map((item) => {
                const storefrontPath = resolveStorefrontPath(item.link_url);
                const { mediaUrl, mediaType } = getItemMedia(item);
                const hasMedia = Boolean(mediaUrl && (mediaType === "image" || mediaType === "video"));
                const rowClassName = `${
                  hasMedia ? "block" : "flex"
                } relative w-full gap-4 px-4 py-4 text-left transition-colors hover:bg-zinc-50 ${
                  item.is_read ? "bg-white" : "bg-emerald-50/40"
                } ${storefrontPath ? "cursor-pointer" : ""}`;

                const handleOpen = () => {
                  onMarkRead(item);
                  if (storefrontPath) {
                    onClose();
                  }
                };

                const rowContent = (
                  <>
                    {!item.is_read ? (
                      <span className="absolute left-2 top-4 z-10 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    ) : null}
                    <NotificationRowBody
                      item={item}
                      storefrontPath={storefrontPath}
                      formatTime={formatTime}
                    />
                  </>
                );

                return (
                  <li key={item.id}>
                    {storefrontPath ? (
                      <Link to={storefrontPath} onClick={handleOpen} className={rowClassName}>
                        {rowContent}
                      </Link>
                    ) : (
                      <button type="button" onClick={handleOpen} className={rowClassName}>
                        {rowContent}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
