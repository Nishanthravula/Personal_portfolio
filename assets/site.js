// The light/dark switch and the case-study dialogs.

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

  // ---- case studies: project tiles open a dialog; #case-name links open it directly ----
  const cases = [...document.querySelectorAll("dialog.case")];
  let opener = null;
  function openCase(name, from) {
    const d = document.getElementById(`case-${name}`);
    if (!d || d.open) return;
    opener = from || null;
    d.showModal();
    d.querySelector(".case-body").scrollTop = 0;
    if (location.hash !== `#${name}`) history.pushState(null, "", `#${name}`);
  }
  function closeCase(d) {
    if (d.open) d.close();
  }
  document.querySelectorAll("[data-case]").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.case, b)));
  cases.forEach((d) => {
    d.querySelector(".case-close")?.addEventListener("click", () => closeCase(d));
    // click on the dimmed backdrop closes
    d.addEventListener("click", (e) => {
      if (e.target === d) closeCase(d);
    });
    d.addEventListener("close", () => {
      if (location.hash === `#${d.id.replace("case-", "")}`) history.pushState(null, "", location.pathname + location.search);
      opener?.focus({ preventScroll: true });
      opener = null;
      document.documentElement.style.overflow = "";
    });
    d.addEventListener("toggle", () => (document.documentElement.style.overflow = d.open ? "hidden" : ""));
  });
  const fromHash = () => {
    const name = location.hash.slice(1);
    cases.forEach((d) => d.open && d.id !== `case-${name}` && d.close());
    if (document.getElementById(`case-${name}`)) openCase(name);
  };
  window.addEventListener("popstate", fromHash);
  fromHash();

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

  // Highlight the current section in the header.
  const links = [...document.querySelectorAll(".site-head nav a")];
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
