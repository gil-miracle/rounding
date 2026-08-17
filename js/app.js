/* =============================================================================
 *  app.js — 화면 전환 및 전체 흐름
 *  인트로 → 퀴즈 → 상품 선택 → 사다리타기 → 엔딩
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

  /* ------------------------------- 상태 ---------------------------------- */
  var SCREEN_ORDER = ['intro', 'quiz', 'prize', 'ladder', 'ending'];

  var state = {
    screen: 'intro',
    quizAnswered: false,
    prizeIndex: null,
    startLane: null,
    slots: [],        // 아래 칸에 배치된 결과들
    result: null,     // 최종 결과
    running: false    // 사다리 애니메이션 진행 중
  };

  var ladderView = null;
  var autoRestartTimer = null;

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

    var current = SCREEN_ORDER.indexOf(name);
    each($('steps').children, function (dot) {
      var idx = SCREEN_ORDER.indexOf(dot.getAttribute('data-step'));
      dot.classList.toggle('is-active', idx === current);
      dot.classList.toggle('is-done', idx < current);
    });

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
    if (state.screen === 'ending') clearAutoRestart();

    if (name === 'ladder') {
      showScreen('ladder');
      if (!backwards) renderLadder();       // 앞으로 진입할 때만 새 사다리
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

  /* =========================== 3. 상품 선택 ============================= */
  function renderPrizes() {
    var c = CONFIG.prizeScreen || {};
    state.prizeIndex = null;

    $('prizeEyebrow').textContent = c.eyebrow || 'PRIZE';
    $('prizeHeading').textContent = c.heading || '받고 싶은 상품을 골라주세요';
    $('prizeSubheading').textContent = c.subheading || '';
    $('btnPrizeNext').textContent = c.nextLabel || '선택 완료';
    $('btnPrizeNext').disabled = true;

    var list = $('prizeList');
    list.innerHTML = '';
    CONFIG.prizes.forEach(function (prize, index) {
      var li = el('li', 'prizes__item');
      var btn = el('button', 'prize');
      btn.type = 'button';
      btn.setAttribute('data-index', String(index));
      btn.appendChild(el('span', 'prize__emoji', prize.emoji || '🎁'));
      btn.appendChild(el('span', 'prize__name', prize.name || ''));
      if (prize.note) btn.appendChild(el('span', 'prize__note', prize.note));
      btn.addEventListener('click', function () { selectPrize(index); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function selectPrize(index) {
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

  /** 선택한 상품의 결과를 아래 칸 수만큼 준비 */
  function prepareSlots() {
    var prize = currentPrize();
    var lanes = CONFIG.ladder.lanes;
    var results = (prize.results || []).slice(0, lanes);

    while (results.length < lanes) {   // 설정이 모자랄 때 방어
      results.push(results[results.length - 1] || { label: prize.name, win: true });
    }

    var slots = results.map(function (r) {
      return {
        label: r.label || prize.name || '당첨',
        caption: r.caption != null ? r.caption : (prize.note || ''),
        image: r.image || prize.qrImage || '',
        win: r.win !== false
      };
    });

    state.slots = CONFIG.ladder.shuffleResults ? Ladder.shuffle(slots) : slots;
  }

  function renderLadder() {
    var conf = CONFIG.ladder;
    var lanes = conf.lanes;

    state.startLane = null;
    state.result = null;
    state.running = false;
    prepareSlots();

    $('ladderEyebrow').textContent = conf.eyebrow || 'LADDER';
    $('ladderHeading').textContent = conf.heading || '번호를 고르고 스타트!';
    $('ladderSubheading').textContent = conf.subheading || '';
    $('btnLadderStart').textContent = conf.startLabel || '스타트';
    $('btnLadderStart').hidden = false;
    $('btnLadderStart').disabled = true;
    $('btnLadderNext').textContent = conf.nextLabel || '다음';
    $('btnLadderNext').hidden = true;

    resetMerge();

    /* 위쪽 선택 버튼 */
    var heads = $('ladderHeads');
    heads.innerHTML = '';
    heads.style.setProperty('--lanes', lanes);
    for (var i = 0; i < lanes; i++) {
      (function (index) {
        var cell = el('div', 'ladder__cell');
        var btn = el('button', 'head');
        btn.type = 'button';
        btn.setAttribute('data-index', String(index));
        btn.appendChild(el('span', 'head__label',
          (conf.headLabels && conf.headLabels[index]) || String(index + 1)));
        btn.addEventListener('click', function () { selectLane(index); });
        cell.appendChild(btn);
        heads.appendChild(cell);
      })(i);
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
        laneX: measureLaneX
      });
    }
    ladderView.lanes = lanes;
    ladderView.rows = conf.rows;
    ladderView.generate();

    requestAnimationFrame(function () { ladderView.render(); });
    updateNav();
  }

  /** 위쪽 버튼의 실제 중심 x좌표를 재서 사다리 기둥 위치로 사용 */
  function measureLaneX() {
    var base = $('ladder').getBoundingClientRect().left;
    var xs = [];
    each($('ladderHeads').querySelectorAll('.head'), function (b) {
      var r = b.getBoundingClientRect();
      xs.push(r.left + r.width / 2 - base);
    });
    return xs;
  }

  function selectLane(index) {
    if (state.result || state.running) return;
    state.startLane = index;
    each($('ladderHeads').querySelectorAll('.head'), function (b) {
      b.classList.toggle('is-selected', b.getAttribute('data-index') === String(index));
    });
    $('btnLadderStart').disabled = false;
  }

  function startLadder() {
    if (state.startLane === null || state.result || state.running) return;

    var conf = CONFIG.ladder;
    state.running = true;
    $('btnLadderStart').disabled = true;
    $('ladder').classList.add('is-running');
    each($('ladderHeads').querySelectorAll('.head'), function (b) { b.disabled = true; });
    updateNav();

    var end = ladderView.destination(state.startLane);

    // 5개 선이 동시에 출발해서 동시에 도착
    ladderView.trace(state.startLane, conf.traceMs || 2400, function () {
      setTimeout(function () { mergeAndReveal(end); }, conf.mergeDelayMs || 260);
    });
  }

  /** 아래 5칸이 가운데로 모여 하나가 되고, 그 자리에 QR이 나타난다 */
  function mergeAndReveal(endIndex) {
    var slot = state.slots[endIndex];
    state.result = slot;

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

    requestAnimationFrame(function () { feetRow.classList.add('is-merging'); });

    // 다 모인 뒤 결과 카드가 펼쳐진다
    setTimeout(function () {
      $('mergeLabel').textContent = slot.label;
      $('mergeCaption').textContent = slot.caption || '';
      if (slot.win) {
        $('mergeQr').hidden = false;
        fillBox($('mergeQr'), slot.image, slot.label + ' QR 코드');
      } else {
        $('mergeQr').hidden = true;
        $('mergeQr').innerHTML = '';
      }
      merge.className = 'merge ' + (slot.win ? 'merge--win' : 'merge--lose');
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
        $('ladder').classList.add('is-done');
        $('btnLadderStart').hidden = true;
        $('btnLadderNext').hidden = false;
        updateNav();
        merge.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    $('mergeLabel').textContent = '';
    $('mergeCaption').textContent = '';
    $('mergeQr').innerHTML = '';
    $('mergeQr').hidden = false;
    $('ladder').classList.remove('is-running', 'is-done');
  }

  /* ============================== 5. 엔딩 =============================== */
  function renderEnding() {
    var c = CONFIG.ending;
    $('endingTitle').textContent = c.title || '';
    $('endingMessage').textContent = c.message || '';
    $('btnRestart').textContent = c.restartLabel || '처음으로';

    var prizeCard = $('endingPrizeCard');
    if (c.showPrizeQr && state.result && state.result.win) {
      $('endingPrizeLabel').textContent = c.prizeLabel || '내가 받은 선물';
      fillBox($('endingPrizeQr'), state.result.image, state.result.label + ' QR 코드');
      $('endingPrizeCaption').textContent = state.result.label;
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
    if (ladderView) ladderView.reset();
    resetMerge();
    state.prizeIndex = null;
    state.startLane = null;
    state.result = null;
    state.slots = [];
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
    var nav = CONFIG.nav || {};
    $('btnPrevLabel').textContent = nav.backLabel || '이전';
    $('btnNextLabel').textContent = nav.nextLabel || '다음';

    renderIntro();
    renderQuiz();
    renderPrizes();
    bindEvents();
    showScreen('intro');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
