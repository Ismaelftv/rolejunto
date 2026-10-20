// Configurações de negócio. Ajuste aqui sem mexer nas telas.
export const CONFIG = {
  appName: 'RolêJunto',
  serviceFeeRate: 0.1, // taxa de serviço exibida (o valor cobrado de fato vem da API: SERVICE_FEE_RATE)
  minAge: 18,
  supportEmail: 'contato@rolejunto.com.br', // troque pelo e-mail real
  emergencyPhone: '190',
  // Endereço da API. Vazio = mesmo domínio do site (recomendado: o servidor encaminha /api para a API).
  // No app nativo, defina VITE_API_URL=https://seudominio.com.br ao gerar o build.
  apiBaseUrl: (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
};

export const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });
