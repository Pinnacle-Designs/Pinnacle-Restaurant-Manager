/**
 * Private pitch deck request form — posts to the live app API.
 */
(function () {
  var PROBE_PORTS = ["3000", "3001", "3002", "3003", "3004", "3005"];

  function configuredAppUrl() {
    var cfg = window.PINNACLE_CONFIG || {};
    return (cfg.appUrl || "").replace(/\/$/, "");
  }

  function isDocsOnNextApp() {
    var port = location.port || (location.protocol === "https:" ? "443" : "80");
    return (
      location.pathname.indexOf("/docs") === 0 &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
      PROBE_PORTS.indexOf(port) !== -1
    );
  }

  function resolveAppUrl() {
    if (isDocsOnNextApp()) return location.origin;
    var configured = configuredAppUrl();
    if (configured) return configured;
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return "http://" + location.hostname + ":3000";
    }
    return "";
  }

  function setStatus(el, text, ok) {
    el.hidden = false;
    el.textContent = text;
    el.className = "pitch-form-status " + (ok ? "is-success" : "is-error");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("pitch-request-form");
    var status = document.getElementById("pitch-form-status");
    if (!form || !status) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var appUrl = resolveAppUrl();
      if (!appUrl) {
        setStatus(
          status,
          "Could not reach the app. Set appUrl in config.js or open this page via the running Next.js server.",
          false
        );
        return;
      }

      var submitBtn = form.querySelector(".pitch-form-submit");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }

      var data = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        company: form.company.value.trim(),
        interest: form.interest.value,
        message: form.message.value.trim(),
      };

      fetch(appUrl + "/api/pitch-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
        .then(function (res) {
          return res.json().then(function (json) {
            return { ok: res.ok, json: json };
          });
        })
        .then(function (result) {
          if (result.ok) {
            setStatus(status, result.json.message || "Request received. We'll be in touch.", true);
            form.reset();
          } else {
            setStatus(status, result.json.error || "Could not submit request.", false);
          }
        })
        .catch(function () {
          setStatus(status, "Network error. Try again or email support directly.", false);
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Request private pitch deck";
          }
        });
    });
  });
})();
