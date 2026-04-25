const token = localStorage.getItem('quiz_token');
if (!token) window.location.href = '/';

const container = document.getElementById('questionsContainer');
const formMsg = document.getElementById('formMsg');
const jsonImport = document.getElementById('jsonImport');

let questionCounter = 0;

function escapeAttr(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function questionTemplate(index, data = {}) {
  const options = data.options || {};
  const correctAnswer = data.correctAnswer || 'A';
  return `
    <div class="question-editor p-5 rounded-2xl bg-base-200 border border-white/10" data-question-index="${index}">
      <div class="flex items-center justify-between gap-3 mb-4">
        <h3 class="font-bold text-xl">Câu ${index}</h3>
        <button type="button" class="btn btn-error btn-sm" onclick="removeQuestion(this)">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
          Xóa
        </button>
      </div>

      <label class="form-control mb-4">
        <div class="label"><span class="label-text">Nội dung câu hỏi</span></div>
        <textarea class="textarea textarea-bordered question-content" placeholder="Nhập nội dung câu hỏi...">${escapeAttr(data.content || '')}</textarea>
      </label>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${['A', 'B', 'C', 'D'].map((key) => `
          <label class="form-control">
            <div class="label"><span class="label-text">Đáp án ${key}</span></div>
            <input class="input input-bordered option-${key}" placeholder="Nội dung đáp án ${key}" value="${escapeAttr(options[key] || '')}" />
          </label>
        `).join('')}
      </div>

      <label class="form-control mt-4 max-w-xs">
        <div class="label"><span class="label-text">Đáp án đúng</span></div>
        <select class="select select-bordered correct-answer">
          ${['A', 'B', 'C', 'D'].map((key) => `<option value="${key}" ${correctAnswer === key ? 'selected' : ''}>${key}</option>`).join('')}
        </select>
      </label>
    </div>
  `;
}

function addQuestion(data = {}) {
  questionCounter += 1;
  container.insertAdjacentHTML('beforeend', questionTemplate(questionCounter, data));
  lucide.createIcons();
}

function removeQuestion(button) {
  const editors = document.querySelectorAll('.question-editor');
  if (editors.length <= 1) {
    showMsg('Đề thi phải có ít nhất 1 câu hỏi.', true);
    return;
  }
  button.closest('.question-editor').remove();
  renumberQuestions();
}

function renumberQuestions() {
  document.querySelectorAll('.question-editor').forEach((card, index) => {
    card.dataset.questionIndex = String(index + 1);
    card.querySelector('h3').textContent = `Câu ${index + 1}`;
  });
  questionCounter = document.querySelectorAll('.question-editor').length;
}

function collectPayload() {
  const questions = [...document.querySelectorAll('.question-editor')].map((card, index) => ({
    id: `q_${Date.now()}_${index + 1}`,
    content: card.querySelector('.question-content').value.trim(),
    options: {
      A: card.querySelector('.option-A').value.trim(),
      B: card.querySelector('.option-B').value.trim(),
      C: card.querySelector('.option-C').value.trim(),
      D: card.querySelector('.option-D').value.trim()
    },
    correctAnswer: card.querySelector('.correct-answer').value
  }));

  return {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    durationMinutes: Number(document.getElementById('durationMinutes').value),
    questions
  };
}

function showMsg(text, isError = false) {
  formMsg.textContent = text;
  formMsg.className = `text-sm min-h-5 ${isError ? 'text-error' : 'text-success'}`;
}

async function saveExam() {
  const payload = collectPayload();
  showMsg('Đang lưu đề thi...');

  try {
    const res = await fetch('/api/exams', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể lưu đề thi.');

    showMsg(`Đã lưu đề thi: ${data.exam.title}. Đang chuyển về dashboard...`);
    setTimeout(() => window.location.href = '/admin', 800);
  } catch (err) {
    showMsg(err.message, true);
  }
}

function loadJsonIntoForm() {
  try {
    const data = JSON.parse(jsonImport.value);
    document.getElementById('title').value = data.title || '';
    document.getElementById('description').value = data.description || '';
    document.getElementById('durationMinutes').value = String(data.durationMinutes || 60);
    container.innerHTML = '';
    questionCounter = 0;
    (data.questions || []).forEach(addQuestion);
    if (!document.querySelector('.question-editor')) addQuestion();
    showMsg('Đã nạp JSON vào form. Hãy kiểm tra lại trước khi lưu.');
  } catch (err) {
    showMsg(`JSON không hợp lệ: ${err.message}`, true);
  }
}

jsonImport.value = JSON.stringify({
  title: 'Đề kiểm tra mẫu',
  description: 'Tạo nhanh bằng JSON',
  durationMinutes: 60,
  questions: [
    {
      content: 'Hàm gộp trong SQL là gì?',
      options: {
        A: 'Hàm nhận vào một tập giá trị và trả về một giá trị',
        B: 'Hàm nhận vào một giá trị và trả về một tập giá trị',
        C: 'Hàm chỉ dùng trong WHERE',
        D: 'Hàm chỉ dùng để nối bảng'
      },
      correctAnswer: 'A'
    }
  ]
}, null, 2);

document.getElementById('addQuestionBtn').addEventListener('click', () => addQuestion());
document.getElementById('saveExamBtn').addEventListener('click', saveExam);
document.getElementById('loadJsonBtn').addEventListener('click', loadJsonIntoForm);

addQuestion();
lucide.createIcons();
