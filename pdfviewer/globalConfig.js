/**
 * Global configuration for the PDF viewer
 * This file contains default configuration values that can be overridden by the parent tab
 */

"use strict";

/**
 * Global configuration object for the PDF viewer
 * @type {Object}
 */
const globalConfig = {
  /**
   * File access configuration
   * @type {Object}
   */
  fileAccess: {
    /**
     * URL of the PDF file to display
     * @type {string}
     */
    url: "",

    /**
     * Whether the file is accessible
     * @type {boolean}
     */
    isAccessible: false,

    /**
     * Error message if file is not accessible
     * @type {string}
     */
    errorMessage: "",
  },

  /**
   * User permissions configuration
   * @type {Object}
   */
  userAccess: {
    /**
     * Whether the user can download the file
     * @type {boolean}
     */
    canDownload: false,

    /**
     * Whether the user can print the file
     * @type {boolean}
     */
    canPrint: false,

    /**
     * Whether the user can copy text from the file
     * @type {boolean}
     */
    canCopyText: false,

    // For future implementations

    /**
     * User ID for tracking purposes
     * @type {string}
     */
    userId: "",

    /**
     * User role or access level
     * @type {string}
     */
    accessLevel: "viewer",
  },

  /**
   * Watermark configuration
   * @type {Object}
   */
  waterMark: {
    /**
     * Enable or disable the watermark feature
     * @type {boolean}
     */
    enabled: true,

    /**
     * The text to display as watermark
     * @type {string}
     */
    text: "",

    /**
     * Opacity of the watermark (0-1)
     * @type {number}
     */
    opacity: 0.3,

    /**
     * Font size of the watermark text
     * @type {number}
     */
    fontSize: 19,

    /**
     * Color of the watermark text (CSS color format)
     * @type {string}
     */
    color: "rgba(128, 128, 128, 0.8)",

    /**
     * Rotation angle of the watermark in degrees
     * @type {number}
     */
    rotation: -45,

    /**
     * Whether to repeat the watermark across the page
     * @type {boolean}
     */
    repeat: true,

    /**
     * Spacing between repeated watermarks (in points)
     * @type {number}
     */
    repeatSpacing: 240,
  },

  /**
   * Loading state configuration
   * @type {Object}
   */
  loading: {
    /**
     * Whether the viewer is currently loading
     * @type {boolean}
     */
    isLoading: true,

    /**
     * Loading message to display
     * @type {string}
     */
    message: "Loading PDF Viewer...",
  },

  /**
   * Whether initialization from parent tab is complete
   * @type {boolean}
   */
  initialized: false,
};

/**
 * Updates the global configuration with values received from the parent tab
 * @param {Object} config - Configuration object from parent tab
 */
export function updateGlobalConfig(config) {
  // Update file access configuration
  if (config.url) {
    globalConfig.fileAccess.url = config.url;
    globalConfig.fileAccess.isAccessible = true;
  }

  // Update user access configuration
  if (config.userAccess) {
    Object.assign(globalConfig.userAccess, config.userAccess);
  }

  // Update watermark configuration
  if (config.waterMark) {
    Object.assign(globalConfig.waterMark, config.waterMark);
  }

  // Mark as initialized
  globalConfig.initialized = true;
  globalConfig.loading.isLoading = false;

  return globalConfig;
}

// Export the configuration
export { globalConfig };
