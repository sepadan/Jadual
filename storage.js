import { emptyDatabase } from "./data.js?v=2.0.1";

const DB_KEY = "relief-skpr-db-v1";
const QUEUE_KEY = "relief-skpr-queue-v1";

export function loadDatabase() {
  try {
    const saved = JSON.parse(localStorage.getItem(DB_KEY) || "null");
    if (!saved) return emptyDatabase();
    const fresh = emptyDatabase();
    return { ...fresh, ...saved, teachers: saved.teachers?.length ? saved.teachers : fresh.teachers };
  } catch {
    return emptyDatabase();
  }
}

export function saveDatabase(db) {
  db.updatedAt = new Date().toISOString();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function mergeRemote(local, remote) {
  if (!remote || remote.unchanged) return local;
  return {
    ...local,
    ...remote,
    school: remote.school || local.school,
    updatedAt: remote.updatedAt || new Date().toISOString(),
  };
}

export function queueWrite(action, data) {
  const queue = getQueue();
  queue.push({ id: crypto.randomUUID(), action, data, queuedAt: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export async function flushQueue(api) {
  const queue = getQueue();
  const remaining = [];
  for (const item of queue) {
    try {
      await api.write(item.action, item.data);
    } catch (error) {
      remaining.push(item);
      if (/PIN|kebenaran|akses/i.test(error.message)) break;
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return { sent: queue.length - remaining.length, remaining: remaining.length };
}
