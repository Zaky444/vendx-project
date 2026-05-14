import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDatabase,
  get,
  ref
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import firebaseConfig, { DEFAULT_MACHINE_ID, VALID_ROLES } from "./firebase-config.js";
import { safeText } from "./utils.js";

let app = null;
let auth = null;
let database = null;

function hasFirebasePlaceholder() {
  return Object.values(firebaseConfig).some((value) => safeText(value).includes("YOUR_"));
}

function saveSessionProfile(profile) {
  sessionStorage.setItem("vendx_user", JSON.stringify(profile));
  localStorage.setItem("vendx_user", JSON.stringify(profile));
}

function clearSessionProfile() {
  sessionStorage.removeItem("vendx_user");
  localStorage.removeItem("vendx_user");
}

function redirectToLogin(reason = "auth_required") {
  const target = `login.html?reason=${encodeURIComponent(reason)}`;
  window.location.replace(target);
}

function buildProfile(uid, authUser, databaseUser) {
  return {
    uid,
    email: safeText(databaseUser.email || authUser.email),
    name: safeText(databaseUser.name),
    role: safeText(databaseUser.role).toLowerCase(),
    assigned_machine: safeText(databaseUser.assigned_machine || DEFAULT_MACHINE_ID)
  };
}

async function rejectSession(reason) {
  clearSessionProfile();
  if (auth?.currentUser) {
    await signOut(auth);
  }
  redirectToLogin(reason);
}

export function getStoredUserProfile() {
  const rawProfile = sessionStorage.getItem("vendx_user") || localStorage.getItem("vendx_user");

  if (!rawProfile) {
    return null;
  }

  try {
    return JSON.parse(rawProfile);
  } catch (error) {
    clearSessionProfile();
    return null;
  }
}

export async function logoutUser() {
  clearSessionProfile();

  if (auth?.currentUser) {
    await signOut(auth);
  }

  window.location.replace("login.html");
}

export function requireAuth() {
  return new Promise((resolve, reject) => {
    if (hasFirebasePlaceholder()) {
      reject(new Error("FIREBASE_CONFIG_REQUIRED"));
      return;
    }

    try {
      app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      auth = getAuth(app);
      database = getDatabase(app);
    } catch (error) {
      reject(error);
      return;
    }

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        redirectToLogin("auth_required");
        return;
      }

      try {
        const userSnapshot = await get(ref(database, `/users/${user.uid}`));

        if (!userSnapshot.exists()) {
          await rejectSession("profile_not_found");
          return;
        }

        const databaseUser = userSnapshot.val();
        const role = safeText(databaseUser.role).toLowerCase();

        if (databaseUser.is_active !== true) {
          await rejectSession("inactive");
          return;
        }

        if (!VALID_ROLES.includes(role)) {
          await rejectSession("invalid_role");
          return;
        }

        const profile = buildProfile(user.uid, user, databaseUser);
        saveSessionProfile(profile);
        resolve({ app, auth, database, user: profile });
      } catch (error) {
        clearSessionProfile();
        reject(error);
      }
    });
  });
}
