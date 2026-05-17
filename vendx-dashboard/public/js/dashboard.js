import { logoutUser, requireAuth } from "./auth-guard.js";
import {
  escapeHtml,
  formatRupiah,
  formatTimestamp,
  getBadgeClass,
  getStockLevel,
  safeText,
  setBadge,
  setText
} from "./utils.js";

let currentUser = null;
let machineId = "VM001";
let latestItems = {};
let toastTimer = null;
let dashboardPollingTimer = null;
let dashboardLoadErrorShown = false;

const API_BASE_URL = "https://api.vendx.site";

const restockModal = document.getElementById("restockModal");
const restockForm = document.getElementById("restockForm");
const restockItemId = document.getElementById("restockItemId");
const restockItemName = document.getElementById("restockItemName");
const restockCurrentStock = document.getElementById("restockCurrentStock");
const restockAmount = document.getElementById("restockAmount");
const restockError = document.getElementById("restockError");
const submitRestock = document.getElementById("submitRestock");

function createBadge(value) {
  const text = safeText(value).toUpperCase();
  return `<span class="badge ${getBadgeClass(text)}">${escapeHtml(text)}</span>`;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) {
    return;
  }

  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 3200);
}

async function apiRequest(endpoint, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  const requestOptions = {
    ...options,
    headers
  };

  if (requestOptions.body && typeof requestOptions.body !== "string") {
    requestOptions.body = JSON.stringify(requestOptions.body);
    requestOptions.headers = {
      ...requestOptions.headers,
      "Content-Type": "application/json"
    };
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, requestOptions);
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    const error = new Error(result?.message || "Backend request failed");
    error.status = response.status;
    error.details = result?.details || null;
    throw error;
  }

  return result.data;
}

function setRealtimeState(message, isConnected = true) {
  const label = document.getElementById("realtimeStatus");
  const dot = document.querySelector(".pulse-dot");

  if (label) {
    label.textContent = message;
  }

  if (dot) {
    dot.style.background = isConnected ? "#4ade80" : "#fb7185";
  }
}

function updateClock() {
  const clock = document.getElementById("currentClock");
  if (!clock) {
    return;
  }

  clock.textContent = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(new Date());
}

function renderUserProfile(user) {
  setText("userName", user.name);
  setText("userRole", user.role);
  setText("userMachine", user.assigned_machine);
  setText("machineIdLabel", machineId);

  const itemsPathLabel = document.getElementById("itemsPathLabel");
  const orderPathLabel = document.getElementById("orderPathLabel");

  if (itemsPathLabel) {
    itemsPathLabel.textContent = `Data produk dari Backend API /api/machines/${machineId}/items`;
  }

  if (orderPathLabel) {
    orderPathLabel.textContent = `Order aktif dari Backend API /api/machines/${machineId}/current-order`;
  }
}

function renderInfo(info = {}) {
  setText("machineName", info.machine_name);
  setText("machineLocation", info.location);
  setText("machineModel", info.model);
  setText("firmwareVersion", info.firmware_version);
}

function renderStatus(status = {}) {
  const connection = safeText(status.connection);
  const machineState = safeText(status.machine_state);
  const lastUpdated = Number(status.last_updated || status.last_update) || 0;

  setText("connectionValue", connection);
  setBadge("connectionBadge", connection);

  setText("machineStateValue", machineState);
  setBadge("machineStateBadge", machineState);

  const lastUpdatedElement = document.getElementById("lastUpdated");
  if (lastUpdatedElement) {
    lastUpdatedElement.textContent = formatTimestamp(lastUpdated);
  }
}

function getStockColor(stockLevel) {
  if (stockLevel === "OUT OF STOCK") {
    return "#c93434";
  }

  if (stockLevel === "LOW STOCK") {
    return "#f59e0b";
  }

  return "#16a34a";
}

function canRestock() {
  return currentUser?.role === "admin" || currentUser?.role === "operator";
}

function isValidPaymentUrl(paymentUrl) {
  const value = safeText(paymentUrl).trim();
  return value !== "" && value.toUpperCase() !== "NONE";
}

function normalizeList(data) {
  if (Array.isArray(data)) {
    return data;
  }

  return Object.values(data || {});
}

function renderItems(items = {}) {
  latestItems = items || {};
  const tableBody = document.getElementById("itemsTableBody");
  if (!tableBody) {
    return;
  }

  const rows = Object.entries(latestItems)
    .sort(([, itemA], [, itemB]) => (Number(itemA?.slot_number) || 0) - (Number(itemB?.slot_number) || 0))
    .map(([itemId, item]) => {
      const stock = Number(item?.stock) || 0;
      const stockLevel = getStockLevel(stock);
      const activeLabel = item?.is_active === true ? "ACTIVE" : "INACTIVE";
      const stockWidth = Math.max(0, Math.min(100, (stock / 12) * 100));
      const restockDisabled = canRestock() ? "" : "disabled";

      return `
        <tr>
          <td>${Number(item?.slot_number) || 0}</td>
          <td>${escapeHtml(itemId)}</td>
          <td>
            <div class="item-name">
              <strong>${escapeHtml(item?.name)}</strong>
              <span>${escapeHtml(itemId)}</span>
            </div>
          </td>
          <td>${formatRupiah(item?.price)}</td>
          <td>
            <div class="stock-cell">
              <strong>${stock}</strong>
              <div class="stock-bar" style="--stock-width: ${stockWidth}%; --stock-color: ${getStockColor(stockLevel)}">
                <span></span>
              </div>
            </div>
          </td>
          <td>${createBadge(activeLabel)}</td>
          <td>${createBadge(stockLevel)}</td>
          <td>
            <button class="restock-button" type="button" data-restock-id="${escapeHtml(itemId)}" ${restockDisabled}>
              Restock
            </button>
          </td>
        </tr>
      `;
    });

  tableBody.innerHTML = rows.length
    ? rows.join("")
    : '<tr><td colspan="8" class="empty-state">No data available</td></tr>';
}

function renderCurrentOrder(order = {}) {
  const container = document.getElementById("currentOrderContent");
  if (!container) {
    return;
  }

  if (!order || safeText(order.transaction_id).toUpperCase() === "NONE") {
    container.innerHTML = `
      <div class="empty-state block">
        <div class="empty-icon">i</div>
        <strong>No active order</strong>
        <span>Mesin saat ini tidak sedang memproses pesanan.</span>
      </div>
    `;
    return;
  }

  const paymentState = safeText(order.payment_state).toUpperCase();
  const transactionId = safeText(order.transaction_id);
  const primaryPaymentUrl = isValidPaymentUrl(order.payment_url) ? order.payment_url : order.qr_url;
  const paymentUrl = safeText(primaryPaymentUrl);
  const hasPaymentUrl = isValidPaymentUrl(paymentUrl);
  const paymentUrlContent = hasPaymentUrl
    ? `<a href="${escapeHtml(paymentUrl)}" target="_blank" rel="noopener noreferrer">${safeText(order.payment_method).toLowerCase() === "qris" ? "Open QRIS URL" : "Open Midtrans Payment"}</a>`
    : "NONE";
  const openPaymentButton = paymentState === "WAITING_PAYMENT" && hasPaymentUrl
    ? `
      <div class="order-row">
        <span>Action</span>
        <span>
          <button class="open-payment-button restock-button" type="button" data-open-payment-url="${escapeHtml(paymentUrl)}">
            Open Payment
          </button>
        </span>
      </div>
    `
    : "";

  container.innerHTML = `
    <div class="order-grid">
      <div class="order-row"><span>Transaction ID</span><span>${escapeHtml(transactionId)}</span></div>
      <div class="order-row"><span>Session ID</span><span>${escapeHtml(order.session_id)}</span></div>
      <div class="order-row"><span>Item ID</span><span>${escapeHtml(order.item_id)}</span></div>
      <div class="order-row"><span>Item Name</span><span>${escapeHtml(order.item_name)}</span></div>
      <div class="order-row"><span>Quantity</span><span>${Number(order.qty) || 0}</span></div>
      <div class="order-row"><span>Total Price</span><span>${formatRupiah(order.total_price)}</span></div>
      <div class="order-row"><span>Payment Method</span><span>${escapeHtml(order.payment_method)}</span></div>
      <div class="order-row"><span>Payment State</span><span>${createBadge(order.payment_state)}</span></div>
      <div class="order-row"><span>Order State</span><span>${createBadge(order.order_state)}</span></div>
      <div class="order-row"><span>Dispense Result</span><span>${createBadge(order.dispense_result)}</span></div>
      <div class="order-row"><span>Payment URL</span><span>${paymentUrlContent}</span></div>
      ${openPaymentButton}
    </div>
  `;
}

function canSeeMachine(machineIdValue) {
  if (!currentUser) {
    return false;
  }

  if (currentUser.role === "admin") {
    return true;
  }

  return safeText(machineIdValue) === safeText(currentUser.assigned_machine);
}

function getTransactionTime(transaction) {
  return Number(transaction?.updated_at || transaction?.created_at) || 0;
}

function sortNewestFirst(a, b) {
  return getTransactionTime(b) - getTransactionTime(a);
}

function isSuccessfulTransaction(transaction) {
  const status = safeText(transaction?.status).toUpperCase();
  const dispenseResult = safeText(transaction?.dispense_result).toUpperCase();

  return status === "COMPLETED" || status === "SUCCESS" || dispenseResult === "SUCCESS";
}

function isToday(timestamp) {
  if (!timestamp) {
    return false;
  }

  const date = new Date(timestamp);
  const now = new Date();

  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function isThisMonth(timestamp) {
  if (!timestamp) {
    return false;
  }

  const date = new Date(timestamp);
  const now = new Date();

  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth();
}

function calculateAnalytics(transactions = {}) {
  const visibleSuccessfulTransactions = normalizeList(transactions)
    .filter((transaction) => canSeeMachine(transaction?.machine_id))
    .filter(isSuccessfulTransaction);

  const todayTransactions = visibleSuccessfulTransactions.filter((transaction) => isToday(getTransactionTime(transaction)));
  const monthlyTransactions = visibleSuccessfulTransactions.filter((transaction) => isThisMonth(getTransactionTime(transaction)));

  const todayRevenue = todayTransactions.reduce((total, transaction) => total + (Number(transaction?.total_price) || 0), 0);
  const monthlyRevenue = monthlyTransactions.reduce((total, transaction) => total + (Number(transaction?.total_price) || 0), 0);

  return {
    todayOrders: todayTransactions.length,
    monthlyOrders: monthlyTransactions.length,
    todayRevenue,
    monthlyRevenue
  };
}

function renderSummaryCards(transactions = {}) {
  const analytics = calculateAnalytics(transactions);

  setText("todayOrders", analytics.todayOrders);
  setText("monthlyOrders", analytics.monthlyOrders);
  setText("todayRevenue", formatRupiah(analytics.todayRevenue));
  setText("monthlyRevenue", formatRupiah(analytics.monthlyRevenue));
}

function renderTransactions(transactions = {}) {
  renderSummaryCards(transactions);

  const tableBody = document.getElementById("transactionsTableBody");
  if (!tableBody) {
    return;
  }

  const rows = normalizeList(transactions)
    .filter((transaction) => canSeeMachine(transaction?.machine_id))
    .sort(sortNewestFirst)
    .slice(0, 5)
    .map((transaction) => `
      <tr>
        <td>${escapeHtml(transaction?.transaction_id)}</td>
        <td>${escapeHtml(transaction?.item_name)}</td>
        <td>${Number(transaction?.qty) || 0}</td>
        <td>${formatRupiah(transaction?.total_price)}</td>
        <td>${createBadge(transaction?.payment_state)}</td>
        <td>${createBadge(transaction?.status)}</td>
        <td>${createBadge(transaction?.dispense_result)}</td>
        <td>${formatTimestamp(getTransactionTime(transaction))}</td>
      </tr>
    `);

  tableBody.innerHTML = rows.length
    ? rows.join("")
    : '<tr><td colspan="8" class="empty-state">No data available</td></tr>';
}

function renderLogs(logs = {}) {
  const logsList = document.getElementById("logsList");
  if (!logsList) {
    return;
  }

  const rows = normalizeList(logs)
    .filter((log) => canSeeMachine(log?.machine_id))
    .sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0))
    .slice(0, 5)
    .map((log) => `
      <div class="log-item">
        <div class="log-time">${formatTimestamp(log?.timestamp)}</div>
        <div class="log-body">
          <strong>${escapeHtml(log?.event)}</strong>
          <span>${escapeHtml(log?.message)}</span>
        </div>
      </div>
    `);

  logsList.innerHTML = rows.length
    ? rows.join("")
    : `
      <div class="empty-state block">
        <div class="empty-icon">i</div>
        <strong>No logs available</strong>
        <span>Aktivitas mesin akan muncul di sini.</span>
      </div>
    `;
}

function openRestockModal(itemId) {
  const item = latestItems[itemId];
  if (!item) {
    showToast("Data item tidak ditemukan.", "error");
    return;
  }

  if (!canRestock()) {
    showToast("Role ini tidak memiliki akses restock.", "error");
    return;
  }

  restockItemId.value = itemId;
  restockItemName.textContent = safeText(item.name);
  restockCurrentStock.textContent = String(Number(item.stock) || 0);
  restockAmount.value = "";
  restockError.textContent = "";
  restockModal.classList.add("open");
  restockModal.setAttribute("aria-hidden", "false");
  restockAmount.focus();
}

function closeRestockModal() {
  restockModal.classList.remove("open");
  restockModal.setAttribute("aria-hidden", "true");
}

async function restockItem(itemId, amount) {
  await apiRequest(`/api/machines/${machineId}/items/${encodeURIComponent(itemId)}/restock`, {
    method: "POST",
    body: {
      amount
    }
  });
}

async function loadMachineInfo() {
  try {
    const overview = await apiRequest(`/api/machines/${machineId}/overview`);
    renderInfo(overview.info || {});
  } catch (error) {
    console.warn("Machine info unavailable from backend overview", error);
  }
}

async function loadDashboardData() {
  try {
    const [itemsData, statusData, currentOrder, transactionsData, logsData] = await Promise.all([
      apiRequest(`/api/machines/${machineId}/items`),
      apiRequest(`/api/machines/${machineId}/status`),
      apiRequest(`/api/machines/${machineId}/current-order`),
      apiRequest(`/api/transactions?machine_id=${encodeURIComponent(machineId)}&limit=5`),
      apiRequest(`/api/logs?machine_id=${encodeURIComponent(machineId)}&limit=5`)
    ]);

    renderItems(itemsData.items || {});
    renderStatus(statusData.status || {});
    renderCurrentOrder(currentOrder || {});
    renderTransactions(transactionsData.transactions || []);
    renderLogs(logsData.logs || []);
    setRealtimeState("Backend connected", true);
    dashboardLoadErrorShown = false;
  } catch (error) {
    console.error("Dashboard data load failed", error);
    setRealtimeState("Backend connection error", false);

    if (!dashboardLoadErrorShown) {
      showToast("Gagal memuat data dashboard.", "error");
      dashboardLoadErrorShown = true;
    }
  }
}

function startDashboardPolling() {
  stopDashboardPolling();
  loadMachineInfo();
  loadDashboardData();
  dashboardPollingTimer = setInterval(loadDashboardData, 3000);
}

function stopDashboardPolling() {
  if (dashboardPollingTimer) {
    clearInterval(dashboardPollingTimer);
    dashboardPollingTimer = null;
  }
}

document.addEventListener("click", (event) => {
  const openPaymentButton = event.target.closest("[data-open-payment-url]");
  if (openPaymentButton) {
    const paymentUrl = openPaymentButton.dataset.openPaymentUrl;

    if (!isValidPaymentUrl(paymentUrl)) {
      showToast("Payment URL tidak tersedia.", "error");
      return;
    }

    window.open(paymentUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const restockButton = event.target.closest("[data-restock-id]");
  if (restockButton) {
    openRestockModal(restockButton.dataset.restockId);
  }
});

document.getElementById("closeRestockModal")?.addEventListener("click", closeRestockModal);
document.getElementById("cancelRestock")?.addEventListener("click", closeRestockModal);

restockModal?.addEventListener("click", (event) => {
  if (event.target === restockModal) {
    closeRestockModal();
  }
});

restockForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const itemId = restockItemId.value;
  const amount = Number(restockAmount.value);

  if (!Number.isInteger(amount) || amount <= 0) {
    restockError.textContent = "Jumlah restock harus angka positif.";
    restockAmount.focus();
    return;
  }

  try {
    submitRestock.disabled = true;
    restockError.textContent = "";
    await restockItem(itemId, amount);
    await loadDashboardData();
    closeRestockModal();
    showToast(`Stok ${itemId} berhasil ditambah ${amount} unit.`, "success");
  } catch (error) {
    console.error("Restock failed", error);
    restockError.textContent = "Restock gagal. Periksa koneksi Backend API.";
    showToast("Restock gagal disimpan.", "error");
  } finally {
    submitRestock.disabled = false;
  }
});

const logoutButton = document.getElementById("logoutButton");
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    stopDashboardPolling();
    await logoutUser();
  });
}

updateClock();
setInterval(updateClock, 30000);

try {
  const session = await requireAuth();
  currentUser = session.user;
  machineId = safeText(currentUser.assigned_machine);
  renderUserProfile(currentUser);
  setRealtimeState("Connecting to Backend API", true);
  startDashboardPolling();
} catch (error) {
  if (error?.message !== "FIREBASE_CONFIG_REQUIRED") {
    console.error("Dashboard initialization failed", error);
  }
  setRealtimeState("Dashboard auth failed", false);
}
