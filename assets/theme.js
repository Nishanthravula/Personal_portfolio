// Runs before first paint so a saved theme never flashes the wrong colors.
try {
  var saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
} catch (e) {
  /* storage unavailable: follow the system theme */
}
