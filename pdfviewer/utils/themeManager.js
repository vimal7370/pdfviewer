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
  
  // Validate saved theme
  if (savedTheme && Object.values(THEMES).includes(savedTheme)) {
    // Apply saved theme preference
    applyTheme(savedTheme);
  } else {
    // Remove invalid theme from localStorage
    if (savedTheme) {
      console.warn(`Invalid theme preference detected: ${savedTheme}. Resetting to system theme.`);
      localStorage.removeItem('theme-preference');
    }
    
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
  let nextTheme;
  
  // Determine next theme with explicit validation
  switch (currentTheme) {
    case THEMES.SYSTEM:
      nextTheme = THEMES.LIGHT;
      break;
    case THEMES.LIGHT:
      nextTheme = THEMES.DARK;
      break;
    case THEMES.DARK:
      nextTheme = THEMES.SYSTEM;
      break;
    default:
      console.warn(`Unexpected theme state: ${currentTheme}. Resetting to SYSTEM.`);
      nextTheme = THEMES.SYSTEM;
  }
  
  // Validate next theme
  if (!Object.values(THEMES).includes(nextTheme)) {
    console.error(`Invalid theme detected: ${nextTheme}. Defaulting to SYSTEM.`);
    nextTheme = THEMES.SYSTEM;
  }
  
  // Apply theme
  applyTheme(nextTheme);
  
  // Manage localStorage preference
  if (nextTheme === THEMES.SYSTEM) {
    localStorage.removeItem('theme-preference');
  } else {
    localStorage.setItem('theme-preference', nextTheme);
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
  } else if (theme === THEMES.SYSTEM) {
    // Detect system preference
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
    
    if (prefersDarkMode.matches) {
      document.documentElement.classList.add('theme-dark');
    } else {
      document.documentElement.classList.add('theme-light');
    }
    
    // Add listener for system theme changes
    prefersDarkMode.addEventListener('change', (e) => {
      if (currentTheme === THEMES.SYSTEM) {
        if (e.matches) {
          document.documentElement.classList.remove('theme-light');
          document.documentElement.classList.add('theme-dark');
        } else {
          document.documentElement.classList.remove('theme-dark');
          document.documentElement.classList.add('theme-light');
        }
        updateThemeIcon();
      }
    });
  }
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
      iconElement.className = 'fas fa-desktop';
      break;
    default:
      console.warn(`Unknown theme detected: ${currentTheme}`);
      iconElement.className = 'fas fa-desktop'; // Fallback to system theme icon
      break;
  }
}