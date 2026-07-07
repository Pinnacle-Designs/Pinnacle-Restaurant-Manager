/**
 * Fixed "back to top" control for long docs pages.
 */
(function () {
  var SCROLL_THRESHOLD = 480;

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "back-to-top";
  btn.setAttribute("aria-label", "Back to top");
  btn.setAttribute("aria-hidden", "true");
  btn.tabIndex = -1;
  btn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true">' +
    '<path d="m18 15-6-6-6 6"/></svg>' +
    '<span class="back-to-top-label">Top</span>';

  document.body.appendChild(btn);

  function scrollToTop() {
    var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  btn.addEventListener("click", scrollToTop);

  function updateVisibility() {
    var show = window.scrollY > SCROLL_THRESHOLD;
    btn.classList.toggle("is-visible", show);
    btn.setAttribute("aria-hidden", show ? "false" : "true");
    btn.tabIndex = show ? 0 : -1;
  }

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
})();
