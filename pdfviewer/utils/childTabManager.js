import TabDebugger from "./debugger.js";

// Child Tab Implementation
export class SecureChildTab {
  constructor() {
    this.tabId = null;
    this.publicKey = null;
    this.aesKey = null;
    this.counter = 0;
    this.callbacks = new Map();
    this.listeners = new Map();
    this.debug = new TabDebugger("[Child]");
    this.initialized = false;
    this.initPromise = new Promise((resolve) => {
      this.resolveInit = resolve;
    });

    if (document.readyState === "complete") {
      this.sendReady();
    } else {
      window.addEventListener("load", () => this.sendReady());
    }

    this.on("healthCheck", this.handleHealthCheck.bind(this));

    window.addEventListener("message", this.handleMessage.bind(this));
    window._secureTabDebug = this.debug;
  }

  debug(data, type = "custom") {
    this.debug.log(type, data);
  }

  async handleHealthCheck(data) {
    try {
      this.debug.log("health", "Received health check", { data });

      // Respond with an acknowledgment
      await this.postMessage({
        type: "event",
        event: "healthCheckAck",
        data: {
          receivedAt: Date.now(),
          originalTimestamp: data.timestamp,
        },
      });

      this.debug.log("health", "Sent health check acknowledgment");
    } catch (error) {
      this.debug.log("error", "Failed to send health check acknowledgment", {
        error: error.message,
      });
    }
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
  }

  off(eventName, callback) {
    if (!this.listeners.has(eventName)) return;
    this.listeners.get(eventName).delete(callback);
    if (this.listeners.get(eventName).size === 0) {
      this.listeners.delete(eventName);
    }
  }

  sendReady() {
    this.debug.log("init", "Sending ready event to parent");
    try {
      window.opener.postMessage(
        {
          type: "ready",
        },
        "*",
      );
    } catch (er) {
      //Parent has been closed
      console.warn(er);
    }
  }

  async emit(eventName, data) {
    await this.postMessage({
      type: "event",
      event: eventName,
      data: data,
    });
  }

  async init(data) {
    try {
      this.debug.log("init", "Initializing child tab", { tabId: data.tabId });

      if (!data.publicKey || !data.aesKey) {
        throw new Error("Missing required key data");
      }

      this.tabId = data.tabId;

      this.debug.log("crypto", "Importing public key");
      this.publicKey = await window.crypto.subtle.importKey(
        "jwk",
        data.publicKey,
        {
          name: "RSA-OAEP",
          hash: "SHA-256",
        },
        true,
        ["encrypt"],
      );

      this.debug.log("crypto", "Importing AES key");
      this.aesKey = await window.crypto.subtle.importKey(
        "jwk",
        data.aesKey,
        {
          name: "AES-GCM",
        },
        true,
        ["encrypt", "decrypt"],
      );

      // Send acknowledgment back to parent
      window.opener.postMessage(
        {
          type: "init_ack",
          tabId: this.tabId,
        },
        "*",
      );

      this.initialized = true;
      this.resolveInit();
      this.debug.log("init", "Child tab initialized successfully");
    } catch (error) {
      this.debug.log("error", "Initialization failed", { error: error.message });
      throw error;
    }
  }

  async waitForInit() {
    await this.initPromise;
    if (!this.initialized) {
      throw new Error("Initialization failed");
    }
  }

  async encryptMessage(message) {
    this.debug.log("crypto", "Encrypting message");
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encodedMessage = new TextEncoder().encode(JSON.stringify(message));
    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      this.aesKey,
      encodedMessage,
    );

    this.debug.log("crypto", "Message encrypted successfully");
    return {
      encrypted: Array.from(new Uint8Array(encryptedData)),
      iv: Array.from(iv),
    };
  }

  async decryptMessage(encryptedData, iv) {
    await this.waitForInit();
    this.debug.log("crypto", "Decrypting message");

    if (!this.aesKey) {
      this.debug.log("error", "No AES key available");
      throw new Error("No AES key available");
    }

    try {
      // Verify input parameters
      if (
        !ArrayBuffer.isView(new Uint8Array(encryptedData)) ||
        !ArrayBuffer.isView(new Uint8Array(iv))
      ) {
        this.debug.log("error", "Invalid input format for decryption");
        throw new Error("Invalid input format for decryption");
      }

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(iv),
        },
        this.aesKey,
        new Uint8Array(encryptedData),
      );

      const decoded = JSON.parse(new TextDecoder().decode(decrypted));
      this.debug.log("crypto", "Message decrypted successfully");
      return decoded;
    } catch (error) {
      this.debug.log("error", "Decryption failed", { error: error.message });
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  async postMessage(message, callback) {
    if (!this.aesKey) {
      this.debug.log("error", "Cannot send message - not initialized");
      throw new Error("Not initialized");
    }

    this.debug.log("message", "Sending message to parent", { message });
    const messageId = this.counter++;
    if (callback) {
      this.callbacks.set(messageId, callback);
    }

    const { encrypted, iv } = await this.encryptMessage({
      id: messageId,
      data: message,
    });

    this.debug.log("message", "Posting encrypted message to parent", { messageId });
    window.opener.postMessage(
      {
        type: "message",
        encrypted,
        iv,
      },
      "*",
    );
  }

  async handleMessage(event) {
    if (!event.data || !event.data.type) {
      this.debug.log("message", "Received invalid message format");
      return;
    }

    try {
      this.debug.log("message", `Received ${event.data.type} from parent`);

      if (event.data.type === "init") {
        await this.init(event.data);
        return;
      }

      // All other message types require initialization
      await this.waitForInit();

      if (event.data.type === "message") {
        const decrypted = await this.decryptMessage(event.data.encrypted, event.data.iv);
        this.debug.log("message", "Processing message", { messageId: decrypted.id });

        if (decrypted.data.type === "event") {
          if (this.listeners.has(decrypted.data.event)) {
            this.debug.log("event", `Triggering event: ${decrypted.data.event}`, {
              listenerCount: this.listeners.get(decrypted.data.event).size,
            });
            this.listeners.get(decrypted.data.event).forEach((listener) => {
              listener(decrypted.data.data);
            });
          }
        }

        const { encrypted, iv } = await this.encryptMessage({
          id: decrypted.id,
          data: decrypted.data,
        });

        this.debug.log("message", "Sending response to parent", { messageId: decrypted.id });
        window.opener.postMessage(
          {
            type: "response",
            encrypted,
            iv,
          },
          "*",
        );
      }
    } catch (error) {
      this.debug.log("error", "Error handling message", { error: error.message });
    }
  }
}
