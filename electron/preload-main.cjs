'use strict';
// 主窗口 preload:在聊天界面右上角注入一个「金蝶 MCP 设置」悬浮按钮。
//
// 背景:设置入口原来只在应用菜单里,聊天页里完全看不到。这里通过 preload
// 在页面右上角叠一个常驻齿轮按钮(不动 dsh 网页逻辑,只是 DOM 注入)。
// sandbox + contextIsolation 下 preload 与页面共享 DOM,可创建元素;但
// 不能直接碰 Node,故点击只做 IPC 转发,由主进程打开设置窗口。
//
// 用 document.documentElement 挂载 + 观察其 childList,避免 SPA 重渲染
// 把按钮冲掉;观察不挂 subtree,开销极小。

const { ipcRenderer } = require('electron');

const BTN_ID = 'dsh-settings-float-btn';

// Material "settings" 齿轮图标(fill 继承 currentColor)
const GEAR_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
  '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>' +
  '</svg>';

function injectButton() {
  if (document.getElementById(BTN_ID)) return;
  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.title = '金蝶 MCP 设置';
  btn.setAttribute('aria-label', '金蝶 MCP 设置');
  btn.innerHTML = GEAR_SVG;
  btn.style.cssText = [
    'position: fixed',
    'top: 12px',
    'right: 12px',
    'z-index: 2147483647',
    'width: 36px',
    'height: 36px',
    'padding: 0',
    'margin: 0',
    'cursor: pointer',
    'color: #d7dbe6',
    'border: 1px solid rgba(255,255,255,0.14)',
    'border-radius: 10px',
    'background: rgba(15,18,26,0.55)',
    'backdrop-filter: blur(4px)',
    '-webkit-backdrop-filter: blur(4px)',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.35)',
    'transition: background 0.15s ease',
  ].join(';');
  btn.onmouseenter = () => { btn.style.background = 'rgba(45,52,74,0.92)'; };
  btn.onmouseleave = () => { btn.style.background = 'rgba(15,18,26,0.55)'; };
  btn.addEventListener('click', () => ipcRenderer.send('main:open-settings'));
  (document.documentElement || document.body).appendChild(btn);
}

function start() {
  injectButton();
  // SPA 若整体重挂 html 子节点导致按钮丢失,观察 childList 兜底补回。
  const root = document.documentElement || document.body;
  const obs = new MutationObserver(() => injectButton());
  obs.observe(root, { childList: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
