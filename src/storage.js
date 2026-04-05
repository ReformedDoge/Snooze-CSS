// DATA STORAGE

export const Storage = {
  async get(key, fallback = null) {
    try {
      const val = await DataStore.get(key);
      if (val === null || val === undefined) return fallback;
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

  async removeAll(...keys) {
    return Promise.all(keys.map((k) => this.remove(k)));
  },
};

// CSS PROFILES SYSTEM

const PROFILES_KEY = "Snooze-CSS-profiles";
const LEGACY_CSS_KEY = "Snooze-CSS-css";

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Migration handler
export async function getProfiles() {
  let data = await Storage.get(PROFILES_KEY, null);

  if (data && data.profiles && data.profiles.length > 0) {
    return data;
  }

  const legacyCSS = await Storage.get(LEGACY_CSS_KEY, "");
  const defaultProfile = {
    id: "default",
    name: "Default",
    css: typeof legacyCSS === "string" ? legacyCSS : "",
  };

  data = {
    activeId: "default",
    profiles: [defaultProfile],
  };

  await Storage.set(PROFILES_KEY, data);
  return data;
}

// Save profiles
export async function saveProfiles(data) {
  await Storage.set(PROFILES_KEY, data);
  const active = data.profiles.find((p) => p.id === data.activeId);
  if (active) {
    await Storage.set(LEGACY_CSS_KEY, active.css);
  }
}

// Get active profile CSS
export async function getActiveProfileCSS() {
  const data = await getProfiles();
  const active = data.profiles.find((p) => p.id === data.activeId);
  return active ? active.css : "";
}

// Create new profile
export function createProfile(data, name) {
  const profile = { id: makeId(), name: name || "New Profile", css: "" };
  data.profiles.push(profile);
  return profile;
}

// Export profile to .css file
export function exportProfile(profile) {
  const blob = new Blob([profile.css], { type: "text/css" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${profile.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.css`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import .css file into new profile
export function importProfile(data) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".css,text/css";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        document.body.removeChild(input);
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const name = file.name.replace(/\.css$/i, "");
        const profile = {
          id: makeId(),
          name: name || "Imported",
          css: reader.result || "",
        };
        data.profiles.push(profile);
        document.body.removeChild(input);
        resolve(profile);
      };
      reader.onerror = () => {
        document.body.removeChild(input);
        resolve(null);
      };
      reader.readAsText(file);
    });

    input.click();
  });
}
