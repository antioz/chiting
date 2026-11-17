/* Читинг — фронтенд. Статика, без сборки.
   Пошаговый флоу (task-15): текст → вопросы по одному (одна кнопка «Готово»)
   → оценка review-question → сократ со 2-й неудачи → рефлексия → купон. */
'use strict';

// ---------- Конфиг ----------
const API_URL = 'https://functions.yandexcloud.net/d4e52ejg9kvu9arsc2kd';
const TOKEN_KEY = 'chiting_token';

// DEPRECATED (task-12): вопросы теперь отдаёт бэкенд в attempt-get (поле questions).
// Эта копия — только запасной fallback для старого бэка. Удалить, когда бэк гарантированно новый.
const LEVEL_QUESTIONS = {
  'lvl-p2-vanka': [
    { qid: 'q1', fragment_ref: 'whole', text: 'Ответь, не заглядывая в текст. Сожми его до одного предложения, начиная со слов «Это письмо о…». Не более 25 слов.' },
    { qid: 'q2', fragment_ref: 'f3', text: 'Найди место, где Ванька рассказывает деду, как его бьют хозяева, и просит забрать его. Передай суть этой мольбы своими словами, не используя ни одного слова из оригинала.' },
    { qid: 'q3', fragment_ref: 'f1', text: 'Ванька не решается просить о помощи вслух и пишет письмо. Приведи свой пример: когда тебе было нужно о чём-то попросить, а сказать прямо было трудно. 1–2 предложения о своём случае и фраза-связка: чем он похож на случай с Ванькой.' },
    { qid: 'q4', fragment_ref: 'f5', text: 'Перечитай концовку про себя. Какое место текста запомнилось тебе сильнее всего: конверт, адрес «На деревню дедушке» или сон о печке? Назови конкретное место и расскажи, что в нём отозвалось.' },
    { qid: 'q5', fragment_ref: 'f3', text: 'Ваньку бьют, но он не жалуется и не убегает — только просится к деду. Согласен ли ты, что терпение и молчание — выход для Ваньки? Назови фрагмент, из-за которого ты так решил, и объясни, что должно было бы произойти в тексте, чтобы ты изменил мнение.' },
  ],
  'lvl-p5-kuprin': [
    { qid: 'q1', fragment_ref: 'f4', text: 'Рассказ называется «Чудесный доктор». Объясни своими словами, что в этом рассказе значит слово «чудесный» — не в смысле волшебства. Каким местом в тексте это объясняется?' },
    { qid: 'q2', fragment_ref: 'f5', text: 'Ответь, не заглядывая в текст. Объясни одним предложением (не более 25 слов), что изменилось в семье Мерцаловых после визита незнакомца.' },
    { qid: 'q3', fragment_ref: 'f2', text: 'Письмо, которое мальчики должны были передать, так и не дошло до адресата — и в доме стало ещё горше. Приведи пример из жизни или другой книги, где маленькое невыполненное дело изменило всё. 1–2 предложения и фраза-связка: как это соотносится с мыслью автора.' },
    { qid: 'q4', fragment_ref: 'f4', text: 'Вспомни случай, когда тебе помог незнакомый человек. Опиши его в 1–2 предложениях и добавь фразу: чем твой случай похож на встречу Мерцалова с доктором и чем отличается.' },
    { qid: 'q5', fragment_ref: 'f5', text: 'Доктор помог семье тайно и не назвал имени — сказал: «Возвращайтесь-ка домой». Согласен ли ты, что настоящая помощь не должна ждать благодарности? Укажи фрагмент, который это подтверждает или опровергает, и назови случай из жизни или другой книги, который проверяет эту мысль.' },
  ],
  'lvl-p2-fersman': [
    { qid: 'q1', fragment_ref: 'whole', text: 'Ответь, не заглядывая в текст. Сожми его до одного предложения, начиная со слов «Этот фрагмент о…». Не более 25 слов.' },
    { qid: 'q2', fragment_ref: 'f5', text: 'В конце Ферсман называет Крым своим «первым университетом». Объясни своими словами, что он этим хочет сказать, не используя слов автора. Каким местом текста это объясняется?' },
    { qid: 'q3', fragment_ref: 'f1', text: 'Ферсман в детстве сам нашёл на скале жилку горного хрусталя — и это увлекло его на всю жизнь. Приведи свой пример: когда находка, игра или случайное наблюдение затянули тебя надолго. 1–2 предложения и фраза-связка: чем твой случай похож на случай автора.' },
    { qid: 'q4', fragment_ref: 'f3', text: 'Перечитай рассказ автора о море и сердоликовой бухте. Какая картина или мысль из этого фрагмента запомнилась тебе? Назови её и объясни, почему она отозвалась.' },
    { qid: 'q5', fragment_ref: 'f5', text: 'Главное утверждение автора в конце фрагмента: «Крым был моим первым университетом» — природа научила его работать и думать. Достаточно ли Ферсман объясняет, чем такая «школа природы» лучше настоящей школы? Назови основания, которые он приводит, скажи, согласен ли ты, и что ещё должно быть в тексте, чтобы ты был убеждён.' },
  ],
  'lvl-p5-perelman': [
    { qid: 'q1', fragment_ref: 'f1', text: 'Весь спор у завтрака идёт о словах «кружиться вокруг». Договорись, что значит «кружиться вокруг чего-нибудь», — сначала своими словами, потом двумя словами из текста, которые это значение задают.' },
    { qid: 'q2', fragment_ref: 'f3', text: 'Ответь, не заглядывая в текст. Объясни одним предложением (не более 25 слов), в чём подвох задачи про школьные кружки.' },
    { qid: 'q3', fragment_ref: 'f1', text: 'Спор о белке шёл не из-за дела, а из-за того, как понимать слово «вокруг». Приведи пример из жизни, когда люди спорили из-за значения слова. 1–2 предложения и фраза-связка: как это соотносится с мыслью учёного в тексте.' },
    { qid: 'q4', fragment_ref: 'f1', text: 'Какая из головоломок завтрака — про белку, кухню, кружки или счёт прохожих — показалась тебе самой хитрой? Назови её и расскажи, почему именно она зацепила.' },
    { qid: 'q5', fragment_ref: 'f1', text: 'Учёный говорит: «Спор идёт у вас в сущности о словах», — и предлагает условиться о значении. Согласен ли ты, что спор о значениях слов — пустое дело? Назови основания автора (примеры, которые он приводит), укажи фрагмент и объясни, когда спор о словах всё же бывает полезен.' },
  ],
};

// Вопросы рефлексии — из api/lib/prompts.js (бэкенд их не отдаёт).
const REFLECTION_QUESTIONS = [
  { qid: 'r1', text: 'Прочитай пакет ещё раз в голове. Какое слово из текста тебе показалось самым важным? Самым ярким? Самым неожиданным? А может, запомнилась не фраза, а мысль? Расскажи: что в тебе отозвалось в этот момент?' },
  { qid: 'r2', text: 'Где ты сам встречал ситуацию, похожую на то, что описал автор? Опиши свой случай одним-двумя предложениями и добавь фразу: чем твой случай похож на текст и чем отличается.' },
  { qid: 'r3', text: 'Согласен ли ты с тем, что написал автор? Назови место в тексте, из-за которого ты так решил, и объясни свой выбор.' },
];

// ---------- API-клиент ----------
async function api(action, params = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const isGet = params.__get;
  const query = `?a=${encodeURIComponent(action)}` + (params.id ? `&id=${encodeURIComponent(params.id)}` : '');
  const url = API_URL + query;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Auth-Token'] = token; // НЕ Authorization — платформа его перехватывает
  let resp;
  try {
    if (isGet) {
      resp = await fetch(url, { method: 'GET', headers });
    } else {
      const body = { ...params };
      delete body.__get;
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    }
  } catch (e) {
    throw new ApiError(0, 'network', 'Не получилось связаться с сервером. Проверь интернет.');
  }
  let data = null;
  try { data = await resp.json(); } catch { /* пустое тело */ }
  if (resp.status === 401) {
    sessionExpired();
    throw new ApiError(401, 'unauthorized', 'Сессия закончилась — войди снова.');
  }
  if (!resp.ok) {
    throw new ApiError(resp.status, (data && data.error) || 'http_' + resp.status, errorText(resp.status, (data && data.error) || ''));
  }
  return data;
}

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function errorText(status, code) {
  const map = {
    waitlist: 'Мест в группе сейчас нет — но мы записали твою заявку. Когда место появится, взрослый получит сообщение.',
    login_taken: 'Такое имя уже занято. Придумай другое.',
    bad_credentials: 'Неверное имя или пароль. Проверь и попробуй ещё раз.',
    validation: 'Проверь, что все поля заполнены правильно.',
    suspicious: 'Похоже на копипаст. Ответы должны быть напечатаны, а не вставлены — перепиши своими словами.',
    not_editable: 'Этот ответ уже проверен. Иди дальше.',
    no_answer: 'Сначала напиши ответ, потом жми «Готово».',
    not_reflection: 'Сначала нужно пройти проверку ответов.',
    reflection_incomplete: 'Сначала допиши рефлексию: все три ответа должны засчитаться.',
    socratic_limit: 'Подсказки к этому вопросу закончились — теперь напиши ответ сам, как понимаешь.',
    llm_limit: 'Вопросов к нейронке на сегодня хватит — напиши ответ как получится, взрослый всё увидит.',
    socratic_filter: 'Подсказка сбилась — попробуй ещё разок.',
    llm_parse: 'Проверяльщик сбился. Попробуй ещё раз через минуту.',
    not_iterable: 'Этот шаг сейчас недоступен.',
    already_split: 'Разбивка уже прошла — продолжай с новой попыткой.',
  };
  return map[code] || `Ошибка (${status}). Попробуй ещё раз.`;
}

// ---------- Утилиты ----------
const $ = (sel) => document.querySelector(sel);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function ts(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return (v.low >>> 0) + (v.high >>> 0) * 4294967296;
  return Number(v) || null;
}
function fmtDate(v) {
  const t = ts(v);
  if (!t) return '—';
  return new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

const STATUS_NAMES = {
  reading: 'читает', answering: 'отвечает', socratic: 'разбирает ошибки',
  reflection: 'рефлексия', approved: 'зачтено', failed: 'не зачтено',
};

// ---------- Состояние ----------
const S = {
  mode: 'login',
  levels: [],
  level: null,
  attempt: null,
  questions: [],
  marks: {},              // qid -> {mark, explanation}
  q: null,                // состояние текущего вопроса (см. startQuestion)
  reflections: [],
};

// ---------- Роутинг экранов ----------
const SCREENS = ['auth', 'levels', 'reader', 'question', 'reflection', 'approve', 'cabinet'];
function show(name) {
  for (const s of SCREENS) $('#screen-' + s).classList.toggle('hidden', s !== name);
  $('#topbar').classList.toggle('hidden', name === 'auth');
  window.scrollTo(0, 0);
}

// ---------- Экран 1: вход/регистрация ----------
function initAuth() {
  const tabLogin = $('#auth-tab-login'), tabReg = $('#auth-tab-register');
  const inviteWrap = $('#auth-invite-wrap'), submit = $('#auth-submit'), err = $('#auth-error');
  function setMode(m) {
    S.mode = m;
    tabLogin.classList.toggle('active', m === 'login');
    tabReg.classList.toggle('active', m === 'register');
    inviteWrap.classList.toggle('hidden', m === 'login');
    submit.textContent = m === 'login' ? 'Войти' : 'Зарегистрироваться';
    err.classList.add('hidden');
  }
  tabLogin.onclick = () => setMode('login');
  tabReg.onclick = () => setMode('register');
  setMode('login');
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    submit.disabled = true;
    try {
      const name = $('#auth-name').value.trim();
      const password = $('#auth-password').value;
      if (S.mode === 'register') {
        const invite = $('#auth-invite').value.trim().toUpperCase();
        if (!invite) throw new Error('Введи код приглашения — его дал взрослый (например: TEST-10).');
        const r = await api('register', { name, password, invite });
        localStorage.setItem(TOKEN_KEY, r.token);
      } else {
        const r = await api('login', { name, password });
        localStorage.setItem(TOKEN_KEY, r.token);
      }
      await openLevels();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    } finally {
      submit.disabled = false;
    }
  };
}

// ---------- Экран 2: уровни ----------
async function openLevels() {
  try {
    const r = await api('levels', { __get: true });
    S.levels = Array.isArray(r) ? r : (r.levels || []);
  } catch (ex) {
    notify(ex.message);
    return;
  }
  renderLevels();
  show('levels');
}

function renderLevels() {
  const wrap = $('#levels-list');
  wrap.innerHTML = '';
  for (const lv of S.levels) {
    const card = el('div', 'level-card' + (lv.available ? '' : ' locked'));
    const rule = el('div', 'level-rule', lv.rule_code || 'П');
    const title = el('h3', 'level-title', lv.text_title || '');
    const author = el('p', 'level-author', lv.text_author || '');
    const ruleText = el('p', 'level-rule-text', lv.rule || lv.kid_formulation || '');
    card.append(rule, title, author, ruleText);
    if (lv.split) {
      const n = el('div', 'level-split-note',
        `Продолжение после разбивки: «${lv.split.fragment_title || 'фрагмент'}» (проход ${lv.split.pass_number}). Нажми «Начать», чтобы продолжить.`);
      card.append(n);
    }
    if (lv.available) {
      const form = el('div', 'level-form');
      const stakeWrap = el('div', 'stake-wrap');
      const input = el('input', 'input');
      input.type = 'number'; input.min = 1; input.max = 100000; input.value = lv.split ? '' : 50;
      input.placeholder = 'Ставка';
      const cur = el('span', 'stake-currency', '₽');
      stakeWrap.append(input, cur);
      const btn = el('button', 'btn btn-primary', 'Начать');
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          if (lv.split && lv.split.attempt_id) {
            await loadAttempt(lv.split.attempt_id);
          } else {
            const stake = parseInt(input.value, 10);
            if (!Number.isInteger(stake) || stake < 1 || stake > 100000) {
              input.style.borderColor = 'var(--bad)';
              btn.disabled = false;
              return;
            }
            const r = await api('attempt-create', { level_id: lv.id, stake });
            await loadAttempt(r.attempt.id);
          }
        } catch (ex) { notify(ex.message); btn.disabled = false; }
      };
      form.append(stakeWrap, btn);
      card.append(form);
    } else {
      const plate = el('div', 'locked-plate',
        lv.available_at ? `Откроется позже — ${fmtDate(lv.available_at)}` : 'Откроется позже');
      card.append(plate);
    }
    wrap.append(card);
  }
}

// ---------- Загрузка attempt ----------
async function loadAttempt(attemptId) {
  const r = await api('attempt-get', { __get: true, id: attemptId });
  S.attempt = r.attempt;
  let questions = Array.isArray(r.questions) && r.questions.length ? r.questions : null;
  if (!questions) {
    const all = LEVEL_QUESTIONS[S.attempt.level_id] || [];
    questions = (r.split && r.fragment)
      ? all.filter(q => q.fragment_ref === r.fragment.id || q.fragment_ref === 'whole')
      : all;
  } else if (r.split && questions.some(q => 'in_scope' in q)) {
    questions = questions.filter(q => q.in_scope !== false);
  }
  S.questions = questions;
  S.textPayload = r.text;
  S.fragment = r.fragment || null;
  S.q = null;
  S.marks = {};
  try { S.marks = S.attempt.marks_json ? JSON.parse(S.attempt.marks_json) : {}; } catch { S.marks = {}; }

  // Resume: рефлексия уже открыта — сразу туда.
  if (S.attempt.status === 'reflection') {
    renderReflection();
    show('reflection');
    return;
  }
  // Resume: часть вопросов уже оценена — продолжаем с первого без mark>=1.
  if (S.attempt.status === 'answering' && Object.keys(S.marks).length) {
    const nextIdx = firstUnpassedIdx();
    if (nextIdx === -1) {
      // Все in_scope оценены, но статус ещё answering (гонка) — перечитаем состояние.
      const r2 = await api('attempt-get', { __get: true, id: attemptId });
      S.attempt = r2.attempt;
      if (S.attempt.status === 'reflection') { renderReflection(); show('reflection'); return; }
      startQuestion(0);
      return;
    }
    startQuestion(nextIdx);
    return;
  }
  renderReader();
  show('reader');
}

function firstUnpassedIdx() {
  for (let i = 0; i < S.questions.length; i++) {
    const m = S.marks[S.questions[i].qid];
    if (!m || m.mark < 1) return i;
  }
  return -1;
}

function readerTextString() {
  const t = S.textPayload;
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (Array.isArray(t.body)) return t.body.join('\n\n');
  return String(t.text || '');
}

// ---------- Экран 3: читалка ----------
let readTimer = null, readingActive = false;

function renderReader() {
  stopReading();
  const lv = S.levels.find(l => l.id === S.attempt.level_id) || {};
  $('#reader-kicker').textContent = S.fragment ? 'Фрагмент' : 'Текст';
  $('#reader-title').textContent = S.fragment ? (S.fragment.title || 'Фрагмент') : (lv.text_title || 'Текст');
  $('#reader-rule').textContent = 'Правило: ' + (lv.rule || lv.kid_formulation || '');
  const textWrap = $('#reader-text');
  textWrap.innerHTML = '';
  if (S.fragment) {
    textWrap.append(el('div', 'reader-fragment-title', S.fragment.title || 'Фрагмент'));
  }
  textWrap.append(document.createTextNode(readerTextString()));
  startReading();
}

function startReading() {
  if (readingActive || !S.attempt) return;
  readTimer = setTimeout(() => {
    readingActive = true;
    api('attempt-event', { id: S.attempt.id, type: 'read_start' }).catch(() => {});
  }, 3000);
}
function pauseReading() {
  clearTimeout(readTimer); readTimer = null;
  if (readingActive) {
    readingActive = false;
    api('attempt-event', { id: S.attempt.id, type: 'read_end' }).catch(() => {});
  }
}
function stopReading() { pauseReading(); }

document.addEventListener('visibilitychange', () => {
  if (!S.attempt) return;
  if (document.hidden) {
    api('attempt-event', { id: S.attempt.id, type: 'switch' }).catch(() => {});
    if (readingActive) pauseReading();
  } else if (!$('#screen-reader').classList.contains('hidden')) {
    startReading();
  }
});

// ---------- Экран 4: вопрос по шагам ----------
// Режимы S.q.mode: 'answer' (поле + «Готово») | 'verdict' (оценка) | 'socratic' (диалог).
function startQuestion(idx) {
  const q = S.questions[idx];
  const prevMark = S.marks[q.qid];
  S.q = {
    idx,
    qid: q.qid,
    mode: 'answer',
    text: '',                 // текущий (последний отправленный) текст ответа
    keydown: 0,
    pasted: false,
    verdict: null,            // {mark, explanation}
    socratic: null,           // {question, step, history:[{q,a}]}
    llmLimit: false,
  };
  if (prevMark && prevMark.mark < 1) {
    // Повторный заход на заваленный вопрос: сохранить нечего (текст не храним на сервере без answer).
  }
  renderQuestion();
  show('question');
}

function updateProgress() {
  const total = S.questions.length;
  const idx = S.q.idx;
  $('#q-progress-label').textContent = `Вопрос ${idx + 1} из ${total}`;
  const passed = S.questions.filter(q => (S.marks[q.qid] || {}).mark >= 1).length;
  const frac = Math.max(passed / total, (idx) / total);
  $('#q-progress-fill').style.width = Math.round(frac * 100) + '%';
}

function renderQuestion() {
  updateProgress();
  const body = $('#question-body');
  body.innerHTML = '';
  const q = S.questions[S.q.idx];

  if (S.q.mode === 'socratic') return renderSocratic(body, q);

  // Вопрос (формулировка) виден в режиме ответа и в режиме оценки.
  body.append(el('p', 'q-text', q.text));

  if (S.q.mode === 'answer') {
    const ta = el('textarea', 'input');
    ta.id = 'q-answer';
    ta.placeholder = 'Напиши ответ своими словами…';
    ta.value = S.q.text;
    S.q.keydown = 0;
    S.q.pasted = false;
    ta.addEventListener('keydown', () => { S.q.keydown += 1; });
    ta.addEventListener('paste', (e) => {
      e.preventDefault();
      warnInline(body, 'Вставка не работает — напечатай ответ сам. Так честнее.');
    });
    ta.addEventListener('drop', (e) => e.preventDefault());
    ta.addEventListener('dragover', (e) => e.preventDefault());
    const count = el('div', 'q-count', 'Напечатано символов с клавиатуры: 0');
    ta.addEventListener('input', () => {
      count.textContent = `Напечатано символов с клавиатуры: ${S.q.keydown}`;
    });
    body.append(ta, count);
    const actions = el('div', 'q-actions');
    const done = el('button', 'btn btn-primary btn-big', 'Готово');
    done.id = 'q-done';
    done.onclick = () => submitAnswer(ta, done);
    actions.append(done);
    body.append(actions);
    ta.focus();
    return;
  }

  // mode === 'verdict'
  const v = S.q.verdict;
  const card = el('div', 'verdict ' + (v.mark === 2 ? 'ok' : v.mark === 1 ? 'mid' : 'bad'));
  if (v.mark === 2) {
    card.append(el('p', 'verdict-title', 'Всё верно!'));
    if (v.explanation) card.append(el('p', 'verdict-explain', v.explanation));
  } else if (v.mark === 1) {
    card.append(el('p', 'verdict-title', v.llmDead ? 'Нейронка отдыхает' : 'В целом правильно, но можно кое-что учесть:'));
    if (v.explanation) card.append(el('p', 'verdict-explain', v.explanation));
  } else {
    card.append(el('p', 'verdict-title', 'Пока не получилось. Подумай ещё'));
    if (v.explanation) card.append(el('p', 'verdict-explain', v.explanation));
  }
  body.append(card);

  const actions = el('div', 'q-actions');
  if (v.llmDead) {
    const later = el('button', 'btn btn-primary btn-big', 'Попробовать позже');
    later.id = 'q-later';
    later.onclick = () => openLevels();
    actions.append(later);
  } else if (v.mark >= 1) {
    const next = el('button', 'btn btn-primary btn-big', 'Дальше');
    next.id = 'q-next';
    next.onclick = () => goNext();
    actions.append(next);
    if (v.mark === 1) {
      const more = el('button', 'btn-link', 'Хочу дополнить');
      more.id = 'q-amend';
      more.onclick = () => { S.q.mode = 'answer'; renderQuestion(); };
      actions.append(more);
    }
  } else {
    // mark 0: возвращаем в режим ответа (прежний текст сохранён в S.q.text).
    const retry = el('button', 'btn btn-primary btn-big', 'Переписать ответ');
    retry.id = 'q-retry';
    retry.onclick = () => { S.q.mode = 'answer'; renderQuestion(); };
    actions.append(retry);
  }
  body.append(actions);
}

function warnInline(body, msg) {
  let w = body.querySelector('.error');
  if (!w) { w = el('div', 'error'); body.append(w); }
  w.textContent = msg;
  w.classList.remove('hidden');
  clearTimeout(warnInline._t);
  warnInline._t = setTimeout(() => w.classList.add('hidden'), 5000);
}

async function submitAnswer(ta, btn) {
  const text = ta.value.trim();
  if (!text) { ta.focus(); return; }
  const body = $('#question-body');
  if (S.q.pasted || (text.length > 40 && S.q.keydown < text.length * 0.9)) {
    warnInline(body, 'Похоже, ответ вставлен, а не напечатан. Перепиши своими руками — так честнее.');
  }
  btn.disabled = true;
  try {
    await api('attempt-answers', {
      id: S.attempt.id,
      answer: { qid: S.q.qid, text, keydown: S.q.keydown, pasted: !!S.q.pasted, t_answer: Date.now() },
    });
    S.q.text = text;
    const r = await api('review-question', { id: S.attempt.id, qid: S.q.qid });
    S.marks[S.q.qid] = { mark: r.mark, explanation: r.explanation || '' };
    if (r.mark >= 1) {
      S.q.verdict = { mark: r.mark, explanation: r.explanation || '' };
      S.q.mode = 'verdict';
      renderQuestion();
    } else if ((r.attempts_on_qid || 0) >= 2) {
      // Вторая подряд неудача — подключаем сократовский диалог.
      await startSocratic();
    } else {
      S.q.verdict = { mark: 0, explanation: r.explanation || '' };
      S.q.mode = 'verdict';
      renderQuestion();
    }
  } catch (ex) {
    if (ex.code === 'llm_limit') {
      // Нейронка на сегодня закрыта: проверить не можем. Решение (см. отчёт task-15):
      // mark не подделываем, вперёд не пускаем — ребёнок уходит на выбор задания
      // кнопкой «Попробовать позже», попытка ждёт (ответ уже сохранён на сервере).
      S.q.verdict = { mark: 1, llmDead: true, explanation: 'Вопросов к нейронке на сегодня хватит — напиши ответ как получится, взрослый всё увидит. Ответ сохранён, проверить его можно будет позже.' };
      S.q.mode = 'verdict';
      renderQuestion();
    } else if (ex.code === 'suspicious') {
      S.q.keydown = 0;
      warnInline(body, ex.message);
    } else {
      notify(ex.message);
    }
  } finally {
    btn.disabled = false;
  }
}

// ---------- Сократовский диалог ----------
async function startSocratic() {
  try {
    const r = await api('socratic-ask', { id: S.attempt.id, qid: S.q.qid });
    S.q.mode = 'socratic';
    S.q.socratic = { question: r.question, step: r.step || 1, history: [] };
    renderQuestion();
  } catch (ex) {
    if (ex.code === 'socratic_limit' || ex.code === 'llm_limit') {
      notify(ex.message);
      S.q.verdict = { mark: 0, explanation: 'Подсказки закончились — теперь перепиши ответ сам, как понимаешь.' };
      S.q.mode = 'verdict';
      renderQuestion();
    } else {
      notify(ex.message);
      S.q.verdict = { mark: 0, explanation: '' };
      S.q.mode = 'verdict';
      renderQuestion();
    }
  }
}

function renderSocratic(body, q) {
  const soc = S.q.socratic;
  const kick = el('p', 'kicker', 'Давай подумаем вместе');
  body.append(kick);
  if (soc.history.length) {
    const hist = el('div', 'socratic-history');
    for (const h of soc.history) {
      const pq = el('p');
      pq.append(el('span', 'who', 'Вопрос'));
      pq.append(document.createTextNode(h.q));
      const pa = el('p');
      pa.append(el('span', 'who', 'Ты'));
      pa.append(document.createTextNode(h.a));
      hist.append(pq, pa);
    }
    body.append(hist);
  }
  body.append(el('p', 'socratic-q', soc.question));
  const ta = el('textarea', 'input');
  ta.id = 'socratic-answer';
  ta.placeholder = 'Напиши, что думаешь…';
  body.append(ta);
  const actions = el('div', 'q-actions');
  const send = el('button', 'btn btn-primary btn-big', 'Ответить');
  send.id = 'socratic-send';
  send.onclick = async () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    send.disabled = true;
    try {
      await api('socratic-answer', { id: S.attempt.id, qid: S.q.qid, text });
      soc.history.push({ q: soc.question, a: text });
      try {
        const r = await api('socratic-ask', { id: S.attempt.id, qid: S.q.qid });
        soc.question = r.question;
        soc.step = r.step || soc.step + 1;
        renderQuestion();
      } catch (ex2) {
        if (ex2.code === 'socratic_limit' || ex2.code === 'llm_limit') {
          // Шаги кончились — возвращаемся к основному вопросу.
          notify('Подсказки закончились — теперь напиши ответ на вопрос сам.');
          S.q.mode = 'answer';
          renderQuestion();
        } else {
          notify(ex2.message);
          renderQuestion();
        }
      }
    } catch (ex) {
      notify(ex.message);
      send.disabled = false;
    }
  };
  actions.append(send);
  const back = el('button', 'btn-link', 'Хватит подсказок — вернуться к ответу');
  back.id = 'socratic-back';
  back.onclick = () => { S.q.mode = 'answer'; renderQuestion(); };
  actions.append(back);
  body.append(actions);
  ta.focus();
}

// ---------- Переход дальше ----------
function goNext() {
  const nextIdx = S.q.idx + 1;
  if (nextIdx < S.questions.length) {
    startQuestion(nextIdx);
    return;
  }
  // Вопросы кончились — рефлексия.
  renderReflection();
  show('reflection');
}

// ---------- Экран 5: рефлексия ----------
function renderReflection() {
  stopReading();
  const wrap = $('#reflection-list');
  wrap.innerHTML = '';
  $('#reflection-warning').classList.add('hidden');
  for (const q of REFLECTION_QUESTIONS) {
    const card = el('div', 'refl-card');
    card.append(el('p', 'q-text', q.text));
    const ta = el('textarea', 'input');
    ta.dataset.rqid = q.qid;
    card.append(ta);
    wrap.append(card);
  }
}

async function submitReflection() {
  const answers = [];
  for (const q of REFLECTION_QUESTIONS) {
    const ta = document.querySelector(`textarea[data-rqid="${q.qid}"]`);
    const text = ta.value.trim();
    if (text.length < 2) { notify('Ответь на все три вопроса — хоть парой слов.'); ta.focus(); return; }
    answers.push(text);
  }
  const btn = $('#reflection-submit');
  btn.disabled = true;
  try {
    const r = await api('reflect', { id: S.attempt.id, answers });
    if (r.retry_qids && r.retry_qids.length) {
      const w = $('#reflection-warning');
      w.textContent = 'Некоторые ответы слишком короткие — перепиши чуть подробнее.';
      w.classList.remove('hidden');
      for (const qid of r.retry_qids) {
        const m = r.marks && r.marks[qid];
        if (m && m.explanation) {
          const ta = document.querySelector(`textarea[data-rqid="${qid}"]`);
          const note = el('div', 'verdict-explain', 'Проверяльщик: ' + m.explanation);
          ta.parentNode.append(note);
        }
      }
    } else {
      await doApprove();
    }
  } catch (ex) {
    notify(ex.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Экран 6: апрув ----------
async function doApprove() {
  const r = await api('approve', { id: S.attempt.id });
  $('#coupon-amount').textContent = r.coupon.amount + ' ₽';
  $('#coupon-code').textContent = r.coupon.code;
  launchConfetti();
  show('approve');
}

function launchConfetti() {
  const wrap = $('#confetti');
  wrap.innerHTML = '';
  const colors = ['#0a0a0a', '#8a8a8a', '#1e8e5a', '#b33951', '#c9a227'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = (2 + Math.random() * 2.5) + 's';
    p.style.animationDelay = (Math.random() * 1.2) + 's';
    wrap.append(p);
  }
}

// ---------- Экран 7: кабинет ----------
async function openCabinet() {
  try {
    const r = await api('coupons', { __get: true });
    const coupons = r.coupons || [];
    const attempts = r.attempts || [];
    const cw = $('#cabinet-coupons');
    cw.innerHTML = '';
    if (!coupons.length) cw.append(el('div', 'empty', 'Купонов пока нет — сходи в задания и заработай первый.'));
    for (const c of coupons) {
      const item = el('div', 'cab-item');
      const left = el('div');
      left.append(el('div', 'cab-amount', Number(c.amount) + ' ₽'), el('div', 'coupon-code', c.code));
      const st = el('div', 'cab-status ' + (c.status === 'active' ? 'active' : 'used'),
        c.status === 'active' ? 'Не погашен' : 'Погашен');
      item.append(left, st);
      cw.append(item);
    }
    const aw = $('#cabinet-attempts');
    aw.innerHTML = '';
    if (!attempts.length) aw.append(el('div', 'empty', 'Попыток пока не было.'));
    const lvById = {};
    for (const l of S.levels) lvById[l.id] = l;
    for (const a of attempts.slice().reverse()) {
      const item = el('div', 'cab-item');
      const meta = el('div');
      const lv = lvById[a.level_id];
      meta.append(el('div', null, (lv && lv.text_title) || a.level_id));
      meta.append(el('div', 'cab-meta', `${STATUS_NAMES[a.status] || a.status} · ${fmtDate(a.updated_at)}`));
      item.append(meta);
      if (lv && lv.full_source_url && a.status === 'approved') {
        const link = el('a', 'btn btn-outline', 'Прочитать целиком');
        link.href = lv.full_source_url;
        link.target = '_blank';
        link.rel = 'noopener';
        item.append(link);
      }
      aw.append(item);
    }
    show('cabinet');
  } catch (ex) {
    notify(ex.message);
  }
}

// ---------- Инициализация ----------
let bannerTimer = null;
function notify(msg) {
  let b = $('#app-banner');
  if (!b) {
    b = el('div');
    b.id = 'app-banner';
    b.className = 'app-banner hidden';
    document.body.prepend(b);
  }
  b.textContent = msg;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 6000);
}

function sessionExpired() {
  stopReading();
  localStorage.removeItem(TOKEN_KEY);
  S.attempt = null;
  const err = $('#auth-error');
  err.textContent = 'Сессия закончилась — войди снова.';
  err.classList.remove('hidden');
  show('auth');
}

function logout() {
  stopReading();
  localStorage.removeItem(TOKEN_KEY);
  S.attempt = null;
  show('auth');
}

function init() {
  initAuth();
  $('#reader-done').onclick = () => {
    stopReading();
    const idx = firstUnpassedIdx();
    startQuestion(idx === -1 ? 0 : idx);
  };
  $('#reflection-submit').onclick = submitReflection;
  $('#approve-to-cabinet').onclick = openCabinet;
  $('#nav-levels').onclick = openLevels;
  $('#nav-cabinet').onclick = openCabinet;
  $('#nav-logout').onclick = logout;
  if (localStorage.getItem(TOKEN_KEY)) openLevels();
  else show('auth');
}

document.addEventListener('DOMContentLoaded', init);
