/**
 * Theme Manager for PDF Viewer
 * Handles theme initialization, toggling, and preference storage
 */

// Theme states
const THEMES = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark'
};

// Current theme state
let currentTheme = THEMES.SYSTEM;

/**
 * Initialize the theme manager
 * Sets up the initial theme based on user preference or system default
 */
export function initThemeManager() {
  // Check if user has a saved preference
  const savedTheme = localStorage.getItem('theme-preference');
  
  if (savedTheme) {
    // Apply saved theme preference
    applyTheme(savedTheme);
  } else {
    // Default to system preference
    applyTheme(THEMES.SYSTEM);
  }
  
  // Update the theme toggle icon
  updateThemeIcon();
}

/**
 * Cycle through available themes
 * Order: system → light → dark → system
 */
export function cycleTheme() {
  switch (currentTheme) {
    case THEMES.SYSTEM:
      applyTheme(THEMES.LIGHT);
      break;
    case THEMES.LIGHT:
      applyTheme(THEMES.DARK);
      break;
    case THEMES.DARK:
    default:
      applyTheme(THEMES.SYSTEM);
      break;
  }
  
  // Save user preference
  if (currentTheme === THEMES.SYSTEM) {
    localStorage.removeItem('theme-preference');
  } else {
    localStorage.setItem('theme-preference', currentTheme);
  }
  
  // Update the theme toggle icon
  updateThemeIcon();
}

/**
 * Apply the specified theme
 * @param {string} theme - The theme to apply (system, light, or dark)
 */
function applyTheme(theme) {
  // Remove existing theme classes
  document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-override');
  
  // Update current theme state
  currentTheme = theme;
  
  // Apply appropriate classes based on theme
  if (theme === THEMES.LIGHT) {
    document.documentElement.classList.add('theme-light', 'theme-override');
  } else if (theme === THEMES.DARK) {
    document.documentElement.classList.add('theme-dark', 'theme-override');
  }
  // For system theme, no additional classes needed
}

/**
 * Update the theme toggle icon based on current theme
 */
function updateThemeIcon() {
  const iconElement = document.getElementById('theme-toggle-icon');
  if (!iconElement) return;
  
  // Remove existing icon classes
  iconElement.className = '';
  
  // Set appropriate icon based on current theme
  switch (currentTheme) {
    case THEMES.LIGHT:
      iconElement.className = 'fas fa-sun';
      break;
    case THEMES.DARK:
      iconElement.className = 'fas fa-moon';
      break;
    case THEMES.SYSTEM:
    default:
      iconElement.className = 'fas fa-desktop';
      break;
  }
}