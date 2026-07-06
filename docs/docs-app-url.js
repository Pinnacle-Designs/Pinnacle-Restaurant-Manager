/**
 * Resolve the Pinnacle app URL and wire [data-app-link] anchors on docs pages.
 * Loaded on all marketing pages; live-demo.js adds the hero embed on index only.
 */
(function () {
  var DEFAULT_PATH = "/dashboard";
  var PROBE_PORTS = ["3000", "3001", "3002", "3003", "3004", "3005", "3006"];
  var PROBE_TIMEOUT_MS = 1200;

  function isLocalHost() {
    var host = location.hostname;
    return host === "localhost" || host === "127.0.0.1" || location.protocol === "file:";
  }

  function isDocsOnNextApp() {
    var port = location.port || (location.protocol === "https:" ? "443" : "80");
    return (
      location.pathname.indexOf("/docs") === 0 &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
      PROBE_PORTS.indexOf(port) !== -1
    );
  }

  function isDocsOnAppOrigin() {
    if (location.pathname.indexOf("/docs") !== 0) return false;
    var cfg = window.PINNACLE_CONFIG || {};
    var configured = (cfg.appUrl || "").replace(/\/$/, "");
    return !!(configured && location.origin === configured);
  }

  function localDevHost() {
    return location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
  }

  function defaultLocalAppUrl() {
    return "http://" + localDevHost() + ":3000";
  }

  function probeEmbedUrl(base) {
    var url =
      base.replace(/\/$/, "") +
      "/api/embed/launch?path=" +
      encodeURIComponent(DEFAULT_PATH);
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, PROBE_TIMEOUT_MS * 3)
      : null;

    return fetch(url, {
      method: "GET",
      credentials: "omit",
      redirect: "manual",
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        var normalized = base.replace(/\/$/, "");
        if (res.status >= 200 && res.status < 400) {
          return normalized;
        }
        return "";
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        return "";
      });
  }

  function probeLocalAppUrl() {
    var host = location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && location.protocol === "file:") {
      host = "localhost";
    }
    if (host !== "localhost" && host !== "127.0.0.1") return Promise.resolve("");

    var ports = PROBE_PORTS.slice();
    var currentPort = location.port;
    if (currentPort && ports.indexOf(currentPort) !== -1) {
      ports.splice(ports.indexOf(currentPort), 1);
      ports.unshift(currentPort);
    }

    return ports
      .reduce(function (chain, port) {
        return chain.then(function (found) {
          if (found) return found;
          return probeEmbedUrl("http://" + host + ":" + port);
        });
      }, Promise.resolve(""))
      .then(function (found) {
        return found || "";
      });
  }

  function resolveAppUrl() {
    var cfg = window.PINNACLE_CONFIG || {};
    var configured = (cfg.appUrl || "").replace(/\/$/, "");

    if (isDocsOnNextApp()) {
      return probeEmbedUrl(location.origin).then(function (ok) {
        if (ok) return location.origin;
        return probeLocalAppUrl().then(function (found) {
          return found || location.origin;
        });
      });
    }

    if (isDocsOnAppOrigin()) {
      return probeEmbedUrl(location.origin).then(function (ok) {
        return ok ? location.origin : configured || location.origin;
      });
    }

    if (isLocalHost()) {
      if (configured) {
        return probeEmbedUrl(configured).then(function (ok) {
          if (ok) return configured;
          return probeLocalAppUrl().then(function (found) {
            return found || configured || defaultLocalAppUrl();
          });
        });
      }
      return probeLocalAppUrl().then(function (found) {
        return found || defaultLocalAppUrl();
      });
    }

    if (configured) return Promise.resolve(configured);

    return Promise.resolve("");
  }

  function wireOptionalAppLinks(base) {
    document.querySelectorAll("[data-app-link]").forEach(function (el) {
      if (base) {
        el.setAttribute("href", base + (el.getAttribute("data-app-link") || "/"));
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
  }

  function initPageLinks() {
    resolveAppUrl().then(function (url) {
      if (url) wireOptionalAppLinks(url);
    });
  }

  function initDocsCommon() {
    initPageLinks();
    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();
  }

  window.PINNACLE_DOCS = {
    resolveAppUrl: resolveAppUrl,
    wireOptionalAppLinks: wireOptionalAppLinks,
    initPageLinks: initPageLinks,
    probeEmbedUrl: probeEmbedUrl,
    PROBE_PORTS: PROBE_PORTS,
    localDevHost: localDevHost,
    isLocalHost: isLocalHost,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDocsCommon);
  } else {
    initDocsCommon();
  }
})();
