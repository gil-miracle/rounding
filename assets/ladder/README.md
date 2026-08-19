# 사다리 칸 이미지

사다리타기 화면에서 위쪽 다섯 칸의 **글자 위**에 붙는 이미지입니다.
기도제목 순서와 짝을 맞춰 넣어주세요.

```
assets/ladder/1.png   건강
assets/ladder/2.png   연애·결혼
assets/ladder/3.png   직장
assets/ladder/4.png   가족구원
assets/ladder/5.png   인간관계
```

- `js/config.js` 의 `ladder.headImages` 가 이 경로들을 가리킵니다.
- **잘리지 않고 전체가 들어갑니다.** 정사각형 칸 안에 맞춰 보여주므로,
  세로로 긴 사진은 좌우에 여백이 생깁니다.
- png / jpg / svg / webp 모두 됩니다.
- 파일이 없으면 그 칸의 이미지 자리만 조용히 사라지고 글자는 그대로 나옵니다.
