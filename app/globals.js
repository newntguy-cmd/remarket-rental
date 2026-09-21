* {
  box-sizing: border-box;
}
html,
body {
  margin: 0;
  padding: 0;
  background: #faf9f5;
  /* 화면 폭보다 넓은 요소가 하나라도 있으면 페이지 전체가 옆으로 밀리는 걸 막는다. 표는 각자 안에서
     따로 옆으로 스크롤되도록 이미 만들어져 있어서(overflow:auto 감싸는 칸), 이 설정 때문에 표를
     못 보는 일은 없다. */
  overflow-x: hidden;
  max-width: 100%;
}
button {
  font-family: inherit;
}
