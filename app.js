const words = Array.from({ length: 10 }, (_, i) => ({
  answer: String(i),
  difficulty: "易"
}));

const canvas = document.getElementById("art");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const guessInput = document.getElementById("guess");
const answerLenEl = document.getElementById("answerLen");
const difficultyEl = document.getElementById("difficulty");
const roundEl = document.getElementById("round");
const scoreEl = document.getElementById("score");
const historyList = document.getElementById("historyList");

let current = null;
let round = 1;
let score = 0;
let revealed = false;

function pickWord() {
  const item = words[Math.floor(Math.random() * words.length)];
  current = item;
  revealed = false;
  answerLenEl.textContent = item.answer.length;
  difficultyEl.textContent = item.difficulty;
  statusEl.textContent = "准备作画。点击“AI作画”。";
  guessInput.value = "";
}

function setStatus(text) {
  statusEl.textContent = text;
}

function drawArt() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, w, h);

  // 柔和背景点阵
  ctx.fillStyle = "rgba(31, 29, 26, 0.06)";
  for (let i = 0; i < 160; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2.4 + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 轻微手写风格的数字
  const fontSize = 220 + Math.floor(Math.random() * 50);
  ctx.font = `700 ${fontSize}px "IBM Plex Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.save();
  const tilt = (Math.random() * 8 - 4) * (Math.PI / 180);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(tilt);

  // 描边+填充增强可读性
  ctx.lineWidth = 16;
  ctx.strokeStyle = "#f2b705";
  ctx.fillStyle = "#1f1d1a";
  ctx.strokeText(current.answer, 0, 0);
  ctx.fillText(current.answer, 0, 0);
  ctx.restore();

  // 少量涂鸦线条，增加趣味但不遮挡数字
  ctx.strokeStyle = "rgba(217, 111, 79, 0.25)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(60, h - 70);
  ctx.quadraticCurveTo(w / 2, h - 120, w - 60, h - 70);
  ctx.stroke();

  setStatus("数字已生成。请输入你猜的数字。");
}

function submitGuess() {
  if (!current) return;
  const guess = guessInput.value.trim();
  if (!guess) {
    setStatus("请输入你的猜测。");
    return;
  }
  if (revealed) {
    setStatus("已经揭晓答案，点击“下一题”继续。");
    return;
  }
  const correct = guess === current.answer;
  if (correct) {
    score += current.difficulty === "难" ? 3 : current.difficulty === "中" ? 2 : 1;
    scoreEl.textContent = score;
    setStatus(`回答正确！答案是“${current.answer}”。`);
    addHistory(guess, true);
    revealed = true;
  } else {
    setStatus("不对，再试一次或点击“揭晓答案”。");
  }
}

function revealAnswer() {
  if (!current) return;
  if (!revealed) {
    setStatus(`答案是“${current.answer}”。`);
    addHistory("未猜中", false);
    revealed = true;
  } else {
    setStatus("答案已揭晓，点击“下一题”继续。");
  }
}

function addHistory(result, success) {
  const card = document.createElement("div");
  card.className = "history-card";
  card.innerHTML = `
    <strong>${current.answer}</strong>
    <div>难度：${current.difficulty}</div>
    <div>结果：${result}</div>
  `;
  if (success) {
    card.style.borderColor = "rgba(43, 122, 111, 0.5)";
  } else {
    card.style.borderColor = "rgba(217, 111, 79, 0.5)";
  }
  historyList.prepend(card);
}

function nextRound() {
  round += 1;
  roundEl.textContent = round;
  pickWord();
  drawArt();
}

pickWord();

// Events

document.getElementById("drawBtn").addEventListener("click", drawArt);
document.getElementById("guessBtn").addEventListener("click", submitGuess);
document.getElementById("revealBtn").addEventListener("click", revealAnswer);
document.getElementById("nextBtn").addEventListener("click", nextRound);

guessInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitGuess();
});
