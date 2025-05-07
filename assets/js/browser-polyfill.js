// browser-polyfill.js
// A robust polyfill for WebExtension APIs to ensure cross-browser compatibility

(function(global) {
  'use strict';

  if (typeof global.browser !== 'undefined' && typeof global.chrome === 'undefined') {
    // Firefox environment (browser exists, chrome doesn't)
    global.chrome = global.browser;
  } 
  else if (typeof global.chrome !== 'undefined' && typeof global.browser === 'undefined') {
    // Chrome environment (chrome exists, browser doesn't)
    global.browser = {
      // Add basic API compatibility shims
      runtime: {
        getURL: global.chrome.runtime.getURL,
        sendMessage: global.chrome.runtime.sendMessage,
        onMessage: global.chrome.runtime.onMessage
      },
      storage: {
        local: global.chrome.storage.local,
        sync: global.chrome.storage.sync
      },
      tabs: global.chrome.tabs
    };
  }
  else if (typeof global.browser === 'undefined' && typeof global.chrome === 'undefined') {
    // Neither exists, create dummy objects to prevent errors
    const dummyAPI = {
      runtime: {
        getURL: function(path) { return path; },
        sendMessage: function() { return Promise.resolve(); },
        onMessage: { addListener: function() {} }
      },
      storage: {
        local: {
          get: function() { return Promise.resolve({}); },
          set: function() { return Promise.resolve(); }
        },
        sync: {
          get: function() { return Promise.resolve({}); },
          set: function() { return Promise.resolve(); }
        }
      },
      tabs: {
        query: function() { return Promise.resolve([]); }
      }
    };
    
    global.chrome = dummyAPI;
    global.browser = dummyAPI;
  }
  
  // Ensure Firefox's promise-based APIs are properly handled
  const originalSendMessage = global.chrome.runtime.sendMessage;
  global.chrome.runtime.sendMessage = function() {
    return new Promise((resolve, reject) => {
      originalSendMessage.apply(chrome.runtime, [...arguments, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      }]);
    });
  };

})(typeof window !== 'undefined' ? window : global); 