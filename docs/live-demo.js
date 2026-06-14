/**
 * Self-contained interactive Pinnacle demo for GitHub Pages.
 * No backend, no config.js, no iframe — runs entirely in the browser.
 */
(function () {
  var NAV = [
    { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
    { id: "photos", label: "Photos", icon: "camera" },
    { id: "menu", label: "Menu", icon: "utensils" },
    { id: "inventory", label: "Inventory", icon: "package" },
    { id: "staff", label: "Staff", icon: "users" },
    { id: "tables", label: "Tables", icon: "layout-grid" },
    { id: "orders", label: "Orders", icon: "clipboard-list" },
    { id: "finances", label: "Finances", icon: "dollar-sign" },
    { id: "analytics", label: "Analytics", icon: "bar-chart-3" },
    { id: "social", label: "Social", icon: "share-2" },
    { id: "insights", label: "Command Center", icon: "brain" },
  ];

  /* Mobile bottom bar — key daily tabs including AI */
  var MOBILE_NAV_IDS = ["dashboard", "orders", "insights", "inventory", "analytics"];

  function getMobileNavItems() {
    return MOBILE_NAV_IDS.map(function (id) {
      for (var i = 0; i < NAV.length; i++) {
        if (NAV[i].id === id) return NAV[i];
      }
      return null;
    }).filter(function (item) {
      return !!item;
    });
  }

  function mobileNavLabel(item) {
    return item.id === "insights" ? "AI" : item.label;
  }

  function getMoreNavItems() {
    return NAV.filter(function (item) {
      return MOBILE_NAV_IDS.indexOf(item.id) === -1;
    });
  }

  function isMoreNavScreen() {
    return MOBILE_NAV_IDS.indexOf(state.screen) === -1;
  }

  var ICON_MENU =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  var ICONS = {
    "layout-dashboard": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
    utensils: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
    package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    "layout-grid": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    "clipboard-list": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
    "dollar-sign": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    "bar-chart-3": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
    "share-2": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M12 18v4"/></svg>',
  };

  var LIVE_SIGNALS = [
    { label: "Sales (7d)", value: "$24.8k", status: "green", detail: "+8% WoW" },
    { label: "Labor %", value: "31.2%", status: "yellow", detail: "Above goal" },
    { label: "Low stock", value: "3 items", status: "red", detail: "Reorder today" },
    { label: "Guest rating", value: "4.6★", status: "green", detail: "Google" },
    { label: "Open orders", value: "8", status: "yellow", detail: "3 in kitchen" },
    { label: "Waste (7d)", value: "$420", status: "yellow", detail: "Above avg" },
  ];

  var QUICK_COMMANDS = [
    { key: "profit", text: "What's hurting my profit this week?" },
    { key: "rush", text: "What needs my attention before dinner rush?" },
    { key: "profit", text: "Scan the restaurant and tell me what needs attention." },
    { key: "rush", text: "Give me today's sales, labor, inventory, staffing, and guest service summary." },
  ];

  var DASHBOARD_COMMANDS = [
    { key: "rush", label: "Daily Briefing" },
    { key: "profit", label: "Find Problems" },
    { key: "profit", label: "Improve Profit" },
    { key: "coach", label: "Build Schedule" },
    { key: "order", label: "Order Inventory" },
  ];

  var ANALYTICS_TABS = [
    "Executive",
    "Sales",
    "Food & Inventory",
    "Labor",
    "Menu Engineering",
    "Marketing",
    "Guest Experience",
    "Operations",
    "Purchasing",
    "Forecasting",
    "Profitability",
    "External Factors",
  ];

  var ANALYTICS_TAB_DATA = [
    { title: "Executive Summary", kpis: [{ l: "Revenue (7d)", v: "$24.8k", s: "+8% WoW" }, { l: "Net margin", v: "16.8%", s: "-1.2 pts" }, { l: "Labor %", v: "31.2%", s: "Above goal" }, { l: "Guest rating", v: "4.6", s: "Google" }], insight: "Labor and waste are the top two margin drags this week." },
    { title: "Sales Analytics", kpis: [{ l: "Avg check", v: "$41.20", s: "+$2.10" }, { l: "Covers (7d)", v: "612", s: "+14%" }, { l: "Dine-in mix", v: "68%", s: "Stable" }, { l: "Peak hour", v: "7–9pm", s: "Fri–Sat" }], insight: "Entrées driving lift; bar sales soft on weekdays." },
    { title: "Food Cost & Inventory", kpis: [{ l: "Food cost %", v: "28.4%", s: "On target" }, { l: "Variance", v: "1.8%", s: "Theoretical vs actual" }, { l: "Waste (7d)", v: "$420", s: "Above avg" }, { l: "Days on hand", v: "4.2", s: "Salmon low" }], insight: "Salmon and romaine are the biggest variance drivers." },
    { title: "Labor Management", kpis: [{ l: "Labor %", v: "31.2%", s: "Above 28% goal" }, { l: "Sales / labor hr", v: "$86", s: "Target $92" }, { l: "Overtime", v: "6.2%", s: "2 staff" }, { l: "Schedule var.", v: "+4.5%", s: "vs plan" }], insight: "Friday dinner is understaffed; Tuesday lunch overstaffed." },
    { title: "Menu Engineering", kpis: [{ l: "Stars", v: "8 items", s: "High margin + vol" }, { l: "Plowhorses", v: "5 items", s: "Reprice candidates" }, { l: "Puzzles", v: "3 items", s: "Promote" }, { l: "Dogs", v: "2 items", s: "Consider removal" }], insight: "Ribeye and truffle fries are top contributors." },
    { title: "Marketing & Acquisition", kpis: [{ l: "Marketing spend", v: "$1,240", s: "30 days" }, { l: "ROAS", v: "4.2×", s: "Instagram best" }, { l: "CAC", v: "$18", s: "Down 12%" }, { l: "Repeat rate", v: "34%", s: "+2 pts" }], insight: "Weekend brunch promo drove 22% of new guests." },
    { title: "Guest Experience", kpis: [{ l: "Avg rating", v: "4.6★", s: "Google" }, { l: "OpenTable", v: "4.5★", s: "142 reviews" }, { l: "Complaints (7d)", v: "3", s: "Wait time" }, { l: "Resolution", v: "4.2h", s: "Avg time" }], insight: "Wait-time complaints cluster on Saturday 7pm." },
    { title: "Operations", kpis: [{ l: "Avg ticket time", v: "18.4 min", s: "Target 18" }, { l: "Accuracy", v: "96.2%", s: "Good" }, { l: "Void rate", v: "1.8%", s: "Normal" }, { l: "Table turns", v: "2.4", s: "Dinner avg" }], insight: "Kitchen bottleneck at grill station 6–8pm." },
    { title: "Purchasing", kpis: [{ l: "Open POs", v: "2", s: "Sysco, US Foods" }, { l: "Price change", v: "+3.2%", s: "Produce" }, { l: "Savings opp.", v: "$180", s: "Switch vendor" }, { l: "On-time delivery", v: "94%", s: "Last 30d" }], insight: "US Foods beats Sysco on produce this week." },
    { title: "Forecasting & Planning", kpis: [{ l: "Sat covers", v: "142", s: "+22% vs LY" }, { l: "Staff needed Fri", v: "+1 server", s: "Dinner" }, { l: "Catering (7d)", v: "18", s: "Bookings" }, { l: "Inventory order", v: "$2.1k", s: "Suggested" }], insight: "Saturday dinner peak 7–9pm — add one server." },
    { title: "Profitability", kpis: [{ l: "Gross profit", v: "$18.2k", s: "7 days" }, { l: "Prime cost", v: "59.6%", s: "Food + labor" }, { l: "EBITDA est.", v: "$4.2k", s: "Weekly" }, { l: "Break-even", v: "82 covers", s: "/ day" }], insight: "Labor is the largest controllable profit leak." },
    { title: "External Factors", kpis: [{ l: "Weather (Sat)", v: "Clear", s: "Patio open" }, { l: "Local events", v: "2", s: "Farmers market" }, { l: "Competitor promos", v: "1", s: "Happy hour" }, { l: "Sentiment", v: "Positive", s: "Social" }], insight: "Farmers market Saturday AM may boost lunch traffic." },
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
    screen: "dashboard",
    scenarioKey: "profit",
    analyzing: false,
    analyticsTab: 0,
    staffTab: "schedule",
    socialTab: "compose",
    location: "downtown",
    mobileMenuOpen: false,
  };

  var lastDemoContainer = null;

  function navIcon(name) {
    return '<span class="demo-nav-icon" aria-hidden="true">' + (ICONS[name] || "") + "</span>";
  }

  function screenHeader(title, desc, actionHtml) {
    return (
      '<div class="demo-page-header">' +
      '<div class="demo-page-header-text">' +
      '<h2 class="demo-screen-title">' + title + "</h2>" +
      (desc ? '<p class="demo-screen-desc">' + desc + "</p>" : "") +
      "</div>" +
      (actionHtml || "") +
      "</div>"
    );
  }

  function statGrid(kpis) {
    return (
      '<div class="demo-stat-grid">' +
      kpis.map(function (k) {
        return (
          '<div class="demo-stat-card"><label>' + k.l + "</label><strong" +
          (k.warn ? ' class="warn"' : "") +
          ">" + k.v + "</strong>" +
          (k.s ? '<span' + (k.up ? ' class="up"' : "") + ">" + k.s + "</span>" : "") +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function kpiRow(kpis) {
    return statGrid(kpis);
  }

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
    var signalsHtml = LIVE_SIGNALS.map(function (sig) {
      return (
        '<div class="cc-signal cc-signal-' + sig.status + '">' +
        '<div class="cc-signal-top"><span class="cc-signal-dot"></span><span>' + sig.label + "</span></div>" +
        '<strong>' + sig.value + "</strong>" +
        (sig.detail ? '<span class="cc-signal-detail">' + sig.detail + "</span>" : "") +
        "</div>"
      );
    }).join("");

    var findingsHtml = s.findings
      .map(function (f) {
        var sev = f.status === "red" ? "high" : f.status === "amber" ? "medium" : "low";
        return (
          '<div class="cc-finding-card cc-sev-' + sev + '">' +
          '<span class="cc-domain-badge">' + f.tag + "</span>" +
          "<p>" + f.text + "</p></div>"
        );
      })
      .join("");

    var quickCmdHtml = QUICK_COMMANDS.map(function (cmd) {
      var short = cmd.text.length > 42 ? cmd.text.slice(0, 42) + "…" : cmd.text;
      return (
        '<button type="button" class="cc-quick-chip" data-scenario="' + cmd.key + '" title="' +
        cmd.text.replace(/"/g, "&quot;") + '">' + short + "</button>"
      );
    }).join("");

    var dashCmdHtml = DASHBOARD_COMMANDS.map(function (cmd) {
      return (
        '<button type="button" class="cc-dash-cmd" data-scenario="' + cmd.key + '">' + cmd.label + "</button>"
      );
    }).join("");

    var scanHtml = state.analyzing
      ? '<div class="cc-scan-panel"><div class="cc-scan-title">Cross-checking restaurant data…</div><div class="cc-scan-domains">' +
        ["Sales", "Labor", "Inventory", "Scheduling", "Vendor invoices", "Waste logs", "Guest reviews", "Employee performance"]
          .map(function (d, i) {
            return '<div class="cc-scan-domain' + (i <= 3 ? " done" : "") + '">' + (i <= 3 ? "✓" : "…") + " " + d + "</div>";
          }).join("") +
        "</div></div>"
      : "";

    var responseHtml = state.analyzing
      ? scanHtml
      : '<div class="cc-response">' +
        '<p class="cc-response-label">Command center response</p>' +
        '<h3 class="cc-response-headline">' + s.headline + "</h3>" +
        '<div class="cc-response-metrics">' +
        '<div><label>Sales</label><strong>' + s.metrics.sales + "</strong></div>" +
        '<div><label>Profit</label><strong>' + s.metrics.profit + "</strong></div>" +
        '<div><label>Labor</label><strong class="' + s.laborClass + '">' + s.metrics.labor + "</strong></div>" +
        "</div>" +
        '<div class="cc-findings-grid">' + findingsHtml + "</div>" +
        '<p class="cc-scanned">Analyzed: ' + s.scanned.join(" · ") + ' · <span class="cc-confidence">' + s.confidence + " confidence</span></p>" +
        "</div>";

    return (
      '<div class="demo-screen" data-screen="insights">' +
      screenHeader("Command Center", "Ask plain-English questions — cross-checks every part of your business") +
      '<div class="cc-card">' +
      '<div class="cc-card-header">' +
      '<div class="cc-card-header-top">' +
      '<div><p class="cc-eyebrow">Restaurant Command Center</p><h3 class="cc-location-title">Downtown Bistro</h3>' +
      '<p class="cc-card-desc">Ask plain-English questions. The system cross-checks sales, labor, inventory, scheduling, vendor invoices, waste, reviews, and employee data — together.</p></div>' +
      '<div class="cc-live-badge"><span class="cc-live-dot"></span> Live <span class="cc-live-count">2 critical</span></div>' +
      "</div>" +
      '<div class="cc-signals">' + signalsHtml + "</div>" +
      '<div class="cc-input-wrap">' +
      '<input type="text" class="cc-input demo-cc-input" placeholder="What\'s hurting my profit this week?" value="' +
      s.question.replace(/"/g, "&quot;") +
      '" aria-label="Ask the Command Center" />' +
      '<button type="button" class="cc-analyze-btn demo-analyze-btn"' + (state.analyzing ? " disabled" : "") + ">Analyze</button>" +
      "</div>" +
      '<div class="cc-quick-chips">' + quickCmdHtml + "</div>" +
      "</div>" +
      '<div class="cc-quick-actions"><p>Quick commands</p><div class="cc-dash-cmds">' + dashCmdHtml + "</div></div>" +
      '<div class="cc-card-body">' + responseHtml + "</div>" +
      "</div></div>"
    );
  }

  function renderDashboard() {
    return (
      '<div class="demo-screen" data-screen="dashboard">' +
      screenHeader(
        "Dashboard",
        "Downtown Bistro — overview of your restaurant operations",
        '<button type="button" class="demo-header-btn" data-screen="photos">Capture Photo</button>'
      ) +
      statGrid([
        { l: "Weekly Revenue", v: "$24,820", s: "86 orders this week", up: true },
        { l: "Monthly Expenses", v: "$18,450", s: "Last 30 days" },
        { l: "Active Staff", v: "14", s: "42 menu items" },
        { l: "Photos Uploaded", v: "128", s: "3 low stock alerts", warn: true },
      ]) +
      '<div class="demo-alert">⚠ <strong>Low Stock Alerts</strong> — Salmon: 8 lb (min 40), Romaine: 2 cases (min 5), Brioche buns: 1 case (min 3). ' +
      '<button type="button" class="demo-link-btn" data-goto="inventory">View inventory →</button></div>' +
      '<div class="demo-card"><h3 class="demo-card-title">AI Business Insights</h3>' +
      '<div class="demo-insight-item"><span class="demo-insight-sev high">High</span><strong>Labor cost above target</strong><p>31.2% labor vs 28% goal — review Friday dinner schedule.</p></div>' +
      '<div class="demo-insight-item"><span class="demo-insight-sev medium">Medium</span><strong>Waste trending up</strong><p>$420 waste this week — prep variance on salmon and greens.</p></div></div>' +
      '<div class="demo-two-col">' +
      '<div class="demo-card"><h3 class="demo-card-title">Quick Actions</h3>' +
      '<div class="demo-quick-actions-grid">' +
      '<button type="button" class="demo-quick-action" data-screen="orders"><span>📋</span> Orders</button>' +
      '<button type="button" class="demo-quick-action" data-screen="inventory"><span>📦</span> Inventory</button>' +
      '<button type="button" class="demo-quick-action" data-screen="staff"><span>👥</span> Staff</button>' +
      '<button type="button" class="demo-quick-action" data-screen="finances"><span>💰</span> Finances</button>' +
      "</div></div>" +
      '<div class="demo-card"><h3 class="demo-card-title">Recent Activity</h3>' +
      '<div class="demo-list-item"><span>ORDER_CREATED</span><span class="badge-new">Order</span><span>2m ago</span></div>' +
      '<div class="demo-list-item"><span>INVENTORY_UPDATED</span><span class="badge-open">Stock</span><span>1h ago</span></div>' +
      '<div class="demo-list-item"><span>SCHEDULE_PUBLISHED</span><span class="badge-done">Staff</span><span>3h ago</span></div>' +
      "</div></div></div>"
    );
  }

  function renderPhotos() {
    var cats = ["All", "Menu Items", "Inventory", "Receipts", "Staff", "Food Prep", "Marketing"];
    return (
      '<div class="demo-screen" data-screen="photos">' +
      screenHeader("Photo Library", "Capture and organize photos by category — menu, inventory, receipts, and more") +
      '<div class="demo-upload-zone">Drop photos here or click to upload — AI auto-tags by category</div>' +
      '<div class="demo-photo-pills">' +
      cats.map(function (c, i) {
        return '<button type="button" class="demo-photo-pill' + (i === 0 ? " active" : "") + '">' + c + "</button>";
      }).join("") +
      "</div>" +
      '<div class="demo-photo-grid">' +
      ["Ribeye plating", "Walk-in cooler", "Sysco receipt", "Line setup", "Brunch promo", "Bar garnish"]
        .map(function (name) {
          return '<div class="demo-photo-tile"><div class="demo-photo-tile-img"></div><span>' + name + "</span></div>";
        }).join("") +
      "</div></div>"
    );
  }

  function renderMenu() {
    var sections = [
      { cat: "Mains", items: [
        { name: "Wood-Fired Ribeye", price: "$42", avail: true },
        { name: "Pan-Seared Salmon", price: "$34", avail: true },
      ]},
      { cat: "Appetizers", items: [
        { name: "Burrata & Heirloom", price: "$16", avail: true },
        { name: "Crispy Calamari", price: "$14", avail: false },
      ]},
    ];
    return (
      '<div class="demo-screen" data-screen="menu">' +
      screenHeader("Menu", "Categories, pricing, availability, and recipe costs") +
      sections.map(function (sec) {
        return (
          '<div class="demo-menu-section"><h3 class="demo-menu-section-title">' + sec.cat + "</h3>" +
          '<div class="demo-menu-cards">' +
          sec.items.map(function (item) {
            return (
              '<div class="demo-menu-card">' +
              '<div class="demo-menu-card-img"></div>' +
              "<strong>" + item.name + "</strong>" +
              '<div class="demo-menu-card-meta"><span>' + item.price + "</span>" +
              '<span class="' + (item.avail ? "badge-done" : "badge-open") + '">' + (item.avail ? "Available" : "86'd") + "</span></div></div>"
            );
          }).join("") +
          "</div></div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderAnalytics() {
    var tab = ANALYTICS_TAB_DATA[state.analyticsTab] || ANALYTICS_TAB_DATA[0];
    var tabsHtml = ANALYTICS_TABS.map(function (label, i) {
      return (
        '<button type="button" class="demo-analytics-tab' +
        (state.analyticsTab === i ? " active" : "") +
        '" data-tab="' + i + '">' + label + "</button>"
      );
    }).join("");

    return (
      '<div class="demo-screen" data-screen="analytics">' +
      screenHeader("Analytics", "Restaurant intelligence — last 30 days") +
      '<div class="demo-analytics-tabs-wrap" role="tablist">' + tabsHtml + "</div>" +
      '<div class="demo-analytics-content">' +
      '<h3 class="demo-analytics-tab-title">' + tab.title + "</h3>" +
      kpiRow(tab.kpis.map(function (k) {
        return { l: k.l, v: k.v, s: k.s, warn: k.v.indexOf("31.2") >= 0, up: k.s && k.s.indexOf("+") === 0 };
      })) +
      '<div class="demo-chart-placeholder">' +
      '<div class="demo-bars">' +
      [65, 82, 45, 90, 72, 88, 95, 78].map(function (h) {
        return '<div class="demo-bar" style="height:' + h + '%"></div>';
      }).join("") +
      '</div><p class="demo-chart-label">Trend — ' + tab.title + "</p></div>" +
      '<div class="demo-intel-card"><strong>AI insight</strong><p>' + tab.insight + '</p>' +
      '<button type="button" class="demo-link-btn demo-analytics-ai-btn" data-goto="insights" data-scenario="profit">Run deeper analysis in Command Center →</button></div>' +
      "</div></div>"
    );
  }

  function renderOrders() {
    return (
      '<div class="demo-screen" data-screen="orders">' +
      screenHeader("Orders", "Track active and completed orders") +
      '<div class="demo-toolbar"><button type="button" class="demo-action-btn">+ New order</button><span class="demo-toolbar-pill active">All</span><span class="demo-toolbar-pill">Open</span><span class="demo-toolbar-pill">Paid</span></div>' +
      '<div class="demo-orders">' +
      [
        { id: "#2184", table: "Table 12", status: "PREPARING", total: "$86.40", items: "2× Ribeye, 1× Caesar" },
        { id: "#2183", table: "Bar 3", status: "SERVED", total: "$42.00", items: "Burger, Fries, 2× Beer" },
        { id: "#2182", table: "Takeout", status: "PENDING", total: "$31.50", items: "Pad Thai, Spring rolls" },
        { id: "#2181", table: "Table 8", status: "PAID", total: "$124.80", items: "Chef's tasting menu ×2" },
      ]
        .map(function (o) {
          var cls =
            o.status === "PENDING"
              ? "badge-pending"
              : o.status === "PREPARING"
                ? "badge-preparing"
                : o.status === "SERVED"
                  ? "badge-served"
                  : "badge-paid";
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
      screenHeader("Inventory", "Track stock levels, suppliers, and reorder points") +
      '<table class="demo-table-data"><thead><tr><th>Item</th><th>On hand</th><th>Par</th><th>Status</th></tr></thead><tbody>' +
      [
        { name: "Atlantic Salmon", qty: "8 lb", par: "40 lb", status: "Low Stock" },
        { name: "Romaine Hearts", qty: "2 cases", par: "5 cases", status: "Low Stock" },
        { name: "Brioche Buns", qty: "1 case", par: "3 cases", status: "Low Stock" },
        { name: "Olive Oil (EVOO)", qty: "4 gal", par: "2 gal", status: "OK" },
        { name: "Ribeye Strip", qty: "22 lb", par: "25 lb", status: "OK" },
      ]
        .map(function (item) {
          return (
            "<tr><td><strong>" + item.name + "</strong></td><td>" + item.qty +
            "</td><td>" + item.par + '</td><td><span class="' +
            (item.status === "Low Stock" ? "badge-low-stock" : "badge-ok") + '">' + item.status + "</span></td></tr>"
          );
        })
        .join("") +
      "</tbody></table>" +
      '<button type="button" class="demo-action-btn demo-link-btn" data-goto="insights" data-scenario="order">Ask AI for suggested order →</button>' +
      "</div>"
    );
  }

  function renderStaff() {
    var team = [
      { name: "Alex Rivera", role: "Server", shift: "Fri 5–11pm", perf: "Check avg $28" },
      { name: "Sam Chen", role: "Shift Lead", shift: "Fri 4–12am", perf: "Top performer" },
      { name: "Jordan Lee", role: "Line Cook", shift: "Fri 3–11pm", perf: "18 min tickets" },
      { name: "Morgan Blake", role: "Bartender", shift: "Thu–Sat", perf: "$620/night avg" },
      { name: "Taylor Kim", role: "Host", shift: "Fri 5–10pm", perf: "4.8 guest score" },
    ];
    return (
      '<div class="demo-screen" data-screen="staff">' +
      screenHeader("Staff", "Team members, roles, shifts, and labor performance") +
      '<div class="demo-subtabs">' +
      '<button type="button" class="demo-subtab' + (state.staffTab === "schedule" ? " active" : "") + '" data-staff-tab="schedule">Schedule</button>' +
      '<button type="button" class="demo-subtab' + (state.staffTab === "team" ? " active" : "") + '" data-staff-tab="team">Team</button>' +
      "</div>" +
      (state.staffTab === "schedule"
        ? '<div class="demo-schedule"><div class="demo-schedule-row"><span>Fri Dinner</span><strong>4 servers</strong><span class="badge-low-stock">Understaffed</span></div>' +
          '<div class="demo-schedule-row"><span>Sat Brunch</span><strong>6 staff</strong><span class="badge-ok">On plan</span></div>' +
          '<div class="demo-schedule-row"><span>Sun Dinner</span><strong>5 servers</strong><span class="badge-ok">On plan</span></div></div>'
        : '<div class="demo-staff-list">' +
          team.map(function (m) {
            return (
              '<div class="demo-staff-row"><div class="demo-staff-avatar">' + m.name.charAt(0) +
              '</div><div><strong>' + m.name + '</strong><br><span>' + m.role + " · " + m.shift +
              '</span></div><span class="demo-staff-perf">' + m.perf + "</span></div>"
            );
          }).join("") +
          "</div>") +
      '<button type="button" class="demo-link-btn" data-goto="insights" data-scenario="coach">Who needs coaching? Ask AI →</button>' +
      "</div>"
    );
  }

  function renderTables() {
    var tables = [
      { n: 1, seats: 2, status: "available" },
      { n: 2, seats: 2, status: "occupied" },
      { n: 3, seats: 4, status: "occupied" },
      { n: 4, seats: 4, status: "reserved" },
      { n: 5, seats: 4, status: "available" },
      { n: 6, seats: 6, status: "occupied" },
      { n: 7, seats: 2, status: "available" },
      { n: 8, seats: 8, status: "reserved" },
      { n: 9, seats: 4, status: "available" },
      { n: 10, seats: 2, status: "occupied" },
      { n: 11, seats: 4, status: "available" },
      { n: 12, seats: 6, status: "occupied" },
    ];
    return (
      '<div class="demo-screen" data-screen="tables">' +
      screenHeader("Tables", "Visual table map — available, occupied, and reserved states") +
      '<div class="demo-table-legend">' +
      '<span><i class="demo-table-dot available"></i> Available (5)</span>' +
      '<span><i class="demo-table-dot occupied"></i> Occupied (5)</span>' +
      '<span><i class="demo-table-dot reserved"></i> Reserved (2)</span>' +
      "</div>" +
      '<div class="demo-table-grid">' +
      tables.map(function (t) {
        return (
          '<div class="demo-table demo-table-' + t.status + '">' +
          "<strong>T" + t.n + "</strong><span>" + t.seats + " seats</span></div>"
        );
      }).join("") +
      "</div></div>"
    );
  }

  function renderFinances() {
    return (
      '<div class="demo-screen" data-screen="finances">' +
      screenHeader("Finances", "Revenue, expenses, and profit overview") +
      statGrid([
        { l: "Weekly Revenue", v: "$24,820", s: "86 orders", up: true },
        { l: "Monthly Expenses", v: "$18,450", s: "Last 30 days" },
        { l: "Net (est.)", v: "$6,370", s: "Weekly margin", up: true },
      ]) +
      '<div class="demo-upload-zone demo-upload-sm">🧾 Scan receipt — AI extracts vendor, amount, and category</div>' +
      '<div class="demo-panel"><div class="demo-panel-head">Recent expenses</div>' +
      '<div class="demo-list-item"><span>Sysco — Produce</span><span class="badge-open">Food</span><span>$1,842</span></div>' +
      '<div class="demo-list-item"><span>US Foods — Protein</span><span class="badge-open">Food</span><span>$2,104</span></div>' +
      '<div class="demo-list-item"><span>PG&amp;E — Utilities</span><span class="badge-done">Ops</span><span>$680</span></div>' +
      '<div class="demo-list-item"><span>Local Linen Co.</span><span class="badge-done">Ops</span><span>$240</span></div>' +
      "</div></div>"
    );
  }

  function renderSocial() {
    var tabs = [
      { id: "compose", label: "Compose" },
      { id: "accounts", label: "Accounts" },
      { id: "traffic", label: "Website Traffic" },
      { id: "posts", label: "Posts" },
    ];
    var tabHtml = tabs.map(function (t) {
      return '<button type="button" class="demo-subtab' + (state.socialTab === t.id ? " active" : "") + '" data-social-tab="' + t.id + '">' + t.label + "</button>";
    }).join("");

    var content =
      state.socialTab === "accounts"
        ? '<div class="demo-social-accounts">' +
          '<div class="demo-social-acct connected"><strong>Instagram</strong><span>2,840 followers · Connected</span></div>' +
          '<div class="demo-social-acct connected"><strong>Facebook</strong><span>1,120 followers · Connected</span></div>' +
          '<div class="demo-social-acct connected"><strong>Google Business</strong><span>4.6★ · 142 reviews</span></div></div>'
        : state.socialTab === "traffic"
          ? statGrid([
              { l: "Visitors (30d)", v: "4,280", s: "+12%" },
              { l: "Page views", v: "12,400", s: "3.2 pages/session" },
              { l: "Bounce rate", v: "38%", s: "Improving" },
            ])
          : state.socialTab === "posts"
            ? '<div class="demo-card"><div class="demo-list-item"><span>Saturday brunch promo</span><span class="badge-preparing">Scheduled</span><span>Fri 9am</span></div>' +
              '<div class="demo-list-item"><span>New menu item spotlight</span><span class="badge-served">Published</span><span>Mon</span></div></div>'
            : '<div class="demo-compose"><label>Draft post</label>' +
              '<div class="demo-compose-box">Saturday brunch is back — reserve your patio table. #DowntownBistro</div>' +
              '<div class="demo-compose-actions"><button type="button" class="demo-action-btn">Schedule</button></div></div>';

    return (
      '<div class="demo-screen" data-screen="social">' +
      screenHeader("Social Media", "Publish posts, manage accounts, and track website traffic") +
      '<div class="demo-subtabs">' + tabHtml + "</div>" + content +
      "</div>"
    );
  }

  function isDesktopLayout(container) {
    return !!(container && container.id === "app-embed-modal-body");
  }

  function renderDemo(container) {
    var desktop = isDesktopLayout(container);
    var layoutClass = desktop ? "pinnacle-demo--desktop" : "pinnacle-demo--mobile";
    var navHtml = NAV.map(function (item) {
      return (
        '<button type="button" class="demo-nav-item' +
        (state.screen === item.id ? " active" : "") +
        '" data-screen="' +
        item.id +
        '" title="' +
        item.label +
        '">' + navIcon(item.icon) +
        '<span class="demo-nav-label">' +
        item.label +
        "</span></button>"
      );
    }).join("");

    var screens =
      renderDashboard() +
      renderPhotos() +
      renderMenu() +
      renderInventory() +
      renderStaff() +
      renderTables() +
      renderOrders() +
      renderFinances() +
      renderAnalytics() +
      renderSocial() +
      renderInsights();

    var mobileNavHtml = getMobileNavItems().map(function (item) {
      return (
        '<button type="button" class="demo-mobile-nav-item' +
        (state.screen === item.id ? " active" : "") +
        '" data-screen="' + item.id + '">' + navIcon(item.icon) +
        '<span>' + mobileNavLabel(item) + "</span></button>"
      );
    }).join("");

    var moreNavActive = state.mobileMenuOpen || isMoreNavScreen();
    mobileNavHtml +=
      '<button type="button" class="demo-mobile-nav-item demo-mobile-more-toggle' +
      (moreNavActive ? " active" : "") +
      '" aria-expanded="' + (state.mobileMenuOpen ? "true" : "false") +
      '" aria-controls="demo-mobile-more-menu" aria-label="More modules">' +
      '<span class="demo-nav-icon" aria-hidden="true">' + ICON_MENU + "</span>" +
      "<span>More</span></button>";

    var moreMenuHtml = "";
    if (desktop) {
      moreMenuHtml = "";
    } else {
      var moreItemsHtml = getMoreNavItems().map(function (item) {
        return (
          '<button type="button" class="demo-mobile-more-item' +
          (state.screen === item.id ? " active" : "") +
          '" data-screen="' + item.id + '">' + navIcon(item.icon) +
          "<span>" + item.label + "</span></button>"
        );
      }).join("");
      moreMenuHtml =
        '<div class="demo-mobile-more' + (state.mobileMenuOpen ? " open" : "") +
        '" id="demo-mobile-more-menu" role="dialog" aria-label="All modules">' +
        '<button type="button" class="demo-mobile-more-backdrop" aria-label="Close menu"></button>' +
        '<div class="demo-mobile-more-panel">' +
        '<div class="demo-mobile-more-head">' +
        '<span>All modules</span>' +
        '<button type="button" class="demo-mobile-more-close" aria-label="Close menu">' +
        ICON_CLOSE +
        "</button></div>" +
        '<div class="demo-mobile-more-list">' + moreItemsHtml + "</div>" +
        "</div></div>";
    }

    return (
      '<div class="pinnacle-demo ' + layoutClass + '" id="pinnacle-live-demo">' +
      '<header class="demo-mobile-header" aria-label="App header">' +
      '<img src="./assets/logo-nav.svg" alt="Pinnacle" class="demo-mobile-logo" width="140" height="28" />' +
      "</header>" +
      '<aside class="demo-sidebar">' +
      '<div class="demo-sidebar-brand">' +
      '<img src="./assets/logo-nav.svg" alt="Pinnacle" class="demo-sidebar-logo" width="140" height="28" />' +
      "</div>" +
      '<nav class="demo-sidebar-nav" aria-label="App navigation">' +
      navHtml +
      "</nav>" +
      '<div class="demo-sidebar-footer">' +
      '<div class="demo-user-name">Jordan Mitchell</div>' +
      '<span class="demo-user-badge">Owner</span>' +
      '<button type="button" class="demo-sign-out">Sign out</button>' +
      '<label class="demo-location-label">Location</label>' +
      '<select class="demo-location-select" aria-label="Switch location">' +
      '<option value="downtown" selected>Downtown Bistro</option>' +
      '<option value="midtown">Midtown Location</option>' +
      "</select>" +
      "</div></aside>" +
      '<div class="demo-main">' +
      '<div class="demo-main-inner">' +
      screens +
      "</div></div>" +
      '<nav class="demo-mobile-nav" aria-label="Mobile navigation">' + mobileNavHtml + "</nav>" +
      moreMenuHtml +
      "</div>"
    );
  }

  function setMobileMenuOpen(container, open) {
    state.mobileMenuOpen = open;
    if (!container) return;
    var menu = container.querySelector(".demo-mobile-more");
    var toggle = container.querySelector(".demo-mobile-more-toggle");
    if (menu) menu.classList.toggle("open", open);
    if (toggle) {
      toggle.classList.toggle("active", open || isMoreNavScreen());
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function showScreen(screenId, container) {
    state.screen = screenId;
    state.mobileMenuOpen = false;
    refreshDemo(container);
  }

  function toggleMobileMenu(container) {
    setMobileMenuOpen(container, !state.mobileMenuOpen);
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

  function getDemoContainer() {
    var modal = document.getElementById("app-embed-modal");
    if (modal && modal.classList.contains("open")) {
      return document.getElementById("app-embed-modal-body");
    }
    return document.getElementById("hero-app-embed");
  }

  function mountDemo(container) {
    if (!container) return;
    lastDemoContainer = container;
    var scroll = container.querySelector(".demo-main");
    var scrollTop = scroll ? scroll.scrollTop : 0;
    container.innerHTML = renderDemo(container);
    var newScroll = container.querySelector(".demo-main");
    if (newScroll) newScroll.scrollTop = scrollTop;
    bindDemoEvents(container);
  }

  function refreshDemo(container) {
    mountDemo(container || lastDemoContainer || getDemoContainer());
  }

  function bindDemoEvents(container) {
    container.querySelectorAll(".demo-nav-item").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        showScreen(btn.getAttribute("data-screen"), container);
      });
    });

    container.querySelectorAll(".demo-link-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var goto = btn.getAttribute("data-goto");
        var scenario = btn.getAttribute("data-scenario");
        if (goto && !scenario) {
          showScreen(goto, container);
          return;
        }
        runAnalysis(scenario || state.scenarioKey);
      });
    });

    container.querySelectorAll("[data-screen]").forEach(function (btn) {
      if (
        btn.classList.contains("demo-nav-item") ||
        btn.classList.contains("demo-mobile-nav-item") ||
        btn.classList.contains("demo-mobile-more-item")
      ) {
        return;
      }
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        showScreen(btn.getAttribute("data-screen"), container);
      });
    });

    container.querySelectorAll(".cc-quick-chip, .cc-dash-cmd").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        e.stopPropagation();
        runAnalysis(chip.getAttribute("data-scenario"));
      });
    });

    var analyzeBtn = container.querySelector(".demo-analyze-btn");
    var input = container.querySelector(".demo-cc-input");
    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        runAnalysis(state.scenarioKey);
      });
    }
    if (input) {
      input.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      input.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") runAnalysis(state.scenarioKey);
      });
    }

    container.querySelectorAll(".demo-cc-chips .cc-chip").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        e.stopPropagation();
        runAnalysis(chip.getAttribute("data-scenario"));
      });
    });

    container.querySelectorAll(".demo-subtab[data-staff-tab]").forEach(function (tab) {
      tab.addEventListener("click", function (e) {
        e.stopPropagation();
        state.staffTab = tab.getAttribute("data-staff-tab");
        refreshDemo(container);
      });
    });

    container.querySelectorAll(".demo-subtab[data-social-tab]").forEach(function (tab) {
      tab.addEventListener("click", function (e) {
        e.stopPropagation();
        state.socialTab = tab.getAttribute("data-social-tab");
        refreshDemo(container);
      });
    });

    container.querySelectorAll(".demo-mobile-nav-item[data-screen]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        showScreen(btn.getAttribute("data-screen"), container);
      });
    });

    var moreToggle = container.querySelector(".demo-mobile-more-toggle");
    if (moreToggle) {
      moreToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        toggleMobileMenu(container);
      });
    }

    container.querySelectorAll(".demo-mobile-more-backdrop").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        setMobileMenuOpen(container, false);
      });
    });

    container.querySelectorAll(".demo-mobile-more-close").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        setMobileMenuOpen(container, false);
      });
    });

    container.querySelectorAll(".demo-mobile-more-item").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        showScreen(btn.getAttribute("data-screen"), container);
      });
    });

    container.querySelectorAll(".demo-mobile-more-panel").forEach(function (panel) {
      panel.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    });

    container.querySelectorAll(".demo-action-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    });

    container.querySelectorAll(".demo-analytics-tab").forEach(function (tab) {
      tab.addEventListener("click", function (e) {
        e.stopPropagation();
        state.analyticsTab = parseInt(tab.getAttribute("data-tab"), 10) || 0;
        refreshDemo(container);
      });
    });

    container.querySelectorAll(".demo-toolbar-pill").forEach(function (pill) {
      pill.addEventListener("click", function (e) {
        e.stopPropagation();
        var parent = pill.parentElement;
        if (parent) {
          parent.querySelectorAll(".demo-toolbar-pill").forEach(function (p) {
            p.classList.remove("active");
          });
        }
        pill.classList.add("active");
      });
    });

    container.querySelectorAll(".demo-table").forEach(function (table) {
      table.addEventListener("click", function (e) {
        e.stopPropagation();
        var statuses = ["available", "occupied", "reserved"];
        var cur = table.className.match(/demo-table-(\w+)/);
        var idx = cur ? statuses.indexOf(cur[1]) : 0;
        table.className = "demo-table demo-table-" + statuses[(idx + 1) % statuses.length];
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
    var modalBackdrop = document.getElementById("app-embed-modal-backdrop");
    var closeBtn = document.getElementById("app-embed-close");

    if (!heroSlot) return;

    mountDemo(heroSlot);

    function openModal() {
      if (!modal || !modalBody) return;
      mountDemo(modalBody);
      modal.classList.add("open");
      document.body.classList.add("modal-open");
    }

    function closeModal() {
      if (!modal || !heroSlot) return;
      modal.classList.remove("open");
      document.body.classList.remove("modal-open");
      mountDemo(heroSlot);
    }

    if (expandBtn) {
      expandBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        openModal();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeModal();
      });
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener("click", closeModal);
    }
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
