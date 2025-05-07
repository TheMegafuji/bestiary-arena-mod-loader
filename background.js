// Import the robust polyfill first
importScripts('assets/js/browser-polyfill.js');

const scriptCache = {};

let localMods = [];

function hashToGistUrl(hash) {
  return `https://gist.githubusercontent.com/raw/${hash}?cache=${Date.now()}`;
}

// Função para verificar se é Firefox
function isFirefox() {
  return navigator.userAgent.includes('Firefox') || 
         (typeof browser !== 'undefined' && 
          typeof chrome !== 'undefined' && 
          Object.getPrototypeOf(browser) !== Object.getPrototypeOf(chrome));
}

async function fetchScript(hash) {
  try {
    const url = hashToGistUrl(hash);
    
    // Try fetch first for better compatibility
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const scriptContent = await response.text();
      
      if (scriptContent.length > 1024 * 1024) {
        throw new Error('Script too large (max 1MB)');
      }
      
      scriptCache[hash] = scriptContent;
      chrome.storage.local.set({ [`script_${hash}`]: scriptContent })
        .then(() => {})
        .catch((err) => console.error('Failed to save script to cache', err));
      
      return scriptContent;
    } catch (fetchError) {
      // If fetch fails and we're in Firefox, fall back to XMLHttpRequest
      if (isFirefox() && (fetchError.message.includes('CORS') || fetchError.message.includes('network'))) {
        console.log('Fetch failed, falling back to XMLHttpRequest', fetchError);
        
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.setRequestHeader('Cache-Control', 'no-cache');
          xhr.setRequestHeader('Pragma', 'no-cache');
          
          xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
              const scriptContent = xhr.responseText;
              
              if (scriptContent.length > 1024 * 1024) {
                reject(new Error('Script too large (max 1MB)'));
                return;
              }
              
              scriptCache[hash] = scriptContent;
              chrome.storage.local.set({ [`script_${hash}`]: scriptContent })
                .then(() => resolve(scriptContent))
                .catch(() => resolve(scriptContent)); // Continue even if storage fails
            } else {
              if (isFirefox() && xhr.status === 0) {
                // Firefox CORS issue com GitHub Gist
                reject(new Error('Firefox não consegue acessar Gists diretamente devido a restrições de CORS. Use o Chrome para esta funcionalidade ou importar scripts locais.'));
              } else {
                reject(new Error(`HTTP error! Status: ${xhr.status}`));
              }
            }
          };
          
          xhr.onerror = function() {
            if (isFirefox()) {
              reject(new Error('Firefox não consegue acessar Gists diretamente devido a restrições de CORS. Use o Chrome para esta funcionalidade ou importar scripts locais.'));
            } else {
              reject(new Error('Network error fetching script'));
            }
          };
          
          xhr.send();
        });
      } else {
        // For non-CORS errors or non-Firefox browsers, rethrow
        throw fetchError;
      }
    }
  } catch (error) {
    console.error('Error fetching script:', error);
    return null;
  }
}

async function getScript(hash, forceRefresh = false) {
  // If force refresh is true, bypass cache and get from network
  if (forceRefresh) {
    console.log(`Force refreshing script: ${hash}`);
    return await fetchScript(hash);
  }
  
  // Otherwise try memory cache first
  if (scriptCache[hash]) {
    return scriptCache[hash];
  }
  
  // Then try stored cache
  const storedScripts = await chrome.storage.local.get(`script_${hash}`);
  if (storedScripts[`script_${hash}`]) {
    scriptCache[hash] = storedScripts[`script_${hash}`];
    return scriptCache[hash];
  }
  
  // Finally fetch from network
  return await fetchScript(hash);
}

async function getActiveScripts() {
  const data = await chrome.storage.sync.get('activeScripts');
  return data.activeScripts || [];
}

async function setActiveScripts(activeScripts) {
  await chrome.storage.sync.set({ activeScripts });
}

async function getLocalMods() {
  try {
    console.log('Tentando obter mods locais...');
    // First try to get from sync storage
    const syncData = await chrome.storage.sync.get('localMods');
    
    if (syncData.localMods && Array.isArray(syncData.localMods) && syncData.localMods.length > 0) {
      console.log('Mods locais encontrados no storage sync:', syncData.localMods.length);
      // If found in sync, also update local storage
      await chrome.storage.local.set({ localMods: syncData.localMods });
      return syncData.localMods;
    }
    
    // Fall back to local storage
    console.log('Tentando obter mods locais do storage local...');
    const localData = await chrome.storage.local.get('localMods');
    if (localData.localMods && Array.isArray(localData.localMods)) {
      console.log('Mods locais encontrados no storage local:', localData.localMods.length);
      return localData.localMods;
    }
    
    console.log('Nenhum mod local encontrado em ambos storages, retornando array vazio');
    return [];
  } catch (error) {
    console.error('Erro ao obter mods locais:', error);
    return [];
  }
}

// Hardcoded gist URL for utility functions
const UTILITY_GIST_URL = 'https://gist.githubusercontent.com/mathiasbynens/b9c59bc14fb0d2b52e6945aeee99453f/raw';

// Normalize utility script content to ensure proper execution
function normalizeUtilityScript(scriptContent) {
  if (!scriptContent) return '';
  
  // Remove any existing IIFE wrapping to avoid conflicts
  let script = scriptContent.trim();
  if (script.startsWith('(function(') && script.endsWith('})();')) {
    script = script.slice(script.indexOf('{') + 1, script.lastIndexOf('}'));
  }
  
  // Wrap in try-catch for better error reporting
  return `
    try {
      // Utility functions script from ${UTILITY_GIST_URL}
      ${script}
      
      // Verify required functions are available
      console.log('Utility script loaded, checking functions:', {
        serializeBoard: typeof $serializeBoard === 'function',
        replay: typeof $replay === 'function',
        forceSeed: typeof $forceSeed === 'function'
      });
    } catch (utilityError) {
      console.error('Error in utility script:', utilityError);
    }
  `;
}

// Function to fetch and cache utility script
async function fetchUtilityScript() {
  try {
    console.log('Fetching utility script from:', UTILITY_GIST_URL);
    const cacheParam = `?cache=${Date.now()}`;
    const url = UTILITY_GIST_URL + cacheParam;
    
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch utility gist: ${response.status}`);
    }
    const scriptContent = await response.text();
    
    // Normalize script content
    const normalizedScript = normalizeUtilityScript(scriptContent);
    
    // Store in chrome.storage.local for caching instead of localStorage
    await chrome.storage.local.set({
      'utility_script_cache': normalizedScript,
      'utility_script_timestamp': Date.now()
    });
    
    return normalizedScript;
  } catch (error) {
    console.error('Error fetching utility script:', error);
    
    // Try to use cached version if available from storage.local
    const data = await chrome.storage.local.get(['utility_script_cache']);
    if (data.utility_script_cache) {
      return data.utility_script_cache;
    }
    
    throw error;
  }
}

// Function to get the utility script (with caching)
async function getUtilityScript(forceRefresh = false) {
  try {
    // Always fetch new if forceRefresh is true
    if (forceRefresh) {
      console.log('Force refreshing utility script');
      return await fetchUtilityScript();
    }
    
    // Get cached data from chrome.storage.local instead of localStorage
    const data = await chrome.storage.local.get(['utility_script_cache', 'utility_script_timestamp']);
    const cachedScript = data.utility_script_cache;
    const timestamp = data.utility_script_timestamp;
    const cacheAge = timestamp ? (Date.now() - timestamp) : Infinity;
    
    // Use cache if it's less than 1 day old
    if (cachedScript && cacheAge < 86400000) {
      console.log('Using cached utility script');
      return cachedScript;
    }
    
    console.log('Cache expired or not found, fetching fresh utility script');
    return await fetchUtilityScript();
  } catch (error) {
    console.error('Error getting utility script:', error);
    return await fetchUtilityScript();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getScript') {
    getScript(message.hash)
      .then(scriptContent => {
        sendResponse({ success: true, scriptContent });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'refreshScript') {
    getScript(message.hash, true)
      .then(scriptContent => {
        sendResponse({ success: true, scriptContent });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'refreshAllScripts') {
    refreshAllScripts()
      .then(enabledScripts => {
        sendResponse({ success: true, scripts: enabledScripts });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'getActiveScripts') {
    getActiveScripts()
      .then(scripts => {
        sendResponse({ success: true, scripts });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'registerScript') {
    // Always force refresh when registering a script to get latest version
    getScript(message.hash, true)
      .then(scriptContent => {
        if (!scriptContent) {
          sendResponse({ 
            success: false, 
            error: 'Failed to fetch script content. Check the Gist hash and your internet connection.' 
          });
          return;
        }
        
        return getActiveScripts()
          .then(scripts => {
            const existingIndex = scripts.findIndex(s => s.hash === message.hash);
            if (existingIndex !== -1) {
              scripts[existingIndex] = { ...scripts[existingIndex], ...message.config };
            } else {
              scripts.push({
                hash: message.hash,
                name: message.name || `Script ${message.hash.substring(0, 8)}`,
                enabled: true,
                config: message.config || {}
              });
            }
            return setActiveScripts(scripts);
          })
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'toggleScript') {
    getActiveScripts()
      .then(scripts => {
        const script = scripts.find(s => s.hash === message.hash);
        if (script) {
          script.enabled = message.enabled;
          return setActiveScripts(scripts);
        }
        throw new Error('Script not found');
      })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'updateScriptConfig') {
    getActiveScripts()
      .then(scripts => {
        if (message.hash && message.hash.startsWith('local_')) {
          const localModName = message.hash.replace('local_', '');
          chrome.storage.local.get('localModsConfig', (data) => {
            const configs = data.localModsConfig || {};
            configs[localModName] = message.config;
            chrome.storage.local.set({ localModsConfig: configs });
            
            sendResponse({ success: true });
          });
          return true;
        }
        
        const script = scripts.find(s => s.hash === message.hash);
        if (script) {
          script.config = { ...script.config, ...message.config };
          return setActiveScripts(scripts);
        }
        throw new Error('Script not found');
      })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'removeScript') {
    getActiveScripts()
      .then(scripts => {
        const newScripts = scripts.filter(s => s.hash !== message.hash);
        return setActiveScripts(newScripts);
      })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'registerLocalMods') {
    console.log('Background: Registrando mods locais:', message.mods);
    
    // Garantir que os mods fornecidos são válidos
    const newMods = message.mods && Array.isArray(message.mods) ? message.mods : [];
    
    if (newMods.length === 0) {
      console.warn('Background: Lista de mods vazia ou inválida');
      sendResponse({ success: true, mods: [] });
      return true;
    }
    
    // Get existing mods to preserve enabled states
    getLocalMods().then(existingMods => {
      const existingModArray = Array.isArray(existingMods) ? existingMods : [];
      
      // Create a map of existing mod states
      const existingModStates = {};
      existingModArray.forEach(mod => {
        if (mod && mod.name) {
          existingModStates[mod.name] = mod.enabled;
        }
      });
      
      // Process incoming mods, preserving enabled states from existing mods
      localMods = newMods.map(mod => {
        if (!mod || !mod.name) {
          console.warn('Background: Mod inválido na lista:', mod);
          return null;
        }
        
        return {
          name: mod.name,
          displayName: mod.displayName || mod.name,
          isLocal: true,
          // If mod existed before, use its previous enabled state, otherwise default to enabled
          enabled: existingModStates.hasOwnProperty(mod.name) ? existingModStates[mod.name] : (mod.enabled !== undefined ? mod.enabled : true)
        };
      }).filter(mod => mod !== null); // Filtrar mods inválidos
      
      console.log('Background: Mods locais processados com estados preservados:', localMods);
      
      // Função para salvar os mods e responder
      const saveModsAndRespond = () => {
        chrome.storage.local.set({ localMods }, () => {
          if (chrome.runtime.lastError) {
            console.error('Background: Erro ao salvar mods no storage local:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message, mods: localMods });
          } else {
            console.log('Background: Mods salvos com sucesso no storage local');
            sendResponse({ success: true, mods: localMods });
          }
        });
      };
      
      // Tentar salvar no sync primeiro, com fallback para local
      chrome.storage.sync.set({ localMods }, () => {
        if (chrome.runtime.lastError) {
          console.warn('Background: Erro ao salvar no sync, usando apenas storage local:', chrome.runtime.lastError);
          saveModsAndRespond();
        } else {
          console.log('Background: Mods salvos com sucesso no storage sync');
          saveModsAndRespond();
        }
      });
    }).catch(error => {
      console.error('Background: Erro ao obter mods existentes:', error);
      sendResponse({ success: false, error: error.message, mods: [] });
    });
    
    return true;
  }

  if (message.action === 'executeLocalMod') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'executeLocalMod',
          name: message.name
        });
      }
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'executeScript') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        try {
          // Obter o conteúdo do script
          const scriptContent = await getScript(message.hash);
          if (!scriptContent) {
            sendResponse({ success: false, error: 'Script content not found' });
            return;
          }
          
          // Obter a configuração do script
          const scripts = await getActiveScripts();
          const script = scripts.find(s => s.hash === message.hash);
          
          if (!script) {
            sendResponse({ success: false, error: 'Script not found in active scripts' });
            return;
          }
          
          // Enviar mensagem para o content script executar o script
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'executeScript',
            hash: message.hash,
            scriptContent: scriptContent,
            config: script.config || {}
          });
          
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error executing script:', error);
          sendResponse({ success: false, error: error.message });
        }
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true;
  }

  if (message.action === 'getLocale') {
    getTranslations()
      .then(({ currentLocale, translations }) => {
        sendResponse({ 
          success: true, 
          locale: currentLocale,
          translations: translations
        });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'setLocale') {
    setLocale(message.locale)
      .then(success => {
        if (success) {
          return getTranslations();
        }
        throw new Error('Failed to set locale');
      })
      .then(({ currentLocale, translations }) => {
        sendResponse({ 
          success: true, 
          locale: currentLocale,
          translations: translations
        });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'getLocalModConfig') {
    chrome.storage.local.get('localModsConfig', (data) => {
      const configs = data.localModsConfig || {};
      const config = configs[message.modName] || {};
      sendResponse({ success: true, config });
    });
    return true;
  }

  if (message.action === 'toggleLocalMod') {
    chrome.storage.local.get('localMods', (data) => {
      const localMods = data.localMods || [];
      const modIndex = localMods.findIndex(mod => mod.name === message.name);
      
      if (modIndex !== -1) {
        localMods[modIndex].enabled = message.enabled;
        chrome.storage.sync.set({ localMods }, () => {
          chrome.storage.local.set({ localMods }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  action: 'registerLocalMods',
                  mods: localMods
                });
              }
            });
            sendResponse({ success: true });
          });
        });
      } else {
        sendResponse({ success: false, error: 'Local mod not found' });
      }
    });
    return true;
  }

  if (message.action === 'getLocalMods') {
    console.log('Background: Recebendo solicitação getLocalMods');
    getLocalMods()
      .then(mods => {
        localMods = mods || []; // Garantir que localMods nunca seja null/undefined
        console.log('Background: Retornando mods locais:', localMods.length, 'mods');
        sendResponse({ success: true, mods: localMods });
      })
      .catch(error => {
        console.error('Background: Erro ao buscar mods locais:', error);
        // Garantir uma resposta válida mesmo em caso de erro
        sendResponse({ success: false, error: error.message, mods: [] });
      });
    return true; // Indica resposta assíncrona
  }
  
  if (message.action === 'contentScriptReady') {
    console.log('Content script reported ready in tab:', sender.tab.id);
    
    // Send active scripts
    getActiveScripts().then(scripts => {
      const enabledScripts = scripts.filter(s => s.enabled);
      
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'loadScripts',
        scripts: enabledScripts
      });
      
      // Then send and execute local mods with a delay
      setTimeout(() => {
        getLocalMods().then(localMods => {
          console.log(`Sending ${localMods.length} local mods to ready tab:`, 
            localMods.map(m => `${m.name}: ${m.enabled}`));
          
          // Send registration message first
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'registerLocalMods',
            mods: localMods
          });
          
          // Execute enabled mods after a short delay
          setTimeout(() => {
            localMods.filter(mod => mod.enabled).forEach(mod => {
              console.log(`Auto-executing local mod in ready tab: ${mod.name}`);
              chrome.tabs.sendMessage(sender.tab.id, {
                action: 'executeLocalMod',
                name: mod.name
              });
            });
          }, 700);
        });
      }, 500);
    });
    
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getUtilityScript') {
    getUtilityScript(message.forceRefresh)
      .then(script => sendResponse({ success: true, script }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indicate async response
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.match(/bestiaryarena\.com/)) {
    console.log(`Tab ${tabId} updated with URL ${tab.url}`);
    
    // First refresh all scripts to get latest versions
    refreshAllScripts().then(enabledScripts => {
      console.log(`Refreshed ${enabledScripts.length} active scripts`);
      
      // Delay slightly to ensure the page has fully loaded
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'checkAPI' }, response => {
          if (chrome.runtime.lastError) {
            console.log('Content script not functioning, injecting manually:', chrome.runtime.lastError);
            
            chrome.scripting.executeScript({
              target: { tabId },
              files: ['content/injector.js']
            }).then(() => {
              console.log('Injector script injected');
              
              setTimeout(() => {
                // Use already refreshed scripts
                console.log(`Sending ${enabledScripts.length} active scripts to tab ${tabId}`);
                
                chrome.tabs.sendMessage(tabId, {
                  action: 'loadScripts',
                  scripts: enabledScripts
                });

                getLocalMods().then(localMods => {
                  console.log(`Found ${localMods.length} local mods`, localMods);
                  
                  chrome.tabs.sendMessage(tabId, {
                    action: 'registerLocalMods',
                    mods: localMods
                  });
                  
                  // Only execute enabled mods
                  localMods.filter(mod => mod.enabled).forEach(mod => {
                    console.log(`Auto-executing local mod: ${mod.name}`);
                    chrome.tabs.sendMessage(tabId, {
                      action: 'executeLocalMod',
                      name: mod.name
                    });
                  });
                });
              }, 1000);
            }).catch(error => {
              console.error("Error injecting injector script:", error);
            });
          } else {
            console.log('Content script already functioning, loading scripts');
            
            // Use already refreshed scripts
            chrome.tabs.sendMessage(tabId, {
              action: 'loadScripts',
              scripts: enabledScripts
            });

            getLocalMods().then(localMods => {
              console.log(`Found ${localMods.length} local mods with states:`, 
                localMods.map(m => `${m.name}: ${m.enabled}`));
              
              // Send registration message first
              chrome.tabs.sendMessage(tabId, {
                action: 'registerLocalMods',
                mods: localMods
              });
              
              // Ensure a delay before executing mods
              setTimeout(() => {
                // Only execute enabled mods
                localMods.filter(mod => mod.enabled).forEach(mod => {
                  console.log(`Auto-executing local mod: ${mod.name}`);
                  chrome.tabs.sendMessage(tabId, {
                    action: 'executeLocalMod',
                    name: mod.name
                  });
                });
              }, 500);
            });
          }
        });
      }, 500);
    });
  }
});

async function getTranslations() {
  const localeData = await chrome.storage.local.get('locale');
  const currentLocale = localeData.locale || 'en-US';
  
  const translations = {};
  
  try {
    const enResponse = await fetch(chrome.runtime.getURL('assets/locales/en-US.json'));
    if (enResponse.ok) {
      translations['en-US'] = await enResponse.json();
    }
    
    const ptResponse = await fetch(chrome.runtime.getURL('assets/locales/pt-BR.json'));
    if (ptResponse.ok) {
      translations['pt-BR'] = await ptResponse.json();
    }
  } catch (error) {
    console.error('Error loading translations:', error);
  }
  
  return { currentLocale, translations };
}

async function setLocale(locale) {
  try {
    await chrome.storage.local.set({ locale });
    return true;
  } catch (error) {
    console.error('Error setting locale:', error);
    return false;
  }
}

// Force refresh all active scripts from their source
async function refreshAllScripts() {
  console.log('Refreshing all active scripts');
  const scripts = await getActiveScripts();
  
  for (const script of scripts) {
    console.log(`Refreshing script: ${script.hash}`);
    await getScript(script.hash, true);
  }
  
  return scripts.filter(s => s.enabled);
} 