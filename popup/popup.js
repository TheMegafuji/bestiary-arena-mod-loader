document.addEventListener('DOMContentLoaded', function() {
  // Polyfill for Chrome and Firefox WebExtensions
  if (typeof window.browser === 'undefined') {
    window.browser = window.chrome;
  }

  // Global error function to ensure it's accessible everywhere
  window.showError = function(message) {
    console.log("Mostrando erro:", message);
    let errorDiv = document.getElementById('popup-error-message');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.id = 'popup-error-message';
      errorDiv.style.position = 'fixed';
      errorDiv.style.top = '10px';
      errorDiv.style.left = '50%';
      errorDiv.style.transform = 'translateX(-50%)';
      errorDiv.style.background = '#ff5555';
      errorDiv.style.color = '#fff';
      errorDiv.style.padding = '8px 16px';
      errorDiv.style.borderRadius = '6px';
      errorDiv.style.zIndex = '9999';
      errorDiv.style.fontWeight = 'bold';
      errorDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      errorDiv.style.maxWidth = '90vw';
      errorDiv.style.textAlign = 'center';
      errorDiv.style.fontSize = '15px';
      document.body.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 3500);
  };

  // Make sure it's also globally available in current scope
  var showError = window.showError;

  const hashForm = document.getElementById('hash-form');
  const hashInput = document.getElementById('hash-input');
  const nameInput = document.getElementById('name-input');
  const scriptsContainer = document.getElementById('scripts-container');
  const localModsContainer = document.getElementById('local-mods-container');
  const languageSelect = document.getElementById('language-select');

  // Get global i18n or create fallback
  const i18n = window.i18n || {
    init: async function() { return this; },
    t: function(key) { return key; },
    getLocale: function() { return 'pt-BR'; },
    setLocale: async function() { return true; },
    updateInterface: function() {}
  };

  i18n.init().then(() => {
    console.log('i18n inicializado, idioma atual:', i18n.getLocale());
    languageSelect.value = i18n.getLocale();
    i18n.updateInterface();
    
    // Carregar scripts ativos e verificar/inicializar mods locais
    loadActiveScripts();
    checkAndInitLocalMods(); // Usar a nova função em vez de loadLocalMods
    
    hashForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const hash = hashInput.value.trim();
      const name = nameInput.value.trim();
      
      if (hash) {
        await addScript(hash, name);
        hashInput.value = '';
        nameInput.value = '';
      }
    });
    
    languageSelect.addEventListener('change', async () => {
      await i18n.setLocale(languageSelect.value);
      i18n.updateInterface();
      loadActiveScripts();
      loadLocalMods();
    });
  });

  function renderLocalMods(mods) {
    console.log("renderLocalMods chamado com:", mods);
    localModsContainer.innerHTML = '';
    
    if (!mods || !Array.isArray(mods) || mods.length === 0) {
      console.log("Nenhum mod local para exibir, mostrando mensagem vazia");
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = i18n.t('messages.noLocalMods');
      localModsContainer.appendChild(emptyMessage);
      
      // Adicionar botão para inicializar mods
      const initButton = document.createElement('button');
      initButton.className = 'primary-button';
      initButton.textContent = "Inicializar Mods Padrão";
      initButton.style.marginTop = "10px";
      initButton.addEventListener('click', () => {
        initLocalMods();
      });
      localModsContainer.appendChild(initButton);
      return;
    }
    
    console.log("Renderizando " + mods.length + " mods locais");
    mods.forEach(mod => {
      const modCard = document.createElement('div');
      modCard.className = 'script-card local-mod-card';
      modCard.dataset.name = mod.name;
      const modHeader = document.createElement('div');
      modHeader.className = 'script-header';
      const modTitle = document.createElement('div');
      modTitle.className = 'script-title';
      modTitle.textContent = mod.displayName || mod.name;
      modHeader.appendChild(modTitle);
      modCard.appendChild(modHeader);
      const modControls = document.createElement('div');
      modControls.className = 'script-controls';
      const modToggle = document.createElement('div');
      modToggle.className = 'script-toggle';
      const toggleLabel = document.createElement('span');
      toggleLabel.textContent = i18n.t('controls.active');
      const toggleSwitch = document.createElement('label');
      toggleSwitch.className = 'toggle-switch';
      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = mod.enabled;
      toggleInput.addEventListener('change', () => {
        toggleLocalMod(mod.name, toggleInput.checked);
      });
      const slider = document.createElement('span');
      slider.className = 'slider';
      toggleSwitch.appendChild(toggleInput);
      toggleSwitch.appendChild(slider);
      modToggle.appendChild(toggleLabel);
      modToggle.appendChild(toggleSwitch);
      modControls.appendChild(modToggle);
      modCard.appendChild(modControls);
      const executeButton = document.createElement('button');
      executeButton.className = 'primary-button button-small';
      executeButton.textContent = i18n.t('controls.execute');
      executeButton.addEventListener('click', () => {
        executeLocalMod(mod.name);
      });
      modControls.appendChild(executeButton);
      localModsContainer.appendChild(modCard);
    });
  }

  function renderScripts(scripts) {
    scriptsContainer.innerHTML = '';
    if (!scripts || scripts.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = i18n.t('messages.noScripts');
      scriptsContainer.appendChild(emptyMessage);
      return;
    }
    scripts.forEach(script => {
      const scriptCard = document.createElement('div');
      scriptCard.className = 'script-card';
      scriptCard.dataset.hash = script.hash;
      const scriptHeader = document.createElement('div');
      scriptHeader.className = 'script-header';
      const scriptTitle = document.createElement('div');
      scriptTitle.className = 'script-title';
      scriptTitle.textContent = script.name || `Script ${script.hash.substring(0, 8)}`;
      scriptHeader.appendChild(scriptTitle);
      scriptCard.appendChild(scriptHeader);
      const scriptHash = document.createElement('div');
      scriptHash.className = 'script-hash';
      scriptHash.textContent = script.hash;
      scriptCard.appendChild(scriptHash);
      const scriptControls = document.createElement('div');
      scriptControls.className = 'script-controls';
      const scriptToggle = document.createElement('div');
      scriptToggle.className = 'script-toggle';
      const toggleLabel = document.createElement('span');
      toggleLabel.textContent = i18n.t('controls.active');
      const toggleSwitch = document.createElement('label');
      toggleSwitch.className = 'toggle-switch';
      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = script.enabled;
      toggleInput.addEventListener('change', () => {
        toggleScript(script.hash, toggleInput.checked);
      });
      const slider = document.createElement('span');
      slider.className = 'slider';
      toggleSwitch.appendChild(toggleInput);
      toggleSwitch.appendChild(slider);
      scriptToggle.appendChild(toggleLabel);
      scriptToggle.appendChild(toggleSwitch);
      const scriptActions = document.createElement('div');
      scriptActions.className = 'script-actions';
      const executeButton = document.createElement('button');
      executeButton.className = 'primary-button button-small';
      executeButton.textContent = i18n.t('controls.execute');
      executeButton.addEventListener('click', () => {
        executeScript(script.hash);
      });
      const editButton = document.createElement('button');
      editButton.className = 'secondary-button button-small';
      editButton.textContent = i18n.t('controls.edit');
      editButton.addEventListener('click', () => {
        toggleConfigPanel(scriptCard, script);
      });
      const deleteButton = document.createElement('button');
      deleteButton.className = 'danger-button button-small';
      deleteButton.textContent = i18n.t('controls.remove');
      deleteButton.addEventListener('click', () => {
        removeScript(script.hash);
      });
      scriptActions.appendChild(executeButton);
      scriptActions.appendChild(editButton);
      scriptActions.appendChild(deleteButton);
      scriptControls.appendChild(scriptToggle);
      scriptControls.appendChild(scriptActions);
      scriptCard.appendChild(scriptControls);
      scriptsContainer.appendChild(scriptCard);
    });
  }

  function toggleConfigPanel(scriptCard, script) {
    document.querySelectorAll('.script-config').forEach(panel => {
      panel.remove();
    });
    
    const existingConfig = scriptCard.querySelector('.script-config');
    
    if (existingConfig) {
      existingConfig.remove();
      return;
    }
    
    const configPanel = document.createElement('div');
    configPanel.className = 'script-config';
    
    const nameField = document.createElement('div');
    nameField.className = 'config-field';
    
    const nameLabel = document.createElement('label');
    nameLabel.textContent = i18n.t('form.nameLabel');
    
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = script.name || '';
    nameInput.placeholder = i18n.t('form.namePlaceholder');
    
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);
    configPanel.appendChild(nameField);
    
    const actionButtons = document.createElement('div');
    actionButtons.className = 'script-actions';
    
    const saveButton = document.createElement('button');
    saveButton.className = 'primary-button button-small';
    saveButton.textContent = i18n.t('controls.save');
    saveButton.addEventListener('click', () => {
      updateScriptConfig(script.hash, {
        name: nameInput.value.trim()
      });
      configPanel.remove();
    });
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'secondary-button button-small';
    cancelButton.textContent = i18n.t('controls.cancel');
    cancelButton.addEventListener('click', () => {
      configPanel.remove();
    });
    
    actionButtons.appendChild(saveButton);
    actionButtons.appendChild(cancelButton);
    configPanel.appendChild(actionButtons);
    
    scriptCard.appendChild(configPanel);
  }

  async function addScript(hash, name) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'registerScript',
        hash,
        name
      });
      
      if (response && response.success) {
        loadActiveScripts();
        return true;
      } else {
        const errorMsg = response ? response.error || 'Unknown error' : 'No response from background script';
        showError('Erro ao adicionar script: ' + errorMsg);
        return false;
      }
    } catch (error) {
      showError('Erro ao comunicar com a extensão: ' + error.message);
      return false;
    }
  }

  async function toggleScript(hash, enabled) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'toggleScript',
        hash,
        enabled
      });
      
      if (!response.success) {
        showError(response.error || i18n.t('messages.unknownError'));
        loadActiveScripts();
      }
    } catch (error) {
      showError(`${i18n.t('messages.errorCommunication')}: ${error.message}`);
      loadActiveScripts();
    }
  }

  async function toggleLocalMod(name, enabled) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'toggleLocalMod',
        name,
        enabled
      });
      
      if (!response.success) {
        showError(response.error || i18n.t('messages.unknownError'));
        loadLocalMods();
      }
    } catch (error) {
      showError(`${i18n.t('messages.errorCommunication')}: ${error.message}`);
      loadLocalMods();
    }
  }

  async function executeLocalMod(name) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'executeLocalMod',
        name
      });
      
      if (!response.success) {
        showError(response.error || i18n.t('messages.unknownError'));
      }
    } catch (error) {
      showError(`${i18n.t('messages.errorCommunication')}: ${error.message}`);
    }
  }

  async function executeScript(hash) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'executeScript',
        hash
      });
      
      if (!response.success) {
        showError(response.error || i18n.t('messages.unknownError'));
      }
    } catch (error) {
      showError(`${i18n.t('messages.errorCommunication')}: ${error.message}`);
    }
  }

  async function updateScriptConfig(hash, config) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateScriptConfig',
        hash,
        config
      });
      
      if (response.success) {
        loadActiveScripts();
      } else {
        showError(response.error || i18n.t('messages.unknownError'));
      }
    } catch (error) {
      showError(`${i18n.t('messages.errorCommunication')}: ${error.message}`);
    }
  }

  async function removeScript(hash) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'removeScript',
        hash
      });
      
      if (response.success) {
        loadActiveScripts();
      } else {
        showError(response.error || i18n.t('messages.unknownError'));
      }
    } catch (error) {
      showError(`${i18n.t('messages.errorCommunication')}: ${error.message}`);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.activeScripts) {
        loadActiveScripts();
      }
      if (changes.localMods) {
        loadLocalMods();
      }
      if (changes.locale) {
        languageSelect.value = changes.locale.newValue;
        i18n.setLocale(changes.locale.newValue);
      }
    }
  });

  document.getElementById('reload-mods-btn')?.addEventListener('click', async () => {
    console.log("Botão de recarregar mods pressionado");
    
    // Primeiro verificar se há mods, e inicializar se necessário
    await checkAndInitLocalMods();
    
    // Notificar a página para recarregar mods
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'reloadLocalMods' });
      }
    });
  });

  document.getElementById('check-api-btn')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'checkAPI' }, (response) => {
          if (chrome.runtime.lastError) {
            showError('Error checking API: ' + chrome.runtime.lastError.message);
            return;
          }
          
          if (response && response.success) {
            showError(`API is available! Methods: ${response.methods.join(', ')}`);
          } else {
            showError('API is not available in the active tab');
          }
        });
      } else {
        showError('No active tab found');
      }
    });
  });

  document.getElementById('log-storage-btn')?.addEventListener('click', async () => {
    try {
      const localData = await chrome.storage.local.get(null);
      const syncData = await chrome.storage.sync.get(null);
      
      showError('Storage contents logged to console');
      console.log('Local Storage:', localData);
      console.log('Sync Storage:', syncData);
    } catch (error) {
      showError('Error accessing storage: ' + error.message);
    }
  });

  // Check for Firefox to display warnings if needed
  const isFirefox = function() {
    return navigator.userAgent.includes('Firefox') || 
           (typeof browser !== 'undefined' && 
            typeof chrome !== 'undefined' && 
            Object.getPrototypeOf(browser) !== Object.getPrototypeOf(chrome));
  };

  // Display Firefox warning if needed
  if (isFirefox()) {
    const warningBanner = document.createElement('div');
    warningBanner.className = 'firefox-warning';
    warningBanner.textContent = "Atenção: no Firefox, existe uma limitação com carregamento de Gists. Importe mods locais se possível.";
    warningBanner.style.backgroundColor = "#FFF3CD";
    warningBanner.style.color = "#856404";
    warningBanner.style.padding = "8px 12px";
    warningBanner.style.borderRadius = "4px";
    warningBanner.style.margin = "8px 0";
    warningBanner.style.fontWeight = "bold";
    warningBanner.style.fontSize = "14px";
    document.body.insertBefore(warningBanner, document.body.firstChild);
  }

  // Função para inicializar mods locais do zero
  async function initLocalMods() {
    console.log("Tentando inicializar mods locais via popup...");
    
    const availableMods = [
      { name: "Monster_tier_list.js", key: "Monster Tier List", enabled: true },
      { name: "Highscore_Improvements.js", key: "Highscores Improvements", enabled: true },
      { name: "Item_tier_list.js", key: "Item Tier List", enabled: true },
      { name: "UIComponentsShowcase.js", key: "UI Showcase", enabled: false },
      { name: "Team_Copier.js", key: "Team Copier", enabled: true },
      { name: "Hero_Editor.js", key: "Hero Editor", enabled: true },
      { name: "Setup_Manager.js", key: "Setup Manager", enabled: true },
      { name: "Custom_Display.js", key: "Custom Display", enabled: true },
      { name: "TestMod.js", key: "Test Mod", enabled: false }
    ];
    
    try {
      const mods = availableMods.map(mod => ({
        name: mod.name,
        displayName: mod.key,
        isLocal: true,
        enabled: mod.enabled
      }));
      
      // Salvar no storage e atualizar a UI
      chrome.runtime.sendMessage({
        action: 'registerLocalMods',
        mods: mods
      }, (response) => {
        console.log("Resposta de inicialização de mods locais:", response);
        loadLocalMods(); // Recarregar após inicializar
      });
    } catch (error) {
      console.error("Erro ao inicializar mods locais:", error);
    }
  }
  
  // Verificar se já existem mods locais ou inicializar
  async function checkAndInitLocalMods() {
    try {
      console.log("Verificando se é necessário inicializar mods locais...");
      chrome.storage.local.get('localMods', (data) => {
        const existingMods = data.localMods;
        console.log("Mods locais existentes:", existingMods);
        
        if (!existingMods || !Array.isArray(existingMods) || existingMods.length === 0) {
          console.log("Nenhum mod local encontrado, inicializando...");
          initLocalMods();
        } else {
          console.log("Mods locais já existem, carregando normalmente...");
          loadLocalMods();
        }
      });
    } catch (error) {
      console.error("Erro ao verificar mods locais:", error);
      loadLocalMods(); // Tentar carregar normalmente em caso de erro
    }
  }
});

// Função simplificada de loadActiveScripts (sem XMLHttpRequest)
async function loadActiveScripts() {
  console.log("Iniciando carregamento de scripts ativos no popup...");
  try {
    // Usar chrome.runtime.sendMessage diretamente
    chrome.runtime.sendMessage({ action: 'getActiveScripts' }, (response) => {
      console.log("Resposta de getActiveScripts:", response);
      
      if (chrome.runtime.lastError) {
        console.error("Erro ao obter scripts ativos:", chrome.runtime.lastError);
        showError("Erro ao obter scripts ativos: " + chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.success) {
        console.log("Scripts ativos obtidos com sucesso:", response.scripts);
        if (response.scripts && Array.isArray(response.scripts)) {
          renderScripts(response.scripts);
        } else {
          console.warn("Resposta de scripts ativos vazia ou inválida");
          renderScripts([]);
        }
      } else {
        const errorMsg = response ? response.error || i18n.t('messages.unknownError') : 'Sem resposta do script de background';
        console.error("Erro ao carregar scripts ativos:", errorMsg);
        showError(`${i18n.t('messages.errorLoadingScripts')}: ${errorMsg}`);
        renderScripts([]);
      }
    });
  } catch (error) {
    console.error('Erro ao comunicar com a extensão:', error);
    showError(`${i18n.t('messages.errorCommunication')}: ${error.message}`);
    renderScripts([]);
  }
}

// Função simplificada de loadLocalMods (sem XMLHttpRequest)
async function loadLocalMods() {
  console.log("Iniciando carregamento de mods locais no popup...");
  try {
    // Usar chrome.runtime.sendMessage diretamente
    chrome.runtime.sendMessage({ action: 'getLocalMods' }, (response) => {
      console.log("Resposta de getLocalMods:", response);
      
      if (chrome.runtime.lastError) {
        console.error("Erro ao obter mods locais:", chrome.runtime.lastError);
        showError("Erro ao obter mods locais: " + chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.success) {
        console.log("Mods locais obtidos com sucesso:", response.mods);
        if (response.mods && Array.isArray(response.mods)) {
          renderLocalMods(response.mods);
        } else {
          console.warn("Resposta de mods locais vazia ou inválida");
          renderLocalMods([]);
        }
      } else {
        const errorMsg = response ? response.error || 'Erro desconhecido' : 'Sem resposta do script de background';
        console.error("Erro ao carregar mods locais:", errorMsg);
        showError('Erro ao carregar mods locais: ' + errorMsg);
        renderLocalMods([]);
      }
    });
  } catch (error) {
    console.error('Erro ao comunicar com a extensão:', error);
    showError('Erro ao comunicar com a extensão: ' + error.message);
    renderLocalMods([]);
  }
}