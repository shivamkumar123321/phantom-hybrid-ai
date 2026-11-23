# Hosted AI Companion Bridge

PHANTOM runs Firebase AI Logic and the Chrome Prompt API inside a Firebase-hosted React web app (**AI Companion**) and connects it to the extension via an origin-restricted `externally_connectable` bridge, rather than running AI inside the extension's MV3 service worker or an offscreen document. Chrome's Prompt API is not supported in Web Workers, and Firebase App Check requires a real authorized web origin rather than a `chrome-extension://` origin.
