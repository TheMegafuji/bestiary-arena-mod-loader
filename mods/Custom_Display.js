// Custom Display Mod for Bestiary Arena
console.log('Custom Display Mod initializing...');

// Configuration with defaults
const defaultConfig = {
  // Performance/Lite Mode settings
  performance: {
    enabled: false,
    showNames: true,
    showHP: true,
    showHitboxes: true,
    showWalkablePaths: true,
    tileColor: '#333333',
    hitboxColor: 'rgba(255, 0, 0, 0.3)',
    walkableColor: 'rgba(0, 255, 0, 0.3)'
  },
  // Map Grid settings
  mapGrid: {
    enabled: false,
    color: 'rgba(0, 255, 170, 0.7)',
    labelColor: '#00ff99',
    borderThickness: 1,
    fontSize: 12
  },
  // Global settings
  currentLocale: document.documentElement.lang === 'pt' || 
    document.querySelector('html[lang="pt"]') || 
    window.location.href.includes('/pt/') ? 'pt' : 'en'
};

// Initialize with saved config or defaults
const config = Object.assign({}, defaultConfig, context.config);

// Constants
const MOD_ID = 'custom-display';
const PERF_TOGGLE_ID = `${MOD_ID}-perf-toggle`;
const GRID_TOGGLE_ID = `${MOD_ID}-grid-toggle`;
const CONFIG_BUTTON_ID = `${MOD_ID}-config-button`;
const CONFIG_PANEL_ID = `${MOD_ID}-config-panel`;
const PERF_STYLE_ID = `${MOD_ID}-perf-styles`;
const HITBOX_OVERLAY_ID = `${MOD_ID}-hitbox-overlay`;
const GRID_OVERLAY_ID = `${MOD_ID}-grid-overlay`;

// State tracking variables
let gameStateSubscription = null;
let boardStateSubscription = null;
let lastGameStarted = false;
let gridOverlay = null;

// Translations
const TRANSLATIONS = {
  en: {
    modName: 'Custom Display',
    configButtonTooltip: 'Custom Display Settings',
    configTitle: 'Custom Display Settings',
    // Performance section
    perfSectionTitle: 'Performance Mode',
    perfButtonText: 'Performance Mode',
    perfButtonTooltipEnabled: 'Disable Performance Mode',
    perfButtonTooltipDisabled: 'Enable Performance Mode',
    showNamesLabel: 'Show character names',
    showHPLabel: 'Show HP bars',
    showHitboxesLabel: 'Show hitboxes (non-walkable areas)',
    showWalkablePathsLabel: 'Show walkable paths',
    tileColorLabel: 'Background tile color:',
    hitboxColorLabel: 'Hitbox color:',
    walkableColorLabel: 'Walkable path color:',
    // Grid section
    gridSectionTitle: 'Map Grid',
    gridButtonText: 'Toggle Grid',
    gridButtonTooltipEnabled: 'Hide Grid',
    gridButtonTooltipDisabled: 'Show Grid',
    gridColorLabel: 'Grid Color:',
    labelColorLabel: 'Label Color:',
    fontSizeLabel: 'Font Size:',
    // Buttons
    saveButton: 'Save',
    cancelButton: 'Cancel'
  },
  pt: {
    modName: 'Exibição Personalizada',
    configButtonTooltip: 'Configurações de Exibição',
    configTitle: 'Configurações de Exibição',
    // Performance section
    perfSectionTitle: 'Modo de Desempenho',
    perfButtonText: 'Modo de Desempenho',
    perfButtonTooltipEnabled: 'Desativar Modo de Desempenho',
    perfButtonTooltipDisabled: 'Ativar Modo de Desempenho',
    showNamesLabel: 'Mostrar nomes dos personagens',
    showHPLabel: 'Mostrar barras de HP',
    showHitboxesLabel: 'Mostrar hitboxes (áreas não andáveis)',
    showWalkablePathsLabel: 'Mostrar caminhos andáveis',
    tileColorLabel: 'Cor de fundo dos tiles:',
    hitboxColorLabel: 'Cor dos hitboxes:',
    walkableColorLabel: 'Cor dos caminhos andáveis:',
    // Grid section
    gridSectionTitle: 'Grade do Mapa',
    gridButtonText: 'Alternar Grade',
    gridButtonTooltipEnabled: 'Esconder Grade',
    gridButtonTooltipDisabled: 'Mostrar Grade',
    gridColorLabel: 'Cor da Grade:',
    labelColorLabel: 'Cor dos Rótulos:',
    fontSizeLabel: 'Tamanho da Fonte:',
    // Buttons
    saveButton: 'Salvar',
    cancelButton: 'Cancelar'
  }
};

// Get translation based on current locale
function t(key) {
  const locale = config.currentLocale;
  const translations = TRANSLATIONS[locale] || TRANSLATIONS.en;
  return translations[key] || key;
}

// PERFORMANCE MODE FUNCTIONALITY (FORMER LITE MODE)

// Set up game state monitoring
function monitorGameState() {
  // Clean up existing subscriptions
  if (gameStateSubscription) {
    gameStateSubscription.unsubscribe();
    gameStateSubscription = null;
  }
  
  if (boardStateSubscription) {
    boardStateSubscription.unsubscribe();
    boardStateSubscription = null;
  }

  try {
    // Monitor board state changes
    if (globalThis.state && globalThis.state.board) {
      boardStateSubscription = globalThis.state.board.subscribe((state) => {
        if (!config.performance.enabled) return;
        
        const currentGameStarted = state.context.gameStarted;
        
        // If game state changed, reapply performance mode
        if (currentGameStarted !== lastGameStarted) {
          console.log(`Game state changed: ${lastGameStarted} -> ${currentGameStarted}`);
          lastGameStarted = currentGameStarted;
          
          // Small delay to let the game update the DOM
          setTimeout(() => {
            reapplyPerformanceMode();
          }, 100);
        }
      });
      
      // Also listen for new game events
      globalThis.state.board.on('newGame', (event) => {
        if (!config.performance.enabled) return;
        console.log('New game detected, reapplying performance mode');
        
        // Small delay to let the game update the DOM
        setTimeout(() => {
          reapplyPerformanceMode();
        }, 100);
      });
    }
    
    // Set up a MutationObserver to watch for DOM changes
    const viewportObserver = new MutationObserver((mutations) => {
      if (!config.performance.enabled) return;
      
      let needsReapply = false;
      
      // Check if any tile-index or sprite elements were added
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) { // Element node
              // Check if it's a tile-index or contains sprite elements
              if (node.id && node.id.startsWith('tile-index-')) {
                needsReapply = true;
                break;
              }
              
              // Check for added sprites
              if (node.querySelector && node.querySelector('.sprite')) {
                needsReapply = true;
                break;
              }
            }
          }
        }
        
        if (needsReapply) break;
      }
      
      if (needsReapply) {
        console.log('DOM changes detected, reapplying performance mode');
        reapplyPerformanceMode();
      }
    });
    
    // Start observing the viewport
    const viewport = document.getElementById('viewport');
    if (viewport) {
      viewportObserver.observe(viewport, {
        childList: true,
        subtree: true
      });
      
      // Store the observer for cleanup
      window._performanceModeDomObserver = viewportObserver;
    }
    
  } catch (error) {
    console.error('Error setting up game state monitoring:', error);
  }
}

// Function to reapply performance mode
function reapplyPerformanceMode() {
  if (!config.performance.enabled) return;
  
  // Cleanup first to avoid duplicate elements
  cleanupOverlayElements();
  
  // Apply base styles
  applyBaseStyles();
  
  // Apply hitbox and walkable path overlays
  if (config.performance.showHitboxes || config.performance.showWalkablePaths) {
    createHitboxOverlay();
  }
}

// Function to apply the base style changes
function applyBaseStyles() {
  // Remove any existing style element
  const existingStyle = document.getElementById(PERF_STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // Create the style element
  const styleElement = document.createElement('style');
  styleElement.id = PERF_STYLE_ID;
  
  // Base styles to hide images and set background colors
  let css = `
    /* Hide all sprite images while keeping the elements */
    #viewport .sprite img.spritesheet {
      opacity: 0 !important;
    }
    
    /* Set background color for tiles */
    #viewport #tiles .sprite.item {
      background-color: ${config.performance.tileColor} !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
    }
    
    /* Hide character sprites but keep button functionality */
    #viewport button .sprite.item {
      background-color: transparent !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
    }
    
    /* Hitbox overlay styling */
    .custom-display-tile-overlay {
      position: absolute;
      width: calc(32px * var(--zoomFactor));
      height: calc(32px * var(--zoomFactor));
      pointer-events: none;
    }
    
    .custom-display-hitbox {
      background-color: ${config.performance.hitboxColor};
    }
    
    .custom-display-walkable {
      background-color: ${config.performance.walkableColor};
    }
  `;
  
  // Hide names if configured
  if (!config.performance.showNames) {
    css += `
      #viewport .pointer-events-none.absolute.flex.w-\\[192px\\].flex-col.items-center span {
        display: none !important;
      }
    `;
  }
  
  // Hide HP bars if configured
  if (!config.performance.showHP) {
    css += `
      #viewport .pointer-events-none.absolute.flex.w-\\[192px\\].flex-col.items-center .h-1.w-full {
        display: none !important;
      }
    `;
  }
  
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
}

// Create overlay to show hitboxes and walkable paths
function createHitboxOverlay() {
  try {
    // Get the room data from the game state
    const boardContext = globalThis.state.board.getSnapshot().context;
    if (!boardContext || !boardContext.selectedMap || !boardContext.selectedMap.selectedRoom) {
      console.error('Unable to access room data for hitbox overlay');
      return;
    }
    
    const roomData = boardContext.selectedMap.selectedRoom;
    
    // Check if we have hitboxes data
    if (!roomData.file || !roomData.file.data || !roomData.file.data.hitboxes) {
      console.warn('No hitbox data found for current room');
      return;
    }
    
    const hitboxes = roomData.file.data.hitboxes;
    
    // Find the tiles container - this is where we'll add our overlay elements
    const tilesContainer = document.getElementById('tiles');
    if (!tilesContainer) {
      console.error('Could not find #tiles container');
      return;
    }
    
    // Create a wrapper container for our overlays
    const overlayContainer = document.createElement('div');
    overlayContainer.id = HITBOX_OVERLAY_ID;
    overlayContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
    `;
    
    // Process each tile element
    const tileElements = document.querySelectorAll('[id^="tile-index-"]');
    tileElements.forEach(tileElement => {
      // Get the tile index from the ID
      const tileId = parseInt(tileElement.id.replace('tile-index-', ''), 10);
      
      // Skip if tileId is out of range
      if (tileId >= hitboxes.length) return;
      
      // Skip if we already processed this tile
      if (document.querySelector(`.custom-display-tile-overlay[data-tile-index="${tileId}"]`)) {
        return;
      }
      
      // Get the raw right and bottom values from the style attribute
      const style = tileElement.getAttribute('style');
      let rightValue = '';
      let bottomValue = '';
      
      // Extract the right, bottom values using regex
      const rightMatch = /right:\s*calc\(([^)]+)\)/.exec(style);
      if (rightMatch) rightValue = rightMatch[1];
      
      const bottomMatch = /bottom:\s*calc\(([^)]+)\)/.exec(style);
      if (bottomMatch) bottomValue = bottomMatch[1];
      
      // Skip if we couldn't extract the positioning
      if (!rightValue || !bottomValue) return;
      
      // Process walkable paths first (lower z-index)
      if (hitboxes[tileId] === false && config.performance.showWalkablePaths) {
        // Create overlay for walkable path
        const walkableOverlay = document.createElement('div');
        walkableOverlay.classList.add('custom-display-tile-overlay', 'custom-display-walkable');
        walkableOverlay.setAttribute('data-tile-index', tileId);
        
        // Position the walkable overlay
        walkableOverlay.style.position = 'absolute';
        walkableOverlay.style.right = `calc(${rightValue})`;
        walkableOverlay.style.bottom = `calc(${bottomValue})`;
        walkableOverlay.style.width = `calc(32px * var(--zoomFactor))`;
        walkableOverlay.style.height = `calc(32px * var(--zoomFactor))`;
        walkableOverlay.style.zIndex = '110'; // Lower than hitboxes
        
        // Add to the overlay container
        overlayContainer.appendChild(walkableOverlay);
      }
      
      // Then process hitboxes (higher z-index)
      if (hitboxes[tileId] === true && config.performance.showHitboxes) {
        // Create overlay for hitbox
        const hitboxOverlay = document.createElement('div');
        hitboxOverlay.classList.add('custom-display-tile-overlay', 'custom-display-hitbox');
        hitboxOverlay.setAttribute('data-tile-index', tileId);
        
        // Position the hitbox overlay
        hitboxOverlay.style.position = 'absolute';
        hitboxOverlay.style.right = `calc(${rightValue})`;
        hitboxOverlay.style.bottom = `calc(${bottomValue})`;
        hitboxOverlay.style.width = `calc(32px * var(--zoomFactor))`;
        hitboxOverlay.style.height = `calc(32px * var(--zoomFactor))`;
        hitboxOverlay.style.zIndex = '120'; // Higher than walkable paths
        
        // Add to the overlay container
        overlayContainer.appendChild(hitboxOverlay);
      }
    });
    
    // Add the overlay container to the document
    tilesContainer.appendChild(overlayContainer);
    
  } catch (error) {
    console.error('Error creating hitbox overlay:', error);
  }
}

// Function to clean up overlay elements
function cleanupOverlayElements() {
  // Remove the overlay container
  const overlayContainer = document.getElementById(HITBOX_OVERLAY_ID);
  if (overlayContainer) {
    overlayContainer.remove();
  }
  
  // Remove any stray overlay elements 
  const overlayElements = document.querySelectorAll('.custom-display-tile-overlay');
  overlayElements.forEach(el => el.remove());
}

// Function to clean up when disabling performance mode
function cleanupPerformanceMode() {
  // Remove the style element
  const styleElement = document.getElementById(PERF_STYLE_ID);
  if (styleElement) {
    styleElement.remove();
  }
  
  // Clean up overlay elements
  cleanupOverlayElements();
  
  // Disconnect the observer if it exists
  if (window._performanceModeDomObserver) {
    window._performanceModeDomObserver.disconnect();
    window._performanceModeDomObserver = null;
  }
  
  // Unsubscribe from state monitoring
  if (gameStateSubscription) {
    gameStateSubscription.unsubscribe();
    gameStateSubscription = null;
  }
  
  if (boardStateSubscription) {
    boardStateSubscription.unsubscribe();
    boardStateSubscription = null;
  }
}

// Toggle performance mode on/off
function togglePerformanceMode() {
  config.performance.enabled = !config.performance.enabled;
  
  // Save the configuration
  api.service.updateScriptConfig(context.hash, config);
  
  // Apply or remove performance mode
  if (config.performance.enabled) {
    applyPerformanceMode(true);
  } else {
    cleanupPerformanceMode();
  }
  
  // Update the button
  updatePerformanceButton();
}

// Update the toggle button text and style
function updatePerformanceButton() {
  api.ui.updateButton(PERF_TOGGLE_ID, {
    text: t('perfButtonText'),
    primary: config.performance.enabled,
    tooltip: config.performance.enabled ? t('perfButtonTooltipEnabled') : t('perfButtonTooltipDisabled')
  });
}

// Apply the performance mode
function applyPerformanceMode(enabled) {
  if (!enabled) {
    // If disabled, clean up and return
    cleanupPerformanceMode();
    return;
  }
  
  // Apply performance mode
  reapplyPerformanceMode();
  
  // Set up state monitoring
  monitorGameState();
}

// GRID MODE FUNCTIONALITY (FORMER TOGGLE MAP GRID)

// Create and display grid overlay
function createGridOverlay() {
    // Remove existing overlay if present
    const existingOverlay = document.getElementById(GRID_OVERLAY_ID);
    if (existingOverlay) existingOverlay.remove();

    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = GRID_OVERLAY_ID;
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
    `;

    // Create styles for tile labels
    const style = document.createElement('style');
    style.id = `${GRID_OVERLAY_ID}-style`;
    style.textContent = `
        .tile-label {
            position: absolute;
            display: flex;
            align-items: center;
            justify-content: center;
            width: calc(32px * var(--zoomFactor));
            height: calc(32px * var(--zoomFactor));
            border: ${config.mapGrid.borderThickness}px solid rgba(255, 255, 255, 0.5);
            background-color: rgba(0, 0, 0, 0.5);
            color: ${config.mapGrid.labelColor};
            text-shadow: 0 0 5px ${config.mapGrid.labelColor}, 0 0 10px ${config.mapGrid.labelColor}99;
            font-family: "Press Start 2P", "VT323", monospace;
            font-size: calc(${config.mapGrid.fontSize}px * var(--zoomFactor));
            z-index: 10000;
            pointer-events: none;
            text-align: center;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 10px ${config.mapGrid.color};
            border-radius: 3px;
            overflow: hidden;
        }
    `;
    document.head.appendChild(style);

    // Find all tiles
    const tiles = document.querySelectorAll('[id^="tile-index-"]');

    // For each tile, create a label
    tiles.forEach(tile => {
        const tileId = tile.id.replace('tile-index-', '');

        // Create label
        const label = document.createElement('div');
        label.className = 'tile-label';
        label.textContent = tileId;

        // Position at center of tile using computed position
        const computedStyle = window.getComputedStyle(tile);
        const right = computedStyle.right;
        const bottom = computedStyle.bottom;

        // Extract values and convert to center position
        const rightValue = parseFloat(right);
        const bottomValue = parseFloat(bottom);

        // Set position based on the right/bottom values
        label.style.right = `calc(${rightValue}px - (16px * var(--zoomFactor)))`;
        label.style.bottom = `calc(${bottomValue}px - (16px * var(--zoomFactor)))`;

        overlay.appendChild(label);
    });

    // Add overlay to the game container
    const container = document.getElementById('background-scene') || document.getElementById('game-container') || document.body;
    container.appendChild(overlay);

    return overlay;
}

// Toggle grid visibility
function toggleGrid() {
    config.mapGrid.enabled = !config.mapGrid.enabled;

    if (config.mapGrid.enabled) {
        gridOverlay = createGridOverlay();
        api.ui.updateButton(GRID_TOGGLE_ID, {
            text: t('gridButtonText'),
            primary: true,
            tooltip: t('gridButtonTooltipEnabled')
        });
    } else {
        cleanupGrid();
        api.ui.updateButton(GRID_TOGGLE_ID, {
            text: t('gridButtonText'),
            primary: false,
            tooltip: t('gridButtonTooltipDisabled')
        });
    }

    // Save config
    api.service.updateScriptConfig(context.hash, config);
}

// Clean up grid overlay
function cleanupGrid() {
    if (gridOverlay) {
        gridOverlay.remove();
        gridOverlay = null;
    }
    
    const gridStyle = document.getElementById(`${GRID_OVERLAY_ID}-style`);
    if (gridStyle) {
        gridStyle.remove();
    }
}

// UI COMPONENTS AND INITIALIZATION

// Create the configuration panel UI
function createConfigPanel() {
  const content = document.createElement('div');
  content.style.cssText = 'display: flex; flex-direction: column; gap: 20px;';

  // Create Performance Mode section
  const perfSection = document.createElement('fieldset');
  perfSection.style.cssText = 'border: 1px solid #666; border-radius: 5px; padding: 10px; margin: 0;';
  
  const perfLegend = document.createElement('legend');
  perfLegend.textContent = t('perfSectionTitle');
  perfLegend.style.cssText = 'font-weight: bold; color: #0c6;';
  perfSection.appendChild(perfLegend);
  
  const perfContent = document.createElement('div');
  perfContent.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
  
  // Show names checkbox
  const namesContainer = document.createElement('div');
  namesContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const namesInput = document.createElement('input');
  namesInput.type = 'checkbox';
  namesInput.id = 'names-input';
  namesInput.checked = config.performance.showNames;
  
  const namesLabel = document.createElement('label');
  namesLabel.htmlFor = 'names-input';
  namesLabel.textContent = t('showNamesLabel');
  
  namesContainer.appendChild(namesInput);
  namesContainer.appendChild(namesLabel);
  perfContent.appendChild(namesContainer);

  // Show HP bars checkbox
  const hpContainer = document.createElement('div');
  hpContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const hpInput = document.createElement('input');
  hpInput.type = 'checkbox';
  hpInput.id = 'hp-input';
  hpInput.checked = config.performance.showHP;
  
  const hpLabel = document.createElement('label');
  hpLabel.htmlFor = 'hp-input';
  hpLabel.textContent = t('showHPLabel');
  
  hpContainer.appendChild(hpInput);
  hpContainer.appendChild(hpLabel);
  perfContent.appendChild(hpContainer);
  
  // Show hitboxes checkbox
  const hitboxContainer = document.createElement('div');
  hitboxContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const hitboxInput = document.createElement('input');
  hitboxInput.type = 'checkbox';
  hitboxInput.id = 'hitbox-input';
  hitboxInput.checked = config.performance.showHitboxes;
  
  const hitboxLabel = document.createElement('label');
  hitboxLabel.htmlFor = 'hitbox-input';
  hitboxLabel.textContent = t('showHitboxesLabel');
  
  hitboxContainer.appendChild(hitboxInput);
  hitboxContainer.appendChild(hitboxLabel);
  perfContent.appendChild(hitboxContainer);
  
  // Show walkable paths checkbox
  const walkableContainer = document.createElement('div');
  walkableContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const walkableInput = document.createElement('input');
  walkableInput.type = 'checkbox';
  walkableInput.id = 'walkable-input';
  walkableInput.checked = config.performance.showWalkablePaths;
  
  const walkableLabel = document.createElement('label');
  walkableLabel.htmlFor = 'walkable-input';
  walkableLabel.textContent = t('showWalkablePathsLabel');
  
  walkableContainer.appendChild(walkableInput);
  walkableContainer.appendChild(walkableLabel);
  perfContent.appendChild(walkableContainer);

  // Tile color input
  const colorContainer = document.createElement('div');
  colorContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const colorLabel = document.createElement('label');
  colorLabel.htmlFor = 'color-input';
  colorLabel.textContent = t('tileColorLabel');
  
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.id = 'color-input';
  colorInput.value = config.performance.tileColor;
  
  colorContainer.appendChild(colorLabel);
  colorContainer.appendChild(colorInput);
  perfContent.appendChild(colorContainer);
  
  // Hitbox color input (simplified - can't use rgba with input type="color")
  const hitboxColorContainer = document.createElement('div');
  hitboxColorContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const hitboxColorLabel = document.createElement('label');
  hitboxColorLabel.htmlFor = 'hitbox-color-input';
  hitboxColorLabel.textContent = t('hitboxColorLabel');
  
  const hitboxColorInput = document.createElement('input');
  hitboxColorInput.type = 'color';
  hitboxColorInput.id = 'hitbox-color-input';
  hitboxColorInput.value = '#ff0000'; // Default red
  
  hitboxColorContainer.appendChild(hitboxColorLabel);
  hitboxColorContainer.appendChild(hitboxColorInput);
  perfContent.appendChild(hitboxColorContainer);
  
  // Walkable color input (simplified - can't use rgba with input type="color")
  const walkableColorContainer = document.createElement('div');
  walkableColorContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  
  const walkableColorLabel = document.createElement('label');
  walkableColorLabel.htmlFor = 'walkable-color-input';
  walkableColorLabel.textContent = t('walkableColorLabel');
  
  const walkableColorInput = document.createElement('input');
  walkableColorInput.type = 'color';
  walkableColorInput.id = 'walkable-color-input';
  walkableColorInput.value = '#00ff00'; // Default green
  
  walkableColorContainer.appendChild(walkableColorLabel);
  walkableColorContainer.appendChild(walkableColorInput);
  perfContent.appendChild(walkableColorContainer);
  
  perfSection.appendChild(perfContent);
  content.appendChild(perfSection);
  
  // Create Grid section
  const gridSection = document.createElement('fieldset');
  gridSection.style.cssText = 'border: 1px solid #666; border-radius: 5px; padding: 10px; margin: 0;';
  
  const gridLegend = document.createElement('legend');
  gridLegend.textContent = t('gridSectionTitle');
  gridLegend.style.cssText = 'font-weight: bold; color: #0c6;';
  gridSection.appendChild(gridLegend);
  
  const gridContent = document.createElement('div');
  gridContent.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
  
  // Label color picker
  const labelColorRow = document.createElement('div');
  labelColorRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const labelColorLabel = document.createElement('label');
  labelColorLabel.textContent = t('labelColorLabel');
  labelColorLabel.htmlFor = 'grid-label-color';

  const labelColorInput = document.createElement('input');
  labelColorInput.type = 'color';
  labelColorInput.value = config.mapGrid.labelColor;
  labelColorInput.id = 'grid-label-color';

  labelColorRow.appendChild(labelColorLabel);
  labelColorRow.appendChild(labelColorInput);
  gridContent.appendChild(labelColorRow);

  // Grid color picker
  const gridColorRow = document.createElement('div');
  gridColorRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const gridColorLabel = document.createElement('label');
  gridColorLabel.textContent = t('gridColorLabel');
  gridColorLabel.htmlFor = 'grid-color';

  const gridColorInput = document.createElement('input');
  gridColorInput.type = 'color';
  gridColorInput.value = config.mapGrid.color.replace(/[^\w,]/g, '').slice(0, 7);
  gridColorInput.id = 'grid-color';

  gridColorRow.appendChild(gridColorLabel);
  gridColorRow.appendChild(gridColorInput);
  gridContent.appendChild(gridColorRow);

  // Font size slider
  const fontSizeRow = document.createElement('div');
  fontSizeRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 8px;';

  const fontSizeLabel = document.createElement('label');
  fontSizeLabel.textContent = t('fontSizeLabel');
  fontSizeLabel.htmlFor = 'grid-font-size';

  const fontSizeValue = document.createElement('span');
  fontSizeValue.textContent = config.mapGrid.fontSize;
  fontSizeValue.id = 'font-size-value';
  fontSizeValue.style.marginLeft = '10px';
  fontSizeValue.style.minWidth = '20px';
  fontSizeValue.style.textAlign = 'center';

  const fontSizeInput = document.createElement('input');
  fontSizeInput.type = 'range';
  fontSizeInput.min = '8';
  fontSizeInput.max = '16';
  fontSizeInput.value = config.mapGrid.fontSize;
  fontSizeInput.id = 'grid-font-size';
  fontSizeInput.style.flex = '1';

  fontSizeInput.addEventListener('input', () => {
    fontSizeValue.textContent = fontSizeInput.value;
  });

  fontSizeRow.appendChild(fontSizeLabel);
  fontSizeRow.appendChild(fontSizeInput);
  fontSizeRow.appendChild(fontSizeValue);
  gridContent.appendChild(fontSizeRow);
  
  gridSection.appendChild(gridContent);
  content.appendChild(gridSection);

  // Custom CSS for inputs to ensure better readability
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    #${CONFIG_PANEL_ID} input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: #4a5;
    }
    
    #${CONFIG_PANEL_ID} input[type="color"] {
      width: 50px;
      height: 24px;
      background-color: #333;
      border: 1px solid #555;
      border-radius: 4px;
    }
    
    #${CONFIG_PANEL_ID} input[type="range"] {
      accent-color: #4a5;
    }
  `;
  document.head.appendChild(styleElement);

  // Create buttons array
  const buttons = [
    {
      text: t('saveButton'),
      primary: true,
      onClick: () => {
        // Update performance configuration with form values
        config.performance.showNames = document.getElementById('names-input').checked;
        config.performance.showHP = document.getElementById('hp-input').checked;
        config.performance.showHitboxes = document.getElementById('hitbox-input').checked;
        config.performance.showWalkablePaths = document.getElementById('walkable-input').checked;
        config.performance.tileColor = document.getElementById('color-input').value;
        
        // For the rgba colors, we'll keep the alpha values but update the base color
        const hitboxBaseColor = document.getElementById('hitbox-color-input').value;
        config.performance.hitboxColor = `${hitboxBaseColor}4D`; // 4D is ~30% opacity in hex
        
        const walkableBaseColor = document.getElementById('walkable-color-input').value;
        config.performance.walkableColor = `${walkableBaseColor}4D`; // Increased opacity from 26 to 4D (30%)
        
        // Update grid configuration with form values
        config.mapGrid.labelColor = document.getElementById('grid-label-color').value;
        config.mapGrid.color = document.getElementById('grid-color').value;
        config.mapGrid.fontSize = parseInt(document.getElementById('grid-font-size').value);
        
        // Save configuration
        api.service.updateScriptConfig(context.hash, config);
        
        // If features are enabled, reapply with new settings
        if (config.performance.enabled) {
          reapplyPerformanceMode();
        }
        
        if (config.mapGrid.enabled && gridOverlay) {
          gridOverlay.remove();
          gridOverlay = createGridOverlay();
        }
      }
    },
    {
      text: t('cancelButton'),
      primary: false
    }
  ];

  // Create and return the config panel
  return api.ui.createConfigPanel({
    id: CONFIG_PANEL_ID,
    title: t('configTitle'),
    modId: MOD_ID,
    content: content,
    buttons: buttons
  });
}

// Initialize UI
function init() {
  console.log('Custom Display initializing UI...');

  api.ui.addButtonStack([
    // Add the performance mode toggle button
    {
      id: PERF_TOGGLE_ID,
      text: t('perfButtonText'),
      modId: MOD_ID,
      tooltip: config.performance.enabled ? t('perfButtonTooltipEnabled') : t('perfButtonTooltipDisabled'),
      primary: config.performance.enabled,
      onClick: togglePerformanceMode
    },
    // Add the grid toggle button
    {
      id: GRID_TOGGLE_ID,
      text: t('gridButtonText'),
      modId: MOD_ID,
      tooltip: config.mapGrid.enabled ? t('gridButtonTooltipEnabled') : t('gridButtonTooltipDisabled'),
      primary: config.mapGrid.enabled,
      onClick: toggleGrid
    },
    // Add the configuration button
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
  
  // Apply features if enabled
  if (config.performance.enabled) {
    applyPerformanceMode(true);
  }
  
  if (config.mapGrid.enabled) {
    gridOverlay = createGridOverlay();
  }
  
  console.log('Custom Display UI initialized');
}

// Initialize the mod
init();

// Export functionality
context.exports = {
  togglePerformanceMode: togglePerformanceMode,
  toggleGrid: toggleGrid,
  reapplyPerformanceMode: reapplyPerformanceMode,
  updateConfig: (newConfig) => {
    Object.assign(config, newConfig);
    api.service.updateScriptConfig(context.hash, config);
    
    // If features are enabled, reapply with new settings
    if (config.performance.enabled) {
      reapplyPerformanceMode();
    }
    
    if (config.mapGrid.enabled && gridOverlay) {
      gridOverlay.remove();
      gridOverlay = createGridOverlay();
    }
  }
}; 