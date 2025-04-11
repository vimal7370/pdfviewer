// Debug utility class
class TabDebugger {
  constructor(prefix = "") {
    this.prefix = prefix;
    this.enabled = false;
    this.logHistory = [];
    this.maxHistory = 100;
  }

  enable() {
    this.enabled = true;
    console.log(`${this.prefix} Debugging enabled`);
  }

  disable() {
    this.enabled = false;
    console.log(`${this.prefix} Debugging disabled`);
  }

  log(type, message, data = null) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data: data ? this.sanitizeData(data) : null,
    };

    this.logHistory.unshift(logEntry);
    if (this.logHistory.length > this.maxHistory) {
      this.logHistory.pop();
    }

    console.group(`${this.prefix} ${type}`);
    console.log(message);
    if (data) console.log("Data:", data);
    console.groupEnd();
  }

  sanitizeData(data) {
    // Create safe copy of data for logging, handling circular references
    return JSON.parse(
      JSON.stringify(data, (key, value) => {
        if (value instanceof Window) return "WindowProxy";
        if (value instanceof CryptoKey) return "CryptoKey";
        if (ArrayBuffer.isView(value)) return Array.from(value);
        return value;
      }),
    );
  }

  getHistory() {
    return this.logHistory;
  }

  clearHistory() {
    this.logHistory = [];
  }
}
export default TabDebugger;
