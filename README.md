# restore-search-defaults

This extension can ask the user to set a default engine that may have been lost or changed
without user consent or intent.  It runs only once on startup of the addon.  It uses the existing
panel that asks if the user would like to set the engine as the default.  Unfortunately, that
also means that the panel will appear in the context of the currently selected tab in Firefox,
and may seem unassociated to what the user is currently doing when it runs.

The addon ID's of the search engines that should be considered for an update must be added
into the api.js file.  If a date is provided, the addon must have been installed prior to that
date to be considered.  If multiple addons are included in the list, they will be sorted by their
install date and we will check the latest installed first.  The first addon that passes several
filters will be the one we ask the user to make default.  Any later addons will not be checked.

```javascript
const lostEngines = new Map ([
  ["mySearchEngine@example.com", Date.now("Mon Nov 30 2020 13:37:55 GMT-0600")],
  ["anotherEngine@example.com", ],
]);
```

A pref is used to prevent the addon running more than once per version.  Consecutive releases of the
addon must increment the version in the manifest or it may not run again.

### filters that prevent the panel from appearing

Several requirements are in place to avoid over-presenting the set-default panel.

1. The currently selected engine MUST be the default engine Firefox configures for the currently selected locale.
2. The addon being checked MUST be enabled.
3. If a date is provided, the addon MUST have been installed prior to that date.
4. The addon MUST still have `is_default: true` in the manifest.  If it was updated at some point to remove that setting, it will not be considered.
5. The addon MUST still be loaded by the search service.

The first addon in the list that fills all these requirements will be the only addon we ask the user about.

## Simple testing to restore a blocklisted addon

When an addon is blocklisted, then updated and un-blocklisted, we do not re-enable the addon as the default choice.  This
addon helps to offer that to the user.

1. get two XPI files, one engine that has been blocklisted and it's update that is not blocklisted.
2. in about:config, disable the blocklist `extensions.blocklist.enabled`.
3. install the blocklisted addon
4. re-enable the blocklist and verify that the addon is now blocklisted.
5. install the updated addon
6. restart Firefox
7. install this addon (be sure to enter the addon ID, but leave the date undefined or use `Date.now()`)

The panel should appear asking to set the addon as the default search engine.  The test should be done three times:

* set as default
  * The pref `extensions.reset_default_search.runonce.ADDON_VERSION` is true, where ADDON_VERSION is the manifest version.
  * addon is now the default search engine
  * reloading this addon should NOT result in the panel appearing again
* dont set as default
  * The pref `extensions.reset_default_search.runonce.ADDON_VERSION` is true
  * addon is NOT the default search engine
  * reloading this addon should NOT result in the panel appearing again
* ignore the panel (e.g. click outside to close it)
  * The pref `extensions.reset_default_search.runonce.ADDON_VERSION` is not set
  * reloading this addon should result in the panel appearing again

The above does not test the date aspect of this addon.  The date should be the timestamp that the addon was blocklisted.

TODO: how to test the blocklist date.

