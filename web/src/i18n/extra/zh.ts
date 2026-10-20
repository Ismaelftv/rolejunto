import type { ExtraDict } from '../types';

const zhX: ExtraDict = {
  forgot: {
    title: '找回密码', sub: '我们会向你的邮箱发送 6 位验证码。', email: '账户邮箱', send: '发送验证码',
    sent: '验证码已发送至 {email}，15 分钟内有效。', code: '6 位验证码', newPass: '新密码', confirm: '确认新密码',
    save: '保存新密码', resend: '重新发送', errCode: '请输入 6 位验证码。', errMatch: '两次输入的密码不一致。',
    doneTitle: '密码已修改', doneText: '现在可以用新密码登录了。', back: '返回登录', demo: '演示模式：任意 6 位数字均可。',
  },
  notif: {
    title: '通知', markAll: '全部标为已读', empty: '暂时没有通知。', today: '今天', earlier: '更早',
    accepted: '{name} 接受了你的预约', acceptedText: '付款以确认 {d} 的见面。',
    paid: '付款成功', paidText: '款项将托管至与 {name} 的见面结束。',
    waiting: '已向 {name} 发送申请', waitingText: '对方回复后会第一时间通知你。',
    rate: '和 {name} 相处得怎么样？', rateText: '评价这次见面，帮助整个社区。',
    message: '{name} 发来新消息', verify: '认证你的身份', verifyText: '只需 2 分钟，即可开始预约。',
    contact: '添加紧急联系人', contactText: '你签到时，对方会收到见面信息。',
  },
  pay: {
    title: '付款', sub: '款项由 RolêJunto 托管，见面结束后才转给伙伴。', method: '付款方式',
    pixTitle: 'Pix 付款', pixText: '打开银行应用，选择 Pix，扫描二维码或使用复制粘贴码。',
    copy: '复制代码', copied: '已复制', expires: '代码将在 {t} 后失效', paidBtn: '我已付款',
    checking: '正在确认付款…', cardTitle: '信用卡', cardText: '你将在支付合作方的安全页面输入卡信息。RolêJunto 不会保存你的卡号。',
    cardBtn: '用信用卡支付 {v}', installments: '分期', inst1: '一次付清', demo: '演示模式：付款为模拟。',
    receipt: '付款凭证', receiptTitle: '付款成功！', receiptText: '款项将托管至见面。如果 {name} 未到场，你将获得全额退款。',
    code: '交易编号', date: '日期', status: '状态', statusHeld: '已付款 · 托管至见面', toBooking: '查看预约', payNow: '立即付款',
    alreadyPaid: '此预约已付款。', notReady: '伙伴接受后才能付款。',
  },
  bdetail: {
    title: '预约详情', timeline: '进度', steps: ['已申请', '已接受', '已付款', '见面', '已完成'],
    details: '详情', program: '活动', when: '时间', duration: '时长', place: '地点', note: '你的留言', values: '金额',
    view: '查看详情', notFound: '未找到该预约。', id: '预约编号 {id}', help: '这次预约需要帮助吗？', helpCta: '联系客服',
  },
  edit: {
    title: '编辑资料', photo: '头像', change: '更换照片', remove: '移除', name: '姓名', email: '邮箱', phone: '手机', city: '城市',
    interests: '你喜欢的活动', interestsHint: '用于为你推荐伙伴和活动。', save: '保存修改', saved: '资料已更新',
    passTitle: '修改密码', current: '当前密码', newPass: '新密码', confirm: '确认新密码', passSave: '修改密码', passSaved: '密码已修改',
    errName: '请填写姓名。', errEmail: '邮箱无效。', errPass: '新密码至少 8 位。', errMatch: '两次输入的密码不一致。',
    photoHint: '请使用本人近照并露出面部，照片需经审核。',
  },
  help: {
    title: '帮助与支持', sub: '查看常见问题或联系我们的团队。', faqTitle: '常见问题',
    faq: [
      ['RolêJunto 是什么？', '一个为夜店、酒吧、海滩、演出、晚餐和活动等社交活动寻找经过认证的陪伴的平台，纯社交。'],
      ['如何付款？', '伙伴接受后在应用内付款。款项托管，见面结束后才放款。'],
      ['可以取消预约吗？', '可以。见面前 24 小时内免费取消，之后按取消政策处理。'],
      ['伙伴没来怎么办？', '你将获得全额退款。请在预约页面联系客服。'],
      ['为什么要认证身份？', '确保所有人都年满 18 岁并且身份真实，这样双方都更安全。'],
      ['为什么家庭聚会和乡间别墅有锁？', '出于安全考虑，须先与同一人在公共场所完成一次见面后才开放。'],
      ['遇到紧急情况怎么办？', '在进行中的预约里点击 SOS 按钮或拨打 190，之后在应用内举报。'],
      ['如何删除账户？', '在“我的”中的“隐私与数据”部分。你的数据将依据 LGPD 删除。'],
    ],
    contactTitle: '联系我们', subject: '主题', subjects: ['预约或付款', '安全或举报', '我的账户', '其他'],
    message: '留言', send: '发送', sent: '已发送。我们会在 24 小时内通过邮件回复。', errMsg: '请填写留言。',
    urgent: '遇到紧急危险请拨打 190。',
  },
  blocked: {
    title: '已屏蔽的人', sub: '被屏蔽的人看不到你的资料，也无法联系你。', empty: '你还没有屏蔽任何人。',
    unblock: '取消屏蔽', unblocked: '已取消屏蔽 {name}',
  },
  menu: { edit: '编辑资料', notifications: '通知', blocked: '已屏蔽的人', help: '帮助与支持' },
  cookies: {
    text: '我们使用必要的 Cookie 让应用正常运行；经你同意后，也会使用分析类 Cookie 来改进服务。',
    accept: '全部接受', essential: '仅必要', more: '了解更多',
  },
  offline: '当前无网络连接，部分功能需联网后才能使用。',
};

export default zhX;
