/**
 * Shared marketing site navigation — single source of truth for all docs pages.
 */
(function () {
  var mobileNavOpen = false;

  var PRIMARY_LINKS = [
    { hash: "#top", label: "Live Demo" },
    { hash: "#features", label: "Features" },
    { hash: "#menu-platform", label: "Menu" },
    { hash: "#team-payroll", label: "Team" },
    { hash: "#command-center", label: "AI" },
    { hash: "#pricing", label: "Pricing" },
  ];

  var MORE_LINKS = [
    { hash: "#pos-kitchen", label: "POS & Kitchen" },
    { hash: "#integrations", label: "Integrations" },
    { hash: "#operations", label: "Operations" },
    { hash: "#analytics", label: "Analytics" },
  ];

  var ALL_LINKS = PRIMARY_LINKS.concat(MORE_LINKS);

  function getDocsPrefix() {
    var path = location.pathname;
    var m = path.match(/^(.*\/docs)(?=\/|$)/);
    return m ? m[1] : null;
  }

  function docsAssetBase() {
    var prefix = getDocsPrefix();
    if (prefix) return prefix + "/";
    return (window.PINNACLE_DOCS_BASE || "./").replace(/\/?$/, "/");
  }

  function isPitchPage() {
    return /pitch\.html$/i.test(location.pathname);
  }

  function docsIndexHref() {
    var prefix = getDocsPrefix();
    if (prefix) return prefix + "/index.html";
    return (window.PINNACLE_DOCS_BASE || "./").replace(/\/?$/, "/") + "index.html";
  }

  function isDocsIndexPage() {
    var path = location.pathname;
    if (/\/docs\/?$/i.test(path)) return true;
    if (/\/docs\/index\.html$/i.test(path)) return true;
    if (!isPitchPage() && /index\.html$/i.test(path)) return true;
    return false;
  }

  function sectionHref(hash) {
    if (isPitchPage()) return docsIndexHref() + hash;
    if (isDocsIndexPage()) return hash;
    return docsIndexHref() + hash;
  }

  function investorsHref() {
    var prefix = getDocsPrefix();
    if (prefix) return prefix + "/pitch.html";
    return (window.PINNACLE_DOCS_BASE || "./").replace(/\/?$/, "/") + "pitch.html";
  }

  function logoHref() {
    return sectionHref("#top");
  }

  function demoCtaHref() {
    return sectionHref("#top");
  }

  function navLink(href, label, extraClass) {
    var cls = "nav-link" + (extraClass ? " " + extraClass : "");
    return '<a href="' + href + '" class="' + cls + '">' + label + "</a>";
  }

  function mobileLink(href, label) {
    return (
      '<a href="' +
      href +
      '" class="nav-mobile-link"><span class="nav-mobile-link-label">' +
      label +
      "</span></a>"
    );
  }

  function hamburgerIcon() {
    return (
      '<span class="nav-toggle-icon" aria-hidden="true">' +
      '<span class="nav-toggle-bar"></span>' +
      '<span class="nav-toggle-bar"></span>' +
      '<span class="nav-toggle-bar"></span>' +
      "</span>"
    );
  }

  function renderNav() {
    var mount = document.getElementById("site-nav");
    if (!mount) return;

    var assetBase = docsAssetBase();
    var primaryDesktop = PRIMARY_LINKS.map(function (item) {
      return navLink(sectionHref(item.hash), item.label);
    }).join("");

    var moreDesktop =
      '<div class="nav-more" id="nav-more">' +
      '<button type="button" class="nav-more-btn" id="nav-more-btn" aria-expanded="false" aria-haspopup="true">' +
      "More" +
      '<svg class="nav-more-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
      "</button>" +
      '<div class="nav-more-menu" id="nav-more-menu" role="menu">' +
      MORE_LINKS.map(function (item) {
        return navLink(sectionHref(item.hash), item.label, "nav-more-item");
      }).join("") +
      navLink(investorsHref(), "Investors", "nav-more-item") +
      "</div></div>";

    var mobileGrid = ALL_LINKS.map(function (item) {
      return mobileLink(sectionHref(item.hash), item.label);
    }).join("");

    mount.innerHTML =
      '<div class="container nav-container">' +
      '<div class="nav-inner">' +
      '<a href="' +
      logoHref() +
      '" class="nav-logo-link"><img src="' +
      assetBase +
      'assets/logo-nav.svg" alt="Pinnacle Restaurant Manager" class="nav-logo" width="200" height="40" /></a>' +
      '<nav class="nav-links" aria-label="Main">' +
      primaryDesktop +
      moreDesktop +
      "</nav>" +
      '<div class="nav-actions">' +
      '<a href="#" class="btn btn-ghost nav-action-btn" data-app-link="/login" hidden>Sign in</a>' +
      '<a href="' +
      demoCtaHref() +
      '" class="btn btn-primary nav-action-btn nav-action-cta">Try live demo</a>' +
      "</div>" +
      '<button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-mobile" aria-label="Open menu">' +
      hamburgerIcon() +
      "</button>" +
      "</div></div>" +
      '<div class="nav-mobile-wrap" id="nav-mobile-wrap" hidden>' +
      '<button type="button" class="nav-mobile-backdrop" id="nav-mobile-backdrop" aria-label="Close menu"></button>' +
      '<nav class="nav-mobile" id="nav-mobile" aria-label="Mobile">' +
      '<div class="nav-mobile-head">' +
      '<span class="nav-mobile-title">Explore Pinnacle</span>' +
      '<button type="button" class="nav-mobile-close" id="nav-mobile-close" aria-label="Close menu">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      "</button>" +
      "</div>" +
      '<div class="nav-mobile-grid">' +
      mobileGrid +
      mobileLink(investorsHref(), "Investors") +
      "</div>" +
      '<div class="nav-mobile-foot">' +
      '<a href="' +
      demoCtaHref() +
      '" class="btn btn-primary nav-mobile-cta">Try live demo</a>' +
      '<a href="#" class="nav-mobile-signin" data-app-link="/login" hidden>Sign in to your account</a>' +
      "</div>" +
      "</nav></div>";

    attachMobileNavToBody();
    initMobileNav();
    initMoreMenu();
    initSectionHighlight();
  }

  /** backdrop-filter on .nav traps position:fixed — menu must live on body. */
  function attachMobileNavToBody() {
    var wrap = document.getElementById("nav-mobile-wrap");
    if (wrap && wrap.parentElement !== document.body) {
      document.body.appendChild(wrap);
    }
  }

  function setMobileOpen(nextOpen) {
    var wrap = document.getElementById("nav-mobile-wrap");
    var toggle = document.getElementById("nav-toggle");
    if (!wrap || !toggle) return;
    mobileNavOpen = nextOpen;
    wrap.hidden = !mobileNavOpen;
    toggle.classList.toggle("is-open", mobileNavOpen);
    toggle.setAttribute("aria-expanded", mobileNavOpen ? "true" : "false");
    toggle.setAttribute("aria-label", mobileNavOpen ? "Close menu" : "Open menu");
    document.body.classList.toggle("nav-open", mobileNavOpen);
  }

  function initMobileNav() {
    var toggle = document.getElementById("nav-toggle");
    var wrap = document.getElementById("nav-mobile-wrap");
    var backdrop = document.getElementById("nav-mobile-backdrop");
    var closeBtn = document.getElementById("nav-mobile-close");
    var mobile = document.getElementById("nav-mobile");
    if (!toggle || !wrap) return;

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setMobileOpen(!mobileNavOpen);
    });

    if (backdrop) {
      backdrop.addEventListener("click", function () {
        setMobileOpen(false);
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        setMobileOpen(false);
      });
    }

    if (mobile) {
      mobile.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          setMobileOpen(false);
        });
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mobileNavOpen) setMobileOpen(false);
    });
  }

  function initMoreMenu() {
    var btn = document.getElementById("nav-more-btn");
    var menu = document.getElementById("nav-more-menu");
    var root = document.getElementById("nav-more");
    if (!btn || !menu || !root) return;

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = root.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", function () {
      root.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    });

    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  function highlightCurrentSection() {
    if (!isDocsIndexPage()) return;
    var hash = location.hash || "#top";
    document.querySelectorAll(".nav-link, .nav-mobile-link").forEach(function (el) {
      var href = el.getAttribute("href") || "";
      var linkHash = href.indexOf("#") >= 0 ? href.slice(href.indexOf("#")) : "";
      el.classList.toggle("is-active", linkHash === hash);
    });
  }

  function initSectionHighlight() {
    if (!isDocsIndexPage()) return;
    highlightCurrentSection();
    window.addEventListener("hashchange", highlightCurrentSection);
  }

  renderNav();
})();
