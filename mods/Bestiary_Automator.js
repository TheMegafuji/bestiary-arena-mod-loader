// Bestiary Automator Mod for Bestiary Arena
// Code by MathiasBynens and TheMegafuji
console.log('Bestiary Automator initializing...');

// Configuration with defaults
const defaultConfig = {
  enabled: false,
  autoRefillStamina: true,
  minimumStaminaWithoutRefill: 3,
  autoCollectRewards: true,
  autoDayCare: true,
  currentLocale: document.documentElement.lang === 'pt' || 
    document.querySelector('html[lang="pt"]') || 
    window.location.href.includes('/pt/') ? 'pt' : 'en'
};

// Initialize with saved config or defaults
const config = Object.assign({}, defaultConfig, context.config);

// Constants
const MOD_ID = 'bestiary-automator';
const BUTTON_ID = `${MOD_ID}-button`;
const CONFIG_BUTTON_ID = `${MOD_ID}-config-button`;
const CONFIG_PANEL_ID = `${MOD_ID}-config-panel`;

// Translations
const TRANSLATIONS = {
  en: {
    buttonTooltip: 'Bestiary Automator',
    configButtonTooltip: 'Automator Settings',
    modalTitle: 'Bestiary Automator Settings',
    enabled: 'Enable Automation',
    autoRefillStamina: 'Auto Refill Stamina',
    minimumStaminaLabel: 'Minimum Stamina Without Refill',
    autoCollectRewards: 'Auto Collect Rewards',
    autoDayCare: 'Auto Handle Day Care',
    saveButton: 'Save Settings',
    closeButton: 'Close',
    statusEnabled: 'Automator Enabled',
    statusDisabled: 'Automator Disabled',
    settingsSaved: 'Settings saved successfully!',
    // Game-specific translations
    usePotion: 'Use potion (1)',
    close: 'Close',
    collect: 'Collect',
    inventory: 'Inventory',
    levelUp: 'Level up'
  },
  pt: {
    buttonTooltip: 'Automatizador do Bestiário',
    configButtonTooltip: 'Configurações do Automatizador',
    modalTitle: 'Configurações do Automatizador',
    enabled: 'Ativar Automação',
    autoRefillStamina: 'Reabastecimento Automático de Stamina',
    minimumStaminaLabel: 'Stamina Mínima Sem Reabastecimento',
    autoCollectRewards: 'Coletar Recompensas Automaticamente',
    autoDayCare: 'Cuidar Automaticamente da Creche',
    saveButton: 'Salvar Configurações',
    closeButton: 'Fechar',
    statusEnabled: 'Automatizador Ativado',
    statusDisabled: 'Automatizador Desativado',
    settingsSaved: 'Configurações salvas com sucesso!',
    // Game-specific translations
    usePotion: 'Usar poção (1)',
    close: 'Fechar',
    collect: 'Resgatar',
    inventory: 'Inventário',
    levelUp: 'Level up'
  }
};

// Get translation based on current locale
function t(key) {
  const locale = config.currentLocale;
  const translations = TRANSLATIONS[locale] || TRANSLATIONS.en;
  return translations[key] || key;
}

// Helper functions for automation

// Find button with specific text (considering language differences)
const findButtonWithText = (textKey) => {
  const text = t(textKey);
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent === text) return button;
  }
  return null;
};

// Click button with specific text
const clickButtonWithText = (textKey) => {
  const button = findButtonWithText(textKey);
  if (button) {
    button.click();
    return true;
  }
  return false;
};

// Utility function for waiting
let timeoutId;
const sleep = (timeout = 1000) => {
  return new Promise((resolve) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      resolve();
    }, timeout);
  });
};

// Show a notification message
function showNotification(message, type = 'info', duration = 3000) {
  if (api.ui && api.ui.notify) {
    api.ui.notify({
      message: message,
      type: type,
      duration: duration
    });
    return;
  }
  
  // Fallback to a simple modal
  api.ui.components.createModal({
    title: type.charAt(0).toUpperCase() + type.slice(1),
    content: message,
    buttons: [{ text: t('closeButton'), primary: true }]
  });
}

// Automation Tasks

// Refill stamina if needed
const refillStaminaIfNeeded = async () => {
  if (!config.autoRefillStamina) return;
  
  try {
    const elStamina = document.querySelector('[title="Stamina"]');
    if (!elStamina) return;
    
    const staminaElement = elStamina.querySelector('span span');
    if (!staminaElement) return;
    
    const stamina = Number(staminaElement.textContent);
    if (stamina >= config.minimumStaminaWithoutRefill) return;
    
    console.log(`[Bestiary Automator] Refilling stamina: current=${stamina}, minimum=${config.minimumStaminaWithoutRefill}`);
    
    elStamina.click();
    await sleep(500);
    clickButtonWithText('usePotion');
    await sleep(500);
    clickButtonWithText('close');
    await sleep(500);
  } catch (error) {
    console.error('[Bestiary Automator] Error refilling stamina:', error);
  }
};

// Take rewards if available
const takeRewardsIfAvailable = async () => {
  if (!config.autoCollectRewards) return;
  
  try {
    const available = document.querySelector('button[aria-haspopup="menu"]:has(.animate-ping)');
    if (!available) return;
    
    console.log('[Bestiary Automator] Taking rewards');
    
    // Open rewards menu
    globalThis.state.menu.send({
      type: 'setState',
      fn: (prev) => {
        return {
          ...prev,
          mode: 'playerLevelRewards',
        };
      },
    });
    await sleep(500);
    clickButtonWithText('collect');
    await sleep(500);
    clickButtonWithText('close');
    await sleep(500);
  } catch (error) {
    console.error('[Bestiary Automator] Error taking rewards:', error);
  }
};

// Handle day care
const handleDayCare = async () => {
  if (!config.autoDayCare) return;
  
  try {
    const dayCareBlip = document.querySelector('div[data-radix-scroll-area-viewport]:has(div:not(.text-invalid) > .animate-ping)');
    if (!dayCareBlip) return;
    
    console.log('[Bestiary Automator] Handling day care');
    
    clickButtonWithText('inventory');
    await sleep(500);
    
    const button = document.querySelector('button:has(img[alt=daycare])');
    if (!button) return;
    
    button.click();
    await sleep(500);
    clickButtonWithText('levelUp');
    await sleep(500);
    clickButtonWithText('close');
    await sleep(500);
  } catch (error) {
    console.error('[Bestiary Automator] Error handling day care:', error);
  }
};

// Update minimum stamina if game shows a stamina requirement
const updateRequiredStamina = () => {
  try {
    const elements = document.querySelectorAll('.action-link');
    for (const element of elements) {
      if (element.textContent !== 'stamina') continue;
      
      const text = element.parentElement.textContent; // 'Not enough stamina (15)'
      const match = text.match(/\((\d+)\)/);
      if (!match) continue;
      
      const staminaRequired = Number(match[1]);
      if (
        (config.minimumStaminaWithoutRefill !== staminaRequired) &&
        (3 <= staminaRequired && staminaRequired <= 18)
      ) {
        config.minimumStaminaWithoutRefill = staminaRequired;
        console.log(`[Bestiary Automator] Setting minimum stamina without refill to ${staminaRequired}`);
        
        // Save the new value to config
        api.service.updateScriptConfig(context.hash, { 
          minimumStaminaWithoutRefill: config.minimumStaminaWithoutRefill 
        });
        
        return;
      }
    }
  } catch (error) {
    console.error('[Bestiary Automator] Error updating required stamina:', error);
  }
};

// Main automation loop
let automationInterval = null;

const startAutomation = () => {
  if (automationInterval) return;
  
  console.log('[Bestiary Automator] Starting automation loop');
  
  // Run immediately once
  runAutomationTasks();
  
  // Then set up interval
  automationInterval = setInterval(runAutomationTasks, 5000);
  
  // Update button to show enabled state
  api.ui.updateButton(BUTTON_ID, {
    text: '',
    icon: '⚡',
    primary: true,
    tooltip: t('statusEnabled')
  });
};

const stopAutomation = () => {
  if (!automationInterval) return;
  
  console.log('[Bestiary Automator] Stopping automation loop');
  
  clearInterval(automationInterval);
  automationInterval = null;
  
  // Update button to show disabled state
  api.ui.updateButton(BUTTON_ID, {
    text: '',
    icon: '⚡',
    primary: false,
    tooltip: t('statusDisabled')
  });
};

const runAutomationTasks = async () => {
  try {
    await takeRewardsIfAvailable();
    await handleDayCare();
    updateRequiredStamina();
    await refillStaminaIfNeeded();
  } catch (error) {
    console.error('[Bestiary Automator] Error in automation tasks:', error);
  }
};

// Toggle automation on/off
const toggleAutomation = () => {
  config.enabled = !config.enabled;
  
  if (config.enabled) {
    startAutomation();
    showNotification(t('statusEnabled'), 'success');
  } else {
    stopAutomation();
    showNotification(t('statusDisabled'), 'info');
  }
  
  // Save the enabled state
  api.service.updateScriptConfig(context.hash, { enabled: config.enabled });
};

// Create the configuration panel
const createConfigPanel = () => {
  const content = document.createElement('div');
  content.style.cssText = 'display: flex; flex-direction: column; gap: 15px;';
  
  // Enable automation checkbox
  const enabledContainer = createCheckboxContainer('enabled-checkbox', t('enabled'), config.enabled);
  
  // Auto refill stamina checkbox
  const refillContainer = createCheckboxContainer('auto-refill-checkbox', t('autoRefillStamina'), config.autoRefillStamina);
  
  // Minimum stamina input
  const staminaContainer = createNumberInputContainer('min-stamina-input', t('minimumStaminaLabel'), config.minimumStaminaWithoutRefill, 3, 18);
  
  // Auto collect rewards checkbox
  const rewardsContainer = createCheckboxContainer('auto-rewards-checkbox', t('autoCollectRewards'), config.autoCollectRewards);
  
  // Auto day care checkbox
  const dayCareContainer = createCheckboxContainer('auto-daycare-checkbox', t('autoDayCare'), config.autoDayCare);
  
  // Add all elements to content
  content.appendChild(enabledContainer);
  content.appendChild(refillContainer);
  content.appendChild(staminaContainer);
  content.appendChild(rewardsContainer);
  content.appendChild(dayCareContainer);
  
  // Create the config panel
  return api.ui.createConfigPanel({
    id: CONFIG_PANEL_ID,
    title: t('modalTitle'),
    modId: MOD_ID,
    content: content,
    buttons: [
      {
        text: t('saveButton'),
        primary: true,
        onClick: () => {
          // Update configuration from form values
          config.enabled = document.getElementById('enabled-checkbox').checked;
          config.autoRefillStamina = document.getElementById('auto-refill-checkbox').checked;
          config.minimumStaminaWithoutRefill = parseInt(document.getElementById('min-stamina-input').value, 10);
          config.autoCollectRewards = document.getElementById('auto-rewards-checkbox').checked;
          config.autoDayCare = document.getElementById('auto-daycare-checkbox').checked;
          
          // Save configuration
          api.service.updateScriptConfig(context.hash, {
            enabled: config.enabled,
            autoRefillStamina: config.autoRefillStamina,
            minimumStaminaWithoutRefill: config.minimumStaminaWithoutRefill,
            autoCollectRewards: config.autoCollectRewards,
            autoDayCare: config.autoDayCare
          });
          
          // Start or stop automation based on enabled state
          if (config.enabled) {
            startAutomation();
          } else {
            stopAutomation();
          }
          
          showNotification(t('settingsSaved'), 'success');
        }
      },
      {
        text: t('closeButton'),
        primary: false
      }
    ]
  });
  
  // Helper to create a checkbox container
  function createCheckboxContainer(id, label, checked) {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center; margin: 5px 0;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = checked;
    checkbox.style.cssText = 'width: 16px; height: 16px; margin-right: 10px;';
    
    const labelElement = document.createElement('label');
    labelElement.htmlFor = id;
    labelElement.textContent = label;
    
    container.appendChild(checkbox);
    container.appendChild(labelElement);
    
    return container;
  }
  
  // Helper to create a number input container
  function createNumberInputContainer(id, label, value, min, max) {
    const container = document.createElement('div');
    container.style.cssText = 'margin: 5px 0;';
    
    const labelElement = document.createElement('label');
    labelElement.htmlFor = id;
    labelElement.textContent = label;
    labelElement.style.cssText = 'display: block; margin-bottom: 5px;';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.min = min;
    input.max = max;
    input.value = value;
    input.style.cssText = 'width: 100%; padding: 5px; background-color: #222; color: #fff; border: 1px solid #444;';
    
    container.appendChild(labelElement);
    container.appendChild(input);
    
    return container;
  }
};

// Create buttons
const createButtons = () => {
  api.ui.addButtonStack([
    // Create the main toggle button
    {
      id: BUTTON_ID,
      text: '',
      icon: '⚡',
      modId: MOD_ID,
      tooltip: config.enabled ? t('statusEnabled') : t('statusDisabled'),
      primary: config.enabled,
      onClick: toggleAutomation,
      customCss: 'flex-grow: 1;'
    },
    // Create the configuration button
    {
      id: CONFIG_BUTTON_ID,
      text: '',
      icon: '⚙️',
      modId: MOD_ID,
      tooltip: t('configButtonTooltip'),
      primary: false,
      onClick: () => api.ui.toggleConfigPanel(CONFIG_PANEL_ID)
    }
  ])
};

// Initialize the mod
function init() {
  console.log('[Bestiary Automator] Initializing UI...');
  
  // Create the buttons
  createButtons();
  
  // Create the config panel
  createConfigPanel();
  
  // Start automation if enabled in config
  if (config.enabled) {
    startAutomation();
  }
  
  console.log('[Bestiary Automator] Initialization complete');
}

// Initialize the mod
init();

// Export functionality
context.exports = {
  toggleAutomation,
  updateConfig: (newConfig) => {
    Object.assign(config, newConfig);
    
    // Update UI as needed
    api.ui.updateButton(BUTTON_ID, {
      primary: config.enabled,
      tooltip: config.enabled ? t('statusEnabled') : t('statusDisabled')
    });
    
    // Start or stop automation based on enabled state
    if (config.enabled) {
      startAutomation();
    } else {
      stopAutomation();
    }
  }
}; 