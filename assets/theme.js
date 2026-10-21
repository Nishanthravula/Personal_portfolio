// Runs before first paint so the page never flashes the wrong theme or reading depth.
(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
  } catch (e) {
    /* storage unavailable: follow the system theme */
  }
  // Reading depth: ?view=skim opens the 30-second version (a link you can send to recruiters);
  // otherwise use the visitor's last choice.
  var depth = null;
  try {
    var v = new URLSearchParams(location.search).get("view");
    if (v === "skim" || v === "full") depth = v;
    if (!depth) depth = localStorage.getItem("depth");
  } catch (e) {
    /* ignore */
  }
  if (depth === "skim") root.setAttribute("data-depth", "skim");
})();
