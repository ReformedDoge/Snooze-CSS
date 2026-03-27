// Pengu's DataStore wrappers
// Centralises all try/catch and JSON handling so no other file needs to repeat it.

export const Storage = {
  async get(key, fallback = null) {
    try {
      const val = await DataStore.get(key);
      if (val === null || val === undefined) return fallback;
      // Try JSON parse, fall back to raw string
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    } catch (e) {
      console.warn("[Snooze-CSS] Storage.get failed for key:", key, e);
      return fallback;
    }
  },

  async set(key, value) {
    try {
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);
      await DataStore.set(key, serialized);
      return true;
    } catch (e) {
      console.error("[Snooze-CSS] Storage.set failed for key:", key, e);
      return false;
    }
  },

  async remove(key) {
    try {
      await DataStore.remove(key);
      return true;
    } catch (e) {
      console.error("[Snooze-CSS] Storage.remove failed for key:", key, e);
      return false;
    }
  },

  // Remove multiple keys at once
  async removeAll(...keys) {
    return Promise.all(keys.map((k) => this.remove(k)));
  },
};
