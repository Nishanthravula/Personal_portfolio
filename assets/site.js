// The light/dark switch and the reading-depth switch.

(() => {
  "use strict";

  const root = document.documentElement;
  const themeBtns = [...document.querySelectorAll("[data-theme-toggle], #theme-toggle")];
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  const currentTheme = () => root.getAttribute("data-theme") || (systemDark.matches ? "dark" : "light");

  function syncThemeButton() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    themeBtns.forEach((b) => {
      b.textContent = next === "dark" ? "Dark" : "Light";
      b.setAttribute("aria-label", `Switch to ${next} theme`);
    });
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

  themeBtns.forEach((b) => b.addEventListener("click", toggleTheme));
  systemDark.addEventListener?.("change", syncThemeButton);
  syncThemeButton();

  // ---- reading depth: "Full story" or the "30-second version" ----
  const depthBtns = [...document.querySelectorAll("[data-depth]")];
  const syncDepth = () => {
    const d = root.getAttribute("data-depth") === "skim" ? "skim" : "full";
    depthBtns.forEach((b) => b.hasAttribute("aria-pressed") && b.setAttribute("aria-pressed", String(b.dataset.depth === d)));
  };
  function setDepth(d) {
    if (d === "skim") root.setAttribute("data-depth", "skim");
    else root.removeAttribute("data-depth");
    try {
      localStorage.setItem("depth", d);
    } catch (e) {
      /* not persisted */
    }
    // Keep ?view= in the address in step, so a copied link opens the same version.
    try {
      const url = new URL(location.href);
      if (url.searchParams.has("view")) {
        url.searchParams.set("view", d);
        history.replaceState(null, "", url);
      }
    } catch (e) {
      /* ignore */
    }
    syncDepth();
    // Land at the top of the page so the change is visible.
    window.scrollTo({ top: 0, behavior: "auto" });
    document.dispatchEvent(new Event("depthchange"));
  }
  depthBtns.forEach((b) => b.addEventListener("click", () => setDepth(b.dataset.depth)));
  syncDepth();

  // Buttons that print the page (the résumé's "Save as PDF").
  document.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));

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

  // Highlight the current section in the profile panel and the header.
  const links = [...document.querySelectorAll(".front-nav a, .site-head nav a")];
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
