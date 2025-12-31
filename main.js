// ======= Config =======
const MIN = 1;
const MAX = 1_000_000;
const ROUND_MS = 10_000;
const TICK_MS = 50;

// ======= State =======
let currentNumber = null;
let streak = 0;
let roundActive = false;
let roundStart = 0;
let timerId = null;

// ======= Elements =======
const streakEl = document.getElementById("streak");
const highScoreEl = document.getElementById("highScore");
const answerEl = document.getElementById("answer");
const messageEl = document.getElementById("message");
const badgeEl = document.getElementById("resultBadge");
const progressEl = document.getElementById("progress");

const startBtn = document.getElementById("startBtn");
const repeatBtn = document.getElementById("repeatBtn");
const newBtn = document.getElementById("newBtn");
const resetBtn = document.getElementById("resetBtn");

// ======= Helpers =======
function randInt(min, max) {
	// inclusive
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function setBadge(kind, text) {
	badgeEl.style.display = "inline-block";
	badgeEl.classList.remove("good", "bad");
	if (kind) badgeEl.classList.add(kind);
	badgeEl.textContent = text;
}

function clearBadge() {
	badgeEl.style.display = "none";
	badgeEl.textContent = "";
	badgeEl.classList.remove("good", "bad");
}

function setMessage(text) {
	messageEl.textContent = text;
}

function normalizeDigits(s) {
	// keep digits only
	return (s || "").toString().replace(/[^\d]/g, "");
}

function updateUI() {
	streakEl.textContent = String(streak);
	repeatBtn.disabled = currentNumber == null;
	newBtn.disabled = currentNumber == null;
}

function stopTimer() {
	if (timerId) clearInterval(timerId);
	timerId = null;
	roundActive = false;
	progressEl.style.transform = "scaleX(0)";
}

function startTimer() {
	roundStart = performance.now();
	roundActive = true;

	if (timerId) clearInterval(timerId);
	timerId = setInterval(() => {
		const now = performance.now();
		const elapsed = now - roundStart;
		const remaining = Math.max(0, ROUND_MS - elapsed);

		const frac = remaining / ROUND_MS; // 1 -> 0
		progressEl.style.transform = `scaleX(${frac})`;

		if (remaining <= 0) {
			// time out => treat as wrong
			clearInterval(timerId);
			timerId = null;
			handleSubmit(true); // timed out
		}
	}, TICK_MS);
}

// ======= Speech =======
function speakNumberRu(n) {
	// Cancel any ongoing speech
	window.speechSynthesis.cancel();

	const utter = new SpeechSynthesisUtterance(String(n));
	utter.lang = "ru-RU";
	utter.rate = 1.0;
	utter.pitch = 1.0;
	utter.volume = 1.0;

	// Try to pick a Russian voice if available
	const voices = window.speechSynthesis.getVoices?.() || [];
	const ruVoices = voices.filter((v) =>
		(v.lang || "").toLowerCase().startsWith("ru"),
	);
	if (ruVoices.length) utter.voice = ruVoices[0];

	window.speechSynthesis.speak(utter);
}

// Some browsers load voices async
if (
	typeof speechSynthesis !== "undefined" &&
	speechSynthesis.onvoiceschanged !== undefined
) {
	speechSynthesis.onvoiceschanged = () => {
		// no-op, but ensures voices are loaded sooner in some browsers
	};
}

// ======= Game flow =======
function newRound() {
	clearBadge();
	answerEl.value = "";
	answerEl.focus();

	currentNumber = randInt(MIN, MAX);
	updateUI();

	setMessage("Listen for the number, time is running!");
	speakNumberRu(currentNumber);
	startTimer();
}

function resetGame(msg = "Press start to restart") {
	stopTimer();
	streak = 0;
	currentNumber = null;
	updateUI();
	clearBadge();
	answerEl.value = "";
	setMessage(msg);
	startBtn.textContent = "Start";
}

function handleSubmit(isTimeout = false) {
	if (!roundActive) return;

	stopTimer();

	const typed = normalizeDigits(answerEl.value);
	const correct = String(currentNumber);

	const ok = !isTimeout && typed.length > 0 && typed === correct;

	if (ok) {
		streak += 1;
		updateUI();
		setBadge("good", "Correct ✓");
		setMessage("Good! Next number.");
		// small delay to let user see result
		setTimeout(() => newRound(), 500);
	} else {
		streak = 0;
		updateUI();
		setBadge("bad", isTimeout ? "Timeout ✗" : "Incorrect ✗");
		setMessage(
			isTimeout
				? `Время вышло. Правильный ответ был: ${correct}. Начинаем заново…`
				: `Неверно. Правильный ответ был: ${correct}. Начинаем заново…`,
		);
		// Start over with a fresh number after a short pause
		setTimeout(() => newRound(), 900);
	}
}

function repeatSpeech() {
	if (currentNumber == null) return;
	speakNumberRu(currentNumber);
	setMessage("Repeating the number, the clock is still ticking!");
}

// ======= Events =======
startBtn.addEventListener("click", () => {
	// If already running, just restart the round
	if (roundActive || currentNumber != null) {
		setMessage("New round…");
	}
	startBtn.textContent = "Reset";
	newRound();
});

repeatBtn.addEventListener("click", repeatSpeech);

newBtn.addEventListener("click", () => {
	if (currentNumber == null) return;
	setMessage("Новое число…");
	newRound();
});

resetBtn.addEventListener("click", () => resetGame("Lost. Press restart!"));

answerEl.addEventListener("input", () => {
	if (!roundActive || currentNumber == null) return;

	const typed = normalizeDigits(answerEl.value);
	const correct = String(currentNumber);

	if (typed === correct) {
		handleSubmit(false);
	}
});

document.addEventListener("keydown", (e) => {
	// avoid hijacking typing in the input except for Enter (handled above)
	const inInput = document.activeElement === answerEl;

	if (!inInput && (e.key === "r" || e.key === "R")) {
		repeatSpeech();
	}
	if (!inInput && (e.key === "n" || e.key === "N")) {
		if (currentNumber != null) newRound();
	}
});

// Initial UI
resetGame("Press Start");
