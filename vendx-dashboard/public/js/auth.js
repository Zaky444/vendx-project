import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDatabase,
  get,
  ref,
  update
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import firebaseConfig, { VALID_ROLES } from "./firebase-config.js";
import { safeText } from "./utils.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signInButton = document.getElementById("signInButton");
const authMessage = document.getElementById("authMessage");
const togglePasswordButton = document.getElementById("togglePassword");
const currentYear = document.getElementById("currentYear");

let auth = null;
let database = null;

function hasFirebasePlaceholder() {
  return Object.values(firebaseConfig).some((value) => safeText(value).includes("YOUR_"));
}

function showMessage(message, type = "error") {
  if (!authMessage) {
    return;
  }

  authMessage.textContent = message;
  authMessage.className = `auth-message show ${type}`;
}

function clearMessage() {
  if (!authMessage) {
    return;
  }

  authMessage.textContent = "";
  authMessage.className = "auth-message";
}

function setLoading(isLoading) {
  if (!signInButton) {
    return;
  }

  signInButton.disabled = isLoading;
  signInButton.classList.toggle("loading", isLoading);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getFirebaseErrorMessage(error) {
  const code = error?.code || "unknown";

  const messages = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/user-not-found": "Email tidak ditemukan.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/too-many-requests": "Terlalu banyak percobaan login. Coba lagi beberapa saat.",
    "auth/network-request-failed": "Koneksi gagal. Periksa internet dan konfigurasi Firebase."
  };

  return messages[code] || "Login gagal. Periksa email, password, dan konfigurasi Firebase.";
}

function saveSessionProfile(uid, authUser, profile) {
  const sessionProfile = {
    uid,
    email: safeText(profile.email || authUser.email),
    name: safeText(profile.name),
    role: safeText(profile.role).toLowerCase(),
    assigned_machine: safeText(profile.assigned_machine)
  };

  sessionStorage.setItem("vendx_user", JSON.stringify(sessionProfile));
  localStorage.setItem("vendx_user", JSON.stringify(sessionProfile));
}

async function validateUserProfile(uid, authUser) {
  const userSnapshot = await get(ref(database, `/users/${uid}`));

  if (!userSnapshot.exists()) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  const profile = userSnapshot.val();
  const role = safeText(profile.role).toLowerCase();

  if (profile.is_active !== true) {
    throw new Error("USER_INACTIVE");
  }

  if (!VALID_ROLES.includes(role)) {
    throw new Error("INVALID_ROLE");
  }

  await update(ref(database, `/users/${uid}`), {
    last_login: Date.now()
  });

  saveSessionProfile(uid, authUser, profile);
}

function getValidationError(error) {
  const message = error?.message;

  if (message === "USER_PROFILE_NOT_FOUND") {
    return "Profil user tidak ditemukan di database.";
  }

  if (message === "USER_INACTIVE") {
    return "Akun ini nonaktif. Hubungi admin VendX.";
  }

  if (message === "INVALID_ROLE") {
    return "Role user tidak valid untuk mengakses dashboard.";
  }

  return getFirebaseErrorMessage(error);
}

function initFirebase() {
  if (hasFirebasePlaceholder()) {
    showMessage("Konfigurasi Firebase masih placeholder. Isi firebase-config.js terlebih dahulu.");
    return false;
  }

  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);
    return true;
  } catch (error) {
    console.error("Firebase initialization failed", error);
    showMessage("Firebase gagal diinisialisasi. Periksa konfigurasi project.");
    return false;
  }
}

if (currentYear) {
  currentYear.textContent = String(new Date().getFullYear());
}

if (togglePasswordButton && passwordInput) {
  togglePasswordButton.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    togglePasswordButton.textContent = isPassword ? "Hide" : "Show";
    togglePasswordButton.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
  });
}

if (initFirebase()) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      return;
    }

    try {
      await validateUserProfile(user.uid, user);
      window.location.replace("index.html");
    } catch (error) {
      console.error("Existing session rejected", error);
      sessionStorage.removeItem("vendx_user");
      localStorage.removeItem("vendx_user");
      await signOut(auth);
      showMessage(getValidationError(error));
    }
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    if (!auth || !database) {
      showMessage("Firebase belum siap. Periksa konfigurasi Firebase.");
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      showMessage("Email tidak boleh kosong.");
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showMessage("Format email tidak valid.");
      emailInput.focus();
      return;
    }

    if (!password) {
      showMessage("Password tidak boleh kosong.");
      passwordInput.focus();
      return;
    }

    try {
      setLoading(true);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await validateUserProfile(credential.user.uid, credential.user);
      showMessage("Login berhasil. Mengalihkan ke dashboard...", "success");
      window.location.replace("index.html");
    } catch (error) {
      console.error("Login failed", error);
      if (auth?.currentUser) {
        await signOut(auth);
      }
      sessionStorage.removeItem("vendx_user");
      localStorage.removeItem("vendx_user");
      showMessage(getValidationError(error));
    } finally {
      setLoading(false);
    }
  });
}
