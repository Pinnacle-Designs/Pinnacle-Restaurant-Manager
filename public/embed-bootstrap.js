(function () {
  try {
    var params = new URLSearchParams(location.search);
    var st = params.get("_st");
    var embed = params.get("embed");
    if (!st || !embed || (embed !== "mobile" && embed !== "full" && embed !== "1")) return;

    window.__PINNACLE_EMBED_ST__ = st;

    if (window.__PINNACLE_FETCH_PATCHED__) return;
    window.__PINNACLE_FETCH_PATCHED__ = true;

    var originalFetch = window.fetch.bind(window);

    function withEmbedAuth(url, init) {
      init = init ? Object.assign({}, init) : {};
      init.credentials = init.credentials || "include";

      var headers = new Headers(init.headers);
      if (!headers.has("authorization")) {
        headers.set("Authorization", "Bearer " + st);
      }
      init.headers = headers;

      if (typeof url === "string" && url.indexOf("/api/") === 0 && url.indexOf("_st=") === -1) {
        var sep = url.indexOf("?") === -1 ? "?" : "&";
        url = url + sep + "_st=" + encodeURIComponent(st);
      }

      return { url: url, init: init };
    }

    window.fetch = function (input, init) {
      if (typeof input === "string" && input.indexOf("/api/") === 0) {
        var patched = withEmbedAuth(input, init);
        return originalFetch(patched.url, patched.init);
      }

      if (input instanceof Request) {
        try {
          var parsed = new URL(input.url, location.origin);
          if (parsed.origin === location.origin && parsed.pathname.indexOf("/api/") === 0) {
            var reqPatched = withEmbedAuth(parsed.pathname + parsed.search, init);
            return originalFetch(new Request(reqPatched.url, input), reqPatched.init);
          }
        } catch (e) {
          /* ignore */
        }
      }

      return originalFetch(input, init);
    };

    function notifyEmbedParentReady() {
      try {
        if (window.parent === window) return;
        var path = location.pathname;
        if (path === "/api/embed/launch" || path === "/embed") return;
        window.parent.postMessage(
          { type: "pinnacle-embed-ready", path: path },
          location.origin
        );
      } catch (e) {
        /* ignore */
      }
    }

    notifyEmbedParentReady();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", notifyEmbedParentReady);
    }
    window.addEventListener("load", notifyEmbedParentReady);
  } catch (e) {
    /* ignore */
  }
})();
