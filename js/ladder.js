/* =============================================================================
 *  ladder.js — 사다리타기 로직 + SVG 그리기
 *  (내용 수정은 config.js 에서 하시면 됩니다. 이 파일은 동작 담당이에요.)
 * ========================================================================== */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ---------------------------------------------------------------------------
   * 배열 섞기 (Fisher–Yates)
   * ------------------------------------------------------------------------ */
  function shuffle(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* ---------------------------------------------------------------------------
   * 가로 다리 만들기
   *   rung = { row: 층 번호, col: 왼쪽 기둥 번호 }  → col 과 col+1 을 연결
   * ------------------------------------------------------------------------ */
  function buildRungs(lanes, rows) {
    var rungs = [];
    var prevRow = [];   // 바로 윗층에 다리가 있었는지 (같은 자리 연속 배치 방지)
    for (var r = 0; r < rows; r++) {
      var thisRow = [];
      var lastCol = -2;
      for (var c = 0; c < lanes - 1; c++) {
        if (c - lastCol < 2) continue;   // 같은 층에서 이웃한 다리 금지
        if (prevRow[c]) continue;        // 윗층과 같은 자리에 연속으로 놓지 않음
        if (Math.random() < 0.55) {
          rungs.push({ row: r, col: c });
          thisRow[c] = true;
          lastCol = c;
        }
      }
      prevRow = thisRow;
    }
    return rungs;
  }

  /** 출발 칸 → 도착 칸 + 이동 경로 */
  function walk(rungs, start, rows) {
    var lane = start;
    var moves = [];
    for (var r = 0; r < rows; r++) {
      var next = null;
      for (var i = 0; i < rungs.length; i++) {
        var g = rungs[i];
        if (g.row !== r) continue;
        if (g.col === lane) { next = lane + 1; break; }
        if (g.col === lane - 1) { next = lane - 1; break; }
      }
      if (next !== null) {
        moves.push({ row: r, from: lane, to: next });
        lane = next;
      }
    }
    return { end: lane, moves: moves };
  }

  /** 재미없는 사다리(다리 없는 기둥 / 제자리 도착)를 걸러서 다시 만든다 */
  function buildGoodRungs(lanes, rows) {
    for (var attempt = 0; attempt < 50; attempt++) {
      var rungs = buildRungs(lanes, rows);

      var hasBridge = true;
      for (var c = 0; c < lanes - 1; c++) {
        var found = false;
        for (var i = 0; i < rungs.length; i++) {
          if (rungs[i].col === c) { found = true; break; }
        }
        if (!found) { hasBridge = false; break; }
      }
      if (!hasBridge) continue;

      var identity = true;
      for (var s = 0; s < lanes; s++) {
        if (walk(rungs, s, rows).end !== s) { identity = false; break; }
      }
      if (!identity) return rungs;
    }
    return buildRungs(lanes, rows);
  }

  function round(n) { return Math.round(n * 10) / 10; }

  /* ---------------------------------------------------------------------------
   * LadderView — SVG 렌더링 + 애니메이션
   *
   *   new LadderView({
   *     svg   : <svg> 엘리먼트,
   *     board : <svg> 를 감싼 박스(크기 기준),
   *     lanes : 기둥 수,
   *     rows  : 층 수,
   *     laneX : function(){ return [x0, x1, ...] }   // 기둥 중심 x좌표(px) 배열
   *   })
   * ------------------------------------------------------------------------ */
  function LadderView(options) {
    this.svg = options.svg;
    this.board = options.board;
    this.lanes = options.lanes;
    this.rows = options.rows;
    this.laneXProvider = options.laneX;

    this.rungs = [];
    this.padding = 8;
    this.width = 0;
    this.height = 0;

    this._raf = null;
    this._highlight = null;
    this._traceComplete = false;

    this.gStatic = document.createElementNS(SVG_NS, 'g');
    this.gTrace = document.createElementNS(SVG_NS, 'g');
    this.svg.appendChild(this.gStatic);
    this.svg.appendChild(this.gTrace);

    this.tracePaths = [];
    this.markers = [];
    this._lines = [];
  }

  /** 새 사다리 생성 (가로 다리 재배치) */
  LadderView.prototype.generate = function () {
    this.rungs = buildGoodRungs(this.lanes, this.rows);
    this._highlight = null;
    this._traceComplete = false;
    this.render();
  };

  LadderView.prototype.laneX = function (index) {
    var xs = this.laneXProvider();
    if (xs && xs.length === this.lanes) return xs[index];
    var w = this.width || 1;
    return ((index + 0.5) * w) / this.lanes;   // 폴백: 균등 분할
  };

  LadderView.prototype.topY = function () { return this.padding; };
  LadderView.prototype.bottomY = function () { return this.height - this.padding; };

  LadderView.prototype.rowY = function (row) {
    var top = this.topY();
    var span = this.bottomY() - top;
    return top + ((row + 1) * span) / (this.rows + 1);
  };

  /** 현재 박스 크기에 맞춰 사다리를 다시 그린다 */
  LadderView.prototype.render = function () {
    var rect = this.board.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.svg.setAttribute('viewBox', '0 0 ' + this.width + ' ' + this.height);

    var i;

    /* --- 기둥 + 가로 다리 --- */
    while (this.gStatic.firstChild) this.gStatic.removeChild(this.gStatic.firstChild);

    for (i = 0; i < this.lanes; i++) {
      var pole = document.createElementNS(SVG_NS, 'line');
      var x = this.laneX(i);
      pole.setAttribute('x1', round(x));
      pole.setAttribute('y1', this.topY());
      pole.setAttribute('x2', round(x));
      pole.setAttribute('y2', this.bottomY());
      pole.setAttribute('class', 'ladder__pole');
      this.gStatic.appendChild(pole);
    }

    for (i = 0; i < this.rungs.length; i++) {
      var g = this.rungs[i];
      var rung = document.createElementNS(SVG_NS, 'line');
      var y = this.rowY(g.row);
      rung.setAttribute('x1', round(this.laneX(g.col)));
      rung.setAttribute('y1', round(y));
      rung.setAttribute('x2', round(this.laneX(g.col + 1)));
      rung.setAttribute('y2', round(y));
      rung.setAttribute('class', 'ladder__rung');
      this.gStatic.appendChild(rung);
    }

    /* --- 경로선 (기둥 수만큼) --- */
    while (this.gTrace.firstChild) this.gTrace.removeChild(this.gTrace.firstChild);
    this.tracePaths = [];
    this.markers = [];

    // 내 선이 항상 맨 위에 보이도록 나머지를 먼저 그린다
    var order = [];
    for (i = 0; i < this.lanes; i++) if (i !== this._highlight) order.push(i);
    if (this._highlight !== null) order.push(this._highlight);

    for (var k = 0; k < order.length; k++) {
      var lane = order[k];
      var mine = lane === this._highlight;

      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'ladder__trace' + (mine ? ' ladder__trace--mine' : ''));
      path.setAttribute('fill', 'none');
      path.setAttribute('d', '');

      var marker = document.createElementNS(SVG_NS, 'circle');
      marker.setAttribute('class', 'ladder__marker' + (mine ? ' ladder__marker--mine' : ''));
      marker.setAttribute('r', mine ? 8 : 5);
      marker.style.opacity = '0';

      this.gTrace.appendChild(path);
      this.gTrace.appendChild(marker);
      this.tracePaths[lane] = path;
      this.markers[lane] = marker;
    }

    // 이미 끝까지 내려간 상태라면 경로를 그대로 다시 그린다
    if (this._traceComplete && this._highlight !== null) {
      for (i = 0; i < this.lanes; i++) {
        var pts = this.points(i);
        var d = 'M' + round(pts[0].x) + ' ' + round(pts[0].y);
        for (var p = 1; p < pts.length; p++) d += 'L' + round(pts[p].x) + ' ' + round(pts[p].y);
        this.tracePaths[i].setAttribute('d', d);
        var last = pts[pts.length - 1];
        this.markers[i].setAttribute('cx', round(last.x));
        this.markers[i].setAttribute('cy', round(last.y));
        this.markers[i].style.opacity = '1';
      }
    }

    // 애니메이션 도중에 다시 그렸다면(창 크기 변경 등) 새 요소·좌표로 갈아끼운다
    if (this._raf) this._lines = this._buildLines();
  };

  /** 경로별 좌표·길이·엘리먼트 묶음 만들기 */
  LadderView.prototype._buildLines = function () {
    var lines = [];
    for (var lane = 0; lane < this.lanes; lane++) {
      var pts = this.points(lane);
      var lens = [];
      var total = 0;
      for (var i = 1; i < pts.length; i++) {
        var dx = pts[i].x - pts[i - 1].x;
        var dy = pts[i].y - pts[i - 1].y;
        lens.push(Math.sqrt(dx * dx + dy * dy));
        total += lens[lens.length - 1];
      }
      lines.push({
        pts: pts, lens: lens, total: total || 1,
        path: this.tracePaths[lane], marker: this.markers[lane]
      });
      this.markers[lane].style.opacity = '1';
    }
    return lines;
  };

  /** 출발 칸의 도착 칸 번호 */
  LadderView.prototype.destination = function (start) {
    return walk(this.rungs, start, this.rows).end;
  };

  /** 출발 칸의 경로 좌표 배열 */
  LadderView.prototype.points = function (start) {
    var result = walk(this.rungs, start, this.rows);
    var pts = [{ x: this.laneX(start), y: this.topY() }];
    for (var i = 0; i < result.moves.length; i++) {
      var mv = result.moves[i];
      var y = this.rowY(mv.row);
      pts.push({ x: this.laneX(mv.from), y: y });
      pts.push({ x: this.laneX(mv.to), y: y });
    }
    pts.push({ x: this.laneX(result.end), y: this.bottomY() });
    return pts;
  };

  /**
   * 5개 선이 '동시에' 출발해서 같은 시간에 도착하는 애니메이션
   * @param {number} highlight 내가 고른 칸 (강조 표시)
   */
  LadderView.prototype.trace = function (highlight, duration, onDone) {
    var self = this;
    this.cancel();
    this._highlight = highlight;
    this._traceComplete = false;
    this.render();   // 강조 선을 맨 위로 다시 쌓는다
    this._lines = this._buildLines();

    var startTime = null;
    function step(now) {
      if (startTime === null) startTime = now;
      var progress = Math.min(1, (now - startTime) / duration);

      for (var n = 0; n < self._lines.length; n++) {
        var L = self._lines[n];
        var target = L.total * progress;
        var d = 'M' + round(L.pts[0].x) + ' ' + round(L.pts[0].y);
        var acc = 0;
        var cur = L.pts[0];

        for (var k = 1; k < L.pts.length; k++) {
          if (acc + L.lens[k - 1] <= target) {
            d += 'L' + round(L.pts[k].x) + ' ' + round(L.pts[k].y);
            acc += L.lens[k - 1];
            cur = L.pts[k];
          } else {
            var f = L.lens[k - 1] === 0 ? 0 : (target - acc) / L.lens[k - 1];
            var x = L.pts[k - 1].x + (L.pts[k].x - L.pts[k - 1].x) * f;
            var y = L.pts[k - 1].y + (L.pts[k].y - L.pts[k - 1].y) * f;
            d += 'L' + round(x) + ' ' + round(y);
            cur = { x: x, y: y };
            break;
          }
        }

        L.path.setAttribute('d', d);
        L.marker.setAttribute('cx', round(cur.x));
        L.marker.setAttribute('cy', round(cur.y));
      }

      if (progress < 1) {
        self._raf = global.requestAnimationFrame(step);
      } else {
        self._raf = null;
        self._traceComplete = true;
        if (onDone) onDone();
      }
    }

    this._raf = global.requestAnimationFrame(step);
  };

  LadderView.prototype.cancel = function () {
    if (this._raf) {
      global.cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  };

  LadderView.prototype.reset = function () {
    this.cancel();
    this._highlight = null;
    this._traceComplete = false;
    this._lines = [];
    for (var i = 0; i < this.tracePaths.length; i++) {
      if (!this.tracePaths[i]) continue;
      this.tracePaths[i].setAttribute('d', '');
      this.markers[i].style.opacity = '0';
    }
  };

  global.Ladder = {
    LadderView: LadderView,
    shuffle: shuffle,
    walk: walk,
    buildGoodRungs: buildGoodRungs
  };
})(window);
