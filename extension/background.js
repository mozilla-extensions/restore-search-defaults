

function showPage(info) {
  function tabListener(tabId, changeInfo, tab) {
    if (changeInfo.status == "complete" && tab.url == browser.runtime.getURL("searchdefault.html")) {
      browser.tabs.sendMessage(tabId, info);
      browser.tabs.onUpdated.removeListener(tabListener);
    }
  }
  browser.tabs.onUpdated.addListener(tabListener);
  browser.tabs.create({ url: "searchdefault.html" });
}

async function runStartup() {
  // Check for eligible addon on startup
  let id = await browser.searchDefaults.getEligibleAddonID();
  console.log(`got back an eligible addon id ${id}`);
  if (!id) {
    return;
  }
  let info = await browser.management.get(id);
  showPage(info);
}

async function initialize() {
  runStartup();

  // management api doesn't have a install reason, so we need
  // to ensure we only operate on currently installed and disabled
  // addons.
  let addons = await browser.management.getAll();
  let wasDisabled = addons.filter(a => !a.enabled).map(a => a.id);

  async function listener(info) {
    let prompted = await browser.searchDefaults.wasPrompted();
    if (prompted) {
      browser.management.onEnabled.removeListener(listener);
    }
    if (wasDisabled.indexOf(info.id) < 0 || !browser.searchDefaults.shouldPrompt(info.id)) {
      return;
    }
    showPage(info);
  }
  // Listen for management updates
  browser.management.onEnabled.addListener(listener);
}

initialize();
