"use strict";

function nl2br(str) {
  return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br />$2');
}

function addDescriptionBlock() {

}

let currentDiv;
function createLink(text, href) {
  console.log(`linkify text ${text} ${href}\n`);
  let node;
  if (href) {
    node = document.createElement("a");
    node.target = "_blank";
    node.href = href;
    node.text = text;
  } else {
    node = document.createTextNode(text);
  }
  currentDiv.appendChild(node);
}

let addonData;
browser.runtime.onMessage.addListener(async (data) => {
  console.log(JSON.stringify(data));
  addonData = data;
  for (let el of document.getElementsByClassName("addon-name")) {
    el.appendChild(document.createTextNode(data.name));
  };
  let description = document.getElementsByClassName("addon-description");
  let blocks = data.description.split("\n");
  for (let tn of blocks) {
    currentDiv = document.createElement("div");
    linkify(tn, { callback: createLink });
    // currentDiv.appendChild(document.createTextNode(tn));
    description[0].appendChild(currentDiv);
  }

  // Add the disabled date
  let date = await browser.searchDefaults.deactivatedDate(data.id);
  let text = new Intl.DateTimeFormat('en-US', {month: "long", year: "numeric"}).format(new Date(date));
  let dateEl = document.getElementsByClassName("addon-date");
  dateEl[0].appendChild(document.createTextNode(text));

  let icons = document.getElementsByClassName("icon");
  let iconSrc;
  for (let addonIcon of addonData.icons) {
    console.log(JSON.stringify(addonIcon));
    if (addonIcon.size == 48) {
      iconSrc = addonIcon.url;
    }
  }
  icons[0].setAttribute("src", iconSrc);
});

document.getElementById("resetSearch").addEventListener("click", event => {
  console.log(`show prompt for ${addonData.id}`);
  browser.searchDefaults.prompt(addonData.id);
});
