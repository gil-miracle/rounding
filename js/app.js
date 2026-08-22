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

  /** 상품 사진 박스. 파일이 없으면 이모지와 넣어야 할 파일 경로를 보여준다. */
  function fillPhoto(container, prize) {
    container.innerHTML = '';
    var box = el('div', 'photobox');

    function fallback() {
      box.classList.add('photobox--missing');
      box.innerHTML = '';
      box.appendChild(el('span', 'photobox__emoji', prize.emoji || '🎁'));
      box.appendChild(el('p', 'photobox__msg', '상품 이미지를 넣어주세요'));
      if (prize.image) box.appendChild(el('code', 'photobox__path', prize.image));
    }

    if (!prize.image) {
      fallback();
    } else {
      var img = el('img', 'photobox__img');
      img.alt = prize.name || '상품 사진';
      img.addEventListener('error', fallback);
      img.src = prize.image;
      box.appendChild(img);
    }

    container.appendChild(box);
  }

  /** 일반 사진 박스 (엔딩 등) */
  function fillImage(container, src, alt) {
    container.innerHTML = '';
    var box = el('div', 'photobox');
    var img = el('img', 'photobox__img');
    img.alt = alt || '';
    img.addEventListener('error', function () {
      box.classList.add('photobox--missing');
      box.innerHTML = '';
      box.appendChild(el('p', 'photobox__msg', '이미지를 찾을 수 없어요'));
      box.appendChild(el('code', 'photobox__path', src));
    });
    img.src = src;
    box.appendChild(img);
    container.appendChild(box);
  }

  /* ===========================================================================
   *  재고(수량) 관리 — localStorage 에 이 기기 기준으로 저장
   *  저장 형태: { cafe: { left: 9, total: 10 }, ... }   (total 이 null 이면 무제한)
   * ======================================================================== */
  function toCount(n) {
    return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : null;
  }

  var Stock = {
    _data: null,

    key: function () {
      return (CONFIG.stock && CONFIG.stock.storageKey) || 'event-stock-v1';
    },

    enabled: function () {
      return !CONFIG.stock || CONFIG.stock.enabled !== false;
    },

    /** config.js 에 적힌 원래 수량 (없거나 기능이 꺼져 있으면 null = 무제한) */
    configTotal: function (prize) {
      if (!this.enabled()) return null;
      return toCount(prize.stock);
    },

    load: function () {
      if (this._data) return this._data;

      var data = {};
      CONFIG.prizes.forEach(function (p) {
        var total = Stock.configTotal(p);
        data[p.id] = { left: total, total: total };
      });

      if (this.enabled()) {
        try {
          var raw = window.localStorage.getItem(this.key());
          var saved = raw ? JSON.parse(raw) : null;
          if (saved) {
            CONFIG.prizes.forEach(function (p) {
              var s = saved[p.id];
              if (s == null) return;

              if (typeof s === 'number') {          // 예전 저장 형식 (남은 수량만)
                var t0 = data[p.id].total;
                if (t0 !== null) data[p.id].left = Math.max(0, Math.min(t0, Math.floor(s)));
                return;
              }
              if (typeof s !== 'object') return;

              var total = toCount(s.total);
              if (total === null && s.total !== null) total = data[p.id].total;
              var left = toCount(s.left);
              if (total === null) {
                data[p.id] = { left: null, total: null };
              } else {
                data[p.id] = { total: total, left: Math.min(left === null ? total : left, total) };
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

    /** 현재 전체 수량 (운영자가 바꿨다면 바뀐 값). 무제한이면 null */
    totalOf: function (prize) {
      return this.load()[prize.id].total;
    },

    /** 남은 수량. 무제한이면 null */
    left: function (prize) {
      return this.load()[prize.id].left;
    },

    isSoldOut: function (prize) {
      var item = this.load()[prize.id];
      return item.total !== null && item.left <= 0;
    },

    consume: function (prize) {
      var item = this.load()[prize.id];
      if (item.total === null) return;
      if (item.left > 0) {
        item.left -= 1;
        this.save();
      }
    },

    /** 운영자 모달에서 값 적용 */
    set: function (prizeId, left, total) {
      var item = this.load()[prizeId];
      if (!item) return;
      if (total === null) {
        item.total = null;
        item.left = null;
        return;
      }
      item.total = Math.max(0, total);
      item.left = Math.max(0, Math.min(item.total, left === null ? item.total : left));
    },

    reset: function () {
      this._data = null;
      try { window.localStorage.removeItem(this.key()); } catch (e) {}
    }
  };

  /* --------------------- 상품 수량 관리 모달 (운영자용) ------------------ */
  function isModalOpen() { return !$('stockModal').hidden; }

  function renderStockRows() {
    var list = $('stockList');
    list.innerHTML = '';

    CONFIG.prizes.forEach(function (prize) {
      var total = Stock.totalOf(prize);
      var left = Stock.left(prize);

      var row = el('li', 'stockrow');
      row.appendChild(el('span', 'stockrow__name',
        (prize.emoji ? prize.emoji + ' ' : '') + (prize.name || prize.id)));

      var fields = el('div', 'stockrow__fields');
      if (total === null) {
        fields.appendChild(el('span', 'stockrow__free', '수량 제한 없음'));
      } else {
        fields.appendChild(makeCountField(prize.id, 'left', '남은', left));
        fields.appendChild(el('span', 'stockrow__slash', '/'));
        fields.appendChild(makeCountField(prize.id, 'total', '전체', total));
      }
      row.appendChild(fields);
      list.appendChild(row);
    });
  }

  function makeCountField(id, field, label, value) {
    var wrap = el('label', 'countfield');
    wrap.appendChild(el('span', 'countfield__label', label));
    var input = el('input', 'countfield__input');
    input.type = 'number';
    input.min = '0';
    input.max = '999';
    input.inputMode = 'numeric';
    input.value = String(value);
    input.setAttribute('data-id', id);
    input.setAttribute('data-field', field);
    wrap.appendChild(input);
    return wrap;
  }

  function openStockModal() {
    renderStockRows();
    $('stockModal').hidden = false;
    document.body.classList.add('is-modal-open');
  }

  function closeStockModal() {
    $('stockModal').hidden = true;
    document.body.classList.remove('is-modal-open');
  }

  function saveStockModal() {
    var values = {};
    each($('stockList').querySelectorAll('.countfield__input'), function (input) {
      var id = input.getAttribute('data-id');
      var n = parseInt(input.value, 10);
      if (isNaN(n) || n < 0) n = 0;
      if (n > 999) n = 999;
      values[id] = values[id] || {};
      values[id][input.getAttribute('data-field')] = n;
    });

    CONFIG.prizes.forEach(function (prize) {
      var v = values[prize.id];
      if (!v) return;                                   // 무제한 상품은 건드리지 않음
      Stock.set(prize.id, v.left, v.total);
    });
    Stock.save();

    renderPrizes();
    closeStockModal();
  }

  /* ------------------------------- 상태 ---------------------------------- */
  /* 퀴즈 → 상자 → 공개 를 두 번 돌고 사다리로 간다 */
  var STEPS = [
    'intro',
    'quiz', 'prize', 'reveal',      // 1회차
    'quiz', 'prize', 'reveal',      // 2회차
    'ladder', 'ending'
  ];
  var SCREEN_NAMES = ['intro', 'quiz', 'prize', 'reveal', 'ladder', 'ending'];

  var state = {
    step: 0,
    screen: 'intro',
    quizAnswered: false,
    quizPicks: [],       // 회차별로 뽑힌 문제
    prizePicks: [],      // 회차별로 고른 상자 번호
    results: [],         // 회차별로 공개된 선물
    consumedFor: {},     // 회차별로 수량을 차감한 상자 번호
    laneCounts: [],      // 사다리 줄별로 내려보낼 공 개수
    arrived: false,      // 사다리가 도착해 신청폼이 공개됐는지
    running: false       // 사다리 진행 중
  };

  /** 지금 화면 이름 */
  function currentScreen() { return STEPS[state.step]; }

  /** 이 단계가 몇 회차인지 (0부터) */
  function roundAt(step) {
    var r = -1;
    for (var i = 0; i <= step && i < STEPS.length; i++) if (STEPS[i] === 'quiz') r++;
    return r < 0 ? 0 : r;
  }
  function currentRound() { return roundAt(state.step); }

  var ladderView = null;
  var autoRestartTimer = null;
  var autoStartTimer = null;

  /* ---------------------------- 화면 전환 -------------------------------- */
  function showScreen(name) {
    state.screen = name;

    SCREEN_NAMES.forEach(function (key) {
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
    if (state.step >= STEPS.length - 1) return false;   // 엔딩이 마지막
    if (currentScreen() === 'prize') return state.prizePicks[currentRound()] != null;
    return true;
  }

  function canGoPrev() {
    return !state.running && state.step > 0;
  }

  function updateNav() {
    var nav = CONFIG.nav || {};
    var prev = $('btnPrev');
    var next = $('btnNext');
    var isLast = state.step >= STEPS.length - 1;
    prev.hidden = nav.showBack === false;
    next.hidden = nav.showNext === false || isLast;   // 마지막 화면에서는 '다음'을 감춘다
    prev.disabled = !canGoPrev();
    next.disabled = !canGoNext();
  }

  function goNext() {
    if (!canGoNext()) return;
    enterStep(state.step + 1, false);
  }

  function goPrev() {
    if (!canGoPrev()) return;
    enterStep(state.step - 1, true);
  }

  /**
   * 단계 진입
   * @param {boolean} backwards 뒤로 이동인지 (뒤로 갈 때는 사다리 결과를 유지)
   */
  function enterStep(index, backwards) {
    if (index < 0 || index >= STEPS.length) return;

    clearAutoStart();
    if (currentScreen() === 'ending') clearAutoRestart();

    state.step = index;
    var name = STEPS[index];
    showScreen(name);

    if (name === 'quiz') renderQuiz();          // 들어올 때마다 문제를 처음 상태로
    else if (name === 'prize') renderPrizes();
    else if (name === 'reveal') renderReveal();
    else if (name === 'ending') renderEnding();
    else if (name === 'ladder') {
      if (!backwards) renderLadder();           // 앞으로 진입할 때만 새 사다리
      else if (ladderView) requestAnimationFrame(function () { ladderView.render(); });
    }
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
    // 배경 그림
    var screen = $('screen-intro');
    if (c.background) {
      screen.style.backgroundImage = 'url("' + c.background + '")';
      screen.classList.add('has-bg');
    } else {
      screen.style.backgroundImage = '';
      screen.classList.remove('has-bg');
    }

    $('introEyebrow').textContent = c.eyebrow || '';
    $('introEyebrow').hidden = c.showEyebrow === false || !c.eyebrow;
    var title = $('introTitle');
    title.innerHTML = '';
    if (c.titleImage) {
      var wordmark = el('img', 'intro__title-img');
      wordmark.alt = c.title || '';
      wordmark.addEventListener('error', function () {   // 파일이 없으면 글자로 대체
        title.innerHTML = '';
        title.textContent = c.title || '';
      });
      wordmark.src = c.titleImage;
      title.appendChild(wordmark);
    } else {
      title.textContent = c.title || '';
    }
    $('introSubtitle').textContent = c.subtitle || '';
    $('introSubtitle').hidden = c.showSubtitle === false || !c.subtitle;
    $('introTitle').hidden = c.showTitle === false;

    var meta = $('introMeta');
    meta.innerHTML = '';
    var rows = c.meta || [];
    rows.forEach(function (item) {
      meta.appendChild(el('dt', 'intro__meta-term', item.term));
      meta.appendChild(el('dd', 'intro__meta-desc', item.desc));
    });
    meta.hidden = rows.length === 0;   // 내용이 없으면 빈 상자를 감춘다
    $('btnStart').textContent = c.startLabel || '시작하기';
  }

  /* ============================== 2. 퀴즈 =============================== */
  function shuffled(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * 이번 회차 문제. 한 번 뽑으면 오갈 때 바뀌지 않는다.
   * 보기 순서는 매번 섞고 정답 위치를 다시 계산한다.
   */
  function currentQuestion() {
    var round = currentRound();
    if (state.quizPicks[round]) return state.quizPicks[round];

    var rounds = (CONFIG.quiz && CONFIG.quiz.rounds) || [];
    var pool = rounds[round] || rounds[rounds.length - 1] || [];
    var picked = pool[Math.floor(Math.random() * pool.length)] || pool[0] || {
      question: '', choices: [], answerIndex: 0
    };

    var choices = picked.choices || [];
    var answerText = choices[picked.answerIndex];
    var mixed = shuffled(choices);

    state.quizPicks[round] = {
      question: picked.question,
      choices: mixed,
      answerIndex: Math.max(0, mixed.indexOf(answerText)),
      correctDesc: picked.correctDesc
    };
    return state.quizPicks[round];
  }

  function renderQuiz() {
    var c = CONFIG.quiz;
    var q = currentQuestion();
    state.quizAnswered = false;

    $('quizEyebrow').textContent = c.eyebrow || 'QUIZ';
    $('quizQuestion').textContent = q.question || '';
    $('quizFeedback').hidden = true;
    $('btnQuizNext').hidden = true;
    $('btnQuizNext').textContent = c.nextLabel || '다음';

    var list = $('quizChoices');
    list.innerHTML = '';
    (q.choices || []).forEach(function (text, index) {
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
    var q = currentQuestion();
    if (state.quizAnswered) return;

    var feedback = $('quizFeedback');

    if (index === q.answerIndex) {
      state.quizAnswered = true;
      btn.classList.add('is-correct');
      disableChoices();
      $('quizFeedbackTitle').textContent = c.correctTitle || '정답이에요!';
      $('quizFeedbackDesc').textContent = q.correctDesc || '';
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
      var answerBtn = $('quizChoices').querySelector('[data-index="' + q.answerIndex + '"]');
      if (answerBtn) answerBtn.classList.add('is-correct');
      $('quizFeedbackDesc').textContent = q.correctDesc || c.wrongDesc || '';
      $('btnQuizNext').hidden = false;
    }
  }

  function disableChoices() {
    each($('quizChoices').querySelectorAll('.choice'), function (b) { b.disabled = true; });
  }

  /* ====================== 3. 상자 선택 (이름 비공개) ==================== */
  function renderPrizes() {
    var c = CONFIG.prizeScreen || {};
    var round = currentRound();
    var chosen = state.prizePicks[round];

    $('prizeEyebrow').textContent = c.eyebrow || 'PRIZE';
    $('prizeHeading').textContent = c.heading || '상자 하나를 골라주세요';
    $('prizeSubheading').textContent = c.subheading || '';
    $('prizeSubheading').hidden = !c.subheading;
    $('btnPrizeNext').textContent = c.nextLabel || '선택 완료';
    $('btnPrizeNext').disabled = chosen == null;

    // 다른 회차에서 이미 고른 상자는 다시 못 고른다
    var taken = {};
    state.prizePicks.forEach(function (idx, r) {
      if (r !== round && idx != null) taken[idx] = true;
    });

    var list = $('prizeList');
    list.innerHTML = '';
    var available = 0;

    CONFIG.prizes.forEach(function (prize, index) {
      var soldOut = Stock.isSoldOut(prize);
      var alreadyTaken = taken[index] === true;
      if (!soldOut && !alreadyTaken) available++;

      var li = el('li', 'prizes__item');
      var btn = el('button', 'prize');
      btn.type = 'button';
      btn.setAttribute('data-index', String(index));
      btn.disabled = soldOut || alreadyTaken;
      btn.classList.toggle('is-soldout', soldOut);
      btn.classList.toggle('is-taken', alreadyTaken && !soldOut);
      btn.classList.toggle('is-selected', chosen === index);

      btn.appendChild(makePrizeIcon(prize));
      if (prize.lead) btn.appendChild(el('span', 'prize__lead', prize.lead));
      btn.appendChild(el('span', 'prize__name', prize.name || ''));

      // 이미 고른 상자는 흐리게만 표시한다 (배지를 넣으면 칸 높이가 들쭉날쭉해짐)
      var total = Stock.totalOf(prize);
      if (!alreadyTaken && total !== null) {
        if (soldOut) {
          btn.appendChild(el('span', 'prize__soldout', c.soldOutLabel || '품절'));
        } else if (c.showStock) {          // 남은 개수는 설정을 켰을 때만 보여준다
          btn.appendChild(el('span', 'prize__stock', Stock.left(prize) + ' / ' + total));
        }
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

  /** 상자 아이콘 — icon 이미지가 있으면 그걸, 없으면 이모지를 쓴다 */
  function makePrizeIcon(prize) {
    var wrap = el('span', 'prize__icon');

    if (prize.icon) {
      var img = el('img', 'prize__icon-img');
      img.alt = '';
      img.addEventListener('error', function () {
        wrap.innerHTML = '';
        wrap.appendChild(el('span', 'prize__emoji', prize.emoji || '🎁'));
      });
      img.src = prize.icon;
      wrap.appendChild(img);
    } else {
      wrap.appendChild(el('span', 'prize__emoji', prize.emoji || '🎁'));
    }
    return wrap;
  }

  function selectPrize(index) {
    var prize = CONFIG.prizes[index];
    if (!prize || Stock.isSoldOut(prize)) return;

    var round = currentRound();
    for (var r = 0; r < state.prizePicks.length; r++) {      // 다른 회차에서 고른 것은 거절
      if (r !== round && state.prizePicks[r] === index) return;
    }

    state.prizePicks[currentRound()] = index;
    each($('prizeList').querySelectorAll('.prize'), function (b) {
      b.classList.toggle('is-selected', b.getAttribute('data-index') === String(index));
    });
    $('btnPrizeNext').disabled = false;
    updateNav();
  }

  /* ====================== 4. 상품 공개 (짜잔!) ========================= */
  function currentPrize() {
    return CONFIG.prizes[state.prizePicks[currentRound()]] || CONFIG.prizes[0];
  }

  function renderReveal() {
    var c = CONFIG.reveal || {};
    var prize = currentPrize();

    var round = currentRound();
    state.results[round] = {
      id: prize.id,
      name: prize.name || '',
      emoji: prize.emoji || '',
      caption: prize.note || '',
      item: prize.item || '',
      image: prize.image || '',
      qrImage: prize.qrImage || ''
    };

    // 수량은 선물이 공개되는 이 시점에 1개 줄어든다 (같은 상자를 다시 봐도 한 번만)
    var picked = state.prizePicks[round];
    if (state.consumedFor[round] !== picked) {
      Stock.consume(prize);
      state.consumedFor[round] = picked;
    }

    $('revealLead').textContent = c.lead || '짜잔! 🎉';
    $('revealItem').textContent = prize.item || prize.name || '';
    $('revealItem').hidden = !prize.item;
    $('revealNote').textContent = prize.note || '';
    $('revealNote').hidden = !prize.note;
    var nextName = STEPS[state.step + 1];
    $('btnRevealNext').textContent = (nextName === 'quiz')
      ? (c.nextLabelMore || '다음 문제로')
      : (c.nextLabel || '사다리 타러 가기');
    fillPhoto($('revealPhoto'), prize);

    // 애니메이션 다시 재생
    var stage = $('revealStage');
    stage.classList.remove('is-in');
    void stage.offsetWidth;
    requestAnimationFrame(function () { stage.classList.add('is-in'); });
  }

  /* =========================== 5. 사다리타기 ============================ */

  function laneColors() {
    return (CONFIG.ladder.colors && CONFIG.ladder.colors.length)
      ? CONFIG.ladder.colors
      : ['#ff8a3d', '#3b5bfd', '#16a34a', '#e5484d', '#a855f7'];
  }

  function renderLadder() {
    var conf = CONFIG.ladder;
    var lanes = conf.lanes;
    var colors = laneColors();

    state.arrived = false;
    state.running = false;

    var range = countRange();
    var def = typeof conf.defaultCount === 'number' ? conf.defaultCount : 1;
    def = Math.max(range.min, Math.min(range.max, def));
    state.laneCounts = [];
    for (var n = 0; n < lanes; n++) state.laneCounts.push(def);

    $('ladderEyebrow').textContent = conf.eyebrow || 'LADDER';
    $('ladderHeading').textContent = conf.heading || '';
    $('ladderSubheading').textContent = conf.subheading || '';
    $('ladderSubheading').hidden = !conf.subheading;
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
      cell.style.setProperty('--lane-color', colors[i % colors.length]);
      var head = el('div', 'head');
      head.style.setProperty('--lane-color', colors[i % colors.length]);
      head.appendChild(el('span', 'head__label',
        (conf.headLabels && conf.headLabels[i]) || String(i + 1)));

      var picSrc = conf.headImages && conf.headImages[i];
      if (picSrc) cell.appendChild(makeLanePic(picSrc, i));   // 사진이 위, 글자가 아래
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
    ladderView.ballGapMs = conf.ballGapMs || 150;
    ladderView.counts = state.laneCounts.slice();
    ladderView.generate();

    syncLaneCounts();                       // 숫자·버튼 상태를 바로 맞춘다
    requestAnimationFrame(function () {
      ladderView.render();
      syncLaneCounts();
    });
    updateNav();

    /* 아무것도 누르지 않아도 잠시 뒤 자동으로 출발 */
    if (conf.autoStart !== false) {
      clearAutoStart();
      autoStartTimer = setTimeout(startLadder, conf.autoStartDelayMs || 800);
    }
  }

  /**
   * 위쪽 칸의 이미지 + 공 개수 조절.
   * 이미지를 누르면 1개씩 늘고, 왼쪽 아래 − 를 누르면 줄어듭니다.
   */
  function makeLanePic(src, lane) {
    var box = el('div', 'lanepic');

    var btn = el('button', 'lanepic__btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', '공 개수 늘리기');
    var img = el('img', 'lanepic__img');
    img.alt = '';
    img.addEventListener('error', function () { btn.classList.add('is-blank'); });
    img.src = src;
    btn.appendChild(img);
    btn.addEventListener('click', function () { bumpLane(lane, +1); });
    box.appendChild(btn);

    var minus = el('button', 'lanepic__minus', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', '공 개수 줄이기');
    minus.addEventListener('click', function () { bumpLane(lane, -1); });
    box.appendChild(minus);

    box.appendChild(el('span', 'lanepic__count', String(state.laneCounts[lane] || 0)));
    return box;
  }

  function countRange() {
    var conf = CONFIG.ladder || {};
    return {
      min: typeof conf.countMin === 'number' ? conf.countMin : 0,
      max: typeof conf.countMax === 'number' ? conf.countMax : 10
    };
  }

  function bumpLane(lane, delta) {
    if (state.running || state.arrived) return;
    var r = countRange();
    var next = (state.laneCounts[lane] || 0) + delta;
    state.laneCounts[lane] = Math.max(r.min, Math.min(r.max, next));
    syncLaneCounts();
  }

  /** 화면의 숫자 표시와 사다리 뷰를 현재 개수에 맞춘다 */
  function syncLaneCounts() {
    var r = countRange();
    each($('ladderHeads').querySelectorAll('.ladder__cell'), function (cell, i) {
      var n = state.laneCounts[i] || 0;
      var badge = cell.querySelector('.lanepic__count');
      if (badge) badge.textContent = String(n);
      var pic = cell.querySelector('.lanepic');
      if (pic) pic.classList.toggle('is-zero', n === 0);
      var minus = cell.querySelector('.lanepic__minus');
      if (minus) minus.disabled = n <= r.min;
      var plus = cell.querySelector('.lanepic__btn');
      if (plus) plus.disabled = n >= r.max;
    });

    if (ladderView) {
      ladderView.counts = state.laneCounts.slice();
      if (!state.running && !state.arrived) ladderView.render();
    }

    var total = state.laneCounts.reduce(function (a, b) { return a + (b || 0); }, 0);
    $('btnLadderStart').disabled = total === 0;   // 공이 하나도 없으면 출발 불가
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
    if (state.arrived || state.running) return;

    var conf = CONFIG.ladder;
    state.running = true;
    $('btnLadderStart').disabled = true;
    $('ladder').classList.add('is-running');
    each($('ladderHeads').querySelectorAll('button'), function (b) { b.disabled = true; });
    updateNav();

    ladderView.trace(conf.traceMs || 2600, function () {
      setTimeout(mergeAndReveal, conf.mergeDelayMs || 260);
    });
  }

  /**
   * 아래 5칸이 가운데로 모여 하나가 되고, 사다리는 사라지면서
   * 컨퍼런스 신청폼 QR이 화면 중앙으로 올라온다.
   * (어느 줄로 내려와도 같은 곳으로 모입니다 — 고른 상자와는 무관)
   */
  function mergeAndReveal() {
    var form = CONFIG.form || {};
    state.arrived = true;

    var area = $('ladderFootArea');
    var feetRow = $('ladderFeet');
    var merge = $('ladderMerge');

    // 현재 높이를 고정해 두고 시작 (높이 애니메이션의 출발점)
    area.style.height = area.offsetHeight + 'px';

    // 각 칸이 가운데로 모이도록 이동 거리 계산
    var areaRect = area.getBoundingClientRect();
    var centerX = areaRect.width / 2;
    var cells = feetRow.querySelectorAll('.ladder__cell');
    each(cells, function (cell, i) {
      var r = cell.getBoundingClientRect();
      var cx = r.left + r.width / 2 - areaRect.left;
      cell.style.setProperty('--dx', Math.round(centerX - cx) + 'px');
      cell.style.transitionDelay = Math.round(Math.abs(i - (cells.length - 1) / 2) * 45) + 'ms';
    });

    requestAnimationFrame(function () {
      feetRow.classList.add('is-merging');
      $('ladder').classList.add('is-revealed');   // 사다리(번호·판) 접기
      $('ladderIntro').classList.add('is-hidden');
    });

    // 다 모인 뒤 결과 카드가 펼쳐진다
    setTimeout(function () {
      $('mergeLead').textContent = form.lead || '어느 길로 내려와도';
      $('mergeLabel').textContent = form.title || '컨퍼런스 신청하기';
      $('mergeCaption').textContent = form.caption || '';
      fillBox($('mergeQr'), form.image, (form.title || '신청폼') + ' QR 코드');

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
    each(feetRow.querySelectorAll('.ladder__cell'), function (cell) {
      cell.style.removeProperty('--dx');
      cell.style.transitionDelay = '';
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
    $('endingMessage').hidden = !c.message;
    $('btnRestart').textContent = c.restartLabel || '처음으로';

    var prizeCard = $('endingPrizeCard');
    var won = null;
    for (var i = state.results.length - 1; i >= 0; i--) {
      if (state.results[i] && state.results[i].qrImage) { won = state.results[i]; break; }
    }
    if (c.showPrizeQr && won) {
      $('endingPrizeLabel').textContent = c.prizeLabel || '내가 받은 선물';
      fillBox($('endingPrizeQr'), won.qrImage, won.name + ' QR 코드');
      $('endingPrizeCaption').textContent = (won.emoji ? won.emoji + ' ' : '') + won.name;
      prizeCard.hidden = false;
    } else {
      prizeCard.hidden = true;
    }

    var form = CONFIG.form || {};
    var linkCard = $('endingLinkCard');
    var usePhoto = !!c.image;
    var linkImage = usePhoto ? c.image : (c.showFormQr !== false ? form.image : '');

    if (linkImage) {
      var label = usePhoto ? (c.imageLabel || '') : (form.title || '');
      var caption = usePhoto ? (c.imageCaption || '') : (form.caption || '');

      $('endingLinkLabel').textContent = label;
      $('endingLinkLabel').hidden = !label;

      if (usePhoto) fillImage($('endingLinkQr'), linkImage, caption || '컨퍼런스 안내 사진');
      else fillBox($('endingLinkQr'), linkImage, (form.title || '') + ' QR 코드');

      $('endingLinkCaption').textContent = caption;
      $('endingLinkCaption').hidden = !caption;
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
    state.step = 0;
    state.quizPicks = [];
    state.prizePicks = [];
    state.results = [];
    state.consumedFor = {};
    state.arrived = false;
    state.running = false;
    renderQuiz();
    renderPrizes();
    showScreen('intro');
  }

  function bindEvents() {
    $('btnStart').addEventListener('click', goNext);
    $('btnQuizNext').addEventListener('click', goNext);
    $('btnPrizeNext').addEventListener('click', goNext);
    $('btnRevealNext').addEventListener('click', goNext);
    $('btnLadderNext').addEventListener('click', goNext);
    $('btnLadderStart').addEventListener('click', startLadder);
    $('btnRestart').addEventListener('click', restart);

    $('btnPrev').addEventListener('click', goPrev);
    $('btnNext').addEventListener('click', goNext);
    $('btnBrand').addEventListener('click', restart);   // 가운데 로고 → 처음 화면으로

    // 상품 수량 관리 모달
    $('btnStockOpen').addEventListener('click', openStockModal);
    $('btnStockCancel').addEventListener('click', closeStockModal);
    $('stockBackdrop').addEventListener('click', closeStockModal);
    $('btnStockSave').addEventListener('click', saveStockModal);

    // 키보드(← →)로도 이동 — 프로젝터/키오스크 운영용
    document.addEventListener('keydown', function (e) {
      if (isModalOpen()) {
        if (e.key === 'Escape') closeStockModal();
        return;                                   // 모달이 열려 있으면 화면 이동 금지
      }
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
    $('btnStockOpen').hidden = !!(CONFIG.stock && CONFIG.stock.hideButton);

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
