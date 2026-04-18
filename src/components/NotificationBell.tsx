"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { useNotificationStore } from "@/lib/notifications";
import type { AppNotification } from "@/lib/notifications";
import Link from "next/link";

const TYPE_ICONS: Record<string, string> = {
  success: "✅",
  info: "📋",
  warning: "⚠️",
  score: "📊",
};

function relativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, markRead, markAllRead, clearAll } = useNotificationStore();

  const unreadCount = notifications.filter(n => !n.read).length;
  const recent = notifications.slice(0, 10);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleOpen = () => {
    setOpen(prev => !prev);
  };

  const handleNotifClick = (notif: AppNotification) => {
    markRead(notif.id);
    if (!notif.link) setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="relative flex items-center justify-center w-9 h-9 min-h-[44px] min-w-[44px] rounded-full hover:bg-accent/20 transition-colors"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  title="Mark all as read"
                  aria-label="Mark all notifications as read"
                  className="p-1.5 rounded-md hover:bg-accent/20 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  title="Clear all"
                  aria-label="Clear all notifications"
                  className="p-1.5 rounded-md hover:bg-red-100 transition-colors text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close notifications panel"
                className="p-1.5 rounded-md hover:bg-accent/20 transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {recent.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No notifications yet
              </div>
            ) : (
              recent.map(notif => {
                const icon = TYPE_ICONS[notif.type] ?? "🔔";
                const content = (
                  <div
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/10 ${
                      !notif.read ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <span className="text-base mt-0.5 flex-shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!notif.read ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {notif.message.replace(/^[✅📋⚠️💡🔄📊]\s/, "")}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {relativeTime(notif.timestamp)}
                      </p>
                    </div>
                    {!notif.read && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    )}
                  </div>
                );

                return notif.link ? (
                  <Link href={notif.link} key={notif.id}>
                    {content}
                  </Link>
                ) : (
                  <div key={notif.id}>{content}</div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 10 && (
            <div className="px-4 py-2 border-t border-border bg-muted/20 text-center">
              <span className="text-xs text-muted-foreground">
                Showing 10 of {notifications.length} notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
