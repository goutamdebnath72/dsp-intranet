// src/lib/errorLog/clientReport.ts
//
// THE BROWSER'S HALF OF THE ERROR LOG, PRODUCTION ONLY (22 Nov 2026): a small script in <head> (so it is listening before React hydrates) sends every uncaught error and unhandled promise rejection to
// POST /api/client-errors: the message, the stack and the page's PATH (never its query, never what the person typed or saw). At most 5 different ones per page load; the server limits and groups the rest.
// Errors from a browser extension are not sent. Console messages, failed pictures and network failures are NOT sent from production (the development bridge, src/lib/dev/consoleBridge.ts, has them).

export const CLIENT_ERROR_URL = "/api/client-errors";

export const CLIENT_ERROR_SCRIPT = `(function(){
  if (window.__dspErrorReporter) return; window.__dspErrorReporter = true;
  var URL_ = ${JSON.stringify(CLIENT_ERROR_URL)}, MAX = 5, sent = {}, n = 0;
  function send(message, stack) {
    try {
      message = String(message == null ? "" : message);
      if (!message || n >= MAX) return;
      if (/-extension:\\/\\//.test(String(stack || "") + message)) return;
      var key = message.slice(0, 120) + "|" + String(stack || "").split("\\n")[1];
      if (sent[key]) return; sent[key] = 1; n++;
      var body = JSON.stringify({ message: message.slice(0, 1000), stack: String(stack || "").slice(0, 3000), page: location.pathname });
      if (navigator.sendBeacon && navigator.sendBeacon(URL_, new Blob([body], { type: "application/json" }))) return;
      if (window.fetch) fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  window.addEventListener("error", function (ev) {
    var t = ev && ev.target;
    if (t && t !== window && t.nodeName) return;
    send(ev.message || (ev.error && ev.error.message), ev.error && ev.error.stack);
  }, true);
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev && ev.reason;
    send("Unhandled promise rejection: " + (r && r.message ? r.message : String(r)), r && r.stack);
  });
})();`;
