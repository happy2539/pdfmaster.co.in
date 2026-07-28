/*
 * PDFMaster Service Worker Registration
 * --------------------------------------
 * Include this one file on every page for consistent behaviour
 * site-wide:
 *
 *   <script src="/assets/js/sw-register.js" defer></script>
 *
 * Registers /sw.js, and - only when a visitor already has an older
 * version running in another tab - shows a small "Update available"
 * banner instead of silently swapping content out from under them
 * while they're mid-task in a tool.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var reloadingAfterUpdate = false;

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js')
      .then(setupUpdateFlow)
      .catch(function (err) {
        console.error('PDFMaster: service worker registration failed', err);
      });
  });

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    // Fires once the visitor has approved an update (see notifyUpdate
    // below) and the new worker has taken control. Reload once to pick
    // up the matching new HTML/CSS/JS together.
    if (reloadingAfterUpdate) return;
    reloadingAfterUpdate = true;
    window.location.reload();
  });

  function setupUpdateFlow(registration) {
    // Case 1: a new version already finished installing while this
    // tab was closed and is just waiting for someone to refresh.
    if (registration.waiting && navigator.serviceWorker.controller) {
      notifyUpdate(registration.waiting);
    }

    // Case 2: a new version starts installing while this tab is open.
    registration.addEventListener('updatefound', function () {
      var newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', function () {
        var alreadyControlled = Boolean(navigator.serviceWorker.controller);
        if (newWorker.state === 'installed' && alreadyControlled) {
          notifyUpdate(newWorker);
        }
      });
    });
  }

  function notifyUpdate(worker) {
    if (document.getElementById('pdfmaster-update-toast')) return;

    var toast = document.createElement('div');
    toast.id = 'pdfmaster-update-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<span>A new version of PDFMaster is ready.</span>' +
      '<button type="button" id="pdfmaster-update-btn">Refresh</button>' +
      '<button type="button" id="pdfmaster-update-dismiss" aria-label="Dismiss">&times;</button>';

    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      bottom: '20px',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      borderRadius: '10px',
      background: '#1f1f1f',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      zIndex: '999999',
      maxWidth: 'calc(100vw - 32px)',
    });

    document.body.appendChild(toast);

    var refreshBtn = document.getElementById('pdfmaster-update-btn');
    var dismissBtn = document.getElementById('pdfmaster-update-dismiss');

    Object.assign(refreshBtn.style, {
      background: '#d1301f',
      color: '#ffffff',
      border: 'none',
      borderRadius: '6px',
      padding: '6px 14px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
    });
    Object.assign(dismissBtn.style, {
      background: 'transparent',
      color: '#b3b3b3',
      border: 'none',
      fontSize: '18px',
      lineHeight: '1',
      cursor: 'pointer',
      padding: '0 4px',
    });

    refreshBtn.addEventListener('click', function () {
      worker.postMessage({ type: 'SKIP_WAITING' });
      toast.remove();
    });
    dismissBtn.addEventListener('click', function () {
      toast.remove();
    });

    // Style hook: add a CSS rule targeting #pdfmaster-update-toast in
    // your own stylesheet (loaded after this script runs) to fully
    // replace these inline defaults with your brand styling and your
    // dark/light theme tokens - see README.md.
  }
})();
