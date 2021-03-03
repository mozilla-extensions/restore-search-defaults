# Restore Search Default Pings

This addon will show the search default panel to users after a specified addon is removed from the blocklist.  It
has one telemetry ping which is sent only if the panel is shown, containing only the extension id of the addon being
asked for.

- a `defaultSearchReset` ping containing the extension id.

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
