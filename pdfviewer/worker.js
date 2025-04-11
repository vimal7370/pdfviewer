"use strict";
/**
 * Import the MuPDF library for PDF processing
 * @see {@link https://mupdf.com/docs/}
 */
import * as mupdf from "./lib/mupdf.js";

/**
 * Collection of methods exposed to the main thread
 * @type {Object.<string, Function>}
 */
const methods = {};

/**
 * Message handler for the worker thread
 * Processes requests from the main thread and returns results
 * @param {MessageEvent} event - The message event containing the function to call and its arguments
 */
onmessage = async function (event) {
  let [func, id, args] = event.data;
  try {
    let result = methods[func](...args);
    postMessage(["RESULT", id, result]);
  } catch (error) {
    postMessage([
      "ERROR",
      id,
      { name: error.name, message: error.message, stack: error.stack },
    ]);
  }
};

/**
 * Counter for document IDs
 * @type {number}
 */
var document_next_id = 1;

/**
 * Map of document IDs to document objects
 * @type {Object.<number, mupdf.Document>}
 */
var document_map = {};

/**
 * Opens a document from an ArrayBuffer
 * @param {ArrayBuffer} buffer - The document data
 * @param {string} magic - The file type hint (e.g., file extension or MIME type)
 * @returns {number} The document ID for future references
 */
methods.openDocumentFromBuffer = function (buffer, magic) {
  let doc_id = document_next_id++;
  document_map[doc_id] = mupdf.Document.openDocument(buffer, magic);

 

  return doc_id;
};

/**
/**
 * Closes and destroys a document
 * @param {number} doc_id - The document ID to close
 */
methods.closeDocument = function (doc_id) {
  let doc = document_map[doc_id];
  doc.destroy();
  delete document_map[doc_id];
};

/**
 * Gets the document title
 * @param {number} doc_id - The document ID
 * @returns {string|undefined} The document title or undefined if not available
 */
methods.documentTitle = function (doc_id) {
  let doc = document_map[doc_id];
  return doc.getMetaData(mupdf.Document.META_INFO_TITLE);
};

/**
 * Gets the document outline (table of contents)
 * @param {number} doc_id - The document ID
 * @returns {Array|null} The document outline structure or null if not available
 */
methods.documentOutline = function (doc_id) {
  let doc = document_map[doc_id];
  console.log("outline", doc.loadOutline());
  return doc.loadOutline();
};

/**
 * Gets the number of pages in the document
 * @param {number} doc_id - The document ID
 * @returns {number} The page count
 */
methods.countPages = function (doc_id) {
  let doc = document_map[doc_id];
  return doc.countPages();
};

/**
 * Gets the size of a specific page
 * @param {number} doc_id - The document ID
 * @param {number} page_number - The page number (0-based)
 * @returns {Object} Object with width and height properties in points (72 points = 1 inch)
 */
methods.getPageSize = function (doc_id, page_number) {
  let doc = document_map[doc_id];
  let page = doc.loadPage(page_number);
  let bounds = page.getBounds();
  return { width: bounds[2] - bounds[0], height: bounds[3] - bounds[1] };
};

/**
 * Gets the links on a specific page
 * @param {number} doc_id - The document ID
 * @param {number} page_number - The page number (0-based)
 * @returns {Array<Object>} Array of link objects with position and target information
 */
methods.getPageLinks = function (doc_id, page_number) {
  let doc = document_map[doc_id];
  let page = doc.loadPage(page_number);
  let links = page.getLinks();

  return links.map((link) => {
    const [x0, y0, x1, y1] = link.getBounds();

    let href;
    if (link.isExternal()) href = link.getURI();
    else href = `#page${doc.resolveLink(link) + 1}`;

    return {
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      href,
    };
  });
};

/**
 * Gets the text content of a specific page
 * @param {number} doc_id - The document ID
 * @param {number} page_number - The page number (0-based)
 * @returns {Object} Structured text content with blocks, lines, and spans
 */
methods.getPageText = function (doc_id, page_number) {
  let doc = document_map[doc_id];
  let page = doc.loadPage(page_number);
  let text = page.toStructuredText().asJSON();
  return JSON.parse(text);
};

/**
 * Searches for text on a specific page
 * @param {number} doc_id - The document ID
 * @param {number} page_number - The page number (0-based)
 * @param {string} needle - The text to search for
 * @returns {Array<Object>} Array of bounding boxes for search hits
 */
methods.search = function (doc_id, page_number, needle) {
  let doc = document_map[doc_id];
  let page = doc.loadPage(page_number);
  const hits = page.search(needle);
  let result = [];
  for (let hit of hits) {
    for (let quad of hit) {
      const [ulx, uly, urx, ury, llx, lly, lrx, lry] = quad;
      result.push({
        x: ulx,
        y: uly,
        w: urx - ulx,
        h: lly - uly,
      });
    }
  }
  return result;
};

/**
 * Gets the annotations on a specific page
 * @param {number} doc_id - The document ID
 * @param {number} page_number - The page number (0-based)
 * @param {number} dpi - The dots per inch for scaling
 * @returns {Array<Object>} Array of annotation objects with position and type information
 */
methods.getPageAnnotations = function (doc_id, page_number, dpi) {
  let doc = document_map[doc_id];
  let page = doc.loadPage(page_number);

  if (page == null) {
    return [];
  }

  const annotations = page.getAnnotations();
  const doc_to_screen = [(dpi = 72), 0, 0, dpi / 72, 0, 0];

  return annotations.map((annotation) => {
    const [x0, y0, x1, y1] = mupdf.Matrix.transformRect(annotation.getBounds());
    return {
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      type: annotation.getType(),
      ref: annotation.pointer,
    };
  });
};

/**
 * Renders a page as a pixmap (bitmap)
 * @param {number} doc_id - The document ID
 * @param {number} page_number - The page number (0-based)
 * @param {number} dpi - The dots per inch for rendering
 * @param {number} rotation - The rotation angle in degrees (0, 90, 180, 270)
 * @returns {ImageData} The rendered page as an ImageData object
 */
methods.drawPageAsPixmap = function (doc_id, page_number, dpi, rotation = 0) {
  // Create scale matrix
  const scaleMatrix = mupdf.Matrix.scale(dpi / 72, dpi / 72);
  
  // Create rotation matrix if needed
  let rotationMatrix = mupdf.Matrix.identity;
  if (rotation !== 0) {
    rotationMatrix = mupdf.Matrix.rotate(rotation);
  }
  
  // Combine transformations: first rotate, then scale
  const doc_to_screen = mupdf.Matrix.concat(scaleMatrix, rotationMatrix);

  let doc = document_map[doc_id];
  let page = doc.loadPage(page_number);
  let bounds = page.getBounds();
  
  // For rotated pages, we need to transform the bounds correctly
  let bbox = mupdf.Rect.transform(bounds, doc_to_screen);

  let pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, true);
  pixmap.clear(255);

  let device = new mupdf.DrawDevice(doc_to_screen, pixmap);
  page.run(device, mupdf.Matrix.identity);
  device.close();

  let imageData = new ImageData(
    pixmap.getPixels().slice(),
    pixmap.getWidth(),
    pixmap.getHeight()
  );

  pixmap.destroy();

  return imageData;
};

// Initialize the worker by sending the available methods to the main thread
postMessage(["INIT", 0, Object.keys(methods)]);
