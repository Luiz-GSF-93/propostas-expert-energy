'use client';

import { useEffect, useState } from 'react';

function buildAuditBootstrap(token: string) {
  const safeToken = JSON.stringify(token);

  return `
<script>
(function () {
  var TOKEN = ${safeToken};
  var sentAt = Object.create(null);

  function findDiagnosticId() {
    try {
      var href = String(window.location.href || '');
      var ref = String(document.referrer || '');
      var text = href + ' ' + ref;
      var match = text.match(/\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b/i);
      return match ? match[0] : null;
    } catch (_) {
      return null;
    }
  }

  function shouldSend(key, cooldownMs) {
    var now = Date.now();
    var last = sentAt[key] || 0;
    if (now - last < cooldownMs) return false;
    sentAt[key] = now;
    return true;
  }

  function sendAudit(action, method) {
    try {
      fetch('/api/audit/html-event', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + TOKEN
        },
        body: JSON.stringify({
          action: action,
          method: method || null,
          diagnosticId: findDiagnosticId(),
          href: window.location.href,
          referrer: document.referrer
        })
      }).catch(function(){});
    } catch (_) {}
  }

  window.addEventListener('load', function () {
    if (shouldSend('shell_html_carregado', 1000)) {
      sendAudit('shell_html_carregado', 'load');
    }
  }, { once: true });

  document.addEventListener('copy', function () {
    if (shouldSend('tentativa_copia_html', 2500)) {
      sendAudit('tentativa_copia_html', 'copy');
    }
  }, true);

  document.addEventListener('cut', function () {
    if (shouldSend('tentativa_recorte_html', 2500)) {
      sendAudit('tentativa_recorte_html', 'cut');
    }
  }, true);

  document.addEventListener('contextmenu', function () {
    if (shouldSend('menu_contexto_html', 2500)) {
      sendAudit('menu_contexto_html', 'contextmenu');
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    var key = String(e.key || '').toLowerCase();
    var mod = !!(e.ctrlKey || e.metaKey);

    if (!mod) return;

    if (key === 'c' && shouldSend('atalho_copia_html', 2500)) {
      sendAudit('atalho_copia_html', 'ctrl+c');
    }

    if (key === 'p' && shouldSend('atalho_impressao_html', 2500)) {
      sendAudit('atalho_impressao_html', 'ctrl+p');
    }

    if (key === 's' && shouldSend('atalho_salvar_html', 2500)) {
      sendAudit('atalho_salvar_html', 'ctrl+s');
    }
  }, true);

  window.addEventListener('beforeprint', function () {
    if (shouldSend('tentativa_impressao_html', 2500)) {
      sendAudit('tentativa_impressao_html', 'beforeprint');
    }
  });

  window.addEventListener('pagehide', function () {
    if (shouldSend('tentativa_salvar_html', 2500)) {
      sendAudit('tentativa_salvar_html', 'pagehide');
    }
  });
})();
</script>
`;
}

export default function EnergiaProPrivatePage() {
  const [message, setMessage] = useState('Aguardando autenticação do diagnóstico...');

  useEffect(() => {
    let cancelled = false;
    let booted = false;

    async function bootWithToken(token: string) {
      if (booted || !token) return;
      booted = true;

      try {
        setMessage('Carregando EnergiaPro privado...');

        const response = await fetch('/api/energiapro-html', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Falha ao carregar HTML privado (${response.status}): ${text}`);
        }

        let html = await response.text();
        const auditScript = buildAuditBootstrap(token);

        if (html.includes('</body>')) {
          html = html.replace('</body>', auditScript + '\n</body>');
        } else {
          html += auditScript;
        }

        if (cancelled) return;

        document.open();
        document.write(html);
        document.close();
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Falha ao carregar o HTML privado.'
          );
        }
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'ENERGIAPRO_AUTH_TOKEN') return;
      if (typeof data.token !== 'string' || !data.token.trim()) return;

      void bootWithToken(data.token);
    }

    window.addEventListener('message', onMessage);

    const timeout = window.setTimeout(() => {
      if (!booted && !cancelled) {
        setMessage('Sessão do diagnóstico não recebida. Recarregue a tela principal.');
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif', color: '#0f172a' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>EnergiaPro protegido</h1>
      <p style={{ margin: 0, color: '#475569' }}>{message}</p>
    </main>
  );
}
