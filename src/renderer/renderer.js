(() => {
  const tabsContainer = document.getElementById('tabs-container');
  const addressInput = document.getElementById('address-input');
  const backBtn = document.getElementById('back-btn');
  const fwdBtn = document.getElementById('fwd-btn');
  const reloadBtn = document.getElementById('reload-btn');
  const newTabBtn = document.getElementById('new-tab-btn');
  const minBtn = document.getElementById('min-btn');
  const maxBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');

  let currentState = { activeTabId: null, tabs: [] };
  let addressFocused = false;

  function render(state) {
    currentState = state;
    tabsContainer.innerHTML = '';

    for (const tab of state.tabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '');
      el.dataset.id = String(tab.id);

      const indicator = document.createElement('div');
      indicator.className = tab.loading ? 'tab-spinner' : 'tab-favicon';
      if (!tab.loading) {
        indicator.style.width = '9px';
        indicator.style.height = '9px';
      }
      el.appendChild(indicator);

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title || tab.url || 'New Tab';
      el.appendChild(title);

      const close = document.createElement('div');
      close.className = 'tab-close';
      close.innerHTML = '<svg viewBox="0 0 10 10"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2"/></svg>';
      close.addEventListener('click', (ev) => {
        ev.stopPropagation();
        window.refract.tabs.close(tab.id);
      });
      el.appendChild(close);

      el.addEventListener('click', () => window.refract.tabs.activate(tab.id));
      tabsContainer.appendChild(el);
    }

    const active = state.tabs.find((t) => t.id === state.activeTabId);
    if (active && !addressFocused) {
      addressInput.value = active.url === 'about:blank' ? '' : active.url;
    }
    backBtn.disabled = !active?.canGoBack;
    fwdBtn.disabled = !active?.canGoForward;
  }

  window.refract.tabs.onState(render);
  window.refract.tabs.get().then(render);

  newTabBtn.addEventListener('click', () => window.refract.tabs.create());

  addressInput.addEventListener('focus', () => {
    addressFocused = true;
    addressInput.select();
  });
  addressInput.addEventListener('blur', () => {
    addressFocused = false;
  });
  addressInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      window.refract.nav.go(addressInput.value);
      addressInput.blur();
    } else if (ev.key === 'Escape') {
      addressInput.blur();
    }
  });

  backBtn.addEventListener('click', () => window.refract.nav.back());
  fwdBtn.addEventListener('click', () => window.refract.nav.forward());
  reloadBtn.addEventListener('click', () => window.refract.nav.reload());

  minBtn.addEventListener('click', () => window.refract.window.minimize());
  maxBtn.addEventListener('click', () => window.refract.window.maximize());
  closeBtn.addEventListener('click', () => window.refract.window.close());

  document.addEventListener('keydown', (ev) => {
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key === 't') {
      ev.preventDefault();
      window.refract.tabs.create();
    } else if (mod && ev.key === 'w') {
      ev.preventDefault();
      if (currentState.activeTabId) window.refract.tabs.close(currentState.activeTabId);
    } else if (mod && ev.key === 'l') {
      ev.preventDefault();
      addressInput.focus();
    } else if (mod && ev.key === 'r') {
      ev.preventDefault();
      window.refract.nav.reload();
    }
  });
})();
