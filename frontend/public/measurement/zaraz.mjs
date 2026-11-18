import { startMeasurement } from './bootstrap.mjs';

export function startZarazMeasurement(options = {}) {
  if (window.__avilaZarazStartup) return window.__avilaZarazStartup();
  let pending;
  let retryRequested = false;
  const attempt = () => {
    if (window.__avilaMeasurement) return Promise.resolve(window.__avilaMeasurement);
    if (pending) { retryRequested = true; return pending; }
    pending = startMeasurement({ ...options, consentAdapter: 'zaraz' })
      .catch(() => undefined)
      .finally(() => {
        pending = null;
        const retry = retryRequested;
        retryRequested = false;
        if (retry && !window.__avilaMeasurement) attempt();
      });
    return pending;
  };
  window.__avilaZarazStartup = attempt;
  document.addEventListener('zarazConsentAPIReady', attempt);
  document.addEventListener('zarazConsentChoicesUpdated', attempt);
  return attempt();
}
