/**
 * Live demo for the docs marketing site — embeds the real Next.js app
 * via /api/embed/launch (server-side demo bootstrap).
 */
(function () {
  var DEFAULT_PATH = "/dashboard";
  var PROBE_PORTS = ["3000", "3001", "3002", "3003", "3004", "3005"];
  var PROBE_TIMEOUT_MS = 1200;

  function isLocalHost() {
    var host = location.hostname;
    return host === "localhost" || host === "127.0.0.1" || location.protocol === "file:";
  }

  /** Docs served by the Next app on a dev port (not Live Server). */
  function isDocsOnNextApp() {
    var port = location.port || (location.protocol === "https:" ? "443" : "80");
    return (
      location.pathname.indexOf("/docs") === 0 &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
      PROBE_PORTS.indexOf(port) !== -1
    );
  }

  /** Docs and app on the same deployment (e.g. Vercel /docs). */
  function isDocsOnAppOrigin() {
    if (location.pathname.indexOf("/docs") !== 0) return false;
    var cfg = window.PINNACLE_CONFIG || {};
    var configured = (cfg.appUrl || "").replace(/\/$/, "");
    if (configured && location.origin === configured) return true;
    if (!isLocalHost() && location.protocol.startsWith("http")) return true;
    return false;
  }

  function localDevHost() {
    return location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
  }

  function defaultLocalAppUrl() {
    return "http://" + localDevHost() + ":3000";
  }

  function probeBaseUrl(base) {
    var url = base.replace(/\/$/, "") + "/api/auth/login";
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, PROBE_TIMEOUT_MS)
      : null;

    return fetch(url, {
      method: "GET",
      credentials: "omit",
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        return res.ok ? base.replace(/\/$/, "") : "";
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

    return Promise.all(
      PROBE_PORTS.map(function (port) {
        return probeBaseUrl("http://" + host + ":" + port);
      })
    ).then(function (results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i]) return results[i];
      }
      return "";
    });
  }

  function resolveAppUrl() {
    var cfg = window.PINNACLE_CONFIG || {};
    var configured = (cfg.appUrl || "").replace(/\/$/, "");

    if (isDocsOnNextApp() || isDocsOnAppOrigin()) {
      return Promise.resolve(location.origin);
    }

    if (isLocalHost()) {
      return probeLocalAppUrl().then(function (found) {
        return found || defaultLocalAppUrl();
      });
    }

    if (configured) return Promise.resolve(configured);

    return Promise.resolve("");
  }

  function embedLaunchUrl(base, path) {
    return base + "/api/embed/launch?path=" + encodeURIComponent(path || DEFAULT_PATH);
  }

  function createLoadingOverlay(message, sub) {
    var el = document.createElement("div");
    el.className = "hero-app-loading";
    el.innerHTML =
      '<div class="hero-app-loading-inner">' +
      '<div class="hero-app-spinner" aria-hidden="true"></div>' +
      "<p>" + (message || "Starting demo…") + "</p>" +
      '<p class="hero-app-loading-sub">' +
      (sub || "Seeding menu, staff, orders & analytics") +
      "</p>" +
      "</div>";
    return el;
  }

  function createFallback(message) {
    var wrap = document.createElement("div");
    wrap.className = "hero-app-fallback";
    wrap.innerHTML =
      "<h3>Demo could not start</h3>" +
      "<p>" +
      (message ||
        "Run <code>npm run dev</code>, then open <code>http://localhost:3000/docs</code> " +
          "(or set <code>appUrl</code> in <code>docs/config.js</code>).") +
      "</p>" +
      '<button type="button" class="btn btn-primary hero-app-retry">Retry</button>';
    return wrap;
  }

  function showEmbedError(container, message) {
    if (!container) return;
    container.innerHTML = "";
    container.appendChild(createFallback(message));
  }

  function mountLiveEmbed(container, appUrl, options) {
    if (!container || !appUrl) return null;

    var path = (options && options.path) || DEFAULT_PATH;
    var candidates = (options && options.candidates) || [appUrl];
    var candidateIndex = Math.max(
      0,
      candidates.indexOf(appUrl) >= 0 ? candidates.indexOf(appUrl) : 0
    );
    var activeUrl = candidates[candidateIndex] || appUrl;
    var src = embedLaunchUrl(activeUrl, path);
    var ready = false;
    var failed = false;
    var iframeKey = 0;
    var loadCount = 0;
    var rotateTimer = null;
    var errorTimer = null;

    function markReady(loading) {
      if (ready || failed) return;
      ready = true;
      if (rotateTimer) clearTimeout(rotateTimer);
      if (errorTimer) clearTimeout(errorTimer);
      if (loading && loading.parentNode) loading.remove();
    }

    function markFailed(loading, message) {
      if (ready || failed) return;
      failed = true;
      if (rotateTimer) clearTimeout(rotateTimer);
      if (errorTimer) clearTimeout(errorTimer);
      showEmbedError(container, message);
    }

    function tryNextCandidate(iframe, loading) {
      if (ready || candidateIndex >= candidates.length - 1) return;
      candidateIndex += 1;
      activeUrl = candidates[candidateIndex];
      src = embedLaunchUrl(activeUrl, path);
      loadCount = 0;
      iframeKey += 1;
      iframe.src = src + "&_=" + iframeKey;
      if (loading && loading.parentNode) {
        loading.querySelector("p").textContent = "Connecting on port " + activeUrl.split(":").pop() + "…";
      }
      rotateTimer = setTimeout(function () {
        tryNextCandidate(iframe, loading);
      }, 5000);
    }

    function render() {
      container.innerHTML = "";
      ready = false;
      failed = false;
      loadCount = 0;
      if (rotateTimer) clearTimeout(rotateTimer);

      var wrap = document.createElement("div");
      wrap.className = "hero-app-iframe-wrap";

      var loading = createLoadingOverlay();
      wrap.appendChild(loading);

      var iframe = document.createElement("iframe");
      iframe.className = "hero-app-iframe";
      iframe.title = "Pinnacle Restaurant Manager — Live Demo";
      iframe.src = src + (iframeKey ? "&_=" + iframeKey : "");
      iframe.setAttribute("allow", "clipboard-write");

      iframe.addEventListener("load", function () {
        if (ready || failed) return;
        loadCount += 1;
        try {
          var frameWin = iframe.contentWindow;
          var search = frameWin && frameWin.location ? frameWin.location.search : "";
          var framePath = frameWin && frameWin.location ? frameWin.location.pathname : "";
          if (framePath === "/api/embed/launch" && loadCount >= 2) {
            markFailed(
              loading,
              "The app server returned an error starting the demo. If this is production, redeploy after the latest database fix."
            );
            return;
          }
          if (
            framePath !== "/embed" &&
            framePath !== "/api/embed/launch" &&
            (search.indexOf("embed=1") !== -1 ||
              framePath === "/dashboard" ||
              framePath === "/login")
          ) {
            markReady(loading);
          }
        } catch (err) {
          if (loadCount >= 2) {
            markReady(loading);
          }
        }
      });

      wrap.appendChild(iframe);
      container.appendChild(wrap);

      if (candidates.length > 1) {
        rotateTimer = setTimeout(function () {
          if (!ready) tryNextCandidate(iframe, loading);
        }, 5000);
      }

      errorTimer = setTimeout(function () {
        if (!ready && !failed) {
          markFailed(
            loading,
            "Timed out connecting to the live app. Run <code>npm run dev</code> and open <code>http://localhost:3000/docs</code> (or the port shown in the terminal)."
          );
        }
      }, 20000);

      setTimeout(function () {
        markReady(loading);
      }, 45000);

      return {
        reload: function () {
          iframeKey += 1;
          render();
        },
      };
    }

    return render();
  }

  function initHeroDemo() {
    var heroSlot = document.getElementById("hero-app-embed");
    var expandBtn = document.getElementById("hero-embed-expand");
    var modal = document.getElementById("app-embed-modal");
    var modalBody = document.getElementById("app-embed-modal-body");
    var modalBackdrop = document.getElementById("app-embed-modal-backdrop");
    var closeBtn = document.getElementById("app-embed-close");

    if (!heroSlot) return;

    var appUrl = "";
    var heroController = null;
    var modalController = null;

    function showFindingApp() {
      heroSlot.innerHTML = "";
      heroSlot.appendChild(
        createLoadingOverlay("Finding local app…", "Checking dev server ports")
      );
    }

    function buildCandidates(url) {
      var list = [];
      if (url) list.push(url);
      if (isLocalHost()) {
        PROBE_PORTS.forEach(function (port) {
          var candidate = "http://" + localDevHost() + ":" + port;
          if (list.indexOf(candidate) === -1) list.push(candidate);
        });
      }
      return list;
    }

    function mountHero() {
      if (!appUrl) {
        heroSlot.innerHTML = "";
        heroSlot.appendChild(
          createFallback(
            "Set <code>appUrl</code> in <code>docs/config.js</code> to your deployed Pinnacle URL."
          )
        );
        return;
      }
      heroController = mountLiveEmbed(heroSlot, appUrl, {
        path: DEFAULT_PATH,
        candidates: buildCandidates(appUrl),
      });
    }

    function connectApp() {
      showFindingApp();
      return resolveAppUrl().then(function (url) {
        if (!url && isLocalHost()) {
          url = defaultLocalAppUrl();
        }
        appUrl = url;
        mountHero();
        wireOptionalAppLinks(appUrl);
        return url;
      });
    }

    function openModal() {
      if (!modal || !modalBody || !appUrl) return;
      modalController = mountLiveEmbed(modalBody, appUrl, {
        path: DEFAULT_PATH,
        candidates: buildCandidates(appUrl),
      });
      modal.classList.add("open");
      document.body.classList.add("modal-open");
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove("open");
      document.body.classList.remove("modal-open");
      if (modalBody) modalBody.innerHTML = "";
      modalController = null;
    }

    connectApp();

    if (expandBtn) {
      expandBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!appUrl) {
          connectApp().then(function (url) {
            if (!url) {
              alert(
                "Live app not reachable. Run npm run dev in the project root, then reload this page."
              );
              return;
            }
            openModal();
          });
          return;
        }
        openModal();
      });
    }

    if (closeBtn)
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeModal();
      });
    if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }
    var panel = modal && modal.querySelector(".app-embed-modal-panel");
    if (panel) {
      panel.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && modal.classList.contains("open")) closeModal();
    });

    heroSlot.addEventListener("click", function (e) {
      var retry = e.target.closest(".hero-app-retry");
      if (retry) connectApp();
    });
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

  function initNav() {
    var toggle = document.getElementById("nav-toggle");
    var mobile = document.getElementById("nav-mobile");
    if (toggle && mobile) {
      toggle.addEventListener("click", function () {
        mobile.classList.toggle("open");
      });
      mobile.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          mobile.classList.remove("open");
        });
      });
    }
  }

  function init() {
    initHeroDemo();
    initNav();
    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
