/* Читинг — фронтенд. Статика, без сборки. */
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

// Вопросы рефлексии — из api/lib/prompts.js (бэкенд их тоже не отдаёт).
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
    // Единый 401-хендлер: любой запрос с протухшим токеном → сброс сессии и экран входа.
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
    not_answering: 'Ответы уже отправлены. Дальше — работа с вопросами, где не получилось.',
    not_socratic: 'Сейчас не время сократовского диалога.',
    not_reflection: 'Сначала нужно пройти проверку ответов.',
    reflection_incomplete: 'Сначала допиши рефлексию: все три ответа должны засчитаться.',
    socratic_limit: 'Давай сделаем паузу и подумаем самостоятельно — ты уже почти у цели.',
    llm_limit: 'На сегодня вопросов к нейронке хватит — твои ответы уже засчитаны, продолжай писать сам.',
    socratic_filter: 'Подсказка сбилась — попробуй ещё разок или возьми обычную подсказку.',
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
function ts(v) { // created_at: число мс или {low,high}
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
function esc(s) { return String(s == null ? '' : s); }

const STATUS_NAMES = {
  reading: 'читает', answering: 'отвечает', socratic: 'разбирает ошибки',
  reflection: 'рефлексия', approved: 'зачтено', failed: 'не зачтено',
};

// ---------- Состояние ----------
const S = {
  mode: 'login',          // login | register
  levels: [],
  level: null,            // выбранный уровень
  attempt: null,          // активный attempt
  questions: [],          // вопросы текущего attempt
  marks: null,
  resultStatus: null,
  reviewedQids: [],
  zeroQids: [],
  socratic: {},           // qid -> {question, step, answers:[]}
  reflections: [],
  answerStats: {},        // qid -> {keydown, pasted}
};

// ---------- Роутинг экранов ----------
const SCREENS = ['auth', 'levels', 'reader', 'result', 'reflection', 'approve', 'cabinet'];
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
            // Продолжение после разбивки: ставка уже задана в открытом attempt — валидация input не нужна (M2).
            await loadAttempt(lv.split.attempt_id);
          } else {
            const stake = parseInt(input.value, 10);
            if (!Number.isInteger(stake) || stake < 1 || stake > 100000) {
              input.style.borderColor = 'var(--red)';
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

// ---------- Экран 3: читалка ----------
let readTimer = null, readingActive = false;

async function loadAttempt(attemptId) {
  const r = await api('attempt-get', { __get: true, id: attemptId });
  S.attempt = r.attempt;
  // Вопросы — из ответа attempt-get (task-12). Fallback на DEPRECATED-копию только для старого бэка.
  let questions = Array.isArray(r.questions) && r.questions.length ? r.questions : null;
  if (!questions) {
    const all = LEVEL_QUESTIONS[S.attempt.level_id] || [];
    questions = (r.split && r.fragment)
      ? all.filter(q => q.fragment_ref === r.fragment.id || q.fragment_ref === 'whole')
      : all;
  } else if (r.split && questions.some(q => 'in_scope' in q)) {
    // Новый бэк: берём только вопросы зоны split-фрагмента (флаг in_scope).
    questions = questions.filter(q => q.in_scope !== false);
  }
  S.questions = questions;
  S.textPayload = r.text;       // строка (фактический контракт) или объект
  S.fragment = r.fragment || null;
  S.marks = null; S.zeroQids = []; S.socratic = {}; S.answerStats = {};
  // Resume: attempt уже прошёл review (перезагрузка страницы / возврат позже) —
  // marks лежат в attempt.marks_json, показываем сразу экран результата.
  let marksJson = null;
  try { marksJson = S.attempt.marks_json ? JSON.parse(S.attempt.marks_json) : null; } catch { marksJson = null; }
  if (marksJson && (S.attempt.status === 'socratic' || S.attempt.status === 'reflection')) {
    S.marks = marksJson;
    S.resultStatus = S.attempt.status;
    try { S.zeroQids = JSON.parse(S.attempt.zero_qids_json || '[]'); } catch { S.zeroQids = []; }
    S.reviewedQids = Object.keys(marksJson);
    renderResult();
    show('result');
    return;
  }
  renderReader();
  show('reader');
}

function readerTextString() {
  const t = S.textPayload;
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (Array.isArray(t.body)) return t.body.join('\n\n');
  return String(t.text || '');
}

function renderReader() {
  stopReading();
  const lv = S.levels.find(l => l.id === S.attempt.level_id) || {};
  $('#reader-title').textContent = S.fragment ? `Фрагмент: ${S.fragment.title || ''}` : (lv.text_title || 'Текст');
  $('#reader-rule').textContent = 'Правило: ' + (lv.rule || lv.kid_formulation || '');
  const textWrap = $('#reader-text');
  textWrap.innerHTML = '';
  if (S.fragment) {
    textWrap.append(el('div', 'reader-fragment-title', S.fragment.title || 'Фрагмент'));
  }
  textWrap.append(document.createTextNode(readerTextString()));

  // вкладки
  setReaderTab('text');

  // вопросы
  const qWrap = $('#reader-questions');
  qWrap.innerHTML = '';
  $('#answers-warning').classList.add('hidden');
  for (const q of S.questions) {
    const card = el('div', 'q-card');
    const qt = el('p', 'q-text', q.text);
    const ta = el('textarea', 'input');
    ta.dataset.qid = q.qid;
    ta.id = 'ans-' + q.qid;
    S.answerStats[q.qid] = { keydown: 0, pasted: false };
    ta.addEventListener('keydown', () => { S.answerStats[q.qid].keydown += 1; });
    ta.addEventListener('paste', (e) => {
      e.preventDefault();
      // Вставка заблокирована — текст в поле не попал, флаг pasted не ставим:
      // иначе честно напечатанный после предупреждения ответ останется «клеймённым».
      warn('Вставка не работает — напечатай ответ сам. Так честнее.');
    });
    ta.addEventListener('drop', (e) => { e.preventDefault(); });
    ta.addEventListener('dragover', (e) => e.preventDefault());
    const count = el('div', 'q-count', 'Напечатано символов с клавиатуры: 0');
    ta.addEventListener('input', () => { count.textContent = `Напечатано символов с клавиатуры: ${S.answerStats[q.qid].keydown}`; });
    const actions = el('div', 'q-actions');
    const hintBtn = el('button', 'btn btn-ghost', 'Подсказка');
    hintBtn.onclick = async () => {
      hintBtn.disabled = true;
      try {
        const r = await api('hint', { id: S.attempt.id, qid: q.qid });
        const box = card.querySelector('.q-hint') || el('div', 'q-hint');
        box.textContent = (r.hint && r.hint.text) || 'Подумай ещё немного.';
        if (!box.parentNode) card.append(box);
      } catch (ex) { notify(ex.message); }
      hintBtn.disabled = false;
    };
    actions.append(hintBtn, count);
    card.append(qt, ta, actions);
    qWrap.append(card);
  }
}

let warningTimer = null;
function warn(msg) {
  const w = $('#answers-warning');
  w.textContent = msg;
  w.classList.remove('hidden');
  clearTimeout(warningTimer);
  warningTimer = setTimeout(() => w.classList.add('hidden'), 5000);
}

function setReaderTab(tab) {
  $('#reader-tab-text').classList.toggle('active', tab === 'text');
  $('#reader-tab-questions').classList.toggle('active', tab === 'questions');
  $('#reader-text-pane').classList.toggle('hidden', tab !== 'text');
  $('#reader-questions-pane').classList.toggle('hidden', tab !== 'questions');
  if (tab === 'text') startReading(); else pauseReading();
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
  } else if (!$('#screen-reader').classList.contains('hidden') && !$('#reader-text-pane').classList.contains('hidden')) {
    startReading();
  }
});

async function submitAnswers() {
  const answers = [];
  let pastedWarn = false;
  for (const q of S.questions) {
    const ta = $('#ans-' + q.qid);
    const text = ta.value.trim();
    const st = S.answerStats[q.qid];
    if (!text) { warn('Заполни все ответы — даже коротко.'); ta.focus(); return; }
    if (st.pasted || (text.length > 40 && st.keydown < text.length * 0.9)) pastedWarn = true;
    answers.push({ qid: q.qid, text, keydown: st.keydown, pasted: !!st.pasted, t_answer: Date.now() });
  }
  if (pastedWarn && !confirm('Похоже, часть ответов вставлена, а не напечатана. Честные ответы — напечатанные. Точно отправить?')) return;
  const btn = $('#answers-submit');
  btn.disabled = true;
  try {
    stopReading();
    await api('attempt-answers', { id: S.attempt.id, answers });
    await runReview();
  } catch (ex) {
    notify(ex.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Экран 4: результат ----------
async function runReview() {
  const r = await api('review', { id: S.attempt.id });
  S.marks = r.marks || {};
  S.resultStatus = r.status || 'reflection';
  S.zeroQids = r.zero_qids || [];
  S.reviewedQids = r.reviewed_qids || S.questions.map(q => q.qid);
  renderResult();
  show('result');
}

function renderResult() {
  stopReading();
  const wrap = $('#result-cards');
  wrap.innerHTML = '';
  const qById = {};
  for (const q of S.questions) qById[q.qid] = q;
  const shown = S.reviewedQids.length ? S.reviewedQids : S.questions.map(q => q.qid);
  for (const qid of shown) {
    const q = qById[qid];
    if (!q) continue;
    const m = (S.marks && S.marks[qid]) || { mark: 0, explanation: '' };
    const card = el('div', 'result-card ' + (m.mark === 2 ? 'ok' : m.mark === 1 ? 'mid' : 'bad'));
    const head = el('div', 'result-head');
    const markEl = el('span', 'result-mark', m.mark === 2 ? '✅ Зачтено' : m.mark === 1 ? '➕ Почти' : '❌ Не зачтено');
    head.append(markEl, el('span', 'q-text', q.text.length > 90 ? q.text.slice(0, 90) + '…' : q.text));
    card.append(head);
    if (m.explanation) card.append(el('div', 'result-explain', m.explanation));
    if (m.mark === 0) card.append(renderSocraticBox(qid));
    wrap.append(card);
  }
  renderResultActions();
}

function renderResultActions() {
  const wrap = $('#result-actions');
  wrap.innerHTML = '';
  const remaining = S.zeroQids.filter(qid => !S.socratic[qid] || !S.socratic[qid].rewritten);
  if (S.resultStatus === 'socratic') {
    if (remaining.length) {
      wrap.append(el('p', 'pane-hint', 'Разбери вопросы с ❌ через «Давай подумаем» и перепиши ответы — потом проверим снова.'));
    } else {
      const btn = el('button', 'btn btn-primary btn-big', 'Проверить снова');
      btn.onclick = async () => {
        btn.disabled = true;
        try { await runReview(); } catch (ex) { notify(ex.message); btn.disabled = false; }
      };
      wrap.append(btn);
    }
    const next = el('button', 'btn btn-teal', 'Или: ещё один шаг подсказки (лестница)');
    next.onclick = async () => {
      next.disabled = true;
      try {
        const r = await api('next', { id: S.attempt.id });
        if (r.attempt) {
          await loadAttempt(r.attempt.id);
        } else {
          alert(`Шаг лестницы сделан (итерация ${r.iterations}). Можешь проверить ответы снова.`);
          renderResultActions();
        }
      } catch (ex) { notify(ex.message); }
      next.disabled = false;
    };
    wrap.append(next);
  } else if (S.resultStatus === 'reflection') {
    const btn = el('button', 'btn btn-primary btn-big', 'Дальше: три вопроса о прочитанном');
    btn.onclick = () => { renderReflection(); show('reflection'); };
    wrap.append(btn);
  }
}

function renderSocraticBox(qid) {
  const box = el('div', 'socratic-box');
  const state = S.socratic[qid] || (S.socratic[qid] = { answers: [] });

  if (!state.question) {
    const btn = el('button', 'btn btn-teal', 'Давай подумаем');
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await api('socratic-ask', { id: S.attempt.id, qid });
        state.question = r.question;
        state.step = r.step;
        rerender();
      } catch (ex) { notify(ex.message); btn.disabled = false; }
    };
    box.append(btn);
  } else {
    box.append(el('div', 'socratic-q', state.question));
    const ta = el('textarea', 'input');
    ta.placeholder = 'Напиши тут, что думаешь…';
    box.append(ta);
    const row = el('div', 'q-actions');
    const send = el('button', 'btn btn-teal', 'Ответить');
    send.onclick = async () => {
      const text = ta.value.trim();
      if (!text) return;
      send.disabled = true;
      try {
        await api('socratic-answer', { id: S.attempt.id, qid, text });
        state.answers.push({ step: state.step, text });
        ta.value = '';
        rerender();
      } catch (ex) { notify(ex.message); send.disabled = false; }
    };
    row.append(send);
    if (!state.rewritten) {
      const rewrite = el('button', 'btn btn-primary', 'Переписать ответ');
      rewrite.onclick = () => {
        const rw = el('textarea', 'input');
        rw.placeholder = 'Новый ответ на вопрос — своими словами, целиком…';
        let kd = 0;
        rw.addEventListener('keydown', () => { kd += 1; });
        const save = el('button', 'btn btn-primary', 'Сохранить новый ответ');
        save.onclick = async () => {
          const text = rw.value.trim();
          if (!text) return;
          save.disabled = true;
          try {
            await api('attempt-answers', {
              id: S.attempt.id,
              answers: [{ qid, text, keydown: kd, pasted: false, t_answer: Date.now() }],
            });
            state.rewritten = true;
            rerender();
          } catch (ex) { notify(ex.message); save.disabled = false; }
        };
        box.append(rw, save);
        rewrite.disabled = true;
      };
      row.append(rewrite);
    }
    box.append(row);
    if (state.answers.length) {
      const hist = el('div', 'socratic-history');
      state.answers.forEach((a, i) => hist.append(el('div', null, `Шаг ${a.step}: ${a.text}`)));
      box.append(hist);
    }
    if (state.rewritten) box.append(el('div', 'socratic-history', 'Новый ответ сохранён.'));
  }

  function rerender() {
    const fresh = renderSocraticBox(qid);
    box.replaceWith(fresh);
    renderResultActions();
  }
  return box;
}

// ---------- Экран 5: рефлексия ----------
function renderReflection() {
  const wrap = $('#reflection-list');
  wrap.innerHTML = '';
  $('#reflection-warning').classList.add('hidden');
  for (const q of REFLECTION_QUESTIONS) {
    const card = el('div', 'q-card refl-card');
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
    if (text.length < 2) { alert('Ответь на все три вопроса — хоть парой слов.'); ta.focus(); return; }
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
          const note = el('div', 'result-explain', 'Проверяльщик: ' + m.explanation);
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
  const colors = ['#2f7cf6', '#14b8a6', '#7c5cf0', '#f5a623', '#ef4b5e'];
  for (let i = 0; i < 80; i++) {
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
        const link = el('a', 'btn btn-ghost', 'Прочитать целиком');
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
// Единый баннер сообщений (task-12): вместо alert() — полоска сверху, сама прячется.
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

// 401 из api(): токен протух — чистим сессию и показываем вход с пояснением.
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
  $('#reader-tab-text').onclick = () => setReaderTab('text');
  $('#reader-tab-questions').onclick = () => setReaderTab('questions');
  $('#answers-submit').onclick = submitAnswers;
  $('#reflection-submit').onclick = submitReflection;
  $('#approve-to-cabinet').onclick = openCabinet;
  $('#nav-levels').onclick = openLevels;
  $('#nav-cabinet').onclick = openCabinet;
  $('#nav-logout').onclick = logout;
  if (localStorage.getItem(TOKEN_KEY)) openLevels();
  else show('auth');
}

document.addEventListener('DOMContentLoaded', init);
