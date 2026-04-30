export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (import.meta.env.DEV || isLocalhost) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if (registrations.length > 0 && navigator.serviceWorker.controller) {
          window.location.reload();
        }
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
            window.dispatchEvent(new CustomEvent('agriscan:update-ready'));
          }
        });
      });
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  });
}
