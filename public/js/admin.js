const token = localStorage.getItem('quiz_token');
const socket = io();

const els = {
  examCount: document.getElementById('examCount'),
  submissionCount: document.getElementById('submissionCount'),
  averageScore: document.getElementById('averageScore'),
  examList: document.getElementById('examList'),
  submissionsBody: document.getElementById('submissionsBody'),
  refreshBtn: document.getElementById('refreshBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  realtimeAlert: document.getElementById('realtimeAlert'),
  realtimeAlertText: document.getElementById('realtimeAlertText'),
  submissionSearch: document.getElementById('submissionSearch'),
  detailModal: document.getElementById('detailModal'),
  submissionDetail: document.getElementById('submissionDetail')
};

let submissionsCache = [];
let examsCache = [];

if (!token) window.location.href = '/';

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return 'Không rõ';
  const total = Number(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}p ${String(sec).padStart(2, '0')}s`;
}

function showRealtimeAlert(text) {
  els.realtimeAlertText.textContent = text;
  els.realtimeAlert.classList.remove('hidden');
  lucide.createIcons();
  setTimeout(() => els.realtimeAlert.classList.add('hidden'), 3500);
}

async function apiGet(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 403) {
    logout();
    throw new Error('Phiên đăng nhập hết hạn.');
  }
  if (!res.ok) throw new Error('Không tải được dữ liệu.');
  return res.json();
}

function renderOverview(overview) {
  els.examCount.textContent = overview.examCount;
  els.submissionCount.textContent = overview.submissionCount;
  els.averageScore.textContent = `${overview.averageScorePercent}%`;
}

function renderExams(exams) {
  examsCache = exams;
  if (!exams.length) {
    els.examList.innerHTML = '<div class="alert">Chưa có đề thi nào. Hãy tạo đề đầu tiên.</div>';
    return;
  }

  els.examList.innerHTML = exams.map((exam) => {
    const publicLink = exam.publicUrl || `${window.location.origin}/thi/${encodeURIComponent(exam.id)}`;
    return `
      <div class="p-4 rounded-2xl bg-base-200 border border-white/10 space-y-3" data-exam-id="${escapeHtml(exam.id)}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="font-bold text-lg">${escapeHtml(exam.title)}</h3>
            <p class="text-sm text-base-content/60">${exam.questionCount} câu · ${exam.durationMinutes} phút</p>
          </div>
          <button class="btn btn-error btn-xs" onclick="deleteExam('${escapeHtml(exam.id)}')">Xóa</button>
        </div>
        <div class="join w-full">
          <input class="input input-bordered input-sm join-item w-full" value="${publicLink}" readonly />
          <button class="btn btn-sm join-item" onclick="copyText('${publicLink}')">Copy</button>
          <a class="btn btn-sm btn-primary join-item" href="/thi/${encodeURIComponent(exam.id)}" target="_blank">Mở</a>
        </div>
      </div>
    `;
  }).join('');
}

function renderSubmissions(submissions) {
  const keyword = els.submissionSearch.value.trim().toLowerCase();
  const filtered = keyword
    ? submissions.filter((item) => [item.studentName, item.studentCode, item.examTitle]
        .some((value) => String(value || '').toLowerCase().includes(keyword)))
    : submissions;

  if (!filtered.length) {
    els.submissionsBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-base-content/60">Chưa có bài nộp phù hợp.</td>
      </tr>
    `;
    return;
  }

  els.submissionsBody.innerHTML = filtered.map((item) => {
    const percent = item.total ? Math.round((item.correctCount / item.total) * 100) : 0;
    return `
      <tr>
        <td>
          <div class="font-semibold">${escapeHtml(item.submittedAtVN || '')}</div>
          <div class="text-xs opacity-50">Server time</div>
        </td>
        <td>
          <div class="font-semibold">${escapeHtml(item.studentName)}</div>
          <div class="text-xs opacity-50">${escapeHtml(item.studentCode || 'Không có mã')}</div>
        </td>
        <td>${escapeHtml(item.examTitle)}</td>
        <td>
          <div class="font-bold ${percent >= 50 ? 'text-success' : 'text-error'}">${item.correctCount}/${item.total} đúng</div>
          <div class="text-xs opacity-60">Sai: ${item.wrongCount} · Bỏ trống: ${item.unansweredCount}</div>
        </td>
        <td>${formatDuration(item.durationUsedSeconds)}</td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="openSubmissionDetail('${escapeHtml(item.id)}')">Xem</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadDashboard() {
  const [overview, exams, submissions] = await Promise.all([
    apiGet('/api/admin/overview'),
    apiGet('/api/exams'),
    apiGet('/api/submissions')
  ]);

  submissionsCache = submissions;
  renderOverview(overview);
  renderExams(exams);
  renderSubmissions(submissionsCache);
  lucide.createIcons();
}

async function openSubmissionDetail(id) {
  try {
    const detail = await apiGet(`/api/submissions/${encodeURIComponent(id)}`);
    const percent = detail.total ? Math.round((detail.correctCount / detail.total) * 100) : 0;
    els.submissionDetail.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="stat bg-base-200 rounded-xl"><div class="stat-title">Người làm</div><div class="stat-value text-lg">${escapeHtml(detail.studentName)}</div></div>
        <div class="stat bg-base-200 rounded-xl"><div class="stat-title">Đề thi</div><div class="stat-value text-lg">${escapeHtml(detail.examTitle)}</div></div>
        <div class="stat bg-base-200 rounded-xl"><div class="stat-title">Kết quả</div><div class="stat-value text-lg">${detail.correctCount}/${detail.total}</div></div>
        <div class="stat bg-base-200 rounded-xl"><div class="stat-title">Tỷ lệ đúng</div><div class="stat-value text-lg">${percent}%</div></div>
      </div>
      <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
        ${detail.details.map((q) => renderDetailQuestion(q)).join('')}
      </div>
    `;
    els.detailModal.showModal();
  } catch (err) {
    alert(err.message);
  }
}

function renderDetailQuestion(q) {
  const rows = ['A', 'B', 'C', 'D'].map((key) => {
    const isCorrect = key === q.correctAnswer;
    const isUser = key === q.userAnswer;
    const className = isCorrect ? 'border-success bg-success/10' : (isUser ? 'border-error bg-error/10' : 'border-white/10');
    const badges = `${isCorrect ? '<span class="badge badge-success badge-sm">Đáp án đúng</span>' : ''} ${isUser ? '<span class="badge badge-outline badge-sm">Đã chọn</span>' : ''}`;
    return `<div class="p-3 rounded-xl border ${className}"><b>${key}.</b> ${escapeHtml(q.options[key])} ${badges}</div>`;
  }).join('');

  return `
    <div class="p-4 rounded-2xl bg-base-200 border ${q.isCorrect ? 'border-success/40' : 'border-error/40'}">
      <div class="flex items-start justify-between gap-3 mb-3">
        <h4 class="font-bold">Câu ${q.order}: ${escapeHtml(q.content)}</h4>
        <span class="badge ${q.isCorrect ? 'badge-success' : 'badge-error'}">${q.isCorrect ? 'Đúng' : 'Sai'}</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">${rows}</div>
    </div>
  `;
}

async function deleteExam(id) {
  if (!confirm('Xóa đề thi này? Các bài nộp cũ vẫn được giữ lại.')) return;
  const res = await fetch(`/api/exams/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.message || 'Không xóa được đề thi.');
  await loadDashboard();
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  showRealtimeAlert('Đã copy link đề thi.');
}

function logout() {
  localStorage.removeItem('quiz_token');
  window.location.href = '/';
}

socket.on('new_submission', (data) => {
  submissionsCache = [data, ...submissionsCache];
  renderSubmissions(submissionsCache);
  els.submissionCount.textContent = String(Number(els.submissionCount.textContent || 0) + 1);
  showRealtimeAlert(`${data.studentName} vừa nộp bài ${data.examTitle}.`);
});

socket.on('exam_created', (data) => {
  showRealtimeAlert(`Đề mới vừa được tạo: ${data.title}.`);
  loadDashboard();
});

socket.on('exam_deleted', () => loadDashboard());

els.refreshBtn.addEventListener('click', loadDashboard);
els.logoutBtn.addEventListener('click', logout);
els.submissionSearch.addEventListener('input', () => renderSubmissions(submissionsCache));

loadDashboard().catch((err) => {
  console.error(err);
  alert(err.message);
});
