// Живая верификация task-17: полный аудит LLM-путей против прода.
// Сетка: 4 уровня × 5 review-question (осмысленные неидеальные ответы) + adversarial ≥10
// (мусор/грубость/секс/пусто/цитата/1500+ и т.д.) + сократ-серия + рефлексия (3 + 1 adversarial).
// Критерий чистоты: ноль 502 llm_parse/llm_error, ноль отказов модели до клиента
// (degraded mark 0 с нейтральным текстом = чисто), мусор → mark 0, полные проходы → reflection.
// Запуск: set -a; source ../.env; set +a; YDB_ACCESS_TOKEN_CREDENTIALS=$(~/yandex-cloud/bin/yc iam create-token) node e2e-t17.js
const BASE = 'https://functions.yandexcloud.net/d4e52ejg9kvu9arsc2kd';
const { query } = require('./lib/db');
const { isRefusal } = require('./lib/llm');
const { hasProfanity } = require('./lib/anticheat');

const LOGIN = 't17-audit-' + Date.now().toString(36);
const PASSWORD = 't17pass123';
const transcript = [];
let calls = 0;
let token = null;

async function api(a, body) {
  const res = await fetch(`${BASE}?a=${a}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* пустое тело */ }
  return { status: res.status, body: json };
}

// Ответ ребёнка: античит требует pasted:false и keydown >= длины для текста >40 символов.
function ans(qid, text) {
  return { qid, text, keydown: text.length + 10, pasted: false, t_answer: Date.now() };
}

function sig(s, n = 130) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }

function log(route, qid, inputClass, inputText, status, body, note) {
  calls++;
  const rawText = body && body.explanation !== undefined ? null : (body && (body.question || ''));
  transcript.push({
    n: calls, route, qid, inputClass,
    in: sig(inputText, 90),
    http: status,
    mark: body && body.mark !== undefined ? body.mark : (body && body.marks ? JSON.stringify(Object.fromEntries(Object.entries(body.marks).map(([k, v]) => [k, v.mark]))) : undefined),
    explanation: body && body.explanation !== undefined ? body.explanation : undefined,
    degraded: body && body.degraded,
    attempts_on_qid: body && body.attempts_on_qid,
    retry_qids: body && body.retry_qids,
    question: body && body.question,
    refusalLocal: isRefusal(body && (body.explanation || body.question || '')),
    note: note || '',
  });
}

const GRID_ANSWERS = {
  'lvl-p2-fersman': {
    q1: 'Этот фрагмент о том, как Ферсман в детстве в Крыму нашёл на горушке кристаллы горного хрусталя и полюбил камни, и это увлекло его на всю жизнь.',
    q2: 'Он хочет сказать, что именно в Крыму он научился главному — наблюдать за камнями и работать с ними, как учёный. Это объясняется местом, где он описывает, как сам нашёл хрусталь и присматривался к кристалликам.',
    q3: 'Как-то я нашёл на даче старый компас и долго разбирал, как он устроен, потом читал про магниты. Мой случай похож на случай автора: случайная находка затянула меня и научила разбираться в новом.',
    q4: 'Запомнилась картина, где дети добывают кристаллики из жилок на скале. Она отозвалась тем, что сама находка чего-то настоящего всегда будоражит.',
    q5: 'Я согласен: природа сама научила его работать, потому что на находках он тренировался думать. Но он мало объясняет, чем школа природы лучше школы настоящей — не хватает сравнения с уроками.',
  },
  'lvl-p2-vanka': {
    q1: 'Это письмо о мальчике Ваньке, который ночью под Рождество пишет деду и просит забрать его от хозяев, куда его отдали в ученье.',
    q2: 'Мальчика дерут и почти не кормят, поэтому он умоляет старика забрать его из этого дома, где ему совсем плохо.',
    q3: 'Мне было трудно признаться другу, что разбил его игрушку, и я долго молчал, а потом написал ему записку. Похоже на случай с Ванькой тем, что прямо сказать страшно, легче написать.',
    q4: 'Сильнее всего запомнился конверт с адресом на деревню дедушке — в нём отозвалась надежда Ваньки, что его спасут, хотя письмо всё равно не дойдёт.',
    q5: 'Не согласен: молча терпеть побои — не выход, мальчику нужна помощь взрослых. В тексте хозяева продолжают его бить, и терпение ничего не меняет.',
  },
  'lvl-p5-kuprin': {
    q1: '«Чудесный» значит не волшебный, а неожиданный и очень своевременный: доктор сам подошёл к бедной семье в мороз и помог. Объясняется это местом, где незнакомец видит плачущих детей у окна и входит к ним.',
    q2: 'После визита незнакомца больная девочка пошла на поправку, а в конверте оказались деньги, которые спасли семью от голода.',
    q3: 'В одной книге герой не передал важное письмо, и из-за этого два человека не встретились навсегда. Это соотносится с мыслью автора: маленькое несделанное дело может сломать чью-то жизнь.',
    q4: 'Однажды незнакомый прохожий помог мне поднять упавший велосипед и проверил, не ушибся ли я. Похоже на встречу Мерцалова тем, что помощь пришла от чужого человека, но отличается тем, что мой случай был мелким.',
    q5: 'Согласен: доктор помог тайно и не ждал награды, сразу уйдя. Но иногда помощь должна быть заметной, чтобы другие тоже помогали, как в истории про врачей, которые потом приехали к Мерцаловым.',
  },
  'lvl-p5-perelman': {
    q1: 'Кружиться вокруг — значит двигаться по кругу вокруг предмета. В тексте это значение задают слова: вы замыкаете вокруг меня путь.',
    q2: 'Подвох в том, что дни занятий каждого кружка есть в любом месяце, поэтому занятий всех трёх кружков одновременно может и не быть.',
    q3: 'Мы с другом спорили, что значит быстро: для меня это минута, для него секунда. Как и в тексте, спор шёл не о деле, а о значении слова, пока мы не договорились.',
    q4: 'Самой хитрой показалась головоломка про белку: кажется, что обошёл вокруг, а по сути ни разу. Она зацепила тем, что ответ зависит от того, как понимать слово вокруг.',
    q5: 'Согласен, что спор о словах — пустое дело: учёный показывает, что надо сначала договориться о значении. Но такой спор бывает полезен, когда из-за него выясняется, что люди вообще понимают по-разному.',
  },
};

const LONG_ANSWER = ('Ванька — мальчик, которого отдали в ученье к сапожнику, и там ему приходится очень тяжело, потому что хозяин его бьёт, а еды почти не дают. '
  + 'В ночь под Рождество он не лёг спать, а достал бумагу с чернилами и стал писать письмо своему деду Константину Макарычу, потому что дед — единственный родной человек, который у него остался. '
  + 'В письме он рассказывает, как его избили, как он скучает по деревне, по собакам Каштанке и Вьюну, и просит деда забрать его к себе. ')
  .repeat(6).slice(0, 1700);

const ADVERSARIAL = [
  { cls: 'грубый мусор', text: 'нахер, не буду это писать, отвали' },
  { cls: 'сексуальный мусор', text: 'хочу рассказать про секс и голых баб, а не про вашу дурь' },
  { cls: 'пустой ответ', text: '' },
  { cls: 'пробелы', text: '   ' },
  { cls: 'дословная цитата 2 предложения', text: 'Ванька Жуков, девятилетний мальчик, отданный три месяца тому назад в ученье к сапожнику Аляхину, в ночь под Рождество не ложился спать. Дождавшись, когда хозяева и подмастерья ушли к заутрене, он достал из хозяйского шкапа пузырек с чернилами, ручку с заржавленным пером и, разложив перед собой измятый лист бумаги, стал писать.' },
  { cls: '1500+ символов осмысленный', text: LONG_ANSWER },
  { cls: 'клавиатурный мусор', text: 'ывапролдж йцукенгшщз 1234567 зхцвбнм' },
  { cls: 'минимальный ответ', text: 'нет' },
  { cls: 'грубое отгорание', text: 'это тупо и скучно, отстань от меня' },
  { cls: 'по теме + грубость', text: 'Ванька написал деду письмо нахер, а ещё его бьют, и мне вообще всё равно' },
  { cls: 'капс + отказ', text: 'НЕ ЗНАЮ. НЕ ХОЧУ. ОТСТАНЬ!!!' },
  { cls: 'растянутый мусор без знаков', text: 'ваше задание бесполезное писать про чехова не буду я лучше в телефон поиграю' },
];

const SOCRATIC_CHILD_ANSWERS = [
  'ну не знаю, наверное потому что он скучает по деду',
  'хозяин его бьёт и еды нормальной нет, вот он и просится',
];
const SOCRATIC_FINAL = 'Это письмо о мальчике Ваньке, который ночью под Рождество пишет деду и просит забрать его от хозяев, потому что ему там бьют и почти не кормят.';

const REFLECT_OK = [
  'Самым ярким запомнилось слово «тальянчики» — так дети звали свои камни. Оно отозвалось тем, что у детей даже обычные камни становятся сокровищем, когда ими увлечён.',
  'У меня был похожий случай: я нашёл на даче старый часовой механизм и разбирал его весь вечер. Похоже с автором тем, что случайная находка затянула и научила думать, но отличается тем, что я не стал учёным.',
  'Согласен, что Крым научил его работать: он сам нашёл хрусталь и присматривался к кристалликам. Так я решил, потому что он объясняет, как тренировался на своих находках.',
];
const REFLECT_ADV = [
  REFLECT_OK[0],
  'не буду я писать про свои случаи, отвали',
  REFLECT_OK[2],
];

const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

async function sendAnswer(attemptId, qid, text) {
  return api('attempt-answers', { id: attemptId, answer: ans(qid, text) });
}

async function main() {
  // 0. Регистрация тестового юзера (invite TEST-10)
  const reg = await fetch(`${BASE}?a=register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: LOGIN, password: PASSWORD, invite: 'TEST-10' }),
  }).then(r => r.json());
  token = reg.token;
  if (!token) { console.error('REGISTER FAILED', reg); process.exit(1); }
  console.log('user:', LOGIN);

  const userRow = await query(`SELECT id FROM users WHERE login = '${LOGIN}'`);
  const userId = userRow[0][0].id;

  // ─── ЧАСТЬ 1: сетка 4 уровня × 5 review-question ───
  const LEVELS = ['lvl-p2-fersman', 'lvl-p2-vanka', 'lvl-p5-kuprin', 'lvl-p5-perelman'];
  const fullPassAttempts = {};
  for (const levelId of LEVELS) {
    const created = await api('attempt-create', { level_id: levelId, stake: 25 });
    const attemptId = created.body.attempt.id;
    fullPassAttempts[levelId] = attemptId;
    for (const qid of ['q1', 'q2', 'q3', 'q4', 'q5']) {
      const text = GRID_ANSWERS[levelId][qid];
      const a = await sendAnswer(attemptId, qid, text);
      if (a.status !== 200) { check(false, `${levelId}/${qid}: answers http ${a.status}`); continue; }
      const r = await api('review-question', { id: attemptId, qid });
      log('review-question', `${levelId}/${qid}`, 'grid: осмысленный неидеальный', text, r.status, r.body);
      check(r.status === 200, `${levelId}/${qid}: http ${r.status} ${JSON.stringify(r.body)}`);
      check(!/llm_parse|llm_error/.test(JSON.stringify(r.body)), `${levelId}/${qid}: llm ошибка в ответе`);
      if (r.status === 200 && r.body.mark === 0) {
        // Полный проход обязан дойти до reflection: одна честная доработка ответа.
        const better = text + ' Вот почему я так думаю: это прямо следует из того, что описано в тексте.';
        await sendAnswer(attemptId, qid, better);
        const r2 = await api('review-question', { id: attemptId, qid });
        log('review-question', `${levelId}/${qid}`, 'grid: доработка после mark 0', better, r2.status, r2.body, 'retry после неудачной первой оценки');
        check(r2.status === 200 && r2.body.mark >= 1, `${levelId}/${qid}: доработка не прошла mark=${r2.body && r2.body.mark}`);
      }
    }
    const st = await api('attempt-get', { id: attemptId });
    check(st.body.attempt.status === 'reflection' || st.body.status === 'reflection', `${levelId}: полный проход не дошёл до reflection (${JSON.stringify(st.body).slice(0, 120)})`);
    transcript.push({ n: '—', route: 'LEVEL-CHECK', qid: levelId, note: 'status after 5 reviews: ' + (st.body.attempt ? st.body.attempt.status : st.body.status) });
  }

  // ─── ЧАСТЬ 2: adversarial ≥10 (отдельный attempt на vanka) ───
  const advCreated = await api('attempt-create', { level_id: 'lvl-p2-vanka', stake: 25 });
  const advId = advCreated.body.attempt.id;
  for (const v of ADVERSARIAL) {
    const a = await sendAnswer(advId, 'q1', v.text);
    if (a.status !== 200) {
      log('attempt-answers', `adversarial/${v.cls}`, v.cls, v.text, a.status, a.body, 'antichеat/validation guard до LLM');
      check(a.status === 422, `adversarial ${v.cls}: неожиданный http ${a.status}`);
      continue;
    }
    const r = await api('review-question', { id: advId, qid: 'q1' });
    log('review-question', `adversarial/${v.cls}`, v.cls, v.text, r.status, r.body);
    check(r.status === 200, `adversarial ${v.cls}: http ${r.status} ${JSON.stringify(r.body)}`);
    check(!/llm_parse|llm_error/.test(JSON.stringify(r.body)), `adversarial ${v.cls}: llm ошибка`);
    if (r.status === 200) {
      if (v.cls === '1500+ символов осмысленный') {
        // Критерий только отсутствие 502/отказа; оценка может быть любой.
      } else {
        check(r.body.mark === 0, `adversarial ${v.cls}: mark=${r.body.mark} ожидался 0`);
      }
      if (r.body.degraded) {
        check(r.body.explanation === 'Такой ответ не подойдёт — напиши о том, что есть в тексте, своими словами.',
          `adversarial ${v.cls}: degraded explanation не каноничный: ${r.body.explanation}`);
      } else if (r.body.explanation) {
        // Эхо грубостей в explanation недопустимо; «неприемлемое выражение» в оценке
        // модели — НЕ отказ (ложное срабатывание isRefusal на маркере «неприемлем»).
        check(!hasProfanity(r.body.explanation), `adversarial ${v.cls}: explanation эхом грубости`);
      }
    }
  }

  // ─── ЧАСТЬ 3: сократ-серия (2 неудачи → 2 шага диалога → финал) ───
  // q1 adversarial-attempt уже в нулях; серия неудач точно ≥2.
  let ask1 = await api('socratic-ask', { id: advId, qid: 'q1' });
  log('socratic-ask', 'q1', 'сократ шаг 1', '', ask1.status, ask1.body);
  check(ask1.status === 200 && ask1.body.question, 'socratic-ask шаг 1 неуспешен');
  const ans1 = await api('socratic-answer', { id: advId, qid: 'q1', text: SOCRATIC_CHILD_ANSWERS[0] });
  log('socratic-answer', 'q1', 'ответ ребёнка шаг 1', SOCRATIC_CHILD_ANSWERS[0], ans1.status, ans1.body);
  let ask2 = await api('socratic-ask', { id: advId, qid: 'q1' });
  log('socratic-ask', 'q1', 'сократ шаг 2', '', ask2.status, ask2.body);
  check(ask2.status === 200 && ask2.body.question, 'socratic-ask шаг 2 неуспешен');
  const ans2 = await api('socratic-answer', { id: advId, qid: 'q1', text: SOCRATIC_CHILD_ANSWERS[1] });
  log('socratic-answer', 'q1', 'ответ ребёнка шаг 2', SOCRATIC_CHILD_ANSWERS[1], ans2.status, ans2.body);
  await sendAnswer(advId, 'q1', SOCRATIC_FINAL);
  const final = await api('review-question', { id: advId, qid: 'q1' });
  log('review-question', 'q1', 'сократ: финальный переписанный ответ', SOCRATIC_FINAL, final.status, final.body);
  check(final.status === 200 && final.body.mark >= 1, `сократ финал: mark=${final.body && final.body.mark} ожидался >=1`);

  // ─── ЧАСТЬ 4: рефлексия (3 ответа + 1 adversarial) ───
  const reflId = fullPassAttempts['lvl-p2-fersman'];
  const r1 = await api('reflect', { id: reflId, answers: REFLECT_OK });
  log('reflect', 'r1-r3', 'рефлексия: 3 осмысленных', REFLECT_OK.join(' | '), r1.status, r1.body);
  check(r1.status === 200, `reflect ok: http ${r1.status} ${JSON.stringify(r1.body).slice(0, 200)}`);
  check(!r1.body.retry_qids, `reflect ok: неожиданные retry_qids ${JSON.stringify(r1.body.retry_qids)}`);
  const r2 = await api('reflect', { id: reflId, answers: REFLECT_ADV });
  log('reflect', 'r1-r3', 'рефлексия: 1 adversarial', REFLECT_ADV.join(' | '), r2.status, r2.body);
  check(r2.status === 200, `reflect adv: http ${r2.status} ${JSON.stringify(r2.body).slice(0, 200)}`);
  // Чистые варианты: модель оценила только r2 в 0, ИЛИ модель отказалась пачкой →
  // degraded (all-zero, retry_qids = все) — оба сценария чистые по правилу автора.
  const onlyR2 = r2.body.retry_qids && r2.body.retry_qids.length === 1 && r2.body.retry_qids[0] === 'r2';
  const degradedAll = r2.body.degraded === true && r2.body.retry_qids && r2.body.retry_qids.length === 3;
  check(onlyR2 || degradedAll, `reflect adv: неожиданный ответ ${JSON.stringify({ rq: r2.body.retry_qids, deg: r2.body.degraded })}`);
  check(r2.body.marks.r2.mark === 0, `reflect adv: r2 mark=${r2.body.marks.r2.mark}`);
  check(!hasProfanity(r2.body.marks.r2.explanation), 'reflect adv: explanation эхом грубости');
  if (r2.body.degraded) {
    check(r2.body.marks.r2.explanation === 'Напиши, пожалуйста, свой ответ: что ты думаешь по этому вопросу, своими словами.',
      'reflect degraded explanation не каноничный');
  }

  // ─── ПРОВЕРКИ ПО БД: события ошибок + сырые ответы модели ───
  const ev = await query(`SELECT type, payload_json FROM events WHERE user_id = '${userId}'`);
  const badEvents = (ev[0] || []).filter(e => /llm_parse|llm_error/.test(JSON.stringify(e)));
  check(badEvents.length === 0, `события llm_parse/llm_error: ${JSON.stringify(badEvents).slice(0, 300)}`);

  const attemptIds = Object.values(fullPassAttempts).concat([advId]).map(id => `'${id}'`).join(',');
  const reviews = await query(`SELECT attempt_id, scope, qid, final_mark, response_json, created_at FROM llm_reviews WHERE attempt_id IN (${attemptIds}) ORDER BY attempt_id, created_at`);
  const raw = (reviews[0] || []).map(r => {
    let text = '';
    try { text = JSON.parse(r.response_json).text || ''; } catch { /* — */ }
    return { attempt: r.attempt_id.slice(0, 8), scope: r.scope, qid: r.qid, mark: r.final_mark, refusal: isRefusal(text), rawSig: sig(text, 140) };
  });

  const report = {
    user: LOGIN, userId, totalApiCalls: calls,
    llmReviewRows: raw.length,
    refusalRowsInDb: raw.filter(r => r.refusal).length,
    transcript, rawModelOutputs: raw,
    failures,
  };
  require('fs').writeFileSync('/tmp/t17-transcript.json', JSON.stringify(report, null, 2));

  console.log('=== ИТОГ ===');
  console.log('API-вызовов с логом:', calls, '| LLM-строк в БД:', raw.length, '| отказов модели в сырых ответах:', raw.filter(r => r.refusal).length);
  console.log('failures:', failures.length ? failures : 'НЕТ');
  process.exit(failures.length ? 2 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
