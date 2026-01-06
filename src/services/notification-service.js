import { db } from "../db.js";

export async function addNotification(type, message) {
    const notification = {
        type,
        message,
        timestamp: new Date().toISOString(),
        read: 0 // 0 for unread, 1 for read
    };
    await db.notifications.add(notification);
    window.dispatchEvent(new CustomEvent('notification-updated'));
}

export async function getUnreadCount() {
    return await db.notifications.where('read').equals(0).count();
}

export async function getRecentNotifications(limit = 7) {
    return await db.notifications.orderBy('timestamp').reverse().limit(limit).toArray();
}

export async function markAllAsRead() {
    await db.notifications.where('read').equals(0).modify({ read: 1 });
    window.dispatchEvent(new CustomEvent('notification-updated'));
}

export async function toggleNotificationRead(id, isRead) {
    await db.notifications.update(id, { read: isRead ? 1 : 0 });
    window.dispatchEvent(new CustomEvent('notification-updated'));
}

export async function deleteOldNotifications(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    await db.notifications.where('timestamp').below(cutoff).delete();
}