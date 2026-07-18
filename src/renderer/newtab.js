(() => {
  const form = document.getElementById('newtab-search-form');
  const input = document.getElementById('newtab-search-input');

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const value = input.value.trim();
    if (value) window.refract.nav.go(value);
  });

  document.querySelectorAll('.newtab-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const url = tile.dataset.url;
      if (url) window.refract.nav.go(url);
    });
  });
})();
