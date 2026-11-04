/* ============================================================
   common.js — 全站共用工具（掛載於 window.App）
   內容：DOM 選取、數值工具、本地儲存庫、JSON 請求、
        圖片預載、動畫等待與重播
   規則：只放可跨頁面重複使用的邏輯；單一頁面的邏輯請寫在該頁 JS
   ============================================================ */
(function (window, document) {
  'use strict';

  var App = window.App || (window.App = {});

  /** 選取單一元素 */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  /** 選取多個元素，回傳真正的陣列 */
  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /** 限制數值範圍 */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /** 等待若干毫秒 */
  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  /** 使用者是否要求減少動態 */
  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * 建立具命名空間的本地儲存庫（localStorage）
   * 若瀏覽器停用儲存（例如無痕模式），自動退回記憶體，介面不變
   * @param {string} namespace 命名空間，例如 'dogTv'
   */
  function createStore(namespace) {
    var prefix = String(namespace || 'app') + ':';
    var memory = new Map();
    var available = false;

    try {
      var probe = prefix + '__probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      available = true;
    } catch (error) {
      available = false;
    }

    function readRaw(key) {
      if (available) {
        return window.localStorage.getItem(prefix + key);
      }
      return memory.has(prefix + key) ? memory.get(prefix + key) : null;
    }

    function writeRaw(key, raw) {
      if (available) {
        window.localStorage.setItem(prefix + key, raw);
        return;
      }
      memory.set(prefix + key, raw);
    }

    return {
      /** 讀取並解析資料，失敗時回傳 fallback */
      get: function (key, fallback) {
        var raw = readRaw(key);
        if (raw === null || raw === undefined) return fallback;
        try {
          return JSON.parse(raw);
        } catch (error) {
          return fallback;
        }
      },

      /** 序列化並寫入資料，回傳是否成功 */
      set: function (key, value) {
        try {
          writeRaw(key, JSON.stringify(value));
          return true;
        } catch (error) {
          return false;
        }
      },

      /** 刪除單一資料 */
      remove: function (key) {
        try {
          if (available) {
            window.localStorage.removeItem(prefix + key);
          } else {
            memory.delete(prefix + key);
          }
        } catch (error) {
          /* 忽略 */
        }
      },

      /** 清空此命名空間的所有資料 */
      clear: function () {
        try {
          if (!available) {
            memory.clear();
            return;
          }
          Object.keys(window.localStorage)
            .filter(function (key) { return key.indexOf(prefix) === 0; })
            .forEach(function (key) { window.localStorage.removeItem(key); });
        } catch (error) {
          /* 忽略 */
        }
      }
    };
  }


  /**
   * 取得 JSON 資料（支援逾時中斷）
   * @param {string} url
   * @param {object} [options] 可傳 timeout（毫秒）與 fetch 的其他設定
   */
  async function fetchJSON(url, options) {
    var settings = options || {};
    var timeout = typeof settings.timeout === 'number' ? settings.timeout : 12000;
    var init = Object.assign({}, settings);

    delete init.timeout;

    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    var timer = null;

    if (controller) {
      timer = window.setTimeout(function () {
        controller.abort();
      }, timeout);
      init.signal = controller.signal;
    }

    init.mode = init.mode || 'cors';
    init.cache = init.cache || 'no-store';
    init.headers = Object.assign({ Accept: 'application/json' }, init.headers);

    try {
      var response = await window.fetch(url, init);
      if (!response.ok) {
        throw new Error('請求失敗（HTTP ' + response.status + '）');
      }
      return await response.json();
    } finally {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    }
  }

  /**
   * 預先載入圖片，載入完成才回傳，避免換圖時閃爍
   * @param {string} src
   * @param {number} [timeout] 毫秒
   */
  function preloadImage(src, timeout) {
    var limit = typeof timeout === 'number' ? timeout : 15000;

    return new Promise(function (resolve, reject) {
      if (!src) {
        reject(new Error('缺少圖片網址'));
        return;
      }

      var image = new window.Image();
      var finished = false;
      var timer = window.setTimeout(function () {
        finish(new Error('圖片載入逾時'));
      }, limit);

      function finish(error) {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else resolve(src);
      }

      image.onload = function () { finish(null); };
      image.onerror = function () { finish(new Error('圖片載入失敗')); };
      image.src = src;
    });
  }

  /**
   * 等待元素上的 CSS 動畫結束；若沒有動畫或被略過，以 fallback 收尾
   * @param {Element} element
   * @param {number} [fallback] 毫秒
   */
  function waitForAnimation(element, fallback) {
    var limit = typeof fallback === 'number' ? fallback : 2500;

    return new Promise(function (resolve) {
      if (!element) {
        resolve();
        return;
      }

      var settled = false;
      var timer = window.setTimeout(function () { done(null); }, limit);

      function done(event) {
        if (settled) return;
        if (event && event.target !== element) return;
        settled = true;
        window.clearTimeout(timer);
        element.removeEventListener('animationend', done);
        element.removeEventListener('animationcancel', done);
        resolve();
      }

      element.addEventListener('animationend', done);
      element.addEventListener('animationcancel', done);
    });
  }

  /** 重新觸發 CSS 動畫（移除 class → 強制 reflow → 加回 class） */
  function restartAnimation(element, className) {
    if (!element || !className) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  App.$ = $;
  App.$$ = $$;
  App.clamp = clamp;
  App.sleep = sleep;
  App.prefersReducedMotion = prefersReducedMotion;
  App.createStore = createStore;
  App.fetchJSON = fetchJSON;
  App.preloadImage = preloadImage;
  App.waitForAnimation = waitForAnimation;
  App.restartAnimation = restartAnimation;
})(window, document);
