// Apply the saved theme before first paint to avoid a flash. Lives in its
// own file (rather than inline in index.html) so the CSP can stay strict
// with script-src 'self'.
(function () {
  try {
    var p = localStorage.getItem('theme-pref') || 'system';
    var dark =
      p === 'dark' ||
      (p === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark-mode');
  } catch (e) {
    // no storage access — fall back to the light theme
  }
})();
