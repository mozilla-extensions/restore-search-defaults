
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

const { Management } = ChromeUtils.import(
  "resource://gre/modules/Extension.jsm",
  null
);

const { WebExtensionPolicy } = Cu.getGlobalForObject(Services);

XPCOMUtils.defineLazyGetter(global, "searchInitialized", () => {
  if (Services.search.isInitialized) {
    return Promise.resolve();
  }
  return ExtensionUtils.promiseObserved(
    "browser-search-service",
    (_, data) => data == "init-complete"
  );
});

const DEFAULT_SEARCH_STORE_TYPE = "default_search";
const DEFAULT_SEARCH_SETTING_NAME = "defaultSearch";

// The value at the end of this pref must be incremented if we want
// the prompt to run again after an addon update.
// If the value exists, we have ran before and will not run again.  If
// we showed the panel, the value will be true.  We do not track what
// the result of showing the panel is (ie. the user accepted or not).
const RUN_ONCE_PREF = "extensions.reset_default_search.runonce.3";
const REASON_PREF = "extensions.reset_default_search.runonce.reason";

// Basic testing:
//
// 1. Disable blocklist, remove extensions.reset_default_search.runonce pref
// 2. Install a search engine (that asks to be set as default and is blocklisted)
// 3. ensure configured default engine is selected
// 4. enable the blocklist
// 5. verify the addon is disabled
// 6. Install a newer version of addon that is not blocklisted
// 7. user should be prompted to make engine default
// 8. if yes, then the engine should become default
//
// Variants to testing:
// A. Install reset addon prior to updating to non-blocklisted addon
// B. Install reset addon after updating to non-blocklisted addon
// C. Set RUN_ONCE_PREF to false before step 6 (using A OR B otherwise)
// D. Set RUN_ONCE_PREF to true before step 6 (using A OR B otherwise)
//    * we do not expect the prompt at step 7, addon should not be set to default
//
// The blocked addon will have always been installed prior to the reset addon, so
// we do not test or expect this to work if the reset addon is installed prior to
// step 4 above.

// map of ID -> Date in milliseconds for filtering (see other comments).
//
// Date.parse("Mon Nov 30 2020 13:37:55 GMT-0600")
// Date.now()
// 1606765841594

const Feb2019 = Date.parse("2019-02-25T14:20:07Z");
const Feb2020 = Date.parse("2020-02-11T17:19:30Z");
const Oct2020 = Date.parse("2020-10-16T17:24:10Z");
const Dec2020 = Date.parse("2020-12-16T00:00:00Z");

const lostEngines = new Map ([
  ["{820847ac-fb62-47a4-a6be-00d863584c76}", Feb2019],
  ["{ec8513c5-2bcc-45b0-ae77-da6685cfafd9}", Feb2020],
  ["{443305ec-55d7-411c-bb4a-96e83b4e631e}", Feb2020],
  ["{4ae1f921-575e-4599-8b77-e8e7ab337860}", Feb2020],
  ["{90e61a54-35d6-44c8-bb33-88623e6a03ae}", Feb2020],
  ["{72dc5fd5-179b-40b6-9218-e88434939ed8}", Feb2020],
  ["{57703f70-e1b7-462d-bf7e-657bac5eb30c}", Feb2020],
  ["{f2ed910e-ab21-4ad3-a70a-8adca5e683f6}", Feb2020],
  ["{8c1d6a6c-3745-429e-8ec5-2a374320e703}", Feb2020],
  ["{c0d5c1cb-e676-4ff7-8189-793efc86fa2f}", Feb2020],
  ["{f459049d-939d-432e-83c7-07ced47e629a}", Feb2020],
  ["{2ff583b8-72a9-40bd-877b-b355ad33ce44}", Feb2020],
  ["{2dcd1f94-6a18-47c3-826a-d8f1044b3ade}", Feb2020],
  ["{f8890846-fcc1-479f-a90b-dce3e486b0ba}", Feb2020],
  ["{8c9ec486-bd7b-40dd-ab49-1ca3ff452484}", Feb2020],
  ["{527d060d-9eaa-4670-8dea-7c152f0b8dcd}", Oct2020],
  ["{b0a0f872-a93b-439d-a783-44690ee6ba4a}", Oct2020],
  ["{0362578d-c9c2-4a85-8a37-eab60242c5bb}", Oct2020],
  ["{39790485-930b-40a5-8268-69222363ff80}", Oct2020],
  ["{446c7519-9e32-4f9a-b562-447f4421ec9a}", Oct2020],
  ["{b30e775a-7a10-480d-ace4-761b9ca07aee}", Dec2020],  // Test add-on
  ["{fd299ce1-1602-4490-b659-f45504f9324c}", Date.now()], // Manual test addon for dev.
]);

function finish(event, reason, id = null) {
  // Store the reason for debugging purposes.
  Services.prefs.setCharPref(REASON_PREF, reason);
  Services.prefs.setBoolPref(RUN_ONCE_PREF, true);
  try {
    Services.telemetry.recordEvent(
      "defaultSearchReset", //category
      event, // event
      reason,
      id
    );
  } catch (err) {
    // If the telemetry throws just log the error so it doesn't break any
    // functionality.
    Cu.reportError(err);
  }
}

async function showDefaultSearchPanel(aID) {
  let defaultEngine = await Services.search.getDefault();
  if (lostEngines.has(defaultEngine?._extensionID)) {
    console.log(`reset-default-search: The default engine was already selected by the user. ${defaultEngine._extensionID}`);
    finish("skipped", "alreadyDefault");
    return;
  }

  let policy = WebExtensionPolicy.getByID(aID);
  if (!policy?.extension) {
    console.log(`reset-default-search: ${aID} is not running, cannot set as default, try again later`);
    return;
  }
  let { extension } = policy;
  let { manifest } = extension;

  let searchProvider = manifest?.chrome_settings_overrides?.search_provider;
  if (!searchProvider?.is_default) {
    // If the extension isn't asking to be default at this point, bail out.
    console.log(`reset-default-search: is_default is not requested by ${aID} ${JSON.stringify(manifest)}`);
    return false;
  }

  let engineName = searchProvider.name.trim();
  try {

  console.log(`reset-default-search: ask user to set default search engine to ${aID} ${engineName}`);
  let window = BrowserWindowTracker.getTopWindow({ allowPopups: false });
  let subject = {
    wrappedJSObject: {
      browser: window.gBrowser.selectedBrowser,
      name: extension.name,
      icon: extension.iconURL,
      currentEngine: defaultEngine.name,
      newEngine: engineName,
      async respond(allow) {
        console.log(`reset-default-search: user responded to panel with allow? ${allow}`);
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
        finish("interaction", allow ? "accepted" : "denied", extension.id);
      },
    },
  };
  console.log(`reset-default-search: notifyObservers`);
  Services.obs.notifyObservers(
    subject,
    "webextension-defaultsearch-prompt"
  );

    Services.telemetry.recordEvent(
      "defaultSearchReset",
      "interaction",
      "panelShown",
      extension.id
    );
  } catch (err) {
    // If the telemetry throws just log the error so it doesn't break any
    // functionality.
    Cu.reportError(err);
  }
}

async function shouldPromptForDefault(aID) {
  console.log(`reset-default-search: shouldPromptForDefault? ${aID}`);

  let policy = WebExtensionPolicy.getByID(aID);
  if (!policy?.extension) {
    console.log(`reset-default-search: ${aID} is not running, cannot set as default, try again later`);
    return false;
  }
  await policy.readyPromise;

  let { extension } = policy;
  let { manifest } = extension;

  let searchProvider = manifest?.chrome_settings_overrides?.search_provider;
  if (!searchProvider?.is_default) {
    // If the extension isn't asking to be default at this point, bail out.
    console.log(`reset-default-search: is_default is not requested by ${aID} ${JSON.stringify(manifest)}`);
    return false;
  }
  return true;
}

async function getEligibleAddonIDs() {
  await searchInitialized;
  let defaultEngine = await Services.search.getDefault();
  if (lostEngines.has(defaultEngine?._extensionID)) {
    console.log(`reset-default-search: The default engine was already selected by the user. ${defaultEngine._extensionID}`);
    finish("skipped", "alreadyDefault");
    return;
  }

  // Get the latest installed addon that was installed prior to it's failure date.  Any non-app
  // disabled state (ie. it is not disabled due to blocklisting) removes the addon from elibility.
  let addons = (await AddonManager.getAddonsByIDs(
      Array.from(lostEngines.keys())
    )).filter(
      a => a &&
      !a.userDisabled &&
      !a.softDisabled &&
      !a.embedderDisabled &&
      lostEngines.has(a.id) &&
      a.installDate < lostEngines.get(a.id)
    );
  if (!addons.length) {
    console.log("reset-default-search: No addons in our list are installed.");
    finish("skipped", "noAddonsEligible");
    return;
  }

  // Filter out any that are blocklisted.
  let enabledAddons = addons.filter(a => !a.appDisabled);
  console.log(`reset-default-search: enabled and eligible addons ${enabledAddons.length}`);

  // We will only ask for the latest installed engine.  We will
  // loop through the list until one of them makes it to the prompt.
  enabledAddons.sort((a, b) => b.installDate - a.installDate);
  return enabledAddons;
}

this.searchDefaults = class extends ExtensionAPI {
  onStartup() {
    console.log(`reset-default-search: starting.`);

    Services.telemetry.registerEvents("defaultSearchReset", {
      skipped: {
        methods: ["skipped"],
        objects: [
          "alreadyDefault",
          "noAddonsEligible",
          "previousRun",
        ],
        record_on_release: true,
      },
      interaction: {
        methods: ["interaction"],
        objects: [
          "accepted",
          "denied",
          "panelShown",
        ],
        record_on_release: true,
      },
    });

    // Previous pref is true if the user saw the panel. Some criteria have been
    // slighly adjusted so those that did not previously see the panel will get
    // another try.  This sets a telemetry event so we know.
    if (Services.prefs.getBoolPref(RUN_ONCE_PREF, false)) {
      console.log("reset-default-search: has already ran once and saw panel, exit.");
      finish("skipped", "previousRun")
      return;
    }
  }

  getAPI(context) {
    return {
      searchDefaults: {
        async getEligibleAddonID() {
          if (Services.prefs.getBoolPref(RUN_ONCE_PREF, false)) {
            return;
          }
          let enabledAddons = await getEligibleAddonIDs();
          return enabledAddons?.length ? enabledAddons[0].id : null;
        },
        deactivatedDate(id) {
          return lostEngines.get(id);
        },
        wasPrompted() {
          return !Services.prefs.getBoolPref(RUN_ONCE_PREF, false);
        },
        shouldPrompt(id) {
          if (Services.prefs.getBoolPref(RUN_ONCE_PREF, false) || !lostEngines.has(id)) {
            return false;
          }
          return shouldPromptForDefault(id);
        },
        prompt(id) {
          showDefaultSearchPanel(id);
        }
      },
    };
  }
};
