'use strict';

// Troll đồng nghiệp - KHÔNG phải tính năng thật, chỉ để đùa. Sau lần lưu
// record (Thêm mới/Sửa/Nhân bản, đều đi qua nút "Lưu" của cùng 1 form)
// THÀNH CÔNG thứ 3, hiện 1 modal giả vờ "hết hạn dùng thử" - không có nút
// Hủy, chỉ có "Chơi luôn" dẫn tới 1 câu đố đạo hàm, chọn sai thì bị chê rồi
// chọn lại tới khi đúng thì thôi. Gọi notifyEditFormSaved() từ editForm.js
// sau mỗi lần lưu thành công.
//
// Đếm 2 tầng:
// 1. `successfulSaveCount` - biến thường trong bộ nhớ, đếm số lần lưu
//    thành công, KHÔNG lưu localStorage nên F5 lại trang là đếm lại từ 0.
// 2. `hasTrollBeenShown()`/`markTrollShown()` - cờ lưu trong localStorage
//    (sống sót qua F5/tắt mở lại trình duyệt/restart server), đảm bảo cả
//    trò đùa chỉ bung ra ĐÚNG 1 LẦN DUY NHẤT trong suốt vòng đời của trình
//    duyệt đó, dù đồng nghiệp có lưu thêm bao nhiêu record hay reload trang
//    bao nhiêu lần đi nữa. Đánh dấu "đã troll" ngay khi modal HIỆN RA (không
//    đợi họ giải xong câu đố), để không có cách nào lỡ bị troll lại lần 2.
const TROLL_STORAGE_KEY = 'realmStudio.trollShown';

function hasTrollBeenShown() {
  try {
    return localStorage.getItem(TROLL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markTrollShown() {
  try {
    localStorage.setItem(TROLL_STORAGE_KEY, '1');
  } catch {
    // Trình duyệt chặn localStorage - bỏ qua, chấp nhận rủi ro nhỏ là có
    // thể troll lại nếu rơi đúng vào tình huống hiếm này.
  }
}

let successfulSaveCount = 0;

// Câu hỏi đạo hàm thay vì cộng trừ nhân chia đơn giản - để đúng kiểu "wtf is
// this" khi đang thao tác bình thường tự dưng bị hỏi đạo hàm.
const TROLL_QUESTIONS = [
  {
    question: 'd/dx (x³ + 2x² − 5x) = ?',
    options: ['3x² + 2x − 5', 'x² + 4x − 5', '3x² + 4x − 5', '3x³ + 4x − 5'],
    correctIndex: 2,
  },
  {
    question: 'd/dx (sin(x)·cos(x)) = ?',
    options: ['sin(2x)', 'cos(2x)', '−sin(2x)', '2cos(x)'],
    correctIndex: 1,
  },
  {
    question: 'd/dx (eˣ·ln(x)) = ?',
    options: ['2eˣln(x)', 'eˣ/x', 'eˣ(ln(x) − 1/x)', 'eˣ(ln(x) + 1/x)'],
    correctIndex: 3,
  },
  {
    question: 'd/dx (1 / (x² + 1)) = ?',
    options: ['−2x / (x² + 1)²', '2x / (x² + 1)²', '−1 / (x² + 1)²', '−2x / (x² + 1)'],
    correctIndex: 0,
  },
];

const TROLL_TAUNTS = [
  'Sai rồi, chắc hôm nay chưa uống cà phê nhỉ?',
  'Trật lất, não còn hoạt động không đấy?',
  'Sai bét, kiểu này cấp 1 chưa qua hả?',
  'Không phải đâu, chọn lại đi.',
  'Trớt quớt, gà quá vậy trời.',
  'Sai tiếp rồi, cố lên nào (nhưng mà gà thật đấy).',
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function notifyEditFormSaved() {
  if (hasTrollBeenShown()) return;
  successfulSaveCount += 1;
  if (successfulSaveCount === 3) {
    markTrollShown();
    el('troll-paywall-overlay').hidden = false;
  }
}

// Re-trigger CSS animation bằng cách gỡ class ra rồi ép reflow trước khi
// gắn lại - gắn thẳng lại class đã có sẵn sẽ không chạy lại animation.
function shakeQuizCard() {
  const card = el('troll-quiz-card');
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

function startTrollQuiz() {
  el('troll-paywall-overlay').hidden = true;

  const current = pickRandom(TROLL_QUESTIONS);
  el('troll-quiz-question').textContent = current.question;
  el('troll-quiz-feedback').textContent = '';

  const labels = ['A', 'B', 'C', 'D'];
  const optionsBox = el('troll-quiz-options');
  optionsBox.innerHTML = '';
  current.options.forEach((optionText, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost troll-quiz-option';
    btn.textContent = `${labels[i]}. ${optionText}`;
    btn.addEventListener('click', () => {
      if (i === current.correctIndex) {
        el('troll-quiz-overlay').hidden = true;
        showToast('Chúc mừng, bạn đã vượt qua bài kiểm tra IQ. Tiếp tục làm việc đi.');
      } else {
        el('troll-quiz-feedback').textContent = pickRandom(TROLL_TAUNTS);
        shakeQuizCard();
      }
    });
    optionsBox.appendChild(btn);
  });

  el('troll-quiz-overlay').hidden = false;
}

el('troll-play-btn').addEventListener('click', startTrollQuiz);
