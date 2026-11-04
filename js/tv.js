/* ============================================================
   tv.js — 狗狗映像管電視（僅 index.html 使用）
   功能：向 Dog CEO API 要圖、上一張 / 下一張、
        以 localStorage 保存照片與順序、電源開關動畫控制
   ============================================================ */
(function (window, document) {
  'use strict';

  var App = window.App;
  if (!App) {
    console.error('[tv] 找不到共用的 App 工具，請確認 js/common.js 已載入');
    return;
  }

  var CONFIG = {
    apiUrl: 'https://dog.ceo/api/breeds/image/random',
    historyLimit: 40,
    tuningDelay: 180,
    revealDelay: 140
  };

  var store = App.createStore('dogTv');
  var el = {};
  var state = {
    history: [],
    index: -1,
    power: 'on',
    busy: false
  };

  document.addEventListener('DOMContentLoaded', init);

  /* ---------------- 初始化 ---------------- */
  function init() {
    cacheElements();
    restoreState();
    bindEvents();
    syncPowerUi();

    if (state.power === 'on') {
      startUp();
    } else {
      el.tv.classList.add('is-power-off');
      updateControls();
    }
  }

  function cacheElements() {
    el.tv = App.$('#tv');
    el.screen = App.$('#screen');
    el.tube = App.$('#tube');
    el.contents = App.$('#contents');
    el.photo = App.$('#photo');
    el.channel = App.$('#channel');
    el.status = App.$('#status');
    el.powerBtn = App.$('#powerBtn');
    el.prevBtn = App.$('#prevBtn');
    el.nextBtn = App.$('#nextBtn');
    el.led = App.$('#led');
  }

  /* ---------------- 本地儲存 ---------------- */
  function restoreState() {
    var savedHistory = store.get('history', []);
    var list = Array.isArray(savedHistory) ? savedHistory : [];

    var fullHistory = list.filter(function (url) {
      return typeof url === 'string' && url.length > 0;
    });

    var overflow = Math.max(0, fullHistory.length - CONFIG.historyLimit);
    state.history = overflow > 0 ? fullHistory.slice(overflow) : fullHistory;

    var savedIndex = Number(store.get('index', -1));
    if (state.history.length === 0) {
      state.index = -1;
    } else if (Number.isFinite(savedIndex) && savedIndex >= 0) {
      state.index = App.clamp(Math.floor(savedIndex) - overflow, 0, state.history.length - 1);
    } else {
      state.index = state.history.length - 1;
    }

    state.power = store.get('power', 'on') === 'off' ? 'off' : 'on';
  }

  function persist() {
    store.set('history', state.history);
    store.set('index', state.index);
    store.set('power', state.power);
  }

  /* ---------------- 事件 ---------------- */
  function bindEvents() {
    el.powerBtn.addEventListener('click', togglePower);
    el.nextBtn.addEventListener('click', goNext);
    el.prevBtn.addEventListener('click', goPrev);

    el.photo.addEventListener('error', function () {
      setStatus('SIGNAL LOST');
    });

    document.addEventListener('keydown', onKeydown);
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

    var target = event.target;
    var onButton = target && target.closest && target.closest('button');

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
    } else if (event.key === ' ' && !onButton) {
      event.preventDefault();
      togglePower();
    }
  }

  /* ---------------- 介面同步 ---------------- */
  function syncPowerUi() {
    el.tv.dataset.power = state.power;
    el.tv.classList.toggle('is-power-off', state.power === 'off');
    el.led.dataset.state = state.power === 'on' ? 'on' : 'off';
    el.powerBtn.setAttribute('aria-pressed', String(state.power === 'on'));
  }

  function updateControls() {
    var interactive = state.power === 'on' && !state.busy;
    el.nextBtn.disabled = !interactive;
    el.prevBtn.disabled = !interactive || state.index <= 0;
    el.powerBtn.disabled = state.busy;

    el.tv.dataset.power = state.power;
    el.led.dataset.state = state.power === 'on' ? 'on' : 'off';
    el.powerBtn.setAttribute('aria-pressed', String(state.power === 'on'));
  }

  function setBusy(busy) {
    state.busy = busy;
    updateControls();
  }

  function canInteract() {
    return state.power === 'on' && !state.busy;
  }

  function hasPicture() {
    return state.index >= 0 && Boolean(state.history[state.index]);
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  /* ---------------- 畫面 ---------------- */
  function paint(url) {
    el.photo.src = url;
    el.photo.alt = describeImage(url);
    updateChannel();
    setStatus('ON AIR');
  }

  function updateChannel() {
    el.channel.textContent = state.index >= 0
      ? 'CH ' + String(state.index + 1).padStart(2, '0')
      : 'CH --';
  }

  /** 從圖片網址解析品種，產生 alt 文字 */
  function describeImage(url) {
    var match = /\/breeds\/([^/]+)\//.exec(url || '');
    if (!match) return '狗狗照片';
    var breed = match[1].replace(/-/g, ' ').replace(/\b[a-z]/g, function (letter) {
      return letter.toUpperCase();
    });
    return breed + ' 的狗狗照片';
  }

  /* ---------------- Dog CEO API ---------------- */
  async function requestImage() {
    var data = await App.fetchJSON(CONFIG.apiUrl);

    if (!data || data.status !== 'success' || typeof data.message !== 'string' || !data.message) {
      throw new Error('API 回應格式不正確');
    }

    // 先確認圖片能載入，避免換台後才出現破圖
    await App.preloadImage(data.message);
    return data.message;
  }

  function pushHistory(url) {
    state.history.push(url);
    if (state.history.length > CONFIG.historyLimit) {
      state.history.splice(0, state.history.length - CONFIG.historyLimit);
    }
    state.index = state.history.length - 1;
  }

  /* ---------------- 開機 / 關機 ---------------- */
  async function togglePower() {
    if (state.busy) return;
    if (state.power === 'on') {
      await powerOff();
    } else {
      await powerOn();
    }
  }

  /**
   * 開機流程：可視區從頭到尾都是滿版，
   * 只讓畫面從「模糊全白」慢慢還原成彩色
   */
  async function startUp() {
    setBusy(true);
    setStatus('WARMING UP');
    el.tv.classList.remove('is-power-off');

    if (hasPicture()) {
      try {
        await App.preloadImage(state.history[state.index]);
      } catch (error) {
        console.warn('[tv] 歷史照片預載失敗，改用瀏覽器快取', error);
      }
      paint(state.history[state.index]);
    } else {
      await loadFirstPicture();
    }

    setStatus('WARMING UP');
    App.restartAnimation(el.tv, 'is-powering-on');
    await App.waitForAnimation(el.contents, 2600);
    el.tv.classList.remove('is-powering-on');

    if (hasPicture()) setStatus('ON AIR');
    setBusy(false);
    persist();
  }

  async function loadFirstPicture() {
    el.screen.classList.add('is-tuning');
    setStatus('TUNING...');

    try {
      var url = await requestImage();
      pushHistory(url);
      paint(url);
      persist();
    } catch (error) {
      console.warn('[tv] 取得第一張照片失敗', error);
      setStatus('NO SIGNAL');
    } finally {
      el.screen.classList.remove('is-tuning');
    }
  }

  async function powerOn() {
    if (state.power === 'on') return;
    state.power = 'on';
    persist();
    await startUp();
  }

  async function powerOff() {
    if (state.power === 'off') return;

    state.power = 'off';
    persist();
    setBusy(true);
    setStatus('POWER OFF');

    // 關機：clip-path 逐步裁切可視區（不縮放圖片），
    // 影像同時失焦、過曝，最後收成水平亮線再收成亮點
    el.tv.classList.remove('is-power-off');
    App.restartAnimation(el.tv, 'is-powering-off');
    await App.waitForAnimation(el.tube, 1800);

    el.tv.classList.remove('is-powering-off');
    el.tv.classList.add('is-power-off');

    setBusy(false);
    persist();
  }

  /* ---------------- 換台 ---------------- */
  async function goNext() {
    if (!canInteract()) return;

    // 歷史中還有下一張：只回放本地資料，不再請求 API
    if (state.index < state.history.length - 1) {
      state.index += 1;
      persist();
      await replay('NEXT');
      return;
    }

    setBusy(true);
    el.screen.classList.add('is-tuning');
    setStatus('TUNING...');

    try {
      var url = await requestImage();
      pushHistory(url);
      persist();
      await App.sleep(CONFIG.tuningDelay);
      paint(url);
    } catch (error) {
      console.warn('[tv] 取得下一張照片失敗', error);
      setStatus('NO SIGNAL');
      await App.sleep(1600);
      if (state.power === 'on' && hasPicture()) setStatus('ON AIR');
    } finally {
      await App.sleep(CONFIG.revealDelay);
      el.screen.classList.remove('is-tuning');
      setBusy(false);
    }
  }

  async function goPrev() {
    if (!canInteract()) return;

    if (state.index <= 0) {
      updateControls();
      return;
    }

    // 上一張一律播放本地歷史，確保之後按「下一張」看到的是剛才那張
    state.index -= 1;
    persist();
    await replay('REWIND');
  }

  /** 用本地歷史回放指定索引，並套用轉台雜訊 */
  async function replay(label) {
    setBusy(true);
    el.screen.classList.add('is-tuning');
    setStatus(label || 'TUNING...');

    await App.sleep(CONFIG.tuningDelay);
    paint(state.history[state.index]);
    await App.sleep(CONFIG.revealDelay);

    el.screen.classList.remove('is-tuning');
    setBusy(false);
  }
})(window, document);
