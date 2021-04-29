# Restore Search Default Pings

This addon will show the search default panel to users after a specified addon is removed from the blocklist.  

There are a number of events that are recorded that indicate reasons the panel is shown or not, and whether
the user accepted or denied the change to the default search setting.

- `defaultSearchReset`
  - `interaction` indicates UI interaction and user response
    - `accepted` user has accepted the change, extension id is included
    - `denied` user has denied the change, extension id is included
    - `panelShown` the panel is being shown to the user, extension id is included
    - `tryLater` we will try the interaction later if there are potential elible addons
  - `skipped` indicates we have tried and will no longer try to show the panel
    - `alreadyDefault` an eligible addon is already the default search
    - `noAddonsEnabled` there are no addons, or they have been disabled by the user
    - `noAddonsEligible` there are no addons that fit the criteria to show the panel
    - `previousRun` the panel was shown in a previous version of the reset addon
    - `userSelectedDefault` the user has selected a specific search default, we do not override that choice

## Example log entry

```js
"dynamic": {
  "events": [
    [
      379189,
      "defaultSearchReset",
      "interaction",
      "panelShown",
      "extension-id@example.com"
    ]
  ]
},
```
