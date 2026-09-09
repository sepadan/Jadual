const CONFIG_KEY = "relief-skpr-config-v1";

export function loadConfig() {
  try {
    return { apiUrl: "", adminPin: "", autoSync: true, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}") };
  } catch {
    return { apiUrl: "", adminPin: "", autoSync: true };
  }
}

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export class ApiClient {
  constructor(config) {
    this.config = config;
  }

  isConfigured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(this.config.apiUrl || "");
  }

  async health() {
    if (!this.isConfigured()) throw new Error("URL API Apps Script belum ditetapkan.");
    const response = await fetch(`${this.config.apiUrl}?action=health&_=${Date.now()}`, { cache: "no-store" });
    return this.readResponse(response);
  }

  async bootstrap(sinceRevision = -1) {
    if (!this.isConfigured()) throw new Error("URL API Apps Script belum ditetapkan.");
    const response = await fetch(`${this.config.apiUrl}?action=bootstrap&sinceRevision=${encodeURIComponent(sinceRevision)}&_=${Date.now()}`, { cache: "no-store" });
    return this.readResponse(response);
  }

  async write(action, data) {
    if (!this.isConfigured()) throw new Error("URL API Apps Script belum ditetapkan.");
    const response = await fetch(this.config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, pin: this.config.adminPin, data }),
      redirect: "follow",
    });
    return this.readResponse(response);
  }

  async readResponse(response) {
    if (!response.ok) throw new Error(`Sambungan gagal (${response.status}).`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Operasi tidak berjaya.");
    return payload;
  }
}
