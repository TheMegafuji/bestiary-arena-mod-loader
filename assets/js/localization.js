class Localization {
  constructor() {
    this.currentLocale = 'pt-BR';
    this.translations = {};
    this.supportedLocales = ['pt-BR', 'en-US'];
    this.defaultLocale = 'pt-BR';
    this.onLocaleChangeCallbacks = [];
  }

  async init() {
    try {
      const storage = await chrome.storage.local.get('locale');
      this.currentLocale = storage.locale || this.defaultLocale;
    } catch (error) {
      console.error('Erro ao carregar preferência de idioma:', error);
      this.currentLocale = this.defaultLocale;
    }

    await this.loadTranslations();
    
    this.updateInterface();
    
    return this;
  }

  async loadTranslations() {
    try {
      for (const locale of this.supportedLocales) {
        try {
          // Use the appropriate API based on browser
          const url = chrome.runtime.getURL(`assets/locales/${locale}.json`);
          const response = await fetch(url);
          
          if (response.ok) {
            this.translations[locale] = await response.json();
          } else {
            console.error(`Erro ao carregar traduções para ${locale}:`, response.statusText);
            
            // Fallback if fetch fails
            if (!this.translations[locale]) {
              this.translations[locale] = {
                general: {
                  title: "Bestiary Arena Mod Loader",
                  version: "Versão"
                },
                messages: {
                  error: "Erro",
                  noScripts: "Nenhum script adicionado",
                  noLocalMods: "Nenhum mod local disponível",
                  firefoxWarning: "Atenção: no Firefox, existe uma limitação com carregamento de Gists. Importe mods locais se possível."
                }
              };
            }
          }
        } catch (error) {
          console.error(`Erro ao carregar traduções para ${locale}:`, error);
          
          // Ensure we have at least minimal translations
          if (!this.translations[locale]) {
            this.translations[locale] = {};
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar traduções:', error);
    }
  }

  t(key, locale = null) {
    const currentLocale = locale || this.currentLocale;
    
    const keys = key.split('.');
    let translation = this.translations[currentLocale];
    
    if (!translation) {
      return key; // Return key if no translations available
    }
    
    for (const k of keys) {
      if (!translation || !translation[k]) {
        if (currentLocale !== this.defaultLocale) {
          return this.t(key, this.defaultLocale);
        }
        return key;
      }
      translation = translation[k];
    }
    
    return translation;
  }

  async setLocale(locale) {
    if (!this.supportedLocales.includes(locale)) {
      console.error(`Idioma não suportado: ${locale}`);
      return false;
    }
    
    this.currentLocale = locale;
    
    try {
      await chrome.storage.local.set({ locale });
    } catch (error) {
      console.error('Erro ao salvar preferência de idioma:', error);
    }
    
    this.updateInterface();
    
    this.onLocaleChangeCallbacks.forEach(callback => callback(locale));
    
    return true;
  }

  onLocaleChange(callback) {
    if (typeof callback === 'function') {
      this.onLocaleChangeCallbacks.push(callback);
    }
  }

  updateInterface() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      element.textContent = this.t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      element.placeholder = this.t(key);
    });
  }

  getLocale() {
    return this.currentLocale;
  }

  getSupportedLocales() {
    return this.supportedLocales.map(locale => ({
      code: locale,
      name: this.t(`language.${locale}`)
    }));
  }
}

window.i18n = new Localization();