/**
 * Self-contained interactive Pinnacle demo for GitHub Pages.
 * No backend, no config.js, no iframe — runs entirely in the browser.
 */
(function () {
  var NAV = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "insights", label: "Command Center", icon: "🧠" },
    { id: "analytics", label: "Analytics", icon: "📈" },
    { id: "orders", label: "Orders", icon: "📋" },
    { id: "inventory", label: "Inventory", icon: "📦" },
  ];

  var SCENARIOS = {
    profit: {
      question: "What's hurting my profit this week?",
      headline: "Labor cost high for sales volume is your biggest profit drag",
      metrics: { sales: "$24.8k", profit: "$4.2k", labor: "31.2%" },
      laborClass: "amber",
      findings: [
        { status: "red", tag: "Labor", text: "Labor cost high for volume" },
        { status: "amber", tag: "Waste", text: "Waste eroding margin" },
        { status: "amber", tag: "Vendors", text: "Vendor prices rising" },
      ],
      scanned: ["Sales", "Labor", "Inventory", "Vendors", "Waste", "Reviews", "Staff"],
      confidence: "high",
    },
    rush: {
      question: "What needs my attention before dinner rush?",
      headline: "Two stations understaffed and 3 items below par level",
      metrics: { sales: "$18.2k", profit: "$3.1k", labor: "28.4%" },
      laborClass: "green",
      findings: [
        { status: "red", tag: "Staff", text: "Only 4 servers scheduled for Friday dinner" },
        { status: "amber", tag: "Inventory", text: "Salmon, romaine, and brioche buns low" },
        { status: "green", tag: "Reservations", text: "12 covers booked 6–8pm" },
      ],
      scanned: ["Labor", "Inventory", "Reservations", "Sales", "Staff"],
      confidence: "high",
    },
    order: {
      question: "Create a suggested order for tomorrow",
      headline: "Order 40 lb salmon, 3 cases romaine, 2 cases brioche — saves ~$180 vs last vendor",
      metrics: { sales: "$24.8k", profit: "$4.2k", labor: "31.2%" },
      laborClass: "amber",
      findings: [
        { status: "amber", tag: "Purchasing", text: "Sysco quote 8% above US Foods on produce" },
        { status: "green", tag: "Forecast", text: "Tomorrow lunch +18% vs same day last week" },
        { status: "green", tag: "Par levels", text: "Auto-filled from 14-day usage" },
      ],
      scanned: ["Inventory", "Vendors", "Forecasting", "Purchasing"],
      confidence: "medium",
    },
    coach: {
      question: "Who needs coaching and why?",
      headline: "Alex (server) has lowest check average — coaching on upselling could add $420/wk",
      metrics: { sales: "$24.8k", profit: "$4.2k", labor: "31.2%" },
      laborClass: "amber",
      findings: [
        { status: "red", tag: "Staff", text: "Alex — $28 avg check vs $41 team avg" },
        { status: "amber", tag: "Labor", text: "Jordan — 22 min avg table turn (target 18)" },
        { status: "green", tag: "Staff", text: "Sam — top performer, consider shift lead" },
      ],
      scanned: ["Staff", "Sales", "Labor", "Guests"],
      confidence: "high",
    },
    weekend: {
      question: "How busy will we be this weekend?",
      headline: "Saturday dinner forecast: 142 covers (+22% vs last Saturday)",
      metrics: { sales: "$31.5k", profit: "$5.8k", labor: "29.1%" },
      laborClass: "green",
      findings: [
        { status: "green", tag: "Forecast", text: "Saturday peak 7–9pm — add 1 server" },
        { status: "amber", tag: "Events", text: "Farmers market 2 blocks away Saturday AM" },
        { status: "green", tag: "Weather", text: "Clear skies — patio seating recommended" },
      ],
      scanned: ["Forecasting", "External Factors", "Reservations", "Sales"],
      confidence: "medium",
    },
  };

  var SCENARIO_KEYS = ["profit", "rush", "order", "coach", "weekend"];

  var state = {
    screen: "insights",
    scenarioKey: "profit",
    analyzing: false,
  };

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function statusDot(status) {
    return '<span class="status-dot ' + status + '"></span>';
  }

  function renderInsights() {
    var s = SCENARIOS[state.scenarioKey];
    var findingsHtml = s.findings
      .map(function (f) {
        return (
          '<div class="cc-finding">' +
          statusDot(f.status) +
          '<span class="finding-tag">' +
          f.tag +
          "</span><span>" +
          f.text +
          "</span></div>"
        );
      })
      .join("");

    var scanHtml = state.analyzing
      ? '<span class="cc-scan-pulse"></span> Cross-checking sales, labor, inventory…'
      : '<span class="cc-scan-done">✓</span> Analysis complete — "' + s.confidence + '" confidence';

    return (
      '<div class="demo-screen demo-screen-insights' +
      (state.analyzing ? " is-loading" : "") +
      '" data-screen="insights">' +
      '<div class="cc-metrics">' +
      '<div class="cc-metric"><label>Sales</label><strong class="green">' +
      s.metrics.sales +
      "</strong></div>" +
      '<div class="cc-metric"><label>Profit</label><strong class="green">' +
      s.metrics.profit +
      "</strong></div>" +
      '<div class="cc-metric"><label>Labor</label><strong class="' +
      s.laborClass +
      '">' +
      s.metrics.labor +
      "</strong></div></div>" +
      '<div class="cc-question-box"><div class="cc-label">You asked:</div>' +
      '<div class="cc-question-text">' +
      s.question +
      "</div></div>" +
      '<div class="cc-headline-block"><div class="cc-headline">' +
      s.headline +
      "</div></div>" +
      '<div class="cc-findings">' +
      findingsHtml +
      "</div>" +
      '<div class="cc-scan' +
      (state.analyzing ? " active" : "") +
      '">' +
      scanHtml +
      "</div>" +
      '<div class="cc-scanned">Analyzed: ' +
      s.scanned.join(" · ") +
      "</div>" +
      '<div class="cc-controls">' +
      '<div class="cc-input-row">' +
      '<input type="text" class="cc-input demo-cc-input" placeholder="Ask anything about your restaurant…" value="' +
      s.question.replace(/"/g, "&quot;") +
      '" aria-label="Ask the Command Center" />' +
      '<button type="button" class="cc-analyze-btn demo-analyze-btn"' +
      (state.analyzing ? " disabled" : "") +
      ">Analyze</button></div>" +
      '<div class="cc-chips demo-cc-chips">' +
      SCENARIO_KEYS.map(function (key) {
        var sc = SCENARIOS[key];
        var labels = {
          profit: "Profit leaks",
          rush: "Before dinner rush",
          order: "Order for tomorrow",
          coach: "Coach employees",
          weekend: "Weekend forecast",
        };
        return (
          '<button type="button" class="cc-chip' +
          (state.scenarioKey === key ? " active" : "") +
          '" data-scenario="' +
          key +
          '">' +
          labels[key] +
          "</button>"
        );
      }).join("") +
      "</div></div></div>"
    );
  }

  function renderDashboard() {
    return (
      '<div class="demo-screen" data-screen="dashboard">' +
      '<div class="demo-screen-title">Operations Dashboard</div>' +
      '<div class="demo-kpi-row">' +
      '<div class="demo-kpi"><label>Today&apos;s revenue</label><strong>$4,280</strong><span class="up">+12% vs yesterday</span></div>' +
      '<div class="demo-kpi"><label>Open orders</label><strong>8</strong><span>3 in kitchen</span></div>' +
      '<div class="demo-kpi"><label>Low stock</label><strong class="warn">3</strong><span>Needs reorder</span></div>' +
      "</div>" +
      '<div class="demo-panel"><div class="demo-panel-head">Recent orders</div>' +
      '<div class="demo-list-item"><span>Table 12</span><span class="badge-open">Preparing</span><span>$86.40</span></div>' +
      '<div class="demo-list-item"><span>Bar 3</span><span class="badge-done">Served</span><span>$42.00</span></div>' +
      '<div class="demo-list-item"><span>Takeout #104</span><span class="badge-new">New</span><span>$31.50</span></div>' +
      "</div>" +
      '<div class="demo-alert">⚠ Salmon below par — <button type="button" class="demo-link-btn" data-goto="insights" data-scenario="order">Ask AI to draft order →</button></div>' +
      "</div>"
    );
  }

  function renderAnalytics() {
    return (
      '<div class="demo-screen" data-screen="analytics">' +
      '<div class="demo-screen-title">Analytics — Executive Summary</div>' +
      '<div class="demo-pills">' +
      '<span class="demo-pill hot">Sales</span><span class="demo-pill hot">Food Cost</span>' +
      '<span class="demo-pill">Labor</span><span class="demo-pill">Menu Eng.</span>' +
      '<span class="demo-pill">Profit</span></div>' +
      '<div class="demo-chart-placeholder">' +
      '<div class="demo-bars">' +
      [65, 82, 45, 90, 72, 88, 95].map(function (h, i) {
        return '<div class="demo-bar" style="height:' + h + '%" title="Day ' + (i + 1) + '"></div>';
      }).join("") +
      "</div><p class="demo-chart-label">7-day revenue trend</p></div>" +
      '<div class="demo-kpi-row">' +
      '<div class="demo-kpi"><label>Food cost %</label><strong>28.4%</strong><span class="up">On target</span></div>' +
      '<div class="demo-kpi"><label>Labor %</label><strong class="warn">31.2%</strong><span>Above goal</span></div>' +
      '<div class="demo-kpi"><label>Net margin</label><strong>16.8%</strong><span>-1.2 pts</span></div>' +
      "</div></div>"
    );
  }

  function renderOrders() {
    return (
      '<div class="demo-screen" data-screen="orders">' +
      '<div class="demo-screen-title">Orders</div>' +
      '<div class="demo-orders">' +
      [
        { id: "#2184", table: "Table 12", status: "Preparing", total: "$86.40", items: "2× Ribeye, 1× Caesar" },
        { id: "#2183", table: "Bar 3", status: "Served", total: "$42.00", items: "Burger, Fries, 2× Beer" },
        { id: "#2182", table: "Takeout", status: "New", total: "$31.50", items: "Pad Thai, Spring rolls" },
        { id: "#2181", table: "Table 8", status: "Paid", total: "$124.80", items: "Chef's tasting menu ×2" },
      ]
        .map(function (o) {
          var cls =
            o.status === "New"
              ? "badge-new"
              : o.status === "Preparing"
                ? "badge-open"
                : o.status === "Served"
                  ? "badge-open"
                  : "badge-done";
          return (
            '<div class="demo-order-card">' +
            '<div class="demo-order-top"><strong>' +
            o.id +
            "</strong><span class=\"" +
            cls +
            '">' +
            o.status +
            "</span></div>" +
            "<div>" +
            o.table +
            " · " +
            o.items +
            "</div>" +
            '<div class="demo-order-total">' +
            o.total +
            "</div></div>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  function renderInventory() {
    return (
      '<div class="demo-screen" data-screen="inventory">' +
      '<div class="demo-screen-title">Inventory</div>' +
      '<div class="demo-inv-list">' +
      [
        { name: "Atlantic Salmon", qty: "8 lb", par: "40 lb", status: "red" },
        { name: "Romaine Hearts", qty: "2 cases", par: "5 cases", status: "amber" },
        { name: "Brioche Buns", qty: "1 case", par: "3 cases", status: "amber" },
        { name: "Olive Oil (EVOO)", qty: "4 gal", par: "2 gal", status: "green" },
      ]
        .map(function (item) {
          return (
            '<div class="demo-inv-row">' +
            statusDot(item.status) +
            "<div><strong>" +
            item.name +
            "</strong><br><span>" +
            item.qty +
            " on hand · par " +
            item.par +
            "</span></div></div>"
          );
        })
        .join("") +
      "</div>" +
      '<button type="button" class="demo-action-btn demo-link-btn" data-goto="insights" data-scenario="order">Ask AI for suggested order →</button>' +
      "</div>"
    );
  }

  function renderDemo() {
    var navHtml = NAV.map(function (item) {
      return (
        '<button type="button" class="demo-nav-item' +
        (state.screen === item.id ? " active" : "") +
        '" data-screen="' +
        item.id +
        '" title="' +
        item.label +
        '"><span class="demo-nav-icon">' +
        item.icon +
        '</span><span class="demo-nav-label">' +
        item.label +
        "</span></button>"
      );
    }).join("");

    var screens =
      renderDashboard() +
      renderInsights() +
      renderAnalytics() +
      renderOrders() +
      renderInventory();

    return (
      '<div class="pinnacle-demo" id="pinnacle-live-demo">' +
      '<nav class="demo-sidebar" aria-label="App navigation">' +
      navHtml +
      "</nav>" +
      '<div class="demo-main">' +
      screens +
      "</div></div>"
    );
  }

  function showScreen(screenId) {
    state.screen = screenId;
    refreshDemo();
  }

  function runAnalysis(scenarioKey) {
    if (state.analyzing) return;
    if (scenarioKey) state.scenarioKey = scenarioKey;
    state.screen = "insights";
    state.analyzing = true;
    refreshDemo();
    setTimeout(function () {
      state.analyzing = false;
      refreshDemo();
    }, 1400);
  }

  function refreshDemo() {
    var demo = document.getElementById("pinnacle-live-demo");
    if (!demo) return;
    var parent = demo.parentNode;
    var scroll = document.querySelector(".demo-main");
    var scrollTop = scroll ? scroll.scrollTop : 0;
    parent.innerHTML = renderDemo();
    var newScroll = document.querySelector(".demo-main");
    if (newScroll) newScroll.scrollTop = scrollTop;
    bindDemoEvents(parent);
  }

  function bindDemoEvents(container) {
    container.querySelectorAll(".demo-nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showScreen(btn.getAttribute("data-screen"));
      });
    });

    container.querySelectorAll(".demo-link-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var scenario = btn.getAttribute("data-scenario");
        runAnalysis(scenario || state.scenarioKey);
      });
    });

    var analyzeBtn = container.querySelector(".demo-analyze-btn");
    var input = container.querySelector(".demo-cc-input");
    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", function () {
        runAnalysis(state.scenarioKey);
      });
    }
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") runAnalysis(state.scenarioKey);
      });
    }

    container.querySelectorAll(".demo-cc-chips .cc-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        runAnalysis(chip.getAttribute("data-scenario"));
      });
    });

    container.querySelectorAll(".demo-screen").forEach(function (screen) {
      screen.hidden = screen.getAttribute("data-screen") !== state.screen;
    });
  }

  function initHeroDemo() {
    var heroSlot = document.getElementById("hero-app-embed");
    var expandBtn = document.getElementById("hero-embed-expand");
    var modal = document.getElementById("app-embed-modal");
    var modalBody = document.getElementById("app-embed-modal-body");
    var closeBtn = document.getElementById("app-embed-close");
    var heroWrap = document.getElementById("hero-app-embed-wrap");

    if (!heroSlot) return;

    heroSlot.innerHTML = renderDemo();
    bindDemoEvents(heroSlot);

    var demoHome = heroSlot;

    function openModal() {
      if (!modal || !modalBody) return;
      var demo = document.getElementById("pinnacle-live-demo");
      if (demo) modalBody.appendChild(demo);
      modal.classList.add("open");
      document.body.classList.add("modal-open");
    }

    function closeModal() {
      if (!modal || !heroSlot) return;
      var demo = document.getElementById("pinnacle-live-demo");
      if (demo) heroSlot.appendChild(demo);
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

  function wireOptionalAppLinks() {
    var cfg = window.PINNACLE_CONFIG || {};
    var base = (cfg.appUrl || "").replace(/\/$/, "");
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
    wireOptionalAppLinks();
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
