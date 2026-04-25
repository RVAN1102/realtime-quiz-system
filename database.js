const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRET_KEY = crypto.scryptSync(process.env.DB_SECRET || 'MatKhauCucManhCuaBan', 'salt', 32);
const ALGORITHM = 'aes-256-cbc';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.enc');

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

function createId(prefix) {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createEmptyDB() {
  return {
    exams: [
      {
        id: 'exam_demo_csdl',
        title: 'Đề demo Cơ sở dữ liệu',
        description: 'Đề mẫu để kiểm tra nhanh giao diện làm bài và realtime dashboard.',
        durationMinutes: 45,
        createdAt: new Date().toISOString(),
        questions: [
          {
            id: 'q_demo_1',
            content: 'Khóa chính trong quan hệ dùng để làm gì?',
            options: {
              A: 'Lưu trữ dữ liệu kiểu văn bản',
              B: 'Xác định duy nhất mỗi bộ trong quan hệ',
              C: 'Tự động mã hóa toàn bộ bảng',
              D: 'Chỉ dùng để sắp xếp dữ liệu'
            },
            correctAnswer: 'B'
          },
          {
            id: 'q_demo_2',
            content: 'Hàm gộp trong SQL thường nhận vào gì và trả về gì?',
            options: {
              A: 'Một tập giá trị và trả về một giá trị',
              B: 'Một giá trị và trả về một tập giá trị',
              C: 'Một tập giá trị và trả về một tập giá trị',
              D: 'Một giá trị và trả về một giá trị duy nhất trong mọi trường hợp'
            },
            correctAnswer: 'A'
          },
          {
            id: 'q_demo_3',
            content: 'Mối quan hệ giữa các thực thể trong mô hình ER có thể là gì?',
            options: {
              A: 'Chỉ một - một',
              B: 'Chỉ một - nhiều',
              C: 'Một - một, một - nhiều và nhiều - nhiều',
              D: 'Không thể biểu diễn nhiều - nhiều'
            },
            correctAnswer: 'C'
          }
        ]
      }
    ],
    submissions: []
  };
}

function normalizeDB(data) {
  if (Array.isArray(data)) {
    return { exams: [], submissions: data };
  }
  if (!data || typeof data !== 'object') return createEmptyDB();
  return {
    exams: Array.isArray(data.exams) ? data.exams : [],
    submissions: Array.isArray(data.submissions) ? data.submissions : []
  };
}

function writeDB(data) {
  const encryptedData = encrypt(JSON.stringify(data, null, 2));
  fs.writeFileSync(DB_PATH, encryptedData, 'utf8');
}

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initialData = createEmptyDB();
      writeDB(initialData);
      return initialData;
    }

    const encryptedFileContent = fs.readFileSync(DB_PATH, 'utf8');
    const decryptedJson = decrypt(encryptedFileContent);
    const parsedData = JSON.parse(decryptedJson);
    return normalizeDB(parsedData);
  } catch (err) {
    console.error('❌ Lỗi đọc DB. Nếu bạn đổi DB_SECRET, file cũ sẽ không giải mã được:', err.message);
    return createEmptyDB();
  }
}

function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('⚠️ Chưa có file DB, đang tạo database.enc mới...');
    writeDB(createEmptyDB());
    console.log('🔒 Đã tạo database.enc cho hệ thống quiz.');
    return;
  }

  const data = readDB();
  writeDB(data);
}

function insertExam(exam) {
  const data = readDB();
  const savedExam = {
    id: exam.id || createId('exam'),
    title: exam.title,
    description: exam.description || '',
    durationMinutes: Number(exam.durationMinutes),
    createdAt: exam.createdAt || new Date().toISOString(),
    questions: exam.questions.map((q, index) => ({
      id: q.id || createId(`q${index + 1}`),
      content: q.content,
      options: q.options,
      correctAnswer: q.correctAnswer
    }))
  };
  data.exams.push(savedExam);
  writeDB(data);
  return savedExam;
}

function getAllExams() {
  return readDB().exams;
}

function getExamById(examId) {
  return readDB().exams.find((exam) => exam.id === examId) || null;
}

function deleteExam(examId) {
  const data = readDB();
  const before = data.exams.length;
  data.exams = data.exams.filter((exam) => exam.id !== examId);
  if (data.exams.length === before) return false;
  writeDB(data);
  return true;
}

function insertSubmission(submission) {
  const data = readDB();
  const savedSubmission = {
    id: submission.id || createId('sub'),
    ...submission
  };
  data.submissions.push(savedSubmission);
  writeDB(data);
  return savedSubmission;
}

function getAllSubmissions() {
  return readDB().submissions;
}

function getSubmissionsByExamId(examId) {
  return readDB().submissions.filter((submission) => submission.examId === examId);
}

function getSubmissionById(submissionId) {
  return readDB().submissions.find((submission) => submission.id === submissionId) || null;
}

module.exports = {
  initDB,
  insertExam,
  getAllExams,
  getExamById,
  deleteExam,
  insertSubmission,
  getAllSubmissions,
  getSubmissionsByExamId,
  getSubmissionById
};
