// 场景地图数据定义

export interface SceneNode {
  id: string
  nameZh: string
  nameEn: string
  emoji: string
  category: 'daily' | 'workplace'
  description: string
  vocab: { word: string; meaning: string }[]
  dialogueGoal: string
  aiRole: string
  userRole: string
  aiOpener: string
  requiredRounds: number   // 完成场景所需对话轮次
}

export const DAILY_SCENES: SceneNode[] = [
  {
    id: 'coffee-shop',
    nameZh: '咖啡馆', nameEn: 'Coffee Shop', emoji: '☕',
    category: 'daily',
    description: '学会在咖啡馆用英语点单、询问推荐和自定义饮品，成为咖啡馆英语达人。',
    vocab: [
      { word: 'I\'d like...', meaning: '我想要…（比 I want 更礼貌）' },
      { word: 'Could I have...?', meaning: '我可以要…吗？' },
      { word: 'for here or to go', meaning: '在这里喝还是带走' },
      { word: 'medium / large', meaning: '中杯 / 大杯' },
      { word: 'oat milk', meaning: '燕麦奶' },
    ],
    dialogueGoal: '完成点单流程：问候 → 点饮品 → 定制 → 付款',
    aiRole: '咖啡馆收银员',
    userRole: '顾客',
    aiOpener: "Hi there! Welcome to our café. What can I get for you today?",
    requiredRounds: 5,
  },
  {
    id: 'airport',
    nameZh: '机场', nameEn: 'Airport', emoji: '✈️',
    category: 'daily',
    description: '掌握机场办理登机手续、过安检、问路的实用英语，轻松出行。',
    vocab: [
      { word: 'boarding pass', meaning: '登机牌' },
      { word: 'check in', meaning: '办理登机手续' },
      { word: 'carry-on luggage', meaning: '随身行李' },
      { word: 'window / aisle seat', meaning: '靠窗 / 靠过道座位' },
      { word: 'departure gate', meaning: '登机口' },
    ],
    dialogueGoal: '顺利完成值机流程并获取登机牌',
    aiRole: '机场地勤人员',
    userRole: '旅客',
    aiOpener: "Good morning! May I see your passport and booking confirmation, please?",
    requiredRounds: 5,
  },
  {
    id: 'hotel',
    nameZh: '酒店', nameEn: 'Hotel', emoji: '🏨',
    category: 'daily',
    description: '学会酒店入住、询问设施、提出需求，让每次住宿都自信流畅。',
    vocab: [
      { word: 'reservation', meaning: '预订' },
      { word: 'check in / check out', meaning: '入住 / 退房' },
      { word: 'amenities', meaning: '设施、便利设施' },
      { word: 'Could you wake me up at...?', meaning: '能在…叫醒我吗？' },
      { word: 'room service', meaning: '客房服务' },
    ],
    dialogueGoal: '完成酒店入住并了解房间设施',
    aiRole: '酒店前台',
    userRole: '入住客人',
    aiOpener: "Welcome to Grand Hotel! Do you have a reservation with us?",
    requiredRounds: 5,
  },
  {
    id: 'restaurant',
    nameZh: '餐厅', nameEn: 'Restaurant', emoji: '🍽️',
    category: 'daily',
    description: '自信点餐、询问菜品和结账，让用餐体验更愉快。',
    vocab: [
      { word: 'I\'ll have / I\'d like', meaning: '我要点…' },
      { word: 'What do you recommend?', meaning: '你推荐什么？' },
      { word: 'medium / well done', meaning: '五成熟 / 全熟' },
      { word: 'Could I get the check?', meaning: '可以结账了吗？' },
      { word: 'to go / takeaway', meaning: '打包带走' },
    ],
    dialogueGoal: '完成点餐并结账',
    aiRole: '餐厅服务员',
    userRole: '顾客',
    aiOpener: "Good evening! Table for how many? And do you have a reservation?",
    requiredRounds: 5,
  },
  {
    id: 'supermarket',
    nameZh: '超市', nameEn: 'Supermarket', emoji: '🛒',
    category: 'daily',
    description: '学会在超市问路、结账和处理常见问题，日常购物无障碍。',
    vocab: [
      { word: 'Where can I find...?', meaning: '…在哪里可以找到？' },
      { word: 'aisle', meaning: '货架通道' },
      { word: 'in stock / out of stock', meaning: '有货 / 缺货' },
      { word: 'loyalty card', meaning: '会员卡' },
      { word: 'self-checkout', meaning: '自助结账' },
    ],
    dialogueGoal: '找到商品并完成结账',
    aiRole: '超市收银员',
    userRole: '顾客',
    aiOpener: "Hi! Did you find everything you were looking for today?",
    requiredRounds: 4,
  },
  {
    id: 'hospital',
    nameZh: '医院', nameEn: 'Hospital', emoji: '🏥',
    category: 'daily',
    description: '掌握就医场景的英语表达，清晰描述症状、理解医嘱。',
    vocab: [
      { word: 'I have a...', meaning: '我有…（头痛、发烧等）' },
      { word: 'It hurts here', meaning: '这里疼' },
      { word: 'symptom', meaning: '症状' },
      { word: 'prescription', meaning: '处方' },
      { word: 'How often should I take it?', meaning: '我多久吃一次？' },
    ],
    dialogueGoal: '描述症状并了解治疗建议',
    aiRole: '诊所护士',
    userRole: '患者',
    aiOpener: "Hello, how can I help you today? What seems to be the problem?",
    requiredRounds: 5,
  },
  {
    id: 'subway',
    nameZh: '地铁', nameEn: 'Subway', emoji: '🚇',
    category: 'daily',
    description: '学会乘坐地铁时问路、换乘，在城市中自由穿梭。',
    vocab: [
      { word: 'Which line goes to...?', meaning: '哪条线去…？' },
      { word: 'transfer / change at', meaning: '在…换乘' },
      { word: 'next stop', meaning: '下一站' },
      { word: 'rush hour', meaning: '高峰时间' },
      { word: 'Excuse me, is this seat taken?', meaning: '打扰一下，这个座位有人吗？' },
    ],
    dialogueGoal: '找到正确地铁路线并顺利到达目的地',
    aiRole: '地铁站工作人员',
    userRole: '乘客',
    aiOpener: "Hi there! Do you need help finding your way on the subway?",
    requiredRounds: 4,
  },
  {
    id: 'library',
    nameZh: '图书馆', nameEn: 'Library', emoji: '📚',
    category: 'daily',
    description: '学会借书、查询馆藏和使用图书馆资源的英语表达。',
    vocab: [
      { word: 'borrow / return a book', meaning: '借书 / 还书' },
      { word: 'due date', meaning: '归还日期' },
      { word: 'Do you have...?', meaning: '你们有…吗？' },
      { word: 'reference section', meaning: '参考书区' },
      { word: 'library card', meaning: '借书证' },
    ],
    dialogueGoal: '找到想要的书并完成借阅',
    aiRole: '图书馆管理员',
    userRole: '读者',
    aiOpener: "Hello! Are you looking for something specific today, or just browsing?",
    requiredRounds: 4,
  },
]

export const WORKPLACE_SCENES: SceneNode[] = [
  {
    id: 'meeting',
    nameZh: '会议室', nameEn: 'Meeting', emoji: '🤝',
    category: 'workplace',
    description: '学会在英语会议中发言、提问、表达观点，成为高效沟通的职场人。',
    vocab: [
      { word: 'To update you on...', meaning: '向你汇报关于…的情况' },
      { word: 'I\'d like to add that...', meaning: '我想补充一点…' },
      { word: 'Could you clarify...?', meaning: '你能澄清一下…吗？' },
      { word: 'Let\'s move on to...', meaning: '让我们进入下一个话题…' },
      { word: 'action item', meaning: '待办事项' },
    ],
    dialogueGoal: '在会议中完整汇报工作进度',
    aiRole: '项目经理同事',
    userRole: '团队成员',
    aiOpener: "Good morning, everyone! Let's get started. Can you give us a quick update on your progress?",
    requiredRounds: 6,
  },
  {
    id: 'interview',
    nameZh: '求职面试', nameEn: 'Interview', emoji: '💼',
    category: 'workplace',
    description: '模拟真实英语面试对话，学会自我介绍、回答常见问题，提升面试自信。',
    vocab: [
      { word: 'I\'m currently...', meaning: '我目前…' },
      { word: 'My strength is...', meaning: '我的优势是…' },
      { word: 'I\'m passionate about...', meaning: '我对…充满热情' },
      { word: 'In my previous role...', meaning: '在我上一份工作中…' },
      { word: 'team player', meaning: '团队合作者' },
    ],
    dialogueGoal: '完整完成英语面试流程',
    aiRole: 'HR 面试官',
    userRole: '面试者',
    aiOpener: "Thank you for coming in today. Could you start by telling me a little about yourself?",
    requiredRounds: 6,
  },
  {
    id: 'negotiation',
    nameZh: '商务谈判', nameEn: 'Negotiation', emoji: '💰',
    category: 'workplace',
    description: '掌握商务谈判中的报价、还价和达成协议英语，提升职场竞争力。',
    vocab: [
      { word: 'Our initial offer is...', meaning: '我们的初始报价是…' },
      { word: 'That\'s a bit high for us.', meaning: '对我们来说有点高。' },
      { word: 'Can we meet in the middle?', meaning: '我们能折中吗？' },
      { word: 'terms and conditions', meaning: '条款与条件' },
      { word: 'win-win', meaning: '双赢' },
    ],
    dialogueGoal: '完成一轮商务谈判并达成协议',
    aiRole: '商务谈判对方代表',
    userRole: '谈判代表',
    aiOpener: "Good afternoon. I've reviewed your proposal. Shall we discuss the key terms?",
    requiredRounds: 6,
  },
  {
    id: 'email',
    nameZh: '商务邮件', nameEn: 'Business Email', emoji: '📧',
    category: 'workplace',
    description: '学会撰写专业英语邮件：开场白、正文、结尾，让邮件更得体。',
    vocab: [
      { word: 'I am writing to...', meaning: '我写此邮件是为了…' },
      { word: 'Please find attached...', meaning: '请查看附件…' },
      { word: 'I look forward to...', meaning: '我期待…' },
      { word: 'Best regards', meaning: '此致（邮件结尾）' },
      { word: 'follow up', meaning: '跟进' },
    ],
    dialogueGoal: '写出一封完整的专业英语邮件',
    aiRole: '英语写作助手',
    userRole: '邮件撰写者',
    aiOpener: "Let's practice writing a professional email. What's the purpose of the email you'd like to write?",
    requiredRounds: 5,
  },
]

export const ALL_SCENES = [...DAILY_SCENES, ...WORKPLACE_SCENES]

export function getSceneById(id: string): SceneNode | undefined {
  return ALL_SCENES.find(s => s.id === id)
}
