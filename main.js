// ======= Config =======
const MIN = 1;
const MAX = 1_000_000;
const ROUND_MS = 10_000;
const TICK_MS = 50;

// ======= Language + High score (localStorage) =======
const LANGUAGE_KEY = "number_game_language_v1";
const HIGH_SCORE_PREFIX = "number_game_high_score_v1_"; // per-language key

const languageSelect = document.getElementById("languageSelect");

const LANG_TO_SPEECH = {
	en: "en-US",
	es: "es-ES",
	fr: "fr-FR",
	ru: "ru-RU",
	de: "de-DE",
};

function getSelectedLang() {
	return languageSelect?.value || "en";
}

function highScoreKeyFor(lang) {
	return `${HIGH_SCORE_PREFIX}${lang}`;
}

let highScore = 0;

function loadLanguage() {
	try {
		const saved = localStorage.getItem(LANGUAGE_KEY);
		if (saved && languageSelect) {
			const exists = [...languageSelect.options].some((o) => o.value === saved);
			if (exists) languageSelect.value = saved;
		}
	} catch {}
}

function saveLanguage(lang) {
	try {
		localStorage.setItem(LANGUAGE_KEY, String(lang));
	} catch {}
}

function loadHighScoreForLanguage(lang) {
	try {
		const raw = localStorage.getItem(highScoreKeyFor(lang));
		const n = parseInt(raw ?? "0", 10);
		highScore = Number.isFinite(n) && n > 0 ? n : 0;
	} catch {
		highScore = 0;
	}
}

function saveHighScoreForLanguage(lang, value) {
	try {
		localStorage.setItem(highScoreKeyFor(lang), String(value));
	} catch {}
}

function maybeUpdateHighScore() {
	const lang = getSelectedLang();
	if (streak > highScore) {
		highScore = streak;
		saveHighScoreForLanguage(lang, highScore);
	}
}

// ======= State =======
let currentNumber = null;
let streak = 0;
let roundActive = false;
let roundStart = 0;
let timerId = null;

// NEW: prevent double-start when auto-advancing after a correct answer
let nextRoundTimeoutId = null;
function clearPendingNextRound() {
	if (nextRoundTimeoutId) clearTimeout(nextRoundTimeoutId);
	nextRoundTimeoutId = null;
}
function scheduleNextRound(delayMs = 500) {
	clearPendingNextRound();
	nextRoundTimeoutId = setTimeout(() => {
		nextRoundTimeoutId = null;
		newRound();
	}, delayMs);
}

// ======= Elements =======
const streakEl = document.getElementById("streak");
const highScoreEl = document.getElementById("highScore");
const answerEl = document.getElementById("answer");
const messageEl = document.getElementById("message");
const badgeEl = document.getElementById("resultBadge");
const progressEl = document.getElementById("progress");

const startBtn = document.getElementById("startBtn");
const repeatBtn = document.getElementById("repeatBtn");
const resetBtn = document.getElementById("resetBtn");

// ======= Helpers =======
function randInt(min, max) {
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
	return (s || "").toString().replace(/[^\d]/g, "");
}

function updateUI() {
	streakEl.textContent = String(streak);
	highScoreEl.textContent = String(highScore);
	repeatBtn.disabled = currentNumber == null;
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

		const frac = remaining / ROUND_MS;
		progressEl.style.transform = `scaleX(${frac})`;

		if (remaining <= 0) {
			clearInterval(timerId);
			timerId = null;
			handleSubmit(true);
		}
	}, TICK_MS);
}

// ======= Speech =======
function speakNumber(n) {
	window.speechSynthesis.cancel();

	const utter = new SpeechSynthesisUtterance(String(n));
	const lang = getSelectedLang();
	utter.lang = LANG_TO_SPEECH[lang] || "en-US";
	utter.rate = 1.0;
	utter.pitch = 1.0;
	utter.volume = 1.0;

	const voices = window.speechSynthesis.getVoices?.() || [];
	const targetPrefix = (utter.lang || "").toLowerCase().split("-")[0];
	const matching = voices.filter((v) =>
		(v.lang || "").toLowerCase().startsWith(targetPrefix),
	);
	if (matching.length) utter.voice = matching[0];

	window.speechSynthesis.speak(utter);
}

if (
	typeof speechSynthesis !== "undefined" &&
	speechSynthesis.onvoiceschanged !== undefined
) {
	speechSynthesis.onvoiceschanged = () => {};
}

// ======= Game flow =======
function newRound() {
	clearBadge();
	answerEl.value = "";
	answerEl.focus();

	currentNumber = randInt(MIN, MAX);
	updateUI();

	setMessage("Listen for the number — time is running!");
	speakNumber(currentNumber);
	startTimer();
}

function resetGame(msg = "Press Start to play") {
	clearPendingNextRound();
	stopTimer();
	streak = 0;
	currentNumber = null;
	updateUI();
	clearBadge();
	answerEl.value = "";
	setMessage(msg);
}

function endRoundAndWait(msg) {
	clearPendingNextRound();
	stopTimer();
	currentNumber = null; // disables Repeat/New
	updateUI();
	setMessage(msg);
}

function handleSubmit(isTimeout = false) {
	if (!roundActive) return;

	stopTimer();

	const typed = normalizeDigits(answerEl.value);
	const correct = String(currentNumber);

	const ok = !isTimeout && typed.length > 0 && typed === correct;

	if (ok) {
		// ✅ CHANGE: auto-start next round when correct
		streak += 1;
		maybeUpdateHighScore();
		updateUI();

		setBadge("good", "Correct ✓");
		setMessage("Nice! Next number…");
		scheduleNextRound(500);
	} else {
		// ❌ Wrong/timeout: user must press Start
		streak = 0;
		updateUI();

		setBadge("bad", isTimeout ? "Time's up ✗" : "Incorrect ✗");
		endRoundAndWait(
			isTimeout
				? `Time's up. The correct answer was: ${correct}. Press Start to try again.`
				: `Incorrect. The correct answer was: ${correct}. Press Start to try again.`,
		);
	}
}

function repeatSpeech() {
	if (currentNumber == null) return;
	speakNumber(currentNumber);
	setMessage("Repeating the number — the clock is still ticking!");
}

// ======= Events =======
startBtn.addEventListener("click", () => {
	clearPendingNextRound(); // avoid double-start if a correct answer scheduled next round
	clearBadge();
	answerEl.value = "";
	setMessage("New round…");
	newRound();
});

repeatBtn.addEventListener("click", repeatSpeech);

resetBtn.addEventListener("click", () => {
	resetGame("Lost. Press Start to restart!");
});

if (languageSelect) {
	languageSelect.addEventListener("change", () => {
		const lang = getSelectedLang();
		saveLanguage(lang);
		loadHighScoreForLanguage(lang);
		updateUI();

		clearPendingNextRound();
		window.speechSynthesis.cancel();
		clearBadge();
		endRoundAndWait("Language changed. Press Start.");
	});
}

answerEl.addEventListener("input", () => {
	if (!roundActive || currentNumber == null) return;

	const typed = normalizeDigits(answerEl.value);
	const correct = String(currentNumber);

	if (typed === correct) {
		handleSubmit(false);
	}
});

document.addEventListener("keydown", (e) => {
	const inInput = document.activeElement === answerEl;

	if (!inInput && (e.key === "r" || e.key === "R")) {
		repeatSpeech();
	}
	if (!inInput && (e.key === "n" || e.key === "N")) {
		if (currentNumber != null) {
			clearPendingNextRound();
			newRound();
		}
	}
});

// ======= Initial UI =======
loadLanguage();
loadHighScoreForLanguage(getSelectedLang());
resetGame("Press Start");
