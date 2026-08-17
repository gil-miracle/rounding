/* =============================================================================
 *  app.js — 화면 전환 및 전체 흐름
 *  인트로 → 퀴즈 → 상자 선택 → 사다리타기(상품 공개) → 엔딩
 * ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------- 도우미 -------------------------------- */
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /** QR 이미지 박스. 파일이 없으면 어떤 파일을 넣어야 하는지 알려준다. */
  function makeQrBox(src, alt) {
    var box = el('div', 'qrbox');
    if (!src) {
      box.classList.add('qrbox--empty');
      box.appendChild(el('p', 'qrbox__msg', 'QR 이미지가 설정되지 않았어요'));
      return box;
    }
    var img = el('img', 'qrbox__img');
    img.alt = alt || 'QR 코드';
    img.addEventListener('error', function () {
      box.classList.add('qrbox--missing');
      box.innerHTML = '';
      box.appendChild(el('p', 'qrbox__msg', 'QR 이미지를 찾을 수 없어요'));
      box.appendChild(el('code', 'qrbox__path', src));
    });
    img.src = src;
    box.appendChild(img);
    return box;
  }

  function fillBox(container, src, alt) {
    container.innerHTML = '';
    container.appendChild(makeQrBox(src, alt));
  }

  /* ===========================================================================
   *  재고(수량) 관리 — localStorage 에 이 기기 기준으로 저장
   * ======================================================================== */
  var Stock = {
    _data: null,

    key: function () {
      return (CONFIG.stock && CONFIG.stock.storageKey) || 'event-stock-v1';
    },

    enabled: function () {
      return !CONFIG.stock || CONFIG.stock.enabled !== false;
    },

    /** 준비 수량. 설정이 없으면 null(무제한) */
    totalOf: function (prize) {
      var n = prize.stock;
      return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : null;
    },

    load: function () {
      if (this._data) return this._data;

      var data = {};
      CONFIG.prizes.forEach(function (p) {
        var total = Stock.totalOf(p);
        if (total !== null) data[p.id] = total;
      });

      if (this.enabled()) {
        try {
          var raw = window.localStorage.getItem(this.key());
          if (raw) {
            var saved = JSON.parse(raw);
            CONFIG.prizes.forEach(function (p) {
              var total = Stock.totalOf(p);
              if (total === null) return;
              if (typeof saved[p.id] === 'number') {
                data[p.id] = Math.max(0, Math.min(total, Math.floor(saved[p.id])));
              }
            });
          }
        } catch (e) {
          // 사생활 보호 모드 등에서 localStorage 를 못 쓰는 경우 — 이번 회차만 세고 넘어간다
        }
      }

      this._data = data;
      return this._data;
    },

    save: function () {
      if (!this.enabled()) return;
      try {
        window.localStorage.setItem(this.key(), JSON.stringify(this._data));
      } catch (e) { /* 저장 실패해도 진행에는 문제 없음 */ }
    },

    /** 남은 수량. 무제한이면 null */
    left: function (prize) {
      if (this.totalOf(prize) === null) return null;
      var data = this.load();
      return data[prize.id];
    },

    isSoldOut: function (prize) {
      var left = this.left(prize);
      return left !== null && left <= 0;
    },

    consume: function (prize) {
      if (this.totalOf(prize) === null) return;
      var data = this.load();
      if (data[prize.id] > 0) {
        data[prize.id] -= 1;
        this.save();
      }
    },

    reset: function () {
      this._data = null;
      try { window.localStorage.removeItem(this.key()); } catch (e) {}
    }
  };

  /* ------------------------------- 상태 ---------------------------------- */
  var SCREEN_ORDER = ['intro', 'quiz', 'prize', 'ladder', 'ending'];

  var state = {
    screen: 'intro',
    quizAnswered: false,
    prizeIndex: null,
    result: null,        // 공개된 상품
    consumed: false,     // 이번 회차에 수량을 이미 차감했는지
    running: false       // 사다리 진행 중
  };

  var ladderView = null;
  var autoRestartTimer = null;
  var autoStartTimer = null;

  /* ---------------------------- 화면 전환 -------------------------------- */
  function showScreen(name) {
    state.screen = name;

    SCREEN_ORDER.forEach(function (key) {
      var section = $('screen-' + key);
      if (!section) return;
      var active = key === name;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });

    $('topbar').hidden = name === 'intro';

    updateNav();
    window.scrollTo(0, 0);
  }

  /* ------------------------- 앞/뒤 이동 버튼 ----------------------------- */
  function canGoNext() {
    if (state.running) return false;
    switch (state.screen) {
      case 'intro':  return true;
      case 'quiz':   return true;
      case 'prize':  return state.prizeIndex !== null;
      case 'ladder': return true;
      default:       return false;   // 엔딩이 마지막
    }
  }

  function canGoPrev() {
    return !state.running && state.screen !== 'intro';
  }

  function updateNav() {
    var nav = CONFIG.nav || {};
    var prev = $('btnPrev');
    var next = $('btnNext');
    prev.hidden = nav.showBack === false;
    next.hidden = nav.showNext === false;
    prev.disabled = !canGoPrev();
    next.disabled = !canGoNext();
  }

  function goNext() {
    if (!canGoNext()) return;
    var i = SCREEN_ORDER.indexOf(state.screen);
    if (i < 0 || i >= SCREEN_ORDER.length - 1) return;
    enter(SCREEN_ORDER[i + 1], false);
  }

  function goPrev() {
    if (!canGoPrev()) return;
    var i = SCREEN_ORDER.indexOf(state.screen);
    if (i <= 0) return;
    enter(SCREEN_ORDER[i - 1], true);
  }

  /**
   * 화면 진입
   * @param {boolean} backwards 뒤로 이동인지 (뒤로 갈 때는 사다리 결과를 유지)
   */
  function enter(name, backwards) {
    clearAutoStart();
    if (state.screen === 'ending') clearAutoRestart();

    if (name === 'prize') {
      showScreen('prize');
      renderPrizes();
      return;
    }
    if (name === 'ladder') {
      showScreen('ladder');
      if (!backwards) renderLadder();       // 앞으로 진입할 때만 새 사다리 + 자동 시작
      else if (ladderView) requestAnimationFrame(function () { ladderView.render(); });
      return;
    }
    if (name === 'ending') {
      showScreen('ending');
      renderEnding();
      return;
    }
    showScreen(name);
  }

  /* ============================= 1. 인트로 ============================== */
  function renderIntro() {
    var c = CONFIG.intro;
    if (c.logo) {
      var logo = $('introLogo');
      logo.addEventListener('error', function () { logo.hidden = true; });
      logo.src = c.logo;
      logo.hidden = false;
    }
    $('introEyebrow').textContent = c.eyebrow || '';
    $('introTitle').textContent = c.title || '';
    $('introSubtitle').textContent = c.subtitle || '';

    var meta = $('introMeta');
    meta.innerHTML = '';
    (c.meta || []).forEach(function (item) {
      meta.appendChild(el('dt', 'intro__meta-term', item.term));
      meta.appendChild(el('dd', 'intro__meta-desc', item.desc));
    });
    $('btnStart').textContent = c.startLabel || '시작하기';
  }

  /* ============================== 2. 퀴즈 =============================== */
  function renderQuiz() {
    var c = CONFIG.quiz;
    state.quizAnswered = false;

    $('quizEyebrow').textContent = c.eyebrow || 'QUIZ';
    $('quizQuestion').textContent = c.question || '';
    $('quizFeedback').hidden = true;
    $('btnQuizNext').hidden = true;
    $('btnQuizNext').textContent = c.nextLabel || '다음';

    var list = $('quizChoices');
    list.innerHTML = '';
    (c.choices || []).forEach(function (text, index) {
      var li = el('li', 'choices__item');
      var btn = el('button', 'choice');
      btn.type = 'button';
      btn.setAttribute('data-index', String(index));
      btn.appendChild(el('span', 'choice__no', String(index + 1)));
      btn.appendChild(el('span', 'choice__text', text));
      btn.addEventListener('click', function () { onQuizAnswer(index, btn); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function onQuizAnswer(index, btn) {
    var c = CONFIG.quiz;
    if (state.quizAnswered) return;

    var feedback = $('quizFeedback');

    if (index === c.answerIndex) {
      state.quizAnswered = true;
      btn.classList.add('is-correct');
      disableChoices();
      $('quizFeedbackTitle').textContent = c.correctTitle || '정답이에요!';
      $('quizFeedbackDesc').textContent = c.correctDesc || '';
      feedback.className = 'feedback feedback--correct';
      feedback.hidden = false;
      $('btnQuizNext').hidden = false;
      return;
    }

    btn.classList.add('is-wrong');
    $('quizFeedbackTitle').textContent = c.wrongTitle || '아쉬워요';
    feedback.className = 'feedback feedback--wrong';
    feedback.hidden = false;

    if (c.allowRetry) {
      btn.disabled = true;                       // 방금 고른 것만 잠그고 다시 고르게
      $('quizFeedbackDesc').textContent = c.wrongDesc || '';
    } else {
      state.quizAnswered = true;                 // 한 번에 판정 → 정답 알려주고 진행
      disableChoices();
      var answerBtn = $('quizChoices').querySelector('[data-index="' + c.answerIndex + '"]');
      if (answerBtn) answerBtn.classList.add('is-correct');
      $('quizFeedbackDesc').textContent = c.correctDesc || c.wrongDesc || '';
      $('btnQuizNext').hidden = false;
    }
  }

  function disableChoices() {
    each($('quizChoices').querySelectorAll('.choice'), function (b) { b.disabled = true; });
  }

  /* ====================== 3. 상자 선택 (이름 비공개) ==================== */
  function renderPrizes() {
    var c = CONFIG.prizeScreen || {};
    state.prizeIndex = null;

    $('prizeEyebrow').textContent = c.eyebrow || 'PRIZE';
    $('prizeHeading').textContent = c.heading || '상자 하나를 골라주세요';
    $('prizeSubheading').textContent = c.subheading || '';
    $('btnPrizeNext').textContent = c.nextLabel || '선택 완료';
    $('btnPrizeNext').disabled = true;

    var list = $('prizeList');
    list.innerHTML = '';
    var available = 0;

    CONFIG.prizes.forEach(function (prize, index) {
      var soldOut = Stock.isSoldOut(prize);
      if (!soldOut) available++;

      var li = el('li', 'prizes__item');
      var btn = el('button', 'prize');
      btn.type = 'button';
      btn.setAttribute('data-index', String(index));
      btn.disabled = soldOut;
      btn.classList.toggle('is-soldout', soldOut);

      btn.appendChild(el('span', 'prize__box', c.boxEmoji || '🎁'));
      btn.appendChild(el('span', 'prize__no',
        (c.boxLabels && c.boxLabels[index]) || String(index + 1)));

      var total = Stock.totalOf(prize);
      if (total !== null) {
        var left = Stock.left(prize);
        btn.appendChild(el('span', 'prize__stock',
          soldOut ? (c.soldOutLabel || '품절') : (left + ' / ' + total)));
      }

      btn.addEventListener('click', function () { selectPrize(index); });
      li.appendChild(btn);
      list.appendChild(li);
    });

    var notice = $('prizeSoldOut');
    if (available === 0) {
      notice.textContent = c.allSoldOutMessage || '준비된 상품이 모두 소진되었어요.';
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }

    updateNav();
  }

  function selectPrize(index) {
    var prize = CONFIG.prizes[index];
    if (!prize || Stock.isSoldOut(prize)) return;

    state.prizeIndex = index;
    each($('prizeList').querySelectorAll('.prize'), function (b) {
      b.classList.toggle('is-selected', b.getAttribute('data-index') === String(index));
    });
    $('btnPrizeNext').disabled = false;
    updateNav();
  }

  /* =========================== 4. 사다리타기 ============================ */
  function currentPrize() {
    return CONFIG.prizes[state.prizeIndex] || CONFIG.prizes[0];
  }

  function laneColors() {
    return (CONFIG.ladder.colors && CONFIG.ladder.colors.length)
      ? CONFIG.ladder.colors
      : ['#ff8a3d', '#3b5bfd', '#16a34a', '#e5484d', '#a855f7'];
  }

  function renderLadder() {
    var conf = CONFIG.ladder;
    var lanes = conf.lanes;
    var colors = laneColors();

    state.result = null;
    state.consumed = false;
    state.running = false;

    $('ladderEyebrow').textContent = conf.eyebrow || 'LADDER';
    $('ladderHeading').textContent = conf.heading || '';
    $('ladderSubheading').textContent = conf.subheading || '';
    $('btnLadderStart').textContent = conf.startLabel || '스타트';
    $('btnLadderStart').hidden = conf.autoStart !== false;   // 자동 시작이면 버튼 숨김
    $('btnLadderStart').disabled = false;
    $('btnLadderNext').textContent = conf.nextLabel || '다음';
    $('btnLadderNext').hidden = true;

    resetMerge();

    /* 위쪽 번호 (선택하지 않음 — 색깔 안내용) */
    var heads = $('ladderHeads');
    heads.innerHTML = '';
    heads.style.setProperty('--lanes', lanes);
    for (var i = 0; i < lanes; i++) {
      var cell = el('div', 'ladder__cell');
      var head = el('div', 'head');
      head.style.setProperty('--lane-color', colors[i % colors.length]);
      head.appendChild(el('span', 'head__label',
        (conf.headLabels && conf.headLabels[i]) || String(i + 1)));
      cell.appendChild(head);
      heads.appendChild(cell);
    }

    /* 아래쪽 가려진 칸 */
    var feet = $('ladderFeet');
    feet.innerHTML = '';
    feet.style.setProperty('--lanes', lanes);
    for (var j = 0; j < lanes; j++) {
      var cell2 = el('div', 'ladder__cell');
      var foot = el('div', 'foot');
      foot.setAttribute('data-index', String(j));
      foot.appendChild(el('span', 'foot__cover-text', conf.coverLabel || '?'));
      cell2.appendChild(foot);
      feet.appendChild(cell2);
    }

    /* SVG 뷰 */
    if (!ladderView) {
      ladderView = new Ladder.LadderView({
        svg: $('ladderSvg'),
        board: $('ladderBoard'),
        lanes: lanes,
        rows: conf.rows,
        colors: colors,
        tailLength: conf.tailLength || 80,
        laneX: measureLaneX
      });
    }
    ladderView.lanes = lanes;
    ladderView.rows = conf.rows;
    ladderView.colors = colors;
    ladderView.tailLength = conf.tailLength || 80;
    ladderView.generate();

    requestAnimationFrame(function () { ladderView.render(); });
    updateNav();

    /* 아무것도 누르지 않아도 잠시 뒤 자동으로 출발 */
    if (conf.autoStart !== false) {
      clearAutoStart();
      autoStartTimer = setTimeout(startLadder, conf.autoStartDelayMs || 800);
    }
  }

  /** 위쪽 번호칸의 실제 중심 x좌표를 재서 사다리 기둥 위치로 사용 */
  function measureLaneX() {
    var base = $('ladder').getBoundingClientRect().left;
    var xs = [];
    each($('ladderHeads').querySelectorAll('.head'), function (b) {
      var r = b.getBoundingClientRect();
      xs.push(r.left + r.width / 2 - base);
    });
    return xs;
  }

  function clearAutoStart() {
    if (autoStartTimer) {
      clearTimeout(autoStartTimer);
      autoStartTimer = null;
    }
  }

  function startLadder() {
    clearAutoStart();
    if (state.result || state.running) return;

    var conf = CONFIG.ladder;
    state.running = true;
    $('btnLadderStart').disabled = true;
    $('ladder').classList.add('is-running');
    updateNav();

    ladderView.trace(conf.traceMs || 2600, function () {
      setTimeout(mergeAndReveal, conf.mergeDelayMs || 260);
    });
  }

  /**
   * 아래 5칸이 가운데로 모여 하나가 되고, 사다리는 사라지면서
   * 고른 상자의 상품과 QR이 화면 중앙으로 올라온다.
   */
  function mergeAndReveal() {
    var conf = CONFIG.ladder;
    var prize = currentPrize();

    state.result = {
      id: prize.id,
      name: prize.name || '',
      emoji: prize.emoji || '',
      caption: prize.note || '',
      image: prize.qrImage || ''
    };

    if (!state.consumed) {          // 수량 차감은 회차당 한 번만
      Stock.consume(prize);
      state.consumed = true;
    }

    var area = $('ladderFootArea');
    var feetRow = $('ladderFeet');
    var merge = $('ladderMerge');

    // 현재 높이를 고정해 두고 시작 (높이 애니메이션의 출발점)
    area.style.height = area.offsetHeight + 'px';

    // 각 칸이 가운데로 모이도록 이동 거리 계산
    var areaRect = area.getBoundingClientRect();
    var centerX = areaRect.width / 2;
    var feet = feetRow.querySelectorAll('.foot');
    each(feet, function (f, i) {
      var r = f.getBoundingClientRect();
      var cx = r.left + r.width / 2 - areaRect.left;
      f.style.setProperty('--dx', Math.round(centerX - cx) + 'px');
      f.style.transitionDelay = Math.round(Math.abs(i - (feet.length - 1) / 2) * 45) + 'ms';
    });

    requestAnimationFrame(function () {
      feetRow.classList.add('is-merging');
      $('ladder').classList.add('is-revealed');   // 사다리(번호·판) 접기
      $('ladderIntro').classList.add('is-hidden');
    });

    // 다 모인 뒤 결과 카드가 펼쳐진다
    setTimeout(function () {
      $('mergeLead').textContent = conf.revealLead || '당신이 고른 상품은';
      $('mergeLabel').textContent = (state.result.emoji ? state.result.emoji + ' ' : '') + state.result.name;
      $('mergeCaption').textContent = state.result.caption;
      fillBox($('mergeQr'), state.result.image, state.result.name + ' QR 코드');

      merge.className = 'merge merge--win';
      merge.hidden = false;

      requestAnimationFrame(function () {
        area.style.height = merge.offsetHeight + 'px';
        merge.classList.add('is-in');
      });

      // 애니메이션이 끝나면 결과 카드가 직접 자리를 차지하도록 전환
      setTimeout(function () {
        area.classList.add('is-merged');
        area.style.height = '';
        state.running = false;
        $('btnLadderStart').hidden = true;
        $('btnLadderNext').hidden = false;
        updateNav();
      }, 620);
    }, 500);
  }

  function resetMerge() {
    var area = $('ladderFootArea');
    var feetRow = $('ladderFeet');
    var merge = $('ladderMerge');

    area.style.height = '';
    area.classList.remove('is-merged');
    feetRow.classList.remove('is-merging');
    each(feetRow.querySelectorAll('.foot'), function (f) {
      f.style.removeProperty('--dx');
      f.style.transitionDelay = '';
    });

    merge.hidden = true;
    merge.className = 'merge';
    $('mergeLead').textContent = '';
    $('mergeLabel').textContent = '';
    $('mergeCaption').textContent = '';
    $('mergeQr').innerHTML = '';

    $('ladder').classList.remove('is-running', 'is-revealed');
    $('ladderIntro').classList.remove('is-hidden');
  }

  /* ============================== 5. 엔딩 =============================== */
  function renderEnding() {
    var c = CONFIG.ending;
    $('endingTitle').textContent = c.title || '';
    $('endingMessage').textContent = c.message || '';
    $('btnRestart').textContent = c.restartLabel || '처음으로';

    var prizeCard = $('endingPrizeCard');
    if (c.showPrizeQr && state.result) {
      $('endingPrizeLabel').textContent = c.prizeLabel || '내가 받은 선물';
      fillBox($('endingPrizeQr'), state.result.image, state.result.name + ' QR 코드');
      $('endingPrizeCaption').textContent =
        (state.result.emoji ? state.result.emoji + ' ' : '') + state.result.name;
      prizeCard.hidden = false;
    } else {
      prizeCard.hidden = true;
    }

    var linkCard = $('endingLinkCard');
    if (c.link && c.link.image) {
      $('endingLinkLabel').textContent = c.link.label || '';
      fillBox($('endingLinkQr'), c.link.image, (c.link.label || '') + ' QR 코드');
      $('endingLinkCaption').textContent = c.link.caption || '';
      linkCard.hidden = false;
    } else {
      linkCard.hidden = true;
    }

    startAutoRestart();
  }

  function startAutoRestart() {
    clearAutoRestart();
    var sec = CONFIG.ending.autoRestartSec || 0;
    var label = $('autoReset');
    if (sec <= 0) { label.hidden = true; return; }

    var left = sec;
    label.hidden = false;
    label.textContent = left + '초 뒤 처음 화면으로 돌아갑니다';
    autoRestartTimer = setInterval(function () {
      left--;
      if (left <= 0) { clearAutoRestart(); restart(); return; }
      label.textContent = left + '초 뒤 처음 화면으로 돌아갑니다';
    }, 1000);
  }

  function clearAutoRestart() {
    if (autoRestartTimer) {
      clearInterval(autoRestartTimer);
      autoRestartTimer = null;
    }
    $('autoReset').hidden = true;
  }

  /* ============================ 흐름 제어 =============================== */
  function restart() {
    clearAutoRestart();
    clearAutoStart();
    if (ladderView) ladderView.reset();
    resetMerge();
    state.prizeIndex = null;
    state.result = null;
    state.consumed = false;
    state.running = false;
    renderQuiz();
    renderPrizes();
    showScreen('intro');
  }

  function bindEvents() {
    $('btnStart').addEventListener('click', goNext);
    $('btnQuizNext').addEventListener('click', goNext);
    $('btnPrizeNext').addEventListener('click', goNext);
    $('btnLadderNext').addEventListener('click', goNext);
    $('btnLadderStart').addEventListener('click', startLadder);
    $('btnRestart').addEventListener('click', restart);

    $('btnPrev').addEventListener('click', goPrev);
    $('btnNext').addEventListener('click', goNext);
    $('btnBrand').addEventListener('click', restart);   // 가운데 로고 → 처음 화면으로

    // 키보드(← →)로도 이동 — 프로젝터/키오스크 운영용
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    });

    // 창 크기가 바뀌면 사다리를 다시 그린다
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (state.screen !== 'ladder' || !ladderView) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { ladderView.render(); }, 120);
    });
  }

  /* ============================== 시작 ================================== */
  function init() {
    if (typeof CONFIG === 'undefined') {
      document.body.innerHTML = '<p style="padding:24px">config.js 를 불러오지 못했습니다.</p>';
      return;
    }

    // index.html?reset=1 로 열면 수량을 처음 상태로 되돌린다
    if (/[?&]reset=1/.test(window.location.search)) {
      Stock.reset();
    }

    var nav = CONFIG.nav || {};
    $('btnPrevLabel').textContent = nav.backLabel || '이전';
    $('btnNextLabel').textContent = nav.nextLabel || '다음';
    $('btnBrand').textContent = nav.brand || 'MIRACLE';

    renderIntro();
    renderQuiz();
    renderPrizes();
    bindEvents();
    showScreen('intro');

    // 운영자용: 콘솔에서 EventStock.reset() 으로도 초기화 가능
    window.EventStock = Stock;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
