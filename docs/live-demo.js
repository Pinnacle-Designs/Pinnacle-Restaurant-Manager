/**
 * Live demo for the docs marketing site — embeds the real Next.js app
 * via /api/embed/launch (server-side demo bootstrap).
 *
 * Requires docs-app-url.js (PINNACLE_DOCS) for URL resolution and app links.
 * Only initialize on pages that include #hero-app-embed (index.html).
 */
(function () {
  var docs = window.PINNACLE_DOCS;
  if (!docs) {
    console.error("live-demo.js requires docs-app-url.js to load first");
    return;
  }

  var DEFAULT_PATH = "/dashboard";
  var PROBE_PORTS = docs.PROBE_PORTS;
  var EMBED_READY_MESSAGE_TYPE = "pinnacle-embed-ready";

  function isProductionSite() {
    return !docs.isLocalHost() && location.protocol.startsWith("http");
  }

  function devTimeoutMessage(activeUrl) {
    return (
      "Connection failed — no app responded at <code>" +
      activeUrl +
      "</code>. Run <code>npm run dev</code>, note the port in the terminal (e.g. 3001), then open <code>http://localhost:PORT</code> or <code>/docs</code> on that same port."
    );
  }

  function productionErrorMessage() {
    return (
      "The live demo could not start on the deployed server. " +
      "Redeploy the latest code to Vercel — the site is currently returning a server error."
    );
  }

  function embedLaunchUrl(base, path, chrome) {
    var url =
      base +
      "/api/embed/launch?path=" +
      encodeURIComponent(path || DEFAULT_PATH) +
      "&chrome=" +
      (chrome === "full" ? "full" : "mobile");
    return url;
  }

  function iframeHasEmbed(search) {
    return (
      search.indexOf("embed=mobile") !== -1 ||
      search.indexOf("embed=full") !== -1 ||
      search.indexOf("embed=1") !== -1
    );
  }

  function iframeEmbedReady(path, search) {
    if (!path || path === "/embed" || path === "/api/embed/launch") return false;
    if (iframeHasEmbed(search)) return true;
    if (path === "/dashboard" || path === "/login") return true;
    return search.indexOf("_st=") !== -1;
  }

  function trustedEmbedOrigin(origin) {
    if (!origin) return false;
    if (origin === location.origin) return true;
    var cfg = window.PINNACLE_CONFIG || {};
    var configured = (cfg.appUrl || "").replace(/\/$/, "");
    if (configured) {
      try {
        if (origin === new URL(configured).origin) return true;
      } catch (err) {
        /* ignore */
      }
    }
    return false;
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
    var chrome = (options && options.chrome) || "mobile";
    var candidates = (options && options.candidates) || [appUrl];
    var candidateIndex = Math.max(
      0,
      candidates.indexOf(appUrl) >= 0 ? candidates.indexOf(appUrl) : 0
    );
    var activeUrl = candidates[candidateIndex] || appUrl;
    var src = embedLaunchUrl(activeUrl, path, chrome);
    var ready = false;
    var failed = false;
    var iframeKey = 0;
    var loadCount = 0;
    var rotateTimer = null;
    var errorTimer = null;
    var detachReadyMessage = function () {};

    function markReady(loading) {
      if (ready || failed) return;
      detachReadyMessage();
      ready = true;
      if (rotateTimer) clearTimeout(rotateTimer);
      if (errorTimer) clearTimeout(errorTimer);
      if (loading && loading.parentNode) loading.remove();
    }

    function markFailed(loading, message) {
      if (ready || failed) return;
      detachReadyMessage();
      failed = true;
      if (rotateTimer) clearTimeout(rotateTimer);
      if (errorTimer) clearTimeout(errorTimer);
      showEmbedError(container, message);
    }

    function tryNextCandidate(iframe, loading) {
      if (ready || candidateIndex >= candidates.length - 1) return;
      candidateIndex += 1;
      activeUrl = candidates[candidateIndex];
      src = embedLaunchUrl(activeUrl, path, chrome);
      loadCount = 0;
      iframeKey += 1;
      iframe.src = src + "&_=" + iframeKey;
      if (loading && loading.parentNode) {
        loading.querySelector("p").textContent = "Connecting on port " + activeUrl.split(":").pop() + "…";
      }
      rotateTimer = setTimeout(function () {
        tryNextCandidate(iframe, loading);
      }, 3000);
    }

    function render() {
      container.innerHTML = "";
      detachReadyMessage();
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

      function handleReadyMessage(event) {
        if (!event.data || event.data.type !== EMBED_READY_MESSAGE_TYPE) return;
        if (!trustedEmbedOrigin(event.origin)) return;
        markReady(loading);
      }

      detachReadyMessage = function () {
        window.removeEventListener("message", handleReadyMessage);
      };
      window.addEventListener("message", handleReadyMessage);

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
              isProductionSite()
                ? productionErrorMessage()
                : "The app server returned an error starting the demo on <code>" +
                    activeUrl +
                    "</code>. Try another port or redeploy."
            );
            return;
          }
          if (iframeEmbedReady(framePath, search)) {
            markReady(loading);
            return;
          }
        } catch (err) {
          if (loadCount >= 1) {
            setTimeout(function () {
              if (!ready && !failed) markReady(loading);
            }, 1200);
          }
        }
      });

      wrap.appendChild(iframe);
      container.appendChild(wrap);

      if (candidates.length > 1) {
        rotateTimer = setTimeout(function () {
          if (!ready) tryNextCandidate(iframe, loading);
        }, 3000);
      }

      errorTimer = setTimeout(function () {
        if (!ready && !failed) {
          markFailed(
            loading,
            isProductionSite() ? productionErrorMessage() : devTimeoutMessage(activeUrl)
          );
        }
      }, 35000);

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
      if (docs.isLocalHost()) {
        PROBE_PORTS.forEach(function (port) {
          var candidate = "http://" + docs.localDevHost() + ":" + port;
          if (list.indexOf(candidate) === -1) list.push(candidate);
        });
      }
      return list;
    }

    function preferredChrome() {
      return window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "full";
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
        chrome: "mobile",
        candidates: buildCandidates(appUrl),
      });
    }

    function connectApp() {
      showFindingApp();
      return docs.resolveAppUrl().then(function (url) {
        appUrl = url;
        if (!appUrl) {
          heroSlot.innerHTML = "";
          heroSlot.appendChild(
            createFallback(
              "Connection failed — run <code>npm run dev</code>, then open this page on the same port shown in the terminal (e.g. <code>http://localhost:3001</code> or <code>/docs</code>)."
            )
          );
          return "";
        }
        mountHero();
        docs.wireOptionalAppLinks(appUrl);
        return url;
      });
    }

    function openModal() {
      if (!modal || !modalBody || !appUrl) return;
      modalController = mountLiveEmbed(modalBody, appUrl, {
        path: DEFAULT_PATH,
        chrome: preferredChrome(),
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

    connectApp().catch(function (err) {
      console.error("Live demo failed to start:", err);
      heroSlot.innerHTML = "";
      heroSlot.appendChild(
        createFallback(
          isProductionSite()
            ? productionErrorMessage()
            : "Demo failed to start. Stop other <code>npm run dev</code> instances, restart on one port, then reload."
        )
      );
    });

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

    var tryDemoBtn = document.getElementById("hero-try-demo-btn");
    if (tryDemoBtn) {
      tryDemoBtn.addEventListener("click", function () {
        var wrap = document.getElementById("hero-app-embed-wrap");
        if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "center" });
        if (!appUrl) {
          connectApp();
          return;
        }
        if (heroController && heroController.reload) heroController.reload();
      });
    }
  }

  function init() {
    if (document.getElementById("hero-app-embed")) {
      initHeroDemo();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
