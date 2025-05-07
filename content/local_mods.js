// Polyfill for Chrome and Firefox WebExtensions
if (typeof window.browser === 'undefined') {
  window.browser = window.chrome;
}

console.log('Local Mods Loader initializing...');

let localMods = [];
let executedMods = {};

// Obtém a URL base para mods a partir de uma mensagem do injector
let modBaseUrl = '';

// Ensure API is created immediately
window.localModsAPI = {
  getLocalMods: () => localMods,
  executeLocalMod: null // Will be defined later
};

function getModUrl(modName) {
  return modBaseUrl + modName;
}

async function getLocalModContent(modName) {
  try {
    console.log(`Fetching content for local mod: ${modName}`);
    const modUrl = getModUrl(modName);
    console.log(`Mod URL: ${modUrl}`);
    const response = await fetch(modUrl);
    
    if (!response.ok) {
      console.error(`HTTP error fetching mod ${modName}! Status: ${response.status}`);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const content = await response.text();
    console.log(`Mod content loaded, length: ${content.length} bytes`);
    return content;
  } catch (error) {
    console.error(`Error fetching local mod ${modName}:`, error);
    return null;
  }
}

async function checkFileExists(modName) {
  try {
    console.log(`Checking if file exists: ${modName}`);
    const modUrl = getModUrl(modName);
    console.log(`Checking URL: ${modUrl}`);
    const response = await fetch(modUrl, { method: 'HEAD' });
    const exists = response.ok;
    console.log(`File ${modName} exists: ${exists}, status: ${response.status}`);
    if (!exists) {
      console.error(`Failed to find mod at ${modUrl}, status: ${response.status}`);
    }
    return exists;
  } catch (error) {
    console.error(`Error checking if file exists: ${modName}`, error);
    return false;
  }
}

async function initLocalMods() {
  console.log('Initializing local mods...');
  
  // Não podemos inicializar se não tivermos a URL base
  if (!modBaseUrl) {
    console.warn('Mod base URL not set, waiting for extension communication');
    return;
  }
  
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
  
  let validMods = [];
  
  for (const mod of availableMods) {
    const exists = await checkFileExists(mod.name);
    if (exists) {
      console.log(`Found local mod: ${mod.name}`);
      validMods.push(mod);
    } else {
      console.warn(`Local mod not found: ${mod.name}`);
    }
  }
  
  if (validMods.length === 0) {
    console.warn('No valid local mods found!');
  } else {
    console.log(`Found ${validMods.length} valid local mods`);
  }
  
  localMods = validMods.map(mod => ({
    name: mod.name,
    displayName: mod.key,
    isLocal: true,
    enabled: mod.enabled // Use the default value from availableMods
  }));
  
  console.log('Local mods initialized:', localMods);
  
  // Em vez de mandar mensagem direta para a extensão, mandamos para o injector
  window.postMessage({
    from: 'BESTIARY_CLIENT',
    message: {
      action: 'registerLocalMods',
      mods: localMods
    }
  }, '*');
}

async function executeLocalMod(modName, forceExecution = false) {
  // If already executed, log and exit (but allow a forced re-execution if needed)
  if (executedMods[modName] && !forceExecution) {
    console.log(`Local mod ${modName} was already executed, skipping`);
    return;
  }

  // Check if the mod is enabled before execution
  const mod = localMods.find(m => m.name === modName);
  if (!mod) {
    console.error(`Cannot execute mod ${modName}: mod not found in local mods list`);
    return;
  }
  
  if (!mod.enabled && !forceExecution) {
    console.log(`Skipping disabled mod: ${modName}`);
    return;
  }

  console.log(`Executing local mod: ${modName}`);
  
  // Ensure the mod base URL is set
  if (!modBaseUrl) {
    console.error(`Cannot execute mod ${modName}: mod base URL not set yet`);
    return;
  }
  
  const content = await getLocalModContent(modName);
  
  if (!content) {
    console.error(`Failed to load local mod: ${modName}`);
    return;
  }
  
  try {
    // Check API availability with better retry mechanism
    if (!window.BestiaryModAPI) {
      console.warn(`BestiaryModAPI not available yet, will retry executing mod: ${modName}`);
      
      // Setup a more robust retry mechanism
      let retryCount = 0;
      const maxRetries = 20; // Increase max retries
      const checkAndExecute = () => {
        retryCount++;
        if (window.BestiaryModAPI) {
          console.log(`BestiaryModAPI now available on retry ${retryCount}, executing mod: ${modName}`);
          executeLocalMod(modName);
        } else if (retryCount < maxRetries) {
          console.log(`BestiaryModAPI still not available, retry ${retryCount}/${maxRetries}`);
          setTimeout(checkAndExecute, 300); // Slightly faster retries
        } else {
          console.error(`BestiaryModAPI not available after ${maxRetries} retries, giving up on mod: ${modName}`);
        }
      };
      
      setTimeout(checkAndExecute, 300);
      return;
    }

    // Get saved config for the mod via page communication
    let modConfig = {};
    try {
      const configId = generateMessageId();
      
      // Request mod config via message to the injector
      window.postMessage({
        from: 'BESTIARY_CLIENT',
        id: configId,
        message: {
          action: 'getLocalModConfig',
          modName: modName
        }
      }, '*');

      // Execute with a slight delay to allow config to be received
      setTimeout(async () => {
        console.log(`Creating context for local mod: ${modName}`);
        const scriptContext = {
          hash: `local_${modName}`,
          config: modConfig,
          api: window.BestiaryModAPI
        };
        
        console.log(`Preparing to execute mod: ${modName}`);
        const scriptFunction = new Function('context', `
          with (context) {
            ${content}
          }
          // Return any exports
          return context.exports;
        `);
        
        console.log(`Executing mod function for: ${modName}`);
        const scriptResult = scriptFunction(scriptContext);
        executedMods[modName] = {
          name: modName,
          exports: scriptResult,
          context: scriptContext
        };
        
        console.log(`Local mod ${modName} executed successfully`, scriptResult);
      }, 50);
    } catch (error) {
      console.warn(`Could not load config for mod ${modName}:`, error);
      
      console.log(`Creating context for local mod: ${modName}`);
      const scriptContext = {
        hash: `local_${modName}`,
        config: {},
        api: window.BestiaryModAPI
      };
      
      console.log(`Preparing to execute mod: ${modName}`);
      const scriptFunction = new Function('context', `
        with (context) {
          ${content}
        }
        // Return any exports
        return context.exports;
      `);
      
      console.log(`Executing mod function for: ${modName}`);
      const scriptResult = scriptFunction(scriptContext);
      executedMods[modName] = {
        name: modName,
        exports: scriptResult,
        context: scriptContext
      };
      
      console.log(`Local mod ${modName} executed successfully`, scriptResult);
    }
  } catch (error) {
    console.error(`Error executing local mod ${modName}:`, error);
    throw error;
  }
}

// Gerar ID único para mensagens
let messageIdCounter = 0;
function generateMessageId() {
  return `mod_msg_${Date.now()}_${messageIdCounter++}`;
}

document.addEventListener('reloadLocalMods', () => {
  console.log('Received reloadLocalMods event, reinitializing...');
  localMods = [];
  executedMods = {};
  initLocalMods();
});

// Expose API functions immediately so they're available
window.localModsAPI.executeLocalMod = executeLocalMod;

window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  if (event.data && event.data.from === 'BESTIARY_EXTENSION') {
    if (event.data.modBaseUrl) {
      modBaseUrl = event.data.modBaseUrl;
      console.log('Received mod base URL:', modBaseUrl);
      
      // Log some diagnostic info
      console.log('ModBaseUrl format check:', {
        endsWithSlash: modBaseUrl.endsWith('/'),
        startsWithHttp: modBaseUrl.startsWith('http'),
        protocol: modBaseUrl.split(':')[0]
      });
      
      // Try an immediate test fetch
      fetch(modBaseUrl + 'TestMod.js', { method: 'HEAD' })
        .then(response => {
          console.log(`Test fetch for TestMod.js: status=${response.status}, ok=${response.ok}`);
        })
        .catch(error => {
          console.error('Test fetch failed:', error);
        });
      
      // Now that we have the base URL, we can initialize
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLocalMods);
      } else {
        initLocalMods();
      }
    }
    
    if (event.data.message && event.data.message.action === 'registerLocalMods') {
      console.log('Received registerLocalMods message:', event.data.message);
      if (event.data.message.mods && Array.isArray(event.data.message.mods)) {
        // Store the previous mods for reference
        const previousMods = [...localMods];
        
        // Update with new mods
        localMods = event.data.message.mods;
        console.log('Local mods updated from extension:', 
          localMods.map(m => `${m.name}: ${m.enabled}`));
        
        // Auto-execute enabled mods after registration, but only if not executed before
        console.log('Auto-executing enabled mods after registration');
        localMods.forEach(mod => {
          // Only execute if enabled and either not executed before or newly enabled
          const wasEnabledBefore = previousMods.find(m => m.name === mod.name && m.enabled);
          const wasExecutedBefore = !!executedMods[mod.name];
          
          if (mod.enabled && (!wasExecutedBefore || !wasEnabledBefore)) {
            console.log(`Auto-executing local mod: ${mod.name} (executed before: ${wasExecutedBefore})`);
            executeLocalMod(mod.name).catch(error => {
              console.error(`Error auto-executing mod ${mod.name}:`, error);
            });
          }
        });
      }
    }
    
    if (event.data.message && event.data.message.action === 'executeLocalMod') {
      const modName = event.data.message.name;
      const force = !!event.data.message.force;
      console.log(`Received request to execute local mod: ${modName} (force: ${force})`);
      executeLocalMod(modName, force).catch(err => {
        console.error(`Error executing local mod ${modName} on request:`, err);
      });
    }
    
    if (event.data.response && event.data.id && event.data.id.startsWith('mod_msg_')) {
      console.log('Received response for mod message:', event.data);
      // Here we could process the response from getLocalModConfig
    }
  }
});

// Notify of API availability
console.log('LocalModsAPI has been attached to window:', !!window.localModsAPI);

// Inicialização - agora esperamos pela modBaseUrl antes de inicializar
console.log('Local Mods Loader setup, waiting for mod base URL...');

console.log('Local Mods Loader setup complete');

