// First import our polyfill for consistent API across browsers
const polyfillScript = document.createElement('script');
polyfillScript.setAttribute('type', 'text/javascript');
polyfillScript.setAttribute('src', chrome.runtime.getURL('assets/js/browser-polyfill.js'));
(document.head || document.documentElement).appendChild(polyfillScript);

function injectScript(file) {
  console.log(`Injecting script: ${file}`);
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', chrome.runtime.getURL(file));
  script.onload = function() {
    console.log(`Script loaded successfully: ${file}`);
    this.remove();
  };
  script.onerror = function(error) {
    console.error(`Error loading script ${file}:`, error);
  };
  (document.head || document.documentElement).appendChild(script);
  return script; // Return the script element
}

// Directly inject important extension URLs into the page
function injectExtensionURLs() {
  console.log('Injecting extension URLs into page');
  
  // Instead of using inline scripts (which violate CSP), use postMessage
  const extensionBaseUrl = chrome.runtime.getURL('');
  const modsBaseUrl = chrome.runtime.getURL('mods/');
  
  // Send URLs via postMessage which doesn't violate CSP
  window.postMessage({
    from: 'BESTIARY_EXTENSION',
    modBaseUrl: modsBaseUrl,
    extensionBaseUrl: extensionBaseUrl,
    action: 'setExtensionURLs'
  }, '*');
  
  console.log('Extension URLs sent via postMessage');
}

let clientInjected = false;
let localModsInjected = false;

console.log('Starting script injection sequence...');

// First inject extension URLs directly
injectExtensionURLs();

// Then inject client.js which contains the API
const clientScript = injectScript('content/client.js');
clientScript.onload = function() {
  clientInjected = true;
  console.log('Client script loaded, waiting briefly for API initialization...');
  
  // Inject again to ensure URLs are available
  injectExtensionURLs();
  
  // Wait a short time to ensure API is ready
  setTimeout(() => {
    // Then inject local_mods.js to set up local mods
    const localModsScript = injectScript('content/local_mods.js');
    localModsScript.onload = function() {
      localModsInjected = true;
      console.log('Local mods script loaded');
      
      // Inject URLs once more after both scripts are loaded
      injectExtensionURLs();
      
      // Let the background script know we're ready for mods
      chrome.runtime.sendMessage({ action: 'contentScriptReady' }, function(response) {
        console.log('Background script notified that content script is ready');
      });
    };
  }, 500);
};

console.log('Bestiary Arena Mod Loader - Injection sequence initiated');

window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  if (!event.data || !event.data.from || event.data.from !== 'BESTIARY_CLIENT') return;
  
  console.log('Injector received message from client:', event.data);
  const message = event.data.message;
  
  if (message.action) {
    chrome.runtime.sendMessage(message, function(response) {
      console.log('Received response from background script:', response);
      window.postMessage({
        from: 'BESTIARY_EXTENSION',
        id: event.data.id,
        response
      }, '*');
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Injector received message from extension:', message);
  
  if (message.action === 'checkAPI') {
    console.log('Checking if BestiaryModAPI is available...');
    
    // Use postMessage instead of inline script to work around CSP
    window.postMessage({
      from: 'BESTIARY_EXTENSION_API_CHECK',
      action: 'checkAPI'
    }, '*');
    
    const listener = function(event) {
      if (event.source !== window) return;
      if (!event.data || event.data.from !== 'BESTIARY_API_CHECK') return;
      
      console.log('API check result:', event.data.result);
      window.removeEventListener('message', listener);
      sendResponse(event.data.result);
    };
    
    window.addEventListener('message', listener);
    
    return true;
  }

  if (message.action === 'loadScripts') {
    console.log('Loading scripts:', message.scripts);
    window.postMessage({
      from: 'BESTIARY_EXTENSION',
      message: {
        action: 'loadScripts',
        scripts: message.scripts
      }
    }, '*');
    
    message.scripts.forEach(script => {
      chrome.runtime.sendMessage({
        action: 'getScript',
        hash: script.hash
      }, function(response) {
        if (response && response.success && response.scriptContent) {
          console.log(`Executing script: ${script.hash}`);
          window.postMessage({
            from: 'BESTIARY_EXTENSION',
            message: {
              action: 'executeScript',
              hash: script.hash,
              scriptContent: response.scriptContent,
              config: script.config
            }
          }, '*');
        } else {
          console.error(`Failed to get script content for ${script.hash}:`, response);
        }
      });
    });
    
    return true;
  }

  if (message.action === 'executeLocalMod') {
    console.log(`Executing local mod: ${message.name}`);
    window.postMessage({
      from: 'BESTIARY_EXTENSION',
      message: {
        action: 'executeLocalMod',
        name: message.name
      }
    }, '*');
    
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'executeScript') {
    console.log(`Executing script: ${message.hash}`);
    window.postMessage({
      from: 'BESTIARY_EXTENSION',
      message: {
        action: 'executeScript',
        hash: message.hash,
        scriptContent: message.scriptContent,
        config: message.config || {}
      }
    }, '*');
    
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'reloadLocalMods') {
    console.log('Reloading local mods');
    
    // Resend mod base URL first
    const modsBaseUrl = chrome.runtime.getURL('mods/');
    window.postMessage({
      from: 'BESTIARY_EXTENSION',
      modBaseUrl: modsBaseUrl
    }, '*');
    
    // Then send reload message
    window.postMessage({
      from: 'BESTIARY_EXTENSION',
      message: {
        action: 'reloadLocalMods'
      }
    }, '*');
    
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'registerLocalMods') {
    console.log('Registering local mods:', message.mods);
    window.postMessage({
      from: 'BESTIARY_EXTENSION',
      message: {
        action: 'registerLocalMods',
        mods: message.mods
      }
    }, '*');
    
    sendResponse({ success: true });
    return true;
  }
});

window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  if (!event.data || event.data.from !== 'BESTIARY_EXTENSION') return;
  
  const message = event.data.message;
  
  if (message && message.action === 'executeLocalMod') {
    if (window.localModsAPI && typeof window.localModsAPI.executeLocalMod === 'function') {
      console.log(`Forwarding executeLocalMod to localModsAPI: ${message.name}`);
      window.localModsAPI.executeLocalMod(message.name);
    }
  }
  
  if (message && message.action === 'reloadLocalMods') {
    console.log('Forwarding reloadLocalMods event');
    if (window.localModsAPI) {
      document.dispatchEvent(new CustomEvent('reloadLocalMods'));
    } else {
      console.error('localModsAPI not available for reloading mods');
    }
  }
  
  if (message && message.action === 'registerLocalMods') {
    console.log('Received registerLocalMods in injector');
  }
});

// Check for replay data immediately
checkForReplayData();

// Also listen for page changes to handle SPA navigation
window.addEventListener('hashchange', checkForReplayData);

// Listen for executeFunction messages from our own script
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  if (!event.data || event.data.from !== 'BESTIARY_INJECTOR') return;
  
  if (event.data.action === 'executeFunction') {
    try {
      const fnName = event.data.function;
      const args = event.data.args || [];
      
      console.log(`Executing function: ${fnName} with args:`, args);
      
      if (typeof window[fnName] === 'function') {
        window[fnName].apply(window, args);
      } else {
        console.error(`Function ${fnName} not found in window scope`);
      }
    } catch (error) {
      console.error('Error executing function:', error);
    }
  }
});

// INJECTOR SCRIPT
// This script is responsible for handling URL shared team parameters and storing them in localStorage
// The actual application of the team configuration is done by the TeamCopier mod

// Decompress compact format (V2)
function decompressCompactFormat(compressedData) {
  try {
    // Restore base64 padding if needed
    let base64 = compressedData;
    // Add padding if necessary
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Decode base64
    const jsonStr = atob(base64);
    
    // Parse JSON
    const compactData = JSON.parse(jsonStr);
    
    // Extract data from compact format
    const [region, map, seed, compactBoard] = compactData;
    
    // Rebuild the board data
    const board = compactBoard.map(piece => {
      const [
        tile,
        monsterName,
        hp,
        ad,
        ap,
        armor,
        magicResist,
        equipName,
        equipStat,
        equipTier
      ] = piece;
      
      return {
        tile,
        monster: {
          name: monsterName,
          hp,
          ad,
          ap,
          armor,
          magicResist
        },
        equipment: {
          name: equipName,
          stat: equipStat,
          tier: equipTier
        }
      };
    });
    
    // Construct full board data
    const boardData = {
      region,
      map,
      board
    };
    
    // Only include seed if it's not 0
    if (seed !== 0) {
      boardData.seed = seed;
    }
    
    return boardData;
  } catch (error) {
    console.error('Error decompressing compact format data:', error);
    throw new Error('Unable to decompress compact format data');
  }
}

// Helper function to decompress data from URL
function decompressData(compressedData) {
  try {
    // Check for compact format first (v2 format)
    if (compressedData.startsWith('v2-')) {
      return decompressCompactFormat(compressedData.substring(3));
    }
    
    // Then try decompressing as base64
    return JSON.parse(decodeURIComponent(atob(compressedData)));
  } catch (error) {
    console.log('Failed to decompress using base64, trying direct JSON parse:', error);
    
    // Fallback to directly decoding JSON (for older URLs)
    try {
      return JSON.parse(decodeURIComponent(compressedData));
    } catch (fallbackError) {
      console.error('Failed to decompress data using fallback method:', fallbackError);
      throw new Error('Unable to decompress replay data');
    }
  }
}

// Show error notification
function showErrorNotification(message) {
  try {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(200, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-family: sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.2);
      max-width: 80%;
      text-align: center;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    }, 5000);
  } catch (error) {
    console.error('Error showing error notification:', error);
  }
}

// Check for replay data in URL
function checkForReplayData() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#replay=')) {
    console.log('Found replay parameter in URL');
    try {
      // Extract the data
      const encodedData = hash.substring('#replay='.length);
      // Try to decompress the data
      const boardData = decompressData(encodedData);
      
      console.log('Successfully decompressed replay data from URL');
      
      // Store the data in localStorage for the mod to use
      localStorage.setItem('BESTIARY_REPLAY_DATA', JSON.stringify(boardData));
      
      // Set flag indicating this page was loaded with a share code
      localStorage.setItem('BESTIARY_LOADED_WITH_SHARE', 'true');
      
      // Navigate to clean URL to prevent replay data persisting in browser history
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, null, window.location.pathname);
      }
    } catch (error) {
      console.error('Error processing replay data from URL:', error);
      // Show error notification once DOM is available
      setTimeout(() => {
        showErrorNotification('Error loading shared configuration. Invalid or corrupted data.');
      }, 1000);
      localStorage.removeItem('BESTIARY_LOADED_WITH_SHARE');
    }
  }
}

// Check for replay data immediately
checkForReplayData();

// Also listen for page changes to handle SPA navigation
window.addEventListener('hashchange', checkForReplayData); 