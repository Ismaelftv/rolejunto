// Textos das telas adicionadas depois (senha, notificações, pagamento, etc.)
const ptX = {
  forgot: {
    title: 'Recuperar senha', sub: 'Enviaremos um código de 6 dígitos para o seu e-mail.', email: 'E-mail da conta', send: 'Enviar código',
    sent: 'Enviamos um código para {email}. Ele vale por 15 minutos.', code: 'Código de 6 dígitos', newPass: 'Nova senha', confirm: 'Confirmar nova senha',
    save: 'Salvar nova senha', resend: 'Reenviar código', errCode: 'Digite os 6 dígitos do código.', errMatch: 'As senhas não são iguais.',
    doneTitle: 'Senha alterada', doneText: 'Agora é só entrar com a nova senha.', back: 'Voltar para o login', demo: 'Modo demonstração: qualquer código de 6 dígitos funciona.',
  },
  notif: {
    title: 'Notificações', markAll: 'Marcar todas como lidas', empty: 'Nenhuma notificação por enquanto.', today: 'Hoje', earlier: 'Anteriores',
    accepted: '{name} aceitou sua reserva', acceptedText: 'Pague para garantir o encontro de {d}.',
    paid: 'Pagamento confirmado', paidText: 'O valor fica retido até o fim do encontro com {name}.',
    waiting: 'Pedido enviado para {name}', waitingText: 'Você recebe um aviso assim que houver resposta.',
    rate: 'Como foi com {name}?', rateText: 'Avalie o encontro e ajude a comunidade.',
    message: 'Nova mensagem de {name}', verify: 'Verifique sua identidade', verifyText: 'Leva 2 minutos e libera as reservas.',
    contact: 'Cadastre um contato de confiança', contactText: 'Ele recebe os detalhes quando você faz check-in.',
  },
  pay: {
    title: 'Pagamento', sub: 'O valor fica retido pelo RolêJunto e só é repassado depois do encontro.', method: 'Forma de pagamento',
    pixTitle: 'Pague com Pix', pixText: 'Abra o app do seu banco, escolha Pix e leia o QR Code ou use o código copia e cola.',
    copy: 'Copiar código', copied: 'Código copiado', expires: 'O código expira em {t}', paidBtn: 'Já fiz o pagamento',
    checking: 'Confirmando pagamento…', cardTitle: 'Cartão de crédito', cardText: 'Você vai digitar os dados do cartão no ambiente seguro do nosso parceiro de pagamentos. O RolêJunto nunca guarda o número do cartão.',
    cardBtn: 'Pagar {v} com cartão', installments: 'Parcelamento', inst1: 'À vista', demo: 'Modo demonstração: o pagamento é simulado.',
    receipt: 'Comprovante', receiptTitle: 'Pagamento confirmado!', receiptText: 'Guardamos o valor até o encontro. Se {name} não aparecer, você recebe tudo de volta.',
    code: 'Código da transação', date: 'Data', status: 'Situação', statusHeld: 'Pago · retido até o encontro', toBooking: 'Ver reserva', payNow: 'Pagar agora',
    alreadyPaid: 'Esta reserva já está paga.', notReady: 'O pagamento fica disponível depois que o parceiro aceitar.',
  },
  bdetail: {
    title: 'Detalhes da reserva', timeline: 'Andamento', steps: ['Pedido enviado', 'Aceito', 'Pago', 'Encontro', 'Concluído'],
    details: 'Detalhes', program: 'Programa', when: 'Quando', duration: 'Duração', place: 'Local', note: 'Sua mensagem', values: 'Valores',
    view: 'Ver detalhes', notFound: 'Reserva não encontrada.', id: 'Reserva nº {id}', help: 'Precisa de ajuda com esta reserva?', helpCta: 'Falar com o suporte',
  },
  edit: {
    title: 'Editar perfil', photo: 'Foto de perfil', change: 'Trocar foto', remove: 'Remover', name: 'Nome', email: 'E-mail', phone: 'Celular', city: 'Cidade',
    interests: 'Programas que você curte', interestsHint: 'Usamos para sugerir pessoas e programas.', save: 'Salvar alterações', saved: 'Perfil atualizado',
    passTitle: 'Alterar senha', current: 'Senha atual', newPass: 'Nova senha', confirm: 'Confirmar nova senha', passSave: 'Alterar senha', passSaved: 'Senha alterada',
    errName: 'Informe seu nome.', errEmail: 'E-mail inválido.', errPass: 'A nova senha precisa ter pelo menos 8 caracteres.', errMatch: 'As senhas não são iguais.',
    photoHint: 'Use uma foto sua, recente e com o rosto visível. Ela passa por moderação.',
  },
  help: {
    title: 'Ajuda e suporte', sub: 'Tire suas dúvidas ou fale com a nossa equipe.', faqTitle: 'Perguntas frequentes',
    faq: [
      ['O que é o RolêJunto?', 'Uma plataforma para encontrar companhia verificada para atividades sociais, como baladas, bares, praia, shows, jantares e eventos. É exclusivamente social.'],
      ['Como funciona o pagamento?', 'Você paga pelo app depois que o parceiro aceita. O valor fica retido e só é repassado depois do encontro.'],
      ['Posso cancelar uma reserva?', 'Sim. O cancelamento é grátis até 24 horas antes do encontro. Depois disso, segue a política de cancelamento.'],
      ['E se o parceiro não aparecer?', 'Você recebe o valor de volta integralmente. Avise o suporte pela tela da reserva.'],
      ['Por que preciso verificar minha identidade?', 'Para garantir que todos são maiores de 18 anos e são quem dizem ser. Isso protege os dois lados.'],
      ['Por que Casa e Sítio têm cadeado?', 'Por segurança, esses programas só são liberados depois de um primeiro encontro concluído em local público com a mesma pessoa.'],
      ['O que faço em caso de emergência?', 'Use o botão SOS na reserva em andamento ou ligue 190. Depois, denuncie pelo app.'],
      ['Como excluo minha conta?', 'Em Perfil, na seção Privacidade e dados. Seus dados são apagados conforme a LGPD.'],
    ],
    contactTitle: 'Fale com a gente', subject: 'Assunto', subjects: ['Reserva ou pagamento', 'Segurança ou denúncia', 'Minha conta', 'Outro assunto'],
    message: 'Mensagem', send: 'Enviar mensagem', sent: 'Mensagem enviada. Respondemos em até 24 horas no seu e-mail.', errMsg: 'Escreva sua mensagem.',
    urgent: 'Em perigo imediato, ligue 190.',
  },
  blocked: {
    title: 'Pessoas bloqueadas', sub: 'Pessoas bloqueadas não veem seu perfil nem podem falar com você.', empty: 'Você não bloqueou ninguém.',
    unblock: 'Desbloquear', unblocked: '{name} foi desbloqueado',
  },
  menu: { edit: 'Editar perfil', notifications: 'Notificações', blocked: 'Pessoas bloqueadas', help: 'Ajuda e suporte' },
  cookies: {
    text: 'Usamos cookies essenciais para o app funcionar e, com sua permissão, cookies de análise para melhorá-lo.',
    accept: 'Aceitar todos', essential: 'Só os essenciais', more: 'Saiba mais',
  },
  offline: 'Você está sem conexão. Algumas ações ficam indisponíveis até a internet voltar.',
};

export default ptX;
