/**
 * Hero full-app iframe embed + expand popup (GitHub Pages).
 */
(function () {
  var cfg = window.PINNACLE_CONFIG || { appUrl: "http://localhost:3000" };
  var base = (cfg.appUrl || "").replace(/\/$/, "");
  var embedUrl = base ? base + "/embed?path=%2Fdashboard" : "";

  function buildFrame(src, height) {
    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "Pinnacle Restaurant Manager — Live Demo";
    iframe.className = "hero-app-iframe";
    iframe.setAttribute("loading", "eager");
    iframe.setAttribute("allow", "clipboard-write");
    if (height) iframe.style.height = height;
    return iframe;
  }

  function showEmbedError(heroSlot, message) {
    heroSlot.innerHTML =
      '<div class="hero-embed-error"><p>' +
      message +
      "</p><p style=\"margin-top:0.75rem;font-size:0.8125rem\">" +
      "Tip: run <code>npm run dev</code> and open <code>http://localhost:3000</code> for same-origin demo, " +
      "or set <code>EMBED_FRAME_ANCESTORS</code> on the deployed app to this site&apos;s origin." +
      "</p></div>";
  }

  function hideLoaderWhenReady(iframe, loader) {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      try {
        var frame = iframe.contentWindow;
        var path = frame && frame.location ? frame.location.pathname : "";
        var search = frame && frame.location ? frame.location.search : "";
        if (path !== "/embed" && search.indexOf("embed=1") !== -1) {
          if (loader) loader.classList.add("hidden");
          clearInterval(timer);
        }
      } catch (e) {
        // Cross-origin until app allows this parent — loader stays up
      }
      if (attempts > 120) {
        clearInterval(timer);
        if (loader) loader.classList.add("hidden");
      }
    }, 500);
  }

  function initHeroEmbed() {
    var heroSlot = document.getElementById("hero-app-embed");
    var modal = document.getElementById("app-embed-modal");
    var modalBody = document.getElementById("app-embed-modal-body");
    var expandBtn = document.getElementById("hero-embed-expand");
    var closeBtn = document.getElementById("app-embed-close");
    var loader = document.getElementById("hero-embed-loader");

    if (!heroSlot) return;

    if (!embedUrl) {
      showEmbedError(heroSlot, "Set <code>appUrl</code> in <code>config.js</code> to your running Pinnacle app.");
      if (expandBtn) expandBtn.style.display = "none";
      return;
    }

    var inlineFrame = buildFrame(embedUrl, "min(520px, 70vh)");
    heroSlot.appendChild(inlineFrame);

    hideLoaderWhenReady(inlineFrame, loader);

    inlineFrame.addEventListener("error", function () {
      showEmbedError(
        heroSlot,
        "Could not load the demo. Make sure the app is running at <code>" + base + "</code>."
      );
      if (loader) loader.classList.add("hidden");
    });

    var modalFrame = null;

    function openModal() {
      if (!modal || !modalBody) return;
      modal.classList.add("open");
      document.body.classList.add("modal-open");
      if (!modalFrame) {
        modalFrame = buildFrame(embedUrl, "100%");
        modalFrame.style.flex = "1";
        modalFrame.style.minHeight = "0";
        modalBody.appendChild(modalFrame);
      }
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove("open");
      document.body.classList.remove("modal-open");
    }

    if (expandBtn) expandBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  function wireAppLinks() {
    document.querySelectorAll("[data-app-link]").forEach(function (el) {
      var path = el.getAttribute("data-app-link") || "/";
      if (embedUrl) {
        el.setAttribute("href", base + path);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else {
        el.setAttribute("href", "#");
        el.addEventListener("click", function (e) {
          e.preventDefault();
          alert("Set appUrl in docs/config.js to your deployed Pinnacle app URL.");
        });
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
    initHeroEmbed();
    wireAppLinks();
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
