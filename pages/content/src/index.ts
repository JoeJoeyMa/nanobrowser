console.log('content script loaded');

// 全局变量类型声明
export {};
declare global {
  interface Window {
    __NANO_RECORDER_ENABLED__?: boolean;
    __NANO_RECORDER_LOGS__?: any[];
  }
}

(window as any).__NANO_RECORDER_ENABLED__ = false;
(window as any).__NANO_RECORDER_LOGS__ = [];

// 内容脚本加载时自动恢复日志
chrome.storage.local.get('nanoRecorderLogs', result => {
  (window as any).__NANO_RECORDER_LOGS__ = result.nanoRecorderLogs || [];
});

// 全局自动注入 buildDomTree.js，保证每次页面加载/跳转后都可用
(function ensureBuildDomTreeInjected() {
  if (typeof (window as any).buildDomTree !== 'function') {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('buildDomTree.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
})();

// 封装高亮调用，未挂载时自动重试
function callBuildDomTreeHighlight(retry = 0) {
  if (typeof (window as any).buildDomTree === 'function') {
    (window as any).buildDomTree({ showHighlightElements: true });
  } else if (retry < 10) {
    setTimeout(() => callBuildDomTreeHighlight(retry + 1), 100);
  }
}

function getXPath(element: Element): string {
  if ((element as HTMLElement).id) return `id("${(element as HTMLElement).id}")`;
  if (element === document.body) return 'html/body';
  let ix = 0;
  const siblings = element.parentNode ? element.parentNode.childNodes : [];
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return getXPath(element.parentNode as Element) + '/' + element.tagName.toLowerCase() + `[${ix + 1}]`;
    }
    if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName) {
      ix++;
    }
  }
  return '';
}

function getElementInfo(element: HTMLElement): Record<string, any> {
  let className = '';
  if (typeof element.className === 'string') {
    className = element.className;
  } else if (typeof (element as any).getAttribute === 'function') {
    className = (element as any).getAttribute('class') || '';
  }
  return {
    xpath: getXPath(element),
    cssSelector: className
      ? `${element.tagName.toLowerCase()}.${className.split(' ').join('.')}`
      : element.tagName.toLowerCase(),
    tagName: element.tagName,
    elementText: element.innerText || (element as HTMLInputElement).value || '',
    attributes: Object.fromEntries(Array.from(element.attributes || []).map(attr => [attr.name, attr.value])),
  };
}

function recordLog(log: any) {
  if (!(window as any).__NANO_RECORDER_ENABLED__) return;
  (window as any).__NANO_RECORDER_LOGS__.push(log);
  // 持久化到 chrome.storage.local
  chrome.storage.local.set({ nanoRecorderLogs: (window as any).__NANO_RECORDER_LOGS__ });
  window.postMessage({ type: 'NANO_RECORDER_LOG', log }, '*');
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const info = getElementInfo(target);
  recordLog({
    timestamp: new Date().toISOString(),
    action: 'click',
    target: info,
    context: {
      url: window.location.href,
      title: document.title,
    },
    result: { success: true, error: null },
  });
  callBuildDomTreeHighlight();
}

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const info = getElementInfo(target);
  recordLog({
    timestamp: new Date().toISOString(),
    action: 'input',
    target: { ...info, value: target.value },
    context: {
      url: window.location.href,
      title: document.title,
    },
    result: { success: true, error: null },
  });
  callBuildDomTreeHighlight();
}

function handleScroll() {
  recordLog({
    timestamp: new Date().toISOString(),
    action: 'scroll',
    context: {
      url: window.location.href,
      title: document.title,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    result: { success: true, error: null },
  });
  callBuildDomTreeHighlight();
}

// 触发统一的 build_dom_tree action（通过 background）
function triggerBuildDomTreeAction() {
  // 获取当前 tabId
  chrome.runtime.sendMessage({ type: 'NANO_GET_TAB_ID' }, response => {
    const tabId = response?.tabId;
    const url = window.location.href;
    if (!tabId) {
      console.warn('无法获取 tabId，build_dom_tree action 未触发');
      return;
    }
    chrome.runtime.sendMessage({
      type: 'user_action',
      action: {
        type: 'build_dom_tree',
        params: {
          intent: '手动录制构建DOM树',
          tabId,
          url,
          showHighlightElements: true,
          focusElement: -1,
          viewportExpansion: 0,
          debugMode: false,
        },
      },
    });
  });
}

function enableRecorder() {
  if ((window as any).__NANO_RECORDER_ENABLED__) return;
  (window as any).__NANO_RECORDER_ENABLED__ = true;
  window.addEventListener('click', handleClick, true);
  window.addEventListener('input', handleInput, true);
  window.addEventListener('scroll', handleScroll, true);
  console.log('[NanoRecorder] 录制已开启');
  // 统一通过 action handler 触发 build_dom_tree
  triggerBuildDomTreeAction();
  // 仍可保留本地高亮逻辑（可选）
  callBuildDomTreeHighlight();
}

function disableRecorder() {
  if (!(window as any).__NANO_RECORDER_ENABLED__) return;
  (window as any).__NANO_RECORDER_ENABLED__ = false;
  window.removeEventListener('click', handleClick, true);
  window.removeEventListener('input', handleInput, true);
  window.removeEventListener('scroll', handleScroll, true);
  console.log('[NanoRecorder] 录制已关闭');
  // 移除高亮 overlay
  const container = document.getElementById('playwright-highlight-container');
  if (container) container.remove();
}

window.addEventListener('message', event => {
  if (event.data && event.data.type === 'NANO_RECORDER_TOGGLE') {
    if (event.data.enabled) enableRecorder();
    else disableRecorder();
  }
  if (event.data && event.data.type === 'NANO_RECORDER_EXPORT') {
    window.postMessage({ type: 'NANO_RECORDER_EXPORT_RESULT', logs: (window as any).__NANO_RECORDER_LOGS__ }, '*');
  }
});

// 监听来自 SidePanel 的消息，控制录制开关和导出日志
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'NANO_RECORDER_TOGGLE') {
    if (msg.enabled) {
      enableRecorder();
    } else {
      disableRecorder();
    }
  }
  if (msg && msg.type === 'NANO_RECORDER_EXPORT') {
    chrome.runtime.sendMessage({ type: 'NANO_RECORDER_EXPORT_RESULT', logs: (window as any).__NANO_RECORDER_LOGS__ });
    chrome.storage.local.remove('nanoRecorderLogs');
  }
});
