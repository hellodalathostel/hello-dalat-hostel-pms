const PREVIEW_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: sans-serif; background: #f0f0f0; }

  #doc-actions {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 52px;
    background: #1a1a2e;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 20px;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  #doc-actions span {
    color: #ccc;
    font-size: 13px;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #doc-actions .hint {
    color: #a9b1d6;
    font-size: 12px;
    flex: 0 0 auto;
    max-width: 35%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #doc-actions button {
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    flex: 0 0 auto;
  }

  #doc-actions button:hover { opacity: 0.85; }

  #btn-print { background: #4caf50; color: #fff; }
  #btn-close { background: #555; color: #fff; }

  #doc-content {
    padding-top: 64px;
    padding-bottom: 40px;
    display: flex;
    justify-content: center;
  }

  @media (max-width: 768px) {
    #doc-actions {
      height: auto;
      min-height: 52px;
      flex-wrap: wrap;
      padding: 8px 12px;
      gap: 8px;
    }

    #doc-actions span {
      min-width: 100%;
      order: 0;
    }

    #doc-actions .hint {
      min-width: 100%;
      max-width: 100%;
      order: 1;
    }

    #btn-print {
      order: 2;
    }

    #btn-close {
      order: 3;
    }

    #doc-content {
      padding-top: 110px;
    }
  }

  @media print {
    #doc-actions { display: none !important; }
    #doc-content { padding-top: 0 !important; padding-bottom: 0 !important; }
    body { background: #fff; }
  }
`;

/**
 * Mo cua so popup preview tai lieu.
 * Nguoi dung co the review, chup man hinh, sau do moi in/luu PDF.
 */
export function openDocumentPreview(htmlContent: string, title: string): void {
  const popupWidth = 860;
  const popupHeight = 700;
  const left = Math.max(0, Math.round((window.screen.width - popupWidth) / 2));
  const top = Math.max(0, Math.round((window.screen.height - popupHeight) / 2));

  const popup = window.open(
    '',
    `doc_preview_${Date.now()}`,
    `width=${popupWidth},height=${popupHeight},left=${left},top=${top},` +
      'scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
  );

  if (!popup) {
    console.warn('[DocumentPreview] Popup bi chan boi trinh duyet');
    fallbackIframePrint(htmlContent);
    return;
  }

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>${PREVIEW_STYLES}</style>
  </head>
  <body>
    <div id="doc-actions">
      <span>${escapeHtml(title)}</span>
      <span class="hint">📸 Chụp màn hình: Win+Shift+S / Cmd+Shift+4</span>
      <button id="btn-print" type="button">In / Luu PDF</button>
      <button id="btn-close" type="button">Dong</button>
    </div>
    <div id="doc-content">${htmlContent}</div>
  </body>
</html>`);
  popup.document.close();

  const printButton = popup.document.getElementById('btn-print');
  const closeButton = popup.document.getElementById('btn-close');

  printButton?.addEventListener('click', () => {
    popup.focus();
    popup.print();
  });

  closeButton?.addEventListener('click', () => {
    popup.close();
  });

  popup.focus();
}

function fallbackIframePrint(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 3000);
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}