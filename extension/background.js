"use strict";

let lastTabID;

async function showPage(info) {
  // If we previously opened a tab close it.
  if (lastTabID !== undefined) {
    let tab = await browser.tabs.get(lastTabID).catch(() => {});
    if (tab) {
      await browser.tabs.remove(tab.id);
    }
  }
  let tab = await browser.tabs.create({ url: `searchdefault.html?id=${info.id}` });
  lastTabID = tab.id;
}

async function initialize() {
  let addons = await browser.searchDefaults.getEligibleAddonIDs();
  if (!addons?.length) {
    // If there are no potentially elligble addons, exit early.
    return;
  }

  // See if we have an enabled addon we can use now. We still
  // listen for for other enabled addons in case the page was
  // not reacted to.
  let enabled = addons.filter(a => a.enabled);
  if (enabled?.length) {
    showPage(enabled[0]);
  }

  let wasDisabled = addons.filter(a => !a.enabled).map(a => a.id);
  if (!wasDisabled?.length) {
    // If there are no potentially elligble addons, exit early.
    return;
  }

  async function listener(id) {
    let prompted = await browser.searchDefaults.wasPrompted();
    if (prompted) {
      browser.searchDefaults.onReady.removeListener(listener);
    }
    if (wasDisabled.indexOf(id) < 0 || !(await browser.searchDefaults.shouldPrompt(id))) {
      console.log(`addon ${id} is not eligible`);
      return;
    }
    showPage({ id });
  }
  // Listen for management updates
  browser.searchDefaults.onReady.addListener(listener);
}

initialize();
