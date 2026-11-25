const STORAGE_KEY = 'shiheng-demo-v1';
const STATIC_PUBLIC_SITE = document.documentElement.dataset.publicDemo === 'true';
const DEFAULT_PROFILE = {
  name: '小周', weight: 68.4, target: 64, bodyfat: 22.5, targetBodyfat: 19.5,
  heightCm: null, age: null, energySex: '', activityLevel: '', budget: 22, scene: 'campus', goalType: 'daily',
  universityName: '上海外国语大学', campusName: '松江校区'
};
const PROFILE_GOAL_SCHEMA_VERSION = 2;
const PROFILE_GOALS = ['daily', 'muscle_gain', 'fat_loss', 'weight_loss'];

function normalizeGoalType(value, schemaVersion = PROFILE_GOAL_SCHEMA_VERSION) {
  if (schemaVersion < PROFILE_GOAL_SCHEMA_VERSION) {
    if (value === 'maintain' || value === 'fitness') return 'daily';
  }
  return PROFILE_GOALS.includes(value) ? value : 'daily';
}

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const SCENE_NAMES = { campus: '校园搭配样例', convenience: '便利店', market: '超市自选' };
const SCENE_LONG = { campus: '校内食堂', convenience: '便利店', market: '超市自选' };
let foods = [];
let sourcedFoods = [];
let exerciseCatalog = [];
let sisuMenuCatalog = null;
let campusDirectory = null;
let universityDirectory = null;
let toastTimer;
let pageUnitObserver = null;
let selectedMealImage = null;
let activeNutritionResult = null;
let nutritionBaseItems = [];
let assistantBusy = false;
let assistantMascotMoodTimer = null;
let welcomeMascotReactionTimer = null;
let assistantConversationHistory = [];
let assistantTextProvider = 'qwen';
let guidedClockInterval = null;
let localDemoMode = STATIC_PUBLIC_SITE;
let agentServiceMode = 'checking';
let agentLastRunMode = 'not_run';
let nearbyPlaces = [];
let campusMenuSearch = '';
let campusMenuMaxPrice = null;
let campusMenuBudgetTouched = false;

const TRAINING_FOCUS_LABELS = {
  full: '全身基础', lower: '臀腿综合', upper: '上肢综合', chest: '胸部', back: '背部', shoulders: '肩部', legs: '腿部', glutes: '臀部', core: '核心稳定', cardio: '低冲击有氧',
  running: '跑步 / 跑走交替', gym: '健身房力量', recovery: '轻松恢复'
};
const EXERCISE_FOCUS_LABELS = {
  warmup: '热身', lower: '臀腿', upper: '上肢', chest: '胸部', back: '背部', shoulders: '肩部', legs: '腿部', glutes: '臀部', core: '核心稳定', cardio: '低冲击有氧',
  running: '跑步', gym: '健身房', recovery: '恢复', cooldown: '放松'
};
const { extractIntentLocally, validateClientIntent, mergeIntents, parsePlanResponse } = window.ShiHengPlanIntent;

function freshState() {
  return {
    goalSchemaVersion: PROFILE_GOAL_SCHEMA_VERSION,
    profile: { ...DEFAULT_PROFILE }, scene: DEFAULT_PROFILE.scene, budget: DEFAULT_PROFILE.budget,
    campusId: 'sisu-songjiang',
    profileOnboardingDone: false, profileOnboardingDismissed: true,
    completedDays: ['一', '二'],
    trainingFocus: 'full', trainingEquipment: 'bodyweight', trainingDuration: 25, trainingVariant: 0,
    trainingSessionDate: dateKey(new Date()), trainingSessionId: makeTrainingSessionId(), exerciseLogs: [],
    activeWorkout: null,
    trainingPlanItems: null, exerciseLibraryFocus: 'all', exerciseSearch: '',
    trainingLogs: makeDemoTrainingLogs(),
    foodSceneFilter: 'campus', foodSearch: '', proteinFocus: false, vegetarianOnly: false,
    localMenuRecords: [],
    selectedFoodId: null,
    energyTarget: 2000, energyMode: 'auto',
    manualExerciseKcal: {},
    recipeIngredients: [
      { foodId: 'cnfc-287', grams: 150 },
      { foodId: 'cnfc-336', grams: 100 },
      { foodId: 'cnfc-405', grams: 80 }
    ],
    mealLogs: [],
    weightLog: [
      { label: '上周五', value: 69.0, note: '演示记录' },
      { label: '周一', value: 68.7, note: '演示记录' },
      { label: '今天', value: 68.4, note: '演示记录' }
    ],
    lastAdjustment: 'default'
  };
}

const MENU_SCENE_VALUES = {
  campus: 'campus', '校内': 'campus', '校内食堂': 'campus', '校园食堂': 'campus', '食堂': 'campus',
  convenience: 'convenience', '便利店': 'convenience', '校内便利店': 'convenience', '校园便利店': 'convenience',
  market: 'market', '超市': 'market', '超市自选': 'market'
};
const MENU_SCENE_LABELS = { campus: '校内食堂', convenience: '便利店', market: '超市' };
const MENU_RECOMMENDATION_MAX_AGE_DAYS = 30;

function normalizeMenuScene(value) {
  return MENU_SCENE_VALUES[String(value || '').trim()] || '';
}

function optionalMenuNumber(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? Math.round(number * 10) / 10 : null;
}

function cleanMenuText(value, maxLength = 300) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function normalizedCampusText(value) {
  return cleanMenuText(value, 80).replace(/[\s　]+/g, '').toLowerCase();
}

function isSisuSchoolName(school) {
  const key = normalizedCampusText(school).replace(/[()（）]/g, '');
  return new Set([
    '上海外国语大学',
    '上海外国语大学松江校区',
    '上外',
    '上外松江校区',
    'shanghaiinternationalstudiesuniversity',
    'shanghaiinternationalstudiesuniversitysongjiangcampus'
  ]).has(key);
}

function makeCustomCampusId(school, campus) {
  const key = `${normalizedCampusText(school)}\u0000${normalizedCampusText(campus)}`;
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `custom-${(hash >>> 0).toString(36)}`;
}

function campusById(campusId) {
  return campusDirectory?.campuses?.find((campus) => campus.id === campusId) || null;
}

function resolveCampusId(school, campusName) {
  const schoolKey = normalizedCampusText(school);
  const campusKey = normalizedCampusText(campusName);
  const match = campusDirectory?.campuses?.find((entry) => normalizedCampusText(entry.school) === schoolKey
    && normalizedCampusText(entry.campus) === campusKey);
  return match?.id || makeCustomCampusId(school, campusName);
}

function campusProfileLabel(campusId = state.campusId) {
  const directoryEntry = campusById(campusId);
  if (directoryEntry) return { school: directoryEntry.school, campus: directoryEntry.campus, label: directoryEntry.label };
  const school = cleanMenuText(state.profile?.universityName, 80);
  const campusName = cleanMenuText(state.profile?.campusName, 80);
  if (school && makeCustomCampusId(school, campusName) === campusId) {
    return { school, campus: campusName, label: campusName ? `${school} · ${campusName}` : school };
  }
  return null;
}

function schoolContextForProfile(school) {
  if (isSisuSchoolName(school)) return { campusId: 'sisu-songjiang', campusName: '松江校区' };
  const previousSchool = cleanMenuText(state.profile?.universityName, 80);
  if (state.profileOnboardingDone && previousSchool && normalizedCampusText(previousSchool) === normalizedCampusText(school)) {
    const campusName = cleanMenuText(state.profile.campusName, 80);
    const currentCampus = campusById(state.campusId);
    const currentCampusMatches = currentCampus && normalizedCampusText(currentCampus.school) === normalizedCampusText(school);
    const currentCustomIdMatches = !currentCampus && state.campusId === makeCustomCampusId(school, campusName);
    if (currentCampusMatches || currentCustomIdMatches) return { campusId: state.campusId, campusName };
  }
  const schoolKey = normalizedCampusText(school);
  const aliases = new Map([
    ['上外', normalizedCampusText('上海外国语大学')],
    ['shanghaiinternationalstudiesuniversity', normalizedCampusText('上海外国语大学')]
  ]);
  const canonicalSchool = aliases.get(schoolKey) || schoolKey;
  const knownCampuses = (campusDirectory?.campuses || []).filter((entry) => normalizedCampusText(entry.school) === canonicalSchool);
  if (knownCampuses.length === 1) {
    return { campusId: knownCampuses[0].id, campusName: knownCampuses[0].campus };
  }
  return { campusId: makeCustomCampusId(school, ''), campusName: '' };
}

function refreshCampusSuggestions(schoolInput) {
  const schoolList = document.getElementById('campusSchoolSuggestions');
  if (!schoolList) return;
  const entries = campusDirectory?.campuses || [];
  const query = normalizedCampusText(schoolInput?.value);
  const schools = [...new Set([...entries.map((entry) => entry.school), ...(universityDirectory?.schools || [])])];
  const matches = query ? schools.filter((school) => normalizedCampusText(school).includes(query)) : schools;
  schoolList.innerHTML = matches.slice(0, 80).map((school) => `<option value="${escapeHTML(school)}"></option>`).join('');
}

function normalizeLocalMenuRecord(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const id = cleanMenuText(row.id, 80);
  const name = cleanMenuText(row.name, 80);
  const collectedOn = cleanMenuText(row.collectedOn, 10);
  const scene = normalizeMenuScene(row.scene);
  const price = optionalMenuNumber(row.price, 0, 5000);
  const collectedDate = Date.parse(`${collectedOn}T00:00:00Z`);
  if (!id || !name || !scene || !/^\d{4}-\d{2}-\d{2}$/.test(collectedOn)
    || !Number.isFinite(collectedDate) || new Date(collectedDate).toISOString().slice(0, 10) !== collectedOn || price === null) return null;
  const tags = Array.isArray(row.tags) ? row.tags : String(row.tags || '').split(/[;；|]/);
  const allowedTags = new Set(['vegetarian', 'high-protein', 'balanced', 'quick']);
  const tagMap = { '素食': 'vegetarian', '植物性': 'vegetarian', '高蛋白': 'high-protein', '均衡': 'balanced', '便捷': 'quick' };
  return {
    id, name, scene, campusId: /^[a-z0-9-]{2,64}$/.test(String(row.campusId || '')) ? String(row.campusId) : '',
    schoolName: cleanMenuText(row.schoolName, 80), campusName: cleanMenuText(row.campusName, 80),
    collectedOn, venue: cleanMenuText(row.venue, 100), price,
    priceUnit: cleanMenuText(row.priceUnit, 24) || '每份',
    portionG: optionalMenuNumber(row.portionG, 1, 10000),
    priceEvidence: cleanMenuText(row.priceEvidence, 60), priceSource: cleanMenuText(row.priceSource, 500),
    kcal: optionalMenuNumber(row.kcal, 0, 10000), carbs: optionalMenuNumber(row.carbs, 0, 2000),
    protein: optionalMenuNumber(row.protein, 0, 2000), fat: optionalMenuNumber(row.fat, 0, 2000),
    nutritionBasis: cleanMenuText(row.nutritionBasis, 160), nutritionEvidence: cleanMenuText(row.nutritionEvidence, 500),
    nutritionUrl: /^https?:\/\//i.test(String(row.nutritionUrl || '')) ? cleanMenuText(row.nutritionUrl, 500) : '',
    allergens: cleanMenuText(row.allergens, 200), onSale: row.onSale === true,
    reviewStatus: ['已复核', '已核验'].includes(cleanMenuText(row.reviewStatus, 20)) ? '已复核' : cleanMenuText(row.reviewStatus, 20) === '不采用' ? '不采用' : '待复核',
    tags: [...new Set(tags.map((tag) => tagMap[cleanMenuText(tag, 24)] || cleanMenuText(tag, 24)).filter((tag) => allowedTags.has(tag)))].slice(0, 4),
    notes: cleanMenuText(row.notes, 300)
  };
}

function sanitizeLocalMenuRecords(rows) {
  return Array.isArray(rows) ? rows.map(normalizeLocalMenuRecord).filter(Boolean).slice(-200) : [];
}

function localMenuAgeDays(record) {
  const collected = Date.parse(`${record.collectedOn}T00:00:00Z`);
  // Use the app's local calendar date; UTC would lag China time until 08:00.
  const today = Date.parse(`${dateKey(new Date())}T00:00:00Z`);
  return Math.floor((today - collected) / 86400000);
}

function localMenuRecommendationStatus(record) {
  if (record.reviewStatus === '不采用') return '团队标记为不采用';
  if (record.reviewStatus !== '已复核') return '待团队复核';
  if (!record.onSale) return '采集时未确认在售';
  if (localMenuAgeDays(record) < 0) return '采集日期晚于今天';
  if (localMenuAgeDays(record) > MENU_RECOMMENDATION_MAX_AGE_DAYS) return '超过30天，需更新核价';
  if (!record.priceEvidence || !record.priceSource || /估算|样例/i.test(`${record.priceEvidence} ${record.priceSource}`)) return '缺少可查的价格证据';
  if ([record.kcal, record.carbs, record.protein, record.fat].some((value) => value === null)
    || !record.nutritionBasis || (!record.nutritionEvidence && !record.nutritionUrl)) return '营养数据或来源不完整';
  return '可进入个性化推荐';
}

function recommendableLocalFoods() {
  return sanitizeLocalMenuRecords(state.localMenuRecords).filter((record) => record.campusId === state.campusId && localMenuRecommendationStatus(record) === '可进入个性化推荐').map((record) => ({
    id: `local-menu-${record.id}`, name: record.name, scene: record.scene, sceneName: `${MENU_SCENE_LABELS[record.scene]}记录`,
    price: record.price, emoji: record.scene === 'campus' ? '🍱' : record.scene === 'convenience' ? '🥪' : '🛒',
    color: record.scene === 'campus' ? '#e6eddc' : record.scene === 'convenience' ? '#f0e9d8' : '#e3ece5',
    description: `${record.venue || MENU_SCENE_LABELS[record.scene]} · ${record.portionG ? `${record.portionG}g` : record.priceUnit} · 采集于${record.collectedOn}`,
    kcal: record.kcal, carbs: record.carbs, protein: record.protein, fat: record.fat, tags: record.tags,
    source: `团队复核 · ${record.priceEvidence}`, priceLabel: '核验价', dataOrigin: 'local_menu', dataDate: record.collectedOn,
    nutritionBasis: record.nutritionBasis, nutritionUrl: record.nutritionUrl, allergens: record.allergens
  }));
}

function recommendationFoodPool() {
  return [...recommendableLocalFoods(), ...foods];
}

function normalizeActiveWorkout(candidate, sessionId, sessionDate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
    || sessionDate !== dateKey(new Date()) || candidate.sessionId !== sessionId) return null;
  const startedAt = Number(candidate.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > Date.now() + 60_000 || Date.now() - startedAt > 18 * 60 * 60 * 1000) return null;
  const setsByIndex = {};
  if (candidate.setsByIndex && typeof candidate.setsByIndex === 'object' && !Array.isArray(candidate.setsByIndex)) {
    for (const [index, sets] of Object.entries(candidate.setsByIndex)) {
      if (!/^\d{1,2}$/.test(index) || !Array.isArray(sets)) continue;
      setsByIndex[index] = sets.slice(-12).map((set) => ({
        reps: set?.reps !== null && set?.reps !== undefined && Number.isFinite(Number(set.reps)) ? Math.min(200, Math.max(0, Math.round(Number(set.reps)))) : null,
        weightKg: set?.weightKg !== null && set?.weightKg !== undefined && Number.isFinite(Number(set.weightKg)) ? Math.min(300, Math.max(0, Number(set.weightKg))) : null,
        completedAt: typeof set?.completedAt === 'string' ? set.completedAt.slice(0, 32) : ''
      }));
    }
  }
  const drafts = {};
  if (candidate.drafts && typeof candidate.drafts === 'object' && !Array.isArray(candidate.drafts)) {
    for (const [index, draft] of Object.entries(candidate.drafts)) {
      if (!/^\d{1,2}$/.test(index) || !draft || typeof draft !== 'object') continue;
      drafts[index] = {
        reps: draft.reps !== null && draft.reps !== undefined && Number.isFinite(Number(draft.reps)) ? Math.min(200, Math.max(0, Math.round(Number(draft.reps)))) : null,
        weightKg: draft.weightKg !== null && draft.weightKg !== undefined && Number.isFinite(Number(draft.weightKg)) ? Math.min(300, Math.max(0, Number(draft.weightKg))) : null
      };
    }
  }
  const restDurationSec = [30, 45, 60, 90, 120, 180].includes(Number(candidate.restDurationSec)) ? Number(candidate.restDurationSec) : 60;
  const restEndsAt = Number(candidate.restEndsAt);
  return {
    sessionId, startedAt,
    currentIndex: Number.isInteger(candidate.currentIndex) ? Math.max(0, Math.min(60, candidate.currentIndex)) : 0,
    setsByIndex, drafts,
    restEndsAt: Number.isFinite(restEndsAt) && restEndsAt > Date.now() ? restEndsAt : 0,
    restDurationSec,
    collapsed: Boolean(candidate.collapsed)
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !saved.profile) return freshState();
    const defaults = freshState();
    const goalSchemaVersion = Number(saved.goalSchemaVersion) || 1;
    const legacyFocus = ['lower', 'upper'].includes(saved.trainingFocus);
    return {
      ...defaults, ...saved, goalSchemaVersion: PROFILE_GOAL_SCHEMA_VERSION, profile: {
        ...DEFAULT_PROFILE, ...saved.profile,
        goalType: normalizeGoalType(saved.profile.goalType, goalSchemaVersion),
        universityName: cleanMenuText(saved.profile.universityName, 80),
        campusName: cleanMenuText(saved.profile.campusName, 80)
      },
      campusId: /^[a-z0-9-]{2,64}$/.test(String(saved.campusId || '')) ? String(saved.campusId) : defaults.campusId,
      profileOnboardingDone: typeof saved.profileOnboardingDone === 'boolean' ? saved.profileOnboardingDone : true,
      profileOnboardingDismissed: typeof saved.profileOnboardingDismissed === 'boolean' ? saved.profileOnboardingDismissed : true,
      localMenuRecords: sanitizeLocalMenuRecords(saved.localMenuRecords),
      trainingFocus: saved.trainingFocus === 'lower' ? 'legs' : saved.trainingFocus === 'upper' ? 'full' : saved.trainingFocus || defaults.trainingFocus,
      trainingLogs: Array.isArray(saved.trainingLogs) ? saved.trainingLogs : defaults.trainingLogs,
      trainingPlanItems: !legacyFocus && Array.isArray(saved.trainingPlanItems) ? saved.trainingPlanItems : null,
      trainingSessionDate: saved.trainingSessionDate === dateKey(new Date()) ? saved.trainingSessionDate : defaults.trainingSessionDate,
      trainingSessionId: saved.trainingSessionDate === dateKey(new Date()) && typeof saved.trainingSessionId === 'string' ? saved.trainingSessionId : defaults.trainingSessionId,
      activeWorkout: normalizeActiveWorkout(saved.activeWorkout,
        saved.trainingSessionDate === dateKey(new Date()) && typeof saved.trainingSessionId === 'string' ? saved.trainingSessionId : defaults.trainingSessionId,
        saved.trainingSessionDate),
      exerciseLogs: Array.isArray(saved.exerciseLogs) ? saved.exerciseLogs.filter((log) => log && typeof log.id === 'string' && typeof log.sessionId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(log.date) && Number.isFinite(Number(log.minutes)) && Number(log.minutes) > 0 && Number.isFinite(Number(log.kcalLow)) && Number.isFinite(Number(log.kcalHigh))).slice(-200) : defaults.exerciseLogs,
      energyTarget: Math.min(5000, Math.max(1000, Number(saved.energyTarget) || defaults.energyTarget)),
      energyMode: saved.energyMode === 'manual' ? 'manual' : 'auto',
      manualExerciseKcal: saved.manualExerciseKcal && typeof saved.manualExerciseKcal === 'object'
        ? Object.fromEntries(Object.entries(saved.manualExerciseKcal).filter(([date, value]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 5000).map(([date, value]) => [date, Math.round(Number(value))]))
        : defaults.manualExerciseKcal,
      recipeIngredients: Array.isArray(saved.recipeIngredients)
        ? saved.recipeIngredients.filter((row) => row && typeof row.foodId === 'string' && Number.isFinite(Number(row.grams)) && Number(row.grams) >= 1 && Number(row.grams) <= 2000).slice(0, 10).map((row) => ({ foodId: row.foodId, grams: Math.round(Number(row.grams)) }))
        : defaults.recipeIngredients,
      mealLogs: Array.isArray(saved.mealLogs) ? saved.mealLogs.filter((log) => log && typeof log.id === 'string' && typeof log.date === 'string' && Array.isArray(log.items)).slice(-50) : defaults.mealLogs
    };
  } catch {
    return freshState();
  }
}

let state = loadState();

function makeTrainingSessionId() {
  return `${dateKey(new Date())}-${Math.random().toString(36).slice(2, 10)}`;
}

function startNewTrainingSession() {
  state.activeWorkout = null;
  state.trainingSessionDate = dateKey(new Date());
  state.trainingSessionId = makeTrainingSessionId();
  syncGuidedClock();
}

function startGuidedWorkout() {
  if (state.trainingLogs.some((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId && !log.demo)) {
    notify('今天这组训练已经保存。');
    return;
  }
  const firstIndex = nextIncompleteExerciseIndex();
  if (firstIndex < 0) {
    notify('计划动作都已完成，选一个体感即可保存训练。');
    return;
  }
  state.activeWorkout = {
    sessionId: state.trainingSessionId, startedAt: Date.now(), currentIndex: firstIndex,
    setsByIndex: {}, drafts: {}, restEndsAt: 0, restDurationSec: 60, collapsed: false
  };
  persist();
  renderTrainingPlan();
  syncGuidedClock();
}

function recordGuidedSet() {
  const active = state.activeWorkout;
  const plan = getTrainingPlan();
  const index = nextIncompleteExerciseIndex(plan);
  const exercise = exerciseCatalog.find((entry) => entry.id === plan[index]?.id);
  if (!active || !exercise || active.restEndsAt > Date.now()) return;
  const prescription = getExercisePrescription(exercise);
  const records = active.setsByIndex[index] || [];
  if (records.length >= prescription.sets) return;
  const repsInput = document.querySelector(`[data-guided-draft="reps"][data-guided-index="${index}"]`);
  const weightInput = document.querySelector(`[data-guided-draft="weightKg"][data-guided-index="${index}"]`);
  const repsRaw = repsInput?.value ?? active.drafts?.[index]?.reps ?? prescription.reps;
  const weightRaw = weightInput?.value ?? active.drafts?.[index]?.weightKg ?? '';
  const reps = String(repsRaw).trim() ? Number(repsRaw) : null;
  const weightKg = String(weightRaw).trim() ? Number(weightRaw) : null;
  if (reps !== null && (!Number.isFinite(reps) || reps < 1 || reps > 200)) {
    notify('次数请填写 1–200 之间的数字。');
    return;
  }
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 300)) {
    notify('负重请填写 0–300 kg，或留空。');
    return;
  }
  active.drafts ||= {};
  active.drafts[index] = { reps, weightKg };
  active.setsByIndex ||= {};
  active.setsByIndex[index] = [...records, { reps, weightKg, completedAt: new Date().toISOString() }];
  active.restEndsAt = active.setsByIndex[index].length < prescription.sets
    ? Date.now() + Number(active.restDurationSec || 60) * 1000 : 0;
  persist();
  renderTrainingPlan();
}

function skipGuidedRest() {
  if (!state.activeWorkout) return;
  state.activeWorkout.restEndsAt = 0;
  persist();
  renderGuidedWorkout();
}

function completeGuidedAction(index, allowIncomplete = false) {
  const active = state.activeWorkout;
  const plan = getTrainingPlan();
  const exercise = exerciseCatalog.find((entry) => entry.id === plan[index]?.id);
  if (!active || !exercise || index !== nextIncompleteExerciseIndex(plan)) return;
  const prescription = getExercisePrescription(exercise);
  active.setsByIndex ||= {};
  if (prescription.timed && !(active.setsByIndex[index] || []).length) {
    active.setsByIndex[index] = [{ reps: null, weightKg: null, completedAt: new Date().toISOString() }];
  }
  const recorded = active.setsByIndex[index] || [];
  if (!prescription.timed && recorded.length < prescription.sets && !allowIncomplete) {
    notify(`还差 ${prescription.sets - recorded.length} 组；也可以结束本动作并按已完成的组数记录。`);
    return;
  }
  active.restEndsAt = 0;
  toggleExerciseComplete(index);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function formatNumber(value) {
  return Number(value).toFixed(1);
}

function roundToTenth(value) {
  const amount = Number(value);
  return Math.round((amount + Number.EPSILON * Math.abs(amount) * 2) * 10) / 10;
}

function getTodayName() {
  return DAY_NAMES[new Date().getDay()];
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayOf(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function makeDemoTrainingLogs() {
  const today = new Date();
  const monday = mondayOf(today);
  const earlierDays = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    if (date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) earlierDays.push(date);
  }
  return earlierDays.slice(-2).map((date, index) => ({
    date: dateKey(date), title: index ? '全身基础 · 演示记录' : '轻力量 · 演示记录', minutes: 25,
    kcalLow: 65, kcalHigh: 125, effort: 'moderate', demo: true
  }));
}

function formatToday() {
  const now = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${weekdays[now.getDay()]} · ${now.getMonth() + 1}月${now.getDate()}日`;
}

function estimateKcal(met, weight, minutes) {
  return Math.max(0, Math.round(Number(met) * 3.5 * Number(weight) / 200 * Number(minutes)));
}

function estimateExercise(exercise, minutes = exercise.durationMin) {
  const weight = Number(state.profile.weight) || DEFAULT_PROFILE.weight;
  return {
    low: estimateKcal(exercise.metLow, weight, minutes),
    high: estimateKcal(exercise.metHigh, weight, minutes)
  };
}

function equipmentAvailable(exercise, equipment = state.trainingEquipment) {
  if (equipment === 'gym') return exercise.equipment === '健身房器械';
  if (equipment === 'running') return exercise.equipment === '跑步机 / 户外';
  const householdItems = ['无器材', '墙面', '稳固椅子'];
  if (householdItems.includes(exercise.equipment)) return true;
  if (equipment === 'band') return exercise.equipment === '弹力带';
  if (equipment === 'dumbbell') return /哑铃/.test(exercise.equipment);
  return false;
}

function trainingEquipmentLabel() {
  return ({ bodyweight: '徒手 / 家用椅', band: '弹力带', dumbbell: '轻哑铃', gym: '健身房器械', running: '跑步机 / 户外' })[state.trainingEquipment] || '徒手 / 家用椅';
}

function exerciseMatchesFocus(exercise, focus) {
  const areas = [exercise.focus, ...(Array.isArray(exercise.targetAreas) ? exercise.targetAreas : [])];
  if (focus === 'full') return ['chest', 'back', 'shoulders', 'legs', 'glutes', 'core', 'lower', 'upper'].some((area) => areas.includes(area));
  if (focus === 'lower') return areas.some((area) => ['legs', 'glutes', 'lower'].includes(area));
  if (focus === 'upper') return areas.some((area) => ['chest', 'back', 'shoulders', 'upper'].includes(area));
  return areas.includes(focus);
}

function defaultTrainingPlan() {
  if (!exerciseCatalog.length) return [];
  const focus = state.trainingFocus || 'full';
  const duration = Number(state.trainingDuration) || 25;
  const plan = [];
  const warmup = exerciseCatalog.find((item) => item.id === 'warmup-march');
  const cooldown = exerciseCatalog.find((item) => item.id === 'cooldown-stretch');
  if (warmup) plan.push({ id: warmup.id, durationMin: warmup.durationMin, round: 1 });

  if (focus === 'running') {
    const run = exerciseCatalog.find((item) => item.id === 'run-walk-intervals');
    if (run) plan.push({ id: run.id, durationMin: Math.max(9, duration - 6), round: 1 });
    if (cooldown) plan.push({ id: cooldown.id, durationMin: cooldown.durationMin, round: 1 });
    return plan;
  }

  if (focus === 'recovery' || focus === 'cardio') {
    const main = exerciseCatalog.find((item) => item.id === (focus === 'recovery' ? 'slow-walk' : 'brisk-walk'));
    const mainDuration = Math.max(focus === 'recovery' ? 8 : 9, duration - 6);
    if (main) plan.push({ id: main.id, durationMin: mainDuration, round: 1 });
    const recoveryMove = exerciseCatalog.find((item) => item.id === (focus === 'recovery' ? 'cat-cow' : 'cooldown-stretch'));
    if (recoveryMove) plan.push({ id: recoveryMove.id, durationMin: recoveryMove.durationMin, round: 1 });
    return plan;
  }

  if (cooldown) plan.push({ id: cooldown.id, durationMin: cooldown.durationMin, round: 1 });
  const mainItems = exerciseCatalog.filter((item) => item.phase === 'main'
    && (focus === 'gym'
      ? item.equipment === '健身房器械'
      : exerciseMatchesFocus(item, focus))
    && equipmentAvailable(item));
  const count = Math.max(2, Math.floor((duration - 6) / 4.5));
  for (let index = 0; index < count && mainItems.length; index += 1) {
    const offset = new Date().getDay() + (Number(state.trainingVariant) || 0);
    const exercise = mainItems[(index + (offset % mainItems.length)) % mainItems.length];
    plan.splice(plan.length - (cooldown ? 1 : 0), 0, {
      id: exercise.id, durationMin: exercise.durationMin, round: Math.floor(index / mainItems.length) + 1
    });
  }
  return plan;
}

function getTrainingPlan() {
  const defaultPlan = defaultTrainingPlan();
  if (!Array.isArray(state.trainingPlanItems) || state.trainingPlanItems.length !== defaultPlan.length) return defaultPlan;
  const validIds = new Set(exerciseCatalog.map((item) => item.id));
  if (!state.trainingPlanItems.every((item) => validIds.has(item.id) && Number(item.durationMin) > 0)) return defaultPlan;
  return state.trainingPlanItems;
}

function planSummary(plan = getTrainingPlan()) {
  const exercises = plan.map((item) => ({ item, exercise: exerciseCatalog.find((entry) => entry.id === item.id) })).filter((row) => row.exercise);
  return exercises.reduce((summary, { item, exercise }) => {
    const estimate = estimateExercise(exercise, item.durationMin);
    summary.minutes += Number(item.durationMin);
    summary.low += estimate.low;
    summary.high += estimate.high;
    return summary;
  }, { minutes: 0, low: 0, high: 0 });
}

function getExercisePrescription(exercise) {
  const dose = String(exercise?.dose || '');
  const setMatch = dose.match(/(\d+)\s*(?:[–-]\s*(\d+)\s*)?组/);
  const repsMatch = dose.match(/[×x]\s*(?:每侧\s*)?(\d+)(?:\s*[–-]\s*\d+)?\s*次/i);
  const timed = !setMatch && /(?:分钟|分|秒|公里|米)/.test(dose);
  return {
    sets: Math.max(1, Math.min(12, setMatch ? Number(setMatch[1]) : 1)),
    reps: repsMatch ? Math.max(1, Math.min(200, Number(repsMatch[1]))) : null,
    timed
  };
}

function nextIncompleteExerciseIndex(plan = getTrainingPlan()) {
  const completedSlots = new Set(state.exerciseLogs
    .filter((log) => log.sessionId === state.trainingSessionId)
    .map((log) => Number(log.slotIndex)));
  return plan.findIndex((_, index) => !completedSlots.has(index));
}

function previousExercisePerformance(exerciseId) {
  return state.exerciseLogs
    .filter((log) => log.exerciseId === exerciseId && log.sessionId !== state.trainingSessionId && Array.isArray(log.sets) && log.sets.length)
    .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`))
    .at(-1) || null;
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function updateGuidedClock() {
  const active = state.activeWorkout;
  if (!active) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - active.startedAt) / 1000));
  const elapsedNode = document.getElementById('guidedElapsed');
  const dockElapsed = document.getElementById('guidedDockElapsed');
  if (elapsedNode) elapsedNode.textContent = formatClock(elapsed);
  if (dockElapsed) dockElapsed.textContent = formatClock(elapsed);
  if (active.restEndsAt && active.restEndsAt <= Date.now()) {
    active.restEndsAt = 0;
    persist();
    renderGuidedWorkout();
  } else if (active.restEndsAt) {
    const restClock = document.getElementById('guidedRestClock');
    if (restClock) restClock.textContent = formatClock(Math.ceil((active.restEndsAt - Date.now()) / 1000));
    const setButton = document.querySelector('[data-guided-set]');
    if (setButton) setButton.disabled = true;
  }
}

function syncGuidedClock() {
  clearInterval(guidedClockInterval);
  guidedClockInterval = null;
  if (!state.activeWorkout) return;
  updateGuidedClock();
  guidedClockInterval = setInterval(updateGuidedClock, 1000);
}

function renderGuidedWorkout() {
  const host = document.getElementById('guidedSession');
  const dock = document.getElementById('guidedSessionDock');
  if (!host || !dock) return;
  const plan = getTrainingPlan();
  const active = state.activeWorkout;
  const todayLog = state.trainingLogs.find((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId && !log.demo);
  if (!active || active.sessionId !== state.trainingSessionId || todayLog) {
    if (active && (active.sessionId !== state.trainingSessionId || todayLog)) state.activeWorkout = null;
    dock.hidden = true;
    dock.innerHTML = '';
    host.innerHTML = todayLog
      ? `<div class="guided-session-finished"><span class="guided-kicker">SESSION SAVED</span><strong>今天的训练已记录</strong><small>${escapeHTML(todayLog.title)} · ${todayLog.minutes} 分钟动作计划 · ${todayLog.kcalLow}–${todayLog.kcalHigh} kcal 估算</small></div>`
      : `<div class="guided-session-launch"><div><span class="guided-kicker">GUIDED WORKOUT</span><strong>按动作跟练，逐组留下记录。</strong><small>训练过程可随时暂停离开；完成的动作会同步到卡路里和周回顾。</small></div><button class="primary-button" type="button" data-guided-start>开始跟练 <span>↗</span></button></div>`;
    return;
  }

  const index = nextIncompleteExerciseIndex(plan);
  active.currentIndex = index < 0 ? plan.length : index;
  const elapsed = Math.max(0, Math.floor((Date.now() - active.startedAt) / 1000));
  dock.hidden = false;
  dock.innerHTML = `<span class="guided-dock-pulse" aria-hidden="true"></span><span><strong>训练进行中</strong><small>${index < 0 ? '动作已完成 · 选择体感保存' : `第 ${index + 1}/${plan.length} 项`}</small></span><b id="guidedDockElapsed">${formatClock(elapsed)}</b><button type="button" data-guided-return>返回跟练</button>`;

  if (active.collapsed) {
    host.innerHTML = `<div class="guided-session-collapsed"><span class="guided-dock-pulse" aria-hidden="true"></span><div><strong>跟练已保留</strong><small>${index < 0 ? '动作已完成，记录体感即可结束' : `进行到第 ${index + 1}/${plan.length} 项`} · <b id="guidedElapsed">${formatClock(elapsed)}</b></small></div><button class="outline-button" type="button" data-guided-resume>继续跟练</button></div>`;
    return;
  }

  if (index < 0) {
    host.innerHTML = `<div class="guided-session-closeout"><div><span class="guided-kicker">WORKOUT COMPLETE</span><h3>这组动作完成了。</h3><p>跟练 ${formatClock(elapsed)} · 估算卡路里会继续按你的体重、动作和计划时长计算。选一个体感，保存到周回顾。</p></div><div class="effort-buttons"><button type="button" data-guided-effort="easy">比较轻松</button><button type="button" data-guided-effort="moderate">刚刚好</button><button type="button" data-guided-effort="hard">有点吃力</button></div></div>`;
    return;
  }

  const item = plan[index];
  const exercise = exerciseCatalog.find((entry) => entry.id === item?.id);
  if (!exercise) return;
  const prescription = getExercisePrescription(exercise);
  const recordedSets = active.setsByIndex?.[index] || [];
  const previous = previousExercisePerformance(exercise.id);
  const previousSets = previous?.sets || [];
  const previousLast = previousSets.at(-1) || {};
  const draft = active.drafts?.[index] || {};
  const canLogWeight = /健身房器械|哑铃/.test(exercise.equipment);
  const restLeft = Math.max(0, Math.ceil((Number(active.restEndsAt) - Date.now()) / 1000));
  const setLabel = recordedSets.length >= prescription.sets ? '建议组数已完成' : `第 ${recordedSets.length + 1}/${prescription.sets} 组`;
  const setChips = Array.from({ length: prescription.sets }, (_, setIndex) => {
    const value = recordedSets[setIndex];
    return `<span class="guided-set-chip ${value ? 'is-done' : ''}">${value ? `✓ ${setIndex + 1}组` : `${setIndex + 1}组`}${value?.reps ? ` · ${value.reps}次` : ''}${value?.weightKg ? ` · ${value.weightKg}kg` : ''}</span>`;
  }).join('');
  const strengthControls = !prescription.timed ? `<div class="guided-set-entry">
      ${prescription.reps ? `<label>每组次数<input type="number" min="1" max="200" step="1" inputmode="numeric" value="${Number(draft.reps ?? prescription.reps)}" data-guided-draft="reps" data-guided-index="${index}" /></label>` : ''}
      ${canLogWeight ? `<label>负重（kg）<input type="number" min="0" max="300" step="0.5" inputmode="decimal" placeholder="可留空" value="${draft.weightKg ?? (Number(previousLast.weightKg) || '')}" data-guided-draft="weightKg" data-guided-index="${index}" /></label>` : ''}
      <label>组间休息<select data-guided-rest><option value="30" ${active.restDurationSec === 30 ? 'selected' : ''}>30秒</option><option value="45" ${active.restDurationSec === 45 ? 'selected' : ''}>45秒</option><option value="60" ${active.restDurationSec === 60 ? 'selected' : ''}>60秒</option><option value="90" ${active.restDurationSec === 90 ? 'selected' : ''}>90秒</option><option value="120" ${active.restDurationSec === 120 ? 'selected' : ''}>2分钟</option><option value="180" ${active.restDurationSec === 180 ? 'selected' : ''}>3分钟</option></select></label>
    </div>
    <div class="guided-set-progress">${setChips}</div>
    <div class="guided-session-actions"><button class="outline-button" type="button" data-guided-set ${recordedSets.length >= prescription.sets || restLeft ? 'disabled' : ''}>${restLeft ? `休息中 · <span id="guidedRestClock">${formatClock(restLeft)}</span>` : `记录${setLabel}`}</button>${restLeft ? `<button class="text-button" type="button" data-guided-skip-rest>跳过休息</button>` : ''}${recordedSets.length >= prescription.sets ? `<button class="primary-button" type="button" data-guided-complete="${index}">完成此动作 <span>→</span></button>` : recordedSets.length ? `<button class="text-button" type="button" data-guided-complete-partial="${index}">按已记录组数结束</button>` : ''}</div>`
    : `<div class="guided-timed-control"><span>本项计划 ${escapeHTML(String(item.durationMin))} 分钟 · ${escapeHTML(exercise.dose)}</span><button class="primary-button" type="button" data-guided-complete="${index}">完成动作并进入下一项 <span>→</span></button></div>`;
  const previousCopy = previous
    ? `上次完成 ${previousSets.length} 组${previousLast.reps ? ` · ${previousLast.reps} 次` : ''}${previousLast.weightKg ? ` · ${previousLast.weightKg} kg` : ''}`
    : '首次记录 · 下次会自动带入上次表现';
  const completedSlots = new Set(state.exerciseLogs
    .filter((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId && Number.isInteger(Number(log.slotIndex)))
    .map((log) => Number(log.slotIndex)));
  const progressPercent = Math.round(completedSlots.size / Math.max(1, plan.length) * 100);
  const progressItems = plan.map((planItem, stepIndex) => {
    const stepExercise = exerciseCatalog.find((entry) => entry.id === planItem.id);
    if (!stepExercise) return '';
    const done = completedSlots.has(stepIndex);
    const current = stepIndex === index;
    return `<li class="guided-progress-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}" aria-label="第 ${stepIndex + 1} 项：${escapeHTML(stepExercise.name)}，${done ? '已完成' : current ? '当前动作' : '待完成'}"><b>${String(stepIndex + 1).padStart(2, '0')}</b><small>${escapeHTML(stepExercise.name)}</small></li>`;
  }).join('');
  host.innerHTML = `<div class="guided-session-active">
    <div class="guided-session-bar"><div><span class="guided-dock-pulse" aria-hidden="true"></span><strong>跟练进行中</strong><small>第 ${index + 1} / ${plan.length} 项</small></div><div class="guided-session-clock"><span>已训练</span><strong id="guidedElapsed">${formatClock(elapsed)}</strong></div><button class="text-button" type="button" data-guided-minimize>收起</button></div>
    <div class="guided-plan-progress"><div class="guided-plan-progress-heading"><span>本次动作进度</span><strong>${completedSlots.size} / ${plan.length} 项</strong></div><div class="guided-plan-progress-track" role="progressbar" aria-label="训练动作完成进度" aria-valuemin="0" aria-valuemax="${plan.length}" aria-valuenow="${completedSlots.size}"><i style="width:${progressPercent}%"></i></div><ol class="guided-plan-steps">${progressItems}</ol></div>
    <div class="guided-current-exercise"><div class="guided-current-visual">${window.ExerciseIllustrations.render(exercise, 'compact')}</div><div class="guided-current-copy"><span class="guided-kicker">${escapeHTML(exercise.phase === 'warmup' ? 'WARM UP' : exercise.phase === 'cooldown' ? 'COOL DOWN' : 'TODAY’S MOVE')}</span><h3>${escapeHTML(exercise.name)}</h3><p>${escapeHTML(exercise.dose)} · ${escapeHTML(exercise.equipment)}</p><small>${escapeHTML(exercise.howTo)}</small><details class="training-details"><summary>动作安全提醒</summary><p>${escapeHTML(exercise.watchOut)}</p></details><div class="guided-previous">${escapeHTML(previousCopy)}</div></div></div>
    ${strengthControls}<p class="guided-estimate-note">次数与负重用于训练回顾；卡路里仍按体重、动作和计划时长区间估算，不是设备实测。</p>
  </div>`;
}

function formatDuration(minutes) {
  const value = Number(minutes);
  return Number.isInteger(value) ? `${value}` : `${Math.floor(value)}–${Math.ceil(value)}`;
}

function canReplaceExercise(item) {
  const exercise = exerciseCatalog.find((entry) => entry.id === item.id);
  return Boolean(exercise && exerciseCatalog.some((candidate) => candidate.id !== exercise.id
    && candidate.phase === exercise.phase && exerciseMatchesFocus(candidate, state.trainingFocus) && equipmentAvailable(candidate)));
}

const MEAL_GOAL_PRESENTATION = {
  daily: {
    label: '日常均衡',
    basis: '按今日三大营养素参考比例、单餐能量参考和预算排序。'
  },
  muscle_gain: {
    label: '健身增肌',
    basis: '优先参考每份蛋白质与蛋白质密度，再看三大营养素平衡、单餐能量和预算。'
  },
  fat_loss: {
    label: '减脂塑形',
    basis: '优先参考蛋白质密度和估算脂肪供能占比，再兼顾单餐能量；这不是低脂认证。'
  },
  weight_loss: {
    label: '减重管理',
    basis: '优先靠近个人温和的单餐能量参考，再兼顾营养平衡与蛋白质；不设置激进缺口。'
  }
};

function currentMealGoalPresentation() {
  const goal = normalizeGoalType(state.profile.goalType, PROFILE_GOAL_SCHEMA_VERSION);
  return { goal, ...(MEAL_GOAL_PRESENTATION[goal] || MEAL_GOAL_PRESENTATION.daily) };
}

function mealRecommendationContext(goal = currentMealGoalPresentation().goal) {
  const totals = getTodayNutritionTotals();
  const targets = getNutritionTargets();
  const remainingEnergy = Math.max(0, Number(targets.energy) - Number(totals.kcal || 0));
  const energyReference = Math.min(650, Math.max(350, (remainingEnergy || Number(targets.energy)) / 3));
  const goalEnergyReference = goal === 'weight_loss'
    ? Math.min(500, Math.max(350, energyReference * 0.78))
    : energyReference;
  const macroGaps = {
    carbs: Math.max(0, Number(targets.carbs.low) - Number(totals.carbs || 0)) * 4,
    protein: Math.max(0, Number(targets.protein.low) - Number(totals.protein || 0)) * 4,
    fat: Math.max(0, Number(targets.fat.low) - Number(totals.fat || 0)) * 9
  };
  const macroTargets = {
    carbs: Math.max(0, Number(targets.carbs.mid) || 0) * 4,
    protein: Math.max(0, Number(targets.protein.mid) || 0) * 4,
    fat: Math.max(0, Number(targets.fat.mid) || 0) * 9
  };
  const selected = Object.values(macroGaps).some((value) => value > 0) ? macroGaps : macroTargets;
  const totalMacroReference = Object.values(selected).reduce((sum, value) => sum + value, 0) || 1;
  return {
    totals,
    targets,
    energyReference,
    goalEnergyReference,
    targetShares: {
      carbs: selected.carbs / totalMacroReference,
      protein: selected.protein / totalMacroReference,
      fat: selected.fat / totalMacroReference
    }
  };
}

function clampScore(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function scoreMealForGoal({ kcal, carbs, protein, fat, price = 0, tags = [], confidence = 'medium' }, goal, context = mealRecommendationContext(goal)) {
  const energy = Math.max(1, Number(kcal) || 0);
  const carb = Math.max(0, Number(carbs) || 0);
  const proteinAmount = Math.max(0, Number(protein) || 0);
  const fatAmount = Math.max(0, Number(fat) || 0);
  const priceAmount = Math.max(0, Number(price) || 0);
  const mealEnergyFit = clampScore(1 - Math.abs(energy - context.energyReference) / Math.max(400, context.energyReference));
  const goalEnergyFit = clampScore(1 - Math.abs(energy - context.goalEnergyReference) / Math.max(400, context.goalEnergyReference));
  const macroEnergy = { carbs: carb * 4, protein: proteinAmount * 4, fat: fatAmount * 9 };
  const macroEnergyTotal = Object.values(macroEnergy).reduce((sum, value) => sum + value, 0) || 1;
  const shares = {
    carbs: macroEnergy.carbs / macroEnergyTotal,
    protein: macroEnergy.protein / macroEnergyTotal,
    fat: macroEnergy.fat / macroEnergyTotal
  };
  const macroFit = clampScore(1 - (
    Math.abs(shares.carbs - context.targetShares.carbs)
    + Math.abs(shares.protein - context.targetShares.protein)
    + Math.abs(shares.fat - context.targetShares.fat)
  ) / 2);
  const proteinDensity = clampScore((proteinAmount / energy) * 100 / 7);
  const proteinServing = clampScore(proteinAmount / 38);
  const fatEnergyShare = (fatAmount * 9) / energy;
  const lowerFatSharePreference = clampScore(1 - Math.max(0, fatEnergyShare - 0.18) / 0.32);
  const budgetValue = clampScore(1 - priceAmount / 50);
  const balanceTag = tags.includes('balanced') ? 1 : 0;
  const estimateConfidence = { high: 1, medium: 0.78, low: 0.52 }[confidence] || 0.52;
  const confidenceAdjustment = (estimateConfidence - 0.78) * 0.08;
  const scores = {
    daily: macroFit * 0.48 + mealEnergyFit * 0.3 + balanceTag * 0.1 + budgetValue * 0.08 + estimateConfidence * 0.04,
    muscle_gain: proteinServing * 0.34 + proteinDensity * 0.22 + mealEnergyFit * 0.2 + macroFit * 0.17 + lowerFatSharePreference * 0.03 + estimateConfidence * 0.04,
    fat_loss: proteinDensity * 0.36 + lowerFatSharePreference * 0.32 + mealEnergyFit * 0.22 + macroFit * 0.06 + estimateConfidence * 0.04,
    weight_loss: goalEnergyFit * 0.52 + clampScore(1 - energy / 1000) * 0.15 + proteinDensity * 0.12 + macroFit * 0.13 + lowerFatSharePreference * 0.04 + estimateConfidence * 0.04
  };
  return (scores[goal] ?? scores.daily) + confidenceAdjustment;
}

function sortFoodChoices(items) {
  const { goal } = currentMealGoalPresentation();
  const context = mealRecommendationContext(goal);
  return [...items].sort((a, b) => {
    const score = (item) => scoreMealForGoal(item, goal, context)
      + (item.dataOrigin === 'local_menu' ? 0.015 : 0)
      + (state.proteinFocus ? clampScore(Number(item.protein) / 35) * 0.04 : 0);
    return score(b) - score(a) || Number(a.price || 0) - Number(b.price || 0);
  });
}

function getSelectedCampus() {
  const known = campusById(state.campusId);
  if (known) return { ...known, dataStatus: 'directory' };
  const profile = campusProfileLabel(state.campusId);
  if (!profile) return null;
  return {
    id: state.campusId, ...profile, dataStatus: 'pending', sourceTitle: '', sourceUrl: '',
    menuSourceUrl: '', menuSourceNote: '', historicalMenuPreview: [], diningPoints: []
  };
}

function renderCampusMatchBoard() {
  if (!campusDirectory?.campuses?.length) return;
  const university = document.getElementById('currentUniversity');
  if (university) university.textContent = state.profile.universityName || '未设置';
  const campus = getSelectedCampus();
  if (!campus) {
    const source = document.getElementById('campusMatchSource');
    if (source) source.innerHTML = '<strong>还没有设置高校</strong><span>设置高校后，可查看校园信息和餐食建议。</span>';
    const points = document.getElementById('campusDiningPoints');
    if (points) points.innerHTML = '<span>校园餐饮信息</span><i>请先设置高校</i>';
    return;
  }
  const totals = getTodayNutritionTotals();
  const targets = getNutritionTargets();
  const remaining = targets.energy - totals.kcal;
  const energyStatus = remaining > 1
    ? `还差 ${Math.round(remaining)} kcal`
    : remaining < -1
      ? `已超过 ${Math.round(Math.abs(remaining))} kcal`
      : '已达到参考值';
  const proteinRemaining = Math.max(0, targets.protein.low - totals.protein);
  const campusRecords = sanitizeLocalMenuRecords(state.localMenuRecords).filter((record) => record.campusId === campus.id);
  const eligibleCount = campusRecords.filter((record) => localMenuRecommendationStatus(record) === '可进入个性化推荐').length;
  const metrics = document.getElementById('campusGapMetrics');
  if (metrics) metrics.innerHTML = `
    <article class="campus-gap-metric"><span>个人参考目标</span><strong>${targets.energy} <small>kcal</small></strong><em>${targets.autoEnergy ? '成年维持能量估算' : '手动 / 演示参考值'}</em></article>
    <article class="campus-gap-metric"><span>今天已记录</span><strong>${totals.logs.length ? `${Math.round(totals.kcal)}` : '—'} <small>kcal</small></strong><em>${totals.logs.length ? `${totals.logs.length} 条摄入记录` : '还没有摄入记录'}</em></article>
    <article class="campus-gap-metric campus-gap-highlight"><span>与目标的差额</span><strong>${totals.logs.length ? energyStatus : '待记录'}${totals.logs.length && remaining > 0 ? '' : ''}</strong><em>${totals.logs.length ? `蛋白质距参考下限 ${Math.round(proteinRemaining)} g` : '记下一餐后开始动态计算'}</em></article>`;
  const source = document.getElementById('campusMatchSource');
  const links = campus.sourceUrl ? [`<a href="${escapeHTML(campus.sourceUrl)}" target="_blank" rel="noopener">${escapeHTML(campus.sourceTitle)} ↗</a>`] : [];
  if (campus.menuSourceUrl) links.push(`<a href="${escapeHTML(campus.menuSourceUrl)}" target="_blank" rel="noopener">历史菜单来源 ↗</a>`);
  if (source) source.innerHTML = campus.dataStatus === 'pending'
    ? `<strong>${escapeHTML(campus.label)} · 暂无已核验的校内菜单</strong><span>下方餐食是通用参考，可按预算和营养偏好筛选，不代表本校当前供应。</span>`
    : `<strong>${escapeHTML(campus.label)}${eligibleCount ? ` · ${eligibleCount} 份餐食可参考` : ''}</strong><span>已找到公开餐饮点位信息；点位不代表当前菜单、价格或库存。下方餐食仅供选择参考。</span><div>${links.join('')}</div>`;
  const points = document.getElementById('campusDiningPoints');
  if (points) points.innerHTML = campus.dataStatus === 'pending'
    ? '<span>该校餐饮信息</span><i>暂无已核验菜单</i>'
    : `<span>校方公开餐饮点位</span>${campus.diningPoints.map((point) => `<i>${escapeHTML(point)}</i>`).join('')}`;
}

function candidateFoods({ scene = state.scene, budget = state.budget, search = '', exactScene = true } = {}) {
  let items = recommendationFoodPool().filter((food) => food.price <= Number(budget));
  if (exactScene && scene !== 'all') items = items.filter((food) => food.scene === scene);
  if (state.vegetarianOnly) items = items.filter((food) => food.tags.includes('vegetarian'));
  if (state.proteinFocus) items = items.filter((food) => food.protein >= 18);
  if (search.trim()) {
    const query = search.trim().toLowerCase();
    items = items.filter((food) => `${food.name} ${food.description} ${food.sceneName}`.toLowerCase().includes(query));
  }
  return sortFoodChoices(items);
}

function sisuMenuObservedValue(item, key) {
  if (item?.[key] !== null && item?.[key] !== undefined && Number.isFinite(Number(item[key]))) return Number(item[key]);
  const screenshot = (item?.sourceScreenshots || []).find((entry) => entry[key] !== null && entry[key] !== undefined && Number.isFinite(Number(entry[key])));
  return screenshot ? Number(screenshot[key]) : null;
}

function sisuMenuObservedPrice(item) {
  return sisuMenuObservedValue(item, 'budgetPriceCnyObserved')
    ?? sisuMenuObservedValue(item, 'promoPriceCnyObserved')
    ?? sisuMenuObservedValue(item, 'regularPriceCnyObserved');
}

function sisuMenuImagePath(item) {
  const path = item?.sourceScreenshots?.[0]?.cropImagePath;
  return path ? `./${String(path).replace(/^\.\//, '')}` : '';
}

const MEAL_CATEGORY_PHOTOS = [
  [/炒饭/, 'fried-rice.jpg'],
  [/小笼/, 'xiaolongbao.jpg'],
  [/馄饨|抄手|云吞/, 'wontons.jpg'],
  [/蒸饺|水饺|饺子/, 'steamed-dumplings.jpg'],
  [/蛋包饭/, 'omurice.jpg'],
  [/牛肉面|牛肉粉/, 'beef-noodles.jpg'],
  [/寿喜/, 'sukiyaki.jpg'],
  [/烤鸭|烧鸭/, 'peking-duck.jpg'],
  [/肥牛|牛肉/, 'gyudon.jpg'],
  [/鸡.*饭|鸡肉|鸡胸/, 'chicken-rice.jpg'],
  [/面|线|粉/, 'beef-noodles.jpg'],
  [/饭/, 'fried-rice.jpg'],
];

function mealPhotoTemplate({ name, photo, illustration, priority = false }) {
  const src = photo || illustration;
  if (!src) return '';
  const hint = photo ? name : `${name} · 菜型示意`;
  const fallback = photo && illustration ? ` data-photo-fallback="${escapeHTML(illustration)}"` : '';
  return `<img class="meal-card-photo" src="${escapeHTML(src)}" alt="${escapeHTML(hint)}" loading="${priority ? 'eager' : 'lazy'}"${fallback} />`;
}

function mealCategoryPhoto(name) {
  const match = MEAL_CATEGORY_PHOTOS.find(([pattern]) => pattern.test(name));
  return match ? `./assets/campus-food-images/${match[1]}` : '';
}

function sisuMealPhotoMarkup(item, priority = false) {
  return mealPhotoTemplate({
    name: item.name,
    photo: sisuMenuImagePath(item),
    illustration: mealCategoryPhoto(item.name),
    priority
  });
}

function sisuMenuNutritionEstimate(item) {
  return item?.estimates?.find((entry) => entry.method === 'menu-thumbnail-vision-single-serving-v1') || null;
}

function hasUnclearSisuMenuName(item) {
  return /^\s*\d{1,2}:\d{2}\s*开始/.test(String(item?.name || '').trim());
}

function hasCompleteSisuMenuEstimate(item) {
  const estimate = sisuMenuNutritionEstimate(item);
  return estimate?.status === 'estimated' && estimate.recognized
    && ['kcalLow', 'kcalHigh', 'carbsG', 'proteinG', 'fatG'].every((field) => estimate[field] !== null
      && estimate[field] !== '' && Number.isFinite(Number(estimate[field])))
    && Number(estimate.kcalHigh) >= Number(estimate.kcalLow);
}

function isSisuMenuRecommendable(item) {
  if (!hasCompleteSisuMenuEstimate(item) || hasUnclearSisuMenuName(item)) return false;
  // Add-ons remain in the catalog, but do not rank as a complete meal.
  return !/(?:加在面上|单点配料|加料)/.test(String(item?.name || ''))
    && !/^\s*\+/.test(String(item?.name || ''));
}

function sisuMenuDisplayName(item) {
  return hasUnclearSisuMenuName(item) ? '菜单名称待核对' : String(item?.name || '餐食');
}

function mealCatalogLogKey(kind, id) {
  return `${kind}:${String(id || '')}`;
}

function isMealCatalogItemLoggedToday(key) {
  const today = dateKey(new Date());
  return state.mealLogs.some((log) => log.date === today && log.catalogId === key);
}

function syncMealRecordButtons(kind, id) {
  const key = mealCatalogLogKey(kind, id);
  const selectors = kind === 'sisu-menu'
    ? [...document.querySelectorAll('[data-log-sisu-menu]')]
    : [...document.querySelectorAll('[data-log-food], [data-add-food]')];
  selectors.filter((button) => kind === 'sisu-menu'
    ? button.dataset.logSisuMenu === String(id)
    : (button.dataset.logFood || button.dataset.addFood) === String(id))
    .forEach((button) => {
      const logged = isMealCatalogItemLoggedToday(key);
      button.disabled = logged;
      button.classList.toggle('is-recorded', logged);
      button.setAttribute('aria-pressed', String(logged));
      button.setAttribute('aria-label', logged ? '已计入今日摄入' : '记录已吃这份餐食，并计入今日摄入');
      button.textContent = logged ? '已记录 ✓' : '记录已吃';
    });
}

function renderFoodLogButton(food, { attribute = 'data-log-food', kind = 'food' } = {}) {
  const key = mealCatalogLogKey(kind, food.id);
  const logged = isMealCatalogItemLoggedToday(key);
  return `<button type="button" class="meal-record-button${logged ? ' is-recorded' : ''}" ${attribute}="${escapeHTML(food.id)}" ${logged ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'} aria-label="${logged ? '已计入今日摄入' : '记录已吃这份餐食，并计入今日摄入'}">${logged ? '已记录 ✓' : '记录已吃'}</button>`;
}

function renderSisuMenuLogButton(item) {
  const estimate = sisuMenuNutritionEstimate(item);
  const key = mealCatalogLogKey('sisu-menu', item.id);
  const logged = isMealCatalogItemLoggedToday(key);
  if (hasUnclearSisuMenuName(item)) {
    return '<button type="button" class="meal-record-button" disabled title="菜单名称识别不清，暂不能作为整餐记录">名称待核对</button>';
  }
  if (hasCompleteSisuMenuEstimate(item) && /加在面上/.test(String(item?.name || ''))) {
    return '<button type="button" class="meal-record-button" disabled title="这是加在主食上的配料，图片估值不能作为独立餐食记录">需并入整餐</button>';
  }
  const hasCompleteEstimate = estimate?.status === 'estimated' && estimate.recognized
    && ['kcalLow', 'kcalHigh', 'carbsG', 'proteinG', 'fatG'].every((field) => estimate[field] !== null && estimate[field] !== '' && Number.isFinite(Number(estimate[field])));
  if (!hasCompleteEstimate) {
    return '<button type="button" class="meal-record-button" disabled title="营养估算尚未完整，暂不能计入摄入">估算未完成</button>';
  }
  return `<button type="button" class="meal-record-button${logged ? ' is-recorded' : ''}" data-log-sisu-menu="${escapeHTML(item.id)}" ${logged ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'} aria-label="${logged ? '已计入今日摄入' : '记录已吃这份上外餐食，并计入今日摄入'}">${logged ? '已记录 ✓' : '记录已吃'}</button>`;
}

function renderSisuNutritionEstimate(item, { compact = false } = {}) {
  const estimate = sisuMenuNutritionEstimate(item);
  if (!estimate) return '<div class="campus-nutrition-estimate is-unknown">尚未进行图片估算</div>';
  if (hasUnclearSisuMenuName(item)) {
    return `<div class="campus-nutrition-estimate is-unknown"><strong>菜单名称待核对</strong><span>截图目录名称为「${escapeHTML(item.name)}」，识别内容不完整；暂不显示估值，也不进入个性化推荐。</span></div>`;
  }
  if (estimate.status !== 'estimated' || !estimate.recognized) {
    return `<div class="campus-nutrition-estimate is-unknown"><strong>图片未识别</strong><span>未生成营养数值，请以清晰的整份餐图重新估算。</span></div>`;
  }
  const macro = (label, value, className) => {
    const numeric = Number(value);
    const formatted = value !== null && value !== undefined && Number.isFinite(numeric) ? `${Math.round(numeric)}g` : '—';
    return `<span class="meal-macro ${className}"><small>${label}</small><strong>${formatted}</strong></span>`;
  };
  const confidence = { low: '低置信', medium: '中置信', high: '高置信' }[estimate.confidence] || '低置信';
  const kcalLow = Number(estimate.kcalLow);
  const kcalHigh = Number(estimate.kcalHigh);
  const kcalText = Number.isFinite(kcalLow) && Number.isFinite(kcalHigh) ? `${kcalLow}–${kcalHigh} kcal` : '热量未知';
  const recognizedTitle = String(estimate.recognizedTitle || '').trim();
  const titleMismatch = recognizedTitle && recognizedTitle !== item.name;
  const note = String(estimate.note || '').trim();
  return `<div class="campus-nutrition-estimate${compact ? ' is-compact' : ''}">
    <div class="campus-nutrition-estimate-head"><strong>${kcalText}</strong><span>图片估算 · ${confidence}</span></div>
    <div class="meal-macros" aria-label="每份碳水、蛋白质和脂肪的模型估算">${macro('碳水', estimate.carbsG, 'carbs')}${macro('蛋白质', estimate.proteinG, 'protein')}${macro('脂肪', estimate.fatG, 'fat')}</div>
    ${recognizedTitle ? `<span class="campus-nutrition-estimate-title${titleMismatch ? ' needs-review' : ''}">图中识别：${escapeHTML(recognizedTitle)}${titleMismatch ? ' · 核对是否为此菜' : ''}</span>` : ''}
    <span class="campus-nutrition-estimate-note">${escapeHTML(note || '按常见单人份估算；图片未提供称重信息。')} 数值需核对，不自动计入今日摄入。</span>
  </div>`;
}

function scoreSisuMenuItem(item, goal = currentMealGoalPresentation().goal, context = mealRecommendationContext(goal)) {
  const estimate = sisuMenuNutritionEstimate(item);
  if (!estimate) return -1;
  return scoreMealForGoal({
    kcal: (Number(estimate.kcalLow) + Number(estimate.kcalHigh)) / 2,
    carbs: estimate.carbsG,
    protein: estimate.proteinG,
    fat: estimate.fatG,
    price: sisuMenuObservedPrice(item) || 0,
    confidence: estimate.confidence
  }, goal, context);
}

function sortSisuMenuItems(items, goal = currentMealGoalPresentation().goal) {
  const context = mealRecommendationContext(goal);
  return [...items].sort((a, b) => scoreSisuMenuItem(b, goal, context) - scoreSisuMenuItem(a, goal, context)
    || (Number(sisuMenuObservedValue(b, 'monthlySalesObserved')) || 0) - (Number(sisuMenuObservedValue(a, 'monthlySalesObserved')) || 0)
    || ((sisuMenuObservedPrice(a) ?? 999) - (sisuMenuObservedPrice(b) ?? 999)));
}

function sisuMenuCandidates({ budget = state.foodBudget || state.profile.budget || 22, search = '', limit = 4 } = {}) {
  const items = Array.isArray(sisuMenuCatalog?.items)
    ? sisuMenuCatalog.items.filter(isSisuMenuRecommendable)
    : [];
  const query = String(search || '').trim().toLocaleLowerCase('zh-CN');
  const eligible = items.filter((item) => {
    const price = sisuMenuObservedPrice(item);
    const matchesBudget = price !== null && price <= Number(budget);
    const matchesQuery = !query || `${item.name} ${item.storeName} ${item.category || ''}`.toLocaleLowerCase('zh-CN').includes(query);
    return matchesBudget && matchesQuery;
  });
  return sortSisuMenuItems(eligible).slice(0, limit);
}

function sisuHomepageMenuCandidates({ budget = state.budget, limit = 2 } = {}) {
  const items = Array.isArray(sisuMenuCatalog?.items) ? sisuMenuCatalog.items.filter((item) => {
    const price = sisuMenuObservedPrice(item);
    return isSisuMenuRecommendable(item)
      && Boolean(sisuMenuImagePath(item) || mealCategoryPhoto(item.name)) && price !== null && price <= Number(budget);
  }) : [];
  return sortSisuMenuItems(items).slice(0, limit);
}

function renderExercises() {
  const plan = getTrainingPlan();
  const summary = planSummary(plan);
  const focusName = TRAINING_FOCUS_LABELS[state.trainingFocus] || '全身基础';
  const todayLog = state.trainingLogs.find((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId && !log.demo);
  const doneCount = state.exerciseLogs.filter((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId).length;
  document.getElementById('sectionPlanLabel').textContent = `${getTodayName()} · ${focusName}日`;
  document.getElementById('workoutTitle').textContent = `${focusName}，按状态来`;
  document.querySelector('.workout-category').textContent = `${focusName} · ${trainingEquipmentLabel()}`;
  document.getElementById('workoutDescription').textContent = '动作放慢，留意呼吸。觉得吃力时，可以缩短一组或休息。';
  document.getElementById('workoutDuration').textContent = Math.round(summary.minutes);
  const todayMinutes = document.getElementById('todayMinutes');
  if (todayMinutes) todayMinutes.textContent = Math.round(summary.minutes);
  document.querySelector('.workout-stamp').innerHTML = `${escapeHTML(focusName.slice(0, 4))}<br />TODAY`;
  document.getElementById('exerciseList').innerHTML = plan.slice(0, 3).map((item, index) => {
    const exercise = exerciseCatalog.find((entry) => entry.id === item.id);
    if (!exercise) return '';
    const kcal = estimateExercise(exercise, item.durationMin);
    return `<div class="exercise-item">
      <span class="exercise-number">0${index + 1}</span>
      <span class="exercise-name">${escapeHTML(exercise.name)}<small class="exercise-cue">${escapeHTML(exercise.dose)}</small></span>
      <span class="exercise-reps">${kcal.low}–${kcal.high} kcal</span>
    </div>`;
  }).join('');
  document.getElementById('todayKcal').textContent = `${summary.low}–${summary.high}`;
  const button = document.querySelector('.workout-footer [data-view-target="training"]');
  button.innerHTML = todayLog ? '训练已记录 · 查看 <span>✓</span>' : doneCount ? `已打卡 ${doneCount} 项 · 继续 <span>↗</span>` : '查看完整训练 <span>↗</span>';
}

function renderTrainingPlan() {
  const plan = getTrainingPlan();
  const summary = planSummary(plan);
  const focusName = TRAINING_FOCUS_LABELS[state.trainingFocus] || '全身基础';
  document.getElementById('trainingFocus').value = state.trainingFocus;
  document.getElementById('trainingEquipment').value = state.trainingEquipment;
  document.getElementById('trainingDuration').value = String(state.trainingDuration);
  const guidedActive = state.activeWorkout?.sessionId === state.trainingSessionId;
  for (const control of ['trainingFocus', 'trainingEquipment', 'trainingDuration', 'regenerateTraining']) {
    document.getElementById(control).disabled = guidedActive;
  }
  document.getElementById('planKcal').textContent = `${summary.low}–${summary.high}`;
  document.getElementById('planMinutes').textContent = Math.round(summary.minutes);
  document.getElementById('planWeight').textContent = formatNumber(state.profile.weight);
  document.getElementById('planFocusLabel').textContent = `${focusName} · ${trainingEquipmentLabel()}`;
  const goalType = normalizeGoalType(state.profile.goalType, PROFILE_GOAL_SCHEMA_VERSION);
  const goalCue = {
    daily: '日常均衡：按自己的时间和体力完成，优先保持规律。',
    muscle_gain: '增肌方向：以渐进力量训练为主，动作质量与休息优先；训练消耗只是估算。',
    fat_loss: '减脂方向：今天按计划活动即可，不用靠额外加练抵消一餐。',
    weight_loss: '体重管理：保持可持续的训练节奏，单次消耗不等于体重变化。'
  }[goalType];
  const goalCueNode = document.getElementById('trainingGoalCue');
  if (goalCueNode) goalCueNode.textContent = goalCue;
  const todayLog = state.trainingLogs.find((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId && !log.demo);
  const completed = state.exerciseLogs.filter((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId);
  const completedLow = completed.reduce((sum, log) => sum + Number(log.kcalLow || 0), 0);
  const completedHigh = completed.reduce((sum, log) => sum + Number(log.kcalHigh || 0), 0);
  document.getElementById('trainingPlanCaption').textContent = todayLog
    ? `本组已记录：${completed.length} 个动作 · ${Math.round(todayLog.minutes)} 分钟 · ${todayLog.effort === 'easy' ? '比较轻松' : todayLog.effort === 'hard' ? '有点吃力' : '刚刚好'}`
    : guidedActive
      ? `跟练进行中：${completed.length}/${plan.length} 项完成；当前步骤与组记录已自动保存。`
    : completed.length
      ? `已完成 ${completed.length}/${plan.length} 项 · 今日打卡 ${completedLow}–${completedHigh} kcal；点击动作按钮可撤销。`
      : '热身 → 主训练 → 放松；做完一个动作就点「完成动作」，消耗会记入今天。';
  document.querySelectorAll('[data-effort]').forEach((button) => { button.disabled = Boolean(todayLog || guidedActive); });
  document.getElementById('trainingPlanList').innerHTML = plan.map((item, index) => {
    const exercise = exerciseCatalog.find((entry) => entry.id === item.id);
    if (!exercise) return '';
    const estimate = estimateExercise(exercise, item.durationMin);
    const phase = exercise.phase === 'warmup' ? '热身' : exercise.phase === 'cooldown' ? '放松' : '主训练';
    const doneLog = completed.find((log) => log.slotIndex === index);
    const guidedIndex = state.activeWorkout?.sessionId === state.trainingSessionId ? nextIncompleteExerciseIndex(plan) : -1;
    return `<article class="training-step-card ${guidedIndex === index ? 'is-guided-current' : ''}">
      <span class="training-step-index">${String(index + 1).padStart(2, '0')}</span>
      <div class="training-step-main"><div class="training-step-title"><h3>${escapeHTML(exercise.name)}</h3><span>${phase}${item.round > 1 ? ` · 第${item.round}轮` : ''}</span></div>
        <p class="training-dose">${escapeHTML(exercise.dose)} <i>·</i> ${escapeHTML(exercise.equipment)}</p>
      </div>
      <div class="training-step-side"><div class="training-step-kcal"><strong>${estimate.low}–${estimate.high}</strong><small>kcal估算</small></div>
        <label class="training-duration-control">时长 <input type="number" min="1" max="30" step="0.5" value="${Number(item.durationMin)}" data-plan-duration="${index}" aria-label="${escapeHTML(exercise.name)}训练时长，分钟" ${doneLog || guidedActive ? 'disabled' : ''} /> 分钟</label>
        <button type="button" class="training-complete-button ${doneLog ? 'is-complete' : ''}" data-complete-exercise="${index}" aria-pressed="${Boolean(doneLog)}">${doneLog ? '✓ 已完成 · 撤销' : '完成动作'}</button>
        ${!doneLog && !guidedActive && canReplaceExercise(item) ? `<button type="button" data-replace-index="${index}">换一个</button>` : ''}</div>
      <div class="training-step-visual">${window.ExerciseIllustrations.render(exercise)}<p class="training-howto">${escapeHTML(exercise.howTo)}</p>
        <details class="training-details"><summary>动作提醒与替代动作</summary><p>${escapeHTML(exercise.watchOut)}</p><small>可替代为：${escapeHTML(exercise.alternative)}</small></details>
      </div>
    </article>`;
  }).join('');
  renderGuidedWorkout();
}

function renderExerciseLibrary() {
  const focus = state.exerciseLibraryFocus || 'all';
  const query = (state.exerciseSearch || '').trim().toLowerCase();
  const items = exerciseCatalog.filter((exercise) => {
    const matchesFocus = focus === 'all' || (focus === 'gym'
      ? exercise.equipment === '健身房器械'
      : exerciseMatchesFocus(exercise, focus));
    const matchesQuery = !query || `${exercise.name} ${exercise.group} ${exercise.equipment} ${exercise.howTo}`.toLowerCase().includes(query);
    return matchesFocus && matchesQuery;
  });
  document.getElementById('exerciseResultCount').textContent = `${items.length} 个动作`;
  document.getElementById('exerciseLibrary').innerHTML = items.map((exercise) => {
    const estimate = estimateExercise(exercise, exercise.durationMin);
    return `<article class="library-card"><div class="library-card-top"><span class="library-icon" aria-hidden="true">${exercise.phase === 'warmup' ? '✳' : ['cardio', 'running'].includes(exercise.focus) ? '↗' : exercise.focus === 'recovery' || exercise.phase === 'cooldown' ? '◌' : '＋'}</span><span class="library-level">${escapeHTML(exercise.level)}</span></div>
      <div class="library-tags"><span>${escapeHTML(EXERCISE_FOCUS_LABELS[exercise.focus] || exercise.group)}</span><span>${escapeHTML(exercise.equipment)}</span></div>
      <h3>${escapeHTML(exercise.name)}</h3>${window.ExerciseIllustrations.render(exercise, 'compact')}<p>${escapeHTML(exercise.howTo)}</p>
      <div class="library-calories"><strong>${estimate.low}–${estimate.high} kcal</strong><span>约${Math.round(exercise.durationMin)}分钟 · ${exercise.metLow}–${exercise.metHigh} MET</span></div>
      <details class="training-details"><summary>注意事项 / 替代动作</summary><p>${escapeHTML(exercise.watchOut)}</p><small>可替代为：${escapeHTML(exercise.alternative)}</small></details>
    </article>`;
  }).join('') || '<div class="food-empty">没有找到匹配动作，试试清除搜索或更换筛选条件。</div>';
  document.querySelectorAll('[data-exercise-focus]').forEach((button) => button.classList.toggle('selected', button.dataset.exerciseFocus === focus));
}

function foodMatchLabels(food, budget) {
  const remaining = Math.max(0, Math.round((Number(budget) - Number(food.price)) * 100) / 100);
  const labels = [`预算余 ¥${remaining}`];
  if (state.proteinFocus) labels.push('满足蛋白质筛选');
  if (state.vegetarianOnly) labels.push('符合植物性筛选');
  return labels;
}

function renderFoodMatchLabels(food, budget, className) {
  return foodMatchLabels(food, budget).map((label) => `<span class="${className}">${escapeHTML(label)}</span>`).join('');
}

function foodGapFitCopy(food) {
  const totals = getTodayNutritionTotals();
  const targets = getNutritionTargets();
  const remaining = Math.max(0, targets.energy - totals.kcal);
  const reference = Math.min(650, remaining);
  const proteinGap = Math.max(0, targets.protein.low - totals.protein);
  if (!totals.logs.length) return `按一餐不高于约${reference} kcal排序 · 通用搭配估算`;
  if (!remaining) return `已达到个人能量参考值 · 仍按份量和营养信息自主选择`;
  const proteinCue = proteinGap > 5 ? ` · 蛋白质参考下限还差${Math.round(proteinGap)}g` : '';
  return `目标差额约${Math.round(remaining)} kcal · 本餐参考约${reference} kcal${proteinCue}`;
}

function renderMealPicks() {
  // The demo profile may not be completed yet. In that case, use the selected
  // campus directory entry (freshState defaults to SISU Songjiang) instead of
  // silently falling back to generic emoji meals on the homepage.
  const selectedCampus = campusProfileLabel();
  const schoolForRecommendations = state.profile.universityName || selectedCampus?.school || '';
  const isSisuCampus = state.scene === 'campus'
    && isSisuSchoolName(schoolForRecommendations)
    && Boolean(sisuMenuCatalog);
  const sceneLabel = document.getElementById('sceneLabel');
  const intro = document.getElementById('mealIntro');
  const footnote = document.getElementById('mealFootnote');
  const moreChoices = document.getElementById('mealMoreChoices');
  const target = document.getElementById('mealPicks');
  sceneLabel.textContent = isSisuCampus ? (selectedCampus?.label || '上外松江校区') : SCENE_NAMES[state.scene];
  document.getElementById('sceneSelect').value = state.scene;
  ensureSelectOption(document.getElementById('budgetSelect'), state.budget);
  document.getElementById('budgetSelect').value = String(state.budget);

  if (isSisuCampus) {
    const goalPresentation = currentMealGoalPresentation();
    const options = sisuHomepageMenuCandidates({ budget: state.budget, limit: 2 });
    intro.textContent = `${goalPresentation.label}：${goalPresentation.basis}`;
    footnote.textContent = STATIC_PUBLIC_SITE
      ? '上外菜单快照价 · 图片为菜型示意 · 营养为估算'
      : '菜单截图价 · 图片营养估算待核对';
    moreChoices.innerHTML = '更多上外餐品 <b>→</b>';
    if (!options.length) {
      target.innerHTML = '<div class="food-empty">当前预算内暂时没有带价格记录的上外餐品；调高预算或查看完整菜单。</div>';
      return;
    }
    target.classList.add('meal-picks-sisu');
    target.innerHTML = options.map((item) => {
      const estimate = sisuMenuNutritionEstimate(item);
      const price = sisuMenuObservedPrice(item);
      const recognizedTitle = String(estimate.recognizedTitle || '').trim();
      const titleMismatch = recognizedTitle && recognizedTitle !== item.name;
      const macro = (label, value, className) => `<span class="meal-macro ${className}"><small>${label}</small><strong>${Math.round(Number(value))}g</strong></span>`;
      return `<article class="home-sisu-meal">
        ${sisuMealPhotoMarkup(item, true)}
        <div class="home-sisu-meal-body">
          <span class="home-sisu-meal-source">上外菜单快照 · ${escapeHTML(item.storeName)}</span>
          <strong class="home-sisu-meal-name">${escapeHTML(item.name)}</strong>
          <div class="home-sisu-meal-energy"><b>${Number(estimate.kcalLow)}–${Number(estimate.kcalHigh)} kcal</b><span>图片估算</span><strong>¥${price.toFixed(1)}</strong></div>
          <div class="meal-macros" aria-label="图片估算的碳水、蛋白质和脂肪">${macro('碳水', estimate.carbsG, 'carbs')}${macro('蛋白质', estimate.proteinG, 'protein')}${macro('脂肪', estimate.fatG, 'fat')}</div>
          <small class="home-sisu-meal-caveat">${titleMismatch ? `图片识别为「${escapeHTML(recognizedTitle)}」，请核对 · ` : ''}图片估算仅供参考，确认吃了再记录</small>
          ${renderSisuMenuLogButton(item)}
        </div>
      </article>`;
    }).join('');
    return;
  }

  target.classList.remove('meal-picks-sisu');
  const goalPresentation = currentMealGoalPresentation();
  intro.textContent = `${goalPresentation.label}：${goalPresentation.basis}`;
  footnote.textContent = '图片为示意，营养为原型估算，门店与份量会有差异';
  moreChoices.innerHTML = '更多选择 <b>→</b>';
  const options = candidateFoods({ scene: state.scene, budget: state.budget }).slice(0, 3);
  const formatMacro = (value) => {
    const numeric = Number(value);
    return value !== null && value !== undefined && value !== '' && Number.isFinite(numeric) ? `${Math.round(numeric)}g` : '暂无';
  };
  if (!options.length) {
    target.innerHTML = '<div class="food-empty">这个预算下暂时没有样例。试试提高预算，或换一个场景。</div>';
    return;
  }
  target.innerHTML = options.map((food) => `
    <article class="meal-pick${state.selectedFoodId === food.id ? ' selected' : ''}">
      <button class="meal-pick-select" data-food-select="${escapeHTML(food.id)}" aria-label="选择${escapeHTML(food.name)}">
        <span class="food-thumb" style="--thumb-bg:${food.color}">${mealPhotoTemplate({ name: food.name, illustration: food.image || mealCategoryPhoto(food.name), priority: true }) || `<span>${food.emoji}</span>`}</span>
        <span class="meal-meta"><span class="meal-name">${escapeHTML(food.name)}</span><span class="meal-sub"><span>${food.kcal} kcal</span></span><span class="meal-macros" aria-label="每份三大营养素估算"><span class="meal-macro carbs"><small>碳水</small><strong>${formatMacro(food.carbs)}</strong></span><span class="meal-macro protein"><small>蛋白质</small><strong>${formatMacro(food.protein)}</strong></span><span class="meal-macro fat"><small>脂肪</small><strong>${formatMacro(food.fat)}</strong></span></span><span class="meal-reason">${renderFoodMatchLabels(food, state.budget, 'meal-reason-chip')}</span><span class="meal-data-source">${escapeHTML(food.source || '演示估算')} · ${food.dataDate ? `更新 ${escapeHTML(food.dataDate)}` : '样例数据'}</span></span>
        <span class="meal-price"><small>¥</small>${food.price}</span>
      </button>
      ${renderFoodLogButton(food)}
    </article>`).join('');
}

function renderCampusQrMenu() {
  const section = document.getElementById('campusMarketplaceMenu');
  const storeList = document.getElementById('campusMenuStoreList');
  const picksContainer = document.getElementById('campusMenuPicks');
  const snapshot = sisuMenuCatalog;
  if (!section || !storeList || !picksContainer || !snapshot) return;
  const openStoreIds = new Set([...storeList.querySelectorAll('details[open][data-store-id]')].map((entry) => entry.dataset.storeId));
  const selectedSchool = String(state.profile.universityName || '').trim();
  const isSelectedCampus = isSisuSchoolName(selectedSchool);
  section.hidden = !isSelectedCampus;
  if (!isSelectedCampus) return;

  const searchInput = document.getElementById('campusMenuSearch');
  const budgetInput = document.getElementById('campusMenuBudget');
  if (searchInput && searchInput.value !== campusMenuSearch) searchInput.value = campusMenuSearch;
  if (!campusMenuBudgetTouched || !Number.isFinite(campusMenuMaxPrice)) campusMenuMaxPrice = Math.round(Number(state.profile.budget) || 22);
  if (budgetInput) {
    const selectedBudget = String(campusMenuMaxPrice);
    if (![...budgetInput.options].some((option) => option.value === selectedBudget)) {
      const option = document.createElement('option');
      option.value = selectedBudget;
      option.textContent = `¥${selectedBudget}以内（个人预算）`;
      budgetInput.add(option);
    }
    if (budgetInput.value !== selectedBudget) budgetInput.value = selectedBudget;
  }
  const query = campusMenuSearch.trim().toLocaleLowerCase('zh-CN');
  const allItems = Array.isArray(snapshot.items)
    ? snapshot.items.filter(hasCompleteSisuMenuEstimate)
    : [];
  const { goal, label: goalLabel, basis: goalBasis } = currentMealGoalPresentation();
  const goalNote = document.getElementById('campusMenuGoalNote');
  const dayTotals = getTodayNutritionTotals();
  const dayTargets = getNutritionTargets();
  const remainingEnergy = Math.max(0, Math.round(dayTargets.energy - dayTotals.kcal));
  const proteinGap = Math.max(0, Math.round(dayTargets.protein.low - dayTotals.protein));
  const carbsGap = Math.max(0, Math.round(dayTargets.carbs.low - dayTotals.carbs));
  const fatGap = Math.max(0, Math.round(dayTargets.fat.low - dayTotals.fat));
  const dayStatus = dayTotals.logs.length
    ? `今日已记录估算约 ${Math.round(dayTotals.kcalLow)}–${Math.round(dayTotals.kcalHigh)} kcal；距个人参考值约 ${remainingEnergy} kcal。碳水/蛋白质/脂肪参考下限差约 ${carbsGap} g / ${proteinGap} g / ${fatGap} g。`
    : `今天还没有已保存的餐食记录；目标参考约 ${dayTargets.energy} kcal。`;
  if (goalNote) goalNote.textContent = `当前目标：${goalLabel}。${goalBasis} ${dayStatus} 菜单营养来自图片估算，份量和做法未知；仅供比较，核对后再记录。`;
  const observedValue = (item, key) => {
    if (item[key] !== null && item[key] !== undefined && Number.isFinite(Number(item[key]))) return Number(item[key]);
    const screenshot = (item.sourceScreenshots || []).find((entry) => entry[key] !== null && entry[key] !== undefined && Number.isFinite(Number(entry[key])));
    return screenshot ? Number(screenshot[key]) : null;
  };
  const itemPrice = (item) => observedValue(item, 'budgetPriceCnyObserved')
    ?? observedValue(item, 'promoPriceCnyObserved')
    ?? observedValue(item, 'regularPriceCnyObserved');
  const visibleStores = (snapshot.stores || []).map((store) => {
    const sourceItems = allItems.filter((item) => item.storeId === store.id);
    const items = sourceItems.filter((item) => {
      const price = itemPrice(item);
      const matchesBudget = price !== null && price <= campusMenuMaxPrice;
      const matchesQuery = !query || `${item.name} ${item.storeName} ${item.category || ''}`.toLocaleLowerCase('zh-CN').includes(query);
      return matchesBudget && matchesQuery;
    });
    const goalSortedItems = sortSisuMenuItems(items, goal);
    items.splice(0, items.length, ...goalSortedItems);
    return { store, sourceItems, items };
  }).filter(({ items }) => items.length);
  const visibleItemCount = visibleStores.reduce((sum, entry) => sum + entry.items.length, 0);
  document.getElementById('campusMarketplaceMenuMeta').textContent = `${snapshot.storeCount} 家店 · ${allItems.length} 道已识别餐食 · 当前筛出 ${visibleItemCount} 道`;
  if (!visibleItemCount) {
    picksContainer.innerHTML = '';
    storeList.innerHTML = '<div class="campus-qr-menu-empty">没找到符合条件的菜单项。试试提高预算或清空关键词。</div>';
    return;
  }
  const eligibleRecommendations = allItems.filter((item) => {
    const price = itemPrice(item);
    return isSisuMenuRecommendable(item) && price !== null && price <= campusMenuMaxPrice
      && (!query || `${item.name} ${item.storeName} ${item.category || ''}`.toLocaleLowerCase('zh-CN').includes(query));
  });
  const recommended = sortSisuMenuItems(eligibleRecommendations, goal).slice(0, 3);
  const recommendationHtml = recommended.length ? `<section class="campus-menu-picks" aria-labelledby="campusMenuPicksHeading">
      <div class="campus-menu-picks-heading"><div><span class="card-index">TODAY'S CAMPUS PICKS</span><h3 id="campusMenuPicksHeading">${escapeHTML(goalLabel)} · 优先推荐</h3><p>${escapeHTML(goalBasis)} 排序基于图片估算，尚未核验。</p></div><span>按预算 ≤ ¥${campusMenuMaxPrice}</span></div>
      <div class="campus-menu-picks-grid">${recommended.map((item) => {
        const price = itemPrice(item);
        return `<article class="campus-menu-pick">${sisuMealPhotoMarkup(item)}<div><small>${escapeHTML(item.storeName)}</small><strong>${escapeHTML(item.name)}</strong><span>截图观察价 ¥${price.toFixed(1)}</span>${renderSisuNutritionEstimate(item, { compact: true })}${renderSisuMenuLogButton(item)}</div></article>`;
      }).join('')}</div>
    </section>` : '';
  picksContainer.innerHTML = recommendationHtml;
  storeList.innerHTML = visibleStores.map(({ store, sourceItems, items }) => {
    const groupNote = `${sourceItems.length} 道截图目录 · 价格为截图观察，营养为图片估算待核对`;
    const cards = items.map((item) => {
      const photo = sisuMealPhotoMarkup(item)
        || '<span class="campus-qr-menu-photo-placeholder" aria-hidden="true">🍲</span>';
      const price = itemPrice(item);
      const promoPrice = observedValue(item, 'promoPriceCnyObserved');
      const regularPrice = observedValue(item, 'regularPriceCnyObserved');
      const salesValue = observedValue(item, 'monthlySalesObserved');
      const priceLabel = price === null ? '价格未读到' : `截图${promoPrice !== null ? '优惠价' : '标价'} ¥${price.toFixed(1)}`;
      const regular = promoPrice !== null && regularPrice !== null
        ? `<small>截图常规标价 ¥${regularPrice.toFixed(1)}</small>` : '';
      const sales = salesValue !== null ? `<span>截图月售 ${salesValue}</span>` : '';
      const screenshotCount = item.sourceScreenshots?.length || 1;
      return `<article class="campus-qr-menu-item">
        <div class="campus-qr-menu-art">${photo}</div>
        <div class="campus-qr-menu-item-body"><div class="campus-qr-menu-tags"><span>${escapeHTML(item.category)}</span>${sales}<span>${screenshotCount} 张来源图</span></div><h3>${escapeHTML(sisuMenuDisplayName(item))}</h3><p>${escapeHTML(item.storeName)}</p><div class="campus-qr-menu-item-foot"><strong>${escapeHTML(priceLabel)}</strong>${regular}</div>${renderSisuNutritionEstimate(item, { compact: true })}${renderSisuMenuLogButton(item)}</div>
      </article>`;
    }).join('');
    const storeId = String(store.id || store.name);
    return `<details class="campus-qr-menu-store" data-store-id="${escapeHTML(storeId)}" ${openStoreIds.has(storeId) ? 'open' : ''}><summary><span><strong>${escapeHTML(store.name)}</strong><small>${groupNote}</small></span><b>${items.length} 道</b></summary><div class="campus-qr-menu-grid">${cards}</div></details>`;
  }).join('');
}

function renderFoodGrid() {
  const isSisuCampusMenu = isSisuSchoolName(state.profile.universityName) && state.foodSceneFilter === 'campus' && sisuMenuCatalog;
  if (isSisuCampusMenu) {
    const budget = state.foodBudget || state.profile.budget || 22;
    const picks = sisuMenuCandidates({ budget, search: state.foodSearch, limit: 6 });
    const { label: goalLabel, basis: goalBasis } = currentMealGoalPresentation();
    const estimatedCount = (sisuMenuCatalog.items || []).filter(isSisuMenuRecommendable).length;
    document.getElementById('foodResultCount').textContent = `${estimatedCount} 道可进入推荐的餐食 · 当前预算筛出 ${picks.length}${picks.length === 6 ? '+' : ''} 道`;
    document.getElementById('foodRecommendationBasis').textContent = `已切换为上外松江校区菜单快照。当前目标：${goalLabel}；${goalBasis}预算 ≤¥${budget}。排序参考图片估算的热量与三大营养素；点击“记录已吃”后按估算一份计入今日摄入，份量和做法仍需核对。`;
    const grid = document.getElementById('foodGrid');
    grid.classList.add('food-grid-sisu');
    grid.innerHTML = picks.length ? picks.map((item) => {
      const price = sisuMenuObservedPrice(item);
      return `<article class="campus-menu-pick campus-menu-main-pick">${sisuMealPhotoMarkup(item)}<div><small>${escapeHTML(item.storeName)}</small><strong>${escapeHTML(item.name)}</strong><span>截图观察价 ¥${price.toFixed(1)}</span>${renderSisuNutritionEstimate(item, { compact: true })}${renderSisuMenuLogButton(item)}</div></article>`;
    }).join('') : '<div class="food-empty">当前预算或搜索词下没有上外菜单项。可以调高预算、清空搜索，或切换到校外场景。</div>';
    document.querySelectorAll('[data-scene]').forEach((button) => button.classList.toggle('selected', button.dataset.scene === state.foodSceneFilter));
    const budgetSelect = document.getElementById('foodBudget');
    ensureSelectOption(budgetSelect, state.foodBudget || 22);
    budgetSelect.value = String(state.foodBudget || 22);
    return;
  }
  document.getElementById('foodGrid').classList.remove('food-grid-sisu');
  const budget = state.foodBudget || 22;
  const options = candidateFoods({ scene: state.foodSceneFilter, budget, search: state.foodSearch, exactScene: state.foodSceneFilter !== 'all' });
  const firstBatch = options.slice(0, 4);
  const moreOptions = options.slice(4);
  document.getElementById('foodResultCount').textContent = options.length > firstBatch.length
    ? `${options.length} 个选项 · 先显示 ${firstBatch.length} 个`
    : `${options.length} 个选项`;
  const appliedRules = [`预算 ≤¥${budget}`];
  if (state.foodSceneFilter !== 'all') appliedRules.push(`场景：${SCENE_LONG[state.foodSceneFilter] || state.foodSceneFilter}`);
  if (state.proteinFocus) appliedRules.push('蛋白质偏好：每份样例至少18g');
  if (state.vegetarianOnly) appliedRules.push('只看植物性样例');
  const goalPresentation = currentMealGoalPresentation();
  const sortRule = `${goalPresentation.label}排序：${goalPresentation.basis}`;
  const localCount = options.filter((food) => food.dataOrigin === 'local_menu').length;
  const sourceNote = localCount
    ? `当前校区候选含 ${localCount} 条团队复核餐品；其余是通用演示估算。`
    : '当前校区没有达到复核门槛的餐品；以下是通用演示搭配，不代表该校区菜单。';
  document.getElementById('foodRecommendationBasis').textContent = `${sourceNote}筛选：${appliedRules.join(' · ')}。${sortRule}样例值仅供比较，实际份量和配方可能不同。只有来源、采集日期和营养字段齐全且30天内的数据会进入本地餐品推荐。`;
  const renderCards = (foods, offset = 0) => foods.map((food, localIndex) => {
    const index = offset + localIndex;
    return `<article class="food-card">
      <div class="food-card-art" style="--food-art-bg:${food.color}">
        <span class="food-source-label">${escapeHTML(food.source)}</span><span class="food-emoji">${food.emoji}</span><span class="food-art-tag">PICK ${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="food-card-body">
        <div class="food-card-title-row"><h3 class="food-card-title">${escapeHTML(food.name)}</h3><span class="food-scene">${escapeHTML(food.sceneName)}</span></div>
        <p class="food-card-desc">${escapeHTML(food.description)}</p>
        <p class="food-gap-fit">${escapeHTML(foodGapFitCopy(food))}</p>
        ${food.dataOrigin === 'local_menu' ? `<p class="food-data-proof">价格证据：${escapeHTML(food.source)}<br />营养依据：${escapeHTML(food.nutritionBasis)}${food.nutritionUrl ? ` · <a href="${escapeHTML(food.nutritionUrl)}" target="_blank" rel="noopener">查来源 ↗</a>` : ''}</p>` : ''}
        <div class="food-match-labels" aria-label="推荐匹配依据">${renderFoodMatchLabels(food, budget, 'food-match-chip')}</div>
        <div class="macro-row"><div class="macro-cell"><span>碳水</span><b>${food.carbs} g</b></div><div class="macro-cell"><span>蛋白质</span><b>${food.protein} g</b></div><div class="macro-cell"><span>脂肪</span><b>${food.fat} g</b></div></div>
        <div class="food-card-bottom"><span class="food-price">¥${food.price}<small> / ${escapeHTML(food.priceLabel || '样例价')}</small></span>${renderFoodLogButton(food, { attribute: 'data-add-food' })}</div>
      </div>
    </article>`;
  }).join('');
  const moreSection = moreOptions.length
    ? `<details class="food-more-options"><summary><strong>查看更多餐食</strong><span>再看 ${moreOptions.length} 个选项</span></summary><div class="food-more-grid">${renderCards(moreOptions, firstBatch.length)}</div></details>`
    : '';
  document.getElementById('foodGrid').innerHTML = options.length
    ? `${renderCards(firstBatch)}${moreSection}`
    : '<div class="food-empty">没有找到匹配的样例，试试清除搜索或调整预算。</div>';
  document.querySelectorAll('[data-scene]').forEach((button) => button.classList.toggle('selected', button.dataset.scene === state.foodSceneFilter));
  const budgetSelect = document.getElementById('foodBudget');
  ensureSelectOption(budgetSelect, state.foodBudget || 22);
  budgetSelect.value = String(state.foodBudget || 22);
}

function parseCsvTable(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function csvRowToMenuRecord(headers, values, rowNumber) {
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  const isYes = ['是', '在售', 'yes', 'true', '1'].includes(String(row['采集时是否在售'] || '').trim().toLowerCase());
  return normalizeLocalMenuRecord({
    id: row['记录编号'] || `import-${Date.now()}-${rowNumber}`,
    campusId: row['校区编号'], collectedOn: row['采集日期'], scene: row['场景'], venue: row['点位名称'], name: row['餐品名称'],
    schoolName: row['高校名称'], campusName: row['校区名称'],
    price: row['标价_元'], priceUnit: row['价格单位'], portionG: row['份量_g'],
    priceEvidence: row['价格证据类型'], priceSource: row['价格来源或照片相对路径'],
    kcal: row['能量_kcal'], carbs: row['碳水_g'], protein: row['蛋白质_g'], fat: row['脂肪_g'],
    nutritionBasis: row['营养数据依据'], nutritionEvidence: row['营养标签照片相对路径'], nutritionUrl: row['营养来源链接'],
    allergens: row['过敏原或配料提示'], onSale: isYes, reviewStatus: row['复核状态'],
    tags: row['适用标签'], notes: row['备注']
  });
}

async function importLocalMenuCsv(event) {
  const input = event.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { notify('采集表请控制在2MB以内。'); return; }
  try {
    const rows = parseCsvTable(await file.text());
    if (rows.length < 2) throw new Error('CSV 里还没有餐品记录。');
    const headers = rows[0].map((header) => header.trim());
    const required = ['记录编号', '采集日期', '场景', '餐品名称', '标价_元'];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`采集表缺少列：${missing.join('、')}。请先下载本页提供的空白模板。`);
    const accepted = [], rowErrors = [];
    rows.slice(1, 501).forEach((values, index) => {
      const record = csvRowToMenuRecord(headers, values, index + 2);
      if (record) accepted.push(record);
      else rowErrors.push(index + 2);
    });
    if (!accepted.length) throw new Error('没有有效餐品行；请检查编号、日期、场景、名称和价格。');
    const merged = new Map(state.localMenuRecords.map((record) => [record.id, record]));
    accepted.forEach((record) => merged.set(record.id, record));
    state.localMenuRecords = [...merged.values()].slice(-200);
    persist();
    renderFoodGrid(); renderMealPicks(); renderNutritionDashboard();
    notify(`已导入 ${accepted.length} 条；${rowErrors.length} 行因必填项无效而跳过。待复核或过期数据不会进入推荐。`);
  } catch (error) {
    notify(error.message || '采集表读取失败，请确认文件为 UTF-8 CSV。');
  }
}

function addLocalMenuRecordFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const nutritionEvidence = String(values.get('nutritionEvidence') || '').trim();
  const nutritionUrl = String(values.get('nutritionUrl') || '').trim();
  if (!nutritionEvidence && !nutritionUrl) {
    notify('请填写营养标签证据编号或可查来源链接。');
    form.elements.nutritionEvidence.focus();
    return;
  }
  const record = normalizeLocalMenuRecord({
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    campusId: values.get('campusId'), schoolName: campusById(values.get('campusId'))?.school || state.profile.universityName,
    campusName: campusById(values.get('campusId'))?.campus || state.profile.campusName,
    collectedOn: values.get('collectedOn'), scene: values.get('scene'), venue: values.get('venue'), name: values.get('name'),
    price: values.get('price'), priceUnit: values.get('priceUnit'), portionG: values.get('portionG'),
    priceEvidence: values.get('priceEvidence'), priceSource: values.get('priceSource'),
    kcal: values.get('kcal'), carbs: values.get('carbs'), protein: values.get('protein'), fat: values.get('fat'),
    nutritionBasis: values.get('nutritionBasis'), nutritionEvidence, nutritionUrl,
    allergens: values.get('allergens'), onSale: values.get('onSale') !== null,
    reviewStatus: values.get('reviewStatus'), tags: values.getAll('tags'), notes: ''
  });
  if (!record) {
    notify('有字段格式不符合要求，请检查日期、场景、名称和数值。');
    return;
  }
  state.localMenuRecords = [...state.localMenuRecords, record].slice(-200);
  persist();
  renderFoodGrid(); renderMealPicks(); renderNutritionDashboard();
  form.reset();
  form.querySelector('[name="collectedOn"]').value = dateKey(new Date());
  const status = localMenuRecommendationStatus(record);
  notify(status === '可进入个性化推荐'
    ? '已保存；这条记录符合当前推荐准入条件。'
    : `已保存到本机台账；当前状态：${status}。`);
}

function csvCell(value) {
  const text = String(value ?? '');
  const guarded = /^[=+@\-]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function exportLocalMenuCsv() {
  const headers = ['记录编号', '高校名称', '校区名称', '校区编号', '采集日期', '场景', '点位名称', '餐品名称', '标价_元', '价格单位', '份量_g', '价格证据类型', '价格来源或照片相对路径', '能量_kcal', '碳水_g', '蛋白质_g', '脂肪_g', '营养数据依据', '营养标签照片相对路径', '营养来源链接', '过敏原或配料提示', '采集时是否在售', '复核状态', '备注', '适用标签'];
  const rows = state.localMenuRecords.map((record) => [
    record.id, record.schoolName, record.campusName, record.campusId, record.collectedOn, record.scene, record.venue, record.name, record.price, record.priceUnit, record.portionG,
    record.priceEvidence, record.priceSource, record.kcal, record.carbs, record.protein, record.fat, record.nutritionBasis,
    record.nutritionEvidence, record.nutritionUrl, record.allergens, record.onSale ? '是' : '否', record.reviewStatus,
    record.notes, record.tags.join(';')
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((line) => line.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `拾衡_本地餐品数据_${dateKey(new Date())}.csv`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('本地餐品数据 CSV 已导出。');
}

function deleteLocalMenuRecord(id) {
  const record = state.localMenuRecords.find((entry) => entry.id === id);
  if (!record) return;
  state.localMenuRecords = state.localMenuRecords.filter((entry) => entry.id !== id);
  persist();
  renderFoodGrid(); renderMealPicks(); renderNutritionDashboard();
  notify(`已从本机台账移除${record.name}。`);
}

function renderSourcedFoodLibrary() {
  const target = document.getElementById('sourcedFoodLibrary');
  if (!target) return;
  target.innerHTML = sourcedFoods.map((food) => {
    const kcalPer100g = Math.round(Number(food.energyKjPer100g) / 4.184);
    return `<article class="sourced-food-card">
      <div class="sourced-food-card-head"><div><span>${escapeHTML(food.category)}</span><h4>${escapeHTML(food.name)}</h4></div><b>来源数据</b></div>
      <div class="sourced-food-values"><div><strong>${kcalPer100g}</strong><small>kcal / 100g</small></div><div><strong>${Number(food.carbsGPer100g).toFixed(1)}g</strong><small>碳水</small></div><div><strong>${Number(food.proteinGPer100g).toFixed(1)}g</strong><small>蛋白质</small></div><div><strong>${Number(food.fatGPer100g).toFixed(1)}g</strong><small>脂肪</small></div></div>
      <p class="sourced-food-form">食部率 ${Number(food.ediblePercent)}% · 原表 ${Number(food.energyKjPer100g)} kJ/100g。${escapeHTML(food.formNote)}</p>
      <div class="sourced-food-actions"><label>可食部分 <input type="number" min="1" max="2000" step="5" value="100" inputmode="numeric" data-sourced-food-grams="${escapeHTML(food.id)}" aria-label="${escapeHTML(food.name)}的可食部分克数" /> g</label><button type="button" data-log-sourced-food="${escapeHTML(food.id)}">记入今日</button></div>
      <a class="sourced-food-link" href="${escapeHTML(food.sourceUrl)}" target="_blank" rel="noopener">查原始记录 ↗</a>
    </article>`;
  }).join('');
}

function getSourcedRecipeSummary() {
  const items = state.recipeIngredients.map((row) => {
    const food = sourcedFoods.find((entry) => entry.id === row.foodId);
    const grams = Number(row.grams);
    if (!food || !Number.isFinite(grams) || grams < 1 || grams > 2000) return null;
    const ratio = grams / 100;
    return {
      food, grams,
      kcal: Number(food.energyKjPer100g) / 4.184 * ratio,
      carbs: Number(food.carbsGPer100g) * ratio,
      protein: Number(food.proteinGPer100g) * ratio,
      fat: Number(food.fatGPer100g) * ratio
    };
  }).filter(Boolean);
  return items.reduce((totals, item) => ({
    ...totals,
    kcal: totals.kcal + item.kcal,
    carbs: totals.carbs + item.carbs,
    protein: totals.protein + item.protein,
    fat: totals.fat + item.fat
  }), { items, kcal: 0, carbs: 0, protein: 0, fat: 0 });
}

function renderSourcedRecipeTotals() {
  const target = document.getElementById('sourcedRecipeTotals');
  if (!target) return;
  const summary = getSourcedRecipeSummary();
  const logButton = document.getElementById('logSourcedRecipe');
  if (logButton) logButton.disabled = !summary.items.length;
  if (!summary.items.length) {
    target.innerHTML = '<p class="sourced-recipe-empty">先添加至少一种来源食材，整餐合计会显示在这里。</p>';
    return;
  }
  target.innerHTML = `<div class="sourced-recipe-total-head"><span>当前组合 · ${summary.items.length} 种食材</span><strong>${Math.round(summary.kcal)} <small>kcal</small></strong></div>
    <div class="sourced-recipe-macros"><span>碳水 <b>${roundToTenth(summary.carbs).toFixed(1)} g</b></span><span>蛋白质 <b>${roundToTenth(summary.protein).toFixed(1)} g</b></span><span>脂肪 <b>${roundToTenth(summary.fat).toFixed(1)} g</b></span></div>
    <p>合计按各来源食材的可食重量线性换算；不含未计量的油、酱料，也不校正烹饪造成的水分变化。</p>`;
}

function renderSourcedRecipeBuilder() {
  const target = document.getElementById('sourcedRecipeIngredients');
  const select = document.getElementById('recipeFoodSelect');
  if (!target || !select) return;
  const currentSelection = select.value;
  select.innerHTML = sourcedFoods.map((food) => `<option value="${escapeHTML(food.id)}">${escapeHTML(food.name)}</option>`).join('');
  if (sourcedFoods.some((food) => food.id === currentSelection)) select.value = currentSelection;
  target.innerHTML = state.recipeIngredients.map((row, index) => {
    const food = sourcedFoods.find((entry) => entry.id === row.foodId);
    if (!food) return '';
    const ratio = Number(row.grams) / 100;
    const rowKcal = Math.round(Number(food.energyKjPer100g) / 4.184 * ratio);
    const rowCarbs = roundToTenth(Number(food.carbsGPer100g) * ratio).toFixed(1);
    const rowProtein = roundToTenth(Number(food.proteinGPer100g) * ratio).toFixed(1);
    const rowFat = roundToTenth(Number(food.fatGPer100g) * ratio).toFixed(1);
    return `<div class="sourced-recipe-row"><div class="sourced-recipe-row-main"><div><strong>${escapeHTML(food.name)}</strong><small>${escapeHTML(food.formNote)}</small><small class="sourced-recipe-row-nutrition">${rowKcal} kcal · 碳水 ${rowCarbs}g · 蛋白质 ${rowProtein}g · 脂肪 ${rowFat}g</small></div><a href="${escapeHTML(food.sourceUrl)}" target="_blank" rel="noopener">来源 ↗</a></div><label for="recipeGrams${index}">可食部分 <span><input id="recipeGrams${index}" type="number" min="1" max="2000" step="1" value="${Math.round(Number(row.grams))}" inputmode="numeric" data-recipe-grams="${escapeHTML(food.id)}" aria-label="${escapeHTML(food.name)}在组合中的可食部分克数" /> g</span></label><button type="button" class="sourced-recipe-remove" data-remove-recipe-food="${escapeHTML(food.id)}" aria-label="移除${escapeHTML(food.name)}">移除</button></div>`;
  }).join('');
  renderSourcedRecipeTotals();
}

function addSourcedRecipeIngredient() {
  if (!syncSourcedRecipeWeights()) return;
  const foodId = document.getElementById('recipeFoodSelect')?.value;
  const grams = Number(document.getElementById('recipeFoodGrams')?.value);
  if (!sourcedFoods.some((food) => food.id === foodId)) return;
  if (!Number.isFinite(grams) || grams < 1 || grams > 2000) {
    notify('食材重量请填写1–2000克。');
    return;
  }
  const existing = state.recipeIngredients.find((row) => row.foodId === foodId);
  if (existing) existing.grams = Math.min(2000, Number(existing.grams) + Math.round(grams));
  else if (state.recipeIngredients.length < 10) state.recipeIngredients.push({ foodId, grams: Math.round(grams) });
  else {
    notify('一份组合最多添加10种食材。');
    return;
  }
  persist();
  renderSourcedRecipeBuilder();
  notify(`已加入${sourcedFoods.find((food) => food.id === foodId).name}。`);
}

function updateSourcedRecipeIngredient(input) {
  const row = state.recipeIngredients.find((item) => item.foodId === input.dataset.recipeGrams);
  const grams = Number(input.value);
  if (!row) return;
  if (!Number.isFinite(grams) || grams < 1 || grams > 2000) {
    input.value = String(row.grams);
    notify('食材重量请填写1–2000克。');
    return;
  }
  row.grams = Math.round(grams);
  updateSourcedRecipeRowPreview(input, row.grams);
  persist();
  renderSourcedRecipeTotals();
}

function updateSourcedRecipeRowPreview(input, grams) {
  const food = sourcedFoods.find((entry) => entry.id === input.dataset.recipeGrams);
  const nutrition = input.closest('.sourced-recipe-row')?.querySelector('.sourced-recipe-row-nutrition');
  if (!food || !nutrition) return;
  const ratio = grams / 100;
  const kcal = Math.round(Number(food.energyKjPer100g) / 4.184 * ratio);
  const carbs = roundToTenth(Number(food.carbsGPer100g) * ratio).toFixed(1);
  const protein = roundToTenth(Number(food.proteinGPer100g) * ratio).toFixed(1);
  const fat = roundToTenth(Number(food.fatGPer100g) * ratio).toFixed(1);
  nutrition.textContent = `${kcal} kcal · 碳水 ${carbs}g · 蛋白质 ${protein}g · 脂肪 ${fat}g`;
}

function previewSourcedRecipeIngredient(input) {
  const row = state.recipeIngredients.find((item) => item.foodId === input.dataset.recipeGrams);
  const grams = Number(input.value);
  if (!row || !Number.isFinite(grams) || grams < 1 || grams > 2000) return;
  row.grams = Math.round(grams);
  updateSourcedRecipeRowPreview(input, row.grams);
  renderSourcedRecipeTotals();
}

function syncSourcedRecipeWeights() {
  const inputs = [...document.querySelectorAll('[data-recipe-grams]')];
  const values = inputs.map((input) => ({ input, row: state.recipeIngredients.find((item) => item.foodId === input.dataset.recipeGrams), grams: Number(input.value) }));
  const invalid = values.find(({ row, grams }) => !row || !Number.isFinite(grams) || grams < 1 || grams > 2000);
  if (invalid) {
    if (invalid.row) invalid.input.value = String(invalid.row.grams);
    notify('食材重量请填写1–2000克。');
    invalid.input.focus();
    return false;
  }
  values.forEach(({ row, grams }) => { row.grams = Math.round(grams); });
  persist();
  renderSourcedRecipeTotals();
  return true;
}

function addSourcedRecipeToToday() {
  if (!syncSourcedRecipeWeights()) return;
  const summary = getSourcedRecipeSummary();
  if (!summary.items.length) {
    notify('先添加至少一种来源食材。');
    return;
  }
  const now = new Date();
  const names = summary.items.slice(0, 2).map((item) => item.food.name).join(' + ');
  const title = `${names}${summary.items.length > 2 ? ` 等${summary.items.length}种食材` : ''}`;
  state.mealLogs = [...state.mealLogs, {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    date: dateKey(now),
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    title,
    source: '来源食材组合估算（未含调味）',
    totalKcalLow: Math.round(summary.kcal),
    totalKcalHigh: Math.round(summary.kcal),
    carbs: roundToTenth(summary.carbs),
    protein: roundToTenth(summary.protein),
    fat: roundToTenth(summary.fat),
    items: summary.items.map(({ food, grams }) => ({ name: food.name, grams: Math.round(grams), sourceUrl: food.sourceUrl, sourceTitle: food.sourceTitle }))
  }].slice(-50);
  persist();
  renderNutritionDashboard();
  renderDailyNutritionLog();
  notify('已将这份来源食材组合记入今日。');
}

function renderNearbyPlaces(places) {
  const target = document.getElementById('nearbyFoodResults');
  target.hidden = false;
  if (!places.length) {
    target.innerHTML = '<div class="food-empty">这个范围内暂时没有标注清楚的店铺。附近数据可能不完整，可继续使用下方餐食样例。</div>';
    return;
  }
  target.innerHTML = places.map((place) => {
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    const mapParams = new URLSearchParams({ output: 'html', src: 'webapp.shiheng.foodagent' });
    let mapUrl;
    if (place.provider === 'amap') {
      const params = new URLSearchParams({ position: `${longitude},${latitude}`, name: String(place.name || '附近餐饮'), coordinate: 'gaode', src: 'shiheng', callnative: '1' });
      mapUrl = `https://uri.amap.com/marker?${params.toString()}`;
    } else if (place.provider === 'Baidu Map' && place.baidu_uid) {
      mapParams.set('uid', String(place.baidu_uid));
      mapUrl = `https://api.map.baidu.com/place/detail?${mapParams.toString()}`;
    } else if (place.provider === 'Baidu Map') {
      mapParams.set('query', String(place.name || '附近餐饮'));
      mapUrl = `https://api.map.baidu.com/place/search?${mapParams.toString()}`;
    } else {
      mapUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
    }
    const distance = Number(place.distance_m) < 1000
      ? `${Math.max(0, Math.round(Number(place.distance_m)))} 米`
      : `${(Number(place.distance_m) / 1000).toFixed(1)} 公里`;
    const placeDetail = [place.category, place.address].filter(Boolean).map(escapeHTML).join(' · ');
    return `<article class="nearby-place"><div class="nearby-place-main"><strong>${escapeHTML(place.name)}</strong><small>${placeDetail}</small></div><span class="nearby-place-distance">约 ${distance}</span><a class="nearby-place-link" href="${mapUrl}" target="_blank" rel="noopener">地图查看 ↗</a></article>`;
  }).join('');
}

function showNearbyMapFallback(query) {
  const amapLink = document.getElementById('nearbyMapFallback');
  const googleLink = document.getElementById('nearbyGoogleMapFallback');
  const linkWrap = document.getElementById('nearbyMapFallbacks');
  const sceneKeyword = { all: '餐饮', campus: '餐饮', convenience: '便利店', market: '超市' }[state.foodSceneFilter] || '餐饮';
  const searchTerm = query.place_name ? `${query.place_name} ${sceneKeyword}` : `附近${sceneKeyword}`;
  const params = new URLSearchParams({ keyword: searchTerm, src: 'shiheng', callnative: '1' });
  if (amapLink) amapLink.href = `https://uri.amap.com/search?${params.toString()}`;
  if (googleLink) googleLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchTerm)}`;
  if (linkWrap) linkWrap.hidden = false;
}

function nearbyFoodApiEndpoint() {
  return '/api/nearby-food';
}

async function requestNearbyFood(query, loadingMessage) {
  if (STATIC_PUBLIC_SITE) {
    showNearbyMapFallback(query);
    document.getElementById('nearbyFoodStatus').textContent = '点击下方地图链接查看附近餐饮。';
    return;
  }
  const gpsButton = document.getElementById('nearbyFoodButton');
  const searchButton = document.getElementById('searchNearbyPlace');
  const status = document.getElementById('nearbyFoodStatus');
  const results = document.getElementById('nearbyFoodResults');
  gpsButton.disabled = true;
  searchButton.disabled = true;
  searchButton.querySelector('span').textContent = '搜索中…';
  status.textContent = loadingMessage;
  results.hidden = true;
  const controller = new AbortController();
  const requestTimer = window.setTimeout(() => controller.abort(), 26000);
  try {
    const response = await fetch(nearbyFoodApiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...query, scene: state.foodSceneFilter }),
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '附近地点暂时无法读取，请稍后重试。');
    nearbyPlaces = Array.isArray(payload.places) ? payload.places : [];
    renderNearbyPlaces(nearbyPlaces);
    document.getElementById('nearbyMapFallback').hidden = true;
    const center = payload.location_label ? `以“${payload.location_label}”为中心，` : '';
    const providerNote = payload.provider_fallback ? '（地图服务暂不可用，已切换至 OpenStreetMap）' : '';
    status.textContent = nearbyPlaces.length
      ? `${center}找到 ${nearbyPlaces.length} 个附近地点，按距离排序，来源：${payload.source || 'OpenStreetMap'}${providerNote}。门店点位不代表当前营业、实时菜品、价格或库存。`
      : `${center}暂时没有匹配地点${providerNote}；地图标注可能不完整，可继续使用下方餐食样例。`;
  } catch (error) {
    showNearbyMapFallback(query);
    status.textContent = error && error.name === 'AbortError'
      ? '附近搜索等待超时；可直接打开高德地图查看周边商家。'
      : error instanceof TypeError
      ? '附近地点服务连接失败；可点下方按钮直接用高德地图搜索。'
      : `${error.message || '附近地点暂时无法读取。'} 可点下方按钮直接用高德地图搜索。`;
  } finally {
    window.clearTimeout(requestTimer);
    gpsButton.disabled = false;
    searchButton.disabled = false;
    searchButton.querySelector('span').textContent = '搜索附近';
  }
}

async function searchNearbyFoodByPlace(event) {
  event.preventDefault();
  const input = document.getElementById('nearbyPlaceInput');
  const placeName = input.value.trim();
  if (!placeName) {
    document.getElementById('nearbyFoodStatus').textContent = '先输入学校、地铁站或商圈名称，例如“上海大学宝山校区”。';
    input.focus();
    return;
  }
  await requestNearbyFood({ place_name: placeName }, `正在查找“${placeName}”附近的地点…`);
}

function updateNearbyMapFallback() {
  const input = document.getElementById('nearbyPlaceInput');
  const linkWrap = document.getElementById('nearbyMapFallbacks');
  const placeName = input.value.trim();
  if (placeName) showNearbyMapFallback({ place_name: placeName });
  else if (linkWrap) linkWrap.hidden = true;
}

async function findNearbyFood() {
  const button = document.getElementById('nearbyFoodButton');
  const status = document.getElementById('nearbyFoodStatus');
  const results = document.getElementById('nearbyFoodResults');
  if (window.isSecureContext === false) {
    status.textContent = '当前手机链接不支持 GPS 定位，不用改手机设置；在输入框填写学校、地铁站或商圈即可搜索。';
    return;
  }
  if (!navigator.geolocation) {
    status.textContent = '当前浏览器不支持定位；在输入框填写学校、地铁站或商圈即可搜索。';
    return;
  }

  button.disabled = true;
  button.textContent = '正在定位…';
  status.textContent = '请在浏览器弹窗中允许一次定位，正在查找约 1.2 公里内的地点。';
  results.hidden = true;
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, timeout: 12000, maximumAge: 60000
      });
    });
    await requestNearbyFood({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    }, '已获取位置，正在查询附近地点…');
  } catch (error) {
    const permissionError = error && typeof error.code === 'number';
    if (permissionError && error.code === 1) status.textContent = '定位权限未获准；不必处理手机设置，在输入框填写学校或商圈名称也能搜索。';
    else if (permissionError && error.code === 3) status.textContent = '定位等待超时，请检查手机定位服务后重试。';
    else if (permissionError) status.textContent = '暂时获取不到位置，请检查手机系统定位服务后重试。';
  } finally {
    button.disabled = false;
    button.textContent = '用当前位置 ⌖';
  }
}

function initializeNearbyFood() {
  if (STATIC_PUBLIC_SITE) {
    document.getElementById('nearbyFoodButton').hidden = true;
    document.getElementById('nearbyFoodStatus').textContent = '输入地点后，可打开高德地图查看周边餐饮。';
    return;
  }
  if (window.isSecureContext === false) {
    document.getElementById('nearbyFoodStatus').textContent = '当前局域网链接暂不支持手机定位；输入学校、地铁站或商圈名称即可搜索附近。';
  }
}

function ensureSelectOption(select, value) {
  if (!select) return;
  const stringValue = String(value);
  if (![...select.options].some((option) => option.value === stringValue)) {
    select.add(new Option(`≤ ¥${stringValue}`, stringValue));
  }
}

function getTrainingEntriesWithActionCheckins(logs = state.trainingLogs) {
  const sessions = new Set(logs.map((log) => log.sessionId).filter(Boolean));
  const grouped = new Map();
  for (const log of state.exerciseLogs) {
    if (sessions.has(log.sessionId)) continue;
    const rows = grouped.get(log.sessionId) || [];
    rows.push(log);
    grouped.set(log.sessionId, rows);
  }
  const inProgress = [...grouped.values()].map((rows) => ({
    date: rows[0].date,
    title: `${TRAINING_FOCUS_LABELS[rows[0].focus] || '训练'} · 动作打卡`,
    minutes: rows.reduce((sum, log) => sum + Number(log.minutes || 0), 0),
    kcalLow: rows.reduce((sum, log) => sum + Number(log.kcalLow || 0), 0),
    kcalHigh: rows.reduce((sum, log) => sum + Number(log.kcalHigh || 0), 0),
    effort: 'in_progress', sessionId: rows[0].sessionId, demo: false
  }));
  return [...logs, ...inProgress];
}

function renderWeek() {
  const today = getTodayName();
  const workoutDays = new Set(['一', '二', '四', '六']);
  const monday = mondayOf(new Date());
  const currentWeekLogs = getTrainingEntriesWithActionCheckins().filter((log) => {
    const date = new Date(`${log.date}T00:00:00`);
    return date >= monday && date <= new Date();
  });
  const completed = new Set(currentWeekLogs.map((log) => DAY_NAMES[new Date(`${log.date}T00:00:00`).getDay()]));
  state.completedDays = [...completed];
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  const weekDays = document.getElementById('weekDays');
  if (weekDays) weekDays.innerHTML = days.map((day) => {
    const done = completed.has(day);
    const isToday = day === today;
    const planned = workoutDays.has(day) && !done && !isToday;
    const status = done ? 'done' : isToday ? 'today' : planned ? '' : 'rest';
    const mark = done ? '✓' : planned || isToday ? '·' : '–';
    return `<div class="week-day ${status}"><span>${day}</span><span class="week-day-dot">${mark}</span></div>`;
  }).join('');
  const count = currentWeekLogs.length;
  const weekCount = document.getElementById('weekCount');
  if (weekCount) weekCount.textContent = count;
  const progressNumber = document.getElementById('progressNumber');
  if (progressNumber) progressNumber.textContent = count;
  document.getElementById('summaryDone').textContent = count;
  document.getElementById('summaryBar').style.width = `${Math.min(100, count / 4 * 100)}%`;
  const weekEnergy = currentWeekLogs.reduce((total, log) => ({ low: total.low + Number(log.kcalLow || 0), high: total.high + Number(log.kcalHigh || 0) }), { low: 0, high: 0 });
  document.getElementById('weeklyKcal').textContent = `${weekEnergy.low}–${weekEnergy.high} kcal`;
  if (state.lastAdjustment === 'hard') {
    document.getElementById('adjustmentTitle').textContent = '下周安排：多留恢复空间';
    document.getElementById('adjustmentText').textContent = '你反馈训练有点吃力。下周先保留熟悉动作、缩短一组或延长休息，不用追求更高消耗。';
  } else if (state.lastAdjustment === 'easy') {
    document.getElementById('adjustmentTitle').textContent = '下周安排：小幅增加挑战';
    document.getElementById('adjustmentText').textContent = '你反馈训练比较轻松。下周可在状态良好时多做一组或延长几分钟，仍以动作稳定为先。';
  } else if (state.lastAdjustment === 'short') {
    document.getElementById('adjustmentTitle').textContent = '下周安排：保留短时训练';
    document.getElementById('adjustmentText').textContent = '你反馈可用时间有限。下一次先用18分钟的轻量模板，保持热身、休息和动作选择。';
  } else if (state.lastAdjustment === 'recovery') {
    document.getElementById('adjustmentTitle').textContent = '下周安排：先给恢复留位置';
    document.getElementById('adjustmentText').textContent = '你反馈今天比较疲劳。计划已切换为轻柔活动选项，感觉不适时休息，不需要补做。';
  } else if (state.lastAdjustment === 'moderate' || state.lastAdjustment === 'completed') {
    document.getElementById('adjustmentTitle').textContent = '下周安排：保持现在的节奏';
    document.getElementById('adjustmentText').textContent = '你反馈训练强度刚刚好。下周保留类似时长和熟悉动作，并继续给每次训练留出休息空间。';
  } else {
    document.getElementById('adjustmentTitle').textContent = '下周安排：继续稳稳来';
    document.getElementById('adjustmentText').textContent = `你本周有${count}次训练记录。我们保留熟悉的动作模板，给每次训练留出休息空间。`;
  }
  renderLogs();
  renderTrainingLogs(currentWeekLogs);
}

function renderTrainingLogs(logs = state.trainingLogs) {
  const target = document.getElementById('trainingLogList');
  const entries = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  if (!entries.length) {
    target.innerHTML = '<div class="training-log-empty">完成一组训练后，动作、时长和消耗估算会显示在这里。</div>';
    return;
  }
  target.innerHTML = entries.map((log) => {
    const date = new Date(`${log.date}T00:00:00`);
    const label = log.date === dateKey(new Date()) ? '今天' : `${DAY_NAMES[date.getDay()]} · ${date.getMonth() + 1}/${date.getDate()}`;
    const effort = { easy: '比较轻松', moderate: '刚刚好', hard: '有点吃力', in_progress: '动作逐项打卡' }[log.effort] || '演示记录';
    const elapsed = Number(log.sessionElapsedSeconds) > 0 ? ` · 跟练 ${formatClock(log.sessionElapsedSeconds)}` : '';
    const setCount = (log.exerciseLogIds || []).reduce((total, id) => total + Number(state.exerciseLogs.find((entry) => entry.id === id)?.sets?.length || 0), 0);
    return `<div class="training-log-entry"><span class="training-log-date">${label}</span><div><strong>${escapeHTML(log.title)}</strong><small>${log.minutes} 分钟动作计划${setCount ? ` · ${setCount} 组记录` : ''}${elapsed} · ${effort}${log.demo ? ' · 样例' : ''}</small></div><b>${Number(log.kcalLow)}–${Number(log.kcalHigh)} kcal</b></div>`;
  }).join('');
}

function renderLogs() {
  const logs = [...state.weightLog].slice(-4).reverse();
  const items = logs.map((log) => `<div class="log-entry"><span>${escapeHTML(log.label)}</span><strong>${formatNumber(log.value)} kg</strong><small>${escapeHTML(log.note || '演示记录')}</small></div>`);
  while (items.length < 4) items.push('<div class="log-entry is-empty"><span>留给之后</span><strong>—</strong><small>不必每天记录</small></div>');
  document.getElementById('checkinLog').innerHTML = items.join('');
  renderWeightChart();
}

function renderWeightChart() {
  const logs = [...state.weightLog].slice(-7);
  const values = logs.map((log) => Number(log.value)).filter(Number.isFinite);
  if (!values.length) return;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 0.2) { min -= 0.3; max += 0.3; }
  else { min -= 0.15; max += 0.15; }
  const points = values.map((value, index) => ({
    x: values.length === 1 ? 302.5 : 15 + index * 575 / (values.length - 1),
    y: 30 + (max - value) / (max - min) * 140
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1).x.toFixed(1)} 190 L${points[0].x.toFixed(1)} 190Z`;
  document.getElementById('chartLine').setAttribute('d', line);
  document.getElementById('chartArea').setAttribute('d', area);
  document.getElementById('chartPoint').setAttribute('cx', points.at(-1).x.toFixed(1));
  document.getElementById('chartPoint').setAttribute('cy', points.at(-1).y.toFixed(1));
  document.getElementById('weightAxisTop').textContent = max.toFixed(1);
  document.getElementById('weightAxisMid').textContent = ((max + min) / 2).toFixed(1);
  document.getElementById('weightAxisBottom').textContent = min.toFixed(1);
  document.getElementById('chartXLabels').innerHTML = logs.map((log) => `<span>${escapeHTML(log.label || (log.date ? log.date.slice(5).replace('-', '/') : '记录'))}</span>`).join('');
  const change = values.at(-1) - values[0];
  const delta = document.getElementById('weightDelta');
  delta.textContent = values.length < 2 || Math.abs(change) < 0.05 ? '持平' : `${change < 0 ? '↓' : '↑'} ${Math.abs(change).toFixed(1)} kg`;
}

function renderProfile() {
  document.getElementById('welcomeName').textContent = state.profile.name;
  document.getElementById('sidebarName').textContent = state.profile.name;
  const currentCampus = getSelectedCampus();
  const profileStatus = document.querySelector('.profile-copy small');
  if (profileStatus) profileStatus.textContent = state.profileOnboardingDone
    ? currentCampus ? currentCampus.school : '高校待设置'
    : '演示档案 · 可建档';
  const homeWeight = document.getElementById('currentWeight');
  if (homeWeight) homeWeight.textContent = formatNumber(state.profile.weight);
  const progressWeight = document.getElementById('progressCurrentWeight');
  if (progressWeight) progressWeight.textContent = formatNumber(state.profile.weight);
  document.getElementById('targetWeight').textContent = formatNumber(state.profile.target);
  document.getElementById('currentBodyfat').textContent = state.profile.bodyfat === null ? '未记录' : formatNumber(state.profile.bodyfat);
  document.getElementById('currentBodyfatUnit').hidden = state.profile.bodyfat === null;
  document.getElementById('targetBodyfat').textContent = state.profile.targetBodyfat === null ? '未设置' : `${formatNumber(state.profile.targetBodyfat)}%`;
  document.getElementById('currentBodyfatNote').textContent = state.profile.bodyfat === null ? '可选记录，不影响推荐' : '用户记录，仅作趋势参考';
  document.getElementById('targetBodyfatNote').textContent = state.profile.targetBodyfat === null ? '可留空，不预测达成日期' : '仅作个人参考，不预测达成日期';
  document.getElementById('sceneSelect').value = state.scene;
  document.getElementById('profileName').value = state.profile.name;
  document.getElementById('profileUniversity').value = state.profile.universityName || currentCampus?.school || '';
  refreshCampusSuggestions(document.getElementById('profileUniversity'));
  document.getElementById('profileGoalType').value = normalizeGoalType(state.profile.goalType, PROFILE_GOAL_SCHEMA_VERSION);
  document.getElementById('profileWeight').value = state.profile.weight;
  document.getElementById('profileTarget').value = state.profile.target;
  document.getElementById('profileHeight').value = state.profile.heightCm ?? '';
  document.getElementById('profileAge').value = state.profile.age ?? '';
  document.getElementById('profileEnergySex').value = state.profile.energySex || '';
  document.getElementById('profileActivityLevel').value = state.profile.activityLevel || '';
  document.getElementById('profileBodyfat').value = state.profile.bodyfat ?? '';
  document.getElementById('profileTargetBodyfat').value = state.profile.targetBodyfat ?? '';
  document.getElementById('profileBudget').value = state.profile.budget;
  document.getElementById('profileScene').value = state.scene;
}

function renderAll() {
  document.getElementById('todayDate').textContent = formatToday();
  renderProfile();
  renderTrainingPlan();
  renderExerciseLibrary();
  renderExercises();
  renderCampusMatchBoard();
  renderMealPicks();
  renderFoodGrid();
  renderCampusQrMenu();
  renderSourcedFoodLibrary();
  renderSourcedRecipeBuilder();
  renderNutritionDashboard();
  renderCaloriesDashboard();
  renderDailyNutritionLog();
  renderWeek();
  syncGuidedClock();
}

function notify(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function setPhotoStatus(message, isError = false) {
  const status = document.getElementById('photoStatus');
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function setAgentModeStatus(mode) {
  const badge = document.getElementById('agentModeBadge');
  const label = document.getElementById('agentModeLabel');
  if (!badge || !label) return;
  const states = {
    checking: ['检查中…', '正在读取本地接口配置。'],
    direct_configured: ['模型已接入', `服务配置了${assistantTextProvider === 'deepseek' ? 'DeepSeek' : '千问'}文本模型；这不代表本次请求已成功，实际来源以执行记录为准。`],
    request_failed: ['模型调用失败', `${assistantTextProvider === 'deepseek' ? 'DeepSeek' : '文本模型'}已配置，但本次请求失败；本次计划由本机规则继续生成。请查看下方执行记录。`],
    proxy_configured: ['代理待验', '检测到兼容服务代理；代理配置不代表模型可达，实际来源以执行记录为准。'],
    local_fallback: ['本地兜底', '当前服务没有模型直连或代理配置，计划由本地规则完成。'],
    local_demo: ['本地演示', '本地演示模式已开启；计划请求不会发送到 AI 服务。'],
    requesting: ['请求中…', '正在请求计划条件；完成后会显示本次实际来源。'],
    function_call_success: ['模型理解成功', `本次由${assistantTextProvider === 'deepseek' ? 'DeepSeek' : '千问'}返回受限计划字段，并经本地校验。`],
    chat_json_success: ['模型提取成功', '本次兼容接口返回结构化条件并通过本地校验；不是原生函数调用。'],
    unknown: ['状态未知', '无法读取服务模式；请以本次执行步骤显示的实际来源为准。']
  };
  const [text, description] = states[mode] || states.unknown;
  badge.dataset.mode = mode;
  badge.title = description;
  label.textContent = text;
}

function updateLocalDemoControl() {
  const button = document.getElementById('localDemoToggle');
  const label = document.getElementById('localDemoState');
  if (!button || !label) return;
  button.setAttribute('aria-pressed', String(localDemoMode));
  button.classList.toggle('is-active', localDemoMode);
  label.textContent = localDemoMode ? '开启' : '关闭';
  setAgentModeStatus(localDemoMode ? 'local_demo' : agentServiceMode);
}

async function checkPhotoService() {
  if (STATIC_PUBLIC_SITE) {
    if (!selectedMealImage) setPhotoStatus('公开版支持在本机预览照片。');
    return;
  }
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error('旧版本地服务');
    }
    const status = await response.json();
    assistantTextProvider = status.text_provider || 'deepseek';
    const textApiConfigured = typeof status.text_api_configured === 'boolean' ? status.text_api_configured : status.api_key_configured;
    const visionApiConfigured = typeof status.vision_api_key_configured === 'boolean' ? status.vision_api_key_configured : status.api_key_configured;
    agentServiceMode = textApiConfigured ? 'direct_configured' : status.ai_proxy_configured ? 'proxy_configured' : 'local_fallback';
    if (!localDemoMode) setAgentModeStatus(agentServiceMode);
    if (selectedMealImage) return;
    if (!visionApiConfigured && !status.ai_proxy_configured) {
      setPhotoStatus('识别服务未配置 DeepSeek API Key。请在电脑启动服务的终端配置后重启。', true);
      return;
    }
    const connection = visionApiConfigured ? '已配置' : '经本机代理转发';
    setPhotoStatus(`识别服务${connection}（${status.vision_model || '图像模型'}）。选照片后可开始估算；结果仍需核对。`);
  } catch {
    agentServiceMode = 'unknown';
    if (!localDemoMode) setAgentModeStatus('unknown');
    if (!selectedMealImage) setPhotoStatus('无法确认本地识别服务。请从电脑提供的局域网网址打开，并重启最新版 run_server.py。', true);
  }
}

async function compressMealPhoto(file) {
  let image;
  let objectUrl;
  if (typeof createImageBitmap === 'function') {
    try { image = await createImageBitmap(file); } catch { image = null; }
  }
  if (!image) {
    objectUrl = URL.createObjectURL(file);
    image = new Image();
    image.src = objectUrl;
    try {
      if (typeof image.decode === 'function') await image.decode();
      else await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('图片解码失败。'));
      });
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const fileName = String(file.name || '').toLowerCase();
      if (/\.hei[cf]$/.test(fileName) || /image\/hei[cf]/i.test(file.type)) {
        throw new Error('手机浏览器暂时无法读取这张 HEIC 照片，请导出为 JPG 后再从相册选择。');
      }
      throw new Error('无法读取这张照片，请换一张 JPG、PNG 或 WebP 图片。');
    }
  }

  let blob;
  try {
    // DeepSeek scales images above roughly 1300x1300 internally; retain detail without sending full phone originals.
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法处理这张照片，请重试。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  } finally {
    if (typeof image.close === 'function') image.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  if (!blob) throw new Error('照片压缩失败，请换一张 JPG、PNG 或 WebP 图片。');
  if (blob.size > 5 * 1024 * 1024) throw new Error('压缩后的照片仍超过5MB，请换一张较小的照片。');
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('照片读取失败，请重试。'));
    reader.readAsDataURL(blob);
  });
}

async function cropCenteredMealPhoto(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const cropWidth = Math.max(1, Math.round(width * 0.82));
  const cropHeight = Math.max(1, Math.round(height * 0.82));
  const scale = Math.min(1, 1280 / Math.max(cropWidth, cropHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.max(1, Math.round(cropHeight * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('浏览器无法裁剪这张照片，请换一张后重试。');
  context.drawImage(image, Math.round(width * 0.09), Math.round(height * 0.09), cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

async function chooseMealPhoto(file) {
  const analyzeButton = document.getElementById('analyzeMealPhoto');
  const clearButton = document.getElementById('clearMealPhoto');
  const focusButton = document.getElementById('focusMealPhoto');
  const preview = document.getElementById('mealPhotoPreview');
  const emptyPreview = document.getElementById('photoPreviewEmpty');
  const result = document.getElementById('nutritionResult');
  if (!file) return;
  selectedMealImage = null;
  activeNutritionResult = null;
  nutritionBaseItems = [];
  preview.removeAttribute('src');
  preview.hidden = true;
  emptyPreview.hidden = false;
  analyzeButton.disabled = true;
  clearButton.disabled = true;
  focusButton.disabled = true;
  result.hidden = true;
  if (file.size > 20 * 1024 * 1024) {
    setPhotoStatus('原照片超过20MB，请选择较小的图片。', true);
    return;
  }

  analyzeButton.disabled = true;
  clearButton.disabled = false;
  result.hidden = true;
  setPhotoStatus('正在整理照片…');
  try {
    selectedMealImage = await compressMealPhoto(file);
    preview.src = selectedMealImage;
    preview.hidden = false;
    emptyPreview.hidden = true;
    analyzeButton.disabled = STATIC_PUBLIC_SITE;
    clearButton.disabled = false;
    focusButton.disabled = STATIC_PUBLIC_SITE;
    if (STATIC_PUBLIC_SITE) {
      setPhotoStatus('照片仅在此浏览器中预览。');
      return;
    }
    setPhotoStatus(`照片已准备好（约 ${(selectedMealImage.length * 0.75 / 1024 / 1024).toFixed(1)} MB）。复杂摆盘请补充主菜和份量；也可裁掉边缘后再试。`);
  } catch (error) {
    selectedMealImage = null;
    focusButton.disabled = true;
    setPhotoStatus(error.message || '无法读取这张照片，请换一张再试。', true);
  }
}

function clearMealPhoto() {
  selectedMealImage = null;
  activeNutritionResult = null;
  nutritionBaseItems = [];
  document.getElementById('mealPhotoInput').value = '';
  document.getElementById('mealCameraInput').value = '';
  document.getElementById('focusMealPhoto').disabled = true;
  document.getElementById('mealPhotoPreview').removeAttribute('src');
  document.getElementById('mealPhotoPreview').hidden = true;
  document.getElementById('photoPreviewEmpty').hidden = false;
  document.getElementById('nutritionResult').hidden = true;
  document.getElementById('analyzeMealPhoto').disabled = true;
  document.getElementById('clearMealPhoto').disabled = true;
  setPhotoStatus('选择照片后即可开始估算；复杂餐食可补充菜名和份量。');
  void checkPhotoService();
}

function renderNutritionResult(result) {
  const target = document.getElementById('nutritionResult');
  if (!result.recognized || !result.items?.length) {
    target.innerHTML = `<div class="nutrition-empty"><strong>暂时没有识别到清晰的餐食</strong><p>${escapeHTML(result.summary || '请换一张光线更好、能看清整份餐食的照片。')}</p></div>`;
    target.hidden = false;
    return;
  }

  const low = Math.max(0, Math.round(Number(result.total_kcal_low) || 0));
  const high = Math.max(low, Math.round(Number(result.total_kcal_high) || low));
  const confidenceLabels = { high: '较清晰', medium: '一般', low: '不确定' };
  const items = result.items.map((item, index) => {
    const confidence = confidenceLabels[item.confidence] || confidenceLabels.low;
    return `<article class="nutrition-item">
      <div class="nutrition-item-top"><strong>${escapeHTML(item.name)}</strong><span>${confidence}</span></div>
      <label class="nutrition-serving-control">份量 <input type="number" min="1" max="3000" step="5" inputmode="numeric" data-nutrition-grams="${index}" value="${Math.round(Number(item.grams) || 1)}" aria-label="修改${escapeHTML(item.name)}的份量" ${result.savedLogId ? 'disabled' : ''} /> g</label>
      <div class="nutrition-item-values"><b>${Math.round(Number(item.kcal_low) || 0)}–${Math.round(Number(item.kcal_high) || 0)} kcal</b><span>碳水 ${Number(item.carbs_g || 0).toFixed(1)}g</span><span>蛋白质 ${Number(item.protein_g || 0).toFixed(1)}g</span><span>脂肪 ${Number(item.fat_g || 0).toFixed(1)}g</span></div>
      <small>${escapeHTML(item.estimate_note || '')}</small>
    </article>`;
  }).join('');

  target.innerHTML = `<div class="nutrition-result-head">
      <div><span class="card-index">AI ESTIMATE · CHECK THE PORTION</span><h3>${escapeHTML(result.title || '这份餐食')}</h3></div>
      <div class="nutrition-total"><strong>${low}–${high}</strong><span>kcal</span></div>
    </div>
    <div class="nutrition-macro-summary"><span>碳水 ${Number(result.total_carbs_g || 0).toFixed(1)}g</span><span>蛋白质 ${Number(result.total_protein_g || 0).toFixed(1)}g</span><span>脂肪 ${Number(result.total_fat_g || 0).toFixed(1)}g</span></div>
    <div class="nutrition-items">${items}</div>
    <div class="nutrition-result-actions"><p>可修改克数；营养数值按比例重算，仅供估算。</p><button class="outline-button" type="button" data-save-meal ${result.savedLogId ? 'disabled' : ''}>${result.savedLogId ? '已保存到今日记录' : '保存到今日记录'}</button></div>
    <p class="nutrition-summary">${escapeHTML(result.summary || '照片估算受拍摄角度、配料和份量影响。')}</p>
    <p class="nutrition-caution">估算区间不等于称重结果。油、酱料、饮料和隐藏配料可能造成明显差异；包装食品请优先参考营养标签。</p>`;
  target.hidden = false;
}

function receiveNutritionResult(result) {
  if (!result.recognized || !result.items?.length) {
    activeNutritionResult = null;
    nutritionBaseItems = [];
    renderNutritionResult(result);
    return;
  }
  nutritionBaseItems = result.items.map((item) => ({ ...item }));
  activeNutritionResult = { ...result, items: nutritionBaseItems.map((item) => ({ ...item })) };
  renderNutritionResult(activeNutritionResult);
}

function recalculateNutritionTotals(result) {
  result.total_kcal_low = result.items.reduce((sum, item) => sum + item.kcal_low, 0);
  result.total_kcal_high = result.items.reduce((sum, item) => sum + item.kcal_high, 0);
  for (const field of ['carbs_g', 'protein_g', 'fat_g']) {
    result[`total_${field}`] = Math.round(result.items.reduce((sum, item) => sum + item[field], 0) * 10) / 10;
  }
}

function updateNutritionPortion(input) {
  const index = Number(input.dataset.nutritionGrams);
  const baseItem = nutritionBaseItems[index];
  if (!activeNutritionResult || !baseItem) return;
  const parsed = Number(input.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    input.value = activeNutritionResult.items[index].grams;
    return;
  }
  const grams = Math.max(1, Math.min(3000, Math.round(parsed)));
  const ratio = grams / Math.max(1, Number(baseItem.grams) || 1);
  activeNutritionResult.items[index] = {
    ...baseItem,
    grams,
    kcal_low: Math.round(baseItem.kcal_low * ratio),
    kcal_high: Math.round(baseItem.kcal_high * ratio),
    carbs_g: Math.round(baseItem.carbs_g * ratio * 10) / 10,
    protein_g: Math.round(baseItem.protein_g * ratio * 10) / 10,
    fat_g: Math.round(baseItem.fat_g * ratio * 10) / 10
  };
  recalculateNutritionTotals(activeNutritionResult);
  renderNutritionResult(activeNutritionResult);
}

function getTodayNutritionTotals() {
  const today = dateKey(new Date());
  const logs = state.mealLogs.filter((log) => log.date === today);
  const kcalLow = logs.reduce((sum, log) => sum + (Number(log.totalKcalLow) || 0), 0);
  const kcalHigh = logs.reduce((sum, log) => sum + (Number(log.totalKcalHigh) || 0), 0);
  return {
    logs,
    kcalLow,
    kcalHigh,
    kcal: (kcalLow + kcalHigh) / 2,
    carbs: logs.reduce((sum, log) => sum + (Number(log.carbs) || 0), 0),
    protein: logs.reduce((sum, log) => sum + (Number(log.protein) || 0), 0),
    fat: logs.reduce((sum, log) => sum + (Number(log.fat) || 0), 0)
  };
}

function getNutritionTargets() {
  const autoEnergy = state.energyMode === 'auto' ? estimateMaintenanceEnergy(state.profile) : null;
  const energy = autoEnergy === null
    ? Math.min(5000, Math.max(1000, Number(state.energyTarget) || 2000))
    : Math.round(autoEnergy / 50) * 50;
  const range = (lowRatio, highRatio, kcalPerGram) => ({
    low: energy * lowRatio / kcalPerGram,
    high: energy * highRatio / kcalPerGram,
    mid: energy * (lowRatio + highRatio) / 2 / kcalPerGram
  });
  const goalType = normalizeGoalType(state.profile.goalType, PROFILE_GOAL_SCHEMA_VERSION);
  const age = Number(state.profile.age);
  const weight = Number(state.profile.weight);
  const exerciseProtein = goalType === 'muscle_gain' && age >= 19 && Number.isFinite(weight) && weight >= 35 && weight <= 200;
  const protein = exerciseProtein
    ? { low: weight * 1.4, high: weight * 2.0, mid: weight * 1.7, rangeLabel: `${Math.round(weight * 1.4)}–${Math.round(weight * 2.0)} g · 1.4–2.0 g/kg` }
    : range(.10, .15, 4);
  return {
    energy,
    autoEnergy: autoEnergy !== null,
    carbs: range(.50, .65, 4),
    protein,
    fat: range(.20, .30, 9),
    proteinBasis: exerciseProtein ? '运动成年人参考值（ISSN）' : '宏量营养素供能参考（WS/T 578.1—2017）'
  };
}

function estimateMaintenanceEnergy(profile) {
  const age = Number(profile.age);
  const height = Number(profile.heightCm);
  const weight = Number(profile.weight);
  const equation = {
    female: {
      inactive: [584.90, -7.01, 5.72, 11.71], lowActive: [575.77, -7.01, 6.60, 12.14],
      active: [710.25, -7.01, 6.54, 12.34], veryActive: [511.83, -7.01, 9.07, 12.56]
    },
    male: {
      inactive: [753.07, -10.83, 6.50, 14.10], lowActive: [581.47, -10.83, 8.30, 14.94],
      active: [1004.82, -10.83, 6.52, 15.91], veryActive: [-517.88, -10.83, 15.61, 19.11]
    }
  };
  const coefficients = equation[profile.energySex]?.[profile.activityLevel];
  if (!coefficients || age < 19 || age > 100 || height < 120 || height > 220 || weight < 35 || weight > 200) return null;
  const [intercept, ageSlope, heightSlope, weightSlope] = coefficients;
  const estimate = intercept + ageSlope * age + heightSlope * height + weightSlope * weight;
  return Number.isFinite(estimate) && estimate >= 1000 && estimate <= 5000 ? estimate : null;
}

function getMissingMaintenanceFields(profile) {
  const missing = [];
  const age = Number(profile.age);
  const height = Number(profile.heightCm);
  const weight = Number(profile.weight);
  if (!Number.isFinite(age) || age < 19 || age > 100) missing.push('年龄（19–100岁）');
  if (!Number.isFinite(height) || height < 120 || height > 220) missing.push('身高（120–220 cm）');
  if (!Number.isFinite(weight) || weight < 35 || weight > 200) missing.push('有效体重（35–200 kg）');
  if (!['female', 'male'].includes(profile.energySex)) missing.push('能量公式类别');
  if (!['inactive', 'lowActive', 'active', 'veryActive'].includes(profile.activityLevel)) missing.push('日常活动等级');
  return missing;
}

function estimateRestingEnergy(profile) {
  const age = Number(profile.age);
  const height = Number(profile.heightCm);
  const weight = Number(profile.weight);
  if (!Number.isFinite(age) || age < 19 || age > 78 || !Number.isFinite(height) || height < 120 || height > 220
    || !Number.isFinite(weight) || weight < 35 || weight > 200 || !['female', 'male'].includes(profile.energySex)) return null;
  const sexConstant = profile.energySex === 'male' ? 5 : -161;
  const estimate = 10 * weight + 6.25 * height - 5 * age + sexConstant;
  return Number.isFinite(estimate) && estimate > 0 ? Math.round(estimate) : null;
}

function getTodayExerciseSummary() {
  const today = dateKey(new Date());
  const actionLogs = state.exerciseLogs.filter((log) => log.date === today && !log.demo);
  const sessionLogs = state.trainingLogs.filter((log) => log.date === today && !log.demo);
  const legacyLogs = sessionLogs.filter((log) => !Array.isArray(log.exerciseLogIds));
  const manual = Number(state.manualExerciseKcal?.[today]) || 0;
  const sessionIds = new Set([
    ...actionLogs.map((log) => log.sessionId),
    ...legacyLogs.map((log, index) => log.sessionId || `${log.date}-${log.title || index}`)
  ]);
  return {
    low: actionLogs.reduce((sum, log) => sum + (Number(log.kcalLow) || 0), 0)
      + legacyLogs.reduce((sum, log) => sum + (Number(log.kcalLow) || 0), 0) + manual,
    high: actionLogs.reduce((sum, log) => sum + (Number(log.kcalHigh) || 0), 0)
      + legacyLogs.reduce((sum, log) => sum + (Number(log.kcalHigh) || 0), 0) + manual,
    minutes: actionLogs.reduce((sum, log) => sum + (Number(log.minutes) || 0), 0)
      + legacyLogs.reduce((sum, log) => sum + (Number(log.minutes) || 0), 0),
    sessions: sessionIds.size,
    actionLogs,
    manual
  };
}

function syncManualExerciseEntry() {
  const exercise = getTodayExerciseSummary();
  const calorieManualInput = document.getElementById('manualExerciseKcalInputCalories');
  if (calorieManualInput && document.activeElement !== calorieManualInput) {
    calorieManualInput.value = exercise.manual ? String(exercise.manual) : '';
  }
}

function renderCaloriesDashboard() {
  const root = document.getElementById('calorieDashboard');
  if (!root) return;
  const nutrition = getTodayNutritionTotals();
  const exercise = getTodayExerciseSummary();
  const targets = getNutritionTargets();
  const resting = estimateRestingEnergy(state.profile);
  const intake = nutrition.logs.length ? `${Math.round(nutrition.kcalLow)}–${Math.round(nutrition.kcalHigh)}` : '—';
  const burn = exercise.low === exercise.high ? `${exercise.low}` : `${exercise.low}–${exercise.high}`;
  const subtotal = resting === null ? '—' : `${resting + exercise.low}–${resting + exercise.high}`;
  const targetPercent = Math.min(100, Math.max(0, (nutrition.kcal / Math.max(1, targets.energy)) * 100));
  document.getElementById('calorieTodayLabel').textContent = formatToday();
  document.getElementById('calorieIntakeValue').textContent = intake;
  document.getElementById('calorieIntakeTarget').textContent = `${Math.round(nutrition.kcal)} / ${targets.energy} kcal`;
  document.getElementById('calorieIntakeProgress').style.width = `${targetPercent.toFixed(1)}%`;
  document.getElementById('calorieBurnValue').textContent = exercise.low || exercise.high ? burn : '—';
  const burnDetails = [];
  if (exercise.actionLogs.length) burnDetails.push(`${exercise.actionLogs.length} 个动作 · ${exercise.minutes} 分钟`);
  else if (exercise.minutes) burnDetails.push(`${exercise.sessions} 组训练 · ${exercise.minutes} 分钟`);
  if (exercise.manual) burnDetails.push(`其他运动 ${exercise.manual} kcal`);
  document.getElementById('calorieBurnDetail').textContent = burnDetails.join(' · ') || '完成一个训练动作后自动汇总';
  document.getElementById('calorieRestingValue').textContent = resting === null ? '—' : `${resting} kcal`;
  document.getElementById('calorieRestingDetail').textContent = resting === null ? '补齐年龄、身高、体重和公式类别后估算' : 'Mifflin–St Jeor 静息能量估算';
  document.getElementById('calorieSubtotalValue').textContent = `${subtotal} kcal`;
  document.getElementById('calorieMacroSummary').textContent = nutrition.logs.length
    ? `碳水 ${nutrition.carbs.toFixed(1)} g · 蛋白质 ${nutrition.protein.toFixed(1)} g · 脂肪 ${nutrition.fat.toFixed(1)} g`
    : '记入餐食后显示碳水、蛋白质和脂肪合计';

  const meals = nutrition.logs.slice().reverse().map((log) => `<li><span><strong>${escapeHTML(log.title || '餐食')}</strong><small>${escapeHTML(log.time || '')} · ${escapeHTML(log.source || '摄入记录')}</small></span><b>${Math.round(Number(log.totalKcalLow) || 0)}–${Math.round(Number(log.totalKcalHigh) || 0)} kcal</b></li>`).join('');
  document.getElementById('calorieIntakeLog').innerHTML = meals || '<li class="calorie-empty">今天还没有摄入记录；在「吃点好」拍照估算、选餐或配食材后记入。</li>';
  const actionRows = exercise.actionLogs.slice().reverse().map((log) => `<li><span><strong>${escapeHTML(log.title)}</strong><small>${escapeHTML(log.time || '')} · ${Math.round(Number(log.minutes) || 0)} 分钟 · ${escapeHTML(TRAINING_FOCUS_LABELS[log.focus] || '训练')}</small></span><b>${Math.round(Number(log.kcalLow) || 0)}–${Math.round(Number(log.kcalHigh) || 0)} kcal</b></li>`);
  const legacy = state.trainingLogs.filter((log) => log.date === dateKey(new Date()) && !log.demo && !Array.isArray(log.exerciseLogIds));
  legacy.forEach((log) => actionRows.push(`<li><span><strong>${escapeHTML(log.title || '运动记录')}</strong><small>${Math.round(Number(log.minutes) || 0)} 分钟 · 历史训练记录</small></span><b>${Math.round(Number(log.kcalLow) || 0)}–${Math.round(Number(log.kcalHigh) || 0)} kcal</b></li>`));
  if (exercise.manual) actionRows.push(`<li><span><strong>其他运动</strong><small>手动补记</small></span><b>${exercise.manual} kcal</b></li>`);
  document.getElementById('calorieBurnLog').innerHTML = actionRows.join('') || '<li class="calorie-empty">今天还没有运动消耗记录。</li>';
}

function nutritionRangeStatus(actual, target) {
  if (actual < target.low) return `距参考下限还差 ${Math.ceil(target.low - actual)} g`;
  if (actual > target.high) return `比参考上限多 ${Math.ceil(actual - target.high)} g`;
  return '处于参考区间';
}

function renderNutritionDashboard() {
  const comparison = document.getElementById('nutritionComparison');
  if (!comparison) return;
  const totals = getTodayNutritionTotals();
  const targets = getNutritionTargets();
  const hasLogs = totals.logs.length > 0;
  const energyInput = document.getElementById('energyTargetInput');
  const energyModeToggle = document.getElementById('energyModeToggle');
  const energyTargetNote = document.getElementById('energyTargetNote');
  const isAuto = state.energyMode === 'auto';
  if (energyInput) {
    energyInput.readOnly = isAuto;
    if (document.activeElement !== energyInput) energyInput.value = String(targets.energy);
  }
  if (energyModeToggle) {
    energyModeToggle.textContent = isAuto ? (targets.autoEnergy ? '切换手动' : '改用手动') : '开启自动估算';
    energyModeToggle.setAttribute('aria-pressed', String(isAuto));
  }
  if (energyTargetNote) {
    if (isAuto && !targets.autoEnergy) {
      const missing = getMissingMaintenanceFields(state.profile);
      const detail = missing.length ? `还需补充：${missing.join('、')}` : '现有资料超出自动估算的支持范围';
      energyTargetNote.innerHTML = `当前显示 ${targets.energy} kcal 演示值。${detail}；补齐后会按身高、体重等资料自动重算。<button class="energy-profile-link" id="openEnergyProfile" type="button">完善个人资料</button>`;
    } else {
      energyTargetNote.textContent = isAuto
        ? '按个人资料估算的成年维持能量；记录新体重后会自动重算。个体误差较大，不是减重热量处方。'
        : '当前使用手动能量参考值；体重变化不会自动改变此值。';
    }
  }
  syncManualExerciseEntry();

  const rows = [
    { key: 'carbs', label: '碳水化合物', unit: 'g', actual: totals.carbs, ...targets.carbs },
    { key: 'protein', label: '蛋白质', unit: 'g', actual: totals.protein, ...targets.protein },
    { key: 'fat', label: '脂肪', unit: 'g', actual: totals.fat, ...targets.fat }
  ];
  comparison.innerHTML = rows.map((row) => {
    const percent = Math.min(100, Math.max(0, row.actual / Math.max(1, row.mid) * 100));
    const status = nutritionRangeStatus(row.actual, row);
    const rangeLabel = row.rangeLabel || `${Math.round(row.low)}–${Math.round(row.high)} g`;
    const actualLabel = hasLogs ? `${row.actual.toFixed(1)} <small>${row.unit}</small>` : '<small>未记录</small>';
    return `<article class="nutrition-meter nutrition-meter-${row.key}"><div class="nutrition-meter-top"><div><strong>${row.label}</strong><small>建议 ${rangeLabel}</small></div><b>${actualLabel}</b></div><div class="nutrition-meter-track" role="meter" aria-label="${row.label}实际摄入" aria-valuemin="0" aria-valuemax="${Math.round(row.high)}" aria-valuenow="${Math.round(row.actual)}"><span style="width:${percent.toFixed(1)}%"></span></div><div class="nutrition-meter-foot"><span>${hasLogs ? '实际记录' : '暂无记录'}</span><span>${hasLogs ? status : '记入餐食后开始比较'}</span></div></article>`;
  }).join('');

  const targetWeight = Number(state.profile.target);
  const currentWeight = Number(state.profile.weight);
  const goalLabels = { daily: '日常均衡', fat_loss: '减脂塑形', weight_loss: '减重管理', muscle_gain: '健身增肌' };
  const goalLabel = goalLabels[normalizeGoalType(state.profile.goalType, PROFILE_GOAL_SCHEMA_VERSION)] || '日常均衡';
  const weightGoal = Number.isFinite(targetWeight) && Number.isFinite(currentWeight)
    ? `${goalLabel}：当前 ${currentWeight.toFixed(1)} kg，参考目标 ${targetWeight.toFixed(1)} kg。`
    : `当前方向：${goalLabel}。`;
  const proteinStatus = !hasLogs
    ? '记录一餐后，再看当天蛋白质是否处于参考区间。'
    : totals.protein < targets.protein.low
      ? '目前记录的蛋白质低于当前参考下限；可从蛋、奶、豆制品、鱼或禽肉中挑选一项，再按实际份量记录。'
      : totals.protein > targets.protein.high
        ? '目前记录的蛋白质已高于当前参考区间；样例估值不等于吸收量，不需要为了目标刻意继续增加。'
        : '目前记录的蛋白质已达到当前参考区间下限；继续结合多样食物和实际份量记录。';
  const energyLabel = targets.autoEnergy ? '估算的维持能量' : '你设置的能量';
  const energyStatus = totals.logs.length
    ? `今日记录约 ${Math.round(totals.kcalLow)}–${Math.round(totals.kcalHigh)} kcal；对照${energyLabel} ${targets.energy} kcal，${totals.kcal < targets.energy ? '当前记录低于参考值，后续按饥饿感和日常安排正常进餐' : '当前记录已达到或超过参考值，可继续关注餐食搭配与份量'}。`
    : '还没有今日摄入记录。先记下一餐，系统才可以比较实际摄入。';
  const energyBoundary = targets.autoEnergy && targetWeight < currentWeight
    ? '这只是维持能量估算；系统不会自动扣减热量来制造减重缺口。'
    : '';
  const goalGuidance = {
    daily: '以规律进餐和多样搭配为主。',
    muscle_gain: targets.proteinBasis.includes('ISSN') ? '增肌方向会突出蛋白质记录与力量训练；参考区间不代表需要依赖补剂。' : '增肌方向已选；补充年龄后才会显示运动成年人蛋白参考区间。',
    fat_loss: '减脂方向不自动扣减维持能量，也不把单日差额当成减脂速度。',
    weight_loss: '减重方向不自动制定激进缺口；关注持续记录和每周趋势。'
  }[normalizeGoalType(state.profile.goalType, PROFILE_GOAL_SCHEMA_VERSION)];
  document.getElementById('nutritionGoalImpact').innerHTML = `<strong>和身体目标的关系</strong><p>${goalGuidance} ${weightGoal}${energyStatus} ${proteinStatus} ${energyBoundary}</p><small>这是饮食记录的趋势提示，不是减重速度、体脂变化或健康状况的预测。蛋白质参考：${escapeHTML(targets.proteinBasis)}。</small>`;

  renderCaloriesDashboard();
  renderCampusMatchBoard();
  renderFoodGrid();
}

function addFoodToToday(id) {
  const food = recommendationFoodPool().find((entry) => entry.id === id);
  if (!food) return;
  const catalogId = mealCatalogLogKey('food', food.id);
  if (isMealCatalogItemLoggedToday(catalogId)) {
    notify(`${food.name}今天已经记录过了。`);
    return;
  }
  const now = new Date();
  const log = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    date: dateKey(now),
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    title: food.name,
    source: food.dataOrigin === 'local_menu' ? `团队复核餐品 · ${food.dataDate}` : '演示样例餐食',
    catalogId,
    totalKcalLow: food.kcal,
    totalKcalHigh: food.kcal,
    carbs: food.carbs,
    protein: food.protein,
    fat: food.fat,
    items: [{ name: food.name, servings: 1, sourceUrl: food.nutritionUrl, sourceTitle: food.nutritionBasis }]
  };
  state.mealLogs = [...state.mealLogs, log].slice(-50);
  persist();
  renderNutritionDashboard();
  renderMealPicks();
  syncMealRecordButtons('food', food.id);
  renderDailyNutritionLog();
  notify(`已将${food.name}记入今日摄入。`);
}

function addSisuMenuFoodToToday(id) {
  const item = sisuMenuCatalog?.items?.find((entry) => entry.id === id);
  const estimate = sisuMenuNutritionEstimate(item);
  if (!item || !estimate?.recognized || estimate.status !== 'estimated'
    || !['kcalLow', 'kcalHigh', 'carbsG', 'proteinG', 'fatG'].every((field) => estimate[field] !== null && estimate[field] !== '' && Number.isFinite(Number(estimate[field])))) {
    notify('这道餐食还没有完整的图片营养估算，暂时不能记录。');
    return;
  }
  const catalogId = mealCatalogLogKey('sisu-menu', item.id);
  if (isMealCatalogItemLoggedToday(catalogId)) {
    notify(`${item.name}今天已经记录过了。`);
    return;
  }
  const now = new Date();
  const confidence = { low: '低置信', medium: '中置信', high: '高置信' }[estimate.confidence] || '低置信';
  const log = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    date: dateKey(now),
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    title: item.name,
    source: `上外菜单图片估算 · ${confidence} · 待核对`,
    catalogId,
    estimateKind: 'menu-thumbnail-model-estimate',
    consumedAsActualMeal: true,
    totalKcalLow: Number(estimate.kcalLow),
    totalKcalHigh: Number(estimate.kcalHigh),
    carbs: Number(estimate.carbsG),
    protein: Number(estimate.proteinG),
    fat: Number(estimate.fatG),
    items: [{
      name: item.name,
      recognizedTitle: String(estimate.recognizedTitle || ''),
      servings: 1,
      portionGramsEstimate: Number(estimate.portionGramsEstimate) || null,
      servingAssumption: String(estimate.servingAssumption || '按常见成人单人份估算'),
      confidence: estimate.confidence || 'low',
      estimateNote: String(estimate.note || ''),
      sourceImagePath: String(estimate.sourceImagePath || '')
    }]
  };
  state.mealLogs = [...state.mealLogs, log].slice(-50);
  persist();
  renderNutritionDashboard();
  renderMealPicks();
  syncMealRecordButtons('sisu-menu', item.id);
  renderDailyNutritionLog();
  notify(`已将${item.name}按图片估算的一份计入今日摄入；请核对实际份量。`);
}

function addSourcedFoodToToday(id, button) {
  const food = sourcedFoods.find((entry) => entry.id === id);
  const card = button.closest('.sourced-food-card');
  const grams = Number(card?.querySelector('[data-sourced-food-grams]')?.value);
  if (!food || !Number.isFinite(grams) || grams < 1 || grams > 2000) {
    notify('请输入1–2000克的可食部分重量。');
    return;
  }
  const ratio = grams / 100;
  const now = new Date();
  const log = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    date: dateKey(now),
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    title: `${food.name} · ${Math.round(grams)}g`,
    source: '食物成分来源数据按克数换算',
    totalKcalLow: Math.round(Number(food.energyKjPer100g) / 4.184 * ratio),
    totalKcalHigh: Math.round(Number(food.energyKjPer100g) / 4.184 * ratio),
    carbs: Math.round(Number(food.carbsGPer100g) * ratio * 10) / 10,
    protein: Math.round(Number(food.proteinGPer100g) * ratio * 10) / 10,
    fat: Math.round(Number(food.fatGPer100g) * ratio * 10) / 10,
    items: [{ name: food.name, grams: Math.round(grams), sourceUrl: food.sourceUrl, sourceTitle: food.sourceTitle }]
  };
  state.mealLogs = [...state.mealLogs, log].slice(-50);
  persist();
  renderNutritionDashboard();
  renderDailyNutritionLog();
  notify(`已按${Math.round(grams)}克可食部分记入${food.name}。`);
}

function renderDailyNutritionLog() {
  const target = document.getElementById('dailyNutritionLog');
  if (!target) return;
  const totals = getTodayNutritionTotals();
  const logs = totals.logs.slice().reverse();
  const carbs = Math.round(totals.carbs * 10) / 10;
  const protein = Math.round(totals.protein * 10) / 10;
  const fat = Math.round(totals.fat * 10) / 10;
  const entries = logs.map((log) => `<div class="nutrition-day-entry"><div><strong>${escapeHTML(log.title || '餐食')}</strong><small>${escapeHTML(log.time || '')} · ${escapeHTML(log.source || '拍照估算')} · ${Array.isArray(log.items) ? log.items.length : 0} 类</small></div><span>${Math.round(Number(log.totalKcalLow) || 0)}–${Math.round(Number(log.totalKcalHigh) || 0)} kcal</span><button type="button" data-delete-meal-log="${escapeHTML(log.id)}" aria-label="删除${escapeHTML(log.title || '餐食')}记录">删除</button></div>`).join('');
  target.innerHTML = `<section class="nutrition-day-card"><div class="nutrition-day-head"><div><span class="card-index">TODAY'S FOOD LOG</span><h3>今日饮食记录</h3></div><span>${logs.length} 份</span></div><div class="nutrition-day-totals"><strong>${Math.round(totals.kcalLow)}–${Math.round(totals.kcalHigh)} kcal</strong><span>拍照估算 + 样例餐食 + 来源食材换算</span><span>碳水 ${carbs.toFixed(1)} g</span><span>蛋白质 ${protein.toFixed(1)} g</span><span>脂肪 ${fat.toFixed(1)} g</span></div>${entries || '<p class="nutrition-day-empty">拍照估算保存后，或将样例餐食/来源食材记入今日，这里会显示摄入记录。</p>'}<p class="nutrition-day-estimate-note">上外菜单记录按菜单图片模型估算的一份计入；实际份量和营养可能不同。</p></section>`;
}

function saveNutritionToToday() {
  if (!activeNutritionResult?.items?.length || activeNutritionResult.savedLogId) return;
  const now = new Date();
  const log = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    date: dateKey(now),
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    title: activeNutritionResult.title,
    source: '拍照估算',
    totalKcalLow: activeNutritionResult.total_kcal_low,
    totalKcalHigh: activeNutritionResult.total_kcal_high,
    carbs: activeNutritionResult.total_carbs_g,
    protein: activeNutritionResult.total_protein_g,
    fat: activeNutritionResult.total_fat_g,
    items: activeNutritionResult.items.map((item) => ({ name: item.name, grams: item.grams }))
  };
  state.mealLogs = [...state.mealLogs, log].slice(-50);
  activeNutritionResult.savedLogId = log.id;
  persist();
  renderNutritionResult(activeNutritionResult);
  renderNutritionDashboard();
  renderDailyNutritionLog();
  notify('已保存到本机的今日饮食记录。');
}

function deleteNutritionLog(id) {
  const deletedLog = state.mealLogs.find((log) => log.id === id);
  state.mealLogs = state.mealLogs.filter((log) => log.id !== id);
  persist();
  renderNutritionDashboard();
  renderMealPicks();
  if (deletedLog?.catalogId) {
    const separator = deletedLog.catalogId.indexOf(':');
    if (separator > 0) syncMealRecordButtons(deletedLog.catalogId.slice(0, separator), deletedLog.catalogId.slice(separator + 1));
  }
  renderDailyNutritionLog();
  notify('已删除这条饮食记录。');
}

async function analyzeMealPhoto() {
  if (STATIC_PUBLIC_SITE || !selectedMealImage) return;
  const button = document.getElementById('analyzeMealPhoto');
  const result = document.getElementById('nutritionResult');
  const albumInput = document.getElementById('mealPhotoInput');
  const cameraInput = document.getElementById('mealCameraInput');
  const clearButton = document.getElementById('clearMealPhoto');
  const focusButton = document.getElementById('focusMealPhoto');
  activeNutritionResult = null;
  nutritionBaseItems = [];
  button.disabled = true;
  albumInput.disabled = true;
  cameraInput.disabled = true;
  clearButton.disabled = true;
  focusButton.disabled = true;
  button.innerHTML = '正在识别… <span class="scan-spinner" aria-hidden="true"></span>';
  result.hidden = true;
  setPhotoStatus('正在分析餐食照片，请稍候…');
  const startedAt = performance.now();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), 52000) : null;
  const progressTimer = window.setTimeout(() => {
    setPhotoStatus('照片已发出，模型正在辨认主菜和配料；复杂摆盘可能需要多等一会儿。');
  }, 3500);
  try {
    const response = await fetch('/api/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller?.signal,
      body: JSON.stringify({
        image_data_url: selectedMealImage,
        portion_hint: document.getElementById('mealPortionHint').value.trim()
      })
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      const message = data.error || (response.status === 404
        ? '当前本地服务版本没有照片识别接口。请重启项目服务后刷新页面。'
        : `识别服务返回 HTTP ${response.status}，请按提示检查服务或网络。`);
      throw new Error(message);
    }
    if (!contentType.includes('application/json')) throw new Error('识别接口返回格式异常，请重启最新版 run_server.py 后刷新。');
    receiveNutritionResult(data);
    const elapsedSeconds = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
    setPhotoStatus(`估算完成，用时约 ${elapsedSeconds} 秒。请核对食物和份量；复杂配料无法仅凭照片确定。`);
  } catch (error) {
    const message = error.name === 'AbortError'
      ? '等待超过52秒，识别已停止。请检查电脑服务和网络；复杂摆盘可只拍主菜，或补充菜名与份量后重试。'
      : error instanceof TypeError
        ? '手机连接不到电脑上的识别服务。请确认同一 Wi-Fi、电脑服务未停止，并使用电脑的局域网网址。'
        : error.message || '暂时无法连接识别服务，请稍后重试。';
    setPhotoStatus(message, true);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    window.clearTimeout(progressTimer);
    button.disabled = false;
    albumInput.disabled = false;
    cameraInput.disabled = false;
    clearButton.disabled = !selectedMealImage;
    focusButton.disabled = !selectedMealImage;
    button.innerHTML = '开始估算 <span>↗</span>';
  }
}

async function retryFocusedMealPhoto() {
  if (!selectedMealImage) return;
  const originalImage = selectedMealImage;
  const preview = document.getElementById('mealPhotoPreview');
  const focusButton = document.getElementById('focusMealPhoto');
  focusButton.disabled = true;
  try {
    setPhotoStatus('正在裁掉照片边缘；接下来会再次调用 DeepSeek。');
    selectedMealImage = await cropCenteredMealPhoto(originalImage);
    preview.src = selectedMealImage;
    await analyzeMealPhoto();
  } catch (error) {
    setPhotoStatus(error.message || '照片裁剪失败，请直接上传一张只包含主菜的照片。', true);
  } finally {
    selectedMealImage = originalImage;
    preview.src = originalImage;
    focusButton.disabled = !selectedMealImage;
  }
}

function openProfile() {
  closeOnboarding(false);
  renderProfile();
  const modal = document.getElementById('profileModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('profileName').focus();
}

function closeProfile() {
  const modal = document.getElementById('profileModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function fillOnboardingForm(prefill = false) {
  const form = document.getElementById('onboardingForm');
  form.reset();
  const values = prefill ? {
    name: state.profile.name === '小周' ? '' : state.profile.name,
    universityName: state.profile.universityName || campusById(state.campusId)?.school || '',
    campusName: state.profile.campusName || campusById(state.campusId)?.campus || '',
    weight: state.profile.weight, heightCm: state.profile.heightCm, age: state.profile.age,
    energySex: state.profile.energySex, activityLevel: state.profile.activityLevel,
    goalType: normalizeGoalType(state.profile.goalType, PROFILE_GOAL_SCHEMA_VERSION), target: state.profile.target,
    budget: state.profile.budget, scene: state.profile.scene,
    bodyfat: state.profile.bodyfat, targetBodyfat: state.profile.targetBodyfat,
    foodPreference: state.vegetarianOnly ? 'vegetarian' : state.proteinFocus ? 'high-protein' : 'balanced',
    trainingFocus: state.trainingFocus, trainingEquipment: state.trainingEquipment, trainingDuration: state.trainingDuration
  } : {};
  for (const [key, value] of Object.entries({
    name: 'onboardName', universityName: 'onboardUniversity',
    weight: 'onboardWeight', heightCm: 'onboardHeight', age: 'onboardAge',
    energySex: 'onboardEnergySex', activityLevel: 'onboardActivity', goalType: 'onboardGoalType',
    target: 'onboardTarget', budget: 'onboardBudget', scene: 'onboardScene', bodyfat: 'onboardBodyfat',
    targetBodyfat: 'onboardTargetBodyfat', foodPreference: 'onboardFoodPreference',
    trainingFocus: 'onboardFocus', trainingEquipment: 'onboardEquipment', trainingDuration: 'onboardDuration'
  })) {
    const control = document.getElementById(value);
    if (control && Object.hasOwn(values, key) && values[key] !== null && values[key] !== undefined) control.value = String(values[key]);
  }
  refreshCampusSuggestions(document.getElementById('onboardUniversity'));
}

let onboardingStep = 1;
const onboardingStepNames = ['认识你', '目标与状态', '吃饭与运动'];

function renderOnboardingStep(step = 1) {
  onboardingStep = Math.max(1, Math.min(onboardingStepNames.length, step));
  document.querySelectorAll('[data-onboarding-step]').forEach((page) => {
    const active = Number(page.dataset.onboardingStep) === onboardingStep;
    page.hidden = !active;
    page.classList.toggle('is-active', active);
  });
  document.getElementById('onboardingStepLabel').textContent = onboardingStepNames[onboardingStep - 1];
  document.getElementById('onboardingStepCount').textContent = `第 ${onboardingStep} / ${onboardingStepNames.length} 步`;
  const progress = document.getElementById('onboardingProgress');
  progress.setAttribute('aria-valuenow', String(onboardingStep));
  progress.querySelector('span').style.width = `${onboardingStep / onboardingStepNames.length * 100}%`;
  document.getElementById('onboardingBack').hidden = onboardingStep === 1;
  document.getElementById('onboardingSubmit').textContent = onboardingStep === onboardingStepNames.length ? '生成今日计划' : '下一步';
  const modal = document.querySelector('.onboarding-modal');
  if (modal) modal.scrollTop = 0;
}

function openOnboarding(prefill = false) {
  closeProfile();
  fillOnboardingForm(prefill);
  renderOnboardingStep();
  const modal = document.getElementById('onboardingModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeOnboarding(dismiss = true) {
  const modal = document.getElementById('onboardingModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (dismiss && state && !state.profileOnboardingDismissed) {
    state.profileOnboardingDismissed = true;
    persist();
    renderProfile();
    notify('已进入演示模式；可在个人资料中随时完成建档。');
  }
}

function validateOnboardingStep(step = onboardingStep) {
  const page = document.querySelector(`[data-onboarding-step="${step}"]`);
  const controls = [...page.querySelectorAll('input, select')];
  controls.forEach((control) => {
    if (control.id === 'onboardUniversity') {
      control.setCustomValidity(control.value.trim() ? '' : '请填写此项');
    }
  });
  const invalid = controls.find((control) => !control.checkValidity());
  if (invalid) {
    if (step !== onboardingStep) renderOnboardingStep(step);
    invalid.reportValidity();
    invalid.focus();
    return false;
  }
  return true;
}

function saveOnboarding(event) {
  event.preventDefault();
  if (!validateOnboardingStep()) return;
  if (onboardingStep < onboardingStepNames.length) {
    renderOnboardingStep(onboardingStep + 1);
    document.querySelector(`[data-onboarding-step="${onboardingStep}"] legend`)?.focus({ preventScroll: true });
    return;
  }
  for (let step = 1; step <= onboardingStepNames.length; step += 1) {
    if (!validateOnboardingStep(step)) return;
  }
  const data = new FormData(event.currentTarget);
  const optionalNumber = (key) => {
    const raw = String(data.get(key) || '').trim();
    return raw ? Number(raw) : null;
  };
  const weight = Number(data.get('weight'));
  const universityName = cleanMenuText(data.get('universityName'), 80);
  if (!universityName) {
    notify('请填写高校。');
    renderOnboardingStep(1);
    return;
  }
  const schoolContext = schoolContextForProfile(universityName);
  const campusName = schoolContext.campusName;
  const target = optionalNumber('target');
  const scene = String(data.get('scene') || 'campus');
  const foodPreference = String(data.get('foodPreference') || 'balanced');
  const firstSetup = !state.profileOnboardingDone;
  state.profile = {
    ...state.profile,
    name: String(data.get('name') || '').trim().slice(0, 8) || '朋友',
    weight,
    target: target ?? weight,
    heightCm: optionalNumber('heightCm'),
    age: optionalNumber('age'),
    energySex: String(data.get('energySex') || ''),
    activityLevel: String(data.get('activityLevel') || ''),
    bodyfat: optionalNumber('bodyfat'),
    targetBodyfat: optionalNumber('targetBodyfat'),
    budget: Number(data.get('budget')) || 22,
    scene,
    goalType: normalizeGoalType(String(data.get('goalType') || 'daily')),
    universityName, campusName
  };
  state.campusId = schoolContext.campusId;
  state.scene = scene;
  state.budget = state.profile.budget;
  state.foodBudget = state.profile.budget;
  state.foodSceneFilter = scene;
  state.proteinFocus = foodPreference === 'high-protein';
  state.vegetarianOnly = foodPreference === 'vegetarian';
  state.trainingFocus = String(data.get('trainingFocus') || 'full');
  state.trainingEquipment = String(data.get('trainingEquipment') || 'bodyweight');
  state.trainingDuration = Number(data.get('trainingDuration')) || 25;
  if (state.trainingFocus === 'running') state.trainingEquipment = 'running';
  if (state.trainingFocus === 'gym') state.trainingEquipment = 'gym';
  if (state.trainingEquipment === 'running' && state.trainingFocus !== 'running') state.trainingFocus = 'running';
  if (state.trainingFocus === 'gym' && state.trainingEquipment !== 'gym') state.trainingEquipment = 'gym';
  state.trainingPlanItems = null;
  state.trainingVariant = 0;
  state.activeWorkout = null;
  if (firstSetup) {
    state.completedDays = [];
    state.trainingLogs = [];
    state.exerciseLogs = [];
    state.mealLogs = [];
    state.manualExerciseKcal = {};
    state.weightLog = [{ label: '今天', date: dateKey(new Date()), value: weight, note: '建档体重' }];
  } else {
    state.weightLog = [...(state.weightLog || []), { label: '今天', date: dateKey(new Date()), value: weight, note: '建档更新' }].slice(-100);
  }
  state.profileOnboardingDone = true;
  state.profileOnboardingDismissed = true;
  state.goalSchemaVersion = PROFILE_GOAL_SCHEMA_VERSION;
  persist();
  renderAll();
  closeOnboarding(false);
  notify('个人计划已生成：餐食和训练已按你的选择更新。');
  if (firstSetup) {
    resetAssistantConversation(`档案就绪，${universityName}已选好。需要调整时，点小拾一起安排。`);
  }
}

function renderPageUnitNav(viewName) {
  const nav = document.getElementById('pageUnitNav');
  const list = document.getElementById('pageUnitNavItems');
  const view = document.getElementById(`view-${viewName}`);
  if (!nav || !list || !view) return;
  pageUnitObserver?.disconnect();
  const units = [...view.querySelectorAll('[data-page-unit]')];
  const titles = { today: '今天', food: '吃饭', calories: '摄入消耗', training: '训练', progress: '进度' };
  document.getElementById('pageUnitNavTitle').textContent = `${titles[viewName] || '本页'} · 内容单元`;
  nav.hidden = units.length === 0;
  list.innerHTML = units.map((unit, index) => {
    if (!unit.id) unit.id = `page-unit-${viewName}-${index + 1}`;
    const number = String(index + 1).padStart(2, '0');
    return `<button class="page-unit-link" type="button" data-page-unit-target="${escapeHTML(unit.id)}" aria-current="${index === 0 ? 'location' : 'false'}"><span class="page-unit-number">${number}</span><span class="page-unit-label">${escapeHTML(unit.dataset.pageUnit)}</span></button>`;
  }).join('');
  if ('IntersectionObserver' in window) {
    pageUnitObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      list.querySelectorAll('[data-page-unit-target]').forEach((button) => {
        button.setAttribute('aria-current', button.dataset.pageUnitTarget === visible.target.id ? 'location' : 'false');
      });
    }, { rootMargin: '-12% 0px -72% 0px', threshold: 0 });
    units.forEach((unit) => pageUnitObserver.observe(unit));
  }
}

function navigate(viewName) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${viewName}`));
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    const active = button.dataset.viewTarget === viewName;
    if (button.classList.contains('nav-item') || button.closest('.mobile-nav')) {
      button.classList.toggle('active', active);
      if (button.classList.contains('nav-item')) {
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
    }
  });
  const titles = { today: '今天', food: '吃饭', calories: '摄入消耗', training: '训练', progress: '进度' };
  document.getElementById('crumbTitle').textContent = titles[viewName] || titles.today;
  renderPageUnitNav(viewName);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setScene(scene) {
  state.scene = scene;
  state.profile.scene = scene;
  if (state.foodSceneFilter !== 'all') state.foodSceneFilter = scene;
  persist();
  renderMealPicks();
  renderFoodGrid();
  renderProfile();
}

function selectFood(id) {
  const food = foods.find((entry) => entry.id === id);
  if (!food) return;
  state.selectedFoodId = id;
  persist();
  renderMealPicks();
  renderFoodGrid();
  notify(`已选：${food.name} · 样例价 ¥${food.price}`);
}

function setAssistantMascotMood(mood = 'idle', duration = 0) {
  const widget = document.getElementById('assistantWidget');
  if (!widget) return;
  widget.dataset.mood = mood;
  ['greeting', 'thinking', 'happy'].forEach((state) => widget.classList.toggle(`is-${state}`, state === mood));
  const label = document.getElementById('assistantWidgetLabel');
  if (label) label.textContent = '找小拾聊聊';
  window.clearTimeout(assistantMascotMoodTimer);
  if (duration > 0) {
    assistantMascotMoodTimer = window.setTimeout(() => setAssistantMascotMood('idle'), duration);
  }
}

function playWelcomeMascotReaction() {
  const mascot = document.getElementById('welcomeMascot');
  if (!mascot) return;
  const reactions = [
    { name: 'hop', message: '小拾来啦！' },
    { name: 'wiggle', message: '今天也加油呀！' },
    { name: 'pop', message: '先从一小步开始！' },
    { name: 'nod', message: '让我陪你安排～' }
  ];
  const choices = reactions.filter(({ name }) => name !== mascot.dataset.reaction);
  const selected = choices[Math.floor(Math.random() * choices.length)];
  reactions.forEach(({ name }) => mascot.classList.remove(`is-welcome-reaction-${name}`));
  window.clearTimeout(welcomeMascotReactionTimer);
  void mascot.offsetWidth;
  mascot.dataset.reaction = selected.name;
  mascot.classList.add(`is-welcome-reaction-${selected.name}`);
  const bubble = document.getElementById('welcomeMascotReaction');
  if (bubble) {
    bubble.textContent = selected.message;
    bubble.hidden = false;
    bubble.classList.remove('is-visible');
    void bubble.offsetWidth;
    bubble.classList.add('is-visible');
  }
  welcomeMascotReactionTimer = window.setTimeout(() => {
    mascot.classList.remove(`is-welcome-reaction-${selected.name}`);
    if (bubble) {
      bubble.classList.remove('is-visible');
      bubble.hidden = true;
    }
  }, 3000);
}

function setAssistantDialogOpen(open) {
  const dialog = document.getElementById('assistantDialog');
  const toggle = document.getElementById('assistantWidgetToggle');
  const widget = document.getElementById('assistantWidget');
  if (!dialog || !toggle) return;
  dialog.hidden = !open;
  widget?.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? '关闭小拾助手' : '打开小拾助手');
  setAssistantMascotMood(assistantBusy ? 'thinking' : 'idle');
  if (open) window.setTimeout(() => document.getElementById('assistantInput')?.focus(), 80);
}

function setupAssistantWidgetDrag() {
  const toggle = document.getElementById('assistantWidgetToggle');
  if (!toggle || toggle.dataset.dragReady === 'true') return;
  toggle.dataset.dragReady = 'true';
  const storageKey = 'shiheng-assistant-widget-position-v1';
  const edge = 8;
  const getBounds = () => {
    const rect = toggle.getBoundingClientRect();
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    return {
      width: rect.width,
      height: rect.height,
      minX: edge,
      maxX: Math.max(edge, window.innerWidth - rect.width - edge),
      minY: mobile ? 62 : edge,
      maxY: Math.max(mobile ? 62 : edge, window.innerHeight - rect.height - (mobile ? 88 : edge))
    };
  };
  const placeAt = (x, y) => {
    const bounds = getBounds();
    const left = Math.min(bounds.maxX, Math.max(bounds.minX, x));
    const top = Math.min(bounds.maxY, Math.max(bounds.minY, y));
    toggle.style.left = `${left}px`;
    toggle.style.top = `${top}px`;
    toggle.style.right = 'auto';
    toggle.style.bottom = 'auto';
    return { x: left, y: top };
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) placeAt(saved.x, saved.y);
  } catch (error) {
    console.warn('小拾位置读取失败，使用默认位置。', error);
  }

  let drag = null;
  let suppressClick = false;
  let suppressTimer = 0;
  toggle.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const rect = toggle.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
  });
  toggle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      toggle.classList.add('is-dragging');
      try { toggle.setPointerCapture(event.pointerId); } catch (error) { /* capture may be unavailable in an embedded webview */ }
    }
    event.preventDefault();
    placeAt(drag.left + dx, drag.top + dy);
  });
  const finishDrag = (event) => {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    if (drag.moved) {
      const rect = toggle.getBoundingClientRect();
      try { localStorage.setItem(storageKey, JSON.stringify({ x: rect.left, y: rect.top })); } catch (error) { /* position remains usable for this page view */ }
      suppressClick = true;
      window.clearTimeout(suppressTimer);
      suppressTimer = window.setTimeout(() => { suppressClick = false; }, 450);
      toggle.classList.remove('is-dragging');
      if (event && toggle.hasPointerCapture?.(event.pointerId)) toggle.releasePointerCapture(event.pointerId);
    }
    drag = null;
  };
  toggle.addEventListener('pointerup', finishDrag);
  toggle.addEventListener('pointercancel', finishDrag);
  toggle.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('resize', () => {
    if (!toggle.style.left || !toggle.style.top) return;
    const current = toggle.getBoundingClientRect();
    placeAt(current.left, current.top);
    try { localStorage.setItem(storageKey, JSON.stringify({ x: toggle.getBoundingClientRect().left, y: toggle.getBoundingClientRect().top })); } catch (error) { /* keep current position */ }
  }, { passive: true });
}

function appendAssistantTurn(message) {
  setAssistantMascotMood('thinking');
  const log = document.getElementById('assistantChatLog');
  if (!log) return;
  if (!assistantConversationHistory.length && log.children.length === 1) log.replaceChildren();
  log.querySelector('#assistantResponse')?.removeAttribute('id');
  const userMessage = document.createElement('div');
  userMessage.className = 'assistant-user-message';
  userMessage.textContent = message;
  const response = document.createElement('div');
  response.className = 'assistant-response';
  response.id = 'assistantResponse';
  response.setAttribute('aria-live', 'polite');
  response.innerHTML = '<span class="response-mark" aria-hidden="true"></span><span>正在整理你的今日安排…</span>';
  log.append(userMessage, response);
  while (log.children.length > 8) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;
}

function resetAssistantConversation(message = '嗨，我是小拾。今天有什么变化？告诉我时间、预算或状态，我陪你一起安排。') {
  const log = document.getElementById('assistantChatLog');
  if (!log) return;
  assistantConversationHistory = [];
  log.innerHTML = `<div class="assistant-response" id="assistantResponse"><span class="response-mark" aria-hidden="true"></span><span>${escapeHTML(message)}</span></div>`;
  document.getElementById('assistantPlanLink').hidden = true;
}

function showAssistantMessage(message, trace = '读取偏好 → 筛选样例 → 重新排计划') {
  if (message.startsWith('正在')) setAssistantMascotMood('thinking');
  else setAssistantMascotMood('happy', 1500);
  const response = document.getElementById('assistantResponse');
  if (!response) return;
  response.classList.remove('assistant-plan-response');
  response.innerHTML = `<span class="response-mark" aria-hidden="true"></span><span>${escapeHTML(message)}<small class="agent-trace">${escapeHTML(trace)}</small></span>`;
  const log = document.getElementById('assistantChatLog');
  if (log) log.scrollTop = log.scrollHeight;
}

function showAssistantPlanCard({ opening, meal, training, source }) {
  const response = document.getElementById('assistantResponse');
  const log = document.getElementById('assistantChatLog');
  if (!response || !log) return;
  document.getElementById('assistantDialog')?.classList.add('has-generated-plan');
  setAssistantMascotMood('happy', 1500);
  response.classList.add('assistant-plan-response');
  response.replaceChildren();

  const top = document.createElement('div');
  top.className = 'assistant-plan-card-top';
  const eyebrow = document.createElement('span');
  eyebrow.textContent = '小拾 · 今日安排';
  const service = document.createElement('span');
  service.className = 'assistant-plan-source';
  service.textContent = source === 'function_call' || source === 'chat_json'
    ? `${assistantTextProvider === 'deepseek' ? 'DeepSeek' : '千问'}理解 · 本地校验`
    : source === 'local_demo' ? '本地演示' : '本地规则兜底';
  top.append(eyebrow, service);

  const intro = document.createElement('p');
  intro.className = 'assistant-plan-intro';
  intro.textContent = opening || '我把餐食和训练放在一起排好了一版，你可以按今天状态再微调。';

  const grid = document.createElement('div');
  grid.className = 'assistant-plan-grid';
  const makePlanPart = (kind, title, detail, mark) => {
    const part = document.createElement('section');
    part.className = `assistant-plan-part assistant-plan-${kind}`;
    const label = document.createElement('span');
    label.className = 'assistant-plan-part-label';
    label.textContent = kind === 'meal' ? 'EAT · 餐食参考' : 'MOVE · 训练建议';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const meta = document.createElement('small');
    meta.textContent = detail;
    const marker = document.createElement('span');
    marker.className = 'assistant-plan-part-mark';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = mark;
    part.append(label, heading, meta, marker);
    return part;
  };
  grid.append(
    makePlanPart('meal', meal.title, meal.detail, '食'),
    makePlanPart('move', training.title, training.detail, '练')
  );

  const note = document.createElement('p');
  note.className = 'assistant-plan-note';
  note.textContent = '热量与价格为样例估算；先核对，再记录。';
  response.append(top, intro, grid, note);
  log.scrollTop = log.scrollHeight;
}

async function parseIntentWithModel(message, chatHistory = []) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/plan-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, chat_history: chatHistory.slice(-8) }),
      signal: controller.signal
    });
    return await parsePlanResponse(response);
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderAgentExecutionTrace(source, intent, matchedFoods, fallbackReason = '') {
  const scene = SCENE_LONG[state.scene] || '当前就餐场景';
  const foodConditions = [scene, `预算 ¥${state.budget} 内`];
  if (state.proteinFocus) foodConditions.push('蛋白质优先');
  if (state.vegetarianOnly) foodConditions.push('植物性选项');
  const workout = `${TRAINING_FOCUS_LABELS[state.trainingFocus] || '全身基础'} · ${Math.round(planSummary().minutes)} 分钟`;
  const conditionSource = source === 'function_call' ? `${assistantTextProvider === 'deepseek' ? 'DeepSeek' : '千问'}调用 apply_daily_plan` : source === 'chat_json' ? '结构化提取后，经本地校验' : source === 'local_demo' ? '本地演示模式开启，未发送模型请求' : '模型不可用，自动采用本地解析';
  const steps = [
    ['01 · 条件提取', fallbackReason && source === '本地规则' ? `${conditionSource}（${fallbackReason}）` : conditionSource],
    ['02 · 餐食筛选', `${foodConditions.join(' · ')}；找到 ${matchedFoods} 份本地样例`],
    ['03 · 训练编排', intent.recovery || intent.duration_min || intent.training_focus !== 'none' ? workout : `${workout}（本次未改训练条件）`],
    ['04 · 用户确认', '推荐可编辑；记餐和训练打卡都由你确认']
  ];
  const target = document.getElementById('agentExecutionTrace');
  target.innerHTML = steps.map(([title, detail]) => `<li><strong>${escapeHTML(title)}</strong><span>${escapeHTML(detail)}</span></li>`).join('');
  target.hidden = false;
  document.getElementById('agentExecutionDetails').hidden = false;
}

async function runAssistant(rawText) {
  const text = rawText.trim();
  if (!text || assistantBusy) return;
  const chatHistory = assistantConversationHistory.slice(-8);
  assistantBusy = true;
  appendAssistantTurn(text);
  const assistantInput = document.getElementById('assistantInput');
  const assistantSubmit = document.querySelector('#assistantForm button[type="submit"]');
  const localDemoToggle = document.getElementById('localDemoToggle');
  const planLink = document.getElementById('assistantPlanLink');
  planLink.hidden = true;
  assistantInput.disabled = true;
  assistantSubmit.disabled = true;
  localDemoToggle.disabled = true;
  const localIntent = validateClientIntent(extractIntentLocally(text));
  let intent = localIntent;
  let modelReply = '';
  let source = localDemoMode ? 'local_demo' : '本地规则';
  let fallbackReason = '';
  const modelConfigured = ['direct_configured', 'proxy_configured'].includes(agentServiceMode);
  if (localDemoMode) {
    agentLastRunMode = 'local_demo';
    setAgentModeStatus('local_demo');
    showAssistantMessage('正在使用本地规则调整计划…', '本次不会请求模型');
  } else if (!modelConfigured) {
    agentLastRunMode = 'local_fallback';
    setAgentModeStatus(agentServiceMode === 'local_fallback' ? 'local_fallback' : 'unknown');
    showAssistantMessage('正在用本地规则生成今日安排…', agentServiceMode === 'local_fallback'
      ? '未配置可用模型，直接本地处理，不等待请求超时'
      : '暂时无法确认模型接口，先本地生成；确认状态后可再尝试模型');
  } else {
    agentLastRunMode = 'requesting';
    setAgentModeStatus('requesting');
    showAssistantMessage('正在理解你的描述…', '最多等待 15 秒；超时会使用本地规则继续安排');
    try {
      const modelResult = await parseIntentWithModel(text, chatHistory);
      intent = mergeIntents(localIntent, modelResult.intent, text);
      source = modelResult.mode;
      modelReply = modelResult.reply;
    } catch (error) {
      // Keep the offline parser as a complete path; no second model request is made.
      fallbackReason = error instanceof Error && error.message && error.message !== 'Failed to fetch'
        ? error.message.slice(0, 120)
        : '模型服务暂不可用';
    }
  }
  agentLastRunMode = source === 'function_call' ? 'function_call'
    : source === 'chat_json' ? 'chat_json'
      : source === 'local_demo' ? 'local_demo' : 'local_fallback';
  const modelRequestFailed = !localDemoMode && modelConfigured && Boolean(fallbackReason);
  setAgentModeStatus(source === 'function_call' ? 'function_call_success' : source === 'chat_json' ? 'chat_json_success' : source === 'local_demo' ? 'local_demo' : modelRequestFailed ? 'request_failed' : 'local_fallback');

  const actions = [];
  let trainingChangeHeld = false;
  if (state.activeWorkout && !intent.recovery && (intent.duration_min || intent.training_focus !== 'none')) {
    intent = { ...intent, duration_min: 0, training_focus: 'none' };
    trainingChangeHeld = true;
  }
  if (trainingChangeHeld) actions.push('保留正在跟练的动作安排；结束后可再调整训练');
  let trainingChanged = false;
  if (intent.scene !== 'none') {
    state.scene = intent.scene; state.profile.scene = intent.scene;
    if (state.foodSceneFilter !== 'all') state.foodSceneFilter = intent.scene;
    actions.push(`切换为${SCENE_LONG[intent.scene]}样例`);
  }
  if (intent.budget_max) {
    state.budget = intent.budget_max; state.profile.budget = state.budget; state.foodBudget = state.budget;
    actions.push(`每餐预算¥${state.budget}以内`);
  }
  if (/高蛋白|蛋白质|补充蛋白|不需要蛋白|不要蛋白|不想吃蛋白/.test(text)) state.proteinFocus = intent.protein_focus;
  if (/素食|吃素|纯素|不吃肉|吃荤|荤食|想吃肉/.test(text)) state.vegetarianOnly = intent.vegetarian_only;
  if (intent.protein_focus) actions.push('优先筛选蛋白质相对充足的餐食');
  if (intent.vegetarian_only) actions.push('筛选植物性餐食样例');

  if (intent.recovery || intent.training_focus === 'recovery') {
    state.lastAdjustment = 'recovery';
    state.trainingFocus = 'recovery'; state.trainingEquipment = 'bodyweight'; state.trainingDuration = 15; state.trainingPlanItems = null;
    trainingChanged = true;
    actions.push('改为轻松恢复选项');
  } else {
    if (intent.training_focus !== 'none') {
      const requestedFocus = intent.training_focus === 'lower' ? 'legs' : intent.training_focus === 'upper' ? 'full' : intent.training_focus;
      state.trainingFocus = requestedFocus;
      if (intent.training_focus === 'gym' || (/健身房|器械/.test(text) && ['chest', 'back', 'shoulders', 'legs', 'glutes'].includes(requestedFocus))) state.trainingEquipment = 'gym';
      else if (intent.training_focus === 'running') state.trainingEquipment = 'running';
      else if (state.trainingEquipment === 'running') state.trainingEquipment = 'bodyweight';
      state.trainingPlanItems = null; state.trainingVariant = 0;
      trainingChanged = true;
      actions.push(`训练重点：${TRAINING_FOCUS_LABELS[intent.training_focus]}`);
    }
    if (intent.duration_min) {
      const duration = [15, 20, 25, 30, 35, 40, 45, 50, 60].reduce((closest, option) => Math.abs(option - intent.duration_min) < Math.abs(closest - intent.duration_min) ? option : closest, 15);
      state.trainingDuration = duration;
      if (duration <= 15 && intent.duration_min <= 15 && intent.training_focus === 'none') state.trainingFocus = 'recovery';
      state.trainingPlanItems = null;
      trainingChanged = true;
      state.lastAdjustment = duration <= 15 ? 'recovery' : 'short';
      actions.push(`训练按约${duration}分钟重排`);
    }
  }

  if (trainingChanged) startNewTrainingSession();
  persist();
  renderTrainingPlan(); renderExerciseLibrary(); renderExercises(); renderMealPicks(); renderFoodGrid(); renderWeek(); renderProfile();
  const matchedFoods = candidateFoods({ scene: state.scene, budget: state.budget }).length;
  renderAgentExecutionTrace(source, intent, matchedFoods, fallbackReason);
  const mealSuggestions = candidateFoods({ scene: state.scene, budget: state.budget }).slice(0, 1);
  const recommendedMeal = mealSuggestions.length
    ? `${mealSuggestions[0].name} · 约${mealSuggestions[0].kcal} kcal · ¥${mealSuggestions[0].price}（样例）`
    : '暂时没有符合当前条件的餐食样例';
  const trainingPlan = getTrainingPlan();
  const exerciseNames = trainingPlan
    .map((item) => exerciseCatalog.find((exercise) => exercise.id === item.id))
    .filter((exercise) => exercise?.phase === 'main')
    .map((exercise) => exercise.name);
  const trainingEstimate = planSummary();
  const trainingSummary = `${TRAINING_FOCUS_LABELS[state.trainingFocus] || '全身基础'} · ${Math.round(trainingEstimate.minutes)} 分钟 · 约${trainingEstimate.low}–${trainingEstimate.high} kcal${exerciseNames.length ? ` · ${exerciseNames[0]}` : ''}`;
  const opening = modelReply || (source === 'function_call'
    ? '收到，我按你刚才说的情况安排好了。'
    : '我暂时连不上在线模型，先用本机规则给你排一版。');
  const message = `${opening}\n餐食：${recommendedMeal}\n训练：${trainingSummary}\n以上是样例估算，确认后再记录。`;
  showAssistantPlanCard({
    opening,
    meal: mealSuggestions.length
      ? { title: mealSuggestions[0].name, detail: `约 ${mealSuggestions[0].kcal} kcal · ¥${mealSuggestions[0].price} 样例` }
      : { title: '暂无匹配样例', detail: '可放宽预算或切换就餐场景' },
    training: { title: TRAINING_FOCUS_LABELS[state.trainingFocus] || '全身基础', detail: `${Math.round(trainingEstimate.minutes)} 分钟 · 约 ${trainingEstimate.low}–${trainingEstimate.high} kcal${exerciseNames.length ? ` · ${exerciseNames[0]}` : ''}` },
    source
  });
  assistantConversationHistory = [...chatHistory, { role: 'user', content: text }, { role: 'assistant', content: message }].slice(-8);
  planLink.hidden = false;
  assistantBusy = false;
  assistantInput.disabled = false;
  assistantSubmit.disabled = false;
  localDemoToggle.disabled = false;
  const chatLog = document.getElementById('assistantChatLog');
  if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
}

function replacePlanExercise(index) {
  const plan = [...getTrainingPlan()];
  const currentItem = plan[index];
  const currentExercise = exerciseCatalog.find((entry) => entry.id === currentItem?.id);
  if (!currentExercise) return;
  if (state.exerciseLogs.some((log) => log.sessionId === state.trainingSessionId && log.slotIndex === index)) {
    notify('这个动作已打卡；先撤销完成记录，再更换动作。');
    return;
  }
  const alternatives = exerciseCatalog.filter((exercise) => exercise.phase === currentExercise.phase
    && exerciseMatchesFocus(exercise, state.trainingFocus) && exercise.id !== currentExercise.id
    && equipmentAvailable(exercise));
  if (!alternatives.length) {
    notify('目前没有同类器材的替代动作，可调整训练器材筛选。');
    return;
  }
  const currentIndex = alternatives.findIndex((exercise) => exercise.id === currentItem.id);
  const alternative = alternatives[(currentIndex + 1) % alternatives.length];
  plan[index] = { ...currentItem, id: alternative.id };
  state.trainingPlanItems = plan;
  persist(); renderTrainingPlan(); renderExercises();
  notify(`已替换为：${alternative.name}`);
}

function toggleExerciseComplete(index) {
  const plan = getTrainingPlan();
  const item = plan[index];
  const exercise = exerciseCatalog.find((entry) => entry.id === item?.id);
  if (!item || !exercise) return;
  const sessionId = state.trainingSessionId;
  const existing = state.exerciseLogs.find((log) => log.sessionId === sessionId && log.slotIndex === index);
  if (existing) {
    state.exerciseLogs = state.exerciseLogs.filter((log) => log.id !== existing.id);
    state.trainingLogs = state.trainingLogs.filter((log) => log.sessionId !== sessionId);
    notify(`已撤销「${exercise.name}」打卡，今日消耗已同步扣回。`);
  } else {
    const setRecords = state.activeWorkout?.sessionId === sessionId ? [...(state.activeWorkout.setsByIndex?.[index] || [])] : [];
    const prescription = getExercisePrescription(exercise);
    const completionRatio = setRecords.length && !prescription.timed ? Math.min(1, setRecords.length / prescription.sets) : 1;
    const loggedMinutes = Math.round(Number(item.durationMin) * completionRatio * 2) / 2;
    const estimate = estimateExercise(exercise, loggedMinutes || 0.5);
    const now = new Date();
    state.exerciseLogs.push({
      id: `${sessionId}:${index}`, sessionId, slotIndex: index, date: dateKey(now), time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      title: exercise.name, exerciseId: exercise.id, focus: state.trainingFocus, minutes: loggedMinutes,
      kcalLow: estimate.low, kcalHigh: estimate.high, sets: setRecords, demo: false
    });
    state.exerciseLogs = state.exerciseLogs.slice(-200);
    state.trainingLogs = state.trainingLogs.filter((log) => log.sessionId !== sessionId);
    notify(`「${exercise.name}」已打卡，估算消耗 ${estimate.low}–${estimate.high} kcal。`);
  }
  if (state.activeWorkout?.sessionId === sessionId) {
    state.activeWorkout.currentIndex = nextIncompleteExerciseIndex(plan);
    state.activeWorkout.restEndsAt = 0;
  }
  persist();
  renderTrainingPlan(); renderExercises(); renderWeek(); renderNutritionDashboard();
}

function updatePlanExerciseDuration(index, rawValue) {
  const minutes = Number(rawValue);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 30) {
    notify('单个动作时长请设置为 1–30 分钟。');
    const input = document.querySelector(`[data-plan-duration="${index}"]`);
    if (input) input.value = String(getTrainingPlan()[index]?.durationMin || 4.5);
    return;
  }
  const plan = [...getTrainingPlan()];
  if (!plan[index] || state.exerciseLogs.some((log) => log.sessionId === state.trainingSessionId && log.slotIndex === index)) return;
  plan[index] = { ...plan[index], durationMin: Math.round(minutes * 2) / 2 };
  state.trainingPlanItems = plan;
  persist();
  const input = document.querySelector(`[data-plan-duration="${index}"]`);
  const card = input?.closest('.training-step-card');
  const exercise = exerciseCatalog.find((entry) => entry.id === plan[index].id);
  if (input) input.value = String(plan[index].durationMin);
  if (card && exercise) {
    const estimate = estimateExercise(exercise, plan[index].durationMin);
    card.querySelector('.training-step-side > strong').textContent = `${estimate.low}–${estimate.high}`;
  }
  const summary = planSummary(plan);
  document.getElementById('planKcal').textContent = `${summary.low}–${summary.high}`;
  document.getElementById('planMinutes').textContent = Math.round(summary.minutes);
  renderExercises();
}

function recordTraining(effort) {
  const existing = state.trainingLogs.find((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId && !log.demo);
  if (existing) {
    notify('这组训练已经记录过了。');
    return;
  }
  const completed = state.exerciseLogs.filter((log) => log.date === dateKey(new Date()) && log.sessionId === state.trainingSessionId);
  if (!completed.length) {
    notify('先完成并打卡至少一个动作，再记录本组训练。');
    return;
  }
  const summary = completed.reduce((total, log) => ({
    minutes: total.minutes + Number(log.minutes || 0), low: total.low + Number(log.kcalLow || 0), high: total.high + Number(log.kcalHigh || 0)
  }), { minutes: 0, low: 0, high: 0 });
  const title = `${TRAINING_FOCUS_LABELS[state.trainingFocus] || '基础训练'} · ${trainingEquipmentLabel()}`;
  state.trainingLogs.push({
    date: dateKey(new Date()), title, minutes: Math.round(summary.minutes), kcalLow: summary.low,
    kcalHigh: summary.high, effort, sessionId: state.trainingSessionId, exerciseLogIds: completed.map((log) => log.id),
    exerciseIds: completed.map((log) => log.exerciseId),
    sessionElapsedSeconds: state.activeWorkout?.sessionId === state.trainingSessionId
      ? Math.max(0, Math.floor((Date.now() - state.activeWorkout.startedAt) / 1000)) : 0,
    demo: false
  });
  state.trainingLogs = state.trainingLogs.slice(-30);
  state.lastAdjustment = effort;
  state.activeWorkout = null;
  persist(); renderTrainingPlan(); renderExercises(); renderWeek(); renderNutritionDashboard();
  syncGuidedClock();
  notify('已将完成动作和体感记入本周记录。');
}

function saveManualExerciseEntry(inputId = 'manualExerciseKcalInputCalories') {
  const input = document.getElementById(inputId);
  const rawValue = input.value.trim();
  const value = rawValue ? Number(rawValue) : 0;
  if (!Number.isFinite(value) || value < 0 || value > 5000) {
    notify('其他运动消耗请填写 0–5000 kcal。');
    return;
  }
  const today = dateKey(new Date());
  if (value) {
    state.manualExerciseKcal ||= {};
    state.manualExerciseKcal[today] = Math.round(value);
  } else if (state.manualExerciseKcal) delete state.manualExerciseKcal[today];
  if (!state.manualExerciseKcal || !Object.keys(state.manualExerciseKcal).length) delete state.manualExerciseKcal;
  persist(); renderNutritionDashboard();
  notify(value ? `已记录今天其他运动消耗 ${Math.round(value)} kcal。` : '已清除今天其他运动记录。');
}

function saveProfile(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get('name') || '').trim().slice(0, 8) || '朋友';
  const universityName = cleanMenuText(formData.get('universityName'), 80);
  if (!universityName) {
    notify('请填写高校。');
    document.getElementById('profileUniversity').focus();
    return;
  }
  const schoolContext = schoolContextForProfile(universityName);
  const campusName = schoolContext.campusName;
  const optionalNumber = (key) => {
    const value = String(formData.get(key) || '').trim();
    return value ? Number(value) : null;
  };
  state.profile = {
    ...state.profile,
    name,
    weight: Number(formData.get('weight')),
    target: Number(formData.get('target')),
    heightCm: optionalNumber('heightCm'),
    age: optionalNumber('age'),
    energySex: String(formData.get('energySex') || ''),
    activityLevel: String(formData.get('activityLevel') || ''),
    bodyfat: optionalNumber('bodyfat'),
    targetBodyfat: optionalNumber('targetBodyfat'),
    budget: Number(formData.get('budget')),
    scene: String(formData.get('scene')),
    goalType: normalizeGoalType(String(formData.get('goalType') || state.profile.goalType || 'daily')),
    universityName, campusName
  };
  state.campusId = schoolContext.campusId;
  state.scene = state.profile.scene;
  state.budget = state.profile.budget;
  state.foodBudget = state.budget;
  state.foodSceneFilter = state.profile.scene;
  state.profileOnboardingDone = true;
  state.profileOnboardingDismissed = true;
  state.goalSchemaVersion = PROFILE_GOAL_SCHEMA_VERSION;
  persist(); renderAll(); closeProfile();
  notify('演示档案已更新。');
}

function exportProfileData() {
  const backup = {
    format: 'shiheng-backup', version: 1, exportedAt: new Date().toISOString(), data: state
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `shiheng-backup-${dateKey(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('本地备份文件已导出。');
}

function safeBackupText(value, maxLength, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

function validBackupNumber(value, min, max, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function validateProfileBackup(payload) {
  if (!payload || payload.format !== 'shiheng-backup' || payload.version !== 1
    || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    throw new Error('文件格式不正确；请选择拾衡导出的 JSON 备份。');
  }
  const source = payload.data;
  if (!source.profile || typeof source.profile !== 'object' || Array.isArray(source.profile)) throw new Error('备份中缺少有效档案。');
  const profile = { ...DEFAULT_PROFILE, ...source.profile };
  const profileRanges = [['weight', 35, 200], ['target', 35, 200], ['budget', 8, 100]];
  for (const [key, min, max] of profileRanges) {
    if (validBackupNumber(profile[key], min, max) === null) throw new Error(`备份中的档案字段「${key}」不在允许范围内。`);
    profile[key] = Number(profile[key]);
  }
  for (const key of ['bodyfat', 'targetBodyfat']) {
    if (profile[key] === null || profile[key] === '') profile[key] = null;
    else {
      const value = validBackupNumber(profile[key], 5, 60);
      if (value === null) throw new Error(`备份中的档案字段「${key}」不在允许范围内。`);
      profile[key] = value;
    }
  }
  profile.name = safeBackupText(profile.name, 8, '朋友') || '朋友';
  profile.universityName = safeBackupText(profile.universityName, 80);
  profile.campusName = safeBackupText(profile.campusName, 80);
  profile.heightCm = validBackupNumber(profile.heightCm, 120, 220);
  profile.age = validBackupNumber(profile.age, 18, 100);
  profile.energySex = ['female', 'male', ''].includes(profile.energySex) ? profile.energySex : '';
  profile.activityLevel = ['inactive', 'lowActive', 'active', 'veryActive', ''].includes(profile.activityLevel) ? profile.activityLevel : '';
  profile.scene = ['campus', 'convenience', 'market'].includes(profile.scene) ? profile.scene : 'campus';
  profile.goalType = normalizeGoalType(profile.goalType, Number(source.goalSchemaVersion) || 1);

  const cleanDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const cleanSets = (sets) => Array.isArray(sets) ? sets.slice(0, 12).map((set) => ({
    reps: validBackupNumber(set?.reps, 1, 200),
    weightKg: validBackupNumber(set?.weightKg, 0, 300),
    completedAt: safeBackupText(set?.completedAt, 32)
  })) : [];
  const trainingLogs = Array.isArray(source.trainingLogs) ? source.trainingLogs.slice(-30).filter((log) => log && cleanDate(log.date))
    .map((log) => ({
      date: log.date, title: safeBackupText(log.title, 80, '训练记录'), minutes: validBackupNumber(log.minutes, 0, 300, 0),
      kcalLow: validBackupNumber(log.kcalLow, 0, 5000, 0), kcalHigh: validBackupNumber(log.kcalHigh, 0, 5000, 0),
      effort: ['easy', 'moderate', 'hard', 'in_progress'].includes(log.effort) ? log.effort : 'moderate',
      sessionId: safeBackupText(log.sessionId, 100), exerciseLogIds: Array.isArray(log.exerciseLogIds) ? log.exerciseLogIds.slice(0, 40).map((id) => safeBackupText(id, 120)) : [],
      exerciseIds: Array.isArray(log.exerciseIds) ? log.exerciseIds.slice(0, 40).map((id) => safeBackupText(id, 80)) : [],
      sessionElapsedSeconds: validBackupNumber(log.sessionElapsedSeconds, 0, 18 * 60 * 60, 0), demo: Boolean(log.demo)
    })) : [];
  const exerciseLogs = Array.isArray(source.exerciseLogs) ? source.exerciseLogs.slice(-200).filter((log) => log && cleanDate(log.date) && typeof log.id === 'string' && typeof log.sessionId === 'string')
    .map((log) => ({
      id: safeBackupText(log.id, 120), sessionId: safeBackupText(log.sessionId, 100), slotIndex: validBackupNumber(log.slotIndex, 0, 60, 0),
      date: log.date, time: safeBackupText(log.time, 12), title: safeBackupText(log.title, 80, '动作记录'), exerciseId: safeBackupText(log.exerciseId, 80),
      focus: safeBackupText(log.focus, 24), minutes: validBackupNumber(log.minutes, 0, 300, 0),
      kcalLow: validBackupNumber(log.kcalLow, 0, 5000, 0), kcalHigh: validBackupNumber(log.kcalHigh, 0, 5000, 0), sets: cleanSets(log.sets), demo: Boolean(log.demo)
    })) : [];
  const mealLogs = Array.isArray(source.mealLogs) ? source.mealLogs.slice(-50).filter((log) => log && cleanDate(log.date) && typeof log.id === 'string')
    .map((log) => ({
      id: safeBackupText(log.id, 100), date: log.date, time: safeBackupText(log.time, 12), title: safeBackupText(log.title, 120, '餐食记录'),
      source: safeBackupText(log.source, 100), totalKcalLow: validBackupNumber(log.totalKcalLow, 0, 10000, 0),
      totalKcalHigh: validBackupNumber(log.totalKcalHigh, 0, 10000, 0), carbs: validBackupNumber(log.carbs, 0, 2000, 0),
      protein: validBackupNumber(log.protein, 0, 2000, 0), fat: validBackupNumber(log.fat, 0, 2000, 0),
      items: Array.isArray(log.items) ? log.items.slice(0, 30).map((item) => ({
        name: safeBackupText(item?.name, 80, '食材'), servings: validBackupNumber(item?.servings, 0, 100),
        grams: validBackupNumber(item?.grams, 0, 10000),
        sourceUrl: /^https?:\/\//i.test(String(item?.sourceUrl || '')) ? safeBackupText(item.sourceUrl, 500) : undefined,
        sourceTitle: safeBackupText(item?.sourceTitle, 200)
      })) : []
    })) : [];
  const weightLog = Array.isArray(source.weightLog) ? source.weightLog.slice(-100).filter((log) => log && validBackupNumber(log.value, 35, 200) !== null)
    .map((log) => ({ label: safeBackupText(log.label, 32), value: Number(log.value), note: safeBackupText(log.note, 80) })) : [];

  const today = dateKey(new Date());
  const sameDaySession = source.trainingSessionDate === today && typeof source.trainingSessionId === 'string'
    && /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[A-Za-z0-9]{8}$/.test(source.trainingSessionId);
  const planItems = Array.isArray(source.trainingPlanItems) && source.trainingPlanItems.length <= 60
    ? source.trainingPlanItems.every((item) => item && typeof item.id === 'string' && exerciseCatalog.some((exercise) => exercise.id === item.id)
      && validBackupNumber(item.durationMin, 1, 30) !== null)
      ? source.trainingPlanItems.map((item) => ({ id: item.id, durationMin: Number(item.durationMin), round: validBackupNumber(item.round, 1, 40, 1) })) : null
    : null;
  const restored = {
    ...freshState(), ...source, profile,
    profileOnboardingDone: typeof source.profileOnboardingDone === 'boolean' ? source.profileOnboardingDone : true,
    profileOnboardingDismissed: typeof source.profileOnboardingDismissed === 'boolean' ? source.profileOnboardingDismissed : true,
    scene: profile.scene, budget: Number(profile.budget), foodBudget: validBackupNumber(source.foodBudget, 8, 100, profile.budget),
    campusId: /^[a-z0-9-]{2,64}$/.test(String(source.campusId || '')) ? String(source.campusId) : 'sisu-songjiang',
    trainingFocus: Object.hasOwn(TRAINING_FOCUS_LABELS, source.trainingFocus) ? source.trainingFocus : 'full',
    trainingEquipment: ['bodyweight', 'band', 'dumbbell', 'gym', 'running'].includes(source.trainingEquipment) ? source.trainingEquipment : 'bodyweight',
    trainingDuration: [15, 20, 25, 30, 35, 40, 45, 50, 60].includes(Number(source.trainingDuration)) ? Number(source.trainingDuration) : 25,
    trainingVariant: validBackupNumber(source.trainingVariant, 0, 10000, 0), trainingPlanItems: planItems,
    trainingLogs, exerciseLogs, mealLogs, weightLog,
    localMenuRecords: sanitizeLocalMenuRecords(source.localMenuRecords),
    energyTarget: validBackupNumber(source.energyTarget, 1000, 5000, 2000), energyMode: source.energyMode === 'manual' ? 'manual' : 'auto',
    completedDays: Array.isArray(source.completedDays) ? source.completedDays.filter((day) => DAY_NAMES.includes(day)).slice(0, 7) : [],
    recipeIngredients: Array.isArray(source.recipeIngredients) ? source.recipeIngredients.slice(0, 10).filter((row) => row && typeof row.foodId === 'string' && validBackupNumber(row.grams, 1, 2000) !== null).map((row) => ({ foodId: safeBackupText(row.foodId, 80), grams: Number(row.grams) })) : [],
    manualExerciseKcal: source.manualExerciseKcal && typeof source.manualExerciseKcal === 'object' && !Array.isArray(source.manualExerciseKcal)
      ? Object.fromEntries(Object.entries(source.manualExerciseKcal).filter(([date, value]) => cleanDate(date) && validBackupNumber(value, 0, 5000) !== null).slice(-365).map(([date, value]) => [date, Math.round(Number(value))])) : {},
    trainingSessionDate: today,
    trainingSessionId: sameDaySession ? source.trainingSessionId : makeTrainingSessionId(),
    exerciseSearch: safeBackupText(source.exerciseSearch, 80), foodSearch: safeBackupText(source.foodSearch, 80),
    foodSceneFilter: ['all', 'campus', 'convenience', 'market'].includes(source.foodSceneFilter) ? source.foodSceneFilter : 'all',
    exerciseLibraryFocus: ['all', 'chest', 'back', 'shoulders', 'legs', 'glutes', 'core', 'running', 'gym', 'recovery'].includes(source.exerciseLibraryFocus) ? source.exerciseLibraryFocus : 'all',
    proteinFocus: source.proteinFocus === true,
    vegetarianOnly: source.vegetarianOnly === true,
    activeWorkout: null
  };
  restored.activeWorkout = normalizeActiveWorkout(source.activeWorkout, restored.trainingSessionId, restored.trainingSessionDate);
  return restored;
}

async function importProfileDataFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    notify('备份文件不能超过 5 MB。');
    return;
  }
  try {
    const restored = validateProfileBackup(JSON.parse(await file.text()));
    if (!window.confirm('导入会替换此浏览器里的当前档案、饮食和训练记录。建议先导出当前备份。要继续吗？')) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
    state = restored;
    renderAll();
    closeProfile();
    notify('备份已导入到当前浏览器。');
  } catch (error) {
    notify(error instanceof SyntaxError ? '文件不是有效 JSON。' : error.message || '无法导入这份备份。');
  }
}

function addWeight() {
  const value = window.prompt('输入一条演示体重记录（kg）。请勿输入真实健康数据。', String(state.profile.weight));
  if (value === null) return;
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight < 35 || weight > 200) {
    notify('请输入35–200之间的数字。');
    return;
  }
  state.profile.weight = weight;
  state.weightLog.push({ label: '今天', value: weight, note: '本地演示记录' });
  state.weightLog = state.weightLog.slice(-8);
  persist(); renderAll();
  notify('体重记录已保存在当前浏览器。');
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('#welcomeMascot')) {
      playWelcomeMascotReaction();
      return;
    }
    if (event.target.closest('#assistantWidgetToggle')) {
      setAssistantDialogOpen(document.getElementById('assistantDialog').hidden);
      return;
    }
    if (event.target.closest('#assistantDialogClose')) {
      setAssistantDialogOpen(false);
      document.getElementById('assistantWidgetToggle').focus();
      return;
    }
    const unitButton = event.target.closest('[data-page-unit-target]');
    if (unitButton) {
      const target = document.getElementById(unitButton.dataset.pageUnitTarget);
      if (target) {
        let ancestor = target;
        while (ancestor) {
          if (ancestor.tagName === 'DETAILS') ancestor.open = true;
          ancestor = ancestor.parentElement;
        }
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('#pageUnitNavItems [data-page-unit-target]').forEach((button) => {
          button.setAttribute('aria-current', button === unitButton ? 'location' : 'false');
        });
      }
    }
    const scrollButton = event.target.closest('[data-scroll-target]');
    if (scrollButton) {
      if (scrollButton.id === 'assistantPlanLink') {
        setAssistantDialogOpen(false);
        navigate('today');
        window.requestAnimationFrame(() => document.getElementById(scrollButton.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      } else {
        document.getElementById(scrollButton.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    const navButton = event.target.closest('[data-view-target]');
    if (navButton) {
      if (navButton.id === 'mealMoreChoices' && state.scene === 'campus' && isSisuSchoolName(state.profile.universityName)) {
        state.foodSceneFilter = 'campus';
        state.foodSearch = '';
        persist();
        renderFoodGrid();
      }
      navigate(navButton.dataset.viewTarget);
    }
    if (event.target.closest('#energyModeToggle')) {
      state.energyMode = state.energyMode === 'auto' ? 'manual' : 'auto';
      persist(); renderNutritionDashboard();
      notify(state.energyMode === 'auto' ? '已开启自动能量估算。' : '已切换为手动能量参考值。');
    }
    if (event.target.closest('#openEnergyProfile')) openProfile();
    if (event.target.closest('#saveManualExerciseKcalCalories')) saveManualExerciseEntry('manualExerciseKcalInputCalories');
    const saveMealButton = event.target.closest('[data-save-meal]');
    if (saveMealButton) saveNutritionToToday();
    const deleteMealButton = event.target.closest('[data-delete-meal-log]');
    if (deleteMealButton) deleteNutritionLog(deleteMealButton.dataset.deleteMealLog);
    const deleteLocalMenuButton = event.target.closest('[data-delete-local-menu]');
    if (deleteLocalMenuButton) deleteLocalMenuRecord(deleteLocalMenuButton.dataset.deleteLocalMenu);
    const logFoodButton = event.target.closest('[data-log-food], [data-add-food]');
    if (logFoodButton) addFoodToToday(logFoodButton.dataset.logFood || logFoodButton.dataset.addFood);
    const logSisuMenuButton = event.target.closest('[data-log-sisu-menu]');
    if (logSisuMenuButton) addSisuMenuFoodToToday(logSisuMenuButton.dataset.logSisuMenu);
    const logSourcedFoodButton = event.target.closest('[data-log-sourced-food]');
    if (logSourcedFoodButton) addSourcedFoodToToday(logSourcedFoodButton.dataset.logSourcedFood, logSourcedFoodButton);
    if (event.target.closest('#addRecipeIngredient')) addSourcedRecipeIngredient();
    const removeRecipeFoodButton = event.target.closest('[data-remove-recipe-food]');
    if (removeRecipeFoodButton) {
      state.recipeIngredients = state.recipeIngredients.filter((row) => row.foodId !== removeRecipeFoodButton.dataset.removeRecipeFood);
      persist();
      renderSourcedRecipeBuilder();
    }
    if (event.target.closest('#logSourcedRecipe')) addSourcedRecipeToToday();
    const foodButton = event.target.closest('[data-food-select]');
    if (foodButton) selectFood(foodButton.dataset.foodSelect);
    const promptButton = event.target.closest('[data-prompt]');
    if (promptButton) {
      const input = document.getElementById('assistantInput');
      setAssistantDialogOpen(true);
      input.value = promptButton.dataset.prompt;
      runAssistant(input.value);
      input.value = '';
    }
    const sceneButton = event.target.closest('[data-scene]');
    if (sceneButton) {
      state.foodSceneFilter = sceneButton.dataset.scene;
      nearbyPlaces = [];
      document.getElementById('nearbyFoodResults').hidden = true;
      document.getElementById('nearbyFoodStatus').textContent = '就餐场景已更新。重新输入地点并搜索即可按当前场景筛选。';
      if (state.foodSceneFilter !== 'all') {
        state.scene = state.foodSceneFilter;
        state.profile.scene = state.scene;
      }
      persist(); renderFoodGrid(); renderMealPicks();
    }
    const replaceButton = event.target.closest('[data-replace-index]');
    if (replaceButton) replacePlanExercise(Number(replaceButton.dataset.replaceIndex));
    const motionToggle = event.target.closest('[data-motion-toggle]');
    if (motionToggle) {
      const figure = motionToggle.closest('.exercise-diagram');
      const isPlaying = figure?.classList.toggle('is-playing');
      motionToggle.setAttribute('aria-pressed', String(Boolean(isPlaying)));
      motionToggle.textContent = isPlaying ? '暂停演示' : '播放动作';
      const motionNote = figure?.querySelector('.exercise-motion-note');
      if (motionNote) motionNote.textContent = isPlaying ? '循环演示中 · 准备 → 动作 → 还原' : '点击播放分解动作';
    }
    const completeButton = event.target.closest('[data-complete-exercise]');
    if (completeButton) toggleExerciseComplete(Number(completeButton.dataset.completeExercise));
    if (event.target.closest('[data-guided-start]')) startGuidedWorkout();
    if (event.target.closest('[data-guided-set]')) recordGuidedSet();
    if (event.target.closest('[data-guided-skip-rest]')) skipGuidedRest();
    const guidedComplete = event.target.closest('[data-guided-complete]');
    if (guidedComplete) completeGuidedAction(Number(guidedComplete.dataset.guidedComplete));
    const guidedPartial = event.target.closest('[data-guided-complete-partial]');
    if (guidedPartial) completeGuidedAction(Number(guidedPartial.dataset.guidedCompletePartial), true);
    if (event.target.closest('[data-guided-minimize]')) {
      state.activeWorkout.collapsed = true; persist(); renderGuidedWorkout();
    }
    if (event.target.closest('[data-guided-resume]')) {
      state.activeWorkout.collapsed = false; persist(); renderGuidedWorkout();
    }
    if (event.target.closest('[data-guided-return]')) {
      if (state.activeWorkout) { state.activeWorkout.collapsed = false; persist(); }
      navigate('training'); renderGuidedWorkout();
      document.getElementById('guidedSession')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const guidedEffort = event.target.closest('[data-guided-effort]');
    if (guidedEffort) recordTraining(guidedEffort.dataset.guidedEffort);
    const effortButton = event.target.closest('[data-effort]');
    if (effortButton) recordTraining(effortButton.dataset.effort);
    const exerciseFocusButton = event.target.closest('[data-exercise-focus]');
    if (exerciseFocusButton) {
      state.exerciseLibraryFocus = exerciseFocusButton.dataset.exerciseFocus;
      persist(); renderExerciseLibrary();
    }
  });

  document.addEventListener('change', (event) => {
    const portionInput = event.target.closest('[data-nutrition-grams]');
    if (portionInput) updateNutritionPortion(portionInput);
    const recipeGramsInput = event.target.closest('[data-recipe-grams]');
    if (recipeGramsInput) updateSourcedRecipeIngredient(recipeGramsInput);
    const planDurationInput = event.target.closest('[data-plan-duration]');
    if (planDurationInput) updatePlanExerciseDuration(Number(planDurationInput.dataset.planDuration), planDurationInput.value);
    const guidedDraft = event.target.closest('[data-guided-draft]');
    if (guidedDraft && state.activeWorkout) {
      const index = Number(guidedDraft.dataset.guidedIndex);
      const value = guidedDraft.value.trim() ? Number(guidedDraft.value) : null;
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > (guidedDraft.dataset.guidedDraft === 'reps' ? 200 : 300))) {
        notify(guidedDraft.dataset.guidedDraft === 'reps' ? '次数请填写 1–200。' : '负重请填写 0–300 kg。');
        renderGuidedWorkout();
        return;
      }
      state.activeWorkout.drafts ||= {};
      state.activeWorkout.drafts[index] ||= { reps: null, weightKg: null };
      state.activeWorkout.drafts[index][guidedDraft.dataset.guidedDraft] = value;
      persist();
    }
    const guidedRest = event.target.closest('[data-guided-rest]');
    if (guidedRest && state.activeWorkout) {
      state.activeWorkout.restDurationSec = Number(guidedRest.value);
      persist();
    }
  });
  document.addEventListener('input', (event) => {
    const recipeGramsInput = event.target.closest('[data-recipe-grams]');
    if (recipeGramsInput) previewSourcedRecipeIngredient(recipeGramsInput);
  });

  document.getElementById('openProfile').addEventListener('click', openProfile);
  document.getElementById('openProfileTop').addEventListener('click', openProfile);
  document.getElementById('restartOnboarding').addEventListener('click', () => openOnboarding(state.profileOnboardingDone));
  document.getElementById('closeProfile').addEventListener('click', closeProfile);
  document.getElementById('cancelProfile').addEventListener('click', closeProfile);
  document.getElementById('profileModal').addEventListener('click', (event) => { if (event.target.id === 'profileModal') closeProfile(); });
  document.getElementById('closeOnboarding').addEventListener('click', () => closeOnboarding());
  document.getElementById('skipOnboarding').addEventListener('click', () => closeOnboarding());
  document.getElementById('onboardingBack').addEventListener('click', () => { renderOnboardingStep(onboardingStep - 1); document.querySelector(`[data-onboarding-step="${onboardingStep}"] legend`)?.focus({ preventScroll: true }); });
  document.getElementById('onboardingForm').addEventListener('submit', saveOnboarding);
  for (const schoolId of ['onboardUniversity', 'profileUniversity']) {
    const schoolInput = document.getElementById(schoolId);
    schoolInput.addEventListener('input', () => refreshCampusSuggestions(schoolInput));
    schoolInput.addEventListener('focus', () => refreshCampusSuggestions(schoolInput));
  }
  document.getElementById('onboardingModal').addEventListener('click', (event) => { if (event.target.id === 'onboardingModal') closeOnboarding(); });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!document.getElementById('assistantDialog').hidden) setAssistantDialogOpen(false);
    else if (document.getElementById('onboardingModal').classList.contains('open')) closeOnboarding();
    else closeProfile();
  });
  document.getElementById('profileForm').addEventListener('submit', saveProfile);
  document.getElementById('exportProfileData').addEventListener('click', exportProfileData);
  document.getElementById('importProfileData').addEventListener('click', () => document.getElementById('profileDataFile').click());
  document.getElementById('profileDataFile').addEventListener('change', (event) => { void importProfileDataFile(event); });
  document.getElementById('addWeight').addEventListener('click', addWeight);
  document.getElementById('resetDemo').addEventListener('click', () => {
    if (!window.confirm('恢复初始演示档案与训练、饮食记录？')) return;
    const preservedMenuRecords = state.localMenuRecords.slice();
    localStorage.removeItem(STORAGE_KEY); state = freshState(); state.localMenuRecords = preservedMenuRecords; persist(); localDemoMode = STATIC_PUBLIC_SITE; renderAll(); updateLocalDemoControl();
    navigate('today');
    resetAssistantConversation('我会优先调整安排，不会让你从头开始。');
    openOnboarding(false);
    notify('演示资料已恢复。');
  });
  document.getElementById('sceneSelect').addEventListener('change', (event) => setScene(event.target.value));
  document.getElementById('changeUniversity').addEventListener('click', openProfile);
  document.getElementById('budgetSelect').addEventListener('change', (event) => {
    state.budget = Number(event.target.value); state.profile.budget = state.budget; state.foodBudget = state.budget;
    persist(); renderMealPicks(); renderFoodGrid();
  });
  document.getElementById('foodBudget').addEventListener('change', (event) => {
    state.foodBudget = Number(event.target.value); state.budget = state.foodBudget;
    persist(); renderFoodGrid(); renderMealPicks();
  });
  document.getElementById('foodSearch').addEventListener('input', (event) => { state.foodSearch = event.target.value; renderFoodGrid(); });
  document.getElementById('campusMenuSearch').addEventListener('input', (event) => { campusMenuSearch = event.target.value; renderCampusQrMenu(); });
  document.getElementById('campusMenuBudget').addEventListener('change', (event) => { campusMenuMaxPrice = Number(event.target.value) || 50; campusMenuBudgetTouched = true; renderCampusQrMenu(); });
  document.getElementById('nearbyPlaceForm').addEventListener('submit', (event) => { void searchNearbyFoodByPlace(event); });
  document.getElementById('nearbyPlaceInput').addEventListener('input', updateNearbyMapFallback);
  document.getElementById('nearbyFoodButton').addEventListener('click', () => { void findNearbyFood(); });
  document.getElementById('energyTargetInput').addEventListener('change', (event) => {
    if (state.energyMode !== 'manual') {
      renderNutritionDashboard();
      return;
    }
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value < 1000 || value > 5000) {
      event.target.value = String(getNutritionTargets().energy);
      notify('能量参考值请设置在 1000–5000 kcal。');
      return;
    }
    state.energyTarget = Math.round(value / 50) * 50;
    persist(); renderNutritionDashboard();
    notify(`已更新为 ${state.energyTarget} kcal 演示参考值。`);
  });
  document.getElementById('exerciseSearch').addEventListener('input', (event) => { state.exerciseSearch = event.target.value; renderExerciseLibrary(); });
  document.getElementById('trainingFocus').addEventListener('change', (event) => {
    state.trainingFocus = event.target.value;
    if (state.trainingFocus === 'gym') state.trainingEquipment = 'gym';
    if (state.trainingFocus === 'running') state.trainingEquipment = 'running';
    else if (state.trainingEquipment === 'running') state.trainingEquipment = 'bodyweight';
    state.trainingPlanItems = null; state.trainingVariant = 0; startNewTrainingSession();
    persist(); renderTrainingPlan(); renderExercises();
  });
  document.getElementById('trainingEquipment').addEventListener('change', (event) => {
    const previousEquipment = state.trainingEquipment;
    state.trainingEquipment = event.target.value;
    if (state.trainingEquipment === 'running') state.trainingFocus = 'running';
    else if (previousEquipment === 'running' && state.trainingFocus === 'running') state.trainingFocus = 'full';
    if (state.trainingFocus === 'gym' && state.trainingEquipment !== 'gym') state.trainingFocus = 'full';
    state.trainingPlanItems = null; state.trainingVariant = 0; startNewTrainingSession();
    persist(); renderTrainingPlan(); renderExercises();
  });
  document.getElementById('trainingDuration').addEventListener('change', (event) => {
    state.trainingDuration = Number(event.target.value); state.trainingPlanItems = null; startNewTrainingSession();
    persist(); renderTrainingPlan(); renderExercises();
  });
  document.getElementById('regenerateTraining').addEventListener('click', () => {
    state.trainingVariant = (Number(state.trainingVariant) || 0) + 1;
    state.trainingPlanItems = null; startNewTrainingSession(); persist(); renderTrainingPlan(); renderExercises();
    notify('已重新排好一组动作。');
  });
  for (const inputId of ['mealPhotoInput', 'mealCameraInput']) {
    document.getElementById(inputId).addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      void chooseMealPhoto(file);
    });
  }
  document.getElementById('openMealCamera').addEventListener('click', () => {
    const cameraInput = document.getElementById('mealCameraInput');
    if (!cameraInput.disabled) cameraInput.click();
  });
  document.getElementById('analyzeMealPhoto').addEventListener('click', analyzeMealPhoto);
  document.getElementById('focusMealPhoto').addEventListener('click', retryFocusedMealPhoto);
  document.getElementById('clearMealPhoto').addEventListener('click', clearMealPhoto);
  document.getElementById('assistantForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('assistantInput');
    runAssistant(input.value); input.value = '';
  });
  document.getElementById('assistantInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      document.getElementById('assistantForm').requestSubmit();
    }
  });
  document.getElementById('localDemoToggle').addEventListener('click', () => {
    if (STATIC_PUBLIC_SITE) return;
    localDemoMode = !localDemoMode;
    agentLastRunMode = localDemoMode ? 'not_run_demo' : 'not_run';
    updateLocalDemoControl();
    notify(localDemoMode ? '本地演示已开启：计划调整不调用 AI。' : '已恢复模型优先模式；若模型不可用会自动本地解析。');
  });
}

async function init() {
  setupAssistantWidgetDrag();
  bindEvents();
  updateLocalDemoControl();
  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.classList.contains('meal-card-photo')) return;
    if (!image.dataset.photoFallback) return;
    image.src = image.dataset.photoFallback;
    image.removeAttribute('data-photo-fallback');
    image.alt += ' · 菜型示意';
    const caveat = image.parentElement.querySelector('.home-sisu-meal-source');
    if (caveat) caveat.textContent += ' · 配图为菜型示意';
  }, true);
  try {
    const [foodResponse, sourcedFoodResponse, exerciseResponse, campusDirectoryResponse, universityResponse, sisuMenuResponse] = await Promise.all([
      fetch('./demo-foods.json?v=20261021-campus-gap-v2'), fetch('./sourced-foods.json?v=20261016-sourced-foods-v1'), fetch('./demo-exercises.json?v=20261015-photo-gym-run-v1'),
      fetch('./campus-directory.json?v=20261029-university-profile-v1'),
      fetch('./universities-2026.json?v=20261101-national-schools-v1').catch(() => null),
      fetch('./sisu-meituan-menu-20261104-nutrition-v1.json?v=20261104-sisu-nutrition-estimates-v4').catch(() => null)
    ]);
    if (!foodResponse.ok || !sourcedFoodResponse.ok || !exerciseResponse.ok || !campusDirectoryResponse.ok) throw new Error('演示数据文件无法读取');
    foods = await foodResponse.json();
    sourcedFoods = await sourcedFoodResponse.json();
    exerciseCatalog = await exerciseResponse.json();
    campusDirectory = await campusDirectoryResponse.json();
    try { sisuMenuCatalog = sisuMenuResponse?.ok ? await sisuMenuResponse.json() : null; } catch (_) { sisuMenuCatalog = null; }
    try { universityDirectory = universityResponse?.ok ? await universityResponse.json() : null; } catch (_) { universityDirectory = null; }
    if (state.profileOnboardingDone && isSisuSchoolName(state.profile.universityName)
      && (state.campusId !== 'sisu-songjiang' || state.profile.campusName !== '松江校区')) {
      state.campusId = 'sisu-songjiang';
      state.profile.campusName = '松江校区';
      persist();
    }
    refreshCampusSuggestions(document.getElementById('onboardUniversity'));
    refreshCampusSuggestions(document.getElementById('profileUniversity'));
    renderAll();
    renderPageUnitNav('today');
    if (new URLSearchParams(window.location.search).get('view') === 'stores') {
      navigate('food');
      const menu = document.getElementById('campusMarketplaceMenu');
      const firstStore = menu?.querySelector('details');
      if (firstStore) firstStore.open = true;
      if (menu && !menu.hidden) requestAnimationFrame(() => menu.scrollIntoView({ block: 'start' }));
    } else if (!state.profileOnboardingDismissed) openOnboarding(false);
    initializeNearbyFood();
    void checkPhotoService();
  } catch (error) {
    console.error(error);
    document.querySelector('.main-content').innerHTML = '<div class="load-error"><h1>演示数据还没有打开</h1><p>请在项目目录启动本地网页服务，再访问提示的网址。详见 README。</p></div>';
  }
}

init();
