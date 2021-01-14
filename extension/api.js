
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

// The value at the end of this pref must be incremented if we want
// the prompt to run again after an addon update.
const RUN_ONCE_PREF = "extensions.reset_default_search.runonce.1";

// Telemetry recorded:
// The category is always defaultSearchReset
// events:
// - skipped: the panel was not shown
//   - userSelectedDefault: a default engine is user selected already
//   - noAddonsEnabled: none of the addons are installed or enabled
//   - noAddonsEligible: addon is not running or configured to be default
// - interaction: the panel is shown or the user interacts
//   - ask: the panel was requested to be shown, this does not promise a response
//   - accepted: the user selected the engine to become default
//   - denied: the user declined to set the engine as default
//     - the id of the extension is provided in the event value for all interaction events

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
// Date.parse("Mon Nov 30 2020 13:37:55 GMT-0600")
// Date.now()
// 1606765841594

const Feb2019 = Date.parse("2019-02-25T14:20:07Z");
const Feb2020 = Date.parse("2020-02-11T17:19:30Z");
const Oct2020 = Date.parse("2020-10-16T17:24:10Z");
const Dec2020 = Date.parse("2020-12-16T00:00:00Z");

const lostEngines = new Map ([
  ["{2ef58672-740c-46bd-a50d-b9880986b574}", Feb2019],
  ["{ecb03616-f3c2-4580-99dd-6a233047abdd}", Feb2019],
  ["{8387ccbe-b9ac-438d-b049-c86b30a6dacb}", Feb2019],
  ["{7ff51e81-f4b1-4682-9f45-43a771d80748}", Feb2019],
  ["{820847ac-fb62-47a4-a6be-00d863584c76}", Feb2019],
  ["{ec8513c5-2bcc-45b0-ae77-da6685cfafd9}", Feb2020],
  ["{443305ec-55d7-411c-bb4a-96e83b4e631e}", Feb2020],
  ["{25f17283-8325-42fb-812e-193c8de90b04}", Feb2020],
  ["{43d20840-2895-4866-9d79-4f6f2ea537f7}", Feb2020],
  ["{ff5dfca6-4e75-4882-a145-b58a4afc35a7}", Feb2020],
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
  ["{3d66c55b-ed06-47fe-a823-d49301568ad3}", Oct2020],
  ["{527d060d-9eaa-4670-8dea-7c152f0b8dcd}", Oct2020],
  ["{ab64584a-98db-4661-b14a-d6286aed36b2}", Oct2020],
  ["{b0a0f872-a93b-439d-a783-44690ee6ba4a}", Oct2020],
  ["{fd299ce1-1602-4490-b659-f45504f9324c}", Oct2020],
  ["{2451ecb9-6260-4564-a546-8532f04b587a}", Oct2020],
  ["{0362578d-c9c2-4a85-8a37-eab60242c5bb}", Oct2020],
  ["{39790485-930b-40a5-8268-69222363ff80}", Oct2020],
  ["{446c7519-9e32-4f9a-b562-447f4421ec9a}", Oct2020],
  ["{b30e775a-7a10-480d-ace4-761b9ca07aee}", Dec2020],  // Test add-on
]);

this.search = class extends ExtensionAPI {
  async onStartup() {
    // We only run this once, after which we bail out.
    if (Preferences.get(RUN_ONCE_PREF, false)) {
      return;
    }
    Services.telemetry.registerEvents("defaultSearchReset", {
      skipped: {
        methods: ["skipped"],
        objects: [
          "userSelectedDefault",
          "noAddonsEnabled",
          "noAddonsEligible",
        ],
        record_on_release: true,
      },
      interaction: {
        methods: ["interaction"],
        objects: [
          "accepted",
          "denied",
          "ask",
        ],
        record_on_release: true,
      },
    });

    function finish(event, reason, id = null) {
      Preferences.set(RUN_ONCE_PREF, true);
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

    // If the selected default is not the configured default for this region/locale, the
    // user has changed default and we should not re-prompt.
    let defaultEngine = await Services.search.getDefault();
    let configuredDefault = await Services.search.originalDefaultEngine;
    if (defaultEngine.name !== configuredDefault.name) {
      console.log("reset-default-search: The default engine was already selected by the user.");
      finish("skipped", "userSelectedDefault");
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
      finish("skipped", "noAddonsEnabled");
      return;
    }

    // Filter out any that are blocklisted.
    let enabledAddons = addons.filter(a => !a.appDisabled);

    // We will only ask for the latest installed engine.  We will
    // loop through the list until one of them makes it to the prompt.
    enabledAddons.sort((a, b) => b.installDate - a.installDate);
    for (let addon of enabledAddons) {
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
            finish("interaction", allow ? "accepted" : "denied", extension.id);
          },
        },
      };
      Services.obs.notifyObservers(
        subject,
        "webextension-defaultsearch-prompt"
      );
      try {
        Services.telemetry.recordEvent(
          "defaultSearchReset",
          "interaction",
          "ask",
          extension.id
        );
      } catch (err) {
        // If the telemetry throws just log the error so it doesn't break any
        // functionality.
        Cu.reportError(err);
      }
      // We only prompt for the first addon that makes it here.  If the user does
      // not respond to the panel, they will be asked again on next startup.
      return;
    }
    // If we made it here, no addon was currently eligible.  If any addons were
    // blocklisted we will want to be able to prompt when it is released from
    // the blocklist.
    if (enabledAddons.length == addons.length) {
      finish("skipped", "noAddonsEligible");
    }
  }
};
