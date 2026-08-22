'use client';

import { useEffect, useState } from 'react';

function getSupabaseAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  const directKeys = [
    'supabase.access_token',
    'access_token',
    'sb-access-token',
  ];

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (
        key.includes('auth-token') ||
        key.includes('access-token') ||
        key.includes('supabase')
      ) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.access_token === 'string') return parsed.access_token;
          if (typeof parsed?.currentSession?.access_token === 'string') {
            return parsed.currentSession.access_token;
          }

          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item === 'string' && item.split('.').length === 3) return item;
              if (typeof item?.access_token === 'string') return item.access_token;
              if (typeof item?.currentSession?.access_token === 'string') {
                return item.currentSession.access_token;
              }
            }
          }
        } catch (_) {
          const match = raw.match(/"access_token":"([^"]+)"/);
          if (match?.[1]) return match[1];
          if (raw.split('.').length === 3) return raw;
        }
      }
    }

    for (const key of directKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.access_token === 'string') return parsed.access_token;
        if (typeof parsed?.currentSession?.access_token === 'string') {
          return parsed.currentSession.access_token;
        }
      } catch (_) {
        if (raw.split('.').length === 3) return raw;
      }
    }
  } catch (_) {}

  return null;
}

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
      // não conclui "salvou", registra apenas indício no fechamento/navegação
      sendAudit('tentativa_salvar_html', 'pagehide');
    }
  });
})();
</script>
`;
}

export default function EnergiaProPrivatePage() {
  const [message, setMessage] = useState('Carregando EnergiaPro privado...');

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const token = getSupabaseAccessToken();

        if (!token) {
          setMessage('Sessão não encontrada. Faça login novamente.');
          return;
        }

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

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif', color: '#0f172a' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>EnergiaPro protegido</h1>
      <p style={{ margin: 0, color: '#475569' }}>{message}</p>
    </main>
  );
}
