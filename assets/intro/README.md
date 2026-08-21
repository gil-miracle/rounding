# 첫 화면 배경

```
assets/intro/background.jpg
```

`js/config.js` 의 `intro.background` 에 이 경로를 적으면 첫 화면 배경으로 깔립니다.
(비워두면 기본 코랄→크림 그라데이션이 나옵니다)

## 크기

**1640 × 2460 px (2:3)** — 아이패드 세로 @2x 기준입니다.
JPG, 품질 85 정도로 저장하면 400~600KB 안에 들어옵니다.

## 잘림에 주의할 곳

`cover` 로 화면을 꽉 채우되 **위쪽을 기준**으로 맞춥니다.
제목이 있는 윗부분은 항상 그대로 보이고, **남는 만큼 아래쪽이 잘립니다.**

- 아래쪽(풍경·시냇물 등)은 잘려도 되는 내용으로 채워주세요.
- 좌우는 화면이 아주 길쭉한 기기에서 조금 잘릴 수 있으니,
  **제목은 좌우 끝에서 8% 정도 안쪽**에 두면 안전합니다.

## 배경에 글자가 들어 있다면

`config.js` 에서 화면 글자를 꺼주세요.

```js
intro: {
  background: 'assets/intro/background.jpg',
  showEyebrow: false,   // 2026 GIL COMMUNITY CONFERENCE
  showTitle: false,     // MIRACLE
  showSubtitle: true,   // 퀴즈 풀고 선물 받아가세요!
  ...
}
```
