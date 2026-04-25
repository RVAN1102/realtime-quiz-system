const params = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split('/').filter(Boolean);
const examIdFromPath = ['thi', 'lam-bai'].includes(pathParts[0]) ? decodeURIComponent(pathParts[1] || '') : '';
const examId = params.get('id') || examIdFromPath;

const els = {
  examTitle: document.getElementById('examTitle'),
  examTitleCrumb: document.getElementById('examTitleCrumb'),
  examDescription: document.getElementById('examDescription'),
  questionsRoot: document.getElementById('questionsRoot'),
  studentName: document.getElementById('studentName'),
  studentCode: document.getElementById('studentCode'),
  timer: document.getElementById('timer'),
  timeProgress: document.getElementById('timeProgress'),
  answeredCount: document.getElementById('answeredCount'),
  totalCount: document.getElementById('totalCount'),
  progressText: document.getElementById('progressText'),
  answerProgress: document.getElementById('answerProgress'),
  questionNavigator: document.getElementById('questionNavigator'),
  submitBtn: document.getElementById('submitBtn'),
  submitMsg: document.getElementById('submitMsg'),
  resultBox: document.getElementById('resultBox'),
  resultSummary: document.getElementById('resultSummary')
};

let exam = null;
let timerHandle = null;
let submitted = false;
let startedAt = null;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function getStorageKey(suffix) {
  return `quiz_${examId}_${suffix}`;
}

function getAnswers() {
  const answers = {};
  document.querySelectorAll('input[type="radio"]:checked').forEach((input) => {
    answers[input.name.replace('question_', '')] = input.value;
  });
  return answers;
}

function saveAnswersToLocal() {
  localStorage.setItem(getStorageKey('answers'), JSON.stringify(getAnswers()));
}

function restoreAnswersFromLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(getStorageKey('answers')) || '{}');
    Object.entries(saved).forEach(([questionId, answer]) => {
      const input = document.querySelector(`input[name="question_${CSS.escape(questionId)}"][value="${answer}"]`);
      if (input) input.checked = true;
    });
  } catch (_) {
    // Ignore corrupted localStorage.
  }
}

function renderQuestion(question) {
  return `
    <article id="question-${escapeHtml(question.id)}" class="question-card card bg-base-100 shadow-xl border border-base-300" data-question-id="${escapeHtml(question.id)}">
      <div class="card-body">
        <h2 class="card-title items-start gap-3">
          <span class="badge badge-primary badge-lg">${question.order}</span>
          <span>${escapeHtml(question.content)}</span>
        </h2>
        <div class="grid grid-cols-1 gap-3 mt-3">
          ${['A', 'B', 'C', 'D'].map((key) => `
            <label class="answer-option flex items-start gap-3 p-4 rounded-2xl border border-base-300 bg-base-200 cursor-pointer" data-question-id="${escapeHtml(question.id)}" data-option="${key}">
              <input type="radio" class="radio radio-primary mt-1" name="question_${escapeHtml(question.id)}" value="${key}" />
              <span><b>${key}.</b> ${escapeHtml(question.options[key])}</span>
            </label>
          `).join('')}
        </div>
      </div>
    </article>
  `;
}

function renderNavigator() {
  els.questionNavigator.innerHTML = exam.questions.map((question) => `
    <a href="#question-${escapeHtml(question.id)}" class="btn btn-sm btn-outline nav-question" data-question-id="${escapeHtml(question.id)}">${question.order}</a>
  `).join('');
}

function updateProgress() {
  const answers = getAnswers();
  const answered = Object.keys(answers).length;
  const total = exam.questions.length;
  const percent = total ? Math.round((answered / total) * 100) : 0;

  els.answeredCount.textContent = answered;
  els.totalCount.textContent = total;
  els.progressText.textContent = `${percent}%`;
  els.answerProgress.value = percent;

  document.querySelectorAll('.nav-question').forEach((btn) => {
    const done = Boolean(answers[btn.dataset.questionId]);
    btn.classList.toggle('btn-success', done);
    btn.classList.toggle('btn-outline', !done);
  });
}

function initStartTime() {
  const savedStartedAt = localStorage.getItem(getStorageKey('startedAt'));
  if (savedStartedAt) {
    startedAt = savedStartedAt;
    return;
  }
  startedAt = new Date().toISOString();
  localStorage.setItem(getStorageKey('startedAt'), startedAt);
}

function startTimer() {
  initStartTime();
  const totalSeconds = exam.durationMinutes * 60;

  function tick() {
    const startedMs = new Date(startedAt).getTime();
    const elapsed = Math.floor((Date.now() - startedMs) / 1000);
    const remaining = Math.max(0, totalSeconds - elapsed);
    const percent = totalSeconds ? Math.round((remaining / totalSeconds) * 100) : 0;

    els.timer.textContent = formatClock(remaining);
    els.timeProgress.value = percent;

    els.timer.classList.toggle('text-error', remaining <= 300);
    els.timeProgress.classList.toggle('progress-error', remaining <= 300);

    if (remaining <= 0 && !submitted) {
      clearInterval(timerHandle);
      submitExam(true);
    }
  }

  tick();
  timerHandle = setInterval(tick, 1000);
}

function setSubmitMessage(text, isError = false) {
  els.submitMsg.textContent = text;
  els.submitMsg.className = `text-sm min-h-5 ${isError ? 'text-error' : 'text-success'}`;
}

function lockExamUI() {
  document.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.disabled = true;
  });
  els.submitBtn.disabled = true;
}

function applyResult(result) {
  result.details.forEach((detail) => {
    const card = document.querySelector(`[data-question-id="${CSS.escape(detail.questionId)}"].question-card`);
    if (card) {
      card.classList.remove('border-base-300');
      card.classList.add(detail.isCorrect ? 'border-success' : 'border-error');
    }

    document.querySelectorAll(`.answer-option[data-question-id="${CSS.escape(detail.questionId)}"]`).forEach((option) => {
      const optionKey = option.dataset.option;
      if (optionKey === detail.correctAnswer) option.classList.add('option-correct');
      if (optionKey === detail.userAnswer && !detail.isCorrect) option.classList.add('option-wrong');
      if (optionKey === detail.userAnswer) option.classList.add('option-user-selected');
    });
  });

  const percent = result.total ? Math.round((result.correctCount / result.total) * 100) : 0;
  els.resultSummary.innerHTML = `
    <div class="text-5xl font-black ${percent >= 50 ? 'text-success' : 'text-error'}">${result.correctCount}/${result.total}</div>
    <div>Đúng: <b>${result.correctCount}</b> · Sai: <b>${result.wrongCount}</b> · Bỏ trống: <b>${result.unansweredCount}</b></div>
    <div>Thời gian nộp: <b>${escapeHtml(result.submittedAtVN)}</b></div>
    <div>Thời gian làm: <b>${formatClock(result.durationUsedSeconds || 0)}</b></div>
  `;
  els.resultBox.classList.remove('hidden');
  lucide.createIcons();
}

async function submitExam(auto = false) {
  if (submitted) return;

  const studentName = els.studentName.value.trim();
  if (!studentName) {
    setSubmitMessage('Vui lòng nhập họ tên trước khi nộp bài.', true);
    els.studentName.focus();
    return;
  }

  if (!auto) {
    const total = exam.questions.length;
    const answered = Object.keys(getAnswers()).length;
    const ok = confirm(`Bạn đã làm ${answered}/${total} câu. Xác nhận nộp bài?`);
    if (!ok) return;
  }

  submitted = true;
  els.submitBtn.classList.add('btn-disabled');
  setSubmitMessage(auto ? 'Hết giờ. Hệ thống đang tự động nộp bài...' : 'Đang nộp bài...');

  try {
    const res = await fetch(`/api/exams/${encodeURIComponent(examId)}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName,
        studentCode: els.studentCode.value.trim(),
        answers: getAnswers(),
        startedAt
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không nộp được bài.');

    clearInterval(timerHandle);
    lockExamUI();
    localStorage.removeItem(getStorageKey('answers'));
    localStorage.removeItem(getStorageKey('startedAt'));
    applyResult(data.result);
    setSubmitMessage('Đã nộp bài. Kết quả đã gửi realtime về trang quản trị.');
  } catch (err) {
    submitted = false;
    els.submitBtn.classList.remove('btn-disabled');
    setSubmitMessage(err.message, true);
  }
}

async function loadExam() {
  if (!examId) {
    els.questionsRoot.innerHTML = '<div class="alert alert-error">Thiếu mã đề thi trên URL. Ví dụ: /thi/exam_demo_csdl</div>';
    return;
  }

  const res = await fetch(`/api/exams/${encodeURIComponent(examId)}/public`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    els.questionsRoot.innerHTML = `<div class="alert alert-error">${escapeHtml(data.message || 'Không tải được đề thi.')}</div>`;
    return;
  }

  exam = data;
  document.title = `Làm bài - ${exam.title}`;
  els.examTitle.textContent = exam.title;
  els.examTitleCrumb.textContent = exam.title;
  els.examDescription.textContent = exam.description || `Thời gian làm bài: ${exam.durationMinutes} phút`;
  els.questionsRoot.innerHTML = exam.questions.map(renderQuestion).join('');
  renderNavigator();
  restoreAnswersFromLocal();
  updateProgress();
  startTimer();

  document.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener('change', () => {
      saveAnswersToLocal();
      updateProgress();
    });
  });

  lucide.createIcons();
}

els.submitBtn.addEventListener('click', () => submitExam(false));

loadExam().catch((err) => {
  console.error(err);
  els.questionsRoot.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
});
