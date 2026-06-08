// src/features/documents/DocumentPreviewWindow.ts
// Mở popup preview tài liệu.
// htmlContent là full HTML document — write trực tiếp, không wrap thêm.

/**
 * Mở cửa sổ popup, write htmlContent (full HTML document) trực tiếp.
 * Action bar (In/Lưu PDF + Đóng) được inject vào DOM sau khi popup load xong.
 */
export function openDocumentPreview(htmlContent: string, title: string): void {
  const popupWidth  = 860;
  const popupHeight = 700;
  const left = Math.max(0, Math.round((window.screen.width  - popupWidth)  / 2));
  const top  = Math.max(0, Math.round((window.screen.height - popupHeight) / 2));

  const popup = window.open(
    '',
    `doc_preview_${Date.now()}`,
    `width=${popupWidth},height=${popupHeight},left=${left},top=${top},` +
      'scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
  );

  if (!popup) {
    console.warn('[DocumentPreview] Popup bị chặn bởi trình duyệt');
    fallbackIframePrint(htmlContent);
    return;
  }

  // Write toàn bộ HTML document — KHÔNG wrap thêm
  popup.document.open();
  popup.document.write(htmlContent);
  popup.document.close();

  // Inject action bar sau khi DOM ready
  const inject = () => {
    const doc = popup.document;

    // Tạo action bar
    const bar = doc.createElement('div');
    bar.id = 'doc-action-bar';
    bar.innerHTML = `
      <span>${escapeHtml(title)}</span>
      <span class="hint">📸 Chụp màn hình: Win+Shift+S / Cmd+Shift+4</span>
      <button id="btn-print" type="button">In / Lưu PDF</button>
      <button id="btn-close" type="button">Đóng</button>
    `;

    // Style action bar
    const style = doc.createElement('style');
    style.textContent = `
      #doc-action-bar {
        position: fixed; top: 0; left: 0; right: 0; height: 52px;
        background: #1a1a2e; display: flex; align-items: center;
        gap: 10px; padding: 0 20px; z-index: 9999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3); font-family: sans-serif;
      }
      #doc-action-bar span { color: #ccc; font-size: 13px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #doc-action-bar .hint { color: #a9b1d6; font-size: 12px; flex: 0 0 auto; max-width: 35%; }
      #doc-action-bar button { border: none; border-radius: 6px; padding: 7px 16px; font-size: 13px; font-weight: 600; cursor: pointer; flex: 0 0 auto; }
      #btn-print { background: #4caf50; color: #fff; }
      #btn-close  { background: #555;    color: #fff; }
      body { padding-top: 60px !important; }
      @media print {
        #doc-action-bar { display: none !important; }
        body { padding-top: 0 !important; }
      }
      @media (max-width: 768px) {
        #doc-action-bar { height: auto; min-height: 52px; flex-wrap: wrap; padding: 8px 12px; }
        #doc-action-bar span { min-width: 100%; }
        #doc-action-bar .hint { min-width: 100%; max-width: 100%; }
        body { padding-top: 110px !important; }
      }
    `;

    doc.head.appendChild(style);
    doc.body.insertBefore(bar, doc.body.firstChild);

    doc.getElementById('btn-print')?.addEventListener('click', () => {
      popup.focus();
      popup.print();
    });
    doc.getElementById('btn-close')?.addEventListener('click', () => {
      popup.close();
    });
  };

  // Chạy inject sau khi popup load xong
  if (popup.document.readyState === 'complete') {
    inject();
  } else {
    popup.addEventListener('load', inject);
    // Fallback nếu load event không fire
    setTimeout(inject, 500);
  }

  popup.focus();
}

function fallbackIframePrint(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0;';
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
