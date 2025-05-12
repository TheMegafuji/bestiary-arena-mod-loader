// Tick Tracker Mod for Bestiary Arena
console.log('Tick Tracker Mod initializing...');

// Configuration with defaults
const defaultConfig = {
  enabled: true,
  maxEntries: 20,
  showMilliseconds: true,
  currentLocale: document.documentElement.lang === 'pt' || 
    document.querySelector('html[lang="pt"]') || 
    window.location.href.includes('/pt/') ? 'pt' : 'en'
};

// Initialize with saved config or defaults
const config = Object.assign({}, defaultConfig, context.config);

// Constants
const MOD_ID = 'tick-tracker';
const BUTTON_ID = `${MOD_ID}-button`;
const CONFIG_BUTTON_ID = `${MOD_ID}-config-button`;
const CONFIG_PANEL_ID = `${MOD_ID}-config-panel`;
const WIDGET_ID = `${MOD_ID}-widget`;
const TICK_MS = 62.5; // One tick = 62.5ms

// Global variables
let isTracking = config.enabled;
let tickHistory = [];
let onGameEndUnsubscribe = null;
let activeWidget = null;
let widgetObserver = null;

// Translations
const TRANSLATIONS = {
  en: {
    buttonText: 'Tick Tracker',
    buttonTooltip: 'Toggle tick tracking',
    configButtonTooltip: 'Tick Tracker Settings',
    configTitle: 'Tick Tracker Settings',
    enabledLabel: 'Enable tick tracking',
    maxEntriesLabel: 'Maximum entries to show:',
    showMillisecondsLabel: 'Show milliseconds conversion',
    saveButton: 'Save',
    cancelButton: 'Cancel',
    widgetTitle: 'Game Ticks',
    copyButtonTooltip: 'Copy tick value',
    clearButtonTooltip: 'Clear history',
    noDataMessage: 'No data.',
    millisecondsSuffix: 'ms',
    completed: 'Completed',
    failed: 'Failed'
  },
  pt: {
    buttonText: 'Rastreador de Ticks',
    buttonTooltip: 'Ativar/desativar rastreamento de ticks',
    configButtonTooltip: 'Configurações do Rastreador',
    configTitle: 'Configurações do Rastreador de Ticks',
    enabledLabel: 'Ativar rastreamento de ticks',
    maxEntriesLabel: 'Número máximo de entradas:',
    showMillisecondsLabel: 'Mostrar conversão em milissegundos',
    saveButton: 'Salvar',
    cancelButton: 'Cancelar',
    widgetTitle: 'Ticks das Partidas',
    copyButtonTooltip: 'Copiar valor de ticks',
    clearButtonTooltip: 'Limpar histórico',
    noDataMessage: 'Sem dados.',
    millisecondsSuffix: 'ms',
    completed: 'Completado',
    failed: 'Falhou'
  }
};

// Get translation based on current locale
function t(key) {
  const locale = config.currentLocale;
  const translations = TRANSLATIONS[locale] || TRANSLATIONS.en;
  return translations[key] || key;
}

// Function to copy text to clipboard
function copyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (err) {
    console.error('Failed to copy text:', err);
  }
  
  document.body.removeChild(textarea);
  return success;
}

// Create the tick tracker widget
function createTickWidget() {
  // Check for existing widget first
  const existingWidget = document.getElementById(WIDGET_ID);
  if (existingWidget) {
    return existingWidget;
  }
  
  // Look for the autoplay widget container
  const autoplayContainer = document.querySelector(".widget-bottom[data-minimized='false']");
  if (!autoplayContainer) {
    console.log("No autoplay widget container found");
    return null;
  }
  
  // Create the widget container
  const tickSection = document.createElement("div");
  tickSection.className = "mt-1.5";
  tickSection.id = WIDGET_ID;
  
  // Create the widget header
  const header = document.createElement("div");
  header.className = "widget-top widget-top-text flex items-center gap-1.5";
  
  // Add an icon to the header
  const iconImg = document.createElement("img");
  iconImg.src = "https://bestiaryarena.com/assets/icons/nickname-change.png";
  iconImg.style.width = "16px";
  iconImg.style.height = "16px";
  header.appendChild(iconImg);
  
  // Add the title text
  const titleText = document.createTextNode(t('widgetTitle'));
  header.appendChild(titleText);
  
  // Add a clear button
  const clearButton = document.createElement("button");
  clearButton.className = "ml-auto flex h-5 w-5 items-center justify-center rounded-md hover:bg-black/40";
  clearButton.title = t('clearButtonTooltip');
  clearButton.innerHTML = "×";
  clearButton.onclick = () => {
    tickHistory = [];
    updateTickWidget();
    saveTickHistory();
  };
  header.appendChild(clearButton);
  
  tickSection.appendChild(header);
  
  // Create the widget body
  const body = document.createElement("div");
  body.className = "widget-bottom p-0";
  
  // Create the scroll container
  const scrollContainer = document.createElement("div");
  scrollContainer.setAttribute("dir", "ltr");
  scrollContainer.className = "relative overflow-hidden pl-1";
  scrollContainer.style.position = "relative";
  scrollContainer.style.height = "140px";
  
  const viewport = document.createElement("div");
  viewport.className = "h-full w-[calc(100%-12px)]";
  viewport.style.overflow = "hidden scroll";
  
  const tableDiv = document.createElement("div");
  tableDiv.style.minWidth = "100%";
  tableDiv.style.display = "table";
  
  const inventoryContainer = document.createElement("div");
  inventoryContainer.className = "container-inventory-[auto-fit] pb-0 pl-0";
  inventoryContainer.id = "tick-inventory-container";
  
  // Add tick items to the inventory container
  if (tickHistory.length > 0) {
    tickHistory.slice(0, config.maxEntries).forEach(tickData => {
      const tickItem = createTickItem(tickData);
      inventoryContainer.appendChild(tickItem);
    });
  } else {
    // Show a message if no tick data is available
    const noDataMsg = document.createElement("div");
    noDataMsg.className = "text-center p-2 text-whiteDark/60";
    noDataMsg.textContent = t('noDataMessage');
    inventoryContainer.appendChild(noDataMsg);
  }
  
  tableDiv.appendChild(inventoryContainer);
  viewport.appendChild(tableDiv);
  scrollContainer.appendChild(viewport);
  body.appendChild(scrollContainer);
  tickSection.appendChild(body);
  
  // Append the widget to the target container
  autoplayContainer.appendChild(tickSection);
  
  return tickSection;
}

// Create an item to display tick information
function createTickItem(tickData) {
  const button = document.createElement("button");
  button.className = "focus-style-visible animate-in fade-in active:opacity-70";
  
  // Calculate milliseconds from ticks
  const milliseconds = tickData.ticks * TICK_MS;
  
  // Format tooltip based on grade, completion and seed
  let tooltipText = `${tickData.ticks} ticks`;
  if (config.showMilliseconds) {
    tooltipText += ` = ${Math.floor(milliseconds).toLocaleString()} ${t('millisecondsSuffix')}`;
  }
  if (tickData.grade) {
    tooltipText += `\nGrade: ${tickData.grade}`;
  }
  tooltipText += `\n${tickData.completed ? t('completed') : t('failed')}`;
  
  // Add seed information if available
  if (tickData.seed !== undefined) {
    tooltipText += `\nSeed: ${tickData.seed}`;
  }
  
  button.setAttribute("title", tooltipText);
  
  // Add click handler to copy seed value instead of tick value
  button.addEventListener('click', () => {
    // Determine what to copy - seed if available, otherwise ticks
    const valueToCopy = tickData.seed !== undefined ? tickData.seed.toString() : tickData.ticks.toString();
    const labelText = tickData.seed !== undefined ? 'seed' : 'ticks';
    
    const success = copyToClipboard(valueToCopy);
    if (success) {
      api.ui.components.createModal({
        title: 'Copied!',
        content: `Copied ${labelText}: ${valueToCopy}`,
        buttons: [{ text: 'OK', primary: true }]
      });
    }
  });
  
  // Create the slot container
  const slotDiv = document.createElement("div");
  slotDiv.setAttribute("data-hoverable", "false");
  slotDiv.setAttribute("data-highlighted", "false");
  slotDiv.setAttribute("data-disabled", "false");
  slotDiv.className = "container-slot surface-darker";
  
  // Inner container for icon and text
  const innerDiv = document.createElement("div");
  innerDiv.className = "has-rarity relative grid h-full place-items-center";
  
  // Add icon based on completion status
  const iconImg = document.createElement("img");
  iconImg.src = tickData.completed ? 
    "https://bestiaryarena.com/assets/icons/attackdamage.png" : 
    "https://bestiaryarena.com/assets/icons/attackpower.png";
  iconImg.className = "pixelated";
  iconImg.style.width = "32px";
  iconImg.style.height = "32px";
  innerDiv.appendChild(iconImg);
  
  // Add colorful border based on grade
  let borderColor = "#999"; // Default gray
  if (tickData.grade) {
    if (tickData.grade === 'S+') borderColor = "#FFD700"; // Gold
    else if (tickData.grade === 'S') borderColor = "#C0C0C0"; // Silver
    else if (tickData.grade === 'A') borderColor = "#2ecc71"; // Green
    else if (tickData.grade === 'B') borderColor = "#3498db"; // Blue
    else if (tickData.grade === 'C') borderColor = "#9b59b6"; // Purple
    else if (tickData.grade === 'D') borderColor = "#f39c12"; // Orange
    else if (tickData.grade === 'F') borderColor = "#e74c3c"; // Red
  } else {
    // If no grade, use color based on completion
    borderColor = tickData.completed ? "#2ecc71" : "#e74c3c";
  }
  
  slotDiv.style.boxShadow = `inset 0 0 0 1px ${borderColor}`;
  
  // Add tick text
  const tickTextContainer = document.createElement("div");
  tickTextContainer.className = "revert-pixel-font-spacing pointer-events-none absolute bottom-[3px] right-px flex h-2.5";
  
  const tickText = document.createElement("span");
  tickText.className = "relative";
  tickText.setAttribute("translate", "no");
  tickText.style.lineHeight = "1";
  tickText.style.fontSize = "10px";
  tickText.style.fontWeight = "bold";
  tickText.style.color = "white";
  tickText.style.textShadow = "0px 0px 1px #000, -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black";
  tickText.textContent = tickData.ticks;
  
  tickTextContainer.appendChild(tickText);
  innerDiv.appendChild(tickTextContainer);
  slotDiv.appendChild(innerDiv);
  button.appendChild(slotDiv);
  
  return button;
}

// Update the tick widget with current data
function updateTickWidget() {
  const container = document.getElementById('tick-inventory-container');
  if (!container) return;
  
  // Clear existing items
  container.innerHTML = '';
  
  // Add tick items
  if (tickHistory.length > 0) {
    tickHistory.slice(0, config.maxEntries).forEach(tickData => {
      const tickItem = createTickItem(tickData);
      container.appendChild(tickItem);
    });
  } else {
    // Show a message if no tick data is available
    const noDataMsg = document.createElement("div");
    noDataMsg.className = "text-center p-2 text-whiteDark/60";
    noDataMsg.textContent = t('noDataMessage');
    container.appendChild(noDataMsg);
  }
}

// Start tracking game ticks
function startTracking() {
  if (isTracking) {
    // Already tracking
    return;
  }
  
  console.log('Starting tick tracking...');
  isTracking = true;
  
  try {
    // Listen for new game events to subscribe to onGameEnd
    globalThis.state.board.on('newGame', (event) => {
      console.log('New game event detected');
      
      const world = event.world;
      if (world && world.onGameEnd && typeof world.onGameEnd.subscribe === 'function') {
        // Clean up any existing subscription
        if (onGameEndUnsubscribe) {
          try {
            onGameEndUnsubscribe();
          } catch (e) {
            console.error('Error unsubscribing from previous game:', e);
          }
        }
        
        // Subscribe to game end event
        onGameEndUnsubscribe = world.onGameEnd.subscribe((winner) => {
          console.log(`Game ended with winner: ${winner}`);
          
          try {
            // Get current tick count from tick engine
            const currentTick = world.tickEngine.getCurrentTick();
            console.log(`Game ended with ${currentTick} ticks`);
            
            // Get seed from RNG
            const seed = world.RNG.seed;
            console.log(`Game seed: ${seed}`);
            
            // Get grade if available (may not be in all game modes)
            let grade = null;
            let rankPoints = null;
            
            try {
              const timerContext = globalThis.state.gameTimer.getSnapshot().context;
              grade = timerContext.readableGrade;
              rankPoints = timerContext.rankPoints;
            } catch (e) {
              console.log('Could not get grade from gameTimer:', e);
            }
            
            // Record the tick data
            const tickData = {
              timestamp: Date.now(),
              ticks: currentTick,
              grade: grade,
              rankPoints: rankPoints,
              completed: winner === 'nonVillains', // 'nonVillains' means player won
              seed: seed // Store the seed
            };
            
            // Add to history (at the beginning)
            tickHistory.unshift(tickData);
            
            // Trim history if it exceeds max entries
            if (tickHistory.length > config.maxEntries * 2) {
              tickHistory = tickHistory.slice(0, config.maxEntries * 2);
            }
            
            // Save tick history to config
            saveTickHistory();
            
            // Update widget if it exists
            updateTickWidget();
            
            // Clean up subscription
            onGameEndUnsubscribe();
            onGameEndUnsubscribe = null;
          } catch (error) {
            console.error('Error processing game end:', error);
          }
        });
      }
    });
    
    // Start the widget observer to inject when autoplay UI appears
    setupWidgetObserver();
  } catch (error) {
    console.error('Error setting up tick tracking:', error);
    isTracking = false;
  }
}

// Stop tracking game ticks
function stopTracking() {
  if (!isTracking) {
    return;
  }
  
  isTracking = false;
  
  // Clean up game end subscription if exists
  if (onGameEndUnsubscribe) {
    try {
      onGameEndUnsubscribe();
    } catch (e) {
      console.error('Error unsubscribing from game end:', e);
    }
    onGameEndUnsubscribe = null;
  }
  
  // Stop widget observer
  if (widgetObserver) {
    widgetObserver.disconnect();
    widgetObserver = null;
  }
  
  // Remove widget if exists
  removeWidget();
  
  console.log('Tick tracking stopped');
}

// Toggle tick tracking
function toggleTracking() {
  config.enabled = !config.enabled;
  
  // Update the button appearance
  api.ui.updateButton(BUTTON_ID, {
    primary: config.enabled,
    text: t('buttonText')
  });
  
  // Start or stop tracking
  if (config.enabled) {
    startTracking();
  } else {
    stopTracking();
  }
  
  // Save configuration
  api.service.updateScriptConfig(context.hash, config);
}

// Save tick history to config
function saveTickHistory() {
  // Only save the last config.maxEntries entries
  const historyToSave = tickHistory.slice(0, config.maxEntries);
  
  // Update config
  config.tickHistory = historyToSave;
  
  // Save configuration
  api.service.updateScriptConfig(context.hash, config);
}

// Load tick history from config
function loadTickHistory() {
  if (config.tickHistory && Array.isArray(config.tickHistory)) {
    tickHistory = config.tickHistory;
    console.log(`Loaded ${tickHistory.length} tick history entries`);
  }
}

// Create or update the widget
function createOrUpdateWidget() {
  if (!config.enabled) return;
  
  // Only create if autoplay widget is visible
  activeWidget = createTickWidget();
  
  if (activeWidget) {
    updateTickWidget();
  }
}

// Remove the widget
function removeWidget() {
  const widget = document.getElementById(WIDGET_ID);
  if (widget) {
    widget.remove();
    activeWidget = null;
  }
}

// Create the configuration panel
function createConfigPanel() {
  const content = document.createElement('div');
  content.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

  // Enabled checkbox
  const enabledContainer = document.createElement('div');
  enabledContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const enabledInput = document.createElement('input');
  enabledInput.type = 'checkbox';
  enabledInput.id = 'enabled-input';
  enabledInput.checked = config.enabled;
  
  const enabledLabel = document.createElement('label');
  enabledLabel.htmlFor = 'enabled-input';
  enabledLabel.textContent = t('enabledLabel');
  
  enabledContainer.appendChild(enabledInput);
  enabledContainer.appendChild(enabledLabel);
  content.appendChild(enabledContainer);

  // Max entries input
  const maxEntriesContainer = document.createElement('div');
  maxEntriesContainer.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
  
  const maxEntriesLabel = document.createElement('label');
  maxEntriesLabel.textContent = t('maxEntriesLabel');
  
  const maxEntriesInput = document.createElement('input');
  maxEntriesInput.type = 'number';
  maxEntriesInput.id = 'max-entries-input';
  maxEntriesInput.min = '1';
  maxEntriesInput.max = '100';
  maxEntriesInput.value = config.maxEntries;
  maxEntriesInput.style.cssText = 'width: 80px; text-align: center;';
  
  maxEntriesContainer.appendChild(maxEntriesLabel);
  maxEntriesContainer.appendChild(maxEntriesInput);
  content.appendChild(maxEntriesContainer);

  // Show milliseconds checkbox
  const msContainer = document.createElement('div');
  msContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const msInput = document.createElement('input');
  msInput.type = 'checkbox';
  msInput.id = 'ms-input';
  msInput.checked = config.showMilliseconds;
  
  const msLabel = document.createElement('label');
  msLabel.htmlFor = 'ms-input';
  msLabel.textContent = t('showMillisecondsLabel');
  
  msContainer.appendChild(msInput);
  msContainer.appendChild(msLabel);
  content.appendChild(msContainer);

  // Create the config panel
  return api.ui.createConfigPanel({
    id: CONFIG_PANEL_ID,
    title: t('configTitle'),
    modId: MOD_ID,
    content: content,
    buttons: [
      {
        text: t('saveButton'),
        primary: true,
        onClick: () => {
          // Update configuration with form values
          config.enabled = document.getElementById('enabled-input').checked;
          config.maxEntries = parseInt(document.getElementById('max-entries-input').value, 10);
          config.showMilliseconds = document.getElementById('ms-input').checked;
          
          // Save configuration
          api.service.updateScriptConfig(context.hash, config);
          
          // Apply changes
          if (config.enabled) {
            startTracking();
          } else {
            stopTracking();
          }
          
          // Update button appearance
          api.ui.updateButton(BUTTON_ID, {
            primary: config.enabled,
            text: t('buttonText')
          });
          
          // Update widget if needed
          if (activeWidget) {
            updateTickWidget();
          }
        }
      },
      {
        text: t('cancelButton'),
        primary: false
      }
    ]
  });
}

// Set up a MutationObserver to detect when we can add our widget
function setupWidgetObserver() {
  // Skip if already tracking or disabled
  if (!config.enabled || widgetObserver) return;
  
  // Check immediately first
  const autoplayContainer = document.querySelector(".widget-bottom[data-minimized='false']");
  if (autoplayContainer && !document.getElementById(WIDGET_ID)) {
    createOrUpdateWidget();
  }
  
  // Set up observer to add widget when autoplay UI appears
  widgetObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'attributes') {
        const autoplayContainer = document.querySelector(".widget-bottom[data-minimized='false']");
        
        if (autoplayContainer && !document.getElementById(WIDGET_ID)) {
          console.log('Autoplay container detected, adding widget');
          createOrUpdateWidget();
        } else if (!autoplayContainer && document.getElementById(WIDGET_ID)) {
          console.log('Autoplay container removed, removing widget');
          removeWidget();
        }
      }
    }
  });
  
  // Observe the document for changes to track when autoplay UI appears/disappears
  widgetObserver.observe(document.body, { 
    childList: true, 
    subtree: true, 
    attributes: true,
    attributeFilter: ['data-minimized'] 
  });
  
  console.log('Widget observer set up');
}

// Initialize the mod
function init() {
  console.log('Tick Tracker initializing...');
  
  // Load saved tick history
  loadTickHistory();
  
  // Add the main button
  api.ui.addButtonStack([
    {
      id: BUTTON_ID,
      text: t('buttonText'),
      modId: MOD_ID,
      tooltip: t('buttonTooltip'),
      primary: config.enabled,
      onClick: toggleTracking,
      customCss: 'flex-grow: 1;'
    },
    {
      id: CONFIG_BUTTON_ID,
      icon: '⚙️',
      modId: MOD_ID,
      tooltip: t('configButtonTooltip'),
      onClick: () => api.ui.toggleConfigPanel(CONFIG_PANEL_ID)
    }
  ])
  
  // Create the configuration panel
  createConfigPanel();
  
  // Start tracking if enabled
  if (config.enabled) {
    startTracking();
  }
  
  console.log('Tick Tracker initialized');
}

// Initialize the mod
init();

// Export functionality
context.exports = {
  toggleTracking: toggleTracking,
  resetHistory: () => {
    tickHistory = [];
    updateTickWidget();
    saveTickHistory();
  },
  updateConfig: (newConfig) => {
    Object.assign(config, newConfig);
    api.service.updateScriptConfig(context.hash, config);
  }
}; 