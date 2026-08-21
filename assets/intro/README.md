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

기기마다 화면 비율이 달라 `cover` 로 채우기 때문에 가장자리가 잘립니다.

| 기기 | 잘리는 곳 |
| --- | --- |
| iPad 10.9 / Air / Pro 11 | 위아래 약 2% |
| iPad Pro 12.9 | **좌우 각각 약 5~6%** |

**글자나 중요한 요소는 가장자리에서 8% 이상 안쪽으로** 넣어주세요.
특히 가로로 꽉 찬 제목은 12.9인치에서 양끝이 잘릴 수 있습니다.

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
