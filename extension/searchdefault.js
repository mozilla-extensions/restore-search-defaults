"use strict";

let addonData;
window.onload = async () => {
  let params = new URLSearchParams(window.location.search);

  addonData = await browser.management.get(params.get("id"));
  for (let el of document.getElementsByClassName("addon-name")) {
    el.appendChild(document.createTextNode(addonData.name));
  };
  let description = document.getElementsByClassName("addon-description");
  let blocks = addonData.description.split("\n");
  for (let tn of blocks) {
    let div = document.createElement("div");
    div.appendChild(document.createTextNode(tn));
    description[0].appendChild(div);
  }

  // Add the disabled date
  let date = await browser.searchDefaults.deactivatedDate(addonData.id);
  let text = new Intl.DateTimeFormat('en-US', {month: "long", year: "numeric"}).format(new Date(date));
  let dateEl = document.getElementsByClassName("addon-date");
  dateEl[0].appendChild(document.createTextNode(text));

  let icons = document.getElementsByClassName("icon");
  let addonIcons = addonData.icons.sort((a, b) => { return a.size < b.size; });
  let iconSrc = addonIcons[0].url;
  for (let addonIcon of addonData.icons) {
    if (addonIcon.size == 48) {
      iconSrc = addonIcon.url;
    }
  }
  icons[0].setAttribute("src", iconSrc);
  browser.searchDefaults.prompted(addonData.id);
};

async function promptResult(accept) {
  browser.searchDefaults.promptResult(addonData.id, accept);
  let tab = await browser.tabs.getCurrent();
  browser.tabs.remove(tab.id);
}

document.getElementById("resetSearch").addEventListener("click", async (event) => {
  promptResult(true);
});

document.getElementById("close").addEventListener("click", async (event) => {
  promptResult(false);
});
