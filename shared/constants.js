// Constantes compartilhadas entre servidor e navegador.
export const TIMEZONE = 'America/Sao_Paulo';

export const PAYMENT_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'pix', label: 'PIX' },
  { id: 'debito', label: 'Cartão de débito' },
  { id: 'credito', label: 'Cartão de crédito' },
  { id: 'outros', label: 'Outros' },
];

export const EXPENSE_CATEGORIES = [
  { id: 'aluguel', label: 'Aluguel' },
  { id: 'agua', label: 'Água' },
  { id: 'energia', label: 'Energia elétrica' },
  { id: 'internet', label: 'Internet' },
  { id: 'produtos_cabelo', label: 'Produtos de cabelo' },
  { id: 'produtos_barba', label: 'Produtos para barba' },
  { id: 'descartaveis', label: 'Materiais descartáveis' },
  { id: 'equipamentos', label: 'Equipamentos e manutenção' },
  { id: 'salarios', label: 'Salários e comissões' },
  { id: 'impostos', label: 'Impostos' },
  { id: 'marketing', label: 'Marketing e publicidade' },
  { id: 'outros', label: 'Outros gastos' },
];

export const EXPENSE_TYPES = [
  { id: 'fixa', label: 'Fixa' },
  { id: 'variavel', label: 'Variável' },
];

export const DEFAULT_SERVICES = [
  { name: 'Cabelo', price_cents: 4000, description: 'Corte de cabelo masculino' },
  { name: 'Barba', price_cents: 3000, description: 'Barba com toalha quente' },
  { name: 'Sobrancelha', price_cents: 1500, description: 'Design de sobrancelha' },
  { name: 'Cabelo + Barba', price_cents: 6500, description: 'Combo corte + barba' },
  { name: 'Outros serviços', price_cents: 0, description: 'Valor informado no lançamento' },
];

export const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || id || '—';
