/**
 * Telegram Web App entegrasyonu
 * - Tema renkleri (koyu/açık)
 * - Tam ekran expand
 * - initData ile telegramId (web_app ile açıldığında ?tg= yoksa kullan)
 */
(function() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.ready();
  tg.expand();

  // Tema: localStorage öncelikli, yoksa Telegram teması
  const savedTheme = typeof localStorage !== 'undefined' && localStorage.getItem('theme');
  if (!savedTheme) {
    const theme = tg.colorScheme || 'light';
    if (theme === 'dark') document.body.classList.remove('light');
    else document.body.classList.add('light');
    tg.onEvent('themeChanged', () => {
      if (tg.colorScheme === 'dark') document.body.classList.remove('light');
      else document.body.classList.add('light');
    });
  }

  // Sipariş başarılı olunca web app'i kapatmak için (menu.html'den çağrılır)
  window.closeTelegramWebApp = () => { try { tg.close(); } catch (_) {} };
})();
