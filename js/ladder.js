/* =============================================================================
 *  ladder.js — 사다리타기 로직 + SVG 그리기
 *
 *  · 5개 선이 동시에 출발해 같은 시간에 도착합니다.
 *  · 선이 계속 남지 않고, 색깔 있는 원이 짧은 잔상만 남기며 내려갑니다.
 *  (내용 수정은 config.js 에서 하시면 됩니다. 이 파일은 동작 담당이에요.)
 * ========================================================================== */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var TAIL_STEPS = 7;          // 잔상을 몇 조각으로 나눠 흐리게 할지

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
   * ------------------------------------------------------------------------ */
  function LadderView(options) {
    this.svg = options.svg;
    this.board = options.board;
    this.lanes = options.lanes;
    this.rows = options.rows;
    this.laneXProvider = options.laneX;
    this.colors = options.colors || [];
    this.tailLength = options.tailLength || 80;

    this.rungs = [];
    this.padding = 8;
    this.width = 0;
    this.height = 0;

    this._raf = null;
    this._traceComplete = false;
    this._lines = [];

    this.gStatic = document.createElementNS(SVG_NS, 'g');
    this.gTrace = document.createElementNS(SVG_NS, 'g');
    this.svg.appendChild(this.gStatic);
    this.svg.appendChild(this.gTrace);
  }

  LadderView.prototype.colorOf = function (lane) {
    return this.colors[lane % (this.colors.length || 1)] || '#ff8a3d';
  };

  /** 새 사다리 생성 (가로 다리 재배치) */
  LadderView.prototype.generate = function () {
    this.rungs = buildGoodRungs(this.lanes, this.rows);
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

    /* --- 잔상 + 머리(원) --- */
    while (this.gTrace.firstChild) this.gTrace.removeChild(this.gTrace.firstChild);
    this._lines = this._buildLines();

    if (this._traceComplete) this._drawAt(1);   // 끝난 상태면 도착 지점에 원만 표시
  };

  /** 경로별 좌표·길이·엘리먼트 묶음 만들기 */
  LadderView.prototype._buildLines = function () {
    var lines = [];

    for (var lane = 0; lane < this.lanes; lane++) {
      var pts = this.points(lane);
      var cum = [0];
      var total = 0;
      for (var i = 1; i < pts.length; i++) {
        var dx = pts[i].x - pts[i - 1].x;
        var dy = pts[i].y - pts[i - 1].y;
        total += Math.sqrt(dx * dx + dy * dy);
        cum.push(total);
      }

      var color = this.colorOf(lane);

      // 잔상 조각 (머리에서 먼 쪽일수록 흐리게)
      var tails = [];
      for (var t = TAIL_STEPS - 1; t >= 0; t--) {
        var seg = document.createElementNS(SVG_NS, 'path');
        seg.setAttribute('class', 'ladder__tail');
        seg.setAttribute('fill', 'none');
        seg.setAttribute('stroke', color);
        seg.setAttribute('stroke-opacity', (0.62 * (1 - t / TAIL_STEPS)).toFixed(3));
        seg.setAttribute('stroke-width', round(3 + 3 * (1 - t / TAIL_STEPS)));
        seg.setAttribute('d', '');
        this.gTrace.appendChild(seg);
        tails[t] = seg;
      }

      var glow = document.createElementNS(SVG_NS, 'circle');
      glow.setAttribute('class', 'ladder__glow');
      glow.setAttribute('r', 13);
      glow.setAttribute('fill', color);
      glow.setAttribute('fill-opacity', '.18');
      glow.style.opacity = '0';
      this.gTrace.appendChild(glow);

      var head = document.createElementNS(SVG_NS, 'circle');
      head.setAttribute('class', 'ladder__head-dot');
      head.setAttribute('r', 7);
      head.setAttribute('fill', color);
      head.style.opacity = '0';
      this.gTrace.appendChild(head);

      lines.push({
        pts: pts, cum: cum, total: total || 1,
        tails: tails, glow: glow, head: head
      });
    }

    return lines;
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

  /** 경로 위 거리 dist 지점의 좌표 */
  function pointAt(line, dist) {
    if (dist <= 0) return { x: line.pts[0].x, y: line.pts[0].y };
    var last = line.pts[line.pts.length - 1];
    if (dist >= line.total) return { x: last.x, y: last.y };

    for (var i = 1; i < line.pts.length; i++) {
      if (line.cum[i] < dist) continue;
      var span = line.cum[i] - line.cum[i - 1];
      var f = span === 0 ? 0 : (dist - line.cum[i - 1]) / span;
      return {
        x: line.pts[i - 1].x + (line.pts[i].x - line.pts[i - 1].x) * f,
        y: line.pts[i - 1].y + (line.pts[i].y - line.pts[i - 1].y) * f
      };
    }
    return { x: last.x, y: last.y };
  }

  /** from~to 구간만 잘라낸 경로 문자열 */
  function subPath(line, from, to) {
    from = Math.max(0, from);
    to = Math.min(line.total, to);
    if (to <= from) return '';

    var start = pointAt(line, from);
    var d = 'M' + round(start.x) + ' ' + round(start.y);
    for (var i = 1; i < line.pts.length; i++) {
      if (line.cum[i] <= from) continue;
      if (line.cum[i] >= to) break;
      d += 'L' + round(line.pts[i].x) + ' ' + round(line.pts[i].y);
    }
    var end = pointAt(line, to);
    return d + 'L' + round(end.x) + ' ' + round(end.y);
  }

  /** 진행도(0~1) 시점의 모습 그리기 */
  LadderView.prototype._drawAt = function (progress) {
    var tail = this.tailLength;

    for (var n = 0; n < this._lines.length; n++) {
      var L = this._lines[n];
      var dist = L.total * progress;
      var here = pointAt(L, dist);

      for (var t = 0; t < TAIL_STEPS; t++) {
        var to = dist - (tail * t) / TAIL_STEPS;
        var from = dist - (tail * (t + 1)) / TAIL_STEPS;
        L.tails[t].setAttribute('d', subPath(L, from, to));
      }

      L.glow.setAttribute('cx', round(here.x));
      L.glow.setAttribute('cy', round(here.y));
      L.head.setAttribute('cx', round(here.x));
      L.head.setAttribute('cy', round(here.y));
      L.glow.style.opacity = '1';
      L.head.style.opacity = '1';
    }
  };

  /** 5개 선이 동시에 출발해 같은 시간에 도착하는 애니메이션 */
  LadderView.prototype.trace = function (duration, onDone) {
    var self = this;
    this.cancel();
    this._traceComplete = false;
    this.render();

    var startTime = null;
    function step(now) {
      if (startTime === null) startTime = now;
      var progress = Math.min(1, (now - startTime) / duration);

      // 출발과 도착을 살짝 부드럽게
      var eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      self._drawAt(eased);

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
    this._traceComplete = false;
    for (var i = 0; i < this._lines.length; i++) {
      var L = this._lines[i];
      for (var t = 0; t < L.tails.length; t++) L.tails[t].setAttribute('d', '');
      L.glow.style.opacity = '0';
      L.head.style.opacity = '0';
    }
  };

  global.Ladder = {
    LadderView: LadderView,
    walk: walk,
    buildGoodRungs: buildGoodRungs
  };
})(window);
