// Fake firebase-admin untuk test: Realtime Database in-memory, tanpa kredensial asli.
// Dipasang lewat moduleNameMapper di jest.config.js.

const store = new Map();

function snapshotOf(path) {
  const value = store.has(path) ? store.get(path) : null;

  return {
    val: () => value,
    exists: () => store.has(path)
  };
}

function refOf(path) {
  return {
    once: async () => {
      // checkFirebase() membaca ".info/connected"; dianggap selalu terhubung.
      if (path === ".info/connected") {
        return { val: () => true, exists: () => true };
      }

      return snapshotOf(path);
    },

    set: async (value) => {
      store.set(path, value);
    },

    update: async (value) => {
      store.set(path, { ...(store.get(path) || {}), ...value });
    },

    push: () => {
      const key = `FAKE${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      return { key, ...refOf(`${path}/${key}`) };
    },

    transaction: async (updater) => {
      const current = store.has(path) ? store.get(path) : null;
      const next = updater(current);

      if (next === undefined) {
        return { committed: false, snapshot: snapshotOf(path) };
      }

      store.set(path, next);
      return { committed: true, snapshot: snapshotOf(path) };
    }
  };
}

module.exports = {
  apps: [],
  initializeApp: () => {},
  credential: {
    cert: () => ({})
  },
  database: () => ({ ref: refOf }),

  // Helper khusus test
  __reset: () => store.clear(),
  __seed: (path, value) => {
    store.set(path, value);
  },
  __get: (path) => (store.has(path) ? store.get(path) : null)
};
