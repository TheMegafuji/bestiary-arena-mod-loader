// Import our robust polyfill
(async function loadPolyfill() {
  try {
    // First try to see if we can directly reference chrome or browser objects
    if (typeof window.chrome === 'undefined' && typeof window.browser !== 'undefined') {
      window.chrome = window.browser;
    } else if (typeof window.browser === 'undefined' && typeof window.chrome !== 'undefined') {
      window.browser = window.chrome;
    }
    
    // Dynamically load polyfill script
    try {
      const polyfillUrl = (window.chrome?.runtime?.getURL || window.browser?.runtime?.getURL || function(path) { return path; })('assets/js/browser-polyfill.js');
      
      // Try to fetch and evaluate the polyfill
      const response = await fetch(polyfillUrl);
      if (response.ok) {
        const polyfillScript = await response.text();
        // Execute script in the current scope
        new Function(polyfillScript)();
      }
    } catch (polyfillError) {
      console.warn('Could not load polyfill script, falling back to basic compatibility mode', polyfillError);
      
      // Basic compatibility fallback
      window.chrome = window.chrome || (window.browser || {});
      window.browser = window.browser || (window.chrome || {});
    }
  } catch (error) {
    console.error('Error setting up browser compatibility:', error);
  }
})();

(function() {
  if (window.BestiaryModAPI) return;
  
  const loadedScripts = {};
  
  let messageIdCounter = 0;
  function generateMessageId() {
    return `msg_${Date.now()}_${messageIdCounter++}`;
  }
  
  const pendingCallbacks = {};
  
  function sendMessageToExtension(message) {
    return new Promise((resolve, reject) => {
      const messageId = generateMessageId();
      
      pendingCallbacks[messageId] = { resolve, reject };
      
      window.postMessage({
        from: 'BESTIARY_CLIENT',
        id: messageId,
        message
      }, '*');
      
      setTimeout(() => {
        if (pendingCallbacks[messageId]) {
          pendingCallbacks[messageId].reject(new Error('Timeout waiting for response'));
          delete pendingCallbacks[messageId];
        }
      }, 10000);
    });
  }
  
  // Load UI Components
  function loadUIComponents() {
    if (window.BestiaryUIComponents) {
      console.log('UI Components already loaded');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Get the base URL for extension resources
      const getExtensionBaseUrl = () => {
        // Try to get from window if it was injected by the content script
        if (window.BESTIARY_EXTENSION_BASE_URL) {
          return window.BESTIARY_EXTENSION_BASE_URL;
        }
        
        // Fallback: Try to detect from script sources
        const scriptElements = document.querySelectorAll('script');
        for (const script of scriptElements) {
          const src = script.src || '';
          if (src.includes('bestiary') && src.includes('extension')) {
            const urlParts = src.split('/');
            // Remove the last part (filename)
            urlParts.pop();
            return urlParts.join('/');
          }
        }
        
        // Last resort fallback if all else fails
        console.warn('Could not determine extension base URL, using fallback');
        return ''; // This will make it use a relative path
      };
      
      const script = document.createElement('script');
      // Use the extension's local copy instead of trying to fetch from bestiaryarena.com
      const extensionUrl = typeof chrome !== 'undefined' ? chrome.runtime.getURL('assets/js/ui_components.js') : 
                          (typeof browser !== 'undefined' ? browser.runtime.getURL('assets/js/ui_components.js') : 
                          'assets/js/ui_components.js');
      script.src = extensionUrl;
      script.onload = () => {
        console.log('UI Components loaded successfully');
        
        // Make the UI components directly available through the API
        if (window.BestiaryUIComponents && window.BestiaryModAPI) {
          window.BestiaryModAPI.ui = window.BestiaryUIComponents;
        }
        
        resolve();
      };
      script.onerror = (err) => {
        console.error('Error loading UI Components:', err);
        // Create a fallback UI components object if loading fails
        window.BestiaryUIComponents = {
          createModal: function() { console.warn("Using fallback modal"); return { close: function() {} }; },
          createButton: function() { console.warn("Using fallback button"); return document.createElement('button'); },
          createFullItem: function() { console.warn("Using fallback item"); return document.createElement('div'); },
          createFullMonster: function() { console.warn("Using fallback monster"); return document.createElement('div'); }
        };
        
        if (window.BestiaryModAPI) {
          window.BestiaryModAPI.ui = window.BestiaryUIComponents;
        }
        
        // Resolve anyway with fallback components
        resolve();
      };
      document.head.appendChild(script);
    });
  }
  
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    // API check handler to work around CSP restrictions
    if (event.data && event.data.from === 'BESTIARY_EXTENSION_API_CHECK' && event.data.action === 'checkAPI') {
      const result = {
        success: false,
        methods: []
      };
      
      if (window.BestiaryModAPI) {
        console.log('BestiaryModAPI found in window object');
        result.success = true;
        result.methods = Object.keys(window.BestiaryModAPI);
      } else {
        console.log('BestiaryModAPI NOT found in window object');
      }
      
      window.postMessage({
        from: 'BESTIARY_API_CHECK',
        result: result
      }, '*');
    }
    
    if (!event.data || event.data.from !== 'BESTIARY_EXTENSION') return;
    
    if (event.data.id && pendingCallbacks[event.data.id]) {
      const { resolve, reject } = pendingCallbacks[event.data.id];
      
      if (event.data.response && event.data.response.success) {
        resolve(event.data.response);
      } else {
        reject(new Error(event.data.response?.error || 'Unknown error'));
      }
      
      delete pendingCallbacks[event.data.id];
    }
    
    if (event.data.message && event.data.message.action) {
      const message = event.data.message;
      
      if (message.action === 'executeScript' && message.hash && message.scriptContent) {
        try {
          console.log(`Preparing to execute script: ${message.hash}`);
          
          if (!window.BestiaryModAPI) {
            console.error('BestiaryModAPI not available, cannot execute script');
            throw new Error('BestiaryModAPI not available');
          }
          
          const scriptContext = {
            hash: message.hash,
            config: message.config || {},
            api: window.BestiaryModAPI
          };
          
          console.log(`Executing script with hash: ${message.hash}`);
          console.log(`Script config:`, scriptContext.config);
          
          const scriptFunction = new Function('context', `
            with (context) {
              ${message.scriptContent}
            }
            return context.exports;
          `);
          
          const scriptResult = scriptFunction(scriptContext);
          console.log(`Script executed successfully: ${message.hash}`, scriptResult);
          
          loadedScripts[message.hash] = {
            hash: message.hash,
            exports: scriptResult,
            context: scriptContext
          };
        } catch (error) {
          console.error(`Error executing script ${message.hash}:`, error);
        }
      }
    }
  });
  
  let currentLocale = 'en-US';
  let translations = {};
  
  async function loadTranslations() {
    try {
      const response = await sendMessageToExtension({
        action: 'getLocale'
      });
      
      if (response.success) {
        currentLocale = response.locale || 'en-US';
        translations = response.translations || {};
      }
    } catch (error) {
      // Silent error handling
    }
  }
  
  function translateKey(key, locale = null) {
    const useLocale = locale || currentLocale;
    
    if (!translations[useLocale]) {
      return key;
    }
    
    const keys = key.split('.');
    let translation = translations[useLocale];
    
    for (const k of keys) {
      if (!translation || !translation[k]) {
        return key;
      }
      translation = translation[k];
    }
    
    return translation;
  }
  
  // Managed mod buttons container
  function createModButtonContainer() {
    const existingContainer = document.getElementById('bestiary-mod-buttons');
    if (existingContainer) return existingContainer;
    
    const container = document.createElement('div');
    container.id = 'bestiary-mod-buttons';
    container.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      display: flex;
      flex-direction: row;
      gap: 10px;
      z-index: 9999;
    `;
    
    document.body.appendChild(container);
    return container;
  }
  
  // Managed config panel container
  function createModConfigContainer() {
    const existingContainer = document.getElementById('bestiary-mod-configs');
    if (existingContainer) return existingContainer;
    
    const container = document.createElement('div');
    container.id = 'bestiary-mod-configs';
    container.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 10px;
      z-index: 9999;
    `;
    
    document.body.appendChild(container);
    return container;
  }
  
  window.BestiaryModAPI = {
    showModal: function(options) {
      if (window.BestiaryUIComponents) {
        return window.BestiaryUIComponents.createModal({
          title: options.title || 'Information',
          content: options.content || '',
          buttons: options.buttons || [{ text: 'OK', primary: true }]
        });
      }
      
      // Fallback to game-styled implementation if UI Components aren't loaded
      const { title, content, buttons } = options || {};
      
      const modalEl = document.createElement('div');
      modalEl.setAttribute('role', 'dialog');
      modalEl.setAttribute('data-state', 'open');
      modalEl.className = 'auto-centered fixed z-modals w-full shadow-lg outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] max-w-[300px]';
      modalEl.style.cssText = 'pointer-events: auto; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999;';
      
      const innerContent = document.createElement('div');
      
      // Create header with proper widget-top class
      const header = document.createElement('h2');
      header.className = 'widget-top widget-top-text';
      
      const headerText = document.createElement('p');
      headerText.textContent = title || 'Information';
      header.appendChild(headerText);
      
      // Create content area with widget-bottom class
      const contentContainer = document.createElement('div');
      contentContainer.className = 'widget-bottom pixel-font-16 p-3 text-whiteRegular';
      
      // Add content
      if (typeof content === 'string') {
        contentContainer.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        contentContainer.appendChild(content);
      }
      
      // Add buttons if provided
      if (buttons && buttons.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'separator my-2.5';
        separator.setAttribute('role', 'none');
        contentContainer.appendChild(separator);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex justify-end gap-2';
        
        buttons.forEach(button => {
          const btnEl = document.createElement('button');
          btnEl.className = 'focus-style-visible flex items-center justify-center tracking-wide text-whiteRegular disabled:cursor-not-allowed disabled:text-whiteDark/60 disabled:grayscale-50 frame-1 active:frame-pressed-1 surface-regular gap-1 px-2 py-0.5 pb-[3px] pixel-font-14 [&_svg]:size-[11px] [&_svg]:mb-[1px] [&_svg]:mt-[2px]';
          btnEl.textContent = button.text || 'OK';
          
          btnEl.addEventListener('click', (e) => {
            if (button.onClick) {
              button.onClick(e);
            }
            if (button.closeOnClick !== false) {
              document.body.removeChild(modalEl);
            }
          });
          
          buttonContainer.appendChild(btnEl);
        });
        
        contentContainer.appendChild(buttonContainer);
      } else {
        const separator = document.createElement('div');
        separator.className = 'separator my-2.5';
        separator.setAttribute('role', 'none');
        contentContainer.appendChild(separator);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex justify-end gap-2';
        
        const defaultBtn = document.createElement('button');
        defaultBtn.className = 'focus-style-visible flex items-center justify-center tracking-wide text-whiteRegular disabled:cursor-not-allowed disabled:text-whiteDark/60 disabled:grayscale-50 frame-1 active:frame-pressed-1 surface-regular gap-1 px-2 py-0.5 pb-[3px] pixel-font-14 [&_svg]:size-[11px] [&_svg]:mb-[1px] [&_svg]:mt-[2px]';
        defaultBtn.textContent = 'Close';
        
        defaultBtn.addEventListener('click', () => {
          document.body.removeChild(modalEl);
        });
        
        buttonContainer.appendChild(defaultBtn);
        contentContainer.appendChild(buttonContainer);
      }
      
      // Assemble modal
      innerContent.appendChild(header);
      innerContent.appendChild(contentContainer);
      modalEl.appendChild(innerContent);
      
      // Add to document
      document.body.appendChild(modalEl);
      
      return function closeModal() {
        if (modalEl.parentNode) {
          document.body.removeChild(modalEl);
        }
      };
    },
    
    renderEntity: function(type, params) {
      if (window.Game && window.Game.render) {
        try {
          return window.Game.render(type, params);
        } catch (e) {
          return null;
        }
      }
      return null;
    },
    
    queryGame: function(selector) {
      return document.querySelector(selector);
    },
    
    clickGame: function(selector) {
      const element = document.querySelector(selector);
      if (element) {
        element.click();
        return true;
      }
      return false;
    },
    
    showGrid: function(options = {}) {
      const {
        rows = 10,
        cols = 10,
        color = 'rgba(255, 0, 0, 0.3)',
        thickness = 1
      } = options;
      
      this.hideGrid();
      
      const gridContainer = document.createElement('div');
      gridContainer.id = 'bestiary-mod-grid';
      gridContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 9998;
      `;
      
      document.body.appendChild(gridContainer);
      
      const gameContainer = document.querySelector('#game-container, .game-container, .game-viewport');
      const rect = gameContainer ? gameContainer.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight, top: 0, left: 0 };
      
      const width = rect.width;
      const height = rect.height;
      
      const rowHeight = height / rows;
      const colWidth = width / cols;
      
      for (let i = 1; i < rows; i++) {
        const rowLine = document.createElement('div');
        rowLine.style.cssText = `
          position: absolute;
          left: ${rect.left}px;
          top: ${rect.top + rowHeight * i}px;
          width: ${width}px;
          height: ${thickness}px;
          background-color: ${color};
        `;
        gridContainer.appendChild(rowLine);
      }
      
      for (let i = 1; i < cols; i++) {
        const colLine = document.createElement('div');
        colLine.style.cssText = `
          position: absolute;
          top: ${rect.top}px;
          left: ${rect.left + colWidth * i}px;
          height: ${height}px;
          width: ${thickness}px;
          background-color: ${color};
        `;
        gridContainer.appendChild(colLine);
      }
    },
    
    hideGrid: function() {
      const gridContainer = document.getElementById('bestiary-mod-grid');
      if (gridContainer) {
        gridContainer.remove();
      }
    },
    
    skipAnimations: function(enabled) {
      document.documentElement.style.setProperty('--animation-duration', enabled ? '0s' : null);
      document.documentElement.style.setProperty('--animation-delay', enabled ? '0s' : null);
      document.documentElement.style.setProperty('--transition-duration', enabled ? '0s' : null);
      
      const styleElement = document.getElementById('bestiary-animation-skipper');
      
      if (enabled) {
        if (!styleElement) {
          const style = document.createElement('style');
          style.id = 'bestiary-animation-skipper';
          style.textContent = `
            * {
              animation-duration: 0s !important;
              animation-delay: 0s !important;
              transition-duration: 0s !important;
              transition-delay: 0s !important;
            }
          `;
          document.head.appendChild(style);
        }
      } else if (styleElement) {
        styleElement.remove();
      }
    },
    
    i18n: {
      t: translateKey,
      getLocale: () => currentLocale,
      getSupportedLocales: () => ['en-US', 'pt-BR']
    },
    
    hook: {
      method: function(object, methodName, callback) {
        if (!object || typeof object[methodName] !== 'function') {
          return false;
        }
        
        const originalMethod = object[methodName];
        
        object[methodName] = function() {
          const args = Array.from(arguments);
          
          return callback({
            args,
            callOriginal: () => originalMethod.apply(this, args),
            originalMethod,
            thisValue: this
          });
        };
        
        object[methodName]._hooked = true;
        object[methodName]._originalMethod = originalMethod;
        
        return true;
      },
      
      unhook: function(object, methodName) {
        if (!object || !object[methodName] || !object[methodName]._hooked) {
          return false;
        }
        
        object[methodName] = object[methodName]._originalMethod;
        return true;
      }
    },
    
    service: {
      registerScript: function(hash, name, config) {
        return sendMessageToExtension({
          action: 'registerScript',
          hash,
          name,
          config
        });
      },
      
      getActiveScripts: function() {
        return sendMessageToExtension({
          action: 'getActiveScripts'
        }).then(response => response.scripts || []);
      },
      
      toggleScript: function(hash, enabled) {
        return sendMessageToExtension({
          action: 'toggleScript',
          hash,
          enabled
        });
      },
      
      updateScriptConfig: function(hash, config) {
        return sendMessageToExtension({
          action: 'updateScriptConfig',
          hash,
          config
        });
      },
      
      removeScript: function(hash) {
        return sendMessageToExtension({
          action: 'removeScript',
          hash
        });
      }
    },
    
    ui: {
      addButton: function(options) {
        const {
          id,
          text,
          onClick,
          modId,
          primary = false,
          icon = null,
          tooltip = null,
          position = null
        } = options;
        
        const container = createModButtonContainer();
        
        const existingButton = document.getElementById(id);
        if (existingButton) {
          console.warn(`Button with id ${id} already exists, updating it`);
          existingButton.textContent = icon ? icon : text;
          existingButton.title = tooltip || text;
          
          const newClickHandler = (e) => {
            e.preventDefault();
            onClick(e);
          };
          
          existingButton.removeEventListener('click', existingButton._clickHandler);
          existingButton._clickHandler = newClickHandler;
          existingButton.addEventListener('click', newClickHandler);
          
          return existingButton;
        }
        
        const button = document.createElement('button');
        button.id = id;
        button.textContent = icon ? icon : text;
        button.title = tooltip || text;
        button.setAttribute('data-mod-id', modId || '');
        
        button.style.cssText = `
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          background: ${primary ? '#4CAF50' : '#555'};
          color: white;
        `;
        
        button._clickHandler = (e) => {
          e.preventDefault();
          onClick(e);
        };
        
        button.addEventListener('click', button._clickHandler);
        
        container.appendChild(button);
        
        return button;
      },
      
      updateButton: function(id, options) {
        const button = document.getElementById(id);
        if (!button) {
          console.warn(`Button with id ${id} not found`);
          return null;
        }
        
        if (options.text) {
          button.textContent = options.icon ? options.icon : options.text;
        }
        
        if (options.tooltip) {
          button.title = options.tooltip;
        }
        
        if (options.primary !== undefined) {
          button.style.background = options.primary ? '#4CAF50' : '#555';
        }
        
        return button;
      },
      
      removeButton: function(id) {
        const button = document.getElementById(id);
        if (button && button.parentNode) {
          button.parentNode.removeChild(button);
          return true;
        }
        return false;
      },
      
      createConfigPanel: function(options) {
        if (window.BestiaryUIComponents) {
          const contentEl = document.createElement('div');
          
          if (typeof options.content === 'string') {
            contentEl.innerHTML = options.content;
          } else if (options.content instanceof HTMLElement) {
            contentEl.appendChild(options.content);
          } else if (typeof options.content === 'function') {
            options.content(contentEl);
          }
          
          return window.BestiaryUIComponents.createModal({
            title: options.title || 'Configuration',
            width: 350,
            content: contentEl,
            buttons: options.buttons || [{ text: 'Close', primary: true }]
          });
        }
        
        // Fallback if UI Components aren't loaded
        const { id, title, modId, content, buttons = [] } = options;
        
        const container = createModConfigContainer();
        
        const existingPanel = document.getElementById(id);
        if (existingPanel) {
          existingPanel.parentNode.removeChild(existingPanel);
        }
        
        const panel = document.createElement('div');
        panel.id = id;
        panel.className = 'bestiary-mod-config-panel';
        panel.setAttribute('data-mod-id', modId || '');
        panel.style.cssText = `
          background: rgba(0, 0, 0, 0.9);
          border: 1px solid #444;
          border-radius: 8px;
          padding: 15px;
          width: 350px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
          display: none;
        `;
        
        if (title) {
          const titleEl = document.createElement('h3');
          titleEl.textContent = title;
          titleEl.style.cssText = 'margin-top: 0; padding-bottom: 10px; border-bottom: 1px solid #333; color: white;';
          panel.appendChild(titleEl);
        }
        
        const contentEl = document.createElement('div');
        contentEl.style.cssText = 'margin: 15px 0; color: white;';
        
        if (typeof content === 'string') {
          contentEl.innerHTML = content;
        } else if (content instanceof HTMLElement) {
          contentEl.appendChild(content);
        } else if (typeof content === 'function') {
          content(contentEl);
        }
        
        panel.appendChild(contentEl);
        
        if (buttons.length) {
          const btnContainer = document.createElement('div');
          btnContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';
          
          buttons.forEach(btn => {
            const btnEl = document.createElement('button');
            btnEl.textContent = btn.text || 'OK';
            btnEl.style.cssText = `
              padding: 8px 16px;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              background: ${btn.primary ? '#4CAF50' : '#555'};
              color: white;
            `;
            
            btnEl.addEventListener('click', () => {
              if (btn.onClick) btn.onClick(btnEl, panel);
              if (btn.closeOnClick !== false) {
                panel.style.display = 'none';
              }
            });
            
            btnContainer.appendChild(btnEl);
          });
          
          panel.appendChild(btnContainer);
        }
        
        container.appendChild(panel);
        
        return {
          element: panel,
          show: () => { panel.style.display = 'block'; },
          hide: () => { panel.style.display = 'none'; },
          toggle: () => { 
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
          },
          remove: () => {
            if (panel.parentNode) {
              panel.parentNode.removeChild(panel);
            }
          }
        };
      },
      
      toggleConfigPanel: function(id) {
        const panel = document.getElementById(id);
        if (!panel) {
          console.warn(`Config panel with id ${id} not found`);
          return;
        }
        
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      },
      
      hideAllConfigPanels: function() {
        const panels = document.querySelectorAll('.bestiary-mod-config-panel');
        panels.forEach(panel => {
          panel.style.display = 'none';
        });
      },
      
      removeConfigPanel: function(id) {
        const panel = document.getElementById(id);
        if (panel && panel.parentNode) {
          panel.parentNode.removeChild(panel);
          return true;
        }
        return false;
      },
      
      // New UI components
      components: {
        createModal: function(options) {
          if (!window.BestiaryUIComponents) {
            console.warn('UI Components not loaded, using fallback modal');
            return window.BestiaryModAPI.showModal(options);
          }
          return window.BestiaryUIComponents.createModal(options);
        },
        
        createScrollContainer: function(options) {
          if (!window.BestiaryUIComponents) {
            console.warn('UI Components not loaded, using fallback scroll container');
            
            // Create container
            const container = document.createElement('div');
            container.className = 'relative overflow-hidden frame-pressed-1 surface-dark';
            container.style.cssText = `position: relative; height: ${options.height || 300}px; --radix-scroll-area-corner-width: 0px; --radix-scroll-area-corner-height: 0px;`;
            
            // Create scroll view with game-styled scrollbar
            const scrollView = document.createElement('div');
            scrollView.setAttribute('data-radix-scroll-area-viewport', '');
            scrollView.setAttribute('data-type', 'always');
            scrollView.className = 'h-full w-[calc(100%-12px)] data-[type=\'auto\']:w-full';
            scrollView.style.cssText = 'overflow: hidden scroll;';
            
            // Create content container
            const contentContainer = document.createElement('div');
            contentContainer.style.cssText = 'min-width: 100%; display: table;';
            
            // Add padding container if needed
            const paddingContainer = document.createElement('div');
            paddingContainer.setAttribute('data-nopadding', options.padding === false ? 'true' : 'false');
            paddingContainer.className = 'my-1 grid items-start gap-1 data-[nopadding=\'true\']:my-0';
            paddingContainer.style.cssText = 'grid-template-rows: max-content;';
            
            if (typeof options.content === 'string') {
              paddingContainer.innerHTML = options.content;
            } else if (options.content instanceof HTMLElement) {
              paddingContainer.appendChild(options.content);
            } else if (Array.isArray(options.content)) {
              options.content.forEach(item => {
                if (typeof item === 'string') {
                  const itemDiv = document.createElement('div');
                  itemDiv.innerHTML = item;
                  paddingContainer.appendChild(itemDiv);
                } else if (item instanceof HTMLElement) {
                  paddingContainer.appendChild(item);
                }
              });
            }
            
            // Create scrollbar
            const scrollbar = document.createElement('div');
            scrollbar.setAttribute('data-orientation', 'vertical');
            scrollbar.className = 'scrollbar-element frame-1 surface-dark flex touch-none select-none border-0 data-[orientation=\'horizontal\']:h-3 data-[orientation=\'vertical\']:h-full data-[orientation=\'vertical\']:w-3 data-[orientation=\'horizontal\']:flex-col';
            scrollbar.style.cssText = 'position: absolute; top: 0px; right: 0px; bottom: var(--radix-scroll-area-corner-height); --radix-scroll-area-thumb-height: 93.58887171561051px;';
            
            // Create scrollbar thumb
            const scrollThumb = document.createElement('div');
            scrollThumb.setAttribute('data-state', 'visible');
            scrollThumb.setAttribute('data-orientation', 'vertical');
            scrollThumb.className = 'relative flex-1 data-[orientation=\'vertical\']:scrollbar-vertical data-[orientation=\'horizontal\']:scrollbar-horizontal';
            scrollThumb.style.cssText = 'width: var(--radix-scroll-area-thumb-width); height: var(--radix-scroll-area-thumb-height); transform: translate3d(0px, 0px, 0px); cursor: pointer;';
            
            // Add scrollbar style
            const style = document.createElement('style');
            style.textContent = `
              [data-radix-scroll-area-viewport] {
                scrollbar-width: none;
                -ms-overflow-style: none;
                -webkit-overflow-scrolling: touch;
              }
              [data-radix-scroll-area-viewport]::-webkit-scrollbar {
                display: none;
              }
              .scrollbar-vertical {
                background-color: #444;
                border-radius: 3px;
              }
            `;
            
            // Assemble all components
            scrollbar.appendChild(scrollThumb);
            contentContainer.appendChild(paddingContainer);
            scrollView.appendChild(contentContainer);
            container.appendChild(style);
            container.appendChild(scrollView);
            container.appendChild(scrollbar);
            
            // Function to update the scrollbar position based on scroll
            function updateScrollThumb() {
              const containerHeight = scrollView.clientHeight;
              const scrollHeight = scrollView.scrollHeight;
              const scrollTop = scrollView.scrollTop;
              
              if (scrollHeight <= containerHeight) {
                scrollbar.style.display = 'none';
                return;
              }
              
              scrollbar.style.display = 'flex';
              const thumbHeight = Math.max(30, (containerHeight / scrollHeight) * containerHeight);
              const thumbPosition = (scrollTop / (scrollHeight - containerHeight)) * (containerHeight - thumbHeight);
              
              scrollThumb.style.height = `${thumbHeight}px`;
              scrollThumb.style.transform = `translate3d(0px, ${thumbPosition}px, 0px)`;
              scrollbar.style.setProperty('--radix-scroll-area-thumb-height', `${thumbHeight}px`);
            }
            
            // Update on scroll event
            scrollView.addEventListener('scroll', () => {
              updateScrollThumb();
            });
            
            // Handle click and drag on scrollbar
            let isDragging = false;
            let startY = 0;
            let startScrollTop = 0;
            
            // Click on scrollbar (not on thumb)
            scrollbar.addEventListener('click', (e) => {
              // Only handle clicks directly on the scrollbar, not the thumb
              if (e.target === scrollbar) {
                const rect = scrollbar.getBoundingClientRect();
                const clickPositionY = e.clientY - rect.top;
                const containerHeight = scrollView.clientHeight;
                const scrollHeight = scrollView.scrollHeight;
                const thumbHeight = Math.max(30, (containerHeight / scrollHeight) * containerHeight);
                
                // Calculate new scroll position
                let scrollRatio = clickPositionY / containerHeight;
                // Adjust for thumb height
                scrollRatio = Math.min(1, Math.max(0, scrollRatio));
                
                // Apply scroll
                scrollView.scrollTop = scrollRatio * (scrollHeight - containerHeight);
                updateScrollThumb();
              }
            });
            
            // Mouse down on thumb
            scrollThumb.addEventListener('mousedown', (e) => {
              isDragging = true;
              startY = e.clientY;
              startScrollTop = scrollView.scrollTop;
              document.body.style.userSelect = 'none'; // Prevent text selection while dragging
              e.preventDefault(); // Prevent text selection
            });
            
            // Mouse move for dragging
            document.addEventListener('mousemove', (e) => {
              if (!isDragging) return;
              
              const deltaY = e.clientY - startY;
              const containerHeight = scrollView.clientHeight;
              const scrollHeight = scrollView.scrollHeight;
              const thumbHeight = Math.max(30, (containerHeight / scrollHeight) * containerHeight);
              
              // Calculate movement ratio based on scrollbar height and content height
              const moveRatio = deltaY / (containerHeight - thumbHeight);
              const scrollDelta = moveRatio * (scrollHeight - containerHeight);
              
              // Apply scroll
              scrollView.scrollTop = Math.max(0, Math.min(scrollHeight - containerHeight, startScrollTop + scrollDelta));
              updateScrollThumb();
            });
            
            // Mouse up to end drag
            document.addEventListener('mouseup', () => {
              if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
              }
            });
            
            // Initial calculation
            setTimeout(() => {
              updateScrollThumb();
            }, 100);
            
            return {
              element: container,
              scrollView: scrollView,
              contentContainer: paddingContainer,
              addContent: (content) => {
                if (typeof content === 'string') {
                  const contentDiv = document.createElement('div');
                  contentDiv.innerHTML = content;
                  paddingContainer.appendChild(contentDiv);
                } else if (content instanceof HTMLElement) {
                  paddingContainer.appendChild(content);
                }
                
                // Recalculate scrollbar
                setTimeout(() => {
                  updateScrollThumb();
                }, 50);
              },
              clear: () => { 
                paddingContainer.innerHTML = '';
                
                // Recalculate scrollbar
                setTimeout(() => {
                  updateScrollThumb();
                }, 50);
              }
            };
          }
          
          return window.BestiaryUIComponents.createScrollContainer(options);
        },
        
        createMonsterPortrait: function(options) {
          if (!window.BestiaryUIComponents) {
            console.warn('UI Components not loaded, using fallback monster portrait');
            const div = document.createElement('div');
            div.style.cssText = 'width: 34px; height: 34px; max-width: 34px; max-height: 34px; background: #333; position: relative; border: 2px solid #555;';
            
            const img = document.createElement('img');
            img.src = `/assets/portraits/${options.monsterId}.png`;
            img.alt = 'Monster';
            img.style.cssText = 'width: 100%; height: 100%; max-width: 34px; max-height: 34px; object-fit: contain;';
            
            div.appendChild(img);
            
            const level = document.createElement('span');
            level.textContent = options.level || 1;
            level.style.cssText = 'position: absolute; bottom: 0; left: 2px; color: white; font-size: 12px; background: rgba(0,0,0,0.7); padding: 0 2px;';
            
            div.appendChild(level);
            
            if (options.onClick) {
              div.style.cursor = 'pointer';
              div.addEventListener('click', options.onClick);
            }
            
            return div;
          }
          
          return window.BestiaryUIComponents.createMonsterPortrait(options);
        },
        
        createItemPortrait: function(options) {
          if (!window.BestiaryUIComponents) {
            console.warn('UI Components not loaded, using fallback item portrait');
            const button = document.createElement('button');
            button.className = 'focus-style-visible active:opacity-70';
            button.setAttribute('data-state', 'closed');
            
            const portrait = document.createElement('div');
            portrait.className = 'equipment-portrait surface-darker relative data-[alive=false]:dithered data-[noframes=false]:frame-pressed-1 hover:unset-border-image';
            portrait.setAttribute('data-noframes', 'false');
            portrait.setAttribute('data-alive', options.animated ? 'true' : 'false');
            portrait.setAttribute('data-highlighted', 'true');
            portrait.style.cssText = 'width: 32px; height: 32px; max-width: 32px; max-height: 32px;';
            
            // Add rarity background based on tier
            const rarityBg = document.createElement('div');
            rarityBg.className = 'has-rarity absolute inset-0 z-1 opacity-80';
            rarityBg.setAttribute('data-rarity', Math.min(5, options.tier || 1));
            
            // Create the sprite with proper structure
            const spriteContainer = document.createElement('div');
            spriteContainer.className = `sprite item relative id-${options.itemId}`;
            
            const viewport = document.createElement('div');
            viewport.className = 'viewport';
            
            const img = document.createElement('img');
            img.alt = options.itemId;
            img.setAttribute('data-cropped', 'false');
            img.className = 'spritesheet';
            
            // Handle animated items
            if (options.animated) {
              img.style.cssText = '--cropX: 0; --cropY: 0;';
              
              // If animation frames are specified, set height accordingly
              if (options.frames) {
                const frameHeight = 32 * options.frames;
                img.style.height = frameHeight + 'px';
              }
            } else {
              img.style.cssText = '--cropX: 0; --cropY: 0;';
            }
            
            viewport.appendChild(img);
            spriteContainer.appendChild(viewport);
            
            // Add stat icon if provided
            if (options.stat) {
              const statIconContainer = document.createElement('div');
              statIconContainer.className = 'absolute bottom-0 left-0 z-2 flex size-full items-end pb-1 pl-0.5';
              statIconContainer.style.cssText = 'background: radial-gradient(circle at left bottom, rgba(0, 0, 0, 0.5) 6px, transparent 24px)';
              
              const statIcon = document.createElement('img');
              statIcon.className = 'pixelated size-[calc(11px*var(--zoomFactor))]';
              statIcon.alt = 'stat type';
              
              // Set icon based on stat type
              const statType = options.stat.toLowerCase();
              if (statType === 'ad' || statType === 'attackdamage') {
                statIcon.src = '/assets/icons/attackdamage.png';
              } else if (statType === 'ap' || statType === 'abilitypower') {
                statIcon.src = '/assets/icons/abilitypower.png';
              } else if (statType === 'hp' || statType === 'health') {
                statIcon.src = '/assets/icons/heal.png';
              } else if (statType === 'armor') {
                statIcon.src = '/assets/icons/armor.png';
              } else if (statType === 'mr' || statType === 'magicresist') {
                statIcon.src = '/assets/icons/magicresist.png';
              } else {
                statIcon.src = '/assets/icons/attackdamage.png';
              }
              
              statIconContainer.appendChild(statIcon);
              portrait.appendChild(statIconContainer);
            }
            
            // Assemble the portrait
            portrait.appendChild(rarityBg);
            portrait.appendChild(spriteContainer);
            button.appendChild(portrait);
            
            if (options.onClick) {
              button.addEventListener('click', options.onClick);
            }
            
            return button;
          }
          
          return window.BestiaryUIComponents.createItemPortrait(options);
        },
        
        createRoomListItem: function(options) {
          if (!window.BestiaryUIComponents) {
            console.warn('UI Components not loaded, using fallback room list item');
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; gap: 10px; padding: 5px; background: #333; margin: 5px 0; border: 1px solid #555;';
            
            const img = document.createElement('img');
            img.src = `/assets/room-thumbnails/${options.roomId}.png`;
            img.alt = options.name || 'Room';
            img.style.cssText = 'width: 80px; height: 60px; object-fit: cover;';
            
            const info = document.createElement('div');
            const title = document.createElement('h4');
            title.textContent = options.name || 'Room';
            title.style.cssText = 'margin: 0 0 5px 0; color: white;';
            
            info.appendChild(title);
            
            div.appendChild(img);
            div.appendChild(info);
            
            if (options.onClick) {
              div.style.cursor = 'pointer';
              div.addEventListener('click', options.onClick);
            }
            
            return div;
          }
          
          return window.BestiaryUIComponents.createRoomListItem(options);
        },
        
        createNavBreadcrumb: function(options) {
          if (!window.BestiaryUIComponents) {
            console.warn('UI Components not loaded, using fallback breadcrumb');
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; gap: 10px; align-items: center; margin-bottom: 10px;';
            
            if (options.onBack) {
              const backBtn = document.createElement('button');
              backBtn.className = 'focus-style-visible flex items-center justify-center tracking-wide text-whiteRegular disabled:cursor-not-allowed disabled:text-whiteDark/60 disabled:grayscale-50 frame-1 active:frame-pressed-1 surface-regular gap-1 px-2 py-0.5 pb-[3px] pixel-font-14';
              backBtn.style.cssText = 'display: flex; align-items: center; justify-content: center;';
              
              // Create SVG arrow icon
              const svgNS = 'http://www.w3.org/2000/svg';
              const backIcon = document.createElementNS(svgNS, 'svg');
              backIcon.setAttribute('xmlns', svgNS);
              backIcon.setAttribute('width', '24');
              backIcon.setAttribute('height', '24');
              backIcon.setAttribute('viewBox', '0 0 24 24');
              backIcon.setAttribute('fill', 'none');
              backIcon.setAttribute('stroke', 'currentColor');
              backIcon.setAttribute('stroke-width', '2');
              backIcon.setAttribute('stroke-linecap', 'round');
              backIcon.setAttribute('stroke-linejoin', 'round');
              backIcon.setAttribute('class', 'lucide lucide-arrow-left');
              backIcon.style.cssText = 'width: 11px; height: 11px; margin-bottom: 1px; margin-top: 2px;';
              
              const path1 = document.createElementNS(svgNS, 'path');
              path1.setAttribute('d', 'm12 19-7-7 7-7');
              
              const path2 = document.createElementNS(svgNS, 'path');
              path2.setAttribute('d', 'M19 12H5');
              
              backIcon.appendChild(path1);
              backIcon.appendChild(path2);
              
              backBtn.appendChild(backIcon);
              backBtn.addEventListener('click', options.onBack);
              div.appendChild(backBtn);
            }
            
            if (options.paths && options.paths.length) {
              const paths = document.createElement('span');
              paths.style.color = 'white';
              paths.textContent = options.paths.join(' > ');
              div.appendChild(paths);
            }
            
            return div;
          }
          
          return window.BestiaryUIComponents.createNavBreadcrumb(options);
        },
        
        createFullItem: function(options) {
          if (!window.BestiaryUIComponents) {
            console.warn('UI Components not loaded, using fallback full item display');
            
            const container = document.createElement('div');
            container.setAttribute('data-noframes', 'false');
            container.setAttribute('data-alive', options.animated ? 'true' : 'false');
            container.className = 'equipment-portrait surface-darker relative data-[alive=\'false\']:dithered data-[noframes=\'false\']:frame-pressed-1';
            
            // Set appropriate size for the container
            const size = options.size || 'medium';
            let cssSize = 'width: 64px; height: 64px;';
            
            if (size === 'small') {
              cssSize = 'width: 48px; height: 48px;';
            } else if (size === 'large') {
              cssSize = 'width: 96px; height: 96px;';
            }
            
            container.style.cssText = cssSize + 'margin: 0 auto;';
            
            // Add rarity background based on tier
            const rarityBg = document.createElement('div');
            rarityBg.className = 'has-rarity absolute inset-0 z-1 opacity-80';
            rarityBg.setAttribute('data-rarity', Math.min(5, options.tier || 1));
            rarityBg.setAttribute('role', 'none');
            container.appendChild(rarityBg);
            
            // Create the sprite with proper structure
            const spriteContainer = document.createElement('div');
            spriteContainer.className = `sprite item relative id-${options.itemId}`;
            spriteContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;';
            
            const viewport = document.createElement('div');
            viewport.className = 'viewport';
            viewport.style.cssText = 'display: flex; justify-content: center; align-items: center;';
            
            const img = document.createElement('img');
            img.alt = options.itemId;
            img.setAttribute('data-cropped', 'false');
            img.className = 'spritesheet';
            
            // Handle animated items
            if (options.animated) {
              img.style.cssText = '--cropX: 0; --cropY: 0';
              
              // If animation frames are specified, set height accordingly
              if (options.frames) {
                const frameHeight = 32 * options.frames;
                img.style.height = frameHeight + 'px';
              }
            } else {
              img.style.cssText = '--cropX: 0; --cropY: 0';
            }
            
            viewport.appendChild(img);
            spriteContainer.appendChild(viewport);
            container.appendChild(spriteContainer);
            
            // Add stat icon if provided
            if (options.stat) {
              const statIconContainer = document.createElement('div');
              statIconContainer.className = 'absolute bottom-0 left-0 z-2 flex size-full items-end pb-1 pl-0.5';
              statIconContainer.style.cssText = 'background: radial-gradient(circle at left bottom, rgba(0, 0, 0, 0.5) 6px, transparent 24px)';
              
              const statIcon = document.createElement('img');
              statIcon.className = 'pixelated size-[calc(11px*var(--zoomFactor))]';
              statIcon.alt = 'stat type';
              
              // Set icon based on stat type
              const statType = options.stat.toLowerCase();
              if (statType === 'ad' || statType === 'attackdamage') {
                statIcon.src = '/assets/icons/attackdamage.png';
              } else if (statType === 'ap' || statType === 'abilitypower') {
                statIcon.src = '/assets/icons/abilitypower.png';
              } else if (statType === 'hp' || statType === 'health') {
                statIcon.src = '/assets/icons/heal.png';
              } else if (statType === 'armor') {
                statIcon.src = '/assets/icons/armor.png';
              } else if (statType === 'mr' || statType === 'magicresist') {
                statIcon.src = '/assets/icons/magicresist.png';
              } else {
                statIcon.src = '/assets/icons/attackdamage.png';
              }
              
              statIconContainer.appendChild(statIcon);
              container.appendChild(statIconContainer);
            }
            
            if (options.onClick) {
              container.style.cursor = 'pointer';
              container.addEventListener('click', options.onClick);
            }
            
            return container;
          }
          
          return window.BestiaryUIComponents.createFullItem(options);
        },
        
        createFullMonster: function(options) {
          if (!window.BestiaryUIComponents) {
            console.warn('UI Components not loaded, using fallback full monster display');
            
            // Try to get monster metadata to access the correct spriteId and portrait translation
            let spriteId = options.spriteId || options.monsterId;
            let portraitTranslate = '-3px -8px'; // Default translation
            
            try {
              if (globalThis.state && globalThis.state.utils && globalThis.state.utils.getMonster) {
                const monsterData = globalThis.state.utils.getMonster(options.monsterId);
                if (monsterData && monsterData.metadata) {
                  if (monsterData.metadata.spriteId) {
                    spriteId = monsterData.metadata.spriteId;
                  }
                  if (monsterData.metadata.portraitTranslate) {
                    portraitTranslate = monsterData.metadata.portraitTranslate;
                  }
                }
              }
            } catch (e) {
              console.warn('Failed to get monster metadata', e);
            }
            
            const container = document.createElement('div');
            container.className = 'container-slot surface-darker relative h-fit p-1';
            
            // Set appropriate size for the container
            const size = options.size || 'medium';
            let cssSize = '';
            
            if (size === 'small') {
              cssSize = 'width: 72px; height: 72px;';
            } else if (size === 'medium') {
              cssSize = 'width: 96px; height: 96px;';
            } else if (size === 'large') {
              cssSize = 'width: 128px; height: 128px;';
            }
            
            if (cssSize) {
              container.style.cssText = cssSize + 'margin: 0 auto;';
            } else {
              container.style.cssText = 'margin: 0 auto;';
            }
            
            // Add rarity background based on tier
            const rarityBg = document.createElement('div');
            rarityBg.className = 'has-rarity absolute inset-0 z-2';
            rarityBg.setAttribute('data-rarity', Math.min(5, options.tier || 1));
            rarityBg.setAttribute('role', 'none');
            container.appendChild(rarityBg);
            
            // Add star tier if provided
            if (options.starTier) {
              const starTierImg = document.createElement('img');
              starTierImg.className = 'pixelated absolute right-0.5 top-0.5 z-4 opacity-75';
              starTierImg.alt = 'star tier';
              starTierImg.src = `/assets/icons/star-tier-lax-${options.starTier}.png`;
              container.appendChild(starTierImg);
            }
            
            // Create monster sprite container
            const spriteContainer = document.createElement('div');
            spriteContainer.className = 'relative z-3 mx-auto flex h-12 w-sprite-2x items-center justify-center';
            
            const spriteOutfit = document.createElement('div');
            spriteOutfit.className = `sprite outfit pointer-events-none id-${spriteId} idle south`;
            spriteOutfit.style.cssText = `translate: ${portraitTranslate}`;
            
            const viewport = document.createElement('div');
            viewport.className = 'viewport';
            
            const img = document.createElement('img');
            img.alt = 'south';
            img.className = 'actor spritesheet';
            img.style.cssText = 'animation-play-state: running';
            
            viewport.appendChild(img);
            spriteOutfit.appendChild(viewport);
            spriteContainer.appendChild(spriteOutfit);
            container.appendChild(spriteContainer);
            
            if (options.level) {
              const level = document.createElement('span');
              level.textContent = options.level;
              level.className = 'pixel-font-16 absolute bottom-0.5 left-1 z-3 text-whiteExp';
              container.appendChild(level);
            }
            
            if (options.onClick) {
              container.style.cursor = 'pointer';
              container.addEventListener('click', options.onClick);
            }
            
            return container;
          }
          
          return window.BestiaryUIComponents.createFullMonster(options);
        }
      }
    }
  };
  
  // Initialize the API and load components
  async function initializeAPI() {
    try {
      await loadTranslations();
      await loadUIComponents();
      
      // Now that UI components are loaded, inject the createModal method directly
      if (window.BestiaryUIComponents && window.BestiaryModAPI) {
        window.BestiaryModAPI.ui = window.BestiaryUIComponents;
      }
      
      // Setup a function to expose the utility functions to mods
      const exposeUtilityFunctions = () => {
        // First try to get the utility functions directly from the window object
        const hasSerializeBoard = typeof window.$serializeBoard === 'function';
        const hasReplay = typeof window.$replay === 'function';
        const hasForceSeed = typeof window.$forceSeed === 'function';
        const hasRemoveSeed = typeof window.$removeSeed === 'function';
        const hasConfigureBoard = typeof window.$configureBoard === 'function';
        
        // If we have the utility functions directly, use them
        if (hasSerializeBoard && hasReplay && hasForceSeed && hasRemoveSeed && hasConfigureBoard) {
          console.log('Utility functions found directly in window object');
          
          // Get the maps from window
          const maps = {
            regionNamesToIds: window.regionNamesToIds,
            regionIdsToNames: window.regionIdsToNames,
            mapNamesToIds: window.mapNamesToIds,
            mapIdsToNames: window.mapIdsToNames,
            monsterNamesToGameIds: window.monsterNamesToGameIds,
            monsterGameIdsToNames: window.monsterGameIdsToNames,
            equipmentNamesToGameIds: window.equipmentNamesToGameIds,
            equipmentGameIdsToNames: window.equipmentGameIdsToNames
          };
          
          // Add utility functions to the API
          window.BestiaryModAPI.utility = {
            serializeBoard: window.$serializeBoard,
            replay: window.$replay,
            forceSeed: window.$forceSeed, 
            removeSeed: window.$removeSeed,
            configureBoard: window.$configureBoard,
            maps: maps
          };
          
          console.log('Utility functions exposed to BestiaryModAPI');
          
          // Dispatch an event to notify mods that utility functions are ready
          document.dispatchEvent(new CustomEvent('utility-api-ready'));
          return true;
        }
        
        return false;
      };
      
      // Try to expose utility functions immediately if they're already loaded
      if (!exposeUtilityFunctions()) {
        // If not loaded yet, wait for the utility-functions-loaded event
        console.log('Waiting for utility functions to load...');
        document.addEventListener('utility-functions-loaded', () => {
          // Set a small timeout to ensure functions are fully available in window scope
          setTimeout(() => {
            exposeUtilityFunctions();
          }, 100);
        });
        
        // Also listen for the window message event as a fallback
        window.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'UTILITY_FUNCTIONS_READY') {
            setTimeout(() => {
              exposeUtilityFunctions();
            }, 100);
          }
        });
      }
      
      // Signal that the API is ready
      document.dispatchEvent(new CustomEvent('bestiary-mod-api-ready'));
      console.log('Bestiary Mod API initialized');
    } catch (error) {
      console.error('Error initializing API:', error);
    }
  }
  
  initializeAPI();
})();