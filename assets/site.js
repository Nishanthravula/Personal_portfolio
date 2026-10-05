// The light/dark switch.

(() => {
  "use strict";

  const root = document.documentElement;
  const themeBtn = document.getElementById("theme-toggle");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  const currentTheme = () => root.getAttribute("data-theme") || (systemDark.matches ? "dark" : "light");

  function syncThemeButton() {
    if (!themeBtn) return;
    const next = currentTheme() === "dark" ? "light" : "dark";
    themeBtn.textContent = next === "dark" ? "Dark" : "Light";
    themeBtn.setAttribute("aria-label", `Switch to ${next} theme`);
    const meta = document.querySelectorAll('meta[name="theme-color"]');
    meta.forEach((m) => {
      if (root.hasAttribute("data-theme")) m.setAttribute("content", currentTheme() === "dark" ? "#10161f" : "#eef1f4");
    });
  }

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      /* not persisted; still applies for this visit */
    }
    syncThemeButton();
    document.dispatchEvent(new Event("themechange"));
  }

  themeBtn?.addEventListener("click", toggleTheme);
  systemDark.addEventListener?.("change", syncThemeButton);
  syncThemeButton();

})();

// Layout behaviour shared by every page section.
(() => {
  "use strict";

  // Header: border once the page scrolls; collapsible menu on small screens.
  const head = document.querySelector(".site-head");
  const menuBtn = document.getElementById("menu-btn");
  const menu = document.getElementById("site-menu");
  if (head) {
    const onScroll = () => head.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  const setMenu = (open) => {
    if (!head || !menuBtn) return;
    head.toggleAttribute("data-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.textContent = open ? "Close" : "Menu";
  };
  menuBtn?.addEventListener("click", () => setMenu(!head.hasAttribute("data-open")));
  menu?.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && head?.hasAttribute("data-open")) {
      setMenu(false);
      menuBtn.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (head?.hasAttribute("data-open") && !head.contains(e.target)) setMenu(false);
  });
  window.matchMedia("(min-width: 48.01em)").addEventListener?.("change", (m) => m.matches && setMenu(false));

  // Range sliders: paint the filled part of the track.
  const paint = (r) => {
    const min = Number(r.min || 0);
    const max = Number(r.max || 100);
    r.style.setProperty("--fill", `${((Number(r.value) - min) / (max - min)) * 100}%`);
  };
  document.querySelectorAll('input[type="range"]').forEach((r) => {
    paint(r);
    r.addEventListener("input", () => paint(r));
  });

  // Text areas grow with their content (fallback for browsers without field-sizing).
  if (!CSS.supports?.("field-sizing", "content")) {
    document.querySelectorAll(".guard textarea").forEach((ta) => {
      const fit = () => {
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight + 2}px`;
      };
      ta.addEventListener("input", fit);
      if ("ResizeObserver" in window) new ResizeObserver(fit).observe(ta.parentElement);
      fit();
    });
  }

  // Highlight the current section in the rail and the header.
  const links = [...document.querySelectorAll('.rail a, .site-head nav a')];
  const sections = [...new Set(links.map((a) => a.getAttribute("href")))]
    .map((h) => document.querySelector(h))
    .filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    const visible = new Map();
    const update = () => {
      let current = null;
      for (const s of sections) if (visible.get(s)) { current = s; break; }
      if (!current) return;
      links.forEach((a) => {
        if (a.getAttribute("href") === `#${current.id}`) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target, e.isIntersecting));
        update();
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    sections.forEach((s) => io.observe(s));
  }
})();
