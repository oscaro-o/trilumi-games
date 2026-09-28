/* ==========================================================================
   TRISHARE — one share sheet for the whole family
   --------------------------------------------------------------------------
   The card has to be *seen* before it is saved. On a phone, saving means
   long-pressing the image, and you cannot long-press a download. So the sheet
   shows the PNG, then offers the three ways out: save, copy the text, close.

   Depends on TRICARD for the card itself. Styling is deliberately neutral so
   it sits on top of a warm-paper game or a cold-green one without clashing.
   ========================================================================== */
var TRISHARE = (function () {
  var STYLE =
    '.trish{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:center;padding:16px;background:rgba(12,11,10,.74)}' +
    '.trish .box{background:#fbf9f4;border-radius:10px;width:100%;max-width:520px;' +
      'max-height:93vh;overflow:auto;padding:18px 18px 14px;' +
      'box-shadow:0 24px 64px rgba(0,0,0,.4);' +
      'font-family:"Segoe UI",Helvetica,Arial,system-ui,sans-serif}' +
    '.trish h3{margin:0 0 3px;font-size:15px;font-weight:700;color:#23201c}' +
    '.trish .hint{margin:0 0 12px;font-size:12.5px;line-height:1.6;color:#7d7566}' +
    '.trish .cvwrap{border:1px solid #e2dbcf;border-radius:6px;overflow:hidden;' +
      'background:#fff;line-height:0}' +
    '.trish img{display:block;width:100%;height:auto}' +
    '.trish .acts{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}' +
    '.trish button{flex:1 1 120px;padding:11px 12px;border-radius:6px;' +
      'border:1px solid #cfc4ad;background:#fff;color:#23201c;font:inherit;' +
      'font-size:13px;font-weight:600;cursor:pointer}' +
    '.trish button.p{background:#004AAD;border-color:#004AAD;color:#fff}' +
    '.trish button.w{flex-basis:100%}' +
    '.trish .tg{margin-top:9px;min-height:16px;font-size:12px;color:#3d6b4a}' +
    '.trish .tg.bad{color:#a8321e}';

  var injected = false;
  function inject() {
    if (injected) return;
    var s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
    injected = true;
  }

  /* strings, in the three languages the family ships. A game may override
     any of them through opts. */
  var T = {
    en:   { title: 'Your card', hint: 'Long-press the image to save it, or use Download.',
            dl: 'Download PNG', cp: 'Copy as text', cl: 'Close',
            ok: 'Copied to clipboard', bad: 'Could not copy — select the text manually.' },
    hans: { title: '你的结果卡片', hint: '长按图片保存，或点下面的下载。',
            dl: '下载图片', cp: '复制文字', cl: '关闭',
            ok: '已复制到剪贴板', bad: '复制失败，请手动选中文字。' },
    hant: { title: '你的結果卡片', hint: '長按圖片儲存，或點下面的下載。',
            dl: '下載圖片', cp: '複製文字', cl: '關閉',
            ok: '已複製到剪貼簿', bad: '複製失敗，請手動選取文字。' }
  };

  function open(cv, txt, opts) {
    opts = opts || {};
    inject();
    var L = T[opts.lang] || T.en;
    var say = function (k) { return opts[k] || L[k]; };

    var m = document.createElement('div');
    m.className = 'trish';
    m.innerHTML =
      '<div class="box">' +
        '<h3>' + say('title') + '</h3>' +
        '<p class="hint">' + say('hint') + '</p>' +
        '<div class="cvwrap"></div>' +
        '<div class="acts">' +
          '<button class="p" data-a="dl">' + say('dl') + '</button>' +
          '<button data-a="cp">' + say('cp') + '</button>' +
          '<button class="w" data-a="cl">' + say('cl') + '</button>' +
        '</div>' +
        '<p class="tg"></p>' +
      '</div>';

    var url;
    try { url = cv.toDataURL('image/png'); } catch (e) { url = ''; }
    if (url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = say('title');
      m.querySelector('.cvwrap').appendChild(img);
    }

    var tg = m.querySelector('.tg');
    function note(msg, bad) {
      tg.textContent = msg;
      tg.className = 'tg' + (bad ? ' bad' : '');
    }

    m.querySelector('[data-a="dl"]').onclick = function () {
      TRICARD.save(cv, opts.filename || 'trilumi-card.png', function () {
        note(say('ok'));
      }, function () {
        note(say('bad'), true);
      });
    };
    m.querySelector('[data-a="cp"]').onclick = function () {
      TRICARD.copy(txt, function () { note(say('ok')); },
                        function () { note(say('bad'), true); });
    };
    m.querySelector('[data-a="cl"]').onclick = function () { close(); };
    m.onclick = function (e) { if (e.target === m) close(); };
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    function close() {
      document.removeEventListener('keydown', onKey);
      m.remove();
    }

    /* the native sheet, where the browser can hand a file to another app —
       which on a phone is the actual sharing path */
    try {
      if (navigator.canShare && cv.toBlob) {
        cv.toBlob(function (b) {
          var f;
          try { f = new File([b], opts.filename || 'trilumi-card.png', { type: 'image/png' }); }
          catch (e) { return; }
          if (!navigator.canShare({ files: [f] })) return;
          var btn = document.createElement('button');
          btn.textContent = opts.shareNative || 'Share';
          btn.onclick = function () {
            navigator.share({ files: [f], text: txt }).catch(function () {});
          };
          m.querySelector('.acts').insertBefore(btn, m.querySelector('[data-a="cl"]'));
        }, 'image/png');
      }
    } catch (e) {}

    document.body.appendChild(m);
  }

  return { open: open };
})();
