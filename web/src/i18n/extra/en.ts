import type { ExtraDict } from '../types';

const enX: ExtraDict = {
  forgot: {
    title: 'Reset password', sub: 'We’ll send a 6-digit code to your email.', email: 'Account email', send: 'Send code',
    sent: 'We sent a code to {email}. It’s valid for 15 minutes.', code: '6-digit code', newPass: 'New password', confirm: 'Confirm new password',
    save: 'Save new password', resend: 'Resend code', errCode: 'Enter the 6 digits of the code.', errMatch: 'Passwords don’t match.',
    doneTitle: 'Password changed', doneText: 'You can now log in with your new password.', back: 'Back to login', demo: 'Demo mode: any 6-digit code works.',
  },
  notif: {
    title: 'Notifications', markAll: 'Mark all as read', empty: 'No notifications yet.', today: 'Today', earlier: 'Earlier',
    accepted: '{name} accepted your booking', acceptedText: 'Pay to secure your meet-up on {d}.',
    paid: 'Payment confirmed', paidText: 'The amount is held until your meet-up with {name} ends.',
    waiting: 'Request sent to {name}', waitingText: 'You’ll be notified as soon as they reply.',
    rate: 'How was it with {name}?', rateText: 'Review the meet-up and help the community.',
    message: 'New message from {name}', verify: 'Verify your identity', verifyText: 'Takes 2 minutes and unlocks bookings.',
    contact: 'Add a trusted contact', contactText: 'They get the details when you check in.',
  },
  pay: {
    title: 'Payment', sub: 'RolêJunto holds the amount and only releases it after the meet-up.', method: 'Payment method',
    pixTitle: 'Pay with Pix', pixText: 'Open your banking app, choose Pix and scan the QR code or use the copy-and-paste code.',
    copy: 'Copy code', copied: 'Code copied', expires: 'Code expires in {t}', paidBtn: 'I’ve paid',
    checking: 'Confirming payment…', cardTitle: 'Credit card', cardText: 'You’ll enter your card details on our payment partner’s secure page. RolêJunto never stores your card number.',
    cardBtn: 'Pay {v} by card', installments: 'Installments', inst1: 'Single payment', demo: 'Demo mode: payment is simulated.',
    receipt: 'Receipt', receiptTitle: 'Payment confirmed!', receiptText: 'We hold the amount until the meet-up. If {name} doesn’t show up, you get a full refund.',
    code: 'Transaction ID', date: 'Date', status: 'Status', statusHeld: 'Paid · held until the meet-up', toBooking: 'View booking', payNow: 'Pay now',
    alreadyPaid: 'This booking is already paid.', notReady: 'Payment becomes available after the partner accepts.',
  },
  bdetail: {
    title: 'Booking details', timeline: 'Progress', steps: ['Requested', 'Accepted', 'Paid', 'Meet-up', 'Completed'],
    details: 'Details', program: 'Plan', when: 'When', duration: 'Duration', place: 'Place', note: 'Your message', values: 'Amounts',
    view: 'View details', notFound: 'Booking not found.', id: 'Booking #{id}', help: 'Need help with this booking?', helpCta: 'Contact support',
  },
  edit: {
    title: 'Edit profile', photo: 'Profile photo', change: 'Change photo', remove: 'Remove', name: 'Name', email: 'Email', phone: 'Mobile', city: 'City',
    interests: 'Plans you enjoy', interestsHint: 'We use this to suggest people and plans.', save: 'Save changes', saved: 'Profile updated',
    passTitle: 'Change password', current: 'Current password', newPass: 'New password', confirm: 'Confirm new password', passSave: 'Change password', passSaved: 'Password changed',
    errName: 'Enter your name.', errEmail: 'Invalid email.', errPass: 'New password must be at least 8 characters.', errMatch: 'Passwords don’t match.',
    photoHint: 'Use a recent photo of yourself with your face visible. It goes through moderation.',
  },
  help: {
    title: 'Help & support', sub: 'Find answers or talk to our team.', faqTitle: 'Frequently asked questions',
    faq: [
      ['What is RolêJunto?', 'A platform to find verified company for social activities like clubs, bars, the beach, concerts, dinners and events. It is strictly social.'],
      ['How does payment work?', 'You pay in the app after the partner accepts. The amount is held and only released after the meet-up.'],
      ['Can I cancel a booking?', 'Yes. Cancellation is free up to 24 hours before the meet-up. After that, the cancellation policy applies.'],
      ['What if the partner doesn’t show up?', 'You get a full refund. Let support know from the booking screen.'],
      ['Why do I need to verify my identity?', 'To make sure everyone is 18+ and who they say they are. It protects both sides.'],
      ['Why do Home and Country house have a lock?', 'For safety, these plans unlock only after a completed first meet-up in a public place with the same person.'],
      ['What do I do in an emergency?', 'Use the SOS button on the ongoing booking or call 190. Then report it in the app.'],
      ['How do I delete my account?', 'In Profile, under Privacy and data. Your data is deleted in line with the LGPD.'],
    ],
    contactTitle: 'Contact us', subject: 'Subject', subjects: ['Booking or payment', 'Safety or report', 'My account', 'Something else'],
    message: 'Message', send: 'Send message', sent: 'Message sent. We reply within 24 hours by email.', errMsg: 'Write your message.',
    urgent: 'In immediate danger, call 190.',
  },
  blocked: {
    title: 'Blocked people', sub: 'Blocked people can’t see your profile or contact you.', empty: 'You haven’t blocked anyone.',
    unblock: 'Unblock', unblocked: '{name} was unblocked',
  },
  menu: { edit: 'Edit profile', notifications: 'Notifications', blocked: 'Blocked people', help: 'Help & support' },
  cookies: {
    text: 'We use essential cookies to make the app work and, with your permission, analytics cookies to improve it.',
    accept: 'Accept all', essential: 'Essential only', more: 'Learn more',
  },
  offline: 'You’re offline. Some actions are unavailable until you’re back online.',
};

export default enX;
