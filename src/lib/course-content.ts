export const courseMeta = {
  title: "离散数学课程平台",
  subtitle: "面向课堂教学、作业布置与学习支持的一体化课程门户",
  term: "2025-2026 学年第二学期",
  department: "信息与计算科学课程组"
};

export const portalStats = [
  { label: "课程模块", value: "8", detail: "命题逻辑、集合论、图论等核心单元" },
  { label: "每周学习任务", value: "2-3", detail: "公告提醒、作业练习与课后反馈" },
  { label: "资源形态", value: "4类", detail: "讲义、课件、习题、课堂通知" }
];

export const announcements = [
  {
    title: "课程门户已上线试运行",
    date: "03-26",
    content: "教师可创建班级、发布作业，学生可注册、加班并提交作业图片。"
  },
  {
    title: "第一章学习建议",
    date: "03-27",
    content: "建议先复习命题公式等值变换，再完成“命题逻辑基础练习”。"
  },
  {
    title: "课后提交规范",
    date: "03-28",
    content: "拍照上传作业时请保证字迹清晰、页面完整，优先使用 JPG 或 PNG。"
  }
];

export const courseModules = [
  {
    name: "命题逻辑与谓词逻辑",
    summary: "学习命题公式、真值表、等值演算与量词表达。"
  },
  {
    name: "集合、关系与函数",
    summary: "掌握集合运算、关系性质、等价关系与映射思想。"
  },
  {
    name: "图论基础",
    summary: "了解图的基本概念、路径连通性、树与图遍历。"
  },
  {
    name: "数学归纳与递归",
    summary: "通过归纳法和递归定义训练形式化证明能力。"
  }
];

export const learningResources = [
  {
    title: "课程导学",
    description: "了解课程目标、考核构成、提交规范与学习建议。",
    badge: "必读"
  },
  {
    title: "章节讲义",
    description: "按知识模块整理的讲义与课堂要点，用于课前预习和课后复习。",
    badge: "讲义"
  },
  {
    title: "典型例题",
    description: "汇总命题证明、关系判断、图论分析等高频题型。",
    badge: "例题"
  },
  {
    title: "作业与反馈",
    description: "进入班级后查看作业、提交记录与评分结果。",
    badge: "实践"
  }
];

export const dashboardTips = {
  teacher: [
    "先创建授课班级，再发布本周作业与截止时间。",
    "结合课堂通知模块提醒学生提交要求与格式。",
    "可用班级码组织学生加入同一教学空间。"
  ],
  student: [
    "加入班级后即可查看作业、提交记录与教师反馈。",
    "建议按章节资源先复习再完成当周任务。",
    "上传图片前请确认内容完整清晰，避免评分信息缺失。"
  ]
};
