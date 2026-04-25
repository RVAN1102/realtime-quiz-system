const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database');

const SECRET_KEY = process.env.JWT_SECRET || 'QuizSystem_SieuBaoMat_2026';
const ADMIN_PASS = process.env.ADMIN_PASS || '123456';
const PORT = process.env.PORT || 3000;

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const origins = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return origins.length ? origins : true;
}

const corsOptions = {
  origin: parseAllowedOrigins(),
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true
};

const io = new Server(server, { cors: corsOptions });

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

db.initDB();

function verifyToken(req, res, next) {
  const bearerHeader = req.headers.authorization;
  if (!bearerHeader || !bearerHeader.startsWith('Bearer ')) {
    return res.status(403).json({ message: 'Thiếu token quản trị.' });
  }

  const token = bearerHeader.split(' ')[1];
  jwt.verify(token, SECRET_KEY, (err, authData) => {
    if (err) return res.status(403).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    req.authData = authData;
    next();
  });
}

function toPublicExam(exam) {
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description || '',
    durationMinutes: exam.durationMinutes,
    createdAt: exam.createdAt,
    questions: exam.questions.map((q, index) => ({
      id: q.id,
      order: index + 1,
      content: q.content,
      options: q.options
    }))
  };
}

function formatDateTimeVN(date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function normalizeAnswer(value) {
  if (!value) return '';
  return String(value).trim().toUpperCase();
}

function getPublicBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function getExamPublicUrl(req, examId) {
  return `${getPublicBaseUrl(req)}/thi/${encodeURIComponent(examId)}`;
}

function calculateDurationSeconds(startedAt, submittedAt) {
  if (!startedAt) return null;
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return null;
  const seconds = Math.max(0, Math.round((submittedAt.getTime() - started.getTime()) / 1000));
  return seconds;
}

function isValidExamPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Dữ liệu đề thi không hợp lệ.';
  if (!payload.title || String(payload.title).trim().length < 3) return 'Tên đề thi phải có ít nhất 3 ký tự.';
  if (![45, 60, 120].includes(Number(payload.durationMinutes))) return 'Thời gian làm bài chỉ hỗ trợ 45, 60 hoặc 120 phút.';
  if (!Array.isArray(payload.questions) || payload.questions.length === 0) return 'Đề thi phải có ít nhất 1 câu hỏi.';

  for (let i = 0; i < payload.questions.length; i += 1) {
    const q = payload.questions[i];
    if (!q.content || String(q.content).trim().length < 3) return `Câu ${i + 1} chưa có nội dung hợp lệ.`;
    if (!q.options || typeof q.options !== 'object') return `Câu ${i + 1} chưa có danh sách đáp án.`;
    for (const key of ['A', 'B', 'C', 'D']) {
      if (!q.options[key] || String(q.options[key]).trim().length === 0) return `Câu ${i + 1} thiếu đáp án ${key}.`;
    }
    if (!['A', 'B', 'C', 'D'].includes(normalizeAnswer(q.correctAnswer))) return `Câu ${i + 1} chưa chọn đáp án đúng A/B/C/D.`;
  }
  return null;
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASS) {
    const token = jwt.sign({ user: 'admin', role: 'admin' }, SECRET_KEY, { expiresIn: '365d' });
    return res.json({ token });
  }
  return res.status(401).json({ message: 'Sai mật khẩu quản trị.' });
});

app.get('/api/admin/overview', verifyToken, (req, res) => {
  const exams = db.getAllExams();
  const submissions = db.getAllSubmissions();
  const correctSum = submissions.reduce((sum, item) => sum + Number(item.correctCount || 0), 0);
  const questionSum = submissions.reduce((sum, item) => sum + Number(item.total || 0), 0);

  res.json({
    examCount: exams.length,
    submissionCount: submissions.length,
    averageScorePercent: questionSum ? Math.round((correctSum / questionSum) * 100) : 0,
    latestSubmissions: submissions.slice(-10).reverse()
  });
});

app.get('/api/exams', verifyToken, (req, res) => {
  const exams = db.getAllExams().map((exam) => ({
    id: exam.id,
    title: exam.title,
    description: exam.description || '',
    durationMinutes: exam.durationMinutes,
    questionCount: exam.questions.length,
    createdAt: exam.createdAt,
    publicUrl: getExamPublicUrl(req, exam.id)
  }));
  res.json(exams.reverse());
});

app.post('/api/exams', verifyToken, (req, res) => {
  const error = isValidExamPayload(req.body);
  if (error) return res.status(400).json({ message: error });

  const savedExam = db.insertExam({
    title: String(req.body.title).trim(),
    description: String(req.body.description || '').trim(),
    durationMinutes: Number(req.body.durationMinutes),
    questions: req.body.questions.map((q, index) => ({
      id: q.id || `q_${Date.now()}_${index + 1}`,
      content: String(q.content).trim(),
      options: {
        A: String(q.options.A).trim(),
        B: String(q.options.B).trim(),
        C: String(q.options.C).trim(),
        D: String(q.options.D).trim()
      },
      correctAnswer: normalizeAnswer(q.correctAnswer)
    }))
  });

  io.emit('exam_created', {
    id: savedExam.id,
    title: savedExam.title,
    durationMinutes: savedExam.durationMinutes,
    questionCount: savedExam.questions.length,
    createdAt: savedExam.createdAt,
    publicUrl: getExamPublicUrl(req, savedExam.id)
  });

  res.status(201).json({
    message: 'Đã tạo đề thi.',
    exam: {
      id: savedExam.id,
      title: savedExam.title,
      durationMinutes: savedExam.durationMinutes,
      questionCount: savedExam.questions.length,
      createdAt: savedExam.createdAt,
      publicUrl: getExamPublicUrl(req, savedExam.id)
    }
  });
});

app.get('/api/exams/:examId/public', (req, res) => {
  const exam = db.getExamById(req.params.examId);
  if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề thi.' });
  res.json(toPublicExam(exam));
});

app.get('/api/exams/:examId', verifyToken, (req, res) => {
  const exam = db.getExamById(req.params.examId);
  if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề thi.' });
  res.json(exam);
});

app.delete('/api/exams/:examId', verifyToken, (req, res) => {
  const removed = db.deleteExam(req.params.examId);
  if (!removed) return res.status(404).json({ message: 'Không tìm thấy đề thi để xóa.' });
  io.emit('exam_deleted', { id: req.params.examId });
  res.json({ message: 'Đã xóa đề thi.' });
});

app.post('/api/exams/:examId/submit', (req, res) => {
  const exam = db.getExamById(req.params.examId);
  if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề thi.' });

  const studentName = String(req.body.studentName || '').trim();
  if (studentName.length < 2) {
    return res.status(400).json({ message: 'Vui lòng nhập tên người làm bài.' });
  }

  const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  const submittedAt = new Date();
  const startedAt = req.body.startedAt || null;
  const durationUsedSeconds = calculateDurationSeconds(startedAt, submittedAt);

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  const details = exam.questions.map((q, index) => {
    const userAnswer = normalizeAnswer(answers[q.id]);
    const correctAnswer = normalizeAnswer(q.correctAnswer);
    const isAnswered = Boolean(userAnswer);
    const isCorrect = isAnswered && userAnswer === correctAnswer;

    if (!isAnswered) unansweredCount += 1;
    else if (isCorrect) correctCount += 1;
    else wrongCount += 1;

    return {
      questionId: q.id,
      order: index + 1,
      content: q.content,
      options: q.options,
      userAnswer: userAnswer || null,
      correctAnswer,
      isCorrect
    };
  });

  const submission = db.insertSubmission({
    examId: exam.id,
    examTitle: exam.title,
    studentName,
    studentCode: String(req.body.studentCode || '').trim(),
    answers,
    total: exam.questions.length,
    correctCount,
    wrongCount,
    unansweredCount,
    startedAt,
    submittedAt: submittedAt.toISOString(),
    submittedAtVN: formatDateTimeVN(submittedAt),
    durationUsedSeconds,
    details
  });

  const adminPayload = {
    id: submission.id,
    examId: submission.examId,
    examTitle: submission.examTitle,
    studentName: submission.studentName,
    studentCode: submission.studentCode,
    total: submission.total,
    correctCount: submission.correctCount,
    wrongCount: submission.wrongCount,
    unansweredCount: submission.unansweredCount,
    submittedAt: submission.submittedAt,
    submittedAtVN: submission.submittedAtVN,
    durationUsedSeconds: submission.durationUsedSeconds
  };

  io.emit('new_submission', adminPayload);
  res.status(201).json({
    message: 'Đã nộp bài.',
    result: {
      ...adminPayload,
      details
    }
  });
});

app.get('/api/submissions', verifyToken, (req, res) => {
  res.json(db.getAllSubmissions().slice().reverse());
});

app.get('/api/exams/:examId/submissions', verifyToken, (req, res) => {
  res.json(db.getSubmissionsByExamId(req.params.examId).slice().reverse());
});

app.get('/api/submissions/:submissionId', verifyToken, (req, res) => {
  const submission = db.getSubmissionById(req.params.submissionId);
  if (!submission) return res.status(404).json({ message: 'Không tìm thấy bài nộp.' });
  res.json(submission);
});


app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/tao-de', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create-exam.html'));
});

app.get('/thi/:examId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'exam.html'));
});

app.get('/lam-bai/:examId', (req, res) => {
  res.redirect(`/thi/${encodeURIComponent(req.params.examId)}`);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'realtime-quiz-system' });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`✅ Quiz server đang chạy trên port ${PORT}`);
  console.log(`🔐 Mật khẩu admin mặc định: ${ADMIN_PASS}`);
});
