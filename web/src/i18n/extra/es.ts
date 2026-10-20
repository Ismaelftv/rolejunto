import type { ExtraDict } from '../types';

const esX: ExtraDict = {
  forgot: {
    title: 'Recuperar contraseña', sub: 'Te enviaremos un código de 6 dígitos a tu correo.', email: 'Correo de la cuenta', send: 'Enviar código',
    sent: 'Enviamos un código a {email}. Vale por 15 minutos.', code: 'Código de 6 dígitos', newPass: 'Nueva contraseña', confirm: 'Confirmar nueva contraseña',
    save: 'Guardar nueva contraseña', resend: 'Reenviar código', errCode: 'Introduce los 6 dígitos del código.', errMatch: 'Las contraseñas no coinciden.',
    doneTitle: 'Contraseña cambiada', doneText: 'Ya puedes entrar con tu nueva contraseña.', back: 'Volver al inicio de sesión', demo: 'Modo demostración: cualquier código de 6 dígitos funciona.',
  },
  notif: {
    title: 'Notificaciones', markAll: 'Marcar todas como leídas', empty: 'Aún no hay notificaciones.', today: 'Hoy', earlier: 'Anteriores',
    accepted: '{name} aceptó tu reserva', acceptedText: 'Paga para asegurar el encuentro del {d}.',
    paid: 'Pago confirmado', paidText: 'El importe queda retenido hasta el final del encuentro con {name}.',
    waiting: 'Solicitud enviada a {name}', waitingText: 'Te avisaremos en cuanto responda.',
    rate: '¿Qué tal con {name}?', rateText: 'Valora el encuentro y ayuda a la comunidad.',
    message: 'Nuevo mensaje de {name}', verify: 'Verifica tu identidad', verifyText: 'Tarda 2 minutos y habilita las reservas.',
    contact: 'Añade un contacto de confianza', contactText: 'Recibe los detalles cuando haces check-in.',
  },
  pay: {
    title: 'Pago', sub: 'RolêJunto retiene el importe y solo lo libera después del encuentro.', method: 'Forma de pago',
    pixTitle: 'Paga con Pix', pixText: 'Abre la app de tu banco, elige Pix y escanea el código QR o usa el código copia y pega.',
    copy: 'Copiar código', copied: 'Código copiado', expires: 'El código caduca en {t}', paidBtn: 'Ya pagué',
    checking: 'Confirmando pago…', cardTitle: 'Tarjeta de crédito', cardText: 'Introducirás los datos de la tarjeta en el entorno seguro de nuestro socio de pagos. RolêJunto nunca guarda el número de tu tarjeta.',
    cardBtn: 'Pagar {v} con tarjeta', installments: 'Cuotas', inst1: 'Pago único', demo: 'Modo demostración: el pago es simulado.',
    receipt: 'Comprobante', receiptTitle: '¡Pago confirmado!', receiptText: 'Guardamos el importe hasta el encuentro. Si {name} no aparece, te devolvemos todo.',
    code: 'Código de la transacción', date: 'Fecha', status: 'Estado', statusHeld: 'Pagado · retenido hasta el encuentro', toBooking: 'Ver reserva', payNow: 'Pagar ahora',
    alreadyPaid: 'Esta reserva ya está pagada.', notReady: 'El pago se habilita después de que el compañero acepte.',
  },
  bdetail: {
    title: 'Detalles de la reserva', timeline: 'Progreso', steps: ['Solicitud', 'Aceptada', 'Pagada', 'Encuentro', 'Completada'],
    details: 'Detalles', program: 'Plan', when: 'Cuándo', duration: 'Duración', place: 'Lugar', note: 'Tu mensaje', values: 'Importes',
    view: 'Ver detalles', notFound: 'Reserva no encontrada.', id: 'Reserva n.º {id}', help: '¿Necesitas ayuda con esta reserva?', helpCta: 'Hablar con soporte',
  },
  edit: {
    title: 'Editar perfil', photo: 'Foto de perfil', change: 'Cambiar foto', remove: 'Quitar', name: 'Nombre', email: 'Correo', phone: 'Móvil', city: 'Ciudad',
    interests: 'Planes que te gustan', interestsHint: 'Lo usamos para sugerirte personas y planes.', save: 'Guardar cambios', saved: 'Perfil actualizado',
    passTitle: 'Cambiar contraseña', current: 'Contraseña actual', newPass: 'Nueva contraseña', confirm: 'Confirmar nueva contraseña', passSave: 'Cambiar contraseña', passSaved: 'Contraseña cambiada',
    errName: 'Indica tu nombre.', errEmail: 'Correo no válido.', errPass: 'La nueva contraseña debe tener al menos 8 caracteres.', errMatch: 'Las contraseñas no coinciden.',
    photoHint: 'Usa una foto tuya reciente con la cara visible. Pasa por moderación.',
  },
  help: {
    title: 'Ayuda y soporte', sub: 'Resuelve tus dudas o habla con nuestro equipo.', faqTitle: 'Preguntas frecuentes',
    faq: [
      ['¿Qué es RolêJunto?', 'Una plataforma para encontrar compañía verificada para actividades sociales como discotecas, bares, playa, conciertos, cenas y eventos. Es exclusivamente social.'],
      ['¿Cómo funciona el pago?', 'Pagas en la app después de que el compañero acepte. El importe queda retenido y solo se libera después del encuentro.'],
      ['¿Puedo cancelar una reserva?', 'Sí. La cancelación es gratuita hasta 24 horas antes del encuentro. Después, se aplica la política de cancelación.'],
      ['¿Y si el compañero no aparece?', 'Te devolvemos el importe íntegro. Avisa al soporte desde la pantalla de la reserva.'],
      ['¿Por qué debo verificar mi identidad?', 'Para garantizar que todos son mayores de 18 años y son quienes dicen ser. Eso protege a ambos.'],
      ['¿Por qué Casa y Casa de campo tienen candado?', 'Por seguridad, solo se habilitan tras un primer encuentro completado en un lugar público con la misma persona.'],
      ['¿Qué hago en una emergencia?', 'Usa el botón SOS en la reserva en curso o llama al 190. Después, denuncia en la app.'],
      ['¿Cómo elimino mi cuenta?', 'En Perfil, en la sección Privacidad y datos. Tus datos se eliminan conforme a la LGPD.'],
    ],
    contactTitle: 'Escríbenos', subject: 'Asunto', subjects: ['Reserva o pago', 'Seguridad o denuncia', 'Mi cuenta', 'Otro asunto'],
    message: 'Mensaje', send: 'Enviar mensaje', sent: 'Mensaje enviado. Respondemos en 24 horas por correo.', errMsg: 'Escribe tu mensaje.',
    urgent: 'En peligro inmediato, llama al 190.',
  },
  blocked: {
    title: 'Personas bloqueadas', sub: 'Las personas bloqueadas no ven tu perfil ni pueden escribirte.', empty: 'No has bloqueado a nadie.',
    unblock: 'Desbloquear', unblocked: '{name} fue desbloqueado',
  },
  menu: { edit: 'Editar perfil', notifications: 'Notificaciones', blocked: 'Personas bloqueadas', help: 'Ayuda y soporte' },
  cookies: {
    text: 'Usamos cookies esenciales para que la app funcione y, con tu permiso, cookies de análisis para mejorarla.',
    accept: 'Aceptar todas', essential: 'Solo esenciales', more: 'Más información',
  },
  offline: 'Estás sin conexión. Algunas acciones no están disponibles hasta que vuelva internet.',
};

export default esX;
