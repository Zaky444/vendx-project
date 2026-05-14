export function formatRupiah(value) {
  const numberValue = Number(value) || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(numberValue);
}

export function formatTimestamp(timestamp) {
  const numberValue = Number(timestamp) || 0;

  if (numberValue <= 0) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(new Date(numberValue));
}

export function safeText(value) {
  if (value === null || value === undefined || value === "") {
    return "NONE";
  }

  return String(value);
}

export function getStockLevel(stock) {
  const numberValue = Number(stock) || 0;

  if (numberValue > 5) {
    return "NORMAL";
  }

  if (numberValue > 0 && numberValue <= 5) {
    return "LOW STOCK";
  }

  return "OUT OF STOCK";
}

export function getBadgeClass(status) {
  const normalized = safeText(status).toUpperCase().replace(/\s+/g, "_");

  const classMap = {
    ONLINE: "badge-online",
    OFFLINE: "badge-offline",
    IDLE: "badge-idle",
    DISPENSING: "badge-dispensing",
    WAITING_PAYMENT: "badge-waiting-payment",
    PAID: "badge-paid",
    PENDING: "badge-pending",
    SUCCESS: "badge-success",
    FAILED: "badge-failed",
    ERROR: "badge-error",
    NONE: "badge-none",
    NORMAL: "badge-normal",
    LOW_STOCK: "badge-low-stock",
    OUT_OF_STOCK: "badge-out-of-stock",
    ACTIVE: "badge-active",
    INACTIVE: "badge-inactive",
    COMPLETED: "badge-success"
  };

  return classMap[normalized] || "badge-none";
}

export function getStatusClass(status) {
  return getBadgeClass(status);
}

export function setText(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = safeText(value);
  }
}

export function setBadge(elementId, value) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  const text = safeText(value).toUpperCase();
  element.textContent = text;
  element.className = `badge ${getBadgeClass(text)}`;
}

export function escapeHtml(value) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
