// Runs before first paint so a saved theme never flashes the wrong colors.
// The site is dark by default; "light" is opt-in and remembered.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
  } catch (e) {
    /* storage unavailable: stay on the default */
  }
})();
