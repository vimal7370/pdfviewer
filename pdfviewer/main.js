"use strict";

// watermark configuration

/**
 * Removes an element from an array at the specified index by shifting all subsequent elements.
 * @param {Array} array - The array to modify
 * @param {number} index - The index of the element to remove
 */
function array_remove(array, index) {
  let n = array.length;
  for (let i = index + 1; i < n; ++i) array[i - 1] = array[i];
  array.length = n - 1;
}

/**
 * Inserts an item into an array at the specified index by shifting all subsequent elements.
 * @param {Array} array - The array to modify
 * @param {number} index - The index at which to insert the item
 * @param {*} item - The item to insert
 */
function array_insert(array, index, item) {
  for (let i = array.length; i > index; --i) array[i] = array[i - 1];
  array[index] = item;
}

/**
 * Checks if a sorted set (array) contains a specific item using binary search.
 * @param {Array} set - The sorted array to search
 * @param {*} item - The item to search for
 * @returns {boolean} True if the item exists in the set, false otherwise
 */
function set_has(set, item) {
  let a = 0;
  let b = set.length - 1;
  while (a <= b) {
    let m = (a + b) >> 1;
    let x = set[m];
    if (item < x) b = m - 1;
    else if (item > x) a = m + 1;
    else return true;
  }
  return false;
}

/**
 * Adds an item to a sorted set (array) while maintaining sort order.
 * @param {Array} set - The sorted array to modify
 * @param {*} item - The item to add
 */
function set_add(set, item) {
  let a = 0;
  let b = set.length - 1;
  while (a <= b) {
    let m = (a + b) >> 1;
    let x = set[m];
    if (item < x) b = m - 1;
    else if (item > x) a = m + 1;
    else return;
  }
  array_insert(set, a, item);
}

/**
 * Removes an item from a sorted set (array) while maintaining sort order.
 * @param {Array} set - The sorted array to modify
 * @param {*} item - The item to remove
 */
function set_delete(set, item) {
  let a = 0;
  let b = set.length - 1;
  while (a <= b) {
    let m = (a + b) >> 1;
    let x = set[m];
    if (item < x) b = m - 1;
    else if (item > x) a = m + 1;
    else {
      array_remove(set, m);
      return;
    }
  }
}

// Global Variables

let globalConfig;
let isPasswordProtected = false; // Track if the current document is password protected

// LOADING AND ERROR MESSAGES

/**
 * Displays a message to the user in the message element.
 * @param {string} msg - The message to display
 * @param {boolean} showLoader - Whether to show a loading animation
 */
function show_message(msg, showLoader = false) {
  const container = document.getElementById("message");
  //incase the message container was hidden
  container.style.display = "block";
  container.innerHTML = "";

  if (showLoader) {
    // Add loading icon
    const loaderIcon = document.createElement("i");
    loaderIcon.className = "fas fa-spinner";
    container.appendChild(loaderIcon);

    // Add a line break
    container.appendChild(document.createElement("br"));
  }

  // Add the message text
  const textNode = document.createElement("span");
  textNode.textContent = msg;
  container.appendChild(textNode);
}

/**
 * Clears any displayed message.
 */
function clear_message() {
  const container = document.getElementById("message");
  container.textContent = "";
  container.style.display = "none";
}

// MENU BAR

/**
 * Closes all menu details elements except for the specified one.
 * @param {HTMLElement|null} self - The menu to keep open, or null to close all menus
 */
function close_all_menus(self) {
  for (let node of document.querySelectorAll("header > details"))
    if (node !== self) node.removeAttribute("open");
}

/* close menu if opening another */
for (let node of document.querySelectorAll("header > details")) {
  node.addEventListener("click", function () {
    close_all_menus(node);
  });
}

/* close menu after selecting something */
for (let node of document.querySelectorAll("header > details > menu")) {
  node.addEventListener("click", function () {
    close_all_menus(null);
  });
}

/* click anywhere outside the menu to close it */
window.addEventListener("mousedown", function (evt) {
  let e = evt.target;
  while (e) {
    if (e.tagName === "DETAILS") return;
    e = e.parentElement;
  }
  close_all_menus(null);
});

/* close menus if window loses focus */
window.addEventListener("blur", function () {
  close_all_menus(null);
});

// BACKGROUND WORKER

/**
 * Web Worker for handling PDF processing operations in a separate thread.
 * @type {Worker}
 */
const worker = new Worker("./worker.js", {
  type: "module",
});

worker._promise_id = 1;
worker._promise_map = new Map();

/**
 * Creates a wrapper function that communicates with the worker via promises.
 * @param {string} name - The name of the worker method to call
 * @returns {Function} A function that returns a promise resolving to the worker's response
 */
worker.wrap = function (name) {
  return function (...args) {
    return new Promise(function (resolve, reject) {
      let id = worker._promise_id++;
      worker._promise_map.set(id, { resolve, reject });
      if (args[0] instanceof ArrayBuffer)
        worker.postMessage([name, id, args], [args[0]]);
      else worker.postMessage([name, id, args]);
    });
  };
};

/**
 * Handles messages received from the worker.
 * @param {MessageEvent} event - The message event from the worker
 */
worker.onmessage = function (event) {
  let [type, id, result] = event.data;
  let error;

  switch (type) {
    case "INIT":
      for (let method of result) worker[method] = worker.wrap(method);
      main();
      break;

    case "RESULT":
      worker._promise_map.get(id).resolve(result);
      worker._promise_map.delete(id);
      break;

    case "ERROR":
      error = new Error(result.message);
      error.name = result.name;
      error.stack = result.stack;
      worker._promise_map.get(id).reject(error);
      worker._promise_map.delete(id);
      break;

    default:
      error = new Error(`Invalid message: ${type}`);
      worker._promise_map.get(id).reject(error);
      break;
  }
};

// PAGE VIEW

/**
 * Represents a single page view in the PDF document.
 * Handles rendering, text, links, and search highlighting.
 */
class PageView {
  /**
   * Creates a new PageView instance.
   * @param {number} doc - The document handle
   * @param {number} pageNumber - The 0-based page number
   * @param {Object} defaultSize - The default page size {width, height}
   * @param {number} zoom - The zoom level in DPI
   */
  constructor(doc, pageNumber, defaultSize, zoom) {
    this.doc = doc;
    this.pageNumber = pageNumber; // 0-based
    this.size = defaultSize;
    this.rotation = 0; // Track rotation angle (0, 90, 180, 270)

    this.loadPromise = false;
    this.drawPromise = false;

    this.rootNode = document.createElement("div");
    this.rootNode.id = "page" + (pageNumber + 1);
    this.rootNode.className = "page";
    this.rootNode.page = this;

    this.canvasNode = document.createElement("canvas");
    this.canvasCtx = this.canvasNode.getContext("2d");
    this.rootNode.appendChild(this.canvasNode);

    this.textData = null;
    this.textNode = document.createElement("div");
    this.textNode.className = "text";
    this.rootNode.appendChild(this.textNode);

    this.linkData = null;
    this.linkNode = document.createElement("div");
    this.linkNode.className = "link";
    this.rootNode.appendChild(this.linkNode);

    this.needle = null;
    this.loadNeedle = null;
    this.showNeedle = null;

    this.searchData = null;
    this.searchNode = document.createElement("div");
    this.searchNode.className = "search";
    this.rootNode.appendChild(this.searchNode);

    this.zoom = zoom;
    this._updateSize();
  }

  /**
   * Updates the page element size based on the current zoom level and rotation.
   * @private
   */
  _updateSize() {
    // We use the `foo | 0` notation to round down floating point numbers to integers.
    // This matches the conversion done in `mupdf.js` when `Pixmap.withBbox`
    // calls `libmupdf._wasm_new_pixmap_with_bbox`.

    // For 90 and 270 degree rotations, swap width and height
    const isRotated = this.rotation === 90 || this.rotation === 270;
    const width = isRotated ? this.size.height : this.size.width;
    const height = isRotated ? this.size.width : this.size.height;

    this.rootNode.style.width = (((width * this.zoom) / 72) | 0) + "px";
    this.rootNode.style.height = (((height * this.zoom) / 72) | 0) + "px";
    this.canvasNode.style.width = (((width * this.zoom) / 72) | 0) + "px";
    this.canvasNode.style.height = (((height * this.zoom) / 72) | 0) + "px";
  }

  /**
   * Sets the zoom level for this page.
   * @param {number} zoom - The new zoom level in DPI
   */
  setZoom(zoom) {
    if (this.zoom !== zoom) {
      this.zoom = zoom;
      this._updateSize();
    }
  }

  /**
   * Sets the rotation angle for this page.
   * @param {number} angle - The rotation angle in degrees (0, 90, 180, 270)
   */
  setRotation(angle) {
    // Normalize angle to 0, 90, 180, or 270
    angle = ((angle % 360) + 360) % 360;
    if (angle % 90 !== 0) {
      angle = Math.round(angle / 90) * 90;
    }

    if (this.rotation !== angle) {
      this.rotation = angle;
      // Force re-render with new rotation
      this.canvasNode.zoom = null;
      // Update size for rotated dimensions if needed
      this._updateSize();
      // If page is visible, trigger a render
      if (set_has(page_visible, this.pageNumber)) {
        this._render();
      }
    }
  }

  /**
   * Sets the search term for this page.
   * @param {string|null} needle - The search term or null to clear search
   */
  setSearch(needle) {
    if (this.needle !== needle) this.needle = needle;
  }

  /**
   * Loads the page data (size, text, links) from the worker.
   * @private
   * @returns {Promise} A promise that resolves when the page data is loaded
   */
  async _load() {
    console.log("LOADING", this.pageNumber);

    this.size = await worker.getPageSize(this.doc, this.pageNumber);
    this.textData = await worker.getPageText(this.doc, this.pageNumber);
    this.linkData = await worker.getPageLinks(this.doc, this.pageNumber);

    this._updateSize();
  }

  /**
   * Loads search results for the current search term.
   * @private
   * @returns {Promise} A promise that resolves when search results are loaded
   */
  async _loadSearch() {
    if (this.loadNeedle !== this.needle) {
      this.loadNeedle = this.needle;
      if (!this.needle) this.searchData = null;
      else
        this.searchData = await worker.search(
          this.doc,
          this.pageNumber,
          this.needle
        );
    }
  }

  /**
   * Shows the page by loading data and rendering content as needed.
   * @private
   * @returns {Promise} A promise that resolves when the page is ready to display
   */
  async _show() {
    if (!this.loadPromise) this.loadPromise = this._load();
    await this.loadPromise;

    // Render image if zoom factor has changed!
    if (this.canvasNode.zoom !== this.zoom) this._render();

    // (Re-)create HTML nodes if zoom factor has changed
    if (this.textNode.zoom !== this.zoom) this._showText();

    // (Re-)create HTML nodes if zoom factor has changed
    if (this.linkNode.zoom !== this.zoom) this._showLinks();

    // Reload search hits if the needle has changed.
    // TODO: race condition with multiple queued searches
    if (this.loadNeedle !== this.needle) await this._loadSearch();

    // (Re-)create HTML nodes if search changed or zoom factor changed
    if (this.showNeedle !== this.needle || this.searchNode.zoom !== this.zoom)
      this._showSearch();
  }

  /**
   * Renders the page image at the current zoom level.
   * @private
   * @returns {Promise} A promise that resolves when rendering is complete
   */
  async _render() {
    // Remember zoom value when we start rendering.
    let zoom = this.zoom;

    // If the current image node was rendered with the same arguments we skip the render.
    if (this.canvasNode.zoom === this.zoom) return;

    if (this.drawPromise) {
      // If a render is ongoing, don't queue a new render immediately!
      // When the on-going render finishes, we check the page zoom value.
      // If it is stale, we immediately queue a new render.
      console.log("BUSY DRAWING", this.pageNumber);
      return;
    }

    console.log("DRAWING", this.pageNumber, zoom);

    this.canvasNode.zoom = this.zoom;

    this.drawPromise = worker.drawPageAsPixmap(
      this.doc,
      this.pageNumber,
      zoom * devicePixelRatio,
      this.rotation
    );

    let imageData = await this.drawPromise;
    if (imageData == null) return;

    this.drawPromise = null;

    if (this.zoom === zoom) {
      // Render is still valid. Use it!
      console.log("FRESH IMAGE", this.pageNumber);
      this.canvasNode.width = imageData.width;
      this.canvasNode.height = imageData.height;
      this.canvasCtx.putImageData(imageData, 0, 0);

      // Draw watermark directly on the canvas
      // Import the drawWatermark function dynamically to avoid circular dependencies
      const { drawWatermark } = await import("./watermark.js");
      drawWatermark(
        this.canvasCtx,
        this.canvasNode.width,
        this.canvasNode.height,
        zoom / 72
      );
    } else {
      console.log("STALE IMAGE", this.pageNumber);
      if (set_has(page_visible, this.pageNumber)) this._render();
    }
  }

  /**
   * Creates HTML elements for text content with proper positioning.
   * @private
   */
  _showText() {
    this.textNode.zoom = this.zoom;
    this.textNode.replaceChildren();

    // Check if text copying is allowed based on global configuration
    const canCopyText = globalConfig.userAccess.canCopyText;

    // // Apply user-select style to the text container if copying is not allowed
    if (!canCopyText) {
      this.textNode.style.userSelect = "none";
      this.textNode.style.webkitUserSelect = "none";
    }

    let nodes = [];
    let pdf_w = [];
    let html_w = [];
    let text_len = [];
    let scale = this.zoom / 72;

    for (let block of this.textData.blocks) {
      if (block.type === "text") {
        for (let line of block.lines) {
          let text = document.createElement("span");
          text.style.left = line.bbox.x * scale + "px";
          text.style.top = (line.y - line.font.size * 0.8) * scale + "px";
          text.style.height = line.bbox.h * scale + "px";
          text.style.fontSize = line.font.size * scale + "px";
          text.style.fontFamily = line.font.family;
          text.style.fontWeight = line.font.weight;
          text.style.fontStyle = line.font.style;
          text.textContent = line.text;
          this.textNode.appendChild(text);
          nodes.push(text);
          pdf_w.push(line.bbox.w * scale);
          text_len.push(line.text.length - 1);
        }
      }
    }

    for (let i = 0; i < nodes.length; ++i) {
      if (text_len[i] > 0) html_w[i] = nodes[i].clientWidth;
    }

    for (let i = 0; i < nodes.length; ++i) {
      if (text_len[i] > 0)
        nodes[i].style.letterSpacing =
          (pdf_w[i] - html_w[i]) / text_len[i] + "px";
    }
  }

  /**
   * Creates HTML elements for links with proper positioning.
   * @private
   */
  _showLinks() {
    this.linkNode.zoom = this.zoom;
    this.linkNode.replaceChildren();

    let scale = this.zoom / 72;
    for (let link of this.linkData) {
      let a = document.createElement("a");
      a.href = link.href;
      a.style.left = link.x * scale + "px";
      a.style.top = link.y * scale + "px";
      a.style.width = link.w * scale + "px";
      a.style.height = link.h * scale + "px";
      this.linkNode.appendChild(a);
    }
  }

  /**
   * Creates HTML elements for search results with proper highlighting.
   * @private
   */
  _showSearch() {
    this.showNeedle = this.needle;
    this.searchNode.zoom = this.zoom;
    this.searchNode.replaceChildren();

    if (this.searchData) {
      let scale = this.zoom / 72;
      for (let bbox of this.searchData) {
        let div = document.createElement("div");
        div.style.left = bbox.x * scale + "px";
        div.style.top = bbox.y * scale + "px";
        div.style.width = bbox.w * scale + "px";
        div.style.height = bbox.h * scale + "px";
        this.searchNode.appendChild(div);
      }
    }
  }
}

// DOCUMENT VIEW

/**
 * The handle to the current document.
 * @type {number}
 */
var current_doc = 0;

/**
 * The current zoom level in DPI.
 * @type {number}
 */
var current_zoom = 96;

/**
 * Array of all page views in the document.
 * @type {PageView[]|null}
 */
var page_list = null;

/**
 * Tracks which pages are currently visible or near the viewport.
 * Used to prioritize rendering of visible pages.
 * @type {number[]}
 */
var page_visible = [];

/**
 * Intersection Observer that tracks which pages are visible in the viewport.
 * @type {IntersectionObserver}
 */
var page_observer = new IntersectionObserver(
  function (entries) {
    for (let entry of entries) {
      let page = entry.target.page;
      if (entry.isIntersecting) set_add(page_visible, page.pageNumber);
      else set_delete(page_visible, page.pageNumber);
    }
    queue_update_view();
  },
  {
    // This means we have 3 viewports of vertical "head start" where
    // the page is rendered before it becomes visible.
    root: document.getElementById("page-panel"),
    rootMargin: "25% 0px 300% 0px",
  }
);

/**
 * Timer ID for the update view debounce.
 * @type {number}
 */
var update_view_timer = 0;

/**
 * Queues an update of the view with debouncing.
 */
function queue_update_view() {
  if (update_view_timer) clearTimeout(update_view_timer);
  update_view_timer = setTimeout(update_view, 50);
}

/**
 * Updates the view by showing all visible pages.
 */
function update_view() {
  if (update_view_timer) clearTimeout(update_view_timer);
  update_view_timer = 0;

  for (let i of page_visible) page_list[i]._show();
}

/**
 * Finds the page that is most visible in the viewport.
 * @returns {number} The page number of the most visible page
 */
function find_visible_page() {
  let panel = document.getElementById("page-panel").getBoundingClientRect();
  let panel_mid = (panel.top + panel.bottom) / 2;
  for (let p of page_visible) {
    let rect = page_list[p].rootNode.getBoundingClientRect();
    if (rect.top <= panel_mid && rect.bottom >= panel_mid) return p;
  }
  return page_visible[0];
}

/**
 * Increases the zoom level.
 */
function zoom_in() {
  const zoom = Math.min(current_zoom + 12, 384);
  zoom_to(zoom);
}

/**
 * Decreases the zoom level.
 */
function zoom_out() {
  const zoom = Math.max(current_zoom - 12, 48);
  zoom_to(zoom);
}

/**
 * Sets the zoom level to a specific value.
 * @param {number} new_zoom - The new zoom level in DPI
 */
function zoom_to(new_zoom) {
  if (current_zoom === new_zoom) return;
  current_zoom = new_zoom;

  // TODO: keep page coord at center of cursor in place when zooming

  let p = find_visible_page();

  for (let page of page_list) page.setZoom(current_zoom);

  page_list[p].rootNode.scrollIntoView();
  document.getElementById("zoom-level").textContent = new_zoom + "%";
  queue_update_view();
}

async function handlePrint() {
  if (isPasswordProtected) return;
  try {
    // Show loading message with animation
    show_message("Preparing document for printing...", true);

    const pdfUrl = globalConfig.fileAccess.url;
    const response = await fetch(pdfUrl);
    const pdfData = await response.arrayBuffer();
    const pdfBlob = new Blob([pdfData], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(pdfBlob);

    const printIframe = document.createElement("iframe");
    printIframe.style.display = "none";
    document.body.appendChild(printIframe);

    printIframe.src = blobUrl;

    printIframe.onload = () => {
      try {
        // Clear the loading message before printing
        clear_message();
        printIframe.contentWindow.print();
      } catch (error) {
        console.error("Print error:", error);
        show_message("Error printing document: " + error.message);
      }
    };
  } catch (error) {
    console.error("Error preparing PDF for print:", error);
    show_message("Error preparing document for print: " + error.message);
  }
}

/**
 * Handles mouse wheel events for zooming.
 */
window.addEventListener(
  "wheel",
  function (event) {
    // Intercept Ctl+MOUSEWHEEL that change browser zoom.
    // Our page rendering requires a 1-to-1 pixel scale.
    if (event.ctrlKey || event.metaKey) {
      if (event.deltaY < 0) zoom_in();
      else if (event.deltaY > 0) zoom_out();
      event.preventDefault();
    }
  },
  { passive: false }
);

/**
 * Handles keyboard shortcuts.
 */
window.addEventListener("keydown", async function (event) {
  // Intercept and override some keyboard shortcuts.
  // We must override the Ctl-PLUS and Ctl-MINUS shortcuts that change browser zoom.
  // Our page rendering requires a 1-to-1 pixel scale.
  if (event.ctrlKey || event.metaKey) {
    switch (event.keyCode) {
      // 'P' - Print control based on access data
      case 80:
        event.preventDefault();
        // Check if printing is allowed based on access data
        if (!globalConfig.userAccess.canPrint) {
          return false;
        } else {
          handlePrint();
        }
        // If printing is allowed, let the browser handle it
        break;
      // '=' / '+' on various keyboards
      case 61:
      case 107:
      case 187:
      case 171:
        zoom_in();
        event.preventDefault();
        break;
      // '-'
      case 173:
      case 109:
      case 189:
        zoom_out();
        event.preventDefault();
        break;
      // '0'
      case 48:
      case 96:
        zoom_to(100);
        break;

      // 'F'
      case 70:
        show_search_panel();
        event.preventDefault();
        break;

      // 'G'
      case 71:
        show_search_panel();
        run_search(event.shiftKey ? -1 : 1, 1);
        event.preventDefault();
        break;
    }
  }

  if (event.key === "Escape") {
    hide_search_panel();
  }
});

/**
 * Toggles fullscreen mode.
 */
function toggle_fullscreen() {
  // Safari on iPhone doesn't support Fullscreen
  if (typeof document.documentElement.requestFullscreen !== "function") return;
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}

// SEARCH

/**
 * Reference to the search panel element.
 * @type {HTMLElement}
 */
let search_panel = document.getElementById("search-panel");

/**
 * Reference to the search status element.
 * @type {HTMLElement}
 */
let search_status = document.getElementById("search-status");

/**
 * Reference to the search input element.
 * @type {HTMLInputElement}
 */
let search_input = document.getElementById("search-input");

/**
 * The current search term.
 * @type {string}
 */
var current_search_needle = "";

/**
 * The current page being searched.
 * @type {number}
 */
var current_search_page = 0;

/**
 * Handles search input changes.
 */
search_input.onchange = function (event) {
  run_search(event.shiftKey ? -1 : 1, 0);
};

/**
 * Rotates pages in the document.
 * @param {number} rotation - The rotation angle in degrees (0, 90, 180, 270)
 */
function rotate_pages(rotation) {
  if (!page_list) return;

  // Get current visible page to maintain position
  let visiblePage = find_visible_page();

  for (const page of page_list) {
    // Apply rotation relative to current rotation
    const newRotation = (page.rotation + rotation) % 360;
    page.setRotation(newRotation);
  }

  // Scroll back to the previously visible page
  if (visiblePage >= 0 && visiblePage < page_list.length) {
    page_list[visiblePage].rootNode.scrollIntoView();
  }

  // Update the view to reflect changes
  queue_update_view();
}

/**
 * Shows the search panel.
 */
function show_search_panel() {
  if (!page_list) return;
  search_panel.style.display = "";
  search_input.focus();
  search_input.select();
}

/**
 * Hides the search panel and clears the search.
 */
function hide_search_panel() {
  search_panel.style.display = "none";
  search_input.value = "";
  set_search_needle("");
}

/**
 * Sets the search term and updates all pages.
 * @param {string} needle - The search term
 */
function set_search_needle(needle) {
  search_status.textContent = "";
  current_search_needle = needle;

  if (!page_list) return;

  for (let page of page_list) page.setSearch(current_search_needle);

  queue_update_view();
}

/**
 * Runs a search through the document.
 * @param {number} direction - The direction to search (1 for forward, -1 for backward)
 * @param {number} step - Whether to start from the next page (1) or current page (0)
 * @returns {Promise} A promise that resolves when the search is complete
 */
async function run_search(direction, step) {
  // start search from visible page
  set_search_needle(search_input.value);

  current_search_page = find_visible_page();

  let next_page = current_search_page;
  if (step) next_page += direction;

  while (next_page >= 0 && next_page < page_list.length) {
    // We run the check once per loop iteration,
    // in case the search was cancel during the 'await' below.
    if (current_search_needle === "") {
      search_status.textContent = "";
      return;
    }

    search_status.textContent = `Searching page ${next_page}.`;

    if (page_list[next_page].loadNeedle !== page_list[next_page].needle)
      await page_list[next_page]._loadSearch();

    const hits = page_list[next_page].searchData;
    if (hits && hits.length > 0) {
      page_list[next_page].rootNode.scrollIntoView();
      current_search_page = next_page;
      search_status.textContent = `${hits.length} hits on page ${next_page}.`;
      return;
    }

    next_page += direction;
  }

  search_status.textContent = "No more search hits.";
}

// OUTLINE

/**
 * Builds the document outline (table of contents) HTML structure.
 * @param {HTMLElement} parent - The parent element to append to
 * @param {Array} outline - The outline data
 */
function build_outline(parent, outline) {
  for (let item of outline) {
    let node = document.createElement("li");
    let a = document.createElement("a");
    a.href = "#page" + (item.page + 1);
    a.textContent = item.title;
    node.appendChild(a);
    if (item.down) {
      let down = document.createElement("ul");
      build_outline(down, item.down);
      node.appendChild(down);
    }
    parent.appendChild(node);
  }
}

/**
 * Toggles the outline panel visibility.
 */
function toggle_outline_panel() {
  if (document.getElementById("outline-panel").style.display === "none")
    show_outline_panel();
  else hide_outline_panel();
}

/**
 * Shows the outline panel.
 */
function show_outline_panel() {
  console.warn("Called on render now!");
  if (!page_list) return;
  const parent = document.getElementById("outline-panel");
  parent.style.display = "block";
  //Delaying the class removal to avoid a flash and facilitate the css transition.
  setTimeout(() => {
    parent.classList.remove("hidden");
  }, 0);
}

/**
 * Hides the outline panel.
 */
function hide_outline_panel() {
  console.warn("called for some reason!");
  const parent = document.getElementById("outline-panel");
  parent.classList.add("hidden");
  parent.style.display = "none";
  // setTimeout(() => {
  // }, 250); //same as the css transition duration.
}

// DOCUMENT LOADING

/**
 * Closes the current document and cleans up resources.
 */
function close_document() {
  clear_message();
  hide_outline_panel();
  hide_search_panel();

  // Reset password protection flag when closing document
  isPasswordProtected = false;

  if (current_doc) {
    worker.closeDocument(current_doc);
    current_doc = 0;
    document.getElementById("outline").replaceChildren();
    document.getElementById("pages").replaceChildren();
    for (let page of page_list) page_observer.unobserve(page.rootNode);
    page_visible.length = 0;
  }

  page_list = null;
}

/**
 * Creates and shows a password dialog for protected documents.
 * @param {number} doc_id - The document ID
 * @param {string} title - The document title
 * @param {ArrayBuffer} buffer - The original document buffer
 * @param {string} magic - The file type magic
 * @param {boolean} showError - Whether to show an error message
 * @returns {Promise} A promise that resolves when authentication is complete
 */
async function promptForPassword(
  doc_id,
  title,
  buffer,
  magic,
  showError = false
) {
  return new Promise((resolve, reject) => {
    // Create dialog container
    const dialog = document.createElement("div");
    dialog.className = "password-dialog";

    // Create dialog content
    dialog.innerHTML = `
      <div class="password-dialog-content">
        <div class="password-dialog-header">
          <h3 class="password-dialog-title">Password Required</h3>
        </div>
        <div class="password-dialog-body">
          <p class="password-dialog-message">This document is password protected. Please enter the password to open it.</p>
          <div class="password-input-container">
            <input type="password" class="password-input" placeholder="Enter password" />
            <button class="password-toggle" title="Toggle password visibility">
              <i class="fas fa-eye"></i>
            </button>
          </div>
          <p class="password-error" ${
            showError ? 'style="display: block;"' : ""
          }>Incorrect password. Please try again.</p>
        </div>
        <div class="password-dialog-footer">
          <button class="password-dialog-button password-cancel-button">Cancel</button>
          <button class="password-dialog-button password-submit-button">Submit</button>
        </div>
      </div>
    `;

    // Add dialog to the document
    document.body.appendChild(dialog);

    // Get elements
    const passwordInput = dialog.querySelector(".password-input");
    const toggleButton = dialog.querySelector(".password-toggle");
    const cancelButton = dialog.querySelector(".password-cancel-button");
    const submitButton = dialog.querySelector(".password-submit-button");

    // Focus the input field
    passwordInput.focus();

    // Toggle password visibility
    toggleButton.addEventListener("click", () => {
      const type = passwordInput.type === "password" ? "text" : "password";
      passwordInput.type = type;
      toggleButton.innerHTML =
        type === "password"
          ? '<i class="fas fa-eye"></i>'
          : '<i class="fas fa-eye-slash"></i>';
    });

    // Handle cancel button
    cancelButton.addEventListener("click", () => {
      document.body.removeChild(dialog);
      close_document();
      show_message("Document opening cancelled.");
      reject(new Error("Document opening cancelled"));
    });

    // Handle submit button
    submitButton.addEventListener("click", async () => {
      const password = passwordInput.value;
      if (!password) return;

      try {
        // Attempt to authenticate with the provided password
        const isAuthenticated = await worker.authenticatePassword(
          doc_id,
          password
        );
        if (isAuthenticated) {
          // Password is correct, remove dialog and continue loading
          document.body.removeChild(dialog);
          resolve(true);
        } else {
          // Password is incorrect, show error and try again
          document.body.removeChild(dialog);
          await promptForPassword(doc_id, title, buffer, magic, true);
          resolve(true);
        }
      } catch (error) {
        console.error("Authentication error:", error);
        document.body.removeChild(dialog);
        show_message("Error authenticating document: " + error.message);
        reject(error);
      }
    });

    // Handle Enter key press
    passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        submitButton.click();
      }
    });
  });
}

/**
 * Opens a document from an ArrayBuffer.
 * @param {ArrayBuffer} buffer - The document data
 * @param {string} magic - The file type magic (e.g., "application/pdf")
 * @param {string} title - The document title
 * @returns {Promise} A promise that resolves when the document is loaded
 */
async function open_document_from_buffer(buffer, magic, title) {
  try {
    // First open the document
    current_doc = await worker.openDocumentFromBuffer(buffer, magic);

    // Check if the document is password protected
    if (await worker.needsPassword(current_doc)) {
      // Mark document as password protected
      isPasswordProtected = true;

      // Update print button visibility
      const printButton = document.getElementById("print-button");
      if (printButton) {
        printButton.style.display = "none";
      }

      // Show password dialog
      await promptForPassword(current_doc, title, buffer, magic);
    } else {
      // Document is not password protected
      isPasswordProtected = false;
    }

    document.title = "Pdf Viewer: " + title;

    var page_count = await worker.countPages(current_doc);

    // Use second page as default page size (the cover page is often differently sized)
    var page_size = await worker.getPageSize(
      current_doc,
      page_count > 1 ? 1 : 0
    );

    page_list = [];
    for (let i = 0; i < page_count; ++i)
      page_list[i] = new PageView(current_doc, i, page_size, current_zoom);

    for (let page of page_list) {
      document.getElementById("pages").appendChild(page.rootNode);
      page_observer.observe(page.rootNode);
    }

    var outline = await worker.documentOutline(current_doc);
    if (outline) {
      build_outline(document.getElementById("outline"), outline);
      show_outline_panel();
    } else {
      hide_outline_panel();
    }

    clear_message();

    current_search_needle = "";
    current_search_page = 0;
  } catch (error) {
    console.error("Error opening document:", error);
    show_message("Error opening document: " + error.message);
  }
}

/**
 * Extracts the filename from a URL path
 * @param {string} url - The URL to extract the filename from
 * @returns {string} The extracted filename or the original URL if no filename could be extracted
 */
function extractFilenameFromUrl(url) {
  try {
    // Try to extract filename from the URL path
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split("/");
    const filename = segments[segments.length - 1];

    // If we have a filename with extension, return it
    if (filename && filename.includes(".")) {
      // Remove query parameters (like ?auth="<string>") from the filename
      const cleanFilename = decodeURIComponent(filename).split("?")[0];
      return cleanFilename;
    }

    // If no valid filename found in the path, return the original URL
    return url;
  } catch (e) {
    // If URL parsing fails, try a simpler approach
    const segments = url.split("/");
    const potentialFilename = segments[segments.length - 1];

    if (potentialFilename && potentialFilename.includes(".")) {
      // Remove query parameters (like ?auth="<string>") from the filename
      const cleanFilename = decodeURIComponent(potentialFilename).split("?")[0];
      return cleanFilename;
    }

    return url;
  }
}

/**
 * Opens a document from a URL.
 * @param {string} path - The URL to fetch the document from
 * @returns {Promise} A promise that resolves when the document is loaded
 */
async function open_document_from_url(path) {
  close_document();
  try {
    const filename = extractFilenameFromUrl(path);
    show_message("Loading " + filename);

    // Create progress bar container
    const messageContainer = document.getElementById("message");
    const progressContainer = document.createElement("div");
    progressContainer.className = "progress-container";
    messageContainer.appendChild(progressContainer);

    // Create the progress bar element
    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    progressContainer.appendChild(progressBar);

    // Create progress text
    const progressText = document.createElement("div");
    progressText.className = "progress-text";
    progressText.textContent = "0%";
    messageContainer.appendChild(progressText);

    // Fetch the document with progress tracking
    const response = await fetch(path);
    if (!response.ok) throw new Error("Could not fetch document.");

    // Get total file size from Content-Length header
    const contentLength = response.headers.get("Content-Length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    // Create a reader from the response body stream
    const reader = response.body.getReader();
    let receivedLength = 0;
    let chunks = [];

    // Read the stream
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      receivedLength += value.length;

      // Calculate and display progress
      if (total > 0) {
        const percentComplete = Math.round((receivedLength / total) * 100);
        progressBar.style.width = percentComplete + "%";
        progressText.textContent = percentComplete + "%";
      }
    }

    // Concatenate chunks into a single Uint8Array
    let pdfData = new Uint8Array(receivedLength);
    let position = 0;
    for (let chunk of chunks) {
      pdfData.set(chunk, position);
      position += chunk.length;
    }

    // Convert to ArrayBuffer and open the document
    await open_document_from_buffer(pdfData.buffer, path, filename);
  } catch (error) {
    show_message(error.name + ": " + error.message);
    console.error(error);
  }
}

/**
 * Opens a document from a File object.
 * @param {File} file - The file object containing the document data
 * @returns {Promise} A promise that resolves when the document is loaded
 */
async function open_document_from_file(file) {
  close_document();
  try {
    show_message("Loading " + file.name);
    history.replaceState(null, null, window.location.pathname);
    await open_document_from_buffer(
      await file.arrayBuffer(),
      file.name,
      file.name
    );
    document.getElementById("message").style.display = "none";
  } catch (error) {
    show_message(error.name + ": " + error.message);
    console.error(error);
  }
}

/**
 * Prevents copy events when text copying is not allowed
 */
function preventCopy(event) {
  if (!globalConfig.userAccess.canCopyText) {
    event.preventDefault();
    return false;
  }
}

/**
 * Main entry point for the application.
 * Initializes the viewer and loads a document if specified in URL parameters.
 */
async function main() {
  // Add copy event listener to prevent copying when not allowed
  document.addEventListener("copy", preventCopy);
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  const { SecureChildTab } = await import("./utils/childTabManager.js");
  const secureTab = new SecureChildTab();

  //Setup for the incoming Credentials
  secureTab.on("credentials", (data) => {
    console.warn("got creds");
    launchViewer(data);
  });

  initTab(secureTab);
  const { initThemeManager } = await import("./utils/themeManager.js");
  initThemeManager();
}

async function initTab(secureChildTab) {
  try {
    const initData = await new Promise((resolve) => {
      window.addEventListener("message", (event) => {
        if (event.data.type === "init") {
          resolve(event.data);
        }
      });
    });
    await secureChildTab.init(initData);
    window._secureTabDebug.enable();
    secureChildTab.emit("ready", null);
  } catch (err) {}
}

async function launchViewer(credentials) {
  const { updateGlobalConfig } = await import("./globalConfig.js");
  const config = updateGlobalConfig(credentials);
  clear_message();
  globalConfig = config;

  // Show or hide print button based on user permissions and document protection status
  const printButton = document.getElementById("print-button");
  if (printButton) {
    // Hide print button if document is password protected or user doesn't have print permission
    printButton.style.display =
      globalConfig.userAccess.canPrint && !isPasswordProtected
        ? "inline-block"
        : "none";
  }

  // Initialize theme manager

  open_document_from_url(config.fileAccess.url);
}

async function cycleTheme() {
  const { cycleTheme } = await import("./utils/themeManager.js");
  cycleTheme();
}
