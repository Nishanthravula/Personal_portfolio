// Command palette (Ctrl/Cmd + K or "/") and the light/dark switch.

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

  // ---------- palette ----------
  const dialog = document.getElementById("palette");
  const input = document.getElementById("palette-input");
  const list = document.getElementById("palette-list");
  const openBtn = document.getElementById("palette-open");
  if (!dialog || !input || !list) return;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const keyLabel = document.getElementById("palette-key");
  if (keyLabel) keyLabel.textContent = isMac ? "⌘K" : "Ctrl K";

  const go = (id) => () => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    const focusable = el.querySelector("input, button, textarea, a");
    (focusable || el).focus({ preventScroll: true });
  };
  const open = (url) => () => window.open(url, "_blank", "noopener");

  const ITEMS = [
    { group: "Figures", label: "Live anomaly detector", hint: "Figure 1", run: go("main") },
    { group: "Figures", label: "RSTAD dual-branch scoring", hint: "Figure 2", run: go("fig-rstad") },
    { group: "Figures", label: "Fairness threshold explorer", hint: "Figure 3", run: go("fig-fair") },
    { group: "Figures", label: "Secret redaction playground", hint: "Figure 4", run: go("fig-guard") },
    { group: "Figures", label: "Trace a request through the analytical layer", hint: "Figure 5", run: go("fig-serve") },
    { group: "Sections", label: "Research", run: go("research") },
    { group: "Sections", label: "Selected engineering", run: go("work") },
    { group: "Sections", label: "Experience", run: go("experience") },
    { group: "Sections", label: "Education", run: go("education") },
    { group: "Sections", label: "Tools I work with", run: go("skills") },
    { group: "Sections", label: "Earlier projects", run: go("earlier") },
    { group: "Sections", label: "Get in touch", run: go("contact") },
    {
      group: "Actions",
      label: "Inject an anomaly into Figure 1",
      run: () => {
        go("main")();
        document.dispatchEvent(new Event("inject-anomaly"));
      },
    },
    { group: "Actions", label: "Switch light or dark theme", run: toggleTheme },
    {
      group: "Actions",
      label: "Copy email address",
      hint: "nishanth.ravula@outlook.com",
      run: () => navigator.clipboard?.writeText("nishanth.ravula@outlook.com"),
    },
    { group: "Links", label: "Responsible AI audits on GitHub", run: open("https://github.com/Nishanthravula/responsible-ai-audits") },
    { group: "Links", label: "GitHub profile", run: open("https://github.com/Nishanthravula") },
    { group: "Links", label: "LinkedIn", run: open("https://www.linkedin.com/in/ravula-nishanth-0716/") },
  ];

  let results = ITEMS;
  let active = 0;
  let returnFocus = null;

  // Subsequence match, scored so earlier and contiguous matches rank first.
  function score(text, q) {
    if (!q) return 1;
    const t = text.toLowerCase();
    let ti = 0;
    let s = 0;
    let streak = 0;
    for (const ch of q) {
      const found = t.indexOf(ch, ti);
      if (found < 0) return 0;
      streak = found === ti ? streak + 1 : 0;
      s += 1 + streak * 2 - found * 0.01;
      ti = found + 1;
    }
    return s;
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    results = ITEMS.map((it) => ({ it, s: score(`${it.label} ${it.group} ${it.hint || ""}`, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => (q ? b.s - a.s : 0))
      .map((r) => r.it);
    active = Math.min(active, Math.max(0, results.length - 1));
    list.innerHTML = "";
    if (!results.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No matches. Try “figure”, “contact” or “theme”.";
      list.append(li);
      input.removeAttribute("aria-activedescendant");
      return;
    }
    let lastGroup = "";
    results.forEach((it, i) => {
      if (!q && it.group !== lastGroup) {
        const h = document.createElement("li");
        h.className = "group";
        h.setAttribute("role", "presentation");
        h.textContent = it.group;
        list.append(h);
        lastGroup = it.group;
      }
      const li = document.createElement("li");
      li.id = `pal-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      li.innerHTML = `<span></span>${it.hint ? "<small></small>" : ""}`;
      li.firstChild.textContent = it.label;
      if (it.hint) li.lastChild.textContent = it.hint;
      li.addEventListener("pointermove", () => {
        if (active !== i) {
          active = i;
          highlight();
        }
      });
      li.addEventListener("click", () => choose(i));
      list.append(li);
    });
    highlight();
  }

  function highlight() {
    list.querySelectorAll('[role="option"]').forEach((li) => {
      const on = li.id === `pal-${active}`;
      li.setAttribute("aria-selected", String(on));
      if (on) li.scrollIntoView({ block: "nearest" });
    });
    input.setAttribute("aria-activedescendant", `pal-${active}`);
  }

  function choose(i) {
    const it = results[i];
    if (!it) return;
    close(false);
    it.run();
  }

  function show() {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    input.value = "";
    active = 0;
    render();
    dialog.showModal();
    input.focus();
  }

  function close(restore = true) {
    if (!dialog.open) return;
    dialog.close();
    if (restore) returnFocus?.focus?.();
  }

  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = (active + 1) % results.length;
      highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = (active - 1 + results.length) % results.length;
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    }
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });

  openBtn?.addEventListener("click", show);
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      dialog.open ? close() : show();
    } else if (e.key === "/" && !typing && !dialog.open) {
      e.preventDefault();
      show();
    }
  });
})();
