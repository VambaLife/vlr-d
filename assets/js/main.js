'use strict';

(function () {
  const root = document.documentElement;
  const body = document.body;
  const appShell = document.getElementById('app-shell');
  const globalStatus = document.querySelector('[data-global-status]');
  root.classList.add('is-enhanced');

  function loadMainStylesheet() {
    const preload = document.querySelector('link[rel="preload"][as="style"]');
    if (!preload || document.querySelector('link[data-main-stylesheet]')) return;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = preload.href;
    stylesheet.dataset.mainStylesheet = '';
    document.head.appendChild(stylesheet);
  }

  function announce(message) {
    if (!globalStatus) return;
    globalStatus.textContent = '';
    window.setTimeout(function () { globalStatus.textContent = message; }, 0);
  }

  const safeStorage = {
    get(key) {
      try { return { ok: true, value: window.localStorage.getItem(key) }; }
      catch (_) { return { ok: false, value: null }; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); return true; }
      catch (_) { return false; }
    }
  };

  function initCookieBanner() {
    const banner = document.querySelector('[data-cookie-banner]');
    if (!banner) return;
    const key = 'vlr:cookie-consent:v1';
    const legacy = safeStorage.get('vlr_cookie_consent');
    let choice = safeStorage.get(key);
    if (!choice.ok) choice = { ok: false, value: null };
    if (!choice.value && legacy.ok && legacy.value) {
      choice = { ok: safeStorage.set(key, legacy.value), value: legacy.value };
    }
    if (choice.value) banner.hidden = true;
    else banner.hidden = false;
    banner.addEventListener('click', function (event) {
      const button = event.target.closest('[data-cookie-choice]');
      if (!button) return;
      const selected = button.dataset.cookieChoice === 'all' ? 'all' : 'necessary';
      safeStorage.set(key, selected);
      banner.hidden = true;
      announce(selected === 'all' ? 'Выбраны все категории хранения данных.' : 'Выбраны только необходимые данные.');
    });
  }

  function initFooterAccordions() {
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
      if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', sync);
      else desktopQuery.addListener(sync);
      sync();
    });
  }

  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  function visibleFocusable(container) {
    return Array.from(container.querySelectorAll(focusableSelector)).filter(function (node) {
      return !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.offsetParent !== null;
    });
  }

  function focusWithoutScroll(node) {
    if (!node || typeof node.focus !== 'function') return;
    try { node.focus({ preventScroll: true }); }
    catch (_) { node.focus(); }
  }

  function createOverlayController() {
    let current = null;
    let opener = null;
    let kind = '';
    let locked = false;
    let previousStyles = null;

    function lockPage() {
      if (locked) return;
      const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      previousStyles = {
        scrollY: window.scrollY,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        paddingRight: body.style.paddingRight
      };
      body.style.position = 'fixed';
      body.style.top = `-${previousStyles.scrollY}px`;
      body.style.width = '100%';
      if (scrollbarWidth) body.style.paddingRight = `${scrollbarWidth}px`;
      body.classList.add('is-locked');
      locked = true;
    }

    function unlockPage() {
      if (!locked) return;
      body.classList.remove('is-locked');
      body.style.position = previousStyles.position;
      body.style.top = previousStyles.top;
      body.style.width = previousStyles.width;
      body.style.paddingRight = previousStyles.paddingRight;
      window.scrollTo(0, previousStyles.scrollY);
      locked = false;
      previousStyles = null;
    }

    function isolateBackground(enabled) {
      if (!appShell) return;
      appShell.inert = enabled;
      if (enabled) appShell.setAttribute('aria-hidden', 'true');
      else appShell.removeAttribute('aria-hidden');
    }

    function updateTriggers(element, expanded) {
      document.querySelectorAll(`[data-panel-open="${element.id}"]`).forEach(function (trigger) {
        trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
      if (element.id === 'search-panel') {
        document.querySelectorAll('[data-search-open]').forEach(function (trigger) {
          trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
      }
    }

    function open(element, trigger, overlayKind, backdrop) {
      if (!element) return;
      if (current && current !== element) close(false);
      current = element;
      opener = trigger || document.activeElement;
      kind = overlayKind;
      lockPage();
      element.hidden = false;
      if (backdrop) backdrop.hidden = false;
      updateTriggers(element, true);
      root.classList.add('has-open-overlay');
      const focusable = visibleFocusable(element);
      if (focusable.length) focusWithoutScroll(focusable[0]);
      else {
        if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
        focusWithoutScroll(element);
      }
      isolateBackground(true);
    }

    function close(restoreFocus) {
      if (!current) return;
      const closing = current;
      const closingKind = kind;
      const closingOpener = opener;
      const associatedBackdrop = closingKind === 'lightbox'
        ? document.querySelector('[data-lightbox-backdrop]')
        : document.querySelector('[data-panel-backdrop]');
      if (associatedBackdrop) associatedBackdrop.hidden = true;
      closing.hidden = true;
      updateTriggers(closing, false);
      current = null;
      kind = '';
      opener = null;
      isolateBackground(false);
      root.classList.remove('has-open-overlay');
      unlockPage();
      if (restoreFocus !== false) {
        if (closingOpener && document.contains(closingOpener)) focusWithoutScroll(closingOpener);
        else focusWithoutScroll(document.getElementById('main-content'));
      }
    }

    document.addEventListener('keydown', function (event) {
      if (!current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = visibleFocusable(current);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !current.contains(document.activeElement))) {
        event.preventDefault();
        focusWithoutScroll(last);
      } else if (!event.shiftKey && (document.activeElement === last || !current.contains(document.activeElement))) {
        event.preventDefault();
        focusWithoutScroll(first);
      }
    });

    return { open, close, isOpen: function (element) { return current === element; } };
  }

  const overlays = createOverlayController();

  function initPanels() {
    const backdrop = document.querySelector('[data-panel-backdrop]');
    document.querySelectorAll('[data-panel-open]').forEach(function (trigger) {
      trigger.hidden = false;
      trigger.addEventListener('click', function () {
        overlays.open(document.getElementById(trigger.dataset.panelOpen), trigger, 'panel', backdrop);
      });
    });
    document.querySelectorAll('[data-search-open]').forEach(function (trigger) {
      trigger.hidden = false;
      trigger.addEventListener('click', function () { overlays.open(document.getElementById('search-panel'), trigger, 'panel', backdrop); });
    });
    document.querySelectorAll('[data-panel-close]').forEach(function (button) {
      button.addEventListener('click', function () { overlays.close(true); });
    });
    if (backdrop) backdrop.addEventListener('click', function () { overlays.close(true); });

    document.querySelectorAll('[data-panel][data-swipe-handle], [data-panel] [data-swipe-handle]').forEach(function (handle) {
      let startX = 0;
      let startY = 0;
      let tracking = false;
      handle.addEventListener('touchstart', function (event) {
        if (event.touches.length !== 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        tracking = startX >= 24;
      }, { passive: true });
      handle.addEventListener('touchend', function (event) {
        if (!tracking) return;
        tracking = false;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        if (deltaX >= 80 && Math.abs(deltaY) < 60) overlays.close(true);
      }, { passive: true });
    });

    const searchForm = document.querySelector('[data-search-form]');
    if (searchForm) searchForm.addEventListener('submit', function () { overlays.close(false); });
  }

  function initLightbox() {
    const lightbox = document.querySelector('[data-lightbox]');
    const items = Array.from(document.querySelectorAll('[data-gallery-open]'));
    if (!lightbox || !items.length) return;
    const backdrop = document.querySelector('[data-lightbox-backdrop]');
    const image = lightbox.querySelector('[data-lightbox-image]');
    const placeholder = lightbox.querySelector('[data-lightbox-placeholder]');
    const placeholderText = lightbox.querySelector('[data-lightbox-placeholder-text]');
    const counter = lightbox.querySelector('[data-lightbox-counter]');
    const previous = lightbox.querySelector('[data-lightbox-prev]');
    const next = lightbox.querySelector('[data-lightbox-next]');
    const close = lightbox.querySelector('[data-lightbox-close]');
    let currentIndex = 0;
    let opener = null;

    function update() {
      const item = items[currentIndex];
      const full = item.dataset.galleryFull || '';
      const alt = item.dataset.galleryAlt || `Фото ${currentIndex + 1}`;
      if (full) {
        image.alt = alt;
        image.src = full;
        image.hidden = false;
        placeholder.hidden = true;
      } else {
        image.removeAttribute('src');
        image.alt = '';
        image.hidden = true;
        placeholder.hidden = false;
        placeholderText.textContent = `Фото ${currentIndex + 1} из ${items.length} ожидает предоставления`;
      }
      counter.textContent = `Фото ${currentIndex + 1} из ${items.length}`;
    }

    function openAt(index, trigger) {
      currentIndex = Math.max(0, Math.min(items.length - 1, index));
      opener = trigger;
      update();
      overlays.open(lightbox, trigger, 'lightbox', backdrop);
    }

    items.forEach(function (item, index) {
      item.addEventListener('click', function (event) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openAt(index, item);
      });
    });
    image.addEventListener('error', function () {
      image.hidden = true;
      placeholder.hidden = false;
      placeholderText.textContent = 'Фотография не загрузилась. Проверьте файл на сервере.';
    });
    close.addEventListener('click', function () { overlays.close(true); });
    previous.addEventListener('click', function () { currentIndex = (currentIndex - 1 + items.length) % items.length; update(); });
    next.addEventListener('click', function () { currentIndex = (currentIndex + 1) % items.length; update(); });
    if (backdrop) backdrop.addEventListener('click', function () { overlays.close(true); });
    lightbox.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); currentIndex = (currentIndex - 1 + items.length) % items.length; update(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); currentIndex = (currentIndex + 1) % items.length; update(); }
      if (event.key === 'Home') { event.preventDefault(); currentIndex = 0; update(); }
      if (event.key === 'End') { event.preventDefault(); currentIndex = items.length - 1; update(); }
    });

    const stage = lightbox.querySelector('[data-lightbox-stage]');
    let startX = 0;
    let startY = 0;
    let tracking = false;
    stage.addEventListener('touchstart', function (event) {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = startX >= 24;
    }, { passive: true });
    stage.addEventListener('touchend', function (event) {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
      currentIndex = (currentIndex + (deltaX < 0 ? 1 : -1) + items.length) % items.length;
      update();
    }, { passive: true });
  }

  const knownProperties = new Set(
    String(body.dataset.knownProperties || '').split(',').filter(function (slug) { return /^[a-z0-9-]{1,80}$/.test(slug); })
  );

  function createSlugStore(key, limit) {
    let memory = [];
    let available = true;
    const listeners = new Set();

    function sanitize(values) {
      if (!Array.isArray(values)) return [];
      return [...new Set(values.filter(function (value) { return typeof value === 'string' && knownProperties.has(value); }))].slice(0, limit);
    }

    function get() {
      const stored = safeStorage.get(key);
      if (!stored.ok) { available = false; return [...memory]; }
      if (stored.value === null) { memory = []; return []; }
      try { memory = sanitize(JSON.parse(stored.value)); }
      catch (_) { memory = []; }
      return [...memory];
    }

    function set(values) {
      memory = sanitize(values);
      available = safeStorage.set(key, JSON.stringify(memory));
      listeners.forEach(function (listener) { listener([...memory], available); });
      return [...memory];
    }

    function replaceFromStorage() {
      memory = get();
      listeners.forEach(function (listener) { listener([...memory], available); });
    }

    return {
      get,
      set,
      subscribe(listener) { listeners.add(listener); },
      refresh: replaceFromStorage,
      isAvailable() { return available; }
    };
  }

  const favoriteStore = createSlugStore('vlr:v1:favorites', 100);
  const compareStore = createSlugStore('vlr:v1:compare', 4);
  const propertyBySlug = new Map();
  document.querySelectorAll('[data-property-card]').forEach(function (card) {
    const slug = card.dataset.propertySlug;
    if (!slug || !knownProperties.has(slug)) return;
    propertyBySlug.set(slug, card);
  });

  function propertyTitleFromButton(button) {
    const card = button.closest('[data-property-card]');
    return card?.dataset.title || 'Объект';
  }

  function initFavorites() {
    const buttons = Array.from(document.querySelectorAll('[data-favorite]'));
    if (!buttons.length) return;
    const grid = document.querySelector('[data-page="favorites"] [data-property-grid]');
    const empty = document.querySelector('[data-page="favorites"] [data-favorites-empty]');
    const count = document.querySelector('[data-favorite-count]');
    const warning = document.querySelector('[data-storage-warning]');
    const cards = Array.from(document.querySelectorAll('[data-page="favorites"] [data-property-card]'));

    function render(selected, available) {
      const selectedSet = new Set(selected);
      buttons.forEach(function (button) {
        const slug = button.dataset.favorite;
        const active = selectedSet.has(slug);
        button.hidden = false;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.setAttribute('aria-label', `${active ? 'Удалить' : 'Добавить'} ${propertyTitleFromButton(button)} ${active ? 'из' : 'в'} избранное`);
        const symbol = button.querySelector('span[aria-hidden="true"]');
        if (symbol) symbol.textContent = active ? '♥' : '♡';
      });
      if (grid) grid.hidden = selected.length === 0;
      if (empty) empty.hidden = selected.length !== 0;
      if (count) count.textContent = `Сохранено: ${selected.length}`;
      cards.forEach(function (card) { card.hidden = selected.length > 0 && !selectedSet.has(card.dataset.propertySlug); });
      if (warning) warning.hidden = available;
    }

    favoriteStore.subscribe(render);
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        const slug = button.dataset.favorite;
        const selected = favoriteStore.get();
        const active = selected.includes(slug);
        const next = active ? selected.filter((value) => value !== slug) : selected.concat(slug);
        favoriteStore.set(next);
        announce(active ? 'Объект удалён из избранного.' : 'Объект добавлен в избранное.');
      });
    });
    render(favoriteStore.get(), favoriteStore.isAvailable());
  }

  function initCompare() {
    const buttons = Array.from(document.querySelectorAll('[data-compare]'));
    const table = document.querySelector('[data-compare-table]');
    const count = document.querySelector('[data-compare-count]');
    const note = document.querySelector('[data-compare-note]');
    if (!buttons.length) return;

    function valueFor(card, key) {
      if (key === 'type') return card.dataset.typeLabel || 'Данные уточняются';
      if (key === 'deal') {
        const labels = { sale: 'Продажа', rent: 'Аренда' };
        return labels[card.dataset.deal] || 'Сделка уточняется';
      }
      if (key === 'specs') return 'Требуют проверки';
      return card.dataset[key] || '—';
    }

    function renderTable(selected) {
      if (!table) return;
      const headRow = table.tHead?.querySelector('tr');
      const bodyRows = Array.from(table.tBodies[0]?.rows || []);
      if (!headRow || !bodyRows.length) return;
      const parameterHead = document.createElement('th');
      parameterHead.scope = 'col';
      parameterHead.textContent = 'Параметр';
      headRow.replaceChildren(parameterHead);
      selected.forEach(function (slug) {
        const card = propertyBySlug.get(slug);
        const heading = document.createElement('th');
        heading.scope = 'col';
        heading.append(document.createTextNode(card?.dataset.title || slug));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'text-link';
        remove.dataset.removeCompare = slug;
        remove.textContent = 'Удалить';
        remove.setAttribute('aria-label', `Удалить ${card?.dataset.title || slug} из сравнения`);
        heading.append(remove);
        headRow.append(heading);
      });
      if (!selected.length) {
        const heading = document.createElement('th');
        heading.scope = 'col';
        heading.dataset.compareHeading = '';
        heading.textContent = 'Выберите объект';
        headRow.append(heading);
      }
      bodyRows.forEach(function (row) {
        const key = row.querySelector('th')?.dataset.row || '';
        const parameter = row.querySelector('th');
        const cells = Array.from(row.querySelectorAll('td'));
        cells.forEach(function (cell) { cell.remove(); });
        const values = selected.length ? selected.map(function (slug) { return valueFor(propertyBySlug.get(slug), key); }) : ['—'];
        values.forEach(function (value) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        });
        if (parameter && !parameter.textContent) parameter.textContent = key;
      });
    }

    function render(selected, available) {
      const selectedSet = new Set(selected);
      buttons.forEach(function (button) {
        const slug = button.dataset.compare;
        const active = selectedSet.has(slug);
        button.hidden = false;
        button.disabled = !active && selected.length >= 4;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.setAttribute('aria-label', `${active ? 'Удалить' : 'Добавить'} ${propertyTitleFromButton(button)} ${active ? 'из' : 'к'} сравнению`);
        const symbol = button.querySelector('span[aria-hidden="true"]');
        if (symbol) symbol.textContent = active ? '−' : '＋';
      });
      if (count) count.textContent = `Выбрано: ${selected.length} из 4`;
      if (note) note.hidden = selected.length < 4;
      renderTable(selected);
    }

    compareStore.subscribe(render);
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        const slug = button.dataset.compare;
        const selected = compareStore.get();
        if (selected.includes(slug)) {
          compareStore.set(selected.filter(function (value) { return value !== slug; }));
          announce('Объект удалён из сравнения.');
          return;
        }
        if (selected.length >= 4) {
          if (note) note.hidden = false;
          announce('Можно сравнить не более четырёх объектов.');
          return;
        }
        compareStore.set(selected.concat(slug));
        announce(`Объект добавлен к сравнению: ${selected.length + 1} из 4.`);
      });
    });
    table?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-remove-compare]');
      if (!button) return;
      const slug = button.dataset.removeCompare;
      compareStore.set(compareStore.get().filter(function (value) { return value !== slug; }));
      announce('Объект удалён из сравнения.');
    });
    render(compareStore.get(), compareStore.isAvailable());
  }

  function initSearch() {
    const form = document.querySelector('[data-search-page-form]');
    const cards = Array.from(document.querySelectorAll('[data-page="search"] [data-property-card]'));
    if (!form || !cards.length) return;
    const empty = document.querySelector('[data-empty-state]');
    const resultCount = document.querySelector('[data-result-count]');
    const queryInput = form.elements.q;
    const typeInput = form.elements.type;
    const dealInput = form.elements.deal;
    const priceMin = form.elements.price_min;
    const priceMax = form.elements.price_max;
    const areaMin = form.elements.area_min;
    const areaMax = form.elements.area_max;
    const district = form.elements.district;

    function number(value) {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function apply(params) {
      const q = String(params.get('q') || '').trim().slice(0, 100);
      const type = String(params.get('type') || '');
      const deal = String(params.get('deal') || '');
      const minPrice = number(params.get('price_min'));
      const maxPrice = number(params.get('price_max'));
      const minArea = number(params.get('area_min'));
      const maxArea = number(params.get('area_max'));
      const selectedDistrict = String(params.get('district') || '');
      queryInput.value = q;
      typeInput.value = type;
      dealInput.value = deal;
      if (!priceMin.disabled) priceMin.value = minPrice ?? '';
      if (!priceMax.disabled) priceMax.value = maxPrice ?? '';
      if (!areaMin.disabled) areaMin.value = minArea ?? '';
      if (!areaMax.disabled) areaMax.value = maxArea ?? '';
      if (!district.disabled) district.value = selectedDistrict;
      const normalizedQuery = q.toLocaleLowerCase('ru-RU');
      let visible = 0;
      cards.forEach(function (card) {
        const price = number(card.dataset.price);
        const area = number(card.dataset.area);
        const matches = (!normalizedQuery || card.dataset.searchText.includes(normalizedQuery))
          && (!type || card.dataset.type === type)
          && (!deal || card.dataset.deal === deal)
          && (minPrice === null || (price !== null && price >= minPrice))
          && (maxPrice === null || (price !== null && price <= maxPrice))
          && (minArea === null || (area !== null && area >= minArea))
          && (maxArea === null || (area !== null && area <= maxArea))
          && (!selectedDistrict || card.dataset.district === selectedDistrict);
        card.hidden = !matches;
        if (matches) visible += 1;
      });
      if (resultCount) resultCount.textContent = `Найдено: ${visible}`;
      if (empty) empty.hidden = visible !== 0;
    }

    function paramsFromForm() {
      const params = new URLSearchParams();
      for (const [key, input] of Object.entries(form.elements)) {
        if (!input || input.disabled || !input.value) continue;
        params.set(key, input.value);
      }
      return params;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const url = new URL(window.location.href);
      const params = paramsFromForm();
      url.search = params.toString();
      if (url.href !== window.location.href) history.pushState({ search: params.toString() }, '', url);
      apply(params);
    });
    window.addEventListener('popstate', function () { apply(new URL(window.location.href).searchParams); });
    apply(new URL(window.location.href).searchParams);
  }

  window.addEventListener('storage', function (event) {
    if (event.key === 'vlr:v1:favorites' || event.key === null) favoriteStore.refresh();
    if (event.key === 'vlr:v1:compare' || event.key === null) compareStore.refresh();
  });

  loadMainStylesheet();
  initCookieBanner();
  initFooterAccordions();
  initPanels();
  initLightbox();
  initFavorites();
  initCompare();
  initSearch();
}());
