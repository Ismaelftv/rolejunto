// Configurações de negócio. Ajuste aqui sem mexer nas telas.
export const CONFIG = {
  appName: 'RolêJunto',
  serviceFeeRate: 0.1, // taxa de serviço exibida (o valor cobrado de fato vem da API: SERVICE_FEE_RATE)
  minAge: 18,
  supportEmail: 'contatorolejunto@gmail.com',
  // Razão social e CNPJ de quem opera o RolêJunto: aparecem nos Termos e na Privacidade quando preenchidos (VITE_COMPANY_NAME / VITE_COMPANY_CNPJ)
  companyName: (import.meta.env.VITE_COMPANY_NAME as string | undefined) ?? '',
  companyCnpj: (import.meta.env.VITE_COMPANY_CNPJ as string | undefined) ?? '',
  emergencyPhone: '190',
  // Endereço da API. Vazio = mesmo domínio do site (recomendado: o servidor encaminha /api para a API).
  // No app nativo, defina VITE_API_URL=https://seudominio.com.br ao gerar o build.
  apiBaseUrl: (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
};

export const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', ...(Math.abs(n - Math.round(n)) < 0.005 ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
