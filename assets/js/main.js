'use strict';

(function () {
  const root = document.documentElement;
  root.classList.add('is-enhanced');

  const preload = document.querySelector('link[rel="preload"][as="style"]');
  if (preload && !document.querySelector('link[data-main-stylesheet]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = preload.href;
    stylesheet.dataset.mainStylesheet = '';
    document.head.appendChild(stylesheet);
  }

  const storage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (_) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (_) { return false; }
      return true;
    }
  };

  const cookieBanner = document.querySelector('[data-cookie-banner]');
  if (cookieBanner) {
    if (!storage.get('vlr_cookie_consent')) cookieBanner.hidden = false;
    cookieBanner.addEventListener('click', function (event) {
      const button = event.target.closest('[data-cookie-choice]');
      if (!button) return;
      storage.set('vlr_cookie_consent', button.dataset.cookieChoice || 'necessary');
      cookieBanner.hidden = true;
    });
  }

  const desktopQuery = window.matchMedia('(min-width: 768px)');
  document.querySelectorAll('[data-footer-accordion]').forEach(function (section) {
    const button = section.querySelector('button[aria-expanded]');
    if (!button) return;
    button.hidden = false;
    const sync = function () {
      if (desktopQuery.matches) {
        section.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        button.disabled = true;
      } else {
        section.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        button.disabled = false;
      }
    };
    button.addEventListener('click', function () {
      if (desktopQuery.matches) return;
      const open = section.classList.toggle('is-open');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    desktopQuery.addEventListener ? desktopQuery.addEventListener('change', sync) : desktopQuery.addListener(sync);
    sync();
  });

  const panels = Array.from(document.querySelectorAll('[data-panel]'));
  const backdrop = document.querySelector('[data-panel-backdrop]');
  let activePanel = null;
  let returnFocus = null;
  let scrollPosition = 0;

  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function lockPage() {
    scrollPosition = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollPosition}px`;
    document.body.style.width = '100%';
    document.body.classList.add('is-locked');
  }

  function unlockPage() {
    document.body.classList.remove('is-locked');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollPosition);
  }

  function setTriggers(panel, expanded) {
    document.querySelectorAll(`[data-panel-open="${panel.id}"]`).forEach(function (trigger) {
      trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  }

  function openPanel(panel, trigger) {
    if (!panel) return;
    if (activePanel) closePanel(activePanel, false, false);
    activePanel = panel;
    returnFocus = trigger || document.activeElement;
    lockPage();
    if (backdrop) backdrop.hidden = false;
    panel.hidden = false;
    document.documentElement.classList.add('has-open-panel');
    setTriggers(panel, true);
    const first = panel.querySelector(focusableSelector);
    if (first) first.focus();
  }

  function closePanel(panel, restoreFocus, movedBySwipe) {
    if (!panel || panel !== activePanel) return;
    panel.hidden = true;
    panel.classList.remove('is-open');
    if (backdrop) backdrop.hidden = true;
    document.documentElement.classList.remove('has-open-panel');
    setTriggers(panel, false);
    activePanel = null;
    unlockPage();
    if (restoreFocus !== false && returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    if (movedBySwipe) return;
  }

  document.querySelectorAll('[data-panel-open]').forEach(function (trigger) {
    trigger.hidden = false;
    trigger.addEventListener('click', function () {
      openPanel(document.getElementById(trigger.dataset.panelOpen), trigger);
    });
  });
  document.querySelectorAll('[data-search-open]').forEach(function (trigger) {
    trigger.hidden = false;
    trigger.addEventListener('click', function () {
      openPanel(document.getElementById('search-panel'), trigger);
    });
  });
  document.querySelectorAll('[data-panel-close]').forEach(function (button) {
    button.addEventListener('click', function () { closePanel(activePanel, true, false); });
  });
  if (backdrop) backdrop.addEventListener('click', function () { closePanel(activePanel, true, false); });

  document.addEventListener('keydown', function (event) {
    if (!activePanel) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel(activePanel, true, false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(activePanel.querySelectorAll(focusableSelector)).filter(function (node) { return !node.hidden && node.offsetParent !== null; });
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  panels.forEach(function (panel) {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    panel.addEventListener('touchstart', function (event) {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    panel.addEventListener('touchmove', function () {}, { passive: true });
    panel.addEventListener('touchend', function (event) {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (deltaX >= 80 && Math.abs(deltaY) < 60) closePanel(panel, true, true);
    }, { passive: true });
  });

  const searchForm = document.querySelector('[data-search-form]');
  if (searchForm) {
    searchForm.addEventListener('submit', function () {
      closePanel(activePanel, false, false);
    });
  }
}());
