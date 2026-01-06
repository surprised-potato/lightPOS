import { db } from "../db.js";
import { Repository } from "./Repository.js";
import { generateUUID } from "../utils.js";

export async function addNotification(type, message) {
    const notification = {
        id: generateUUID(),
        type,
        message,
        timestamp: new Date().toISOString(),
        read: 0, // 0 for unread, 1 for read
        target: 'managers'
    };
    await Repository.upsert('notifications', notification);
    window.dispatchEvent(new CustomEvent('notification-updated'));
}

export async function getUnreadCount() {
    return await db.notifications.where('read').equals(0).count();
}

export async function getRecentNotifications(limit = 7, filter = 'all') {
    if (filter === 'all') {
        const unread = await db.notifications.orderBy('timestamp').reverse().filter(n => n.read === 0).toArray();
        
        if (unread.length >= limit) {
            return unread.slice(0, limit);
        }
        
        const remaining = limit - unread.length;
        const read = await db.notifications.orderBy('timestamp').reverse().filter(n => n.read === 1).limit(remaining).toArray();
        
        return [...unread, ...read];
    }

    let collection = db.notifications.orderBy('timestamp').reverse();
    
    if (filter === 'unread') {
        collection = collection.filter(n => n.read === 0);
    } else if (filter === 'read') {
        collection = collection.filter(n => n.read === 1);
    }
    
    return await collection.limit(limit).toArray();
}

export async function markAllAsRead() {
    const unread = await db.notifications.where('read').equals(0).toArray();
    await Promise.all(unread.map(n => Repository.upsert('notifications', { ...n, read: 1 })));
    window.dispatchEvent(new CustomEvent('notification-updated'));
}

export async function toggleNotificationRead(id, isRead) {
    const notification = await db.notifications.get(id);
    if (notification) {
        const nextRead = isRead === undefined ? (notification.read === 1 ? 0 : 1) : (isRead ? 1 : 0);
        await Repository.upsert('notifications', { ...notification, read: nextRead });
    }
    window.dispatchEvent(new CustomEvent('notification-updated'));
}

export async function deleteOldNotifications(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const oldNotifications = await db.notifications.where('timestamp').below(cutoff).toArray();
    await Promise.all(oldNotifications.map(n => Repository.remove('notifications', n.id)));
}