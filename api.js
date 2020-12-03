
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "ExtensionSettingsStore",
  "resource://gre/modules/ExtensionSettingsStore.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "AddonManager",
  "resource://gre/modules/AddonManager.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "BrowserWindowTracker",
  "resource:///modules/BrowserWindowTracker.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "Preferences",
  "resource://gre/modules/Preferences.jsm"
);

const { WebExtensionPolicy } = Cu.getGlobalForObject(Services);

const DEFAULT_SEARCH_STORE_TYPE = "default_search";
const DEFAULT_SEARCH_SETTING_NAME = "defaultSearch";

const RUN_ONCE_PREF = "extensions.reset_default_search.runonce";

// Basic testing:
// Install a search engine (that asks to be set as default)
// ensure configured default engine is selected
// disable the search engine
// restart firefox
// enable the search engine
// add engine ID below
// install this addon
// user should be prompted to make engine default
// if yes, then the engine should become default

// map of ID -> Date in milliseconds for filtering (see other comments).
//
// new Date("Mon Nov 30 2020 13:37:55 GMT-0600")
// Date.now()
// 1606765841594

const lostEngines = new Map ([
  ["{2451ecb9-6260-4564-a546-8532f04b587a}", Date.now()],
]);

this.search = class extends ExtensionAPI {
  async onStartup() {
    let prefName = `${RUN_ONCE_PREF}.${this.extension.manifest.version}`;
    // We only run this once, after which we bail out.
    if (Preferences.get(prefName, false)) {
      return;
    }

    function finish() {
      Preferences.set(prefName, true);
    }

    // If the selected default is not the configured default for this region/locale, the
    // user has changed default and we should not re-prompt.
    let defaultEngine = await Services.search.getDefault();
    let configuredDefault = await Services.search.originalDefaultEngine;
    if (defaultEngine.name !== configuredDefault.name) {
      console.log("reset-default-search: The default engine was already selected by the user.");
      finish();
      return;
    }

    // Get the latest installed addon that was installed prior to it's failure date.
    let addons = (await AddonManager.getAddonsByIDs(
        Array.from(lostEngines.keys())
      )).filter(a => {
        let beforeDate = lostEngines.get(a.id);
        return a && !a.userDisabled && (!beforeDate || a.installDate < beforeDate)
      });
    if (!addons.length) {
      console.log("reset-default-search: No addons in our list are installed.");
      finish();
      return;
    }

    // We will only ask for the latest installed engine.  We will
    // loop through the list until one of them makes it to the prompt.

    addons.sort((a, b) => a.installDate - b.installDate);
    for (let addon of addons) {
      console.log(`reset-default-search: reset search engine to ${addon.id}`);

      let policy = WebExtensionPolicy.getByID(addon.id);
      if (!policy?.extension) {
        console.log("reset-default-search: extension is not running, cannot set as default");
        continue;
      }
      let { extension } = policy;
      let { manifest } = extension;

      let searchProvider = manifest?.chrome_settings_overrides?.search_provider;
      if (!searchProvider?.is_default) {
        // If the extension isn't asking to be default at this point, bail out.
        console.log("reset-default-search: is_default is not requested by the addon");
        continue;
      }

      // If SearchService does not have the engine, something else has removed it,
      // we shouldn't proceed at this point.
      let engineName = searchProvider.name.trim();
      let engine = Services.search.getEngineByName(engineName);
      if (!engine) {
        console.log("reset-default-search: engine is not configured in search");
        continue;
      }

      console.log(`reset-default-search: ask user to set default search engine to ${addon.id}`);
      let window = BrowserWindowTracker.getTopWindow({ allowPopups: false });
      let subject = {
        wrappedJSObject: {
          browser: window.gBrowser.selectedBrowser,
          name: extension.name,
          icon: extension.iconURL,
          currentEngine: defaultEngine.name,
          newEngine: engineName,
          async respond(allow) {
            if (allow) {
              await ExtensionSettingsStore.initialize();
              ExtensionSettingsStore.addSetting(
                extension.id,
                DEFAULT_SEARCH_STORE_TYPE,
                DEFAULT_SEARCH_SETTING_NAME,
                engineName,
                () => defaultEngine.name
              );
              Services.search.defaultEngine = Services.search.getEngineByName(
                engineName
              );
            }
            // Remember that we have completed.
            finish();
          },
        },
      };
      Services.obs.notifyObservers(
        subject,
        "webextension-defaultsearch-prompt"
      );
      // We only prompt for the first addon that makes it here.  If the user does
      // not respond to the panel, they will be asked again on next startup.
      return;
    }
    // If we made it here, no addon was eligible.
    finish();
  }
};
