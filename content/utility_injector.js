// First load the browser polyfill
const polyfillScript = document.createElement('script');
polyfillScript.setAttribute('type', 'text/javascript');
polyfillScript.setAttribute('src', chrome.runtime.getURL('assets/js/browser-polyfill.js'));
(document.head || document.documentElement).appendChild(polyfillScript);

// Utility Injector - Loads the utility functions directly from local file

(function() {
  console.log('BA Utility Injector: Starting');
  
  // Function to inject sandbox utils directly from local file
  function injectSandboxUtils() {
    console.log('BA Utility Injector: Injecting sandbox utils from local file');
    
    // Create and inject the script
    const script = document.createElement('script');
    script.type = 'module';
    script.src = chrome.runtime.getURL('content/ba-sandbox-utils.mjs');
    
    // Handle script loading events
    script.onload = function() {
      console.log('BA Utility Injector: Sandbox utils loaded successfully');
    };
    
    script.onerror = function(error) {
      console.error('BA Utility Injector: Error loading sandbox utils:', error);
    };
    
    document.head.appendChild(script);
  }
  
  // Inject as soon as possible but wait for the document to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSandboxUtils);
  } else {
    injectSandboxUtils();
  }
})(); 